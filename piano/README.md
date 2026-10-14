# 香奈美的小小演奏台

将 <https://calabiyau-piano.122999.xyz/> 的浏览器玩具独立部署到 <https://piano.kanami.top/>。保留十六音垫、钢琴卷帘编曲、节拍录制、播放和 JSON 工程导入导出，加入本站统一页眉、香奈美口吻、触屏与键盘音垫操作，以及音色加载失败提示。

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

`dist/` 是已经构建好的静态成品，随代码一起提交到 GitHub。服务器拉取后，将 `piano.kanami.top` 的站点根目录指向仓库内的 `piano/dist/`，即可直接提供页面和音色，无需在服务器安装 Node.js 或 npm 依赖。域名和 HTTPS 沿用服务器已有的管理方式。

修改源文件后重新构建，并将 `dist/` 一起提交。发布后可验证：

```powershell
npm run build
npm run verify -- https://piano.kanami.top
```

仅公开 `dist/`，不要把整个仓库或 `piano/` 源码目录作为该子域名的站点根目录。静态服务器需将 JS/CSS/Ogg 分别以 JavaScript、CSS、`audio/ogg` MIME 类型返回，缺失资源返回 404。`assets/` 的文件名包含内容哈希，可长期缓存，HTML 应重新验证缓存。资源已完整本地化，运行时无需请求原站。

编曲数据只在浏览器内处理，录制捕获音垫点击而非麦克风，导出是本地 JSON 下载。未实现登录、服务端存储或遥测。
