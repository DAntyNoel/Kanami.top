# 熔断与自动恢复实施、验证及回滚方案

## 实施原则

保护应放在 OpenAI Responses 请求入口，且先于 provider 选择和协议翻译。原因是循环证据已经完整存在于客户端提交的 `input` 尾部；入口可以在不依赖 provider 响应格式的前提下，为本轮生成一份最小修改后的请求。为避免影响普通兼容客户端，首版只处理带 `X-OpenAI-Internal-Codex-Responses-Lite: true` 请求头，或带等价 `client_metadata.ws_request_header_x_openai_internal_codex_responses_lite: true` 标记的请求。

自动恢复是 opt-in 的防御性边界，只在 `codex.repeated-tool-loop-threshold` 大于 `0` 且 `tool_choice=auto` 时生效。生产配置为：

```yaml
codex:
  repeated-tool-loop-threshold: 3
```

保护不应做以下事情：

- 猜测用户真正想调用哪个工具；
- 把 `collaboration__list_agents` 自动改成 `functions.exec`；
- 删除、重排或伪造会话历史；
- 伪造工具结果或模型文本；
- 覆盖调用者显式指定的 `tool_choice`；
- 将单次 503、超时或认证失败累计为工具循环；
- 记录完整参数、结果或会话以便“调试”。

## 检测算法

对 Responses 请求的顶层 `input` 从尾部向前扫描：

1. 识别已完成的 `function_call` / `function_call_output` 与 `custom_tool_call` / `custom_tool_call_output`。真实事故的逻辑形状是 `function_call(namespace=collaboration,name=list_agents) + function_call_output`；custom pair 是兼容覆盖，不是事故形状的替代描述。
2. 只用相同 `call_id` 将调用与结果配对；`call_id` 不进入等价签名。
3. 对工具参数与结果进行确定性的 JSON 规范化；解析失败时使用有长度上限的原始字节。
4. 计算工具类型、名称、参数和结果的内存签名。日志只允许记录保护命中和重复次数，不得记录原文。
5. 从会话尾部累计完全相同的单调用 pair。遇到不同 pair、用户/系统消息、孤立 item 或并行调用组即停止累计。
6. 未达到阈值、阈值为 `0` 或 `tool_choice` 不是 `auto` 时，原样返回请求。
7. 达到阈值后，仅对当前轮从 `tools` 和 `additional_tools` 中移除该重复工具；保留其余工具以及全部历史。
8. 在顶层 `instructions` 保留已有内容并追加一段简短 developer-level 提示，只说明检测到重复动作并要求重新评估原任务；提示不得包含参数、结果或完整对话，且不得在 `input` 中新增 developer message。
9. 将修改后的请求正常交给既有 provider 选择、协议翻译与执行路径。

配置默认值为 `0`，表示兼容性保护关闭；生产显式设为 `3`。这允许两轮以内的合法重复，同时远低于已确认的 80 轮严格连续序列。配置解析必须拒绝负数或将其安全归一为关闭状态，不能因错误值扩大修改范围。

## 请求修改契约

保护命中后仍使用原 HTTP、SSE 或上游错误契约，不引入新的本地 4xx/5xx。CPA 只生成当前轮的派生 request body，调用者提交的原始 body 与历史不落盘、不被改写。已有顶层 `instructions` 必须逐字保留，其后以固定分隔追加一次恢复提示；原字段不存在时才创建该字段。

工具移除必须同时覆盖 `tools` 与 `additional_tools`；同一工具若以不同容器重复声明，不能留下可再次选择的副本。匹配应遵循 CPA 已有的工具名称/namespace 表示，不新增命名翻译规则。

顶层 `instructions` 中追加的 developer-level 提示只描述恢复方向，例如重新检查用户最后明确要求并选择仍可用的其他动作。它不能写入检测到的参数、结果、用户原文，也不能点名强制选择 `functions.exec`。

## 传输覆盖边界

首版在能够取得完整 request body 的共同预处理路径生效，覆盖：

- HTTP Responses 非流式请求；
- HTTP Responses 流式请求；
- Responses WebSocket 经既有 HTTP-fallback 执行，且 fallback 请求带有完整历史与工具定义的轮次。

native upstream WebSocket continuation 首版不覆盖。续传通常只携带本轮增量或 `previous_response_id`，没有完成尾部 pair 检测与过滤所需的完整历史、`tools` 和 `additional_tools`。对这类 continuation 保持现有路径，不缓存或猜测缺失状态，也不把 HTTP-fallback 的测试结论外推到 native upstream WebSocket。

若过滤后没有可用工具，模型仍可返回文字说明；CPA 不伪造工具。若调用者显式指定工具、`required` 或 `allowed_tools` 等非 `auto` 选择，保护不介入，避免违反请求契约。

## 资源与隐私约束

- 扫描应为 O(n)，只处理命中类型和尾部候选，不复制整份会话多次。
- 参数与结果必须设置参与规范化/哈希的字节上限，防止超大工具输出造成额外内存压力。
- 不建立跨请求的全局 transcript 缓存；判定只使用当前请求已经携带的历史。
- 不把参数、结果、input、Authorization 或 provider 信息写入日志和指标标签。
- 指标只记录总命中数、协议与阈值档位等低基数维度。

## 验证矩阵

