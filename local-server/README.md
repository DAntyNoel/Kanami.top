# Kanami Local Server

`local-server` 目录只保留本地映射服务的后台逻辑。在线入口复用仓库根目录的主站页面：

- `../index.html`：在线默认入口，服务返回时会注入本地登录、图库、刷新和本地 WIKI 资源配置。
- `../local-server-offline.html`：服务离线展示页。

服务默认监听 `127.0.0.1:12700`，未来用于通过 Cloudflare Tunnel 暴露到 `local-server.kanami.top`。

## 入口

```powershell
cd local-server
npm start
```

已打开页面可以用页眉里的“刷新缓存”按钮清理浏览器缓存并重载。改完代码后，也可以从终端通知已打开页面自动刷新：

```powershell
npm run reload
npm run reload -- --next /auth/login
npm run reload -- --url http://127.0.0.1:12701 --next /auth/register
```

本地调试的 Python 后端入口：

```powershell
python backend.py
python backend.py --port 12701
npm run backend:python
```

如果默认端口已被 local-server 占用，入口会提示服务已经在运行；如果端口被其他进程占用，可用 `--port 12701` 切到另一个本地调试端口。

Cloudflare Tunnel 入口：

```powershell
npm run cloudflare
```

`cloudflare.js` 会读取 `.env` 或环境变量里的 `TUNNEL_TOKEN`，并执行 `cloudflared tunnel --no-autoupdate run --token ...`。当前模板里 `TUNNEL_TOKEN=` 保持为空，所以这个入口会直接提示未启动，不会误连线上隧道。

## 配置

可复制 `.env.example` 为 `.env` 调整监听端口、远程域名、文件映射目录、图库目录和 tunnel token。

## 路由

- `/` 或 `/start`：读取根目录的 `index.html`，并注入本地运行时增强。
- `/offline`：读取根目录的 `local-server-offline.html`。
- `/health`：公网安全的健康检查 JSON，只返回在线状态。
- `/health/detail`：本地详细健康检查，包含本地端口、远程域名和文件映射目录状态。
- `/auth/login`、`/auth/register`、`/auth/profile`：读取 `public/auth/` 下的本地账号页面和前端逻辑。
- `/gallery`：读取 `public/gallery/` 下的图库预览界面。
- `/gallery/api`：读取 `LOCAL_SERVER_GALLERY_DIR` 指向的 `advanced_media/index.json` 并输出图库清单。
- `/gallery/media/<folder>/<path>`：从 `LOCAL_SERVER_GALLERY_DIR` 中安全映射图片和缩略图。
- `/resource/manage`：资源管理台 GUI，可在登录管理口令后调整 WIKI 资源顺序、上传、修改、移动和删除。
- `/api/resource/manage/*`：资源管理 API，仅本机或带 `LOCAL_SERVER_ADMIN_TOKEN` 可用。当前支持分类列表、资源列表、上传、元数据更新、排序、移动和删除。
- `/__reload?next=<path>`：临时调试入口，仅本机或带 `LOCAL_SERVER_ADMIN_TOKEN` 可用，要求浏览器清理站点缓存后回到指定路径。
- `/__reload/trigger?next=<path>`：终端或外部工具触发已打开页面自动刷新，仅本机或带管理口令可用。
- `/files/<path>`：从 `LOCAL_SERVER_FILES_DIR` 指向的目录中安全映射文件，默认只公开 WIKI 图片目录和资源页需要的 WIKI JSON 文件。

CSS、脚本、图片、游戏入口和资源页复用主站根目录资源。本地服务会把资源页的 WIKI 数据源切到 `/files/WIKI/`，并让图片优先从 `/files/WIKI/images/` 读取，缺失时再回退到 WIKI 远端地址。真实映射文件放在 `files/`，不会被提交。图库默认读取 `../KanamiBot/data/advanced_media`，可通过 `LOCAL_SERVER_GALLERY_DIR` 改到其他同结构目录。需要公开更多映射目录时，优先把明确的资源目录加入 `LOCAL_SERVER_FILE_ALLOWED_PREFIXES`，不要直接把整个 `files/` 放到公网。

`/auth/*` 当前是本地调试资料页，账号和头像只保存在当前浏览器的 `localStorage` 中。它可以用于本地展示登录态，但不等同于公网服务端认证。
