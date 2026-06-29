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
- `yt-dlp`：下载视频音轨。
- `ffmpeg`：把音轨转成 mp3。
- `qrcode`：在终端显示登录二维码，缺失时也会打印扫码链接。

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

## 采集

默认会用多组关键词搜索，并要求已有登录 cookie：

```bash
python crawler.py crawl --pages 3 --output data/kanami_ai_covers.json
```

如果只想验证搜索和导出，不下载 mp3：

```bash
python crawler.py crawl --pages 1 --no-audio --output data/kanami_ai_covers.json
```

输出 JSON 顶层包含：

- `items`：爬虫自己的结构化记录。
- `resourceMap`：星光收藏室可用的对象映射，key 是音频资源 URL，value 是资源 metadata。
- `resourceGroup`：建议加入 `resource_groups.json` 的自定义分类配置。

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

当前筛选逻辑是粗筛：标题、标签和简介中需要同时命中香奈美和 AI/翻唱相关词，并过滤少量明显不是纯歌曲翻唱的内容。是否真的是“单纯歌曲翻唱”仍需要后续人工复核或更强的内容识别规则。
