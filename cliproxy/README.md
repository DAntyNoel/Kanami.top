# Kanami CLIProxyAPI

这是 `cliproxy.kanami.top` 使用的后台 API 转发服务。外层目录保存 kanami.top 自己的部署方式；核心代理逻辑放在 `cliproxy/cliproxyapi` submodule，并跟随上游 `router-for-me/CLIProxyAPI`。

## 目录

- `cliproxyapi/`：CLIProxyAPI 上游 submodule。
- `Dockerfile`：从 submodule 构建核心 Go 服务，并使用本站的启动脚本生成运行配置。
- `start_script.sh`：启动前根据环境变量和密钥文件生成 `config.yaml`。
- `cloudflare/`：本地 Docker + Cloudflare Tunnel 的运行方式。
- `worker/`：Cloudflare Worker 转发方式，结构参考 `chatbot/worker`。

## 本地运行

1. 初始化 submodule：

```bash
git submodule update --init --recursive cliproxy/cliproxyapi
```

2. 准备本地配置：

```bash
cp cliproxy/env.example cliproxy/env
```

3. 编辑 `cliproxy/env`，至少设置：

```ini
PORT=8317
MANAGEMENT_PASSWORD=replace-with-management-password
API_KEYS=replace-with-client-api-key
CODEX_AUTH_REQUIRED=false
```

4. 构建并启动：

```bash
docker build -t kanami-cliproxy ./cliproxy
docker run --rm --env-file cliproxy/env -p 127.0.0.1:8317:8317 kanami-cliproxy
```

健康检查可用：

```bash
curl -i http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer replace-with-client-api-key"
```

## Cloudflare Tunnel

本地或目标主机运行 Docker Compose：

```bash
cd cliproxy
cp cloudflare/.env.example cloudflare/.env
mkdir -p cloudflare/secrets
printf '%s\n' 'replace-with-client-api-key' > cloudflare/secrets/api-keys.txt
docker compose --env-file cloudflare/.env -f cloudflare/docker-compose.yml up -d --build
```

`cloudflare/.env`、`cloudflare/secrets/*`、`env`、真实 API key、OAuth auth JSON 和运行日志都不提交。

## Cloudflare Worker

如果使用 Worker 做域名转发：

```bash
cd cliproxy/worker
cp wrangler.toml.example wrangler.toml
wrangler deploy
```

将 `BACKEND_ORIGIN` 设置为 Cloudflare Tunnel 或其他 HTTPS 后端地址，例如 `https://your-tunnel.example.com`。
