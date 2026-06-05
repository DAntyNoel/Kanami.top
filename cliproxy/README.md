# Kanami CLIProxyAPI

这是 `cliproxy.kanami.top` 使用的后台 API 转发服务。外层目录保存 kanami.top 自己的部署方式；核心代理逻辑放在 `cliproxy/cliproxyapi` submodule，并跟随上游 `router-for-me/CLIProxyAPI`。

## 目录

- `cliproxyapi/`：CLIProxyAPI 上游 submodule。
- `Dockerfile`：从 submodule 构建核心 Go 服务，并使用本站的启动脚本生成运行配置。
- `start_script.sh`：启动前根据环境变量和密钥文件生成 `config.yaml`。
- `docker-compose.yml`：本地 Docker + Cloudflare Tunnel 的唯一运行方式。
- `secrets/`：本地密钥文件目录，只保留 `.gitkeep`。
- `worker/`：Cloudflare Worker 转发方式，结构参考 `chatbot/worker`。

## 本地运行

1. 初始化 submodule：

```bash
git submodule update --init --recursive cliproxy/cliproxyapi
```

2. 准备本地配置：

```bash
cp cliproxy/.env.example cliproxy/.env
```

3. 编辑 `cliproxy/.env`，至少设置：

```ini
# 宿主机暴露端口；容器内部固定监听 8317，以匹配 Cloudflare Tunnel ingress。
PORT=8317
TUNNEL_TOKEN=replace-with-cloudflare-tunnel-token
MANAGEMENT_PASSWORD=replace-with-management-password
API_KEYS=replace-with-client-api-key
CODEX_AUTH_REQUIRED=false
```

4. 构建并启动：

```bash
bash cliproxy/restart-local-mac.sh
```

健康检查可用：

```bash
curl -i http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer replace-with-client-api-key"
```

## Docker + Cloudflare Tunnel

本地或目标主机运行 Docker Compose：

```bash
cd cliproxy
cp .env.example .env
docker compose --env-file .env -f docker-compose.yml up -d --build
```

`.env`、`secrets/*`、真实 API key、OAuth auth JSON 和运行日志都不提交。

如果构建时卡在 `failed to fetch anonymous token` 或 `i/o timeout`，说明 Docker Hub 基础镜像拉取失败。可以在 `cliproxy/.env` 中临时启用镜像源：

```ini
GO_BUILDER_IMAGE=docker.1ms.run/library/golang:1.26-alpine
RUNTIME_IMAGE=docker.1ms.run/library/alpine:3.23
CLOUDFLARED_IMAGE=docker.1ms.run/cloudflare/cloudflared:latest
GOPROXY=https://goproxy.cn,direct
```

## CPA Usage Keeper

CLIProxyAPI v6.10.0 之后本体不再预置完整数据统计。本站使用独立的 CPA Usage Keeper 做 SQLite 持久化和可视化，并且用单独的 Compose 文件旁路部署，避免重建或重启现有 `cli-proxy-api` 与 `cloudflared` 容器。

前提：主服务已按 `docker-compose.yml` 运行，且 `cliproxy/.env` 中设置了 `MANAGEMENT_PASSWORD`。

```bash
cd cliproxy
docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d
```

默认访问地址：

```text
http://127.0.0.1:18080
```

默认登录密码复用 `MANAGEMENT_PASSWORD`。如需单独设置，在 `cliproxy/.env` 中加入：

```ini
USAGE_KEEPER_PASSWORD=replace-with-usage-dashboard-password
USAGE_KEEPER_PORT=18080
```

Usage Keeper 的 SQLite、备份和日志保存在 `cliproxy/keeper/`，该目录只提交 `.gitkeep`，实际运行数据不提交。

## Cloudflare Worker

如果使用 Worker 做域名转发：

```bash
cd cliproxy/worker
cp wrangler.toml.example wrangler.toml
wrangler deploy
```

将 `BACKEND_ORIGIN` 设置为 Cloudflare Tunnel 或其他 HTTPS 后端地址，例如 `https://your-tunnel.example.com`。
