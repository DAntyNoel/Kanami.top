# 提交给 Xia 上游服务管理员：Codex Responses 重复工具选择循环事故报告

> - 建议提交主题：Codex Responses 在正常工具结果后重复选择同一无关工具，导致任务无法推进
> - 提交日期：2026-08-27
> - 建议优先级：高（请求仍成功但任务可无限停滞）
> - 涉及接口：OpenAI-compatible Responses，含 HTTP、SSE 与 WebSocket HTTP-fallback

## 提交工单时必须通过受控字段补充的信息

本公开附件不保存可关联账号或请求的标识。正式提交 Xia 工单时，请在其受控/私密字段中同时提供：

- 原始事故时间窗口，并明确标注时区为 `Asia/Shanghai`；
- Xia 返回的 request ID、trace ID 或等价服务端关联 ID；
- 可供 Xia 内部查询的账号/租户及路由关联标识，避免提交 API key 或 Authorization；
- 若没有 request ID，请明确写明“客户端未保留 request ID”，并提供尽可能窄的时间窗口。

当前仓库材料没有上述原始事故关联字段。若提交时仍无法补充，Xia 可以执行本文的合成复现和版本排查，但无法仅凭本公开文档准确定位原始请求。

## 一、管理摘要

我们确认了一类“动作选择无进展循环”：模型已经收到格式正确、立即返回且内容正常的工具结果，但下一轮仍反复生成同一个无关的只读工具调用。工具本身没有卡死；可见记录中没有证据表明 CPA 把另一工具的请求篡改成该调用，循环表现在后续动作选择阶段。

可见记录能够确认的直接原因是：**在 `tool_choice=auto` 的连续 Responses 轮次中，动作选择反复输出相同工具、相同参数，并在收到等价结果后继续重复，没有回到用户明确要求的原计划。**

现有记录无法继续区分首次错误选择来自以下哪一层：

- Xia 所使用模型的 tool-call 解码或动作策略；
- Xia 的 Responses 会话编排、上下文构造或工具约束；
- 首次误调用进入上下文后形成的模式强化；
- 上述因素的组合。

因此，我们请求 Xia 管理员检查模型输出进入 CPA 之前的动作选择记录，以及每轮提交给模型的工具列表、`tool_choice`、instructions 和尾部会话历史。本站已在 CPA 部署防御性熔断，能够阻止已知形状无限重复，但这不是远端首次错误选择的根因修复。

## 二、事故表现与已确认数据

原任务要求继续执行本地动作，例如安装依赖、写入代码、编译检查或运行测试。实际动作却连续变成：

```text
function_call(namespace=collaboration, name=list_agents)
arguments={"path_prefix":"/root"}
```

对应工具结果每次都能立即正常返回，逻辑内容为主 Agent `/root` 仍在运行。事故期间没有启动子 Agent，因此该查询不会推进原任务。

脱敏统计：

| 项目 | 已确认结果 |
| --- | --- |
| 重复工具 | `collaboration__list_agents` |
| 重复参数 | `{"path_prefix":"/root"}` |
| 可见调用总数 | 303 次 |
| 工具结果 | 303 次均正常返回且内容等价 |
| 最长严格连续序列 | 80 轮“调用—结果” |
| 工具超时或错误 | 未发现 |
| 原计划动作 | 部分轮次从未生成 |

每轮 `call_id` 不同且能与对应 `function_call_output` 正确配对。循环不是同一 HTTP 请求的网络重试，而是会话历史持续增长后产生了新的、内容等价的工具调用。

## 三、根因分层结论

| 层级 | 当前结论 | 置信度 |
| --- | --- | --- |
| 可见直接原因 | 正常工具结果之后，动作选择仍重复输出同一无关工具，造成无进展循环 | 已确认 |
| CPA 行为 | 可见入站工具调用本身就是 `collaboration/list_agents`；没有证据表明 CPA 将 `functions.exec` 改写成该工具 | 已确认 |
| 系统性缺口 | 当时 CPA 以及已核对的 CLIProxyAPI 公开版本没有相同 call/output 尾部的循环熔断，因而会继续转发 | 已确认 |
| 可能诱因 | 首次误调用后的重复“调用—结果”模式进入上下文，强化了后续相同动作选择 | 较可能，未证实 |
| 远端根因位置 | 模型 decoder、动作策略、Xia Responses 编排器或其组合 | 未定位，需 Xia 日志 |

