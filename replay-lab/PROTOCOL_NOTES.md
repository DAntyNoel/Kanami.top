# 样本协议核验笔记

适用原文件 SHA-256：`9a0539e78b744a1b0904b45e3ff41e934d351263ef056fd0173b6428eb4bd180`。以下区分已采用的解码和未采用的假设；不据此宣称支持其他游戏版本。

## 控制器朝向：已采用

`CompressedControllerRotation` 为 32 位，小端低 16 位是有符号偏航，高 16 位是有符号俯仰，除以 10 得到度数。必须保留符号；直接使用 `uint16 × 360 / 65536` 不符合独立字段。

验证证据：

- 全部 163,525 条记录可从角度重新编码为原始 32 位值。
- 66,137 组同 Actor、同帧的非零 `RemoteViewPitch` 对照全部在 1.4059° 以内；旧引擎网络版本 14 的字节量化间隔为 360/255°。3,036 组 RemoteViewPitch=0 单独计数，其中存在回合重置，未纳入角度关联断言。
- 身体偏航与控制器偏航并非始终相同：151,132 组同帧对照的绝对角差中位数约 0.58°，部分状态有较大分离。因此网页分别保存并显示身体朝向和瞄准方向，不用其一覆盖另一项。
- 诺拉、伊薇特的召唤物也复制此属性。拥有者关系不能充当角色本体关系；网页只使用当前角色出场区间内的瞄准记录，其余记录保留在 `aim.csv`。

这些检查可通过 `verify_replay.py` 重跑。精确整数、来源位偏移和完整原字段用于后续版本核对。

## 生命与护甲：通过字段校验值恢复

UE 的 CompatibleChecksum 逐层纳入父属性名、C++ 类型、结构成员名与静态数组索引。依照该算法，对 `FGameplayAttributeData` 的两个 float 成员分别回算，得到下表；全部八个导出字段与原录像精确相等。因此这四项的语义不再依赖属性曲线推测。

| 属性 | BaseValue handle / checksum | CurrentValue handle / checksum |
| --- | --- | --- |
| Health | 2 / 674980314 | 3 / 1941375516 |
| HealthMax | 4 / 761730184 | 5 / 3309114295 |
| Armor | 6 / 2482061864 | 7 / 1641239401 |
| ArmorMax | 8 / 1057181181 | 9 / 538822671 |

实现只对 `/Script/PMGame.CyCharacterAttributeSet` 中实际匹配校验值的字段命名，不固定依赖 handle。网页仅使用对应玩家 PlayerState 自身的 CurrentValue；拥有者关联的召唤物属性不纳入玩家血条。数据尚未收到时保留未知，数值零不等同于已经死亡。

