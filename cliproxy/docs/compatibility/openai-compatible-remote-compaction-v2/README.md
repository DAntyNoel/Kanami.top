# OpenAI-compatible 远程自动压缩 v2 兼容性报告

## 当前结论

截至 2026-08-05，问题已通过两组同形请求定位：xia 本身支持 Codex 0.145/0.146 使用的 remote compaction v2，故障发生在 CLIProxyAPI 的 `OpenAICompatExecutor.ExecuteStream`。

Codex 向普通 `POST /v1/responses` 发送流式请求，并在 `input` 中加入 `{"type":"compaction_trigger"}`。当前 OpenAI-compatible 流式执行器会把该请求无条件翻译为 Chat Completions、发往上游 `/chat/completions`，再把普通聊天结果翻译回 Responses。这个降级过程丢失了 `compaction_trigger`，最终没有任何 `type="compaction"` 的 output item，Codex 因而终止：

```text
Error running remote compact task: Fatal error:
remote compaction v2 expected exactly one compaction output item,
got 0 from 3 output items
```

## 证据来源

- `C:\Users\41976\.codex\sessions\2026\08\05\rollout-2026-08-05T19-58-13-019fd1c9-d53b-71e3-97d0-3919daddf660.jsonl`
- `C:\Users\41976\.codex\sessions\2026\08\05\rollout-2026-08-05T20-19-44-019fd1dd-87c9-7cb3-88e3-6354a7d7e392.jsonl`

第一份会话先通过显式 `/responses/compact` 请求发现 xia 会返回 `message + compaction_summary`。这证明不能盲目把任意 compact 响应视为 Codex 0.146 所需的唯一 `compaction`，但它不是当前 remote compaction v2 失败请求的完整复现。

第二份会话随后修正了请求路径并完成决定性对照：

| 请求路径 | 实际上游路径 | 结果摘要 |
| --- | --- | --- |
| 直连 xia `POST /v1/responses`，含 `compaction_trigger` | `/v1/responses` | 唯一 `compaction`，`encrypted_content` 非空 |
| 经本机 `127.0.0.1:12702/v1/responses`，请求体相同 | `/v1/chat/completions` | 普通 `message`，无 `encrypted_content` |
| OAuth/Codex executor | Codex 原生 Responses 路径 | 自动压缩正常 |

因此，`compaction_summary -> compaction` 的响应重命名不是本故障的最终修复。真正需要修复的是普通 `/responses` 流式请求在 OpenAI-compatible 执行器中的协议降级。

## 为什么必须修改

1. 自动压缩失败会让长会话在接近上下文上限时无法继续，不是可忽略的显示问题。
2. xia 直连能够返回正确的 `compaction`，说明禁用自动压缩或替换上游只是在绕过本地转发缺陷。
3. OAuth 正常说明公共 Responses handler、Codex 客户端和 Codex executor 并未整体损坏；修改必须限定在 OpenAI-compatible 流式路径。
4. 截至会话检索时，CLIProxyAPI 的相关 PR/Issue 处理的是 compact 能力路由、WebSocket transcript 合并或其他 provider 的 compact 路径，没有发现修复 `OpenAICompatExecutor.ExecuteStream + compaction_trigger` 的现成补丁。
5. 单纯从当前运行版本升级到当时最新上游版本，仍会保留这段无条件 Chat Completions 转换逻辑，不能解决该错误。

## 修改边界

仅在以下条件同时成立时启用 Responses 流式直通：

- 请求源格式为 OpenAI Responses；
- 顶层 `input` 数组中存在 `type="compaction_trigger"`，或者存在带非空字符串 `encrypted_content` 的 `type="compaction"`；
- 请求由 `OpenAICompatExecutor.ExecuteStream` 处理。

前一种形状触发压缩，后一种形状用于把压缩状态重放到下一轮。命中后保持 `openai-response` 格式并发往 `{baseURL}/responses`，响应继续按 Responses SSE 返回。普通 OpenAI-compatible 流式聊天仍走 `/chat/completions`；非流式 `/responses/compact`、OAuth/Codex executor、其他 provider 均不改动。

## 文档与脱敏材料

- [reproduction.md](./reproduction.md)：复现、对照和验收步骤。
- [implementation.md](./implementation.md)：最小修改、测试、容器部署与回滚方案。
- [verification-2026-08-05.md](./verification-2026-08-05.md)：本次构建、容器部署、真实 xia 探针和安全边界。
- [artifacts/compaction-trigger.request.json](./artifacts/compaction-trigger.request.json)：不含密钥的最小请求体。
- [artifacts/inspect-compaction-sse.ps1](./artifacts/inspect-compaction-sse.ps1)：只输出事件类型、item 类型和加密字段是否存在，不输出正文或 `encrypted_content`。

原始密钥、完整响应正文、加密压缩状态和 provider 配置不进入本目录，也不纳入 Git。