OpenAI 官方 Function calling 文档说明：默认 `tool_choice: "auto"` 时，模型可以调用零个、一个或多个函数，何时以及调用多少工具由模型决定。该契约没有提供“相同成功调用不得重复”或“必须产生任务进展”的保证。因此，无进展检测仍需要模型服务、会话编排器或代理网关提供防御性边界。官方来源：<https://developers.openai.com/api/docs/guides/function-calling>。

### 已排除或尚无证据支持的解释

- `collaboration__list_agents` 没有超时、报错或返回畸形 JSON；
- 本地 Python、PowerShell、Ollama、PydanticAI 没有因该调用卡死；
- 循环期间没有相关后台安装、编译或翻译进程等待完成；
- 没有证据表明 VS Code、字符编码、磁盘空间或本地文件系统造成该循环；
- 没有证据表明 CPA 将计划中的 `exec_command`/`functions.exec` 请求篡改为 `list_agents`；
- CPA 命名空间扁平化与还原只能解释 wire name 表示，不能解释为何模型连续选择同一工具。

## 四、版本与路由现状

- 事故发生时的 CPA 代码基线：`v7.2.140-5-g1f7fe470`；
- 已核对的公开 CPA 标签：`v7.2.142`；
- 核对时的 CPA `upstream/main`：`ba200aef`；
- 上述公开版本均未发现针对此故障形状的循环保护，单纯升级到 `v7.2.142` 不能解决；
- 当前本站 CPA 修复提交：`c3266f8b`；
- 当前生产回归链路选择的模型：`gpt-5.6-luna`；
- 原始事故使用的精确模型快照、路由节点和服务端编排版本，必须由 Xia 根据其日志确认，本站不作推断。

当前 Xia 路由为 OpenAI-compatible Responses。生产 WebSocket 验证确认现有路由进入 CPA 的 HTTP-fallback，因此已受本站熔断保护；若未来切换为 native upstream WebSocket continuation，则需要针对增量帧和 `previous_response_id` 另行保存或获取判定所需状态。

## 五、当前已部署的 CPA 缓解

本站在 Responses 入口、provider 选择和协议翻译之前加入了 opt-in 熔断：

```yaml
codex:
  repeated-tool-loop-threshold: 3
```

命中条件：

1. 请求带 Codex Responses Lite 标记；
2. `tool_choice` 明确为 `auto`；
3. `input` 尾部达到 3 轮严格连续、相同工具、规范化参数相同、规范化结果相同的已完成 call/output pair；
4. 每轮调用与结果能通过 `call_id` 正确配对。

命中后的行为：

- 只在当前恢复轮从 `tools` 和 `additional_tools` 移除重复工具；
- 保留其他工具、完整历史、原有 instructions 和 `tool_choice=auto`；
- 在顶层 `instructions` 追加固定且脱敏的恢复提示；
- 不猜测或强制选择 `functions.exec`；
- 不建立跨请求 transcript 缓存，不记录参数、结果、Authorization 或完整 input；
- 新会话及低于阈值的合法轮询不受影响。

这项措施保证已识别的严格相同循环在恢复轮无法再次选择同一工具，但不能保证模型一定选择正确工具，也不能消除首次错误选择。

## 六、生产验证结果

验证日期为 2026-08-27（`Asia/Shanghai`）。使用的脱敏合成探针标签包括 `BELOW`、`THRESHOLD`、`LOOP_80` 和 `WS_GUARD`；代码证据为 CPA 提交 `c3266f8b`，部署说明为父仓提交 `75cb8e9`。这些探针用于验证本站缓解，不是原始事故的 Xia request ID。

| 验证场景 | 实际结果 |
| --- | --- |
| 2 轮相同 call/output | HTTP 200，未命中熔断 |
| 3 轮相同 call/output | HTTP 200、`completed`，命中 1 次，响应中目标工具调用数为 0 |
| 80 轮事故形状 | HTTP 200、`completed`，命中 1 次，响应中目标工具调用数为 0 |
| 全新会话单次目标工具 | 正常产生 1 次工具调用，熔断命中数为 0 |
| 公网非流式 Responses | HTTP 200，返回预期探针文本 |
| 公网 SSE Responses | HTTP 200、`text/event-stream`、包含 `response.completed`，无 `[DONE]` |
| WebSocket HTTP-fallback | 连接成功，13 个事件帧，`response.completed`，命中 1 次 |
| CPA 容器 | 运行正常，RestartCount 0，未 OOM |
| 配置与认证 | 配置哈希保持一致，`CONFIG_OVERWRITE=false`，auth volume 未替换 |

