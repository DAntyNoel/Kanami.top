# Kanami Chatbot

这是 `chat.kanami.top/start` 使用的本地 AI 对话后端。整体结构参考了成熟聊天项目常用的模式：后端持有人设提示词和 API 密钥，前端只负责会话 UI，模型回复通过 SSE 流式返回；Cloudflare Worker 只做转发和离线兜底。

## 本地运行

1. 准备配置文件：

```bash
cp env.example env
```

2. 编辑 `env`：

```ini
BASE_URL=https://api.openai.com/v1
LOCAL_CLIPROXY_PORT=12702
API_KEY=sk-your-key
MODEL=gpt-4o-mini
PORT=8787
HOST=127.0.0.1
TUNNEL_TOKEN=replace-with-cloudflare-tunnel-token
START_TUNNEL=true
```

如果 `LOCAL_CLIPROXY_PORT` 配置了端口，后端会在每次对话前先探测
`127.0.0.1:<LOCAL_CLIPROXY_PORT>`。端口可连接时优先使用
`http://127.0.0.1:<LOCAL_CLIPROXY_PORT>/v1`；不可连接时再回退到
`BASE_URL`。本地 CLI proxy 可用时不强制要求 `API_KEY`，回退到
`BASE_URL` 时仍需要配置 `API_KEY`。

3. 启动：

```bash
npm start
```

打开 `http://127.0.0.1:8787/start`。

如果需要同时重启本地后端和 Cloudflare Tunnel，可以在 Windows 或 macOS 直接运行同一个脚本：

```bash
npm run restart
```

脚本会读取 `chatbot/env` 或 `chatbot/.env`，先停止上次由脚本启动的进程，再启动 Node 后端；当 `TUNNEL_TOKEN` 存在且 `START_TUNNEL` 不为 `false` 时，会同时启动 `cloudflared tunnel run --token ...`。运行日志和 pid 文件保存在 `chatbot/.run/`。

## 接口

- `GET /start`：聊天页面。
- `GET /health`：本地健康检查，Cloudflare 或监控可使用。
- `POST /api/chat`：OpenAI-compatible Chat Completions 转发，默认 SSE 流式返回。

请求示例：

```json
{
  "stream": true,
  "messages": [
    { "role": "user", "content": "香奈美，今天想唱什么歌？" }
  ]
}
```

## Cloudflare 转发

`worker/cloudflare-worker.js` 会把 `chat.kanami.top/*` 转发到 `BACKEND_ORIGIN`。如果本地后端、隧道或上游服务不可用，Worker 会把普通页面访问重定向到 `/offline`，并由 Worker 自己返回香奈美口吻的离线页面；`/api/*` 和 `/health` 等非页面请求会返回 JSON 503，避免前端拿到不可解析的 HTML。

部署时：

```bash
cd worker
cp wrangler.toml.example wrangler.toml
wrangler deploy
```

`BACKEND_ORIGIN` 建议使用 Cloudflare Tunnel 暴露出的 HTTPS 地址，例如：

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

如果使用 Cloudflare 后台创建的 Tunnel token，把 token 写入 `chatbot/.env` 的 `TUNNEL_TOKEN`，之后执行 `npm run restart` 即可重启后端和 tunnel connector。

真实 `env`、`.env`、`wrangler.toml` 和密钥文件不要提交。
