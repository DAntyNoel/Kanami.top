#!/usr/bin/env python3
"""Build the 53 source records and apply the current Gate B research audit."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import re
from typing import Any

from validate_source_records import (
    load_schema,
    validate_record,
    validate_records_directory,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
WORKSPACE_ROOT = REPO_ROOT / "kanami-skill" / "workspace"
SKILL_ROOT = WORKSPACE_ROOT / "skills" / "celebrity" / "kanami"
MANIFEST_PATH = SKILL_ROOT / "knowledge" / "source_manifest.md"
OUTPUT_DIR = SKILL_ROOT / "knowledge" / "source-records"
SCHEMA_PATH = WORKSPACE_ROOT / "schemas" / "source-record.schema.json"
BILIBILI_EVIDENCE_PATH = (
    SKILL_ROOT / "knowledge" / "inventory" / "bilibili-evidence.json"
)
WEB_VERIFICATION_LOCAL_PATH = (
    "kanami-skill/workspace/skills/celebrity/kanami/knowledge/"
    "inventory/web-verification.json"
)
WEB_VERIFICATION_PATH = REPO_ROOT / WEB_VERIFICATION_LOCAL_PATH
AUDIO_ANALYSIS_LOCAL_PATH = (
    "kanami-skill/workspace/skills/celebrity/kanami/knowledge/"
    "inventory/audio-analysis.json"
)

ACCESSED_AT = "2026-08-14"
WIKI_PUBLISHER = "卡拉彼丘WIKI"
OATH_LOCAL_PATH = "res/WIKI/oath_texts.json"
BILIBILI_LOCAL_PATH = (
    "kanami-skill/workspace/skills/celebrity/kanami/knowledge/"
    "inventory/bilibili-evidence.json"
)
SOURCE_ROW_RE = re.compile(r"^\|\s*(SRC-[A-Z0-9-]+)\s*\|", re.MULTILINE)

TRACKS = {
    "T1": "writings",
    "T2": "conversations",
    "T3": "expression_dna",
    "T4": "decisions",
    "T5": "external_views",
    "T6": "timeline",
}


GATE_B_ENRICHMENTS: dict[str, dict[str, Any]] = {
    "SRC-M-01": {
        "status": "accepted",
        "context_router": {
            "primary": "public_idol",
            "secondary": "mission_volunteer",
        },
        "inference": [
            "公开优等生与私下轻度逗弄是情境切换线索，不能解释为真假人格。"
        ],
        "conflicts": [
            "页面没有标明资料对应的游戏版本或剧情节点，年龄 19 的快照不能为其他事件定年。"
        ],
    },
    "SRC-O-B01": {
        "status": "accepted",
        "timeline_phase": "childhood",
        "evidence_summary": [
            "oath::bio[0].paragraphs[0] 旁白描述物质条件优越但家庭关注不足；她以懂事、独立和不添麻烦适应，并在 12 岁主动报名偶像选拔。"
        ],
        "inference": [
            "童年的关注匮乏可能是后来重视被看见的形成因素；该关系需与训练和职业材料交叉解释。"
        ],
        "conflicts": [
            "这是官方小传旁白而非香奈美第一人称；没有出生年份或具体家庭事件日期。"
        ],
    },
    "SRC-O-B02": {
        "status": "accepted",
        "timeline_phase": "trainee",
        "evidence_summary": [
            "oath::bio[1].paragraphs[0] 记载星探回看她写满一页的报名表；她先追问邀请理由，数日后签约，接受三年训练，并在 15 岁以公开试镜第一名出道。"
        ],
        "inference": [
            "她并非只求关注，也在确认自己真实愿望被识别后愿意承担长期训练。"
        ],
        "conflicts": [
            "训练开始月份、公开试镜年份和同伴排斥细节缺少独立材料。"
        ],
    },
    "SRC-O-B03": {
        "status": "accepted",
        "timeline_phase": "idol",
        "evidence_summary": [
            "oath::bio[2].paragraphs[0] 记载选秀热度消退后，她持续训练、跑通告、参与商演和小角色，之后凭迷你专辑与《心海》逐步走红。",
            "同段旁白说明她学会辨认行业中的复杂关系，并能以笑容灵活应对敌意。"
        ],
        "inference": [
            "职业笑容同时可能是成熟能力与压力遮蔽机制；后者需结合羁绊剧情观察。"
        ],
        "conflicts": [
            "第一年与后续两年积累是否重叠不清，无法换算精确职业年表。"
        ],
    },
    "SRC-O-B04": {
        "status": "accepted",
        "timeline_phase": "preton",
        "context_router": {
            "primary": "vulnerable_reflective",
            "secondary": "mission_volunteer",
        },
        "characters_present": ["香奈美", "明", "普雷顿居民"],
        "evidence_summary": [
            "oath::bio[3].paragraphs[0] 记载巡演迫降普雷顿、短期义演及歌声唤起失忆居民记忆片段；她由此联想到自己曾被忽视的经历并提出协助。"
        ],
        "inference": [
            "个人的被忽视经验可能使她更快把共情转成承诺，但不能由这一事件推广为无条件冒险。"
        ],
        "conflicts": [
            "事故年份、停留日期和志愿承诺的正式程度未知。"
        ],
    },
    "SRC-O-B05": {
        "status": "accepted",
        "timeline_phase": "scissors",
        "context_router": {
            "primary": "vulnerable_reflective",
            "secondary": "mission_volunteer",
        },
        "characters_present": ["香奈美", "明", "剪刀手成员"],
        "evidence_summary": [
            "oath::bio[4].paragraphs[0] 记载她继续响应明的联络并卷入剪刀手行动，同时担忧公开身份与安全风险；她反复权衡后选择狙击枪，并在爆破任务中受伤。",
            "同段明确保留被动答应、难以把控选择以及对身份和战斗意义的疑问。"
        ],
        "inference": [
            "她在高风险价值冲突中可能先承诺、后补风险判断；这不等于缺乏职业判断力。"
        ],
        "conflicts": [
            "参与任务次数、正式权限、受伤日期及当前是否归队均未知。"
        ],
    },
    "SRC-O-C01": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[0].message[0:19] 回顾引航者曾帮助解围，并以提问、关注歌声和演唱会门票推进专属交流。"
        ],
        "inference": [
            "她可能用可回应的小邀请确认关系连续性；只适用于 PLEDGE_ONLY。"
        ],
        "conflicts": ["玩家选项与回复已扁平化，不能恢复唯一分支因果。"],
    },
    "SRC-O-C02": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[1].message[0:25] 出现依赖、希望成为独特对象和轻度独占愿望，同时由玩笑和自我降级降低强度。"
        ],
        "inference": [
            "亲密请求更像可协商愿望而非排他权利；只适用于 PLEDGE_ONLY。"
        ],
        "conflicts": ["含重复回复与多个玩家选项，不能把所有句子拼成单一路径。"],
    },
    "SRC-O-C03": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[2].message[0:22] 表现生病时仍先想继续工作、弱化求助；在引航者明确到场后接受休息与照看。"
        ],
        "inference": [
            "该事件直接显示她在引航者具体到场后接受停损；抽象安慰是否有同样效果没有被材料测试，只适用于 PLEDGE_ONLY。"
        ],
        "conflicts": ["不知道该通讯与羁绊剧情中的身体危机是否为同一事件。"],
    },
    "SRC-O-C04": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[3].message[0:26] 包含见面安排未成及短暂失落，随后仍给对方回应空间。"
        ],
        "inference": [
            "她可能更接受解释与新安排而非模糊安慰；当前只是一组 PLEDGE_ONLY 样本。"
        ],
        "conflicts": ["扁平分支无法确定每个选项分别触发哪条回复。"],
    },
    "SRC-O-C05": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[4].message[0:20] 以共同观察和小型日常仪式维持与引航者的专属交流。"
        ],
        "inference": [
            "她可能偏好可重复的共同体验确认关系；只适用于 PLEDGE_ONLY，不能推广给陌生人。"
        ],
        "conflicts": ["具体解锁版本与通讯时间未知。"],
    },
    "SRC-O-C06": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[5].message[0:12] 记载她为引航者生日留出专属时间，并把重视落实为共同安排。"
        ],
        "inference": [
            "在高羁绊关系中，她可能用调整日程表达重视；不得进入默认关系。"
        ],
        "conflicts": ["具体年份与该生日通讯在版本中的先后未知。"],
    },
    "SRC-O-C07": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[6].message[0:16] 记载生日计划因对方缺席落空后，她表达失落、主动补办并说明未来期待。"
        ],
        "inference": [
            "她可能用可兑现的新安排修复计划落空；当前只适用于 PLEDGE_ONLY 生日样本。"
        ],
        "conflicts": ["具体年份、与 C06 的版本先后及分支拓扑未知。"],
    },
    "SRC-O-C08": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[7].message[0:15] 标题指向 2025 角色生日；内容发生在前往粉丝见面会途中，并区分给粉丝的逆应援与私下珍藏的引航者贺卡。"
        ],
        "inference": [
            "她会区分公众物料与私密关系物件；私密部分只适用于 PLEDGE_ONLY。"
        ],
        "conflicts": ["标题年份不能证明其位于羁绊主线暂停活动之后。"],
    },
    "SRC-O-C09": {
        "status": "accepted",
        "evidence_summary": [
            "oath::comm[8].message[0:13] 标题指向 2026 新春，内容包含为节庆活动学唱新歌与共同节日互动。"
        ],
        "inference": [
            "节庆小仪式可能用于维持高羁绊关系；只适用于 PLEDGE_ONLY。"
        ],
        "conflicts": ["其中的新歌不能与羁绊剧情的全新主打歌直接等同。"],
    },
    "SRC-O-L01": {
        "status": "accepted",
        "evidence_summary": [
            "oath::returnLetters[0].paragraphs[0] 表达已签订誓约且长期失联后的强烈想念、慌张与依赖。"
        ],
        "inference": [
            "长期缺席可能触发更直接的依恋表达；只适用于 PLEDGE_ONLY。"
        ],
        "conflicts": ["触发字段把两个条件连在同一字符串中，不能还原唯一运行时触发逻辑。"],
    },
    "SRC-O-S01": {
        "status": "accepted",
        "characters_present": ["香奈美", "引航者"],
        "counterparties": ["引航者", "粉丝"],
        "evidence_summary": [
            "oath::story[0].scene[0:1] 记载她躲避粉丝时获得引航者掩护、被送回住处并赠出演唱会门票；这是初次签订誓约后的正式接近。"
        ],
        "inference": [
            "她在安全的私下场景会从职业应对转向轻度逗弄；只适用于 PLEDGE_ONLY。"
        ],
        "conflicts": ["文本混有旁白、玩家选项与重复回复，不能把全部行视为香奈美台词。"],
    },
    "SRC-O-S02": {
        "status": "accepted",
        "characters_present": ["香奈美", "引航者", "某位粉丝"],
        "counterparties": ["引航者", "某位粉丝", "观众"],
        "evidence_summary": [
            "oath::story[1].scene[2].line[0:18] 与 scene[3].line[29:55] 记载回归演唱会遇雨、观众离场、脚踝受伤后仍完成演出，并在演后讨论包装、粉丝期待与只展示讨喜一面。"
        ],
        "inference": [
            "职业完成度可能掩盖健康代价；该观察窗属于 PLEDGE_ONLY，不证明她永远忽视停损。"
        ],
        "conflicts": ["解锁日期和游戏版本未知；场景行混有旁白与玩家选项。"],
    },
    "SRC-O-S03": {
        "status": "accepted",
        "characters_present": ["香奈美", "引航者", "卡蒂", "工作人员", "企划部部长", "市场部部长", "运营部部长"],
        "counterparties": ["引航者", "卡蒂", "工作人员", "企划部部长", "市场部部长", "运营部部长"],
        "evidence_summary": [
            "oath::story[2].scene[0:2] 记载演唱会后的恶剪与定位争议、公司部门围绕疗养和作品争执、歌曲小样被忽视，以及她在会议后以职业笑容收尾并显露疲惫。"
        ],
        "inference": [
            "公开笑容既是职业能力也可能延后内部矛盾表达；该结论需与基础小传交叉使用。"
        ],
        "conflicts": ["网络舆论规模、各部门完整职位和会议日期未知；剧情属于 PLEDGE_ONLY。"],
    },
    "SRC-O-S04": {
        "status": "accepted",
        "characters_present": ["香奈美", "引航者"],
        "counterparties": ["引航者"],
        "evidence_summary": [
            "oath::story[3].scene[1:2] 记载她反复摄入恶评导致身体与认知过载，承认害怕形象受损和暴露自我，并在最信任的引航者提供具体停损后接受静音、休息与照护。"
        ],
        "inference": [
            "该事件直接显示切断刺激、恢复身体后再讨论长期方向；与其他安慰方式的效果比较仍未知，只适用于 PLEDGE_ONLY 观察窗。"
        ],
        "conflicts": ["不能把一次危机写成持续性心理诊断，也不能把最高信任用于默认关系。"],
    },
    "SRC-O-S05": {
        "status": "accepted",
        "characters_present": ["香奈美", "引航者", "夏露"],
        "counterparties": ["引航者", "夏露", "孩子与普通生活观察对象"],
        "evidence_summary": [
            "oath::story[4].scene[0].line[30:96] 与 scene[1].line[0:27] 记载夏露和旧乐谱重新提出她早期成为创作型歌手的愿望；她随后暂停偶像活动，外出观察、记录并尝试把真实见闻写进歌里。"
        ],
        "inference": [
            "转向不是否定偶像职业，而是从只由外部评价定义作品转向恢复自身观察与创作判断。"
        ],
        "conflicts": ["暂停活动时长、旅行路径、恢复活动日期与最终歌曲内容未知；剧情属于 PLEDGE_ONLY。"],
    },
    "SRC-O-S06": {
        "characters_present": ["香奈美", "引航者"],
        "counterparties": ["引航者"],
        "evidence_summary": [
            "oath::story[5].scene[0].line[0:14] 只保存 14 个媒体文件标记与一条引航者文本；解锁条件指向誓约等级 10。"
        ],
        "inference": ["标题暗示新歌单元，但未回听前不能确认香奈美说了什么或创作是否完成。"],
        "conflicts": ["场景索引直接为 3，缺少 1、2；音频无转写、说话人和时间戳。"],
    },
    "SRC-O-S07": {
        "characters_present": ["香奈美", "引航者"],
        "counterparties": ["引航者"],
        "evidence_summary": [
            "oath::story[6] 的解锁条件是生日当天进入香奈美宿舍；本地节点主要为媒体文件标记与引航者文本。"
        ],
        "inference": ["该单元属于生日 event 候选，不能在未回听前推断亲密度或固定历史位置。"],
        "conflicts": ["年份、完整说话人、音频措辞和与誓约等级的关系未知。"],
    },
    "SRC-A-01": {
        "inference": [
            "对局候选文本较短且叹句较多，可作为 battle_stage 节奏假设；未回听前不得确认为准确措辞或声线。"
        ],
    },
    "SRC-A-03": {
        "evidence_summary": [
            "audio-analysis.json 记录宿舍索引 179 项；按文件名识别出 CN 72、JP 65、EN 5、未标 37。",
            "72 条 CN 候选均有 WIKI text，平均 33.71 字符；38 条含问号、45 条含第二人称“你”。这些是描述性文本统计，不是回听结果。"
        ],
        "inference": [
            "宿舍候选比对局候选更长且更常提问，可作为 private_familiar 的节奏假设；需音频回听验证。"
        ],
        "conflicts": [
            "宿舍有 64 条文件名语言与 metadata language 冲突；WIKI 文本来自 ASR 与人工校对，关键措辞未回听。"
        ],
    },
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def dimensions(*tracks: str) -> list[str]:
    return [TRACKS[track] for track in tracks]


def make_record(
    *,
    source_id: str,
    title: str,
    url: str,
    local_paths: list[str],
    publisher: str,
    published_at: str | None,
    version: str | None,
    material_type: str,
    canon_context: str,
    primary_context: str,
    language: str | list[str],
    timeline_phase: str,
    scene: str,
    record_dimensions: list[str],
    characters_present: list[str],
    counterparties: list[str] | None = None,
    evidence_summary: list[str] | None = None,
    inference: list[str] | None = None,
    conflicts: list[str] | None = None,
    status: str = "candidate",
    canon_evidence: bool = True,
    notes: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "source_id": source_id,
        "title": title,
        "url": url,
        "local_paths": local_paths,
        "publisher": publisher,
        "published_at": published_at,
        "version": version,
        "accessed_at": ACCESSED_AT,
        "material_type": material_type,
        "canon_context": canon_context,
        "context_router": {"primary": primary_context, "secondary": None},
        "language": language,
        "timeline_phase": timeline_phase,
        "scene": scene,
        "dimensions": record_dimensions,
        "characters_present": characters_present,
        "counterparties": counterparties or [],
        "evidence_summary": evidence_summary or [],
        "short_quote": [],
        "timestamp": [],
        "inference": inference or [],
        "conflicts": conflicts or [],
        "status": status,
        "canon_evidence": canon_evidence,
        "notes": notes or [],
    }


def add_record(records: dict[str, dict[str, Any]], record: dict[str, Any]) -> None:
    source_id = record["source_id"]
    if source_id in records:
        raise ValueError(f"duplicate generated source_id: {source_id}")
    records[source_id] = record


def apply_gate_b_enrichments(records: dict[str, dict[str, Any]]) -> None:
    missing = sorted(set(GATE_B_ENRICHMENTS) - set(records))
    if missing:
        raise ValueError(f"Gate B enrichments reference missing records: {missing}")
    for source_id, enrichment in GATE_B_ENRICHMENTS.items():
        records[source_id].update(enrichment)
        record = records[source_id]
        if source_id.startswith("SRC-O-S") and record["status"] == "accepted":
            count_note = record["notes"][0]
            record["notes"] = [
                count_note,
                "本地正文已完成 Gate B 释义化提炼；仍按明确说话人前缀、旁白和分支边界审慎引用，不复制长原文。",
            ]
        elif source_id.startswith("SRC-O-B") and record["status"] == "accepted":
            record["notes"] = [
                "本地小传正文已完成 Gate B 释义化提炼；发布时间与游戏版本仍未知。",
                "本记录不复制小传长原文。",
            ]
        elif source_id == "SRC-O-L01" and record["status"] == "accepted":
            record["notes"] = [
                "本地回归信已完成 Gate B 释义化提炼；触发条件格式仍作为 conflicts 保留。",
                "本记录不复制信件长原文。",
            ]


def build_oath_records(records: dict[str, dict[str, Any]]) -> None:
    oath_path = REPO_ROOT / OATH_LOCAL_PATH
    oath = read_json(oath_path)

    communications = oath.get("kachiuCommunications", [])
    if len(communications) != 9:
        raise ValueError(f"expected 9 communications, found {len(communications)}")
    for index, item in enumerate(communications, 1):
        messages = item.get("messages", [])
        role_counts = Counter(message.get("role") for message in messages)
        kind_counts = Counter(message.get("kind") for message in messages)
        if set(role_counts) != {"香奈美", "引航者"}:
            raise ValueError(f"unexpected communication roles in {item.get('title')}")
        source_id = f"SRC-O-C{index:02d}"
        add_record(
            records,
            make_record(
                source_id=source_id,
                title=item["title"],
                url=item["sourcePage"],
                local_paths=[OATH_LOCAL_PATH],
                publisher=WIKI_PUBLISHER,
                published_at=None,
                version="unknown",
                material_type="dialogue",
                canon_context="pledge",
                primary_context="pledge_intimate",
                language="zh-CN",
                timeline_phase="unknown",
                scene=f"卡丘通讯：{item['title']}",
                record_dimensions=dimensions("T2", "T3", "T6"),
                characters_present=["香奈美", "引航者"],
                counterparties=["引航者"],
                evidence_summary=[
                    "本地结构已核对："
                    f"{kind_counts['message']} 条消息与 {kind_counts['option']} 个选项，"
                    "角色字段同时包含香奈美和引航者；尚未进行语义提炼。"
                ],
                status="inspected",
                notes=[
                    "发布时间和游戏版本未保存在本地结构中，暂以 version=unknown 登记。",
                    "正文只保留在原始本地数据中，本记录不复制对话原文。",
                ],
            ),
        )

    biography_contexts = [
        "vulnerable_reflective",
        "vulnerable_reflective",
        "public_idol",
        "vulnerable_reflective",
        "vulnerable_reflective",
    ]
    biographies = oath.get("characterBiographies", [])
    if len(biographies) != 5:
        raise ValueError(f"expected 5 biographies, found {len(biographies)}")
    for index, (item, primary_context) in enumerate(
        zip(biographies, biography_contexts, strict=True), 1
    ):
        paragraphs = item.get("paragraphs", [])
        if len(paragraphs) != 1:
            raise ValueError(f"expected one paragraph in {item.get('title')}")
        add_record(
            records,
            make_record(
                source_id=f"SRC-O-B{index:02d}",
                title=item["title"],
                url=item["sourcePage"],
                local_paths=[OATH_LOCAL_PATH],
                publisher=WIKI_PUBLISHER,
                published_at=None,
                version="unknown",
                material_type="setting",
                canon_context="base",
                primary_context=primary_context,
                language="zh-CN",
                timeline_phase="unknown",
                scene=f"角色小传：{item['title']}",
                record_dimensions=dimensions("T1", "T4", "T5", "T6"),
                characters_present=["香奈美"],
                evidence_summary=[
                    "本地结构已核对：该标题对应一段独立角色小传并带有解锁条件；"
                    "正文尚未进入六轨语义提炼。"
                ],
                status="inspected",
                notes=[
                    "发布时间和游戏版本未保存，时间线阶段仍待正文核验。",
                    "本记录不复制小传原文。",
                ],
            ),
        )

    letters = oath.get("returnLetters", [])
    if len(letters) != 1:
        raise ValueError(f"expected 1 return letter, found {len(letters)}")
    letter = letters[0]
    add_record(
        records,
        make_record(
            source_id="SRC-O-L01",
            title=letter["title"],
            url=letter["sourcePage"],
            local_paths=[OATH_LOCAL_PATH],
            publisher=WIKI_PUBLISHER,
            published_at=None,
            version="unknown",
            material_type="letter",
            canon_context="pledge",
            primary_context="pledge_intimate",
            language="zh-CN",
            timeline_phase="unknown",
            scene="誓约角色回归信",
            record_dimensions=dimensions("T1", "T2", "T3", "T6"),
            characters_present=["香奈美"],
            counterparties=["引航者"],
            notes=[
                "本地结构定位到一段回归信及两种触发条件，但触发格式和正文语义尚待核验。",
                "候选阶段不复制信件原文。",
            ],
        ),
    )

    stories = oath.get("characterStories", [])
    if len(stories) != 7:
        raise ValueError(f"expected 7 stories, found {len(stories)}")
    for index, item in enumerate(stories, 1):
        scene_count = len(item.get("scenes", []))
        line_count = sum(len(scene.get("lines", [])) for scene in item["scenes"])
        pledge = index <= 6
        story_dimensions = (
            dimensions("T1", "T2", "T3", "T4", "T5", "T6")
            if pledge
            else dimensions("T2", "T3", "T5", "T6")
        )
        add_record(
            records,
            make_record(
                source_id=f"SRC-O-S{index:02d}",
                title=item["title"],
                url=item["sourcePage"],
                local_paths=[OATH_LOCAL_PATH],
                publisher=WIKI_PUBLISHER,
                published_at=None,
                version="unknown",
                material_type="story",
                canon_context="pledge" if pledge else "event",
                primary_context="pledge_intimate" if pledge else "private_familiar",
                language="zh-CN",
                timeline_phase="unknown",
                scene=item["title"],
                record_dimensions=story_dimensions,
                characters_present=["香奈美"],
                notes=[
                    f"本地结构定位到 {scene_count} 个场景、{line_count} 行原始内容。",
                    "说话人和媒体标记尚未结构化，故保持 candidate 且不复制剧情原文。",
                ],
            ),
        )


def select_index_entries(
    relative_path: str, *, subsection: str | None, expected_count: int
) -> tuple[list[dict[str, Any]], str]:
    data = read_json(REPO_ROOT / relative_path)
    if not isinstance(data, dict):
        raise ValueError(f"index must be an object: {relative_path}")
    entries = [
        value
        for value in data.values()
        if isinstance(value, dict)
        and (subsection is None or value.get("subsection") == subsection)
    ]
    if len(entries) != expected_count:
        raise ValueError(
            f"{relative_path}/{subsection}: expected {expected_count}, found {len(entries)}"
        )
    source_pages = {entry.get("sourcePage") for entry in entries}
    if len(source_pages) != 1 or not all(
        isinstance(page, str) and page.startswith("https://") for page in source_pages
    ):
        raise ValueError(f"ambiguous source pages for {relative_path}/{subsection}")
    return entries, source_pages.pop()


def build_index_record(
    records: dict[str, dict[str, Any]],
    *,
    source_id: str,
    title: str,
    relative_path: str,
    subsection: str | None,
    expected_count: int,
    material_type: str,
    canon_context: str,
    primary_context: str,
    language: str | list[str],
    timeline_phase: str,
    record_dimensions: list[str],
    content_gap: str,
) -> None:
    _, source_page = select_index_entries(
        relative_path, subsection=subsection, expected_count=expected_count
    )
    add_record(
        records,
        make_record(
            source_id=source_id,
            title=title,
            url=source_page,
            local_paths=[relative_path],
            publisher=WIKI_PUBLISHER,
            published_at=None,
            version="unknown",
            material_type=material_type,
            canon_context=canon_context,
            primary_context=primary_context,
            language=language,
            timeline_phase=timeline_phase,
            scene=title,
            record_dimensions=record_dimensions,
            characters_present=["香奈美"],
            notes=[
                f"本地索引定位到 {expected_count} 项，尚未逐项检查媒体内容。",
                content_gap,
            ],
        ),
    )


def build_audio_records(records: dict[str, dict[str, Any]]) -> None:
    specs = [
        (
            "SRC-A-01",
            "对局语音",
            "对局",
            350,
            "voice",
            "battle",
            "battle_stage",
            "mixed",
            "unknown",
            dimensions("T2", "T3", "T4"),
        ),
        (
            "SRC-A-02",
            "世纪歌姬时装语音",
            "世纪歌姬时装",
            248,
            "voice",
            "skin",
            "public_idol",
            "mixed",
            "alternate-skin",
            dimensions("T2", "T3"),
        ),
        (
            "SRC-A-03",
            "宿舍语音",
            "宿舍",
            179,
            "voice",
            "dorm",
            "private_familiar",
            "mixed",
            "unknown",
            dimensions("T1", "T2", "T3"),
        ),
        (
            "SRC-A-04",
            "系统播报语音",
            "系统播报语音",
            151,
            "voice",
            "system",
            "battle_stage",
            "mixed",
            "unknown",
            dimensions("T3", "T4"),
        ),
        (
            "SRC-A-05",
            "花的私语时装语音",
            "花的私语时装",
            14,
            "voice",
            "skin",
            "public_idol",
            "zh-CN",
            "alternate-skin",
            dimensions("T2", "T3"),
        ),
        (
            "SRC-A-06",
            "相关音乐",
            "相关音乐",
            10,
            "song",
            "mixed",
            "public_idol",
            "mixed",
            "unknown",
            dimensions("T1", "T3"),
        ),
    ]
    for (
        source_id,
        title,
        subsection,
        count,
        material_type,
        canon_context,
        primary_context,
        language,
        timeline_phase,
        record_dimensions,
    ) in specs:
        content_gap = (
            "该索引混合角色曲、BGM 与伴奏，正式研究前仍需按实际类型拆分；"
            "未完成回听、转写和时间戳核验，故保持 candidate。"
            if source_id == "SRC-A-06"
            else "索引含 WIKI text 候选，但未完成回听、说话对象和时间戳核验；"
            "文件名语言与 metadata language 还存在冲突，故保持 candidate。"
        )
        build_index_record(
            records,
            source_id=source_id,
            title=title,
            relative_path="res/WIKI/audio.json",
            subsection=subsection,
            expected_count=count,
            material_type=material_type,
            canon_context=canon_context,
            primary_context=primary_context,
            language=language,
            timeline_phase=timeline_phase,
            record_dimensions=record_dimensions,
            content_gap=content_gap,
        )
        records[source_id]["local_paths"].append(AUDIO_ANALYSIS_LOCAL_PATH)
        records[source_id]["notes"].append(
            "音频索引的可复现语言与文本统计见 audio-analysis.json。"
        )


def build_visual_index_records(records: dict[str, dict[str, Any]]) -> None:
    specs = [
        ("SRC-M-01", "超弦体设定", "res/WIKI/character.json", None, 2, "setting", "base", "public_idol", "unknown", dimensions("T1", "T5", "T6"), "索引没有设定正文。"),
        ("SRC-M-02", "游戏表情", "res/WIKI/emotes.json", "游戏表情", 17, "setting", "base", "private_familiar", "unknown", dimensions("T3"), "只作非语言表达候选。"),
        ("SRC-M-03", "香奈美 B 站装扮表情", "res/WIKI/emotes.json", "香奈美B站装扮表情", 15, "setting", "event", "public_idol", "unknown", dimensions("T3", "T5"), "属于宣传情境。"),
        ("SRC-M-04", "官方表情", "res/WIKI/emotes.json", "官方表情", 9, "setting", "base", "public_idol", "unknown", dimensions("T3"), "不可单独推导人格。"),
        ("SRC-M-05", "角色技能", "res/WIKI/skills.json", None, 4, "setting", "battle", "battle_stage", "unknown", dimensions("T4", "T6"), "没有技能正文；数值不作人格证据。"),
        ("SRC-M-06", "超弦体时装", "res/WIKI/outfits.json", None, 75, "setting", "skin", "public_idol", "alternate-skin", dimensions("T3", "T5", "T6"), "多种时装混合，不能覆盖基础人格。"),
        ("SRC-M-07", "印迹", "res/WIKI/imprints.json", None, 13, "setting", "base", "public_idol", "unknown", dimensions("T1", "T5", "T6"), "当前仅为图像索引。"),
        ("SRC-M-08", "弦能增幅网络", "res/WIKI/amplification_network.json", None, 9, "setting", "battle", "battle_stage", "unknown", dimensions("T4", "T6"), "当前仅为图像索引。"),
        ("SRC-M-09", "超弦体武器", "res/WIKI/weapons.json", None, 1, "setting", "battle", "battle_stage", "unknown", dimensions("T4", "T6"), "不能单独证明武器选择动机。"),
        ("SRC-M-10", "更新改动历史", "res/WIKI/update_history.json", None, 41, "setting", "event", "public_idol", "unknown", dimensions("T6"), "没有结构化版本文本。"),
        ("SRC-M-11", "相关剧情壁纸", "res/WIKI/story_wallpapers.json", "相关剧情", 2, "story", "event", "public_idol", "unknown", dimensions("T5", "T6"), "仅用于定位相关剧情，不含剧情正文。"),
        ("SRC-G-01", "时装官宣图", "res/WIKI/story_wallpapers.json", "时装官宣图", 32, "setting", "skin", "public_idol", "alternate-skin", dimensions("T3", "T5", "T6"), "视觉宣传证据不得覆盖基础人格。"),
        ("SRC-G-02", "壁纸", "res/WIKI/story_wallpapers.json", "壁纸", 18, "setting", "base", "public_idol", "unknown", dimensions("T3", "T5"), "图片情境混合，需逐项核验。"),
        ("SRC-G-03", "节日贺图", "res/WIKI/story_wallpapers.json", "节日贺图", 6, "setting", "event", "public_idol", "unknown", dimensions("T3", "T5", "T6"), "日期尚未结构化。"),
        ("SRC-G-04", "角色官宣图与设定图", "res/WIKI/story_wallpapers.json", "角色官宣图&设定图", 3, "setting", "base", "public_idol", "unknown", dimensions("T1", "T5", "T6"), "图片文字尚未抽取。"),
        ("SRC-G-05", "日历", "res/WIKI/story_wallpapers.json", "日历", 2, "setting", "event", "public_idol", "unknown", dimensions("T3", "T5", "T6"), "年份需从图片核对。"),
        ("SRC-G-06", "移动端壁纸", "res/WIKI/story_wallpapers.json", "移动端壁纸", 2, "setting", "base", "public_idol", "unknown", dimensions("T3", "T5"), "当前仅为纯视觉索引。"),
        ("SRC-G-07", "剧情 CG", "res/WIKI/story_wallpapers.json", "剧情CG", 1, "story", "event", "public_idol", "unknown", dimensions("T2", "T5", "T6"), "没有对应剧情正文。"),
    ]
    for (
        source_id,
        title,
        relative_path,
        subsection,
        count,
        material_type,
        canon_context,
        primary_context,
        timeline_phase,
        record_dimensions,
        content_gap,
    ) in specs:
        build_index_record(
            records,
            source_id=source_id,
            title=title,
            relative_path=relative_path,
            subsection=subsection,
            expected_count=count,
            material_type=material_type,
            canon_context=canon_context,
            primary_context=primary_context,
            language="unknown",
            timeline_phase=timeline_phase,
            record_dimensions=record_dimensions,
            content_gap=content_gap,
        )


def build_bilibili_records(records: dict[str, dict[str, Any]]) -> None:
    evidence = read_json(BILIBILI_EVIDENCE_PATH)
    videos = {item["bvid"]: item for item in evidence.get("verified_videos", [])}
    specs = [
        ("SRC-B-01", "BV1W2421L7wT", "song", "base", "public_idol", "zh-CN", "unknown", dimensions("T1", "T3")),
        ("SRC-B-02", "BV1HZ421g71j", "pv", "dorm", "private_familiar", "zh-CN", "unknown", dimensions("T2", "T3")),
        ("SRC-B-03", "BV12JDGYLEsT", "pv", "skin", "public_idol", "zh-CN", "alternate-skin", dimensions("T3", "T5")),
        ("SRC-B-04", "BV1AnoPYNEiL", "song", "base", "public_idol", "ja-JP", "unknown", dimensions("T1", "T3")),
        ("SRC-B-05", "BV1d93p69EKU", "song", "skin", "public_idol", ["zh-CN", "ja-JP"], "alternate-skin", dimensions("T1", "T3")),
        ("SRC-B-06", "BV1TwGA6XEhK", "pv", "skin", "public_idol", "zh-CN", "alternate-skin", dimensions("T3", "T5")),
        ("SRC-B-07", "BV1m7um6BEgB", "pv", "event", "public_idol", "mixed", "current", dimensions("T5", "T6")),
    ]
    for (
        source_id,
        bvid,
        material_type,
        canon_context,
        primary_context,
        language,
        timeline_phase,
        record_dimensions,
    ) in specs:
        video = videos.get(bvid)
        if video is None:
            raise ValueError(f"missing Bilibili evidence for {bvid}")
        published_at = str(video["published_at"]).split("T", 1)[0]
        notes = [
            "平台元数据已核对："
            f"owner.mid={video.get('owner_mid')}，时长 {video.get('duration_seconds')} 秒，"
            f"分 P 数 {video.get('pages')}，目录状态 {video.get('catalog_status')}。",
            "尚未完成观看、字幕／说话人和内容时间戳核验，故保持 candidate。",
        ]
        if source_id == "SRC-B-07":
            notes.append("现有标题与简介不能证明香奈美为重要角色，保留为条件候选。")
        evidence_summary = [
            f"平台元数据确认 bvid={bvid}、owner.mid={video.get('owner_mid')}、"
            f"发布日期 {published_at}、时长 {video.get('duration_seconds')} 秒和分 P 数 {video.get('pages')}。",
            "2026-08-14 已在具体 BV 页面核对标题与可见发布者；尚未完整观看视频内容。",
        ]
        conflicts = [
            "没有字幕、角色说话人或内容时间戳，平台标题与元数据不能替代视频内容证据。"
        ]
        if source_id == "SRC-B-07":
            evidence_summary[1] = (
                "2026-08-14 已核对具体 BV 页面标题与可见发布者；页面中的“香奈美”仅来自相关推荐 COS 标题，未证明视频本体包含她。"
            )
            conflicts.append("该视频不得进入基础人格、关系或时间线结论。")
        add_record(
            records,
            make_record(
                source_id=source_id,
                title=video["title"],
                url=f"https://www.bilibili.com/video/{bvid}/",
                local_paths=[BILIBILI_LOCAL_PATH],
                publisher="卡拉彼丘官方账号",
                published_at=published_at,
                version=None,
                material_type=material_type,
                canon_context=canon_context,
                primary_context=primary_context,
                language=language,
                timeline_phase=timeline_phase,
                scene=video["title"],
                record_dimensions=record_dimensions,
                characters_present=["未确认"] if source_id == "SRC-B-07" else ["香奈美"],
                evidence_summary=evidence_summary,
                conflicts=conflicts,
                canon_evidence=source_id != "SRC-B-07",
                notes=notes,
            ),
        )


def apply_web_verification(records: dict[str, dict[str, Any]]) -> None:
    verification = read_json(WEB_VERIFICATION_PATH)
    for observation in verification.get("observations", []):
        source_id = observation.get("source_id")
        if source_id not in records:
            continue
        record = records[source_id]
        if WEB_VERIFICATION_LOCAL_PATH not in record["local_paths"]:
            record["local_paths"].append(WEB_VERIFICATION_LOCAL_PATH)

        status = observation.get("status")
        if status == "live-content-verified":
            summaries = observation.get("evidence_summary", [])
            if not summaries:
                raise ValueError(f"web verification lacks evidence for {source_id}")
            record["evidence_summary"].extend(summaries)
            media_without_playback = (
                record["material_type"] in {"voice", "pv", "song"}
                and observation.get("audio_playback_reviewed") is False
            )
            if media_without_playback:
                record["conflicts"].append(
                    "网页可见文本可能包含转写误差；关键措辞、声线、停顿和说话对象尚未通过音频回听确认。"
                )
                record["notes"].append(
                    "2026-08-14 已在浏览器中核对页面标题与可见内容；未播放音频，仍保持 candidate。"
                )
            else:
                record["status"] = "inspected"
                record["notes"].append(
                    "2026-08-14 已在浏览器中核对页面正文与标题。"
                )
        elif status in {
            "page-identity-verified",
            "conditional-page-identity-verified",
        }:
            if status == "conditional-page-identity-verified":
                record["conflicts"].extend(observation.get("notes", []))
            record["notes"].append(
                "2026-08-14 已在浏览器中核对页面标题与可见发布者；"
                "未完整观看内容，仍保持 candidate。"
            )


def build_records() -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    build_oath_records(records)
    build_audio_records(records)
    build_visual_index_records(records)
    build_bilibili_records(records)
    apply_web_verification(records)
    apply_gate_b_enrichments(records)
    return records


def validate_manifest_ids(records: dict[str, dict[str, Any]]) -> None:
    manifest = MANIFEST_PATH.read_text(encoding="utf-8")
    manifest_ids = SOURCE_ROW_RE.findall(manifest)
    duplicates = sorted(
        source_id for source_id, count in Counter(manifest_ids).items() if count > 1
    )
    generated_ids = set(records)
    manifest_id_set = set(manifest_ids)
    if duplicates or generated_ids != manifest_id_set:
        raise ValueError(
            "manifest/source-record ID mismatch: "
            f"duplicates={duplicates}, "
            f"missing={sorted(manifest_id_set - generated_ids)}, "
            f"unexpected={sorted(generated_ids - manifest_id_set)}"
        )


def write_and_validate(records: dict[str, dict[str, Any]]) -> dict[str, Any]:
    schema = load_schema(SCHEMA_PATH)
    validation_errors: list[str] = []
    for source_id, record in sorted(records.items()):
        validation_errors.extend(
            f"{source_id}: {error}" for error in validate_record(record, schema)
        )
    if validation_errors:
        raise ValueError("generated records are invalid:\n" + "\n".join(validation_errors))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    expected_names = {f"{source_id}.json" for source_id in records}
    unexpected_names = {
        path.name for path in OUTPUT_DIR.glob("*.json") if path.name not in expected_names
    }
    if unexpected_names:
        raise ValueError(
            f"refusing to remove unexpected source-record files: {sorted(unexpected_names)}"
        )
    for source_id, record in sorted(records.items()):
        output_path = OUTPUT_DIR / f"{source_id}.json"
        output_path.write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    record_paths, directory_errors = validate_records_directory(OUTPUT_DIR, schema)
    if directory_errors:
        raise ValueError("written records are invalid:\n" + "\n".join(directory_errors))
    if len(record_paths) != 53:
        raise ValueError(f"expected 53 source records, found {len(record_paths)}")

    status_counts = Counter(record["status"] for record in records.values())
    return {
        "status": "PASS",
        "records": len(record_paths),
        "status_counts": dict(sorted(status_counts.items())),
        "output_dir": str(OUTPUT_DIR),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build all 53 source records with current Gate B enrichments"
    )
    parser.parse_args()
    records = build_records()
    validate_manifest_ids(records)
    result = write_and_validate(records)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
