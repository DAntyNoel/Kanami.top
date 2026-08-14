# 香奈美蒸馏来源清单（Gate A）

> 状态：`READY_FOR_USER_CONFIRMATION`
> 枚举日期：2026-08-14
> 当前阶段只登记候选材料，不提取人格结论，不代表材料已通过内容核验。

## 项目基线

- 角色家族：`celebrity`
- 适配层：`fictional-character`
- 收集策略：`web+local`
- 默认表达基线：中文 PC 正史
- 默认关系：熟悉且受到重视的引航者
- 誓约模式：默认关闭，仅在用户显式要求后启用
- 时装材料：保留为 `skin` 情境，不覆盖基础人格
- 上游：`titanwings/colleague-skill` 的 `dot-skill` 分支，固定提交 `22d96a76e05b91939493f604a0a46198d0d7f978`

## 登记规则

每条正式 source record 后续必须补齐：具体 URL、标题、发布者、发布时间或版本、访问日期、材料类型、正史情境、语言、时间线阶段、对话对象、六轨映射、释义化证据、必要短引文、时间戳、推论和冲突。

本清单的六轨缩写：

- `T1`：设定、独白与核心命题
- `T2`：对话、关系与压力反应
- `T3`：表达 DNA
- `T4`：实际选择与决策启发式
- `T5`：旁白与他者视角
- `T6`：正史时间线与阶段演化

统一页面别名：

- `M`：[香奈美主页](https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E)
- `G`：[香奈美画廊](https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E/%E7%94%BB%E5%BB%8A)
- `V`：[香奈美语音台词](https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E/%E8%AF%AD%E9%9F%B3%E5%8F%B0%E8%AF%8D)
- `O`：[香奈美誓约](https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E/%E8%AA%93%E7%BA%A6)

WIKI 候选统一记为 `publisher=卡拉彼丘WIKI`、`accessed_at=2026-08-14`。当前 JSON 未保存可靠的 `published_at`、游戏版本或完整时间线阶段，这些字段必须在内容核验时补齐或标为 `unknown`。

## A. 誓约页：通讯、角色小传与回归信

| source_id | 标题 | URL | material_type / canon_context | language | 轨道 | 本地数量 | 核验缺口 |
|---|---|---|---|---|---|---:|---|
| SRC-O-C01 | 好感度1 | O | dialogue / pledge | zh-CN | T2,T3,T6 | 18 消息 + 2 选项 | 无日期、版本 |
| SRC-O-C02 | 好感度3 | O | dialogue / pledge | zh-CN | T2,T3,T6 | 24 + 2 | 同上 |
| SRC-O-C03 | 好感度5 | O | dialogue / pledge | zh-CN | T2,T3,T6 | 21 + 2 | 同上 |
| SRC-O-C04 | 好感度7 | O | dialogue / pledge | zh-CN | T2,T3,T6 | 23 + 4 | 同上 |
| SRC-O-C05 | 好感度9 | O | dialogue / pledge | zh-CN | T2,T3,T6 | 19 + 2 | 同上 |
| SRC-O-C06 | 引航者生日 | O | dialogue / event | zh-CN | T2,T3,T6 | 9 + 4 | 具体年份缺失 |
| SRC-O-C07 | 引航者生日2 | O | dialogue / event | zh-CN | T2,T3,T6 | 15 + 2 | 具体年份缺失 |
| SRC-O-C08 | 2025 年角色生日 | O | dialogue / event | zh-CN | T2,T3,T6 | 16 消息 | 无版本信息 |
| SRC-O-C09 | 2026 年新春祝福 | O | dialogue / event | zh-CN | T2,T3,T6 | 10 + 4 | 无版本信息 |
| SRC-O-B01 | 看不见的情绪 | O | setting / base | zh-CN | T1,T4,T5,T6 | 1 段 | 单段长文本、无日期 |
| SRC-O-B02 | 寻求关注的本能 | O | setting / base | zh-CN | T1,T4,T5,T6 | 1 段 | 同上 |
| SRC-O-B03 | 成名之路 | O | setting / base | zh-CN | T1,T4,T5,T6 | 1 段 | 同上 |
| SRC-O-B04 | 过去的影子 | O | setting / base | zh-CN | T1,T4,T5,T6 | 1 段 | 同上 |
| SRC-O-B05 | 矛盾的心理 | O | setting / base | zh-CN | T1,T4,T5,T6 | 1 段 | 同上 |
| SRC-O-L01 | 回归信 | O | letter / pledge | zh-CN | T1,T2,T3,T6 | 1 段 | 两种触发条件的格式需核对 |

