# Kanami CLIProxyAPI

这是 `cliproxy.kanami.top` 使用的后台 API 转发服务。外层目录保存 kanami.top 自己的部署方式；核心代理逻辑放在 `cliproxy/cliproxyapi` submodule，并跟随上游 `router-for-me/CLIProxyAPI`。

## 目录

- `cliproxyapi/`：CLIProxyAPI 上游 submodule。
- `Dockerfile`：从 submodule 构建核心 Go 服务，并使用本站的启动脚本准备运行配置。
- `start_script.sh`：启动前根据环境变量和密钥文件生成 `config.yaml`；Render 部署可覆写，本地 Docker 默认只在首次空配置时生成。
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

本地 Docker 会把 `cliproxy/config.yaml` 挂载到容器内。`restart-local-mac.sh` / `restart-local-windows.ps1` 会在首次启动前优先从既有 `kanami-cliproxy-api` 容器导出当前配置；如果没有旧容器，则创建空文件并由容器第一次启动时填充。之后管理面板写入的 provider、模型和鉴权配置会保留在宿主机文件里，重启不会再被启动脚本覆盖。

如果不通过 restart 脚本而是直接运行 compose，请先创建配置文件：

```bash
: > config.yaml
```

`.env`、`config.yaml`、`secrets/*`、真实 API key、OAuth auth JSON 和运行日志都不提交。

Render 这类需要每次启动从环境变量重建配置的部署，保持 `CONFIG_OVERWRITE=true` 或不设置该变量即可继续使用旧的覆写行为；本地 compose 默认设置为 `CONFIG_OVERWRITE=false`。

如果构建时卡在 `failed to fetch anonymous token` 或 `i/o timeout`，说明 Docker Hub 基础镜像拉取失败。可以在 `cliproxy/.env` 中临时启用镜像源：

```ini
GO_BUILDER_IMAGE=docker.1ms.run/library/golang:1.26-alpine
RUNTIME_IMAGE=docker.1ms.run/library/alpine:3.23
CLOUDFLARED_IMAGE=docker.1ms.run/cloudflare/cloudflared:latest
GOPROXY=https://goproxy.cn,direct
```

## Docker 内存 Killbot

`docker-compose.yml` 会构建并常驻运行 `cliproxy-memory-killbot`。它通过 Docker socket 每 30 秒读取一次 `kanami-cliproxy-api` 的 working set（`usage - inactive_file`），不修改 CLIProxyAPI 源码：

- 连续 3 次达到 8 GiB 时记录告警；
- 连续 3 次达到 12 GiB 时请求 Docker 重启一次 CLIProxyAPI；
- 成功重启后锁存，直到 working set 降到 6 GiB 以下，避免重启循环；
- 重启失败或 killbot 在动作中中断时保留 30 分钟冷却，之后允许重试；
- 状态事件最多保留 100 条，重启诊断快照默认最多保留 20 份。

这些阈值针对当前约 14 GiB 的 Docker Desktop WSL VM，不是 Windows 宿主内存阈值。容器内 killbot 看不到 `com.docker.backend.exe` 的宿主私有内存。

状态接口只绑定本机：

```powershell
Invoke-RestMethod http://127.0.0.1:12715/status | ConvertTo-Json -Depth 8
```

首次只启动 killbot、不重建 CLIProxyAPI：

```powershell
docker compose --env-file .env -f docker-compose.yml build cliproxy-memory-killbot
docker compose --env-file .env -f docker-compose.yml up -d --no-deps cliproxy-memory-killbot
```

Docker socket 即使标记为只读挂载仍是高权限接口。因此 killbot 没有远程重启端点，也没有公网入口；容器使用只读根目录、移除全部 Linux capability、`no-new-privileges`、128 MiB 内存和 64 PID 上限，并对日志、事件与快照设置了上限。可在 `.env` 中覆盖阈值和采样参数，示例见 `.env.example`。

回滚时只需停止 `cliproxy-memory-killbot` 并恢复原 Compose；不要执行 `docker compose down -v`。数据卷 `kanami-cliproxy-memory-killbot-data` 只保存有界状态和诊断快照，可先保留用于排查。