算法依据：[Epic 的 RepLayout 实现镜像](https://github.com/folgerwang/UnrealEngine/blob/release/Engine/Source/Runtime/Engine/Private/RepLayout.cpp#L292)、[FCrc::StrCrc32 实现镜像](https://github.com/folgerwang/UnrealEngine/blob/release/Engine/Source/Runtime/Core/Public/Misc/Crc.h#L23)。`verify_combat.py` 对照原录像校验值并覆盖不匹配拒绝、handle 移动和召唤物隔离。

## 自定义逐命中伤害：尚未采用

`CyLifeComponent:MulticastDamageEventData.EventData` 的完整结构尚未确定。已探索 3,515 条可关联玩家的调用，其中 2,534 条具有字节前缀 `000000000400000000000000`。对这部分记录，零基位偏移 98 的 16 位无符号整数除以 100，与许多独立属性扣减吻合。

例如同类连续两次调用各读到 21，而随后属性一次下降 42；单次调用读到 42 时，两个属性分别下降约 34 和 8。在用前后 160 ms 无其他同目标调用筛选出的 752 条带属性下降记录中，固定偏移候选有 560 条与下降总量误差小于 0.02。

这仍不足以证明通用编解码：不同技能存在更短的前缀，可选分项会改变长度；剩余位段的含义、过量伤害和部分属性合并同步尚未确定。因此没有把该偏移写成生产解码规则，也没有把候选量标为逐发真实伤害。当前导出仍提供对象参数、原始位串、累积统计和独立属性更新，以便继续验证。

## 弦化持续状态：通过命名目标标签交叉验证

录像的 `NetworkGameplayTagNodeIndex` 导出组含明确的 `State.Shape.2D.Side`、`State.Shape.2D.Flying`、`State.Shape.2D.Wall` 和 `State.Shape.3D`。按 UE 回放分支读取标签容器：1 位空标记、非空时 6 位数量、逐项 `SerializeIntPacked` 导出索引；不能将每项当作固定 uint16。3,226 个源/目标标签容器均精确消耗完整位数，五个无效索引为引擎的 65535 哨兵。

只将目标标签与同一玩家当前角色本体的最近移动模式对照；源标签可能描述另一来源对象或效果施加时的快照，不能据此改写目标状态。

| 命名目标标签 | 对应移动模式 | 同步对照 |
| --- | --- | --- |
| `State.Shape.2D.Side` | 19 | 151 / 156 |
| `State.Shape.2D.Flying` | 20 | 111 / 112 |
| `State.Shape.2D.Wall` | 21 | 30 / 31 |
| `State.Shape.3D` | 0 / 1 / 3 | 1,223 / 1,226 |

两路同步存在少量不一致，因此标签用于确认模式含义，不将标签快照时间当作精确形态切换时间。网页按角色本体的 `ReplicatedMovementMode` 同步时间维持形态：19/20/21 显示竖椭圆，其余或未知显示圆形；死亡、出场结束和新角色均隔离旧状态。进入、持续和退出不依赖技能波纹的 650 ms 时限或激活次数。`GA_Shared_Side/Fly/Wall` 对应的弦化动作均不绘制激活波纹，解除弦化也只恢复形态；其他能力保留波纹，不使用名称子串批量屏蔽。

这些映射仅基于当前游戏版本样本。`python replay-lab/verify_shape.py <decoded目录>` 可重跑命名标签对照；网页检查覆盖持续、退出、倒退、死亡、召唤物和角色出场隔离。

序列化依据：[Epic 的 GameplayTagContainer 实现镜像](https://github.com/folgerwang/UnrealEngine/blob/release/Engine/Source/Runtime/GameplayTags/Private/GameplayTagContainer.cpp#L908)，包括 `FGameplayTag::NetSerialize_Packed` 的 InternalAck 回放分支。

## 回合阶段与胜利判定

原容器的 16 条 `BombRound` 是现有回合标记；其附近有全局 `CyGMachine.SyncStateData` 的 139 位同步。每回合均出现前 96 位为 9 的记录，随后转为前 96 位为 10 的记录，后者晚于标记 34.769–35.031 秒。模块只识别这些完整位宽、签名和相邻转换，不据此声称整个自定义状态机已经解码。正式开始取后者的实际时间，标明“推定”；缺失、未知或不相邻时不补固定时间。解除屏障的语义仍未独立确认。

16 条非空 `CyGameState:MulticastWinnerTeam` 通知均带胜方和原因参数，同帧还有 `WinnerTeams` 与 `RoundResult` 属性。另有 15 条空通知用于清空胜方，不能重复记作回合结束。胜方数组按 UE 兼容复制数组读取：packed 数量、元素索引、导出子字段 handle、位长、8 位队伍编号和结束符；只接受完整的当前双队伍布局，未知或不完整内容保留原始记录。16 条 RPC 的队伍编号全部与独立 `WinnerTeams` 复制属性一致，结束原因编号保留而不猜测文字含义。

全部 184 条相关原始记录已回查源文件位区间。第 1 回合标记为 00:53.794，正式开始候选为 01:28.805，胜利通知为 02:11.498。全局 Actor 的状态与通知不属于任何个人；导出使用空 UID，防止 RPC 的 PlayerState 参数污染归属后误标为某位玩家的事件。

回合比分从容器编号为 1 的回合开始，按每回合唯一、非空且只含一方的已确认胜利通知累计。`rounds[].score_before/score_after` 与事件内同名快照均按 `[蓝方, 金方]` 排列；不会将 `TeamScores` 当作回合比分，不因空通知清零，也不重复计算同回合通知。若回合编号不是从 1 连续开始，或前序回合缺少结果，则后续累计比分为未知。当前所有玩家的 `AttributeTeamID` 均保持不变；16 次结果累计为蓝方 7 : 9 金方。网页结束前使用本回合前的比分，结束后才使用判定后比分，倒退时重新按时间选择快照。

`verify_rounds.py` 覆盖缺失/未知状态、实际时间、对象隔离、空与重复通知；`verify_replay.py` 核对原始位数据、阶段边界和独立胜方属性。网页的关键事件、回合阶段筛选及阶段标记均使用这些记录；较旧的 playback.json 不会在浏览器中凭时间推造阶段。

## 暂不能建立的语义

- 除已通过校验值识别的四项外，重复 `CurrentValue/BaseValue` 仍按组、对象和 handle 标识。属性曲线的形态不能替代属性名元数据。
- 自定义 `SyncStateData/SyncSwitchData` 的字段结构仍未完全确定；能力激活本身也不能用来推定持续状态的结束。弦化显示仅使用上文已交叉验证的角色移动模式。
- 未映射块和跨包区间全部保留。后续应从 NetGUID outer、导出组和真实对象生命周期继续定位，避免用近似同名组强行读取。
