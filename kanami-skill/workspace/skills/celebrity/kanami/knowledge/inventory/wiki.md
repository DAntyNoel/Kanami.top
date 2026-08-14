# WIKI 本地库存

> 盘点日期：2026-08-14
> 状态：目录已核对，正文尚未进入六轨提取。

## 结构化索引

主索引：`../../../../../../../res/WIKI/`

- 11 个 JSON 数据文件，另有聚合脚本 `wiki-data.js`。
- `oath_texts.json`：9 组通讯（177 个节点）、7 个故事（18 场／512 行）、5 篇角色小传、1 封回归信。
- `audio.json`：952 条音频资源映射。
- `emotes.json`：41 条表情映射。
- `outfits.json`：75 条时装映射。
- `story_wallpapers.json`：66 条当前映射。

结构化索引共形成 46 条 Gate A 候选材料单元，覆盖 11 个具体 WIKI `sourcePage` URL。完整 source_id、URL、情境和六轨候选映射见 `../source_manifest.md`。

## 二进制镜像

镜像目录：`../../../../../../../local-server/files/WIKI/`

- 总计 1,331 个文件，553,084,261 字节。
- 媒体 1,317 个：952 MP3、245 PNG、98 JPG、22 GIF。
- `local-server/files/WIKI/oath_texts.json` 当前仅为 `{}`；誓约文本不能使用该空占位文件，必须读取 `res/WIKI/oath_texts.json`。
- 镜像版 `story_wallpapers.json` 有 95 项，与 `res/WIKI` 的 66 项不一致；进入研究前必须区分当前索引、旧镜像和缩略图重复，不得直接合并计数。

## Gate A 限制

- 本地 JSON 是资源索引与已抽取文本，不等于完整网页快照。
- 缺少可靠发布时间、游戏版本和统一时间线阶段。
- 剧情行需重新拆分说话人、旁白、玩家选项和媒体标记。
- 正式研究只写释义化证据与必要短引文，不把长剧情或完整通讯复制进研究文件。
