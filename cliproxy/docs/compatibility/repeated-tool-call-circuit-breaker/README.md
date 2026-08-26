# Responses 重复工具调用熔断兼容性报告

## 当前结论

截至 2026-08-27，已确认的故障是模型在收到正常工具结果后，连续生成同一个无关的只读工具调用；不是工具执行超时，也没有证据证明 CLIProxyAPI（下称 CPA）把原本的本地执行请求改写成了该调用。

脱敏统计如下：

| 项目 | 已确认结果 |
| --- | --- |
| 重复工具 | `collaboration__list_agents` |
| 重复参数 | `{"path_prefix":"/root"}` |
| 调用次数 | 303 次 |
| 工具结果 | 303 次均正常返回，且内容等价 |
| 最长严格连续序列 | 80 轮“调用—结果” |
| 子 Agent 状态 | 没有启动子 Agent，因此该查询不推进原任务 |

调用 ID 与结果能够正确配对，工具没有超时、报错或返回畸形 JSON。可见记录中的工具调用名称本身就是 `collaboration__list_agents`；CPA 的命名空间扁平化/还原行为不能证明存在 `functions.exec -> collaboration__list_agents` 的篡改。

现有证据不足以进一步区分以下原因：

- 模型解码阶段在多个合法工具中反复选择了错误工具；
- 会话编排器在下一轮构造或约束动作时产生了异常；
- 首次误调用后的重复上下文强化了同一动作模式；
- 上述因素的组合。

因此，本次服务端修复的可验证目标不是宣称消除了某个尚未证实的远端根因，而是增加 CPA 防御性自动恢复：即使上游或编排器已经连续生成相同动作，CPA 也会在达到阈值后的下一轮临时移除该重复工具，并在顶层 `instructions` 追加不含参数和结果的 developer-level 提示，要求模型回到原任务。CPA 不会把一个工具调用篡改成另一个工具调用。

## 版本与复现边界

- 对上游 `v7.2.142` 及核对时的 `upstream/main`（`ba200aef`）均未发现相关保护；仅升级 CPA 不能视为本问题已修复。
- 使用 80 轮合成的相同 `function_call + function_call_output` 上下文，经 CPA 可以稳定复现“未受保护时仍继续转发”的行为。
- 80 轮样例只复现 CPA 缺少循环边界保护，不证明首次错误选择发生在 decoder 还是 orchestrator。

## 独立的 503 事件

另有 11 次完全相同输入的重试返回 503，错误归类为 `auth_unavailable`。这 11 次请求之间输入没有增长，也没有追加新的工具调用或工具结果，所以它们不是上述工具循环的一部分，不应计入重复工具调用阈值。

两类问题必须分别处理：

- 重复工具调用由本目录描述的历史尾部检测与熔断约束；
- `auth_unavailable` 仍由凭据可用性、上游恢复和既有重试策略处理。

熔断代码不得把相同请求的网络或认证重试误判为工具循环。

## 修复后的安全属性

对于带 Codex Responses Lite 标记的 OpenAI Responses 完整会话输入，当请求尾部存在达到阈值的、严格连续且等价的“工具调用—对应结果”对时：

1. 仅当 `tool_choice` 为 `auto` 时启用自动恢复。
2. CPA 在 provider 选择和协议翻译前完成检测，只对当前轮从 `tools` 与 `additional_tools` 中移除重复工具。
3. CPA 保留原始历史、其他工具与已有 instructions，只在顶层 `instructions` 追加一段不含工具参数、结果或完整对话的 developer-level 恢复提示，然后正常请求上游；不会在 `input` 内新增 developer message。
4. 新会话、低于阈值的重复、不同参数或结果，以及显式强制 `tool_choice` 均保持原行为。
5. 日志只记录保护是否命中与重复次数，不记录参数、结果正文、授权信息或完整会话。

生产配置使用 `codex.repeated-tool-loop-threshold: 3`；值为 `0` 时关闭保护。这项保护会给模型重新选择其他可用动作的机会，但不会替模型指定 `functions.exec`，也不会由 CPA 代替客户端执行本地命令。

## 影响边界

真实故障在 CPA 可见的逻辑形状是 `function_call(namespace=collaboration,name=list_agents) + function_call_output`。修复应检查请求中已完成并能按 `call_id` 配对的 Responses 工具调用和结果：

- 支持 `function_call` / `function_call_output`；
- 同时保留 `custom_tool_call` / `custom_tool_call_output` 支持；
- 忽略每轮不同的 `call_id`、item ID 和事件 ID，以名称、规范化参数与规范化结果判断等价；
- 只统计会话尾部严格连续、每轮单一且已完成的配对；中间出现用户消息、不同调用、不同结果或并行调用组时重置；
- 阈值以下的合法轮询继续放行；
- 只修改当前请求中的工具清单，不把过滤状态保存到后续请求或全局缓存。

首版协议覆盖范围为：

- HTTP Responses 流式请求；
- HTTP Responses 非流式请求；
- Responses WebSocket 进入既有 HTTP-fallback，且该轮仍携带完整历史和工具定义的请求。

native upstream WebSocket continuation 不在首版范围内：续传帧可能只携带增量输入或 `previous_response_id`，没有完整历史与工具定义，无法在同一安全前提下完成尾部配对和本轮工具过滤。不得用 HTTP-fallback 验收结果推断 native continuation 已受保护。

以下范围不应被改变：

- Chat Completions、Images、Videos、健康检查和管理接口；
- tool namespace 的现有扁平化与还原规则；
- provider 选择、认证、重试与 usage 上报；
- Keeper、Cloudflare、配置文件、auth volume 和用户数据；
- 工具本身的执行、超时或返回内容。

## 文档

- [reproduction.md](./reproduction.md)：无密钥、无真实上游的最小复现与验收方法。
- [implementation.md](./implementation.md)：熔断算法、验证矩阵、部署影响与回滚方案。

本目录不保存密钥、真实服务地址、完整会话、工具输出正文、原始请求日志或 provider 配置。
