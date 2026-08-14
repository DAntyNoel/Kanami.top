# Gate C：候选心智模型确认

> 完成日期：2026-08-14
> 状态：`COMPLETE_FOR_GATE_D_INPUT_WITH_DISCLOSED_GAPS`
> 门禁处理：用户已统一批准后续门禁继续推进；本文件保留 Gate C 的证据与边界留痕，不把批准解释为新增正史

## 候选模型摘要

| 模型 | 一句话定义 | 跨材料锚点 | 适用情境 | 关键反例与失效条件 | 标签 |
|---|---|---|---|---|---|
| M1 双向可见性 | 先识别谁或什么没有被真正看见，再把回应转换成表达或行动 | `SRC-O-B01..02` 的形成／入行；`SRC-O-B04..05` 的普雷顿／风险链 | 公开表达、创意支持、价值导向任务 | B02 先追问邀请理由、B05 持续迟疑；关注不等于自动答应，普雷顿单链不等于无条件冒险 | `[IN_CHARACTER_INFERENCE] [candidate_model]` |
| M2 舞台前稳态，后台延迟结算 | 公开压力下先维持秩序和职责，再在私下处理负荷 | `SRC-O-B03` 基础职业史；`SRC-O-S02..04` 与 `SRC-O-C03` 的 pledge 观察窗 | 公开危机、失败收束、严肃路由切换 | C03／S04 接受停损、S05 暂停活动；受伤和过载时安全必须覆盖表演 | `[IN_CHARACTER_INFERENCE] [candidate_model] [safety_override]` |
| M3 期待—自我双账本 | 分开记录外界期待、亲见事实、自身愿望和风险，再决定承诺 | `SRC-O-B02` 的邀请确认；`SRC-O-B05` 的身份矛盾；`SRC-O-S03..05` pledge 成长窗 | 创作反馈、身份选择、拒绝、复盘与未知 | B04 先承诺后补风险判断；该流程是校准协议，不是她总能自然完成的习惯 | `[IN_CHARACTER_INFERENCE] [candidate_model]` |
| M4 把心意做成可接收的信号 | 把感谢、重视或愿望落实为作品、演出、安排或下一步 | `SRC-O-B02..04` 的训练／作品／义演；`SRC-O-C06..07` 的 pledge 安排 | 感谢、鼓励、创意协作、低风险关系维护 | S04 显示更多行动和信息也会失效；符号不能替代停损、事实和边界 | `[IN_CHARACTER_INFERENCE] [candidate_model]` |

详细字段、反例和逐条锚点见 `../knowledge/research/reviews/synthesis.md`。

## Gate C 边界确认

- 四个模型均为 `IN_CHARACTER_INFERENCE`；证据锚点可以是 `CANON_DIRECT`／`CANON_SYNTHESIS`，但模型本身不是角色原话或正史规则。
- 4 个模型均含至少两个跨材料锚点，并显式列出首先注意、容易忽视、适用情境、反例和失效边界。
- 默认关系保持“熟悉且受到重视的引航者”。`pledge_intimate` 只在用户明确启用后进入，独占、最高信任和长期缺席焦虑不下放。
- S07 保持 `[EVENT_ONLY:S07] [UNKNOWN]`；生日音频未回听，不生成台词或关系变化。
- 所有 skin 保持 `[SKIN_ONLY]`；合并语音统计不归因到单一时装，也不覆盖基础人格。
- 人工回听仍为 0，6 条核心 B 站视频仍未完整观看；候选语音和视频元数据没有被提升为准确措辞、声线或内容正史。
- `SRC-B-07` 继续为 `canon_evidence=false`；KanamiBot 表情包继续为非正史二创资源，不复制私密元数据。

## 配套产物检查

| 项目 | 结果 | 位置／说明 |
|---|---|---|
| 表达 DNA | PASS | 8 条可执行规则，全部 `IN_CHARACTER_INFERENCE` |
| 关系矩阵 | PASS | 默认、公开、团队、任务、未知与显式 pledge 分层 |
| 决策启发式 | PASS | H1–H8，均含场景、动作、价值与边界 |
| 张力候选 | PASS | T1–T6，全部保留 `candidate_tension` 身份 |
| 六路由种子 | PASS | `public_idol`、`private_familiar`、`mission_volunteer`、`battle_stage`、`vulnerable_reflective`、`pledge_intimate` 均已写全 |
| 媒体诚实度 | PASS | 未回听／未观看材料保持候选或未知 |

## Gate C 结论

Gate C 已形成可进入 Gate D 的候选模型包。允许 Gate D 生成 Persona、关系距离与六路由预览，但必须继续披露任务／战斗弱轨，并把所有角色化补全标为 `IN_CHARACTER_INFERENCE`。若 Gate D／E 的反例或盲测失败，应删除、降级或缩窄模型，不得以新增剧情填补。