小计：9 组通讯，共 177 个消息／选项节点；5 篇角色小传；1 封回归信。

## B. 具体剧情单元

| source_id | 标题及具体 URL | canon_context | 轨道 | 本地数量 | 核验缺口 |
|---|---|---|---|---:|---|
| SRC-O-S01 | [初识剧情：不可思议的偶遇](https://wiki.biligame.com/klbq/%E5%89%A7%E6%83%85%E6%95%85%E4%BA%8B/%E9%A6%99%E5%A5%88%E7%BE%8E%E5%88%9D%E8%AF%86%E5%89%A7%E6%83%85%E3%80%8A%E4%B8%8D%E5%8F%AF%E6%80%9D%E8%AE%AE%E7%9A%84%E5%81%B6%E9%81%87%E3%80%8B) | pledge | T1–T6 候选 | 2 场／61 行 | 说话人未结构化；无日期 |
| SRC-O-S02 | [羁绊剧情1：回归演唱会](https://wiki.biligame.com/klbq/%E5%89%A7%E6%83%85%E6%95%85%E4%BA%8B/%E9%A6%99%E5%A5%88%E7%BE%8E%E7%BE%81%E7%BB%8A%E5%89%A7%E6%83%85%E3%80%8A%E5%9B%9E%E5%BD%92%E6%BC%94%E5%94%B1%E4%BC%9A%E3%80%8B) | pledge | T1–T6 候选 | 4／110 | 解锁条件缺失；说话人未结构化 |
| SRC-O-S03 | [羁绊剧情2：嘈杂的声音](https://wiki.biligame.com/klbq/%E5%89%A7%E6%83%85%E6%95%85%E4%BA%8B/%E9%A6%99%E5%A5%88%E7%BE%8E%E7%BE%81%E7%BB%8A%E5%89%A7%E6%83%85%E3%80%8A%E5%98%88%E6%9D%82%E7%9A%84%E5%A3%B0%E9%9F%B3%E3%80%8B) | pledge | T1–T6 候选 | 3／87 | 同上 |
| SRC-O-S04 | [羁绊剧情3：静音模式](https://wiki.biligame.com/klbq/%E5%89%A7%E6%83%85%E6%95%85%E4%BA%8B/%E9%A6%99%E5%A5%88%E7%BE%8E%E7%BE%81%E7%BB%8A%E5%89%A7%E6%83%85%E3%80%8A%E9%9D%99%E9%9F%B3%E6%A8%A1%E5%BC%8F%E3%80%8B) | pledge | T1–T6 候选 | 3／94 | 同上 |
| SRC-O-S05 | [羁绊剧情4：从过去传来的回声](https://wiki.biligame.com/klbq/%E5%89%A7%E6%83%85%E6%95%85%E4%BA%8B/%E9%A6%99%E5%A5%88%E7%BE%8E%E7%BE%81%E7%BB%8A%E5%89%A7%E6%83%85%E3%80%8A%E4%BB%8E%E8%BF%87%E5%8E%BB%E4%BC%A0%E6%9D%A5%E7%9A%84%E5%9B%9E%E5%A3%B0%E3%80%8B) | pledge | T1–T6 候选 | 2／125 | 同上 |
| SRC-O-S06 | [羁绊剧情5：全新的主打歌](https://wiki.biligame.com/klbq/%E5%89%A7%E6%83%85%E6%95%85%E4%BA%8B/%E9%A6%99%E5%A5%88%E7%BE%8E%E7%BE%81%E7%BB%8A%E5%89%A7%E6%83%85%E3%80%8A%E5%85%A8%E6%96%B0%E7%9A%84%E4%B8%BB%E6%89%93%E6%AD%8C%E3%80%8B) | pledge | T1–T6 候选 | 1／15 | 内容短；需确认是否完整 |
| SRC-O-S07 | [生日剧情：最初的祝福](https://wiki.biligame.com/klbq/%E5%89%A7%E6%83%85%E6%95%85%E4%BA%8B/%E9%A6%99%E5%A5%88%E7%BE%8E%E7%94%9F%E6%97%A5%E5%89%A7%E6%83%85%E3%80%8A%E6%9C%80%E5%88%9D%E7%9A%84%E7%A5%9D%E7%A6%8F%E3%80%8B) | event | T2,T3,T5,T6 | 3／20 | 具体年份、版本缺失 |

小计：7 个故事、18 场、512 行。所有剧情均为 `material_type=story`、`language=zh-CN`；原始行仍需拆分角色本人、旁白、引航者选项和媒体文件标记。

## C. 语音与音乐

| source_id | 标题 | URL | material_type / canon_context | language | 轨道 | 本地数量及语言标记 | 核验缺口 |
|---|---|---|---|---|---|---|---|
| SRC-A-01 | 对局语音 | V | voice / battle | mixed | T2,T3,T4 | 350：zh 114、ja 104、en 114、未标 18 | 无转写、场景；语言版本不齐 |
| SRC-A-02 | 世纪歌姬时装语音 | V | voice / skin | mixed | T2,T3 | 248：zh 83、ja 82、en 83 | 日语少 1；不得覆盖基础人格 |
| SRC-A-03 | 宿舍语音 | V | voice / dorm | mixed | T1,T2,T3 | 179：zh 72、ja 65、en 5、未标 37 | 语言分布不齐；无说话对象 |
| SRC-A-04 | 系统播报语音 | V | voice / system（待核） | mixed | T3,T4 | 151：ja 70、未标 81 | 需判断是否应再拆 system/battle |
| SRC-A-05 | 花的私语时装语音 | V | voice / skin | zh-CN | T2,T3 | 14：均带 CN 标记 | 缺其他语言；时装限定 |
| SRC-A-06 | 相关音乐 | M | song / mixed（待拆） | mixed/unknown | T1,T3 | 10 个角色曲、BGM、伴奏 | 非全为歌曲；无歌词、字幕、日期 |

语言数量只来自文件名标记，不代表完成回听：明确 zh-CN 283、ja-JP 321、en 202、未标记 146。全部 952 个 MP3 均有本地镜像，但当前没有可靠的转写、时间戳、版本、对话对象或统一语言字段。

## D. 主页面与画廊视觉单元

| source_id | 材料单元 | URL | material_type / canon_context | 轨道 | 数量 | 使用限制 |
|---|---|---|---|---|---:|---|
| SRC-M-01 | 超弦体设定 | M | setting / base | T1,T5,T6 | 2 图 | 没有设定正文 |
| SRC-M-02 | 游戏表情 | M | visual / base | T3 | 17 | 只作非语言参考 |
| SRC-M-03 | 香奈美 B 站装扮表情 | M | visual / event | T3,T5 | 15 | 宣传情境 |
| SRC-M-04 | 官方表情 | M | visual / base | T3 | 9 | 不可单独推导人格 |
| SRC-M-05 | 角色技能 | M | setting / battle | T4,T6 | 4 图 | 没有技能正文；数值不作人格证据 |
| SRC-M-06 | 超弦体时装 | M | visual / skin | T3,T5,T6 | 75 | 多时装混合；不得覆盖基础人格 |
| SRC-M-07 | 印迹 | M | visual / base | T1,T5,T6 | 13 | 图像索引 |
| SRC-M-08 | 弦能增幅网络 | M | setting / battle | T4,T6 | 9 | 图像索引 |
| SRC-M-09 | 超弦体武器 | M | setting / battle | T4,T6 | 1 | 不能单独证明武器选择动机 |
| SRC-M-10 | 更新改动历史 | M | setting / event | T6 | 41 图 | 无结构化版本文本 |
| SRC-M-11 | 相关剧情壁纸 | M | story / event | T5,T6 | 2 | 仅定位《金树的乐章》《甜梦游乐园》 |
| SRC-G-01 | 时装官宣图 | G | visual / skin | T3,T5,T6 | 32 | 视觉／宣传证据 |
| SRC-G-02 | 壁纸 | G | visual / base | T3,T5 | 18 | 情境混合 |
| SRC-G-03 | 节日贺图 | G | visual / event | T3,T5,T6 | 6 | 日期未结构化 |
| SRC-G-04 | 角色官宣图与设定图 | G | visual / base | T1,T5,T6 | 3 | 图片文字未抽取 |
| SRC-G-05 | 日历 | G | visual / event | T3,T5,T6 | 2 | 年份需从图片核对 |
| SRC-G-06 | 移动端壁纸 | G | visual / base | T3,T5 | 2 | 纯视觉 |
| SRC-G-07 | 剧情 CG | G | story / event | T2,T5,T6 | 1 | 无对应剧情正文 |

以上 WIKI 部分共 46 条候选材料单元，覆盖 11 个具体 `sourcePage` URL。

## E. 卡拉彼丘官方 B 站视频

状态：`DETAIL_VERIFIED_WITH_PLATFORM_LIMITS`。账号 UID `660091334` 的公开卡片接口返回 `official_verify.type=1`、`official_verify.desc=卡拉彼丘官方账号`。下列详情页均已于 2026-08-14 核验 `owner.mid=660091334`、`owner.name=卡拉彼丘`。

| source_id | 标题及 URL | published_at | 时长 | material_type / canon_context | 重要度 | Gate A 状态 |
|---|---|---|---:|---|---:|---|
| SRC-B-01 | [香奈美主题曲「你看世界好美」](https://www.bilibili.com/video/BV1W2421L7wT/) | 2024-01-30 | 02:25 | song / base | 5 核心 | 官方详情已核；主题、声线、价值意象候选，歌词不整段保存 |
| SRC-B-02 | [萌萌香香的香奈美](https://www.bilibili.com/video/BV1HZ421g71j/) | 2024-06-10 | 01:22 | pv / dorm | 5 核心 | 官方详情已核；宿舍日常与引航者互动候选 |
| SRC-B-03 | [香奈美传说时装·世纪歌姬｜展示 PV](https://www.bilibili.com/video/BV12JDGYLEsT/) | 2024-11-06 | 01:32 | pv / skin | 4 高 | 官方详情已核；时装世界线单独分轨 |
| SRC-B-04 | [《你看世界好美》日文复现｜美しい世界へ](https://www.bilibili.com/video/BV1AnoPYNEiL/) | 2025-04-16 | 04:04 | song / base-language-variant | 4 高 | 官方详情已核；用于中日声线与语义差异核对 |
| SRC-B-05 | [香奈美传说时装“心之奏鸣”主题曲｜Cuter Me](https://www.bilibili.com/video/BV1d93p69EKU/) | 2026-07-30 | 03:08 | song / skin | 5 核心 | 官方详情已核；P1 中文、P2 日文，各约 01:34 |
| SRC-B-06 | [香奈美传说时装·心之奏鸣｜展示 PV](https://www.bilibili.com/video/BV1TwGA6XEhK/) | 2026-08-02 | 02:42 | pv / skin | 4 高 | 官方详情已核；偶像观主题候选，不能覆盖基础人格 |
| SRC-B-07 | [2026 线下嘉年华精彩回顾](https://www.bilibili.com/video/BV1m7um6BEgB/) | 2026-08-09 | 05:55 | event / public_idol（待核） | 2 条件 | 官方详情已核，但标题、简介和分 P 未证明含香奈美；需观看后决定是否保留 |

六条直接相关视频均为 `language=zh-CN/mixed`、`publisher=卡拉彼丘官方账号`、`accessed_at=2026-08-14`。具体字幕状态、台词说话人和时间戳留到 Gate B 前的视频处理阶段核验。

### 已筛查的低优先级官方视频

以下详情页也确认属于官方账号，但当前元数据只证明时装短暂出镜、版本宣传或周边展示，暂不计入六轨正史主样本：

| BV | 标题 | 日期 | 时长 | 当前处理 |
|---|---|---|---:|---|
| BV1hCKw6VE2i | 新赛季“暗帷迷踪” | 2026-07-19 | 02:54 | 心之奏鸣时装预告；后续仅核出镜时间戳 |
| BV1NdQwB5EFi | 新版本 4 月 14 日开启 | 2026-04-11 | 02:16 | 晴香瑰夏时装短暂宣传 |
| BV1yqPmzTEzW | 新赛季“长廊追迹” | 2026-03-09 | 02:01 | 朝颜鹤语时装短暂宣传 |
| BV1tCFKz7EEH | 香奈美“花的私语”手办展示 | 2026-02-03 | 00:46 | 周边视觉材料，不作人格证据 |
| BV13LtUzyE49 | 2025 线下嘉年华精彩回顾 | 2025-08-08 | 01:29 | 元数据未证明香奈美为重要角色 |
| BV1LjSqYhE7a | 第八赛季“蚀刻迷局” | 2024-10-30 | 01:41 | 世纪歌姬前瞻；只作版本定位 |

检索线索“Be Shining”只找到非官方 UID `1304841421` 的投稿，未进入正史清单。`Kanami`、`香奈美+剪刀手`、`卡拉彼丘+明`、精确“回归演唱会”未获得 UID `660091334` 的直接命中。

## F. 非正史视觉二创候选

| source_id | 本地路径 | 数量 | 用途 | 禁止事项 |
|---|---|---:|---|---|
| AUX-VIS-001 | `../../../../../../KanamiBot/data/advanced_media/香奈美/files/` | 739 原件 | 后续封面、图标或视觉二创候选 | 不作为正史台词、行为或人格证据；不复制带 QQ／群号的元数据；出处不明素材不重新分发 |

该辅助项不计入正史 source record 数量。

## Gate A 已知缺口与阻断项

1. WIKI 主页面 JSON 是媒体索引，不是完整 HTML；基础身份、简介、观测语录等正文仍需打开具体页面核对。
2. 已展开官方空间 7 个常规系列共 49 条，并完成关键词与详情页复核；但 B 站全投稿接口返回 `-799`、`-352` 或 HTTP 412，无法证明账号投稿绝对全量。该限制已显式保留，不能把“未检出”写成“不存在”。
3. 剧情行不是结构化对话；需二次解析并人工区分角色本人、旁白和玩家选项。
4. 语音只能按文件名初步识别语言；146 项未标记，多语言数量也不对称。
5. `res/WIKI/story_wallpapers.json` 有 66 项，而 `local-server/files/WIKI/story_wallpapers.json` 有 95 项，存在镜像漂移。
6. `local-server/files/WIKI/oath_texts.json` 是空对象；文本候选必须使用 `res/WIKI/oath_texts.json`。
7. 目录级六轨映射只是候选；Gate B 前仍需逐段区分正史直接证据、合成结论、角色推演和未知。

## Gate A 判定

- 当前结论：`READY_FOR_USER_CONFIRMATION`
- 当前正史候选：46 条本地 WIKI／游戏材料单元 + 6 条直接相关官方视频。
- 条件候选：1 条官方嘉年华回顾，需用户决定是否在 Gate B 前观看核实。
- 平台限制：官方账号的绝对全投稿列表不可完整证明；现有清单以 7 个常规系列、关键词检索与具体详情页核验为边界。