| 场景 | 预期结果 | 关键断言 |
| --- | --- | --- |
| 严格相同 pair 低于阈值 | 原样放行 | 上游工具清单与输入一致 |
| 严格相同 pair 达到阈值 | 自动恢复 | 上游仍收到请求，但重复工具已移除 |
| 工具同时位于两个清单 | 自动恢复 | `tools`、`additional_tools` 均无残留副本 |
| 每轮 `call_id` 不同 | 仍自动恢复 | ID 不影响签名 |
| JSON 键顺序或空白不同 | 仍自动恢复 | 规范化结果一致 |
| 参数值变化 | 放行 | 不误判相似调用 |
| 结果值变化 | 放行 | 真实轮询进度不被熔断 |
| 中间有用户消息 | 放行 | 严格连续性被打断 |
| 中间有其他工具 | 放行 | 交替工作流不被误判 |
| 孤立调用或孤立结果 | 放行/按原协议校验 | 不把畸形历史算作循环 |
| 并行调用组 | 原样放行 | 不把 batch 展平成连续轮次 |
| 非 JSON 参数或结果 | 不 panic | 有界、确定性处理 |
| 超大工具结果 | 有界处理 | 内存与延迟在测试上限内 |
| HTTP 非流式 Responses | 自动恢复 | 检测发生在共同预处理路径 |
| HTTP 流式 Responses | 自动恢复 | 写出 SSE 前完成请求修改 |
| WS 经 HTTP-fallback | 自动恢复 | 仅完整历史与工具定义的 fallback 请求命中 |
| native upstream WS continuation | 不覆盖 | 缺少完整状态时不误改、不缓存猜测 |
| 原请求已有 `instructions` | 保留并追加一次 | 不覆盖原值，不在 `input` 新增 developer message |
| developer-level 提示 | 追加一次 | 不含参数、结果、用户原文或强制工具名 |
| 显式强制 `tool_choice` | 原样放行 | 不覆盖调用者契约 |
| 阈值为 `0` | 原样放行 | 80 轮样例也不修改 |
| 新会话 | 原样放行 | 无跨请求全局状态 |
| Chat Completions | 不受影响 | 原 handler 与翻译路径不变 |
| 相同输入连续返回 503 | 不计循环 | 没有新增 pair 就不命中 |
| 正常 `functions.exec` 调用 | 放行 | 工具名称不会被改写 |
| 日志脱敏 | 通过 | 不出现参数、结果、凭据、完整 input |

除单元测试外，还应执行：

```powershell
go test ./internal/client/codex/responses-lite-tool-loop-guard -count=1
go test ./sdk/api/handlers/openai -count=1
go test ./internal/translator/openai/openai/responses -count=1
go test ./... -count=1
go build -o (Join-Path ([System.IO.Path]::GetTempPath()) 'cliproxy-server.exe') ./cmd/server
git diff --check
```

如果实际代码落点不同，应将前两条测试命令替换为覆盖真实落点的最小 package，但仍需保留全量测试、构建和 `git diff --check`。

## 部署与用户可见验收

部署前：

1. 记录当前 API 容器的 image ID、启动时间、重启次数和健康状态。
2. 记录当前配置文件的 SHA-256，只比较哈希，不输出内容。
3. 确认配置与 auth volume 的挂载保持不变。
4. 为当前镜像建立一次性回滚 tag。

只重建和替换 CPA API 服务，不重建 Keeper、隧道或其他业务容器。部署后依次验证：

1. 容器健康、无重启、无 OOM；
2. 配置哈希、挂载和 provider/auth 数量未变化；
3. 普通 Responses 流式、非流式与 WebSocket HTTP-fallback 请求完成；
4. 使用 [reproduction.md](./reproduction.md) 的假上游夹具证明命中后仅过滤重复工具，并只在顶层 `instructions` 追加脱敏提示；
5. 使用不含敏感内容的真实入口探针验证正常请求未回归；
6. 在隔离测试会话中构造 80 轮合成上下文，确认生产阈值为 `3` 时恢复轮不再提供重复工具；
7. 检查日志只含脱敏命中摘要。

不得以 `/health` 返回成功代替第 3 至第 7 项。

## 影响边界与残余风险

本补丁能保证被识别的严格连续循环在阈值后的恢复轮中无法再次选择同一工具，但存在以下明确边界：

- 它不能证明首次错误工具选择的远端根因已经消失；
- 参数或结果每轮发生微小变化时不会命中，以避免模糊比较误伤真实任务；
- 多工具交替循环不属于首个最小补丁；
- 模型仍可能选择另一个不相关工具或只返回文字；CPA 不猜测正确动作；
- 显式强制 `tool_choice` 时保护不介入；需要由调用者修正其强制选择；
- native upstream WebSocket continuation 因没有完整历史和工具定义不受首版保护；
- 阈值以内仍可能发生少量无用调用，这是降低合法轮询误报的取舍。

## 回滚

若出现误过滤、性能回归或协议不兼容：

1. 保留脱敏命中次数、请求大小档位和测试摘要；不要保存完整请求。
2. 将 `codex.repeated-tool-loop-threshold` 设为 `0` 并只重载 CPA；用 80 轮合成样例确认请求重新原样转发。
3. 若配置回滚无效，使用部署前回滚 tag 只重建 CPA API 服务。
4. 再次验证容器健康、普通 Responses、配置哈希与 provider/auth 数量。
5. 不删除或替换配置、auth volume、Keeper 数据、日志卷和隧道配置。

回滚仅撤销自动恢复能力，不会修改会话内容或工具执行状态。回滚后应继续采用客户端规避：新会话并从工具定义中移除不需要的 `collaboration` namespace。