相关 Go 单元/handler 测试和生产 Docker 编译均通过。全仓仍有既存的 Home 取消测试超时、Claude 指纹平台断言和 no-copy 旧白名单失败；这些失败与本补丁文件无关，未将其描述为全仓测试全绿。

## 七、与本事故无关的 503 事件

另观察到 11 次完全相同输入返回 `503 auth_unavailable`。这些请求之间没有新增工具调用或工具结果，transcript 没有增长，因此它们属于凭据可用性/上游重试问题，不是动作选择循环，也不应累计进重复工具阈值。

请 Xia 管理员在排查时将两类事件分开：

- 工具循环：每轮新增相同 `function_call + function_call_output`；
- 认证重试：输入不变且没有新增 pair，仅重复返回 `auth_unavailable`。

## 八、2026-08-28 本地代理 profile 跟进观察（非原事故正向复现）

我们又检查了一次使用本地 `cliproxyapi -> CPA -> Xia` profile 的 Codex session，并与当前直连 Xia 的正常 session 做了只读对照。该跟进 session 与原事故有表面相似点，但**不满足本文定义的严格重复工具循环**，不应作为原事故的正向复现样本。

截至 `2026-08-28 00:45:52`（`Asia/Shanghai`）的本地快照：

| 项目 | 跟进 session 结果 |
| --- | --- |
| `collaboration/list_agents` 调用 | 13 次，13 个不同 `call_id` |
| 参数 | 仅 1 种，均为 `{"path_prefix":"/root"}` |
| 工具结果 | 全部正常返回，但随子 Agent 运行/完成状态形成 4 种不同结果 |
| 最长严格连续相同 call/output 序列 | 1 轮 |
| 其他实际工具 | 已生成 15 次 `functions.exec`，并穿插 `wait_agent`、`send_message`、`interrupt_agent` 等调用 |
| 子 Agent | 确有多个子 Agent 处于运行或完成状态 |
| 本站熔断命中 | 0 次 |

因此，这里的 `list_agents` 是有实际协作对象的状态查询，而且相邻查询之间存在其他工具调用或状态变化；它不符合“无子 Agent、正常等价结果后立即再次选择完全相同工具、原执行工具始终未生成”的原事故条件。查询频率可以进一步优化，但不能仅凭次数判定为动作选择死循环。

profile 对照确认：跟进 session 的 `model_provider=cliproxyapi`，本机入口为 `127.0.0.1`；正常对照 session 的 `model_provider=xia`，直接访问 Xia。两者均使用 Responses、`gpt-5.6-sol` 和 `ultra` reasoning。与此同时，session 元数据还记录了 Codex TUI/Desktop、CLI 版本、history mode 和工作目录差异，因此这不是严格控制变量的 A/B，不能仅凭一次对照把差异归因于 CPA 或 Xia。

同一时间窗 `2026-08-28 00:28:00..00:42:59` 的 CPA 文件日志还记录到：

- Responses WebSocket client connected 17 次；
- `/v1/responses` 结束并记为 HTTP 200 共 8 次；
- 向下游写入时出现 7 次 `broken pipe`，涉及 `response.completed`、`response.output_item.done`、文本 delta 和 reasoning delta/part done；
- `/v1/alpha/search` 返回 503 共 10 次；
- 重复工具熔断命中 0 次。

该时间窗包含主 Agent 和多个子 Agent，CPA 日志没有可公开的一对一 session 关联 ID；此外，`broken pipe` 的直接含义是 CPA 写入时下游连接已经关闭，不能单凭方向证明 CPA 主动截断了响应。部分连接可能与 Agent 中断、取消或切换轮次有关。上述现象应作为**独立的本地代理兼容性信号**排查，而不是替代原事故的动作选择证据。

建议 Xia 与 CPA 共同做一次严格 A/B：固定同一 Codex build、originator、history mode、工作目录、prompt、tools 和 transcript，仅切换 `model_provider=xia` 与 `model_provider=cliproxyapi`，同时保留脱敏的原始 Responses 帧序列、结束事件和连接关闭方。只有本地代理路径单独丢失、重排或提前结束事件时，才能将修复优先级明确落到 CPA；若进入 CPA 前的 Xia 原始动作已经重复，则仍需 Xia 检查模型/编排器。

