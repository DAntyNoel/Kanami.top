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
API_KEY=sk-your-key
MODEL=gpt-4o-mini
PORT=8787
HOST=127.0.0.1
```

3. 启动：

```bash
npm start
```

打开 `http://127.0.0.1:8787/start`。

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

`worker/cloudflare-worker.js` 会把 `chat.kanami.top/*` 转发到 `BACKEND_ORIGIN`。如果本地后端、隧道或上游服务不可用，Worker 会直接返回香奈美口吻的自定义错误界面，避免用户看到默认 Cloudflare 错误页。

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

真实 `env`、`.env`、`wrangler.toml` 和密钥文件不要提交。
