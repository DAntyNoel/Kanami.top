# 卡拉彼丘录像回放工具 · 分发包

此 ZIP 包含原始 `.replay` 解析器、二维战术回放网页、23 个角色头像与名称映射、奥卡努斯固定地图、启动与静态导出脚本、开发验收工具及资源来源说明。界面保留蓝方 / 红方、生命护甲、伤害、弦化状态、回合阶段与单条时间轴等现有功能。

程序没有附带任何对局录像、`playback.json`、玩家明细或本机配置。接收者需要提供自己的录像，或配套解析器已经生成的 `playback.json`。

## 环境

- Python 3.10 或以上，使用标准库，不需要 pip 安装依赖。
- 支持现代桌面浏览器。Windows 可用启动脚本，Linux / macOS 可直接运行 Python 命令。
- 网页运行、解析和静态导出无需 Node.js；`npm ci` 仅用于开发时的网页验收。
- 首次解析会产生大量中间数据。已验证的约 22 MB 录像会展开至约 1 GB，所需空间与耗时随录像而变。

## Windows 使用

1. 完整解压 ZIP，保留 `replay-lab/`、`res/`、`games/` 的相对位置。
2. 安装 Python 后，将 `.replay` 拖到根目录 `start.cmd` 上；或在 `replay-lab/input/` 中只放一份 `.replay` / `playback.json`，然后双击 `start.cmd`。
3. 等待解析完成，在浏览器打开 <http://127.0.0.1:8766/>。控制台需保持运行，按 Ctrl+C 停止。

命令行也可指定路径和空闲端口。以下命令均在解压后的工具根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\replay-lab\start.ps1 -ReplayFile "D:\录像\match.replay" -Port 8766
```

启动脚本会使用 `python`，不可用时尝试 `py -3`。也可直接使用已安装解释器的完整路径运行下述 `run.py`。

## 直接运行与重新解析

```text
python replay-lab/run.py "/path/to/match.replay"
python replay-lab/run.py "/path/to/match.replay" --out "/path/to/decoded" --rebuild
python replay-lab/run.py "/path/to/decoded/playback.json" --port 8767
```

默认输出为 `replay-lab/output/<录像文件名>/`。缓存同时核对原录像 SHA-256 和解析程序内容；输入或解析程序改变会重新解析。原录像不修改。输入 `playback.json` 时直接启动网页，不需要原录像。网页右上角的“导入回放”只支持 `playback.json`，原始 `.replay` 需先在 Python 中解析。

## 静态网页部署

使用原录像解析并导出，或直接导出已有回放数据：

```text
python replay-lab/run.py "/path/to/match.replay" --export "/path/to/public-replay"
python replay-lab/run.py "/path/to/playback.json" --export "/path/to/public-replay"
```

导出目录必须为空或尚未创建。操作完成后，将**导出目录内的全部文件**上传到静态网站目录，例如 `/replay/`；无需上传解析器、原录像或中间数据。页面使用相对资源路径，可部署在子目录。静态主机需正确提供 HTML、JavaScript、JSON、PNG、WebP 的 MIME 类型。页面须经 HTTP / HTTPS 访问，直接双击 HTML 不可代替静态服务。

本地检查导出结果：

```text
python -m http.server 8767 --bind 127.0.0.1 --directory "/path/to/public-replay"
```

然后打开 <http://127.0.0.1:8767/>。此命令仅用于已导出的网页目录。

也可使用内置白名单服务，默认只监听本机；需要网络访问时可显式设置监听地址并通过自己的反向代理提供访问：

```text
python replay-lab/run.py "/path/to/playback.json" --bind 0.0.0.0 --port 8766
```

内置服务只公开指定回放及列明的网页资源，`/health` 只返回状态，无目录列表和维护接口。导出的 `playback.json` 包含昵称、游戏 UID 和游戏行为，请选择自己计划分享的对局数据。

## 支持范围

目前验证范围为 UE4.25.4、录像文件版本 6、网络回放 / 引擎网络版本 14、flags=0、无压缩、无加密的卡拉彼丘录像。其他协议不承诺兼容；解析错误需检查 `errors.json`。正式开始事件仍标注“推定”，单次命中的精确伤害尚未恢复；累计伤害与独立生命 / 护甲同步可查看。固定底图目前仅覆盖奥卡努斯，其他地图显示坐标网格。

详细恢复范围见 `replay-lab/README.md`、`STATUS.md` 与 `PROTOCOL_NOTES.md`。本包保留地图、头像和协议参考的现有来源与许可说明：`web/maps/NOTICE.txt`、`web/maps/GPL-3.0.txt`、`web/characters/NOTICE.txt`、`web/characters/sources.json`、`THIRD_PARTY_LICENSE.txt`。路径均相对于 `replay-lab/`，游戏名称与美术权利归原权利人。

## 校验与再次打包

ZIP 附有同名 `.zip.sha256`，解压后的 `PACKAGE-MANIFEST.json` 列出每个文件的 SHA-256 和大小。可在解压后的根目录校验原 ZIP：

```text
python replay-lab/bundle.py --verify "/path/to/strinova-replay-toolkit.zip"
python replay-lab/bundle.py --out "/path/to/new-toolkit.zip"
```

再次打包仍仅使用程序 / 资源白名单，不纳入 `input/` 中的录像、`output/`、Git 元数据、缓存、凭据或其他仓库内容。输出文件已存在时需要显式加 `--force`。

完整解析核验及可选网页开发检查：

```text
python replay-lab/verify_replay.py "/path/to/match.replay" "/path/to/decoded"
python replay-lab/verify_combat.py
python replay-lab/verify_rounds.py
```

```text
cd replay-lab
npm ci
npm run verify:viewer -- "/path/to/playback.json"
```