### 公网 CPA provider 单轮验证

`2026-08-28 18:52`（`Asia/Shanghai`）又使用 Codex CLI `0.150.1` 做了一次隔离的公网入口验证。该次调用保持 `gpt-5.6-sol`、`ultra`、只读 sandbox 和现有 `cliproxyapi` 鉴权不变，仅在单进程内把 provider `base_url` 临时覆盖为 `https://cliproxy.kanami.top/v1`，没有修改用户默认配置。

验证任务要求运行一次 PowerShell `Write-Output PUBLIC_PROVIDER_OK` 并复述实际输出。可见事件顺序为：

1. Agent 说明即将执行最小只读探针；
2. 生成本地 `command_execution`，没有生成 `collaboration/list_agents`；
3. 命令输出 `PUBLIC_PROVIDER_OK`，退出码为 0；
4. Agent 正常复述结果并产生 `turn.completed`。

CPA 文件日志同时记录到来自公网入口的两次 `/v1/models?client_version=0.150.1` HTTP 200，以及一个 Responses WebSocket client connected 事件，证明该测试实际经过公网入口而非本机 `127.0.0.1` 回落。测试使用 `--ephemeral --json`，没有留下持久 Codex session 文件。

该结果确认公网 provider 在这一轮最小“模型选择命令工具 -> 本地工具成功 -> 模型结束回复”流程中可用，且没有出现目标循环。但单轮成功不能排除概率性或长上下文相关故障；公网和本机入口仍落到同一 CPA/Xia 后端，因此也不能仅凭该结果区分 CPA 转换与 Xia 动作策略。

## 九、请求 Xia 排查的具体位置

请优先保留并比较以下三个阶段的脱敏记录：

1. **送入模型之前**：模型快照、路由节点、顶层 instructions、`tool_choice`、可调用工具名称列表，以及最近 3～5 个 item 的类型与哈希；
2. **模型原始输出之后、协议转换之前**：原始 tool call 的 namespace、name、参数哈希和结束原因；
3. **下一轮构造之后**：上一工具结果是否被正确加入、是否又注入了强制/allowed tool 约束、是否复用了错误的 previous response/session state。

重点检查：

- 第一次选择 `list_agents` 时，模型看到的用户最后明确要求是否仍完整存在；
- 工具返回“主 Agent 正在运行”后，编排器是否把该结果误解释为需要再次轮询；
- 下一轮是否错误保留了 forced/required/allowed tool 状态；
- 是否存在基于上一动作的缓存、粘滞路由或 continuation state，使相同 tool call 被重复采样；
- 不同模型快照或不同路由节点是否有显著差异；
- 关闭会话复用、只保留最小尾部历史后，循环是否消失。

日志与指标应只使用工具名、次数、低基数路由字段和参数/结果哈希；请勿在普通工单中回传真实 Authorization、完整用户对话或工具结果正文。

## 十、建议的上游解决方案

### 方案 A：Xia 编排器加入无进展熔断（建议优先）

在每次将工具结果送回模型前，对尾部已完成 pair 计算：

```text
tool kind + qualified tool name + canonical(arguments) + canonical(output)
```

当相同 pair 连续达到 2～3 轮时：

- 本轮临时从可调用工具中移除该工具，或用 `allowed_tools` 限制为其他仍相关工具；
- 追加固定恢复 instruction，要求重新读取用户最后目标且不得重试同一工具或别名；
- 若没有其他工具能推进，返回明确 blocker，而不是继续轮询；
- 保留原历史，不伪造工具结果，不自动改写为另一个工具调用。

应避免模糊匹配：参数或结果发生真实变化时视为进展；并行工具组、交替工具和中间用户消息应打断连续计数。

### 方案 B：修正模型/动作策略对正常结果的解释

为当前模型快照建立回归 eval：给定“执行本地命令”的用户目标、包含 `exec` 与 `list_agents` 的工具集，以及一轮或多轮 `list_agents -> /root running` 结果，断言下一动作不能继续选择相同只读查询。

可选修复包括：

