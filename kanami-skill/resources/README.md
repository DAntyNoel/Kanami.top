# 香奈美 Skill 蒸馏资源与交付清单

> 盘点日期：2026-08-14
> 当前状态：Gate E `PASS`，正式 Skill 已安装并保存内容寻址回滚快照。

## 本轮结果与边界

- 已建立 53 条 source record，其中 21 条 `accepted`、32 条 `candidate`；六轨研究、Gate C 心智模型、Gate D Persona／Work 契约和 Gate E 样例均已完成。
- Gate E `run-2026-08-14-06` 最终得分 97.00／100，正史准确性 24.25／25、表达 DNA 18.50／20、未知诚实度 9.25／10，硬失败为 0。
- 正式包版本为 `1.0.1`，位于 `../dist/celebrity-kanami/`，最终 manifest 为 `ee58565ea23f2e368f857b64f4059ad55a4c2bf6a2d919dd3a0e3bef36188cf5`。
- 已安装到 `$CODEX_HOME/skills/celebrity-kanami`；同 manifest 的回滚快照保存在 `$CODEX_HOME/skill-backups/celebrity-kanami/`。
- 未全局安装上游 `dot-skill`；上游只用于只读结构参考，正式包按 Codex `skill-creator` 规范初始化、验证和安装。
- 大体积 WIKI 与 KanamiBot 资源继续保留在原位置，避免重复占用仓库空间和制造易漂移副本。
- 正式包未包含视觉素材：现有表情包可作用户授权的二创候选，但当前没有候选同时具备已确认的再分发来源与权利边界。

## 规划文件

- `../香奈美-dot-skill-详细蒸馏计划.md`
- 仓库副本与用户提供的源文件 SHA-256 一致：`AEF0713F9D2F42BE7A05262ECBA2C759824C40DA55F15CBE96B2BFAA0328126A`

## WIKI 结构化资料

首选索引目录：`../../res/WIKI/`

| 文件 | 当前内容 | 后续用途 |
|---|---:|---|
| `oath_texts.json` | 5 个顶层分区 | 含 9 组／177 条通讯、7 个故事／18 个场景／512 行记录、5 篇角色小传和 1 封回归信；正式研究时仍需逐条标注场景、版本和证据边界 |
| `audio.json` | 952 条远端资源映射 | 其中 942 条来自语音台词页、10 条为相关音乐；回听后再提取表达 DNA |
| `emotes.json` | 41 条表情资源映射 | 官方 WIKI 视觉上下文和二创候选，不单独作为人格结论 |
| `outfits.json` | 75 条时装资源映射 | 仅进入 `skin` 情境，不能覆盖基础人格 |
| `story_wallpapers.json` | 66 条剧情壁纸映射 | 辅助定位剧情场景与时间线 |
| `character.json`、`imprints.json`、`skills.json`、`weapons.json`、`amplification_network.json`、`update_history.json` | 结构化资源映射 | 设定核对与补充索引；技能数值不默认作为人格证据 |

对应的本地二进制缓存位于 `../../local-server/files/WIKI/`，当前共 1,331 个文件、约 527.46 MiB，其中媒体文件包括 952 个 MP3、245 个 PNG、98 个 JPG 和 22 个 GIF。后续应通过上述 JSON 的 `sourcePage`、远端 URL 和标题定位文件，不应整库再次复制进 `kanami-skill`。

`../../local-server/files/WIKI/oath_texts.json` 当前仅为 `{}`，文本研究必须使用 `../../res/WIKI/oath_texts.json`，不能误读本地镜像中的空占位文件。

注意：结构化 WIKI 快照包含较长剧情和台词原文。正式产物只保留释义化证据、必要短引文和可复核锚点，不复制长歌词、完整字幕或大段剧情。

## KanamiBot 香奈美视觉素材

本地素材目录：`../../KanamiBot/data/advanced_media/香奈美/`

- `files/`：739 个原始文件，约 485.96 MiB。
- `thumbs/`：739 个缩略图，约 10.38 MiB。
- `index.json`、`metadata.json`：KanamiBot 媒体索引，仅在原位置读取，不复制到 Skill 目录；其中元数据含群号、QQ 等标识字段，不得带入蒸馏产物或提交到仓库。

这些素材按用户授权可作为后续视觉二创候选，但它们与正史研究严格分轨：

1. 不把表情包文字、构图或二创情境当作正史台词和人格证据。
2. 具体选材时记录原文件编号、来源信息、用途和生成/编辑链路。
3. 未确认出处或权利边界的素材不对外重新分发。
4. 正式 Skill 的人格结论只引用计划规定的官方设定、游戏文本、官方影像及可核对 WIKI 入口。

## 当前研究缺口

- 人工音频回听 0；不得声称准确声线、停顿、笑声或战斗台词。
- 六个核心 B 站视频完整观看 0；已核的只是官方页面、标题、日期、时长和 owner。
- 音频索引存在 145 条语言元数据冲突。
- `pledge_intimate` 默认关闭，S07 保持独立 event，skin 不覆盖 base，`SRC-B-07` 保持 `canon_evidence=false`。

## 后续演进入口

新增官方材料时不要直接改已安装包。按 `../dist/celebrity-kanami/references/evolution.md` 新建 staging 版本，登记来源、版本、上下文和证据标签，只重跑受影响研究轨道，再执行全部相关门禁、fresh forward-test、manifest 校验、快照保存与安装；任何失败都回到上一份已验证 manifest。
