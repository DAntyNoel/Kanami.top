# Kanami Local Server

`local-server` 目录只保留本地映射服务的后台逻辑。入口页面放在仓库根目录：

- `../local-server.html`：在线默认入口，视觉复用主站，只额外加入 `Remote Link` 区块。
- `../local-server-offline.html`：服务离线展示页。

服务默认监听 `127.0.0.1:12700`，未来用于通过 Cloudflare Tunnel 暴露到 `local-server.kanami.top`。

## 运行

```powershell
cd local-server
npm start
```

可选地复制 `.env.example` 为 `.env` 调整监听端口、远程域名和文件映射目录。

## 路由

- `/` 或 `/start`：读取根目录的 `local-server.html`。
- `/offline`：读取根目录的 `local-server-offline.html`。
- `/health`：健康检查 JSON，包含本地端口、远程域名和文件映射目录状态。
- `/files/<path>`：从 `LOCAL_SERVER_FILES_DIR` 指向的目录中安全映射文件。

CSS、脚本、图片和游戏入口复用主站根目录资源；真实映射文件放在 `files/`，不会被提交。
