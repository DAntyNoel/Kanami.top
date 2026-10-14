# 香奈美的小小演奏台

将 <https://calabiyau-piano.122999.xyz/> 的浏览器玩具部署到 GitHub Pages 的 <https://kanami.top/piano/>。保留十六音垫、钢琴卷帘编曲、节拍录制、播放和 JSON 工程导入导出，加入本站统一页眉、香奈美口吻、触屏与键盘音垫操作，以及音色加载失败提示。

## 资源来源

`upstream/` 保存 2026-10-14 从原站取得的公开发布包（JS、CSS 与 16 个 Ogg 音色），`manifest.json` 记录原始 URL、大小和 SHA-256。当前未取得上游源码仓库及项目许可证，因此这里记录为公开发布包快照，不宣称它是本站原创或属于某个开源许可；原有库许可证注释完整保留，页面保留原站署名链接。

不要手工修改上游压缩文件。本站适配集中在 `scripts/build.mjs` 和 `site/`；构建先校验原始资源，再检查适配位置是否唯一。更新上游时需要一起审核资源、清单和适配点。

## 本地预览与部署

使用 Node.js 18.18 或更新版本，构建和预览无需第三方依赖：

```powershell
cd piano
npm run dev
```

访问 <http://127.0.0.1:12705/>。在另一个终端执行：

```powershell
npm run verify -- http://127.0.0.1:12705
```

## GitHub 交付与发布目录

沿用主站现有的 GitHub Pages 分支发布方式（`main` 分支根目录）及 `kanami.top` 域名，无需新增子域名或独立站点。构建生成 `piano/index.html` 作为 `/piano/` 入口，脚本、样式和音色从 `piano/dist/` 加载。音色路径相对于脚本文件解析，可用于子目录部署。

仓库根目录的 `_config.yml` 排除演奏台的 `scripts/`、`site/`、`upstream/`、`package.json` 和本说明文件，仅发布入口及静态成品。`dist/` 仍可作为独立静态站点进行本地预览。

修改源文件后重新构建，将 `index.html` 与 `dist/` 一起提交并推送到 `main`。等待 GitHub 的 `pages build and deployment` 成功后验证：

```powershell
npm run build
npm run verify -- https://kanami.top/piano/
```

验证会检查入口、4 个脚本/样式、16 个音色、内容哈希和被排除的源码路径。静态服务器需将 JS/CSS/Ogg 分别以 JavaScript、CSS、`audio/ogg` MIME 类型返回，缺失资源返回 404。`assets/` 的文件名包含内容哈希。资源已完整本地化，运行时无需请求原站。

编曲数据只在浏览器内处理，录制捕获音垫点击而非麦克风，导出是本地 JSON 下载。未实现登录、服务端存储或遥测。
