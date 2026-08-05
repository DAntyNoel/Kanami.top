# 2026-08-05 实施与验证记录

## 代码与测试

CLIProxyAPI 子模块提交：

```text
a1c1f298 修复兼容接口远程压缩流
```

修改后的行为：

- 含 `compaction_trigger` 的 OpenAI Responses 流式请求原样发往上游 `/responses`。
- 携带非空字符串 `compaction.encrypted_content` 的后续轮次同样走 `/responses`。
- 普通 OpenAI-compatible Responses 请求仍按既有行为转换到 `/chat/completions`。
- Responses 原生 terminal event 前 EOF 返回 502，不合成 Chat Completions 的 `[DONE]`。

以下检查在 `golang:1.26-alpine` 容器中通过：

- 新增定向回归测试；
- `go test ./internal/runtime/executor -count=1`；
- `go test ./... -count=1`；
- `go build -o /tmp/cli-proxy-api ./cmd/server`；
- `gofmt` 与 `git diff --check`。

## 部署保护

部署前主容器：

- 容器 ID：`aa50b6415e18`
- 镜像 ID：`sha256:1c82d10c5a3f...`
- `RestartCount=0`
- 本地 `/healthz` 返回 200

保护材料：

- 配置备份：`config.yaml.before-compaction-v2-20260805-205219.bak`
- 回滚镜像：`kanami-cliproxy:pre-compaction-v2-20260805-205219`
- 备份、宿主配置与部署前容器配置 SHA-256 均为 `8f09f35e902a5ac72f4c8d9e8cd0766d84aa3632efe71260dac0e1a6982c7eda`

新镜像构建元数据：

```text
Version: v7.2.99-7-ga1c1f298
Commit: a1c1f298d317
BuiltAt: 2026-08-05T13:00:47Z
```

Compose 只重建了 `cli-proxy-api`。Keeper 和两个 cloudflared 的容器 ID、2026-07-30 启动时间及 `RestartCount=0` 均保持不变。

部署后：

- 主容器 ID：`807e4bc4c054`
- 新镜像 ID：`sha256:1250d72d3b23...`
- `RestartCount=0`
- 本地 `/healthz` 返回 200
- `config.yaml` 仍是可写 bind mount
- `CONFIG_OVERWRITE=false`
- 宿主与容器配置 SHA-256 仍完全一致

## 真实 xia 探针

使用本目录的最小 `compaction_trigger` 请求访问本机 `POST /v1/responses`。原始 SSE 仅存放在系统临时目录，结构检查完成后立即删除；密钥、正文和 `encrypted_content` 均未输出或写入 Git。

脱敏结果：

```text
HTTP 200
Content-Type: text/event-stream
response.output_item.added: type=compaction, encrypted_content present
response.output_item.done: type=compaction, encrypted_content present
response.completed: output contains type=compaction, encrypted_content present
unique compaction item count: 1
```

Keeper 的只读记录确认三次低消耗探针均为：

```text
provider: openai-compatible-xia
executor_type: OpenAICompatExecutor
model: gpt-5.6-sol
endpoint: POST /v1/responses
failed: false
```

最近一次记录的 usage 为 input 327、output 34、total 361 tokens，说明 Responses terminal usage 也被兼容分支正确采集。

## 公网验收

在本地验证完成后，同一个无敏感状态的最小 trigger 探针经 Cloudflare 公网入口执行：

```text
GET https://cliproxy.kanami.top/healthz -> HTTP 200
POST https://cliproxy.kanami.top/v1/responses -> HTTP 200
response.output_item.added: type=compaction, encrypted_content present
response.output_item.done: type=compaction, encrypted_content present
response.completed: output contains type=compaction, encrypted_content present
unique compaction item count: 1
```

公网原始 SSE 同样只暂存在系统临时目录，结构检查后立即删除。该结果证明修复不只在本地 origin 生效，也已通过实际公网入口和 Cloudflare connector。

## 尚未执行的敏感验证

真实“压缩后下一轮”需要读取上游返回的不透明 `encrypted_content`，再把它作为请求载荷发送回外部 xia 服务。该动作涉及敏感状态重放，本次未在缺少额外明确授权时执行。

代码层已经用 httptest 覆盖这一流程：带有效 `compaction + encrypted_content` 的后续轮次必须走 `/responses`，状态保持不变；空值、非字符串和嵌套伪 trigger 均不会启用直通。若以后需要真实重放，应由操作者明确授权，并继续遵循“不落盘、不打印、只回传原生成方”的边界。
