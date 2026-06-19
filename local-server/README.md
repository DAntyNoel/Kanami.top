# Kanami Local Server

`local-server` 目录只保留本地映射服务的后台逻辑。入口页面放在仓库根目录：

- `../local-server.html`：在线默认入口，视觉复用主站，只额外加入 `Remote Link` 区块。
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

可复制 `.env.example` 为 `.env` 调整监听端口、远程域名、文件映射目录和 tunnel token。

## 路由

- `/` 或 `/start`：读取根目录的 `local-server.html`。
- `/offline`：读取根目录的 `local-server-offline.html`。
- `/health`：健康检查 JSON，包含本地端口、远程域名和文件映射目录状态。
- `/auth/login`、`/auth/register`、`/auth/profile`：读取 `public/auth/` 下的本地账号页面和前端逻辑。
- `/__reload?next=<path>`：临时调试入口，要求浏览器清理站点缓存后回到指定路径。
- `/__reload/trigger?next=<path>`：终端或外部工具触发已打开页面自动刷新。
- `/files/<path>`：从 `LOCAL_SERVER_FILES_DIR` 指向的目录中安全映射文件。

CSS、脚本、图片和游戏入口复用主站根目录资源；真实映射文件放在 `files/`，不会被提交。
