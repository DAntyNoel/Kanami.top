# Gate B｜研究质量审计

> 审计日期：2026-08-14
> 结论：`PASS_WITH_DISCLOSED_GAPS`
> 门禁含义：允许提交用户确认 Gate B；未获用户确认前不进入 Gate C

## 1. 计划门槛

| 检查项 | 结果 | 证据 |
|---|---|---|
| 6 个独立研究文件 | PASS | `raw/01_writings.md` 至 `raw/06_timeline.md` 均有实质内容 |
| 不少于 12 个具体材料 | PASS | 53 条 source record；21 accepted、32 candidate |
| 不少于 8 个研究相关实开 URL | PASS | M-01、A-01、B-01..06；另有 B-07 条件页和 1 次 WIKI 拦截记录 |
| 覆盖设定／小传、剧情／通讯、语音、官方视频 | PASS | 记录类型覆盖 setting、story、dialogue、voice、pv、song、letter |
| 核心结论有跨材料锚点 | PASS | merged summary 的 7 条结论均列出多个 source_id；单事件规则已降级为 inference |
| source record 区分证据与推论 | PASS | 21 条核心 accepted 记录均有 `evidence_summary`、`inference`、`conflicts`；文本互动记录均有 `counterparties` |
| 不复制长歌词、字幕或剧情 | PASS | 只保存释义与必要短语义；53 条 `short_quote` 均为空 |
| Gate B 边界 | PASS | 未出现 Persona、Work Skill 或最终 `SKILL.md` |

## 2. 记录层审计

- 53 个 source_id 与 `source_manifest.md` 一一对应，逐条 schema 校验 0 错误。
- 21 条 accepted 证据集由：M-01 主页、B01–B05 小传、C01–C09 通讯、S01–S05 剧情和 L01 回归信组成。
- S01–S05 已记录明确对话对象、JSON 路径锚点、释义化证据、独立推论和冲突；旁白、玩家选项与重复回复仍按边界处理，不做频率叠加。
- A-01 与 A-03 虽有网页／索引统计和候选推论，但因没有音频时间戳与人工回听保持 `candidate`。
- B-01..06 只接受 owner、标题、日期、时长、分 P 和页面身份；因未观看而保持 `candidate`，时间戳为空是刻意边界。
- B-07 为 `candidate`、`canon_evidence=false`、`characters_present=["未确认"]`；相关推荐 COS 标题不算视频本体证据。

## 3. 情境与标签审计

- C01–C09、S01–S06、L01 均路由到 `pledge / pledge_intimate`；普通对话默认关闭。
- S07 只有生日当天进入宿舍的 event 触发条件，保持 `event / private_familiar` 候选；未回听前不提升关系强度。
- 所有 skin 记录保持独立；Track 3 已把 97 条统计明确为“世纪歌姬 83 + 花的私语 14”的合并样本，不再归因到单一时装。
- `public_idol`、`private_familiar`、`mission_volunteer`、`battle_stage`、`vulnerable_reflective`、`pledge_intimate` 的规则已逐条标记证据等级。
- Track 4 中“先确认为何被选择”、普雷顿快速承诺和狙击枪偏好均因单事件或单链降为 `IN_CHARACTER_INFERENCE`。
- 主题曲标题与剧情方向的字面呼应已降为候选推演，不再标为正史合成关系。

## 4. 网页、音频与版本审计

- web-verification 总成功 9：研究相关 8，另加 B-07 条件页；blocked 1。
- A-01 语音页可见宿舍、对局、两种时装、心之奏鸣和系统播报分区，并明确披露 ASR + 人工校对来源；本次没有播放音频。
- 音频索引 952 项与生成脚本一致：942 项语音元数据、10 项相关音乐；输出文件 SHA-256 为 `6bcfcf7ad40d89e6590f9e20af5ad8be2ef82a2040785976ca35ef09137bb533`。
- 文件名语言 CN 283、JP 321、EN 202、未标 146；metadata language 冲突 145。
- 人工回听 0、核心 B 站视频完整观看 0。按详细计划，这些必须在 Gate B 摘要中报告为待补证据，但不单独构成门禁失败。
- 游戏内相对时间、现实发布时间和 pledge／skin 支线已分开；缺少统一 PC／移动端版本桥梁，现实发布日期不用于倒推正史日期。

## 5. 独立审计与修复记录

第一轮独立只读审计判定 FAIL，发现记录层仍停在 Gate A、两个 0-based 越界锚点、条件视频字段冲突、誓约路由不一致、无标签表达规则、skin 合并统计误归因和单事件过度合成。已逐项修复：

1. 新增 A-01 语音页实开证据，使研究相关 URL 达到 8。
2. 将 21 条核心材料同步为 accepted 记录级证据，并为 S01–S05 补齐对话对象与 JSON 路径锚点。
3. 修正 `story[5].scene[0].line[0:15]` 为 `[0:14]`、`comm[1].message[12:26]` 为 `[12:25]`。
4. 修正 B-07、C06–C09／S07 路由、Track 2 漏标 pledge、Track 3 证据等级与合并统计、Track 4 单例泛化、Track 6 标题呼应强度。
5. 强化 Gate B 验证器，对 accepted 核心证据、未回听媒体边界、pledge 路由和 B-07 条件证据作确定性检查。

第二轮全包独立只读复核最终判定 `PASS_WITH_DISCLOSED_GAPS`，确认无 P1／P2；摘要专项复核最终判定 PASS。复核所列的 source-record secondary route 检索便利性问题随后已补到 M-01、O-B04、O-B05，并重新生成、校验全部记录。剩余 P3 仅是部分 raw 段落依赖文件级 `PLEDGE_ONLY` 边界而没有逐行重复标签，不影响合并摘要或下游门禁。

## 6. 保留缺口

这些缺口必须进入后续研究优先级，不能被 Gate C 自动补写：

- 关键中文语音、S06、S07 未回听，不能确认准确措辞、语速、音高、停顿或笑声。
- B-01..06 未完整观看，不能提取歌词、字幕、镜头关系或时间戳。
- 非誓约任务、队友／敌人互动与独立他者评价不足。
- P6 暂停活动后的创作结果、P7 新歌、剪刀手受伤后是否归队未知。
- raw 文件中 01／06 与 source records 使用 0-based JSON 路径，02／04 为人工复核使用 1-based 简写；各文件已显式声明且范围已复核，但 Gate C 引用时应优先采用 source record 的 0-based 锚点。

## 7. 可复现验证

在仓库根目录运行：

    python kanami-skill/workspace/scripts/build_gate_a_source_records.py
    python kanami-skill/workspace/scripts/validate_source_records.py kanami-skill/workspace/skills/celebrity/kanami/knowledge/source-records --schema kanami-skill/workspace/schemas/source-record.schema.json
    python kanami-skill/workspace/scripts/validate_gate_b.py kanami-skill/workspace/skills/celebrity/kanami
    python -m unittest discover -s kanami-skill/workspace/tests -p "test_*.py" -v

当前预期：source-record 53／53、0 errors；Gate B 40／40 PASS；单元测试 11／11 PASS。
