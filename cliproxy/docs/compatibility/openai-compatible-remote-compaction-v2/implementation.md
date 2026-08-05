# 修改、部署与回滚方案

## 最小代码修改

目标文件：

`cliproxyapi/internal/runtime/executor/openai_compat_executor.go`

在 `OpenAICompatExecutor.ExecuteStream` 中解析 Responses 请求的顶层 `input`。仅当源格式为 `openai-response`，且存在 `compaction_trigger` 或带非空字符串 `encrypted_content` 的 `compaction` 状态时：

1. 将目标翻译格式设为 `openai-response`，避免降级成 Chat Completions。
2. 将上游 endpoint 设为 `/responses`。
3. 保留 `stream: true`、认证、自定义 headers、代理、请求日志和 usage reporter。
4. Responses SSE 使用同格式翻译/转发，完整保留 `compaction` 与 `encrypted_content`。
5. 不为 Responses 请求添加 Chat Completions 专用的 `stream_options.include_usage`。
6. 只有收到 `response.completed`、`response.incomplete` 或 `response.failed` 才视为正常终止；terminal event 前 EOF 返回上游流错误，不伪造 `[DONE]`。

不要实现通用字符串替换，也不要把 `/responses/compact` 返回的任意 `compaction_summary` 无条件改名。那会掩盖上游协议差异，且不能修复 remote compaction v2 实际经过的普通 `/responses` 路径。

## 回归测试

在 `openai_compat_executor_compact_test.go` 增加 httptest 上游，至少断言：

- 路径为 `/v1/responses`。
- 请求体保留 `compaction_trigger`，不存在 Chat Completions 的 `messages`。
- Responses 请求不会被添加 `stream_options`。
- 模拟的 `response.output_item.done` 和 `response.completed` 能保留唯一 `compaction` 及非空 `encrypted_content`。
- 压缩后的下一轮请求保留 `compaction + encrypted_content` 并继续走 `/responses`。
- terminal event 前异常 EOF 会返回错误，不会被当成成功流。
- 普通流式 Chat Completions 仍使用 `/v1/chat/completions`。

修改后执行：

```powershell
gofmt -w .\internal\runtime\executor\openai_compat_executor.go .\internal\runtime\executor\openai_compat_executor_compact_test.go
go test .\internal\runtime\executor
go build -o .\test-output.exe .\cmd\server
Remove-Item -LiteralPath .\test-output.exe
git diff --check
```

## 容器部署

运行容器没有源码挂载，也没有 Go 工具链。兼容性修改必须在宿主机 submodule 中完成并构建镜像，不能用 `docker exec` 临时改容器。

部署前：

1. 记录 `kanami-cliproxy-api` 的 image ID、启动时间、`RestartCount` 和健康状态。
2. 比较宿主 `config.yaml` 与容器 `/CLIProxyAPI/config.yaml` 的 SHA-256。
3. 确认 bind mount 仍为可写，`CONFIG_OVERWRITE=false`。
4. 给当前 `kanami-cliproxy:latest` 增加一次性回滚 tag。

构建和重建只针对主 API：

```powershell
docker compose -f .\cliproxy\docker-compose.yml build cli-proxy-api
docker compose -f .\cliproxy\docker-compose.yml up -d --no-build --force-recreate --no-deps cli-proxy-api
```

不要重建 Keeper、两个 cloudflared 或其他服务。`restart-local-windows.ps1` 在本地镜像已存在时会使用 `--no-build`，因此不能替代本次显式 build。

部署后依次验证：

- 容器状态与 `/healthz`；
- 配置 SHA-256、bind mount 和 `CONFIG_OVERWRITE=false`；
- 普通 `/v1/responses` 生成；
- 本报告的 `compaction_trigger` 探针；
- 必要时通过真实 Codex 会话触发一次自动压缩并继续下一轮。

## 回滚

若新镜像无法启动或协议测试回归：

1. 保留新容器日志和失败摘要，但不要保存密钥或完整压缩状态。
2. 将部署前的回滚镜像 tag 重新标记为 `kanami-cliproxy:latest`。
3. 使用同一 Compose 命令仅重建 `cli-proxy-api`。
4. 再次检查 `/healthz`、真实 Responses 请求和配置 SHA-256。

配置、auth volume、日志和 Keeper 数据不应在该流程中被替换或删除。
