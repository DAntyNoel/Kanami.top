# 卡拉彼丘 · 录像回放

从卡拉彼丘 `.replay` 中恢复网络记录、玩家移动、朝向、属性、技能和事件，并在纯静态网页中重建二维战术回放。解析器与静态服务只依赖 Python 3.10+ 标准库，播放器无需 npm 或构建工具。

界面参考弦录播放器，使用深色三栏布局：左侧玩家名册、中间回放画布、右侧动态/状态详情/数据说明，底部固定时间轴与播放控制。该工具使用客观功能文案，不使用角色第一人称或宣传文案。

## 直接使用当前样本

从仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\replay-lab\start.ps1
```

打开 <http://127.0.0.1:8766/>。首次运行会生成解析文件，之后会复用原文件 SHA-256 和代码时间戳一致的产物。`-Rebuild` 可强制重新解析，`-ReplayFile` 可指定其他同格式录像，`-Port` 可换端口。原始录像保持不变。

当前录像：`_replay-inspection/20261015/1.18.3.7_751028091756896271_1791469576_3vhtlakx.replay`。输出：同目录的 `decoded/`。这些录像、玩家明细及约 1 GB 的展开数据由仓库现有忽略规则留在本机，代码单独提交。

## 分步运行

```powershell
python replay-lab/parse_replay.py <录像.replay> --out <输出目录>
python replay-lab/decode_replay.py <输出目录>
python replay-lab/serve.py --data <输出目录>/playback.json
python replay-lab/verify_replay.py <录像.replay> <输出目录> --url http://127.0.0.1:8766
```

`serve.py` 默认只监听 `127.0.0.1`。它只映射列明的 HTML、JS、CSS、两张站点图片和指定的 `playback.json`；无目录列表、任意文件下载或维护接口。`/health` 仅返回 `{"status":"ok"}`。

独立静态部署包可以导出至一个空目录，然后用任意静态服务器提供服务：

```powershell
python replay-lab/serve.py --data <输出目录>/playback.json --export <空的静态目录>
```

导出的页面包含选定录像的昵称、游戏 UID 和详细游戏行为，选择公开目录时应只放计划分享的这份导出包。网页右上角也可本地导入另一份 `playback.json`；文件只在浏览器内读取。

## 可读文件

| 文件 | 内容 |
| --- | --- |
| `manifest.json` | 原文件哈希、引擎/网络版本、全体分块、帧/包/字段计数 |
| `events.json` | 录像容器的回合、出生、受伤、死亡事件，保留 metadata 原顺序 |
| `packets.jsonl` | 每帧时间、原文件偏移、帧长与数据包数 |
| `netfields.json` | 403 组导出字段与 checksum，字段编号从 0 开始 |
| `netguids.json`、`object-types.json` | 对象名称、outer 关系、类型关联 |
| `actors.json` | Actor 的生成/关闭、角色原型和生成位置、朝向、速度 |
| `properties.jsonl` | 所有命名属性、RPC 参数、未知块的精确原始位数据 |
| `decoded-properties.jsonl` | 已解出的数值、字符串、对象引用、向量及采用的编码 |
| `movement.csv` | 原始频率的角色 XYZ、身体朝向、俯仰、速度及玩家 UID |
| `aim.csv` | 控制器偏航/俯仰、原始 uint32、所属玩家和来源位偏移，包含召唤物等对象 |
| `ability-effects.jsonl` | 技能列表和持续效果的 FastArray 增量，包括增删编号及字段 |
| `timeline.json` | 事件、具体能力激活、攻击/伤害/投掷物/救援调用、累计伤害增量 |
| `playback.json` | 浏览器使用的自包含回放数据；每名玩家的位置、角色变化、属性时间线 |
| `combat-report.json` | 生命/护甲字段的校验值识别、属性同步和伤害调用关联统计 |
| `round-report.json` | 正式开始候选、已确认胜利判定和清空胜方通知的数量 |
| `field-stats.json` | 各组、字段、位宽的出现次数 |
| `errors.json`、`decode-report.json` | 协议错误、值解码失败、覆盖统计 |
| `verification.json` | 针对原文件和当前产物的独立完整性验收 |

JSONL 每行一条 JSON，适合逐行分析，避免一次加载数百 MB。`CurrentValue`、`BaseValue` 等名称在一个属性组中重复；必须使用 `(group, handle, object)` 标识字段，不能只用名称覆盖。

`source_bit` 是原文件中的位偏移；跨包字段没有单一连续偏移，此时为 `null`，使用 `source_spans` 按顺序拼接。每个区间均包含 `bit` 和 `count`，按小端、最低有效位优先读取。`raw` 最后一个字节的未使用高位补零，实际长度由 `bits` 确定。

## 恢复范围与证据

当前支持经过实际样本验证的文件版本 6、网络回放版本 14、引擎网络版本 14、flags=0、无压缩、无加密的 UE4.25 录像。其他配置明确拒绝，避免按错误协议输出看似有效的数据。

- 按容器长度、帧、Packet、Bunch、partial Bunch、NetGUID、Actor 和 RepLayout 层级解析。匹配组件实例名时标记 `component_name_alias`；优先使用完整 outer 路径，避免不同目录中同名角色/召唤物混淆。
- 角色 `ReplicatedMovement` 按位置 ×100、8 位旋转、整数速度解码，初始坐标与独立生成信息相符。坐标单位是 Unreal 厘米，X/Y 为平面、Z 向上。播放器保留原始采样，短间隔插值，跨角色、长间隔和超过 450 cm 的跳变不插值。
- 身体朝向来自 `ReplicatedMovement`；独立瞄准来自 `CompressedControllerRotation`，样本验证为低 16 位有符号偏航、高 16 位有符号俯仰，均为十分之一度。163,525 条记录可无损回编码；66,137 组同帧非零 `RemoteViewPitch` 对照的最大角差为 1.4059°，符合旧协议的字节量化误差。网络版本 14 的 `RemoteViewPitch` 使用 `byte × 360 / 255`。零值重置帧单列，未作为关联证据。原整数保留在 `aim.csv` 中。
- `playback.json` 的 `aim_samples` 独立于移动采样，列顺序见 `aim_columns`。只纳入玩家角色有效出场区间，排除拥有者关联的召唤物。网页仅用视野扇形显示方向，优先使用最近收到的控制器瞄准方向，缺失时回退为身体朝向；扇形角度和距离仅为显示示意，不表示实际可见范围。身体朝向、瞄准长线和开火方向闪线均不绘制，原始方向数据仍保留在导出和状态详情中。
- 技能激活由 `MulticastNotifyAbilityActivated.Handle` 联结同玩家的 `ActivatableAbilities`，再通过 NetGUID 得到真实能力路径。共享动作、角色 Q/X/被动都保留原名称。激活不代表持续状态已确认结束。
- 弦化期间玩家标记保持竖椭圆，恢复三维后变回圆形。形态来自当前角色本体的移动模式同步，19/20/21 已与录像命名标签中的侧身/飘飞/贴墙交叉验证，不用固定时长或激活次数推算；死亡、角色更换和倒退跳转均按时间重建。侧身不再产生激活波纹，飘飞、贴墙和其他能力继续保留圈状波纹。具体证据与版本限制见 [协议核验笔记](PROTOCOL_NOTES.md)。
- `ActiveGameplayEffects` 保留完整增删及效果字段。武器弹药、移动模式编号、觉醒等级、击杀/死亡/助攻、累计伤害和原始状态机数据可按时间查看。生命、生命上限、护甲、护甲上限通过 UE CompatibleChecksum 精确匹配父属性名和类型后识别，八个 BaseValue/CurrentValue 字段均与样本导出值一致；其他属性仍保留编号。名册与画布显示血条，状态详情显示当前数值与累计伤害。没有收到数据时显示未知，不补造数值。
- 伤害调用包含受作用对象、InstigatedActor、DamageCauser、DamageTypeCDO 和原始 EventData。累计伤害增量单列，可能合并多次命中；不是逐发精确伤害。自定义 EventData 仍待恢复。
- 伤害筛选同时显示攻击者→目标、武器/技能类型，以及独立的生命/护甲属性同步。选择伤害调用可对照随后 200 ms 内同目标的属性变化；这些变化可能合并其他命中、治疗或效果，不作为该次调用的精确伤害。玩家本体与拥有者关联的召唤物、场景对象分开标识。`players[].vitals` 为玩家 PlayerState 自身属性，`attribute_semantics` 保存校验值依据；较早的 playback.json 仍可播放，但不能提供新血条。
- 样本全部 95 条 PlayerDeath 的 metadata 第一人都与 NumDeaths 增加对应，时间偏差不超过 127 ms，因此死亡事件标明受害者在前、攻击者在后。PlayerInjured 保留原组名，不擅自将全部记录视为精确扣血或击倒。
- 回合显示为准备、交战和结束。原 `BombRound` 标记用于准备起点；16 个正式开始候选来自全局 `CyGMachine` 实际状态切换，显示“推定”，不固定加 35 秒，解除屏障的含义尚未独立解码。16 次结束来自非空胜方通知，并用同帧 `WinnerTeams` 属性交叉核对胜方编号；15 次空通知只清空胜方，不产生结束事件。原调用与来源位偏移保留，全局通知不关联到个人。
- 进度条下方按同一时间比例分成回合开始、正式开始和胜利判定三行编号，共 48 个节点；点击任一编号会暂停、精确跳转并显示事件详情。胜利事件和悬停说明显示胜方及判定后比分，详情区列出判定前后比分。画布显示当前时刻的比分，结束前不提前显示本回合结果。比分根据从第 1 回合起连续、完整且唯一的胜利判定累计；缺失前序结果或回合编号断档时为未知。当前蓝、金队伍编号全程未变，最终回合胜场为蓝方 7 : 9 金方。

网页支持播放/暂停、0.25–16 倍速、时间拖动、回合跳转、选人跟随、平移缩放、六秒轨迹、事件筛选与参数检查。底图来自这份录像全场走位密度，与参考页采用的思路一致；它不是官方小地图，不代表墙体或碰撞。原录像不提供完整地图资源、人物模型、动画和技能特效，因此当前为战术回放重建。

## 验证

`verify_replay.py` 验证完整帧时间范围、全部玩家关联、死亡事件与计数对应、技能引用、控制器角度回编码和独立俯仰对照、随机间隔字段和所有跨包字段回溯原文件、二进制越界拒绝，并可测试 HTTP 白名单。另外检查生命/护甲字段校验值、玩家本体关联、原始属性值与死亡事件的归零对应；`python replay-lab/verify_combat.py` 运行字段识别和伤害关联边界测试。

`python replay-lab/verify_shape.py <输出目录>` 读取原始标签容器并核对命名形态与角色移动模式。网页验收另覆盖弦化持续、解除、倒退跳转、死亡、角色出场隔离和其他技能波纹保留。

`python replay-lab/verify_rounds.py` 检查原始阶段时间、缺失状态、对象隔离、未知布局拒绝、空通知和重复通知，以及比分快照、跨回合累加和缺失历史时的未知处理。完整验收另回查全部 184 条回合相关原始记录、胜方通知和独立复制属性的一致性，并用独立胜方历史重新累计比分。网页包含“回合阶段”筛选与三行跳转编号；倒退和跨回合跳转会重建阶段、计时与比分。旧版回放包仍可播放，需要重新解码才能提供新增阶段和比分记录。

网页 DOM 交互验证使用真实生成数据，覆盖加载、播放/暂停、±5 秒、回合跳转、选人、7 类事件筛选、参数显示、信息面板切换、多个回放时点和结束后重播。该检查模拟 Canvas，不替代浏览器截图和视觉验收。已另行使用真实浏览器检查画布渲染、播放、交互与手机宽度布局。

```powershell
cd replay-lab
npm ci
npm run verify:viewer -- ../_replay-inspection/20261015/decoded/playback.json
```

上述 npm 依赖仅用于开发验收。解析、静态导出和网页运行均不需要它。

## 协议参考

- [Unreal.Core 回放实现](https://github.com/Shiqan/FortniteReplayDecompressor/blob/76f74c1/src/Unreal.Core/ReplayReader.cs)，参考其 UE 网络归档协议和版本分支。`unreal_names.json` 提取自该项目的 UnrealNames 枚举；许可见 `THIRD_PARTY_LICENSE.txt`。
- [Epic 开发者对旧版 Pawn 俯仰压缩的说明](https://forums.unrealengine.com/t/serious-shot-replication-problem-video/60712/33)，结合上游网络版本枚举核对旧版 `RemoteViewPitch` 换算。自定义控制器角度的依据为本录像的独立字段对照，详见 [协议核验笔记](PROTOCOL_NOTES.md)。
- [用户给出的参考播放器](https://tango-orchid-green-juniper.grok.me/)，参考其时间线、玩家跟随和走位密度展示。工作目录保存的参考 `match.json` / `tracks.bin` 属于另一个房间；当前产物没有混用那场对局的位置或统计。