- 强化“工具成功不等于任务进展”的动作评价；
- 在训练/系统提示中要求对比用户未完成目标与最近工具结果；
- 对重复成功结果降低相同工具的选择概率；
- 将“无子 Agent 时查询主 Agent 状态”定义为非进展动作。

### 方案 C：检查并修正 Responses continuation 状态

如果问题只在 `previous_response_id`、WebSocket continuation 或会话复用下出现，应检查：

- 增量输入是否意外丢失了用户最后目标或可用工具更新；
- 上一轮 forced/allowed tool choice 是否错误继承；
- continuation 缓存是否复用了旧 action logits、tool mask 或已过期 session state；
- 工具结果 item 与 call item 的配对是否影响下一轮提示顺序。

### 方案 D：CPA 官方版本吸收通用保护

CPA 当前公开 `v7.2.142` 没有该能力。建议将本站熔断抽象为默认关闭的兼容配置，并补齐 HTTP、SSE、WebSocket fallback、namespace、custom tools、阈值边界和日志脱敏测试。

该方案适合作为跨 provider 防护，但仍不能替代 Xia 对首次错误选择的根因修复。

### 方案 E：客户端临时规避

在上游根因修复前，可继续采用：

- 新建会话，避免重复模式继续占据尾部上下文；
- 对不需要协作的任务不提供 `collaboration` namespace；
- 遇到两轮相同无进展调用时主动终止当前代理轮次；
- 明确提示“不要查询 Agent 状态，继续执行原计划中的本地动作”。

客户端规避只能降低触发概率，不应作为长期唯一方案。

## 十一、建议的上游复现方法

请使用隔离账号与合成数据，不执行真实工具：

1. 声明两个合成工具：代表原目标的 `functions.exec`，以及只读的 `collaboration__list_agents`；
2. 用户输入固定为“下一步运行本地编译检查”；
3. 在 `input` 尾部加入 2、3、80 轮相同 `function_call + function_call_output`；
4. 每轮使用不同 `call_id`，参数和结果使用规范化后等价的合成 JSON；
5. 保持 `tool_choice=auto`，分别测试新会话、普通 HTTP、SSE、WebSocket continuation；
6. 在动作输出进入任何 CPA 翻译前记录模型选中的工具；
7. 对比关闭会话复用、删除重复历史、切换模型快照或路由节点后的结果。

该夹具可以稳定验证“面对重复历史时是否继续选择同一动作”，但不能保证概率性复现最初那一次错误选择。首次错误选择需要结合原始事故的 Xia 服务端日志定位。

完整的无密钥夹具与 CPA 验收步骤见 [GitHub 上的 reproduction.md](https://github.com/DAntyNoel/Kanami.top/blob/main/cliproxy/docs/compatibility/repeated-tool-call-circuit-breaker/reproduction.md)。

## 十二、希望 Xia 管理员反馈的信息

请在回复中至少包含：

1. 是否能确认原始 tool call 在进入 CPA 前已经是 `collaboration/list_agents`；
2. 原始事故使用的模型快照、路由节点和 Responses 编排器版本；
3. 首次错误选择与后续重复分别发生在哪一层；
4. 是否存在 tool choice、continuation state 或缓存继承异常；
5. 是否能够在 Xia 侧复现 3/80 轮合成样例；
6. 计划采用模型修复、编排器熔断还是两者结合；
7. 可供本站回归验证的修复版本、灰度时间和回滚条件。

## 十三、附件与隐私说明

- [兼容性报告](https://github.com/DAntyNoel/Kanami.top/blob/main/cliproxy/docs/compatibility/repeated-tool-call-circuit-breaker/README.md)
- [最小复现与验收](https://github.com/DAntyNoel/Kanami.top/blob/main/cliproxy/docs/compatibility/repeated-tool-call-circuit-breaker/reproduction.md)
- [CPA 实施、验证及回滚方案](https://github.com/DAntyNoel/Kanami.top/blob/main/cliproxy/docs/compatibility/repeated-tool-call-circuit-breaker/implementation.md)

若 Xia 工单环境不能访问 GitHub，请将以上三份 Markdown 与本报告作为附件上传，不要只粘贴相对链接。

本报告不包含真实 API key、Authorization、provider base URL、完整用户会话、原始请求日志、真实工具输出正文或本地文件路径。如需关联原始事故，请通过受控渠道交换时间窗口和服务端 request ID，不要在普通工单中粘贴凭据或完整配置。
