# V-nami

V-nami 是给 `kanami.top` 星光收藏室准备的 B 站香奈美 AI 翻唱采集框架。当前目标是先搭好可登录、可搜索、可粗筛、可下载 mp3、可导出星光收藏室兼容 JSON 的基础目录。

## 依赖环境

项目依赖放在当前机器的 conda `main` 环境中：

```bash
cd /Users/main/Desktop/DAntyNoel/Kanami.top/dev/V-nami
conda activate main
python -m pip install -r requirements.txt
conda install -n main -c conda-forge ffmpeg
```

依赖说明：

- `httpx`：访问 B 站网页登录、搜索和视频元数据接口。
- `yt-dlp`：下载视频音轨；搜索阶段默认不走 yt-dlp，除非显式指定搜索后端。
- `ffmpeg`：把音轨转成 mp3。
- `qrcode`：在终端显示登录二维码，缺失时也会打印扫码链接。

## 参考实现

这版不再把 B 站搜索和下载细节完全手写，核心参考这些成熟项目的做法：

- `yt-dlp/yt-dlp`：复用 Bilibili extractor、`bilisearch` 搜索入口、cookie 文件和 `FFmpegExtractAudio` mp3 转码链路。
- `Nemo2011/bilibili-api`：参考 B 站网页登录、搜索和视频信息接口的封装边界。
- `SocialSisterYi/bilibili-API-collect`：作为 B 站 Web API 形态的补充参考；具体实现仍以 `yt-dlp` 当前代码和实测接口为准。

## 本地凭证

B 站登录 cookie 只保存在本目录的 `.private/` 下：

- `.private/bilibili_cookies.json`：V-nami 自用 cookie。
- `.private/bilibili_cookies.txt`：给 `yt-dlp` 使用的 Netscape cookie 文件。

`.private/` 已加入本目录 `.gitignore`，不会被提交。保存时会尽量设置为仅当前用户可读写。

登录：

```bash
python crawler.py login
python crawler.py status
```

未登录或 cookie 失效时，B 站搜索/详情接口可能返回 `HTTP 412 Precondition Failed`。深度搜索和 mp3 下载前应先确认 `status` 是已登录状态。
`yt-dlp` 的 `bilisearch` 后端也可能在登录态下触发 412；元数据采集默认使用 B 站 API 后端，下载音频时才使用 `yt-dlp`。

## 采集策略

默认只用 `香奈美` 作为搜索关键词，并要求已有登录 cookie。候选视频会再用标题、简介和视频 tag 粗筛；tag 中出现 `AI` + `翻唱` / `cover`，或 `AI音乐`、`AI歌曲` 等信号时，也会算作 AI 翻唱候选。
采集过程中，API 搜索按发布时间从新到旧返回；每完成一页就会立刻检查该页候选，并先输出 `当前搜索日期：YYYY-MM-DD`，再输出该日期下的 `已保存：标题前10字` 或 `跳过（原因）：标题前10字`。跳过原因会区分 `已保存`、`不匹配`、`缺少BVID`、`异常`、`日期已完成` 等状态。当某一天的搜索结果已经完整检查完，checkpoint 会记录该日期，后续 `--resume` 遇到同一关键词的同一天结果会快速跳过。
默认未设置 `--max-candidates-per-run` 时，API 搜索会一直按新到旧翻页，直到确认 2021 年视频已经全部搜索完；设置 `--max-candidates-per-run` 时才按本轮候选数量分批停止。
视频详情会优先使用 detail 返回里的 tags；只有 detail 没带 tags 时才 fallback 到 tag 接口，且不会在 detail 和 tags 之间额外 sleep。
默认输出是 `data/kanami_ai_covers.json`，默认请求等待是 `--request-delay 1 --request-jitter 4`，默认风控冷却是 `--cooldown-seconds 1800`。

```bash
python crawler.py crawl --pages 3
```

正式采集建议先只搜元数据，不下载 mp3。这样可以慢速、可恢复地建立候选池，并把所有候选写入 `data/raw_candidates.jsonl` 供后续复核：

```bash
python crawler.py crawl \
  --search-only \
  --resume \
  --deep-search \
  --max-candidates-per-run 80
```

确认候选后，再单独补下载：

```bash
python crawler.py crawl \
  --download-only \
  --download-delay 30 \
  --download-jitter 30 \
  --output data/kanami_ai_covers.json
```

如果希望搜索时旁路下载，单独启动下载 worker。它会轮询 `data/kanami_ai_covers.json`，检测到新增或仍缺 mp3 的条目就下载；如果 30 分钟没有 JSON 更新或新增待下载项，会自动退出：

```bash
python download_worker.py \
  --input data/kanami_ai_covers.json \
  --poll-interval 60 \
  --idle-timeout 1800 \
  --download-delay 5 \
  --download-jitter 3 \
  --concurrency 8
```

搜索后端可以切换：

```bash
python crawler.py crawl --search-backend auto
python crawler.py crawl --search-backend api
python crawler.py crawl --search-backend both
python crawler.py crawl --search-backend yt-dlp
```

`auto` 是默认值，当前等价于 API 搜索。只有需要复查 API 漏掉的结果时，才建议手动切到 `both` 或 `yt-dlp`。

输出 JSON 顶层包含：

- `items`：爬虫自己的结构化记录。
- `resourceMap`：星光收藏室可用的对象映射，key 是音频资源 URL，value 是资源 metadata。
- `resourceGroup`：建议加入 `resource_groups.json` 的自定义分类配置。

运行时还会维护：

- `data/crawl_checkpoint.json`：已处理候选 key 和完整检查过的搜索日期，用于 `--resume`。
- `data/raw_candidates.jsonl`：每个候选的视频信息、筛选结果和拒绝原因。

必要字段会保留：

- `videoUrl`：视频链接。
- `author`：作者。
- `originalSongName`：原唱曲目名称，优先从书名号、括号和常见标题格式推断。
- `videoTitle`：视频标题。
- `audioFile` / `audioResourceUrl`：本地 mp3 文件路径和星光收藏室资源 URL。
- `publishedAt`：发布日期。

## 同步到星光收藏室

采集完成后可以先 dry-run：

```bash
python scripts/sync_to_wiki.py --input data/kanami_ai_covers.json --dry-run
```

确认后写入 `local-server/files/WIKI`：

```bash
python scripts/sync_to_wiki.py --input data/kanami_ai_covers.json
```

这会生成或更新：

- `local-server/files/WIKI/resource_groups.json`
- `local-server/files/WIKI/custom_kanami_ai_covers.json`
- `local-server/files/WIKI/audio/v-nami/*.mp3`

需要同步静态站点 `res/WIKI` 时，可以额外传：

```bash
python scripts/sync_to_wiki.py --input data/kanami_ai_covers.json --wiki-root ../../res/WIKI
```

## 当前限制

当前筛选逻辑是粗筛：搜索阶段只要求命中香奈美，筛选阶段再要求标题、标签或简介中命中 AI/翻唱相关词；视频 tag 里同时有 `AI` 和 `翻唱` / `cover` 也会被视为命中。是否真的是“单纯歌曲翻唱”仍需要后续人工复核或更强的内容识别规则。

不要用高并发、代理池或短时间全量冲刺。当前策略是低频登录态访问，遇到 `403/412/418/429` 会按 `--cooldown-seconds` 冷却暂停。
