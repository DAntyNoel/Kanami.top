# Kanami Local Server

本目录是 `local-server.kanami.top` 的本地映射服务模板。默认监听 `127.0.0.1:12700`，用于未来通过 Cloudflare Tunnel 暴露到远程入口。

## 运行

```powershell
cd local-server
npm start
```

可选地复制 `.env.example` 为 `.env` 调整监听端口、远程域名和文件映射目录。

## 路由

- `/` 或 `/start`：在线默认入口，展示香奈美风格的服务在线与远程连接状态。
- `/health`：健康检查 JSON，包含本地端口、远程域名和文件映射目录状态。
- `/offline`：服务离线展示页，可给 Cloudflare fallback 或人工排障时使用。
- `/files/<path>`：从 `LOCAL_SERVER_FILES_DIR` 指向的目录中安全映射文件。

默认 `files/` 目录只保留占位文件，真实映射文件不会被提交。
