# 香奈美 fictional-character 适配规则

本文件约束研究与生成流程，不包含香奈美人格结论。

## 身份与正史边界

1. 将上游 public figure 解释为有官方正史的虚拟角色。
2. 只把官方游戏设定、剧情、通讯、语音、官方影像及计划认可的 WIKI 入口作为正史候选。
3. 将 KanamiBot 表情包和其他二创素材标为 canon_evidence=false，只允许用于视觉二创。
4. 对正史未回答的问题使用 IN_CHARACTER_INFERENCE 或 UNKNOWN，不补写虚假经历与世界观事实。

## 信源功能

不把来源简单分成可信与不可信，而按表达功能使用：

| 来源 | 主要功能 | 限制 |
|---|---|---|
| 基础设定与角色小传 | 身份、动机、成长线、核心矛盾 | 优先支持稳定人格 |
| 剧情、通讯与回归信 | 关系模式、选择、脆弱面、冲突反应 | 保留对象、场景和前后文 |
| 宿舍与战斗语音 | 表达 DNA、即时反应、任务状态 | 战斗短句不得外推为日常长对话 |
| 官方角色 PV | 官方定位、行为、视觉叙事 | 区分角色台词、旁白和宣传文案 |
| 主题曲 | 意象、情绪基调、价值主题 | 不保存完整歌词，不单独确定事实 |
| 时装 PV 与时装语音 | 特定世界线或舞台表现 | 永远标记 skin，不覆盖基础人格 |
| WIKI 索引 | 定位官方文本、语音和资源 | ASR、翻译和版本措辞需回查原始媒体 |

## 六轨语义替换

- Writings：官方设定、小传、信件、独白与可交叉验证的主题曲表达。
- Conversations：剧情对话、卡丘通讯、宿舍语音、战斗语音与官方互动影像。
- Expression DNA：按情境分析称呼、节奏、问句、隐喻、拒绝、鼓励、示弱和不确定表达。
- Decisions：只记录剧情中实际采取的行动、代价和后来修正。
- External Views：官方旁白、观测语录及其他角色评价，不以玩家评论代替。
- Timeline：人格形成、关系网络、正史阶段和新旧版本演化。

## 情境隔离

每条证据先分配一个主情境，必要时再加一个次情境：

- public_idol
- private_familiar
- mission_volunteer
- battle_stage
- vulnerable_reflective
- pledge_intimate

普通闲聊默认 private_familiar。誓约材料可以参与研究，但 pledge_intimate 默认关闭；不得据此把用户自动视为恋人。死亡、遗忘、父亲和轮回计划优先进入 vulnerable_reflective。时装材料只补强 skin 子情境。

## 差异与张力

1. 先判断 PC／移动端、语言、本体／时装、旧版／新版差异。
2. 翻译差异不自动构成人格冲突；分别保留后提炼共同语义。
3. 新剧情修正旧设定时记录时间线演化，不覆盖旧阶段。
4. 无法判断时记录 unresolved_conflict。
5. 不为满足上游固定数量而制造矛盾。只登记有证据的 tension/conflict；未发现时明确写未发现及检索范围。

## 证据与版权

- 每项关键人格结论至少使用两个跨材料锚点。
- 始终分开 CANON_DIRECT、CANON_SYNTHESIS、IN_CHARACTER_INFERENCE 和 UNKNOWN。
- 不保存完整歌词、完整字幕、长剧情或转写。
- 短引文最多三条，每条不超过 200 字符；优先写释义化证据和时间戳。

## Interaction & Task 适配

将上游 Work Skill 改为 Interaction & Task Skill，只保留：

1. 对话与陪伴。
2. 音乐、舞台和创意表达。
3. 观察局势、识别风险、明确分工、鼓舞执行。
4. 承认失败、保护士气、寻找下一次行动。
5. 围绕记忆、情感与存在意义展开讨论。
6. 超出角色知识时先研究；无依据时不伪造能力。

不得生成技术栈、CRUD、接口规范或 Code Review 等同事模板栏目。

## Codex 最终打包

1. 研究树保留在 workspace，不直接安装。
2. Gate D 通过后，用 skill-creator 的 init_skill.py 初始化 hyphen-case 目录 celebrity-kanami。
3. 最终 SKILL.md 只保留 name、description 两个 frontmatter 字段，并控制在 500 行内。
4. 将人格、互动、正史边界和来源摘要拆到一层 references；只把被最终输出使用且权利明确的图片放 assets。
5. 生成并校验 agents/openai.yaml。
6. 不使用上游 writer 的自动安装；若生成中间 artifact，必须禁用 Claude 自动安装。
7. Gate E 通过后才安装到 Codex，并用 Git 版本覆盖完整研究树与最终包的回滚。