## CPA Usage Keeper

CLIProxyAPI v6.10.0 之后本体不再预置完整数据统计。本站使用独立的 CPA Usage Keeper 做 SQLite 持久化和可视化，并且用单独的 Compose 文件旁路部署，避免重建或重启现有 `cli-proxy-api` 与 `cloudflared` 容器。

前提：主服务已按 `docker-compose.yml` 运行，且 `cliproxy/.env` 中设置了 `MANAGEMENT_PASSWORD`。

```bash
cd cliproxy
docker volume create --label com.kanami.service=cpa-usage-keeper kanami-cpa-usage-keeper-data
docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d --force-recreate
```

默认访问地址：

```text
http://127.0.0.1:12704
```

默认登录密码复用 `MANAGEMENT_PASSWORD`。如需单独设置，在 `cliproxy/.env` 中加入：

```ini
USAGE_KEEPER_PASSWORD=replace-with-usage-dashboard-password
USAGE_KEEPER_PORT=12704
```

`restart-local-mac.sh` / `restart-local-windows.ps1` 默认会在重启主服务后同时启动 Usage Keeper。`USAGE_KEEPER_PORT` 从 `cliproxy/.env` 读取，用来修改暴露到宿主机的端口：

```ini
START_USAGE_KEEPER=true
USAGE_KEEPER_PORT=12704
REDIS_USAGE_QUEUE_RETENTION_SECONDS=3600
```

如果要把 Usage Keeper 暴露到 Cloudflare 公网，在 Cloudflare 后台创建 tunnel 后，把 Docker 运行命令中的 token 写入 `cliproxy/.env`：

```ini
KEEPER_TUNNEL_TOKEN=replace-with-cloudflare-tunnel-token
START_KEEPER_TUNNEL=true
```

之后运行任一 restart 脚本时，会同时重启 Keeper 和它的 cloudflared connector。手动启动 tunnel 版命令为：

```bash
docker compose --env-file .env -f docker-compose.usage-keeper.yml --profile keeper-tunnel up -d --force-recreate
```

如果 Cloudflare 的 public hostname 是在后台配置的，服务地址建议填 `http://kanami-cpa-usage-keeper:8080`。如果要转发宿主机端口，则填 `http://host.docker.internal:12704`。

如果某次只想重启主服务、不启动 Usage Keeper，可以临时关闭：

```bash
START_USAGE_KEEPER=false bash cliproxy/restart-local-mac.sh
```

```powershell
$env:START_USAGE_KEEPER = "false"
.\cliproxy\restart-local-windows.ps1
```

Usage Keeper 的 SQLite 主库、内置备份和日志保存在外部 Docker named volume `kanami-cpa-usage-keeper-data`，避免 Windows bind mount 影响 WAL/SHM 崩溃恢复，也避免 `docker compose down -v` 误删数据库。重启脚本会幂等创建该卷，实际运行数据不提交。

从旧版 `cliproxy/keeper/app.db*` bind mount 升级时，重启脚本若发现旧数据库存在但 named volume 为空，会拒绝启动空库。此时必须先停止 Keeper，完整备份同一时间点的 `app.db`、`app.db-wal`、`app.db-shm`，在副本上完成 WAL checkpoint 和完整性检查，再把生成的单文件 `app.db` 写入 named volume。不要直接丢弃 WAL，也不要混用不同时间点的文件。

迁移并完成重启验收后，旧 `cliproxy/keeper/app.db*` 只作为离线历史归档保留，不再被容器读取；确认备份策略后再人工清理。

生产环境默认固定 Keeper 镜像 digest，避免 `latest` 在重建时静默漂移。如需升级，先完整备份数据库并在 `cliproxy/.env` 中显式设置 `CPA_USAGE_KEEPER_IMAGE`，完成兼容性验证后再更新 Compose 默认值。

## Cloudflare Worker

如果使用 Worker 做域名转发：

```bash
cd cliproxy/worker
cp wrangler.toml.example wrangler.toml
wrangler deploy
```

将 `BACKEND_ORIGIN` 设置为 Cloudflare Tunnel 或其他 HTTPS 后端地址，例如 `https://your-tunnel.example.com`。
