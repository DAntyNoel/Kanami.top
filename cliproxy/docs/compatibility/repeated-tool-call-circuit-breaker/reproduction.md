# 最小复现与验收

## 复现目标

本复现不依赖模型概率性地再次“选错工具”。它用内存中的合成 Responses transcript 稳定构造同一个可见故障形状，以验证 CPA 能否识别循环并给模型一次不含重复工具的恢复轮次。

测试不需要真实 API 密钥、用户对话、外网地址、文件路径或本地命令，也不执行任何工具。上游使用 `httptest.Server` 或等价的进程内假服务，只统计是否收到请求。

测试请求必须显式携带 Codex Responses Lite 标记，否则保护按设计不介入。HTTP 测试设置请求头 `X-OpenAI-Internal-Codex-Responses-Lite: true`；不能设置请求头的 WebSocket fallback 夹具可在请求体中设置：

```json
{
  "client_metadata": {
    "ws_request_header_x_openai_internal_codex_responses_lite": true
  }
}
```

缺少上述两种标记的普通 Responses 请求必须作为非命中样例原样放行。

## 最小合成 transcript

请求只需要声明两个无副作用的合成工具：

- `functions.exec`：代表原本应该选择的动作，但测试不会执行它；
- `collaboration__list_agents`：代表被反复选择的动作。

用户内容可固定为一句合成指令，例如“下一步运行本地编译检查”。真实故障按逻辑字段表示为 `namespace=collaboration`、`name=list_agents`。随后按轮次追加以下两类 item；如果测试所在的翻译阶段使用扁平名称，则等价 wire name 为 `collaboration__list_agents`：

```json
{
  "type": "function_call",
  "call_id": "call-<round>",
  "namespace": "collaboration",
  "name": "list_agents",
  "arguments": "{\"path_prefix\":\"/root\"}"
}
```

```json
{
  "type": "function_call_output",
  "call_id": "call-<round>",
  "output": "{\"agents\":[{\"agent_name\":\"/root\",\"agent_status\":\"running\"}]}"
}
```

`call_id` 每轮必须不同，以证明检测依据不是调用 ID。参数与结果是人工构造的最小 JSON，不来自真实会话。

## 修复前的确定性复现

将上述 pair 重复追加到 `input`。基线样例固定生成 80 轮，再经 CPA 发给进程内假上游；假上游记录实际收到的 request body。

修复前可观察到：

1. 每一轮输入都会被转发到假上游；
2. transcript 持续增长；
3. 不存在总轮数上限；
4. 原计划中的 `functions.exec` 从未出现；
5. 上游 `v7.2.142` 不包含针对该形状的自动恢复逻辑。

这只复现“CPA 对上游重复动作没有边界保护”，不用于断言重复动作最初由模型解码器还是编排器造成。

## 修复后的验收

配置 `codex.repeated-tool-loop-threshold: 3`，使用相同 transcript 和假上游逐轮提交请求。达到阈值前应原样转发；请求尾部达到 3 个相同 pair 后的下一轮必须同时满足：

1. 请求仍正常到达假上游，不返回本地 4xx/5xx；
2. 假上游收到的 `tools` 与 `additional_tools` 均不再包含 `collaboration__list_agents`；
3. `functions.exec` 和其他无关工具仍保留，原始 call/output 历史仍能按 `call_id` 配对；
4. 原 `input` 不新增 developer message；顶层 `instructions` 在保留已有内容的基础上只追加一段简短 developer-level 提示；
5. 追加提示不含工具参数、工具结果、授权 header 或完整对话；
6. `tool_choice` 仍为 `auto`，CPA 不强制改成 `functions.exec` 或其他工具；
7. 日志中没有合成参数和结果正文；
8. 新建 transcript 或低于阈值时，工具清单不被过滤。

验收不能只检查 HTTP 状态；必须断言假上游实际收到的工具清单和顶层 `instructions`。保护的成功标准是“给上游一个无法再次选择该重复工具的恢复轮次”，不是伪造其他工具调用。

另加一组等价的 `custom_tool_call + custom_tool_call_output` 夹具，确认首版保留 custom tool 支持；事故统计和主复现仍以 `function_call + function_call_output` 为准。

将阈值改为 `0` 后重复同一用例，80 轮 transcript 应继续原样转发，以证明开关可回滚。将 `tool_choice` 改为显式指定工具后也应原样转发，以保持调用者的强制选择契约。

## 传输覆盖验收

对相同合成 transcript 分别执行：

| 入口/上游路径 | 预期 |
| --- | --- |
| HTTP Responses，`stream=false` | 自动恢复生效 |
| HTTP Responses，`stream=true` | 在写出 SSE 前完成请求修改，自动恢复生效 |
| Responses WebSocket，经 HTTP-fallback | 携带完整历史和工具定义时自动恢复生效 |
| native upstream WebSocket continuation | 首版不处理，保持现有续传行为 |

native continuation 的非覆盖用例必须确认没有误删或合成工具：续传帧缺少完整历史或工具定义时直接保持原路径。该用例只证明“不误改”，不能声称循环受到保护。

## 等价签名规则

每一轮的签名由以下三部分组成：

```text
tool kind + tool name + canonical(arguments) + canonical(output)
```

规范化要求：

- JSON object 的键顺序和无意义空白不影响签名；
- JSON string 中的实际值变化必须影响签名；
- 非 JSON 参数或结果按原始 UTF-8 内容进行有界处理，不尝试模糊匹配；
- `call_id`、item ID、事件 ID 和状态时间不进入签名；
- 调用必须与同 `call_id` 的 output 配对后才计一轮；孤立 item 不计数；
- 原始参数和结果只在当前请求内用于计算，不写日志、不写磁盘。

## 必须同时验证的非命中样例

以下请求均应继续到达假上游：

- 相同工具和参数，但结果发生变化；
- 相同工具和结果，但参数发生变化；
- 相同 pair 之间夹有用户消息；
- 相同 pair 之间完成了另一个工具；
- 只有调用而没有对应结果；
- 一轮包含并行工具调用；
- 严格连续次数仍低于阈值；
- 未携带 Codex Responses Lite 请求头或等价 `client_metadata` 标记；
- 相同输入因 `auth_unavailable` 重试，但输入中没有新增 pair；
- `tool_choice` 显式指定某个工具；
- 配置阈值为 `0`。

`auth_unavailable` 样例专门用于证明独立的 11 次 503 形状不会污染工具循环计数。显式 `tool_choice` 与关闭配置样例用于证明自动恢复是 opt-in 且不会覆盖调用者的强制契约。

## 脱敏检查

测试夹具只允许出现本文中的合成值。提交前执行文本扫描，确认新目录不含：

- Authorization header 或疑似密钥；
- 真实公网地址、内网地址或 provider base URL；
- 本机用户名和会话文件路径；
- 原始完整对话或运行日志。
