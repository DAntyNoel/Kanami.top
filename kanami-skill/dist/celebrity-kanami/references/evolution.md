# 演进与回滚协议

只在用户明确要求新增官方材料、更新、安装新版本或回滚时使用本协议。不要在普通角色对话中自动修改 Skill。

## 原则

1. 在新的 staging 目录构建，不原地编辑已安装包。
2. 先保存并验证当前 manifest 快照，再处理新材料。
3. 把研究工作区与正式包分开；raw、source-records、完整审计和长媒体文本不进入安装包。
4. 只接纳可确认来自官方的设定、游戏文本、语音或官方影像作为正史候选；二创资产始终 `canon_evidence=false`。
5. 对旧结论做追加式 Correction Log，不静默覆盖旧时间线或旧证据。

## 登记新材料

为每个材料单元记录：

- 唯一 source_id、标题、具体 URL、本地路径、发布者、发布日期／版本和访问日期。
- material_type、canon_context、主／次路由、语言、时间线阶段、场景、角色与对话对象。
- 释义化 evidence、独立 inference、冲突／缺口、状态和 `canon_evidence`。

区分 base、pledge、event、skin 与现实发布时间。音频、视频或字幕只有在实际回听／观看并记录时间戳后才能提升内容证据；标题和文件名不能替代内容核验。

## 重新合成

1. 先验证 source-record schema 和来源清单一致性。
2. 只重跑受影响的六轨研究；保留未受影响的稳定结论。
3. 检查新材料是否反驳、收窄或升级现有心智模型；不要为了固定数量制造模型或张力。
4. 更新 Persona、关系矩阵、路由和 Interaction & Task 规则时，把所有新执行规则保持为 `IN_CHARACTER_INFERENCE`。
5. 重跑 Gate C 与 Gate D；若默认关系、pledge、S07、skin 或未知边界泄漏，停止构建。

## 验证新版本

1. 运行 source-record、Gate B、Gate C、Gate D 和 Gate E 验证器。
2. 使用 fresh agent 重新执行已知答案、匿名声线、六路由和四类正史边界测试；不要向测试者泄露标准答案、旧缺陷或预期修复。
3. 要求总分至少 85／100，正史准确性至少 22／25，未知诚实度至少 9／10，且无硬失败项。
4. 使用 `skill-creator` 的 `quick_validate.py` 验证正式 Skill；检查 `agents/openai.yaml` 与 `SKILL.md` 仍一致。
5. 生成新的内容 manifest，拒绝绝对路径、`..`、额外文件、reparse point、大小或 SHA-256 不符。

## 安装与回滚

- 安装前验证 incoming 包，并把当前目标保存到独立 backup root。
- 首次安装也保存按完整 manifest SHA-256 命名的快照。
- 只用同卷 staging 和目录换名切换版本；切换后再次验证目标。
- 回滚必须指定完整 64 位 snapshot id；先验证备份，再替换目标。
- 安装或切换验证失败时保持／恢复原目标，不把半成品当成当前版本。

若开发工作区提供 `workspace/scripts/skill_package.py`，使用其 `build-manifest`、`verify`、`install` 和 `rollback` 子命令；否则实现等价的内容哈希、精确目标校验和可恢复目录切换，不使用不受控的递归覆盖。
