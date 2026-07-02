# V-nami song name audit

Generated at: 2026-07-02T16:25:37+08:00

## Summary

- Source items scanned: 1729
- Auto-fixed names: 306
- Blocked auto-fixes: 6
- Still questionable names: 94
- Database active items after sync: 1729
- WIKI resource entries: 1729

Note: while this audit was being produced, an older `crawler.py crawl --search-only --resume --deep-search` process was still running and continued to rewrite the ignored runtime source file `dev/V-nami/data/kanami_ai_covers.json`. The committed static WIKI export and the local SQLite database were regenerated with the fixed names. Stop the old crawler and rerun the sync before relying on the ignored source JSON as canonical.

## Auto-fixed names

| BVID | Old | New | Video title |
| --- | --- | --- | --- |
| BV1VtTi6LEzg | 东方project/卡拉彼丘 | Bad Apple!! | 【东方project/卡拉彼丘】Bad apple!! by香奈美 |
| BV1ScTB6rEq8 | 【】失眠 | 失眠 | 【AI香奈美】失眠-品尝过爱情的香甜 我舍不得喝水~ |
| BV19yTc62E33 | 卡拉彼丘 | 色は匂へど散りぬるを(OPver.1.2)[with senya] (iroha niohedo chirinuruwo(OPver.1.2) [with senya]) | 【卡拉彼丘/香奈美】色は匂へど散りぬるを |
| BV1x4KQ6MEGX | 【 】“送你四季” | 四季予你 | 【AI 香奈美】“送你四季” |
| BV1Ns7H67EP1 | 【】那时候的我 | 那时候的我 | 【AI香奈美】那时候的我 |
| BV1WJ7K6vE4h | 【 】 “Remember me,Forget me ” | remember me, forget me | 【AI 香奈美】 “Remember me,Forget me ” |
| BV1yQju6jEDG | 【】戒了烟我不习惯，没有你我怎么办~ | 戒了烟我不习惯，没有你我怎么办~ | 【完整版】戒了烟我不习惯，没有你我怎么办~ |
| BV1uuJu6oEBe | 【 】“我想当你的猫咪” | 你的猫咪 | 【AI 香奈美】“我想当你的猫咪” |
| BV1feJF6mE4Z | 【 】的内心世界belike | 女主OS | 【AI 香奈美】香奈美的内心世界belike: |
| BV1pKEP68ETy | ⚡️⚡️来感受卡拉彼丘女团的威压……么？⚡️⚡️ | The Wellerman | ⚡️⚡️来感受卡拉彼丘女团的威压……么？⚡️⚡️ |
| BV1pGVC6cE3v | 【】“失恋的深呼吸想一想他的缺失” | 失恋的深呼吸想一想他的缺失 | 【AI香奈美】“失恋的深呼吸想一想他的缺失” |
| BV1cvGf6qEpH | 【】不分手的恋爱 | 不分手的恋爱 | 【AI香奈美】不分手的恋爱 |
| BV1PVdPBxEy8 | 舞萌DX/卡拉彼丘 | 舞萌DX | 【舞萌DX/卡拉彼丘】美しい世界へ 自制谱面 MASTER 13 |
| BV1HuRjBXEDt | 卡拉彼丘/×星绘×米雪儿×白墨 | 可愛くてごめん (feat. かぴ) | 【卡拉彼丘/香奈美×星绘×米雪儿×白墨】可愛くてごめん 这么可爱真是抱歉 |
| BV1rKdrBREXy | 卡拉彼丘 | 你看 世界好美 | 小夏VS心夏『你看 世界好美』《卡拉彼丘》香奈美主题曲Melodic Dubstep Remix(Bootleg) 左右声道 |
| BV1NUdoBGEZT | 【】权御天下 | 权御天下 | 【AI香奈美】权御天下 |
| BV1P9DNBJEoD | 【】 | 两只蝴蝶 | 【香奈美翻唱】-两只蝴蝶也浪漫“两只蝴蝶” |
| BV1PRDNBUEjN | 【】 | 黄梅戏 | 【香奈美翻唱】-填词-“黄梅小调・小美戏” |
| BV1KkDcB3Ega | 卡拉彼丘/ai | 世界扇我巴掌 | 【卡拉彼丘/ai香奈美】九万字dj 牢明有美助力，何忧剪刀难兴 |
| BV13WXaBrEjN | 卡拉彼丘/魔法少女的魔女裁判 | Bavellabion | 【卡拉彼丘/魔法少女的魔女裁判】ai香奈美 魔裁op LaVI-Bavellabion |
| BV1xhXEBbE3L | 【】alone again | alone again | 【AI香奈美】alone again |
| BV19dQZBDEoS | 【】那颗星梦见的春日 | 那颗星梦见的春日 | 【AI香奈美】那颗星梦见的春日 |
| BV1xdQfB6EKY | 【】远航星的告别 | 远航星的告别 | 【AI香奈美】远航星的告别 |
| BV1bXAgzBEtg | 卡拉彼丘/ai×星绘 | Da Capo | 【卡拉彼丘/ai香奈美×星绘】Da Capo 愿所有的美好都得到祝福 |
| BV1J3wxzZEvs | 【】日配 | 僕の戦争 | 【AI翻唱】香奈美日配-我的战争-进击的巨人OP-神圣放逐乐队（学习交流用） |
| BV1APckzyE6J | 【】雪地里传来了谢幕曲 | HEAVENLY JUMPSTYLE | 【AI香奈美】雪地里传来了谢幕曲 |
| BV1uTAQznEMF | 【】 | 在你的身边 | 【香奈美翻唱】- “在你的身边”:我想在你的身边 |
| BV1fQcQzaEgH | 卡拉彼丘/ai | 恋ひ恋う縁 (以恋结缘) | 【卡拉彼丘/ai香奈美】恋ひ恋ふ縁 |
| BV19qNuz2EYH | 卡拉彼丘/ai | 马儿眼里的世界 | 【卡拉彼丘/ai香奈美】马眼里的世界 |
| BV1WYNKzXEs9 | 卡拉彼丘/ai | 江南 | 【卡拉彼丘/ai香奈美】江南 |
| BV1vFNwzfEWx | 卡拉彼丘/ai | 春日影 (MyGO!!!!! ver.) | 【卡拉彼丘/ai香奈美】春日影 |
| BV1KwPbzJE4Y | 群青（） | 群青 | 群青（香奈美翻唱） |
| BV1KsZfBWEYB | 【】 | 还是你的笑容最可爱 | 【香奈美】- “还是你的笑容最可爱” |
| BV1waZfBUEzE | 【】 | 妄想感傷代償連盟 | 【香奈美】- “我希望这样一直和你在一起” |
| BV1U2ZNBzEpX | ❤️卡拉彼丘女团祝引航者们新年快乐❤️ | 有点甜 | ❤️卡拉彼丘女团祝引航者们新年快乐❤️ |
| BV1drF5zDEkB | 卡拉彼丘 | 如今 | 【卡拉彼丘 香奈美_AI翻唱】사랑해（除虫射日歌） |
| BV1Vj69BkE65 | “月儿弯弯 勾住了夜晚 璀璨 写下浪漫 洒落多少月色伴我烛光共枕眠” | 羡人间 | “月儿弯弯 勾住了夜晚 璀璨 写下浪漫 洒落多少月色伴我烛光共枕眠”/🎶香奈美 |
| BV1vKkjBrEw2 | 【】運命 | 運命(はるまきごはん×煮ル果実) | 【AI香奈美】運命  - はるまきごはん/煮ル果実（代投） |
| BV1kSkLBpECA | 【】Call Me | Call Me | 【AI香奈美】Call Me - Annabel（代投） |
| BV1kDkLBQE3E | 【】アウトライン（Outline） | アウトライン（Outline） | 【AI香奈美】アウトライン（Outline） - KOCHO（代投） |
| BV112kLBsEw4 | 【】Close Your Eyes | Close Your Eyes | 【AI香奈美】Close Your Eyes - 彩音（代投） |
| BV1U7iFBqEqN | 【】 | 镜听 | 【香奈美】-“因为梦没有留下种子  镜光嘲笑她的发丝” |
| BV1usrZB2E1N | 【】そんな夜でした（就是这样的夜晚） | そんな夜でした（就是这样的夜晚） | 【AI香奈美】そんな夜でした（就是这样的夜晚） - yuiko（代投） |
| BV1sYrZB3Ezh | 【】ささめく竜は飛ぶ夢を見ない | ささめく竜は飛ぶ夢を見ない | 【AI香奈美】ささめく竜は飛ぶ夢を見ない - yanaginagi（代投） |
| BV1T8rZBVEjQ | 【】トランキライザー（安定剂，Tranquilizer ） | トランキライザー（安定剂，Tranquilizer ） | 【AI香奈美】トランキライザー（安定剂，Tranquilizer ）- ichigo（代投） |
| BV1QzroB7Eic | 【】花绀青 | 花绀青 | 【AI香奈美】花绀青 - binaria（代投） |
| BV19eroBDEyG | 【】Nostalgia（乡愁） | Nostalgia（乡愁） | 【AI香奈美】Nostalgia（乡愁） - Garnet Crow（代投） |
| BV1mJiFBKEKn | 【】 | 我的歌声里 | 【香奈美】-“你存在我深深的脑海里  我的梦里我的心里我的歌声里” |
| BV1aQiFB5E1C | 【】 | 风起天阑 | 【香奈美】-“我看过花开和花谢 渐渐地回忆起喜悦” |
| BV1YBrPBMEV5 | “会不会我们的爱会被风吹向大海”星辰大海 | 星辰大海 | AI香奈美“会不会我们的爱会被风吹向大海”星辰大海 |
| BV1V9vrBcEdC | 【】 | 灼之花 | 【香奈美】-“请点燃我心的灼之花  让灰烬肆意飘洒” |
| BV1LDvrBAEyJ | 【】 | 欧若拉 | 【香奈美】-“爱是一道光 如此美妙” |
| BV1gzqrBtED3 | 「」你看世界好美 | 你看世界好美 | 「翻唱」你看世界好美 - 卡拉彼丘/宴宁 |
| BV1v5m9BbEm6 | 【】恋爱99~久久甜蜜在心坎~品尝你温柔宠爱~超完美的口感 | 喜欢你没道理 | 【AI香奈美】恋爱99~久久甜蜜在心坎~品尝你温柔宠爱~超完美的口感 |
| BV1sr27B3EgK | “我只有一句不后悔的成全”成全 | 成全 | AI香奈美“我只有一句不后悔的成全”成全 |
| BV1N3UPBGEYF | 【】 | 星の在り処 | 【香奈美翻唱】-星の在り処 (星之所在)-粉丝点歌 |
| BV1nUSiBFE6b | []Unite～为了与你相连～ | Unite ~君とつながるために~ (Unite~为了与你联系~) | [AI香奈美]Unite～为了与你相连～ |
| BV1A1SLBrEWj | [] 溯 (Reverse) | 溯 (Reverse) feat. 马吟吟 | [AI香奈美] 溯 (Reverse) - “我可以 躲进你的身体” |
| BV17typBBEA4 | “世界上最悲催的事是你暗恋某个女孩，而她开心的和另外一个人在一起” | 老男孩 | “世界上最悲催的事是你暗恋某个女孩，而她开心的和另外一个人在一起” |
| BV1UjC1BnEvX | “提拉米苏它的约定 是永远在一起”提拉米苏 | 提拉米苏 | AI香奈美“提拉米苏它的约定 是永远在一起”提拉米苏 |
| BV19jkCBUEZs | 〔08MS小队ED10 Years After〕十年之后，要成为狙爷喵！ | 10 YEARS AFTER | 〔AI香奈美翻唱08MS小队ED10 Years After〕十年之后，香奈美要成为狙爷喵！ |
| BV1fR2MB6E9W | 卡拉彼丘 | Hotel California | 【卡拉彼丘 香奈美_AI翻唱】Hotel California（加州旅馆） |
| BV15p1eBvELR | “吉隆坡的天气它是翻云又覆雨”打火机 | 打火机 | AI香奈美“吉隆坡的天气它是翻云又覆雨”打火机 |
| BV15RsEzREFf | 【】花月成双 | 花月成双 | 【香奈美】花月成双 |
| BV1MHstzuE7b | “十个男人七个傻八个呆”姐姐妹妹站起来 | 姐姐妹妹站起来 | AI香奈美“十个男人七个傻八个呆”姐姐妹妹站起来 |
| BV1AL4uzEEP7 | “不要怀疑赶紧 GIMME YOUR LOVE”GIMME YOUR LOVE | GIMME YOUR LOVE 670 | AI香奈美“不要怀疑赶紧 GIMME YOUR LOVE”GIMME YOUR LOVE |
| BV1idxKz8ESA | 我们还能肘赢卡拉彼丘吗？ | 大家一起喜羊羊 | 我们还能肘赢卡拉彼丘吗？ |
| BV1bNHWzXELT | “我想要 接住被那夜空抖落的星星”引力 | 引力 | AI香奈美“我想要 接住被那夜空抖落的星星”引力 |
| BV1o3J9zVEBh | 【】乌兰图雅 | 站在草原望北京 | 【AI香奈美】乌兰图雅 - 站在草原望北京 |
| BV1CHpRzKEn4 | “君不见青山豪杰冢化尘烟”天行九歌 | 天行九歌 | AI香奈美“君不见青山豪杰冢化尘烟”天行九歌 |
| BV1kVHkzFEG2 | “所以我决定 一个人去巴黎”一个人去巴黎 | 一个人去巴黎 | AI香奈美“所以我决定 一个人去巴黎”一个人去巴黎 |
| BV1FpahzDEHb | 【】伯虎说 | 伯虎说 (feat.唐伯虎Annie) | 【香奈美翻唱】伯虎说 |
| BV1hVazzfEDV | “我爱的就是你”爱的就是你 | 爱的就是你 | AI香奈美“我爱的就是你”爱的就是你 |
| BV1tytszqEnB | 【】约定好了，就我一人时，请好好抓住我的手 | おにごっこ | 【AI香奈美】约定好了，就我一人时，请好好抓住我的手 // AliA - おにごっこ |
| BV1kne1zKEey | 【】あいつら全員同窓会(那些家伙们的校友会) | あいつら全員同窓会 (那些家伙们的校友会) | 【AI香奈美】あいつら全員同窓会(那些家伙们的校友会) |
| BV1q8eozZEoZ | 【】いますぐ輪廻（即刻轮回 | いますぐ輪廻 | 【AI香奈美】いますぐ輪廻（即刻轮回 |
| BV14Ae8zaEc4 | 【】ムリムリ進化論 不行不行进化论 | ムリムリ進化論 | 【AI香奈美】ムリムリ進化論 不行不行进化论 |
| BV1iMegz4EgL | “那些情绪会说给风声听”与风告别 | 与风告别 | AI香奈美“那些情绪会说给风声听”与风告别 |
| BV1NtY1zqEj2 | 【 】恶魔之子 | 悪魔の子 | 【AI 香奈美】恶魔之子 |
| BV1khbrz5Ew6 | 【】春不晚 | 春不晚 | 【AI香奈美翻唱】春不晚 |
| BV13ebhzaEcG | 【】 | 可不可以 | 【香奈美翻唱】-【可不可以】-“可不可以和你在一起” |
| BV1LttszEEpo | 【】ナツノセ | ナツノセ | 【AI香奈美】ナツノセ - 感伤幽灵 |
| BV1pWthzLEQA | 【】夏天沙滩海风❤️就让海风吹呀吹呀吹~你与阳光同样的明媚❤️ | 夏天沙滩海风 | 【AI香奈美】夏天沙滩海风❤️就让海风吹呀吹呀吹~你与阳光同样的明媚❤️ |
| BV1npt4z8ELt | 【】不怕☺️我有勇气我都不怕~管他寒冬炎夏~ | 不怕 | 【AI香奈美】不怕☺️我有勇气我都不怕~管他寒冬炎夏~ |
| BV1JctxzdEwM | 【】说拜拜就拜拜😎何必再无休止倒带😎 | 说拜拜就拜拜 | 【AI香奈美】说拜拜就拜拜😎何必再无休止倒带😎 |
| BV1Zgt8zNEA9 | 【】 | 奶茶加糖 | 【香奈美翻唱】-【奶茶加糖】-“奶茶加糖 就是喜欢你” |
| BV1vMtqzDELh | 【】 | 日不落 | 【香奈美翻唱】-【日不落】-“你就是庆典 你就是晴天我的爱未眠” |
| BV1bUtJzbESy | 【】 | 生生世世爱 | 【香奈美翻唱】-【生生世世爱】-“生生世世喜欢引航者” |
| BV1DUtgzqEZ3 | “请和这样的我恋爱吧 ”快来和恋爱 | 请和这样的我恋爱吧 | AI香奈美“请和这样的我恋爱吧 ”快来和香奈美恋爱 |
| BV1YKhhzBE3c | 【】 | 粉色甜心 | 【香奈美翻唱】-【粉色甜心】-“Baby跟我走坐上爱的热气球” |
| BV1Mp8LzUEkq | 【】李荣浩 | 老街 | 【AI香奈美】李荣浩 - 老街 |
| BV1AE8nzdE6N | “不是因为很帅才喜欢上你的”好きだから。hm | 好きだから。 (因为我喜欢你。) | AI香奈美“不是因为很帅才喜欢上你的”好きだから。hm |
| BV1zP8JzjEa5 | 【】 | 已经有我啦（GotChu） | 【香奈美翻唱】-【已经有我啦】“想和你去到世界每个角落” |
| BV1UZbXzsEyK | 卡拉彼丘 | Be Shining | ~英文翻唱~《卡拉彼丘》香奈美新春贺曲「Be Shining」hm |
| BV1EugnzPECb | NikkeX卡拉彼丘 | Astronaut Airlines : Over the Horizon | [NikkeX卡拉彼丘]香奈美-Astronaut Airlines |
| BV1dauozFEfe | 【】 | 爱情专属权 | 【香奈美翻唱】-【爱情专属权】“老实交代昨天晚上为何回家晚” |
| BV1BFu9zsEoT | 边狱巴士x卡拉彼丘 | Fly,my wings | [边狱巴士x卡拉彼丘]飞吧，我的香奈美。香奈美-Fly,my wings |
| BV19dgNz1Ea9 | 【】😯无人扶我凌云志😫反正也上不去 | 😯无人扶我凌云志😫反正也上不去 | 【AI香奈美】😯无人扶我凌云志😫反正也上不去 |
| BV12oggznEbq | 边狱巴士x卡拉彼丘 | Hero | [边狱巴士x卡拉彼丘]星绘&香奈美-Hero |
| BV1A5gKzeE3b | 边狱巴士x卡拉彼丘 | Through Patches of Violet | [边狱巴士x卡拉彼丘]香奈美&拉薇-Through Patches of Violet（在那一片片紫色之间） |
| BV1fJunzaEmk | 【】 | 第二杯半价 | 【香奈美翻唱】-【第二杯半价】-“我多么想有一个  每天陪我喝奶茶的人” |
| BV1rjunzvEeY | 陪我打一辈子的卡拉比丘，好吗？ | 芭蕉夜雨 | 陪我打一辈子的卡拉比丘，好吗？ |
| BV1UyGTzUEUf | 【】ヨルシカ | 又三郎 | 【AI香奈美】ヨルシカ - 又三郎 // 吹→️け↑ば→青↑↓嵐↑→↓ |
| BV16vG4z4EhG | 【】 | 圈住你 | 【香奈美翻唱】-{圈住你}-“终于和你邂逅” |
| BV185GPzkE5n | 卡拉彼丘 | Infinity Heaven | 「卡拉彼丘」来聆听香奈美的歌声吧！香奈美大招BGM 吉他Cover |
| BV1mMGnzDE79 | “乌黑的空气朦胧的风景”你眼里带着笑 | 你眼里带着笑 | AI香奈美“乌黑的空气朦胧的风景”你眼里带着笑 |
| BV1Lg31zYEBC | 【】焦作😫现实太饿~吃掉我希望😫 | 焦作 | 【AI香奈美】焦作😫现实太饿~吃掉我希望😫 |
| BV1nV39zYEtq | 【】 | 恋風 | 【香奈美翻唱】-"恋風”-‘我喜欢你’ |
| BV1SR3EzmEXk | 【】蠢货🥰你说我的眼睛~我的美丽~是爱我的唯一❤️ | 蠢货 | 【AI香奈美】蠢货🥰你说我的眼睛~我的美丽~是爱我的唯一❤️ |
| BV1Bz3TzFEes | 【】QQ爱😫好想谈恋爱~噢 越想越难耐❤️ | QQ爱 | 【AI香奈美】QQ爱😫好想谈恋爱~噢 越想越难耐❤️ |
| BV1UkgSzPE9j | 【】 | 我超喜欢你 | 【香奈美翻唱】-‘我超喜欢你’"其实我超喜欢你 -超想和你在一起" |
| BV1yR3cz9E3H | 【】有点甜💕是你让我想要每天为你写一首情歌💕 | 有点甜 | 【AI香奈美】有点甜💕是你让我想要每天为你写一首情歌💕 |
| BV1LFK6zTEj8 | 你一定没见过穿烟锦集喵！进来吃喵!什么喵？封我十年喵？不要喵！（たぶん） | たぶん | 你一定没见过穿烟锦集喵！进来吃喵!什么喵？封我十年喵？不要喵！（AI香奈美たぶん） |
| BV1DoKdzVEQy | 【】 | 草莓圣代 | 【香奈美翻唱】-【草莓圣代】“咬一勺草莓圣代甜蜜不更改，你说此刻的我很可爱” |
| BV1ACKtzJEAV | “给你的爱一直很安静”一直很安静 | 一直很安静 | AI香奈美“给你的爱一直很安静”一直很安静 |
| BV1jSKAzMEXY | “我想我会开始想念你”恶作剧 | 恶作剧 | AI香奈美“我想我会开始想念你”恶作剧 |
| BV1xmMxzREka | 【】 | 日落风起 (女版) | 【香奈美翻唱】-“日落风起”时摘下一缕光在你心里安放 |
| BV1vLM7zyEAn | “我知道你知道在我心里你有多重要”早点见面 | 早点见面 | AI香奈美“我知道你知道在我心里你有多重要”早点见面 |
| BV1GQM3zdEZJ | 【】🥰看我哭过笑过又如何，我还是会大声唱着歌🥰 | 又活了一天 | 【AI香奈美】🥰看我哭过笑过又如何，我还是会大声唱着歌🥰 |
| BV1daTgzdE8q | []We Are Condemned To Be Free | We Are Condemned To Be Free (cn) | [AI香奈美]We Are Condemned To Be Free |
| BV1heT7zBE4Z | “扛住了柴米油盐的麻烦”喜欢 | 喜欢 | AI香奈美“扛住了柴米油盐的麻烦”喜欢 |
| BV1GB76zhE7S | 涡虫兔的卡拉彼丘视频喵 | Lemon | 那一天的奈美，哭了起来；只是因为门票，被送去来！【涡虫兔的卡拉彼丘视频喵】EP.08 |
| BV1Wr7nzoEAi | 【】❤️特别的爱给特别的你❤️ | 特别的爱给特别的你 | 【AI香奈美】❤️特别的爱给特别的你❤️ |
| BV1d67GzsEWA | “我和你就像蓝蓝的天边”我和你 | 我和你 | AI香奈美“我和你就像蓝蓝的天边”我和你 |
| BV1kQjuz4EDP | 火影忍者“Tell me what is on your mind”カラノココロ | カラノココロ | AI香奈美 火影忍者“Tell me what is on your mind”カラノココロ |
| BV1CWj4zzEFW | “我想和你 一起闯进森林潜入海底”失眠飞行 | 失眠飞行 | AI香奈美 “我想和你 一起闯进森林潜入海底”失眠飞行 |
| BV1VbJNzqEkL | 520特辑【】爱在西元前 | 爱在西元前 | 520特辑【AI香奈美】爱在西元前 |
| BV15GJhz5EVF | “想把自己放进冰箱呆上一天没人阻挡”放个大招给你看 | 放个大招给你看 | AI香奈美 “想把自己放进冰箱呆上一天没人阻挡”放个大招给你看 |
| BV1JfE9z7EpQ | 还记得你说家是唯一的城堡~（） | 稻香 | 还记得你说家是唯一的城堡~（AI香奈美） |
| BV1v9JgzREMC | “时针一直倒数着 我们剩下的快乐”倒数 | 倒数 | AI香奈美 “时针一直倒数着 我们剩下的快乐”倒数 |
| BV1DrEWz7EDn | ⚡灯光太耀眼⚡音乐在耳边⚡（） | 凑热闹 | ⚡灯光太耀眼⚡音乐在耳边⚡（AI香奈美） |
| BV19iEWzDEVE | ⚡baby我们的感情好像跳楼机⚡（） | 跳楼机 | ⚡baby我们的感情好像跳楼机⚡（AI香奈美） |
| BV1Ej7fztEvM | “Hey boy~你快偷偷看”you are mine | Hey boy~你快偷偷看”you are mine | AI香奈美 “Hey boy~你快偷偷看”you are mine |
| BV1ALVfzsEeo | “可惜我们终于来到一个句号”句号 | 句号 | AI香奈美 “可惜我们终于来到一个句号”句号 |
| BV1FG5LzhEvk | 什么叫粉毛大狙又不止我一个？！——Sanctuary Inside | Sanctuary Inside | 什么叫粉毛大狙又不止我一个？！——香奈美AI翻唱Sanctuary Inside |
| BV1nzV2zJEph | “我是心夏妈妈”我是心夏麻麻 | 我是初音未来 | AI香奈美“我是心夏妈妈”我是心夏麻麻 |
| BV1gEVczTEjN | 卡拉彼丘 | 美しい世界へ | ~日文翻唱~《卡拉彼丘》香奈美主題歌『美しい世界へ』 |
| BV1LZVEzYE1o | “talking to the moon 放不下的理由”心如止水 | 心如止水 | AI香奈美 “talking to the moon 放不下的理由”心如止水 |
| BV17CVGzUEWL | “Wu~爱情来的太快就像龙卷风”龙卷风 | 龙卷风 | AI香奈美 “Wu~爱情来的太快就像龙卷风”龙卷风 |
| BV1oRG9ztEHu | 【】结束乐队 | ギターと孤独と蒼い惑星 | 【AI香奈美】结束乐队 - 吉他、孤独与蓝色星球【孤独摇滚】結束バンド - ギターと孤独と蒼い惑星 |
| BV1R8GzzEEnj | 卡拉彼丘 | One Last Kiss | 【卡拉彼丘】One Last Kiss-ai香奈美 |
| BV1sFGvzWEUF | “啊啊啊啊啊啊啊啊”左手指月 | 左手指月 | AI香奈美 “啊啊啊啊啊啊啊啊”左手指月 |
| BV14JGizbEBb | 卡拉彼丘 | z | 【卡拉彼丘】a/z-瑞葵(mizuki)  香奈美日语ai翻唱 |
| BV1skG2zWE97 | 卡丘女团x迷光🌠Timeless☆Shooting☆Star🌠x米雪儿x心夏 | Timeless Shooting Star | 卡丘女团x迷光🌠Timeless☆Shooting☆Star🌠香奈美x米雪儿x心夏 |
| BV1NKLZzbExo | “转个圈圈慢慢地往前”凑热闹 | 凑热闹 | AI香奈美 “转个圈圈慢慢地往前”凑热闹 |
| BV1PfLXzmEX2 | 【】🔥坐🔥忘🔥道🔥 | 坐忘道 | 【AI香奈美】🔥坐🔥忘🔥道🔥 |
| BV1do5ezGEZQ | 【】银河偶像 强强高音 | かくれんぼ | 【AI香奈美】银河偶像 强强高音 // AliA - かくれんぼ |
| BV1NT5JznE2b | 【】情歌dz | 情歌 | 【AI香奈美】情歌dz |
| BV1yX5hzEEFx | 卡拉彼丘 | Rage your dream | 【卡拉彼丘】我的副驾座位焊死在你喜欢的角度 |
| BV1jq5qz9Edz | “我们背对背拥抱”背对背拥抱 | 背对背拥抱 | AI香奈美 “我们背对背拥抱”背对背拥抱 |
| BV16LoTYNEad | 卡拉彼丘 | Be Shining | ~英文翻唱~《卡拉彼丘》香奈美新春贺曲「Be Shining」 |
| BV1r2oNYKEkY | 卡拉彼丘 | 願い〜あの頃のキミへ〜 | 【卡拉彼丘 香奈美_AI翻唱】願い~あの頃のキミへ |
| BV1vioLYXE6h | “不是因为很帅才喜欢上你的”好きだから。 | 好きだから。 (因为我喜欢你。) | AI香奈美“不是因为很帅才喜欢上你的”好きだから。 |
| BV1ZydLYWEhx | “叮叮当 QQ响起会是谁呢NaYo”东京不太热 | 东京不太热 | AI香奈美“叮叮当 QQ响起会是谁呢NaYo”东京不太热 |
| BV1yNdGYWEKZ | “Oh no, don’t tell me you’re afraid of cats”Witches' Party | Witches' Party (feat. Shiroroll) | AI香奈美“Oh no, don’t tell me you’re afraid of cats”Witches' Party |
| BV1vFRUYzEtu | “我学着一个人一整天都不失落”自娱自乐 | 自娱自乐 | AI香奈美“我学着一个人一整天都不失落”自娱自乐 |
| BV1WeRRY6EQB | “あぁ このまま僕たちの声が”夢灯籠 | 夢灯籠 | AI香奈美“あぁ このまま僕たちの声が”夢灯籠 |
| BV1r8ZZYDEu6 | “数着一圈圈年轮我认真”年轮 | 年轮 | AI香奈美“数着一圈圈年轮我认真”年轮 |
| BV1cDfKYgEu5 | 〖〗那家花店 | 那家花店 | 〖AI香奈美〗那家花店 |
| BV1oDfPYhEWd | 【】花標 _ 爱夏的炼金工房~黄昏大地之炼金术士dz | 过期（OT:花標） | 【AI香奈美】花標 _ 爱夏的炼金工房~黄昏大地之炼金术士dz |
| BV19bZsYVEWz | 〖Ai〗 | 千年泪 | 〖Ai香奈美〗-千年泪 |
| BV13MZGYuEV7 | “Kiss Kiss Shy Shy”Kiss Kiss Shy Shy (1 | Kiss Kiss Shy Shy | AI香奈美“Kiss Kiss Shy Shy”Kiss Kiss Shy Shy (1 |
| BV1WiovYsEPr | “はいっ 1 2 3 4 ぷーん はぁ ちーん”七草くりむ | はいっ 1 2 3 4 ぷーん はぁ ちーん”七草くりむ | AI香奈美 “はいっ 1 2 3 4 ぷーん はぁ ちーん”七草くりむ - だいあるのーと |
| BV1scotYKEpi | []美丽之物 | 美しきもの | [AI香奈美]美丽之物 |
| BV1JCoyYrEA2 | 【】ツユ | あの世行きのバスに乗ってさらば。 (乘坐前往彼世的公交车以告别。) | 【AI香奈美】ツユ - あの世行きのバスに乗ってさらば。 |
| BV1XFomYqEPD | []Fly me to the star | Fly Me to the Star | [AI香奈美]Fly me to the star |
| BV1QpXYYDEBK | []Alone | Alone | [AI香奈美]Alone |
| BV1TdQzY8ENT | “鼓起勇气 联系 方式我拿到”见面就告白吧 | 流星雨 | AI香奈美“鼓起勇气 联系 方式我拿到”见面就告白吧 |
| BV16QQ7YXEQx | 【】洛天依 | 八辈子 | 【AI香奈美】洛天依 - 八辈子 |
| BV1mhRpYpEUV | 【】baby我们的感情好像跳楼机~ | 跳楼机 | 【AI香奈美】baby我们的感情好像跳楼机~ |
| BV1pMPTexE1P | 【】可愛くなりたい（想要变得可爱） | 可愛くなりたい | 【AI香奈美】可愛くなりたい（想要变得可爱） |
| BV1GvPFe9EDp | 【】心墙——Singby | 心墙 | 【AI翻唱】心墙——Singby香奈美 |
| BV1oMPcecE5h | 【】Ture（因你而在的故事） | TruE | 【AI香奈美】Ture（因你而在的故事） |
| BV18yAEeiEd9 | 【】恋ひ恋う縁（以恋结缘） | 恋ひ恋う縁 (以恋结缘) | 【AI香奈美】恋ひ恋う縁（以恋结缘） |
| BV1y3AjenEmm | 【】雨爱 | 雨爱 | 【AI香奈美】雨爱 |
| BV1XkAreKEyU | 【】情歌 | 情歌 | 【AI香奈美】情歌 |
| BV1zTA6e3EAG | 【】在银河中孤独摇摆 | 在银河中孤独摇摆 | 【AI香奈美】在银河中孤独摇摆 |
| BV1hcwdeqEbo | 【】使一颗心免于哀伤 | 使一颗心免于哀伤 | 【AI香奈美】使一颗心免于哀伤 |
| BV1VTAVe4Ef3 | 【】多远都要在一起 | 多远都要在一起 | 【AI香奈美】多远都要在一起 |
| BV1ohATe1EGG | 【】希望有羽毛和翅膀 | 希望有羽毛和翅膀 | 【AI香奈美】希望有羽毛和翅膀 |
| BV1ErKseCEsm | [] 爱的供养 | 爱的供养 | [AI香奈美] 爱的供养 |
| BV1qQK7eXEmW | [] 不是因为寂寞才想你 | 不是因为寂寞才想你 | [AI香奈美] 不是因为寂寞才想你 |
| BV16EN6eDEEV | []入戏太深 | 入戏太深 | [AI香奈美]入戏太深 |
| BV1MSNHemEfY | “只是怕亲手将我的真心葬送”—— | 太聪明 | “只是怕亲手将我的真心葬送”——AI香奈美 |
| BV19cNcefEYj | 【】“卡丘世界是一种假象，对吧？”Duvet | Duvet | 【香奈美翻唱】“卡丘世界是一种假象，对吧？”Duvet翻唱 |
| BV1drNceaEMC | 【】群青 | 群青 | 【香奈美翻唱】群青 |
| BV1tqPXeAEtA | 卡拉比丘 | モニタリング | 【卡拉比丘】香奈美（视监）モニタリング |
| BV1gffnYcEuj | 【】火花／ヒバナ【DECO*27】 | ヒバナ (火花) | 【AI香奈美】火花／ヒバナ【DECO*27】 |
| BV1MwwYeBEQM | 【】花標 | 过期（OT:花標） | 【AI香奈美】花標 / 爱夏的炼金工房~黄昏大地之炼金术士 |
| BV1GQcdezEWm | 【】兰花草 | 兰花草 | 【AI香奈美】兰花草 |
| BV1R4coeyEoJ | 【】富士山下 | 富士山下 | 【AI香奈美】富士山下 |
| BV1yGwGegEda | 【】Who Says | Who Says | 【AI香奈美】Who Says |
| BV1gDcJeeEP1 | 【】朝鲜人民军军歌 | 朝鲜人民军军歌 | 【AI香奈美】朝鲜人民军军歌 |
| BV15z6gYbE9e | 【】虫儿飞 | 虫儿飞 | 【AI香奈美】虫儿飞 |
| BV1rx6gYTEFn | 【】“如果全世界我也可以放弃，至少还有你值得我去珍惜” | 至少还有你 | 【AI香奈美】“如果全世界我也可以放弃，至少还有你值得我去珍惜” |
| BV1rW6gYBEB9 | 【】“爱真的需要勇气，来面对流言蜚语” | 勇气 | 【AI香奈美】“爱真的需要勇气，来面对流言蜚语” |
| BV1JD6eYMEz6 | 【】童年 | 童年 | 【AI香奈美】童年 |
| BV1z96eYKE3w | 【】鲁冰花 | 鲁冰花 | 【AI香奈美】鲁冰花 |
| BV16RCVYREhi | 【】射杀恋人之日—败犬TV之射射引航者 ai | 恋人を射ち堕とした日 (射杀恋人的那天) | 【香奈美】射杀恋人之日—败犬TV之射射引航者 ai香奈美翻唱 |
| BV1nJCKYiEeF | 【】白雪 ~sirayuki~ 经典v曲鉴赏 | 白雪 ～sirayuki～ | 【香奈美】白雪 ~sirayuki~ 经典v曲鉴赏 |
| BV1K6kAYaEsB | 【】“我不再迷茫，思念是唯一的行囊” | 你从未离去 | 【AI香奈美】“我不再迷茫，思念是唯一的行囊” |
| BV1PkkAYcEmi | 【】王妃 | 王妃 | 【AI香奈美】王妃 / “你是说小美变成了高攀不起的王妃？” |
| BV1k2kAY4E8x | 【】大江戸コントローラー | 大江戸コントローラー (Batsu Remix) | 【AI香奈美】大江戸コントローラー |
| BV1uYkAYTERk | 【】Snooze | snooze(feat. SHIKI) | 【AI香奈美】Snooze / 够二次元吗？不够卸了（指你勾卡） |
| BV12zkAYwEeS | 【】Мой мармеладный（我的橘子酱❤） | My Marmalade | 【AI香奈美】Мой мармеладный（我的橘子酱❤） |
| BV1Dmz4YAEeN | 【】左手右手 | 左手右手 | 【AI香奈美翻唱】左手右手 |
| BV1scztYsEPD | 【】“而我已经分不清，你是友情还是错过的爱情” | 蒲公英的约定 | 【AI香奈美】“而我已经分不清，你是友情还是错过的爱情” |
| BV1tvztYcE7D | 【】“天青色等烟雨，而我在等你” | 青花瓷 | 【AI香奈美】“天青色等烟雨，而我在等你” |
| BV1nESuYxESo | 【】隐形的翅膀（ai卡拉彼丘角色） | 隐形的翅膀 | 【AI香奈美翻唱】隐形的翅膀（ai卡拉彼丘角色翻唱） |
| BV15ambYhEKg | 【】残酷天使的行动纲领 | 残酷な天使のテーゼ (残酷天使的行动纲领) | 【AI香奈美翻唱】残酷天使的行动纲领/残酷な天使のテーゼ（半成品模型） |
| BV1kBm8YLE5D | 蔚蓝档案/卡拉彼丘/佳代子 | 蔚蓝档案 | 【蔚蓝档案/卡拉彼丘/AI佳代子】你看 世界好美（香奈美主题曲） |
| BV1F1mpYtEkj | 卡拉彼丘 | 君は薔薇より美しい | 【卡拉彼丘 香奈美_AI翻唱】你比蔷薇更美丽 君は薔薇より美しい |
| BV1fLStYgE64 | 我⚡怎⚡么⚡用⚡力⚡也⚡瞄⚡不⚡到⚡你⚡心⚡里~😭😭😭（ai） | 还是会想你 | 我⚡怎⚡么⚡用⚡力⚡也⚡瞄⚡不⚡到⚡你⚡心⚡里~😭😭😭（ai香奈美） |
| BV1E715YoEwq | 卡拉彼丘 | 夢ノ結唱POPY | 【夢ノ結唱POPY】ksm：你看 世界好美（《卡拉彼丘》香奈美角色主题曲）【Synthesizer V Cover】Hi-Res无损 |
| BV1Kd1XYLEVF | 【】素颜但是BYD卡丘的特供版 | 素颜 | 【AI香奈美】素颜但是BYD卡丘的特供版 |
| BV15fxDedEYH | 卡拉彼丘 | 成长的路口 | 【卡拉彼丘】回家路上的猫猫头 |
| BV18GWreJEw6 | 卡拉彼丘 | 夢ノ結唱ROSE | 【夢ノ結唱ROSE】你看 世界好美（《卡拉彼丘》香奈美角色主题曲）【Synthesizer V Cover】 |
| BV1awWNenEUW | 卡拉彼丘 | Never gonna give you up | 【卡拉彼丘 香奈美_AI翻唱】never gonna give you up |
| BV1oTYUeME3D | []雨天 | 第一天 | [AI香奈美]雨天 |
| BV1jhY7epEt7 | 卡拉彼丘 | 可愛くなりたい | 【卡拉彼丘 香奈美_AI翻唱】可愛くなりたい |
| BV1cCayeNEuP | 【】月亮惹的祸 | 月亮惹的祸 | 【AI香奈美】月亮惹的祸 |
| BV1JcYNeWExu | 【】失恋不怪他联盟 | 失恋阵线联盟 | 【AI香奈美】失恋不怪他联盟 |
| BV1LRadexE6x | 【】童话镇 | 童话镇 | 【AI香奈美】童话镇 |
| BV1BCvKehEqG | []如果爱忘了 | 如果爱忘了 | [AI香奈美]如果爱忘了 |
| BV1Z58weKEjh | 卡拉彼丘 | 你看世界好美 | 【翻唱/洛天依xs】《卡拉彼丘》香奈美主题曲「你看世界好美」 |
| BV1BL3aeGEZF | [] 侧脸 | 侧脸 | [AI香奈美] 侧脸 |
| BV1YgTbe5E7c | 【】 | 願い~あの頃のキミへ~ | 【AI香奈美】-把回忆拼好给你 |
| BV1PM4m1o7vR | 【】恋ダコ (茧•爱)——真的真的好喜欢你，还没注意到吗 | 恋ダコ (茧•爱)——真的真的好喜欢你，还没注意到吗 | 【AI香奈美】恋ダコ (茧•爱)——真的真的好喜欢你，还没注意到吗 |
| BV1qm41117fy | 【】あなたは煙草 私はシャボン (你是烟草，而我是泡沫) | Anata ha tabaco watashi ha syabon | 【AI香奈美】あなたは煙草 私はシャボン (你是烟草，而我是泡沫) |
| BV1Rw4m1y7AT | [] 我们是剪刀手我们为自由而来 | 我们是剪刀手我们为自由而来 | [AI香奈美] 我们是剪刀手我们为自由而来 |
| BV1nD421T7kg | [] 轻语之韵 | 轻语之韵 | [AI香奈美] 轻语之韵 |
| BV1Fm411m7Mm | [] 小欣喜 | 小欣喜 | [AI香奈美] 小欣喜 |
| BV1oM4m1Z7AA | [] 情感摇摆 | 情感摇摆 | [AI香奈美] 情感摇摆 |
| BV1KD421J7Fw | [] 恋爱心语 | 恋爱心语 | [AI香奈美] 恋爱心语 |
| BV1Jt421j7Yn | [] 糖果心跳 | 糖果心跳 | [AI香奈美] 糖果心跳 |
| BV16C41137AY | [] 困困困 | 困困困 | [AI香奈美] 困困困 |
| BV1HH4y1N7wP | [] 电子情书 | 电子情书 | [AI香奈美] 电子情书 |
| BV17t421P7K9 | [] 爱的视线 | 爱的视线 | [AI香奈美] 爱的视线 |
| BV1Nr421V7N4 | [] OK | OK | [AI香奈美] OK |
| BV1vr421V7ix | [] 夏日午后 | 夏日午后 | [AI香奈美] 夏日午后 |
| BV1tE421T7tj | [] 甘い一日 | 甘い一日 | [AI香奈美] 甘い一日 |
| BV1iE421T7SD | []sweet whisper | sweet whisper | [AI香奈美]sweet whisper |
| BV1Sr421V75E | 【】唱520AM | 5:20AM（刀酱版） | 【AI翻唱】香奈美唱520AM |
| BV1H1421m7iS | []Dreamy Serenade | Dreamy Serenade | [AI香奈美]Dreamy Serenade |
| BV1UA4m1w71H | 【】心墙 | 心墙 | 【AI香奈美】心墙 |
| BV141421m72a | []light for you | light for you | [AI香奈美]light for you |
| BV15K421a7fE | []Step to the beat | Step to the beat | [AI香奈美]Step to the beat |
| BV1it421J7Au | []SunShine love | SunShine love | [AI香奈美]SunShine love |
| BV1Mt421J7CD | []Forever and Always | Forever and Always | [AI香奈美]Forever and Always |
| BV1hx4y1Y7xh | []echoes of silence | echoes of silence | [AI香奈美]echoes of silence |
| BV1cx4y1Y7Fg | []desire's beat | desire's beat | [AI香奈美]desire's beat |
| BV12Z421q71g | （）林达浪 | 还是会想你 | （AI香奈美）林达浪/h3R3-还是会想你 |
| BV142421T7jW | 卡拉彼丘 | 你看世界好美 | ~英文翻唱~《卡拉彼丘》香奈美主题曲「你看世界好美」 |
| BV1YW421w7wr | 卡拉彼丘 | a-ha…! | 【日语翻唱】「你看世界好美」/「美しき世界」/《卡拉彼丘》香奈美主题曲 |
| BV13i421Z7zc | 卡拉彼丘 | 浮気されたけどまだ好きって曲。 (被劈腿了可我还是爱你) | 【卡拉彼丘/AI香奈美】被劈腿了可我还是爱你。 |
| BV1yC411H7Nf | [ ] One Last Kiss | One Last Kiss | [AI 香奈美] One Last Kiss |
| BV1Sx4y1y7iQ | 卡拉彼丘 | 你看世界好美 | 香奈美的小曲，但是超爽remix！【卡拉彼丘】【你看世界好美】 |
| BV1Xu4m1A76M | “我真的真的很喜欢你”【】I Really Like You | I Really Like You | “我真的真的很喜欢你”【AI香奈美】I Really Like You |
| BV19C41147rG | 【】我推的~ | アイドル | 【AI香奈美】我推的香奈美~ |
| BV18K421k7h9 | 卡拉彼丘 | Love story | “这份爱如此曲折艰难 但真实可触”【卡拉彼丘AI香奈美】Love Story |
| BV11p421R72m | 【】画心——就让你在别人怀里快乐 | 画心 | 【AI香奈美】画心——就让你在别人怀里快乐 |
| BV14u4m1P7xy | 【】闽南金曲——愛拼才會贏 | 爱拼才会赢 | 【AI香奈美】闽南金曲——愛拼才會贏 |
| BV1Lt421a7dV | 【】今天你要嫁给我 | 今天你要嫁给我 | 【AI香奈美】今天你要嫁给我 |
| BV1Rz421R7cm | 【】一个人想着一个人 | 一个人想着一个人 | 【AI香奈美】一个人想着一个人 |
| BV1dm411D7vq | 你看世界好美【】 | 你看世界好美 | 你看世界好美【AI香奈美】 |
| BV127421N7TB | 【】财神来到我家门 | 财神来到我家门 | 【AI香奈美】财神来到我家门 |
| BV1N4421w7GC | 【】室内系的TrackMaker | インドア系ならトラックメイカー | 【AI香奈美】室内系的TrackMaker |
| BV14m411X7zQ | 【】春日影，但是大舌头 | 春日影 (MyGO!!!!! ver.) | 【AI香奈美】春日影，但是大舌头香奈美 |
| BV1FJ4m1x72F | 【】近日，剪刀手知名偶像于舞台当众放毒 | ベノム | 【AI香奈美】近日，剪刀手知名偶像于舞台当众放毒 |
| BV1Vt421p7xT | 卡拉彼丘 | 恭喜发财 | 【卡拉彼丘】AI心夏 恭！喜！发！财！ |
| BV1Zy421a7Md | 【】情人总分分合合~ | 我们的歌 | 【AI香奈美】情人总分分合合~ |
| BV16F4m1u7mN | 【】はじめましての気持ちを | はじめましての気持ちを (初见的心情) | 【AI香奈美】はじめましての気持ちを |
| BV1HB42167c5 | 【】打ち上げ花火 | 打上花火 | 【AI香奈美】打ち上げ花火 |
| BV1xF4m1373Z | 【】那时候手心余温刚好~ | 银河与星斗 | 【AI香奈美】那时候手心余温刚好~ |
| BV1r6421g7KR | 【】你背过身 任由狂风轻易地吹灭我~ | 循迹 | 【AI香奈美】你背过身 任由狂风轻易地吹灭我~ |
| BV15A4m1j7FE | 【】一样的月光，但是大舌头 | 一样的月光 | 【AI香奈美】一样的月光，但是大舌头香奈美 |
| BV1jU421Z7Ge | 【】金戈铁马身披麒麟甲 我要追你到落霞~ | 离人赋 | 【AI香奈美】金戈铁马身披麒麟甲 我要追你到落霞~ |
| BV19U421o79K | 【】不愿只做造梦少女 | yumemiru shoujo ja irarenai | 【AI香奈美】香奈美不愿只做造梦少女 |
| BV1Wt421H7eX | 【】手写的从前 | 手写的从前 | 【AI香奈美】手写的从前 |
| BV1cU421Z7RC | 【】青花瓷 | 青花瓷 | 【AI香奈美】青花瓷 |
| BV1bx42197vm | 【】萨卡班甲鱼，但是大舌头 | サカサカバンバンバスピスピス | 【AI香奈美】萨卡班甲鱼，但是大舌头香奈美 |
| BV1fk4y1Z72T | 【】Letting Go | Letting Go | 【AI香奈美】Letting Go |
| BV1S5411y7BY | 【】千千阙歌 | 千千阙歌 | 【AI香奈美】千千阙歌 |
| BV16e411E7S6 | 【】想陪你度过漫长岁月 | 陪你度过漫长岁月 | 【AI香奈美】香奈美想陪你度过漫长岁月 |
| BV1Mp4y1m7t8 | 【】赤伶 | 赤伶 | 【AI香奈美】赤伶 |
| BV1Tp4y1m7zs | 卡拉彼丘/生贺手书 | だきしめるまで。(feat. 可不) | 【卡拉彼丘/生贺手书】输了小熊，输了比赛，但她还是那道指引我的光 |
| BV1Zw411j7r3 | 【】错位时空，但是大舌头 | 错位时空 | 【AI香奈美】错位时空，但是大舌头香奈美 |
| BV17N4y1J7vD | 【】红色高跟鞋，但是大舌头 | 红色高跟鞋 | 【AI香奈美】红色高跟鞋，但是大舌头香奈美 |
| BV1sa4y1C7gx | 【】劝你菜就多练 | 劝你菜就多练 | 【AI香奈美】香奈美劝你菜就多练 |
| BV1ZK411a7b6 | 【】神兵小将ED 不怕 | 不怕 | 【AI香奈美】神兵小将ED 不怕 |
| BV1fc411e7pj | 【】玫瑰花的葬礼，但是大舌头 | 玫瑰花的葬礼 | 【AI香奈美】玫瑰花的葬礼，但是大舌头香奈美 |
| BV1hN4y1H7Xi | 【】匆匆那年，但是大舌头 | 匆匆那年 | 【AI香奈美】匆匆那年，但是大舌头香奈美 |
| BV1Uk4y1U75D | 【】故事早就该停在那次离散，但是大舌头 | 看穿 | 【AI香奈美】故事早就该停在那次离散，但是大舌头香奈美 |
| BV1Mi4y1s7SN | 【】在你眼中我是谁 | 谁 | 【AI香奈美】在你眼中我是谁 |
| BV1Aw411j7Dh | 【】爱是一道光，但不是绿色 | 欧若拉 | 【AI香奈美】爱是一道光，但不是绿色 |
| BV1Sk4y1D7t7 | 【】怎样的我能让你更想念，但是大舌头 | 下雨天 | 【AI香奈美】怎样的我能让你更想念，但是大舌头香奈美 |
| BV1sK411a7N4 | 【】七月七日晴，但是大舌头 | 七月七日晴 | 【AI香奈美】七月七日晴，但是大舌头香奈美 |
| BV1Vi4y1q7ho | 【】音乐停下来，你将离场，但是大舌头 | 旋木 | 【AI香奈美】音乐停下来，你将离场，但是大舌头香奈美 |
| BV1Ki4y1q78V | 【】引航者的心有一道墙，但是大舌头 | 心墙 | 【AI香奈美】引航者的心有一道墙，但是大舌头香奈美 |
| BV1Ww411G7xr | 卡拉彼丘 | 冬の花 | 【卡拉彼丘 香奈美_AI翻唱】冬の花（冬之花） |
| BV1cw411H7iY | 【】世末歌者 | 世末歌者 | 【AI香奈美】世末歌者 |
| BV1Uj411L7ET | 【】深海少女 | 深海少女 | 【AI香奈美】深海少女 |
| BV1RM411d7GU | 卡拉彼丘/配音手书 | 断了的弦 | 【卡拉彼丘/配音手书】引航者，你会来吗.......？ |
| BV1ea4y1Z7X3 | 【】淋雨一直走 | 淋雨一直走 | 【AI香奈美】淋雨一直走 |
| BV12u411T7aw | 卡拉彼丘xTHE FIRST TAKE | ノンブレス・オブリージュ (Non-breath oblige) | 【卡拉彼丘xTHE FIRST TAKE】无呼吸义务香奈美 Non-breath oblige 【cover plus mmd】 |
| BV1Zz4y1V7gz | 卡拉彼丘MMD | 横竖撇点折 | 【卡拉彼丘MMD】香奈美 - 横竖撇点折 |

## Blocked auto-fixes

| BVID | Current | Candidate | Video title |
| --- | --- | --- | --- |
| BV1n3wxzZETp | 【】日配 | 日配 | 【AI翻唱】香奈美日配-BRETHLESS-ALDNOAH ZERO插曲-泽野弘之 小林未郁（自用） |
| BV1MyYqz9E5s | 香保会会长最新力作♪Be Shining【】 | 香保会会长最新力作♪Be Shining | 香保会会长最新力作♪Be Shining【翻唱】 |
| BV17NogYzEUi | 【】r | r | 【AI香奈美】r-906 / LeuR - ユメミ（做梦） |
| BV1XddBY5Ebu | []TNT弹道轨迹，还有人记得这个游戏吗？ | TNT弹道轨迹，还有人记得这个游戏吗？ | [AI香奈美]TNT弹道轨迹，还有人记得这个游戏吗？ |
| BV1heDVYREXQ | （）然而世界绝对不是灰色，剪刀手征兵广告！你看 世界好美 | 然而世界绝对不是灰色，剪刀手征兵广告！你看 世界好美 | （cover）然而世界绝对不是灰色，剪刀手征兵广告！你看 世界好美-卡拉彼丘/宴宁 |
| BV18A4m157CQ | 【】一路生花，但是大舌头 | 一路生花，但是大舌头 | 【AI香奈美】一路生花，但是大舌头香奈美 |

## Still questionable names

| BVID | Name | Reason | Video title |
| --- | --- | --- | --- |
| BV1V6j16hE3w | 当得知引航者进厂后的小美 | looks-like-title-or-lyric | 当得知引航者进厂后的小美 |
| BV1Tm7P6BEga | 卡拉彼丘/×米雪儿 | character-or-game-token | 【卡拉彼丘/香奈美×米雪儿】念张师 |
| BV1Xcjp6ZEE3 | 小美 | looks-like-title-or-lyric | 【AI小美】“满纸荒唐中窥见满脸沧桑 / 触到神经就要懂得鼓掌" |
| BV1z6LR6tENy | ai小美 | looks-like-title-or-lyric | 【ai小美】 不敢回看，左顾右盼不自然的暗自喜欢 |
| BV1y7EA6AEx1 | 下课小美 | looks-like-title-or-lyric | 下课小美 |
| BV1d5V56KErf | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】粉色夕阳，香奈美伊薇特与你 |
| BV1MtVW6JENN | 小美提醒过去的自己... | looks-like-title-or-lyric | 小美提醒过去的自己... |
| BV1fL5f6TERi | 小美打金服 | looks-like-title-or-lyric | 小美打金服 |
| BV1Yt5m68ERL | 小美豪到我了喵 | looks-like-title-or-lyric | 小美豪到我了喵 |
| BV1Dn9fBHEs3 | 拉格泰姆小美 | looks-like-title-or-lyric | 拉格泰姆小美 |
| BV18X9rBiEFk | 吟游诗人小美 | looks-like-title-or-lyric | 吟游诗人小美 |
| BV1aaoQBkELY | 卡拉彼丘倒下来 | character-or-game-token | 卡拉彼丘倒下来 |
| BV1KsoDBbETu | 浴室（纯小美版） | looks-like-title-or-lyric | 浴室（纯小美翻唱版） |
| BV1GvdfBfEsE | 选角小美 | looks-like-title-or-lyric | 选角小美 |
| BV1B6dWBBECF | 卡拉彼丘ai | character-or-game-token | 【卡拉彼丘ai香奈美】你是喜欢着我的对吧喵！ |
| BV1rbQbB2EaS | 神秘转圈小美边转边唱ハイウェイ | looks-like-title-or-lyric | 神秘转圈小美边转边唱ハイウェイ |
| BV1X3DiBEEbh | 商城小美 | looks-like-title-or-lyric | 商城小美 |
| BV19dSRBTEiP | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】香奈美期待与你相见喵 |
| BV1Q5SXB4EUZ | 坐牢小美 | looks-like-title-or-lyric | 坐牢小美 |
| BV1YhDAB4Ef9 | 新闻联播小美 | looks-like-title-or-lyric | 新闻联播小美 |
| BV168XvBPEDj | 天气预报小美 | looks-like-title-or-lyric | 天气预报小美 |
| BV1QsX1B7Ed1 | 大招小美 | looks-like-title-or-lyric | 大招小美 |
| BV1R6XWBoEvh | 小美快跑 | looks-like-title-or-lyric | 小美快跑 |
| BV16aQ6B5E6a | 天空之城小美 | looks-like-title-or-lyric | 天空之城小美 |
| BV1JhAHzpEij | 小美的夏天 | looks-like-title-or-lyric | 小美的夏天 |
| BV1JYwBzwEf4 | 婚礼小美 | looks-like-title-or-lyric | 婚礼小美 |
| BV1hsw2zzEe7 | 土耳其小美 | looks-like-title-or-lyric | 土耳其小美 |
| BV19qw3zCEsL | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】星绘是坏女人喵 |
| BV1n3wxzZETp | 【】日配 | punctuation-residue | 【AI翻唱】香奈美日配-BRETHLESS-ALDNOAH ZERO插曲-泽野弘之 小林未郁（自用） |
| BV1XDcCzcEMR | 蓝色多瑙河小美 | looks-like-title-or-lyric | 蓝色多瑙河小美 |
| BV1ZbwFznEHX | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】你是真的玩大了喵 |
| BV1XTcRzFEQK | 欢乐颂小美 | looks-like-title-or-lyric | 欢乐颂小美 |
| BV1qZNczcEVH | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】雑踏、僕らの街 |
| BV1ajPpzyEnh | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】打一辈子卡拉彼丘吧喵 |
| BV1kqP1zbELX | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】香奈美动了资本的蛋糕喵 |
| BV1FrP1zoEoT | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】走夜路喵 |
| BV1wDPKzEEc6 | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】包养一个可以和我打卡的人喵 |
| BV1JKPPzzEee | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】元宵节吃汤圆喵 |
| BV1EMPPzMEdz | 卡拉彼丘/ai | character-or-game-token | 【卡拉彼丘/ai香奈美】寒假是个好女孩喵 |
| BV1w9PJzXEhy | 锁（小美失败版） | looks-like-title-or-lyric | 锁（小美翻唱失败版） |
| BV1PyZvBpEhg | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】不要离开香奈美，可以吗 |
| BV1RecNztELb | 卡丘情人节特辑：你愿意.......和我打一辈子卡拉彼丘吗喵？ | character-or-game-token, looks-like-title-or-lyric | 卡丘情人节特辑：你愿意.......和我打一辈子卡拉彼丘吗喵？ |
| BV1egcwz7Eap | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】今天是约会版香奈美哦 |
| BV18t6gBLEjM | ai | metadata-not-song | 【ai香奈美】device检视红宝石过马路第一视角 |
| BV1vLkFBhEYs | 小基米跟我比夹💕夹喵？ | looks-like-title-or-lyric | 香奈美：小基米跟我比夹💕夹喵？ |
| BV1LV69ByEUs | 不倦之人(Athena, the Tireless One) | looks-like-title-or-lyric | 不倦之人香奈美(Athena, the Tireless One) |
| BV1sX6DBnEQo | 你看！世界好美！ | looks-like-title-or-lyric | 莫宁教授翻唱香奈美歌曲《你看！世界好美！》 |
| BV1nqrgBAEj1 | 卡丘丘 | looks-like-title-or-lyric | 你说得对，但是♫月火水木金土日♫每天都是holiday~♫ 【AI卡丘丘】スリーズブーケ - Holiday∞Holiday【香奈美×心夏】 |
| BV1mfiXBJEHw | Ai | metadata-not-song | 【Ai香奈美】东南苦行山（代投） |
| BV16riiBoEDU | 虚拟 | metadata-not-song | [AI香奈美]"我们不是干净的朋友，也不是敞亮的爱人."-《虚拟》 |
| BV1G9i3BkEzn | 元旦快乐喵！ | looks-like-title-or-lyric | 元旦快乐喵！ |
| BV18HBjBoE7L | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】引航者，香奈美心里还有好多话想对你说 |
| BV1UWBjBsEC7 | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】引航者，香奈美不想失去你QAQ |
| BV1HUmWB9Ey8 | 我可以玩吗？ | looks-like-title-or-lyric | 《我可以玩香奈美吗？》你看!世界好美 清唱翻唱 |
| BV1KZCXBiEpR | “在这卡丘里， 有一张我最想送的门票” | looks-like-title-or-lyric | “在这卡丘里， 有一张我最想送的门票” |
| BV1vPCRBnEjx | 卡拉彼丘 | character-or-game-token, metadata-not-song | 【卡拉彼丘】你又拉黑了我，还好我还有小号可以继续舔你，没想到吧，你总得意的觉得自己不少舔狗，但其实都是我一个人而已。 |
| BV15nyUBuE7x | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】引航者，请接受香奈美的爱哦~ |
| BV13ReQzTEF4 | 卡拉彼丘 | character-or-game-token, metadata-not-song | 《卡拉彼丘》香奈美Be Shining翻唱jz |
| BV1vCeBzTELA | 卡丘小剧场 | looks-like-title-or-lyric | 【卡丘翻唱小剧场】香奈美做梦也没想到自己会。。。 |
| BV1MyYqz9E5s | 香保会会长最新力作♪Be Shining【】 | looks-like-title-or-lyric, punctuation-residue | 香保会会长最新力作♪Be Shining【翻唱】 |
| BV1JYbNzTEPZ | 卡丘MMD/2K120帧 | looks-like-title-or-lyric | 【AI香奈美/卡丘MMD/2K120帧】CheeseCakeCrisis |
| BV1g2thz8E2t | 卡丘 | looks-like-title-or-lyric | 【卡丘翻唱】在海边公园即兴唱歌的香奈美喵 |
| BV1rEuez6EZG | 小美变成猫娘了.....? | looks-like-title-or-lyric | 小美变成猫娘了.....? |
| BV1daTgzdE8q | We Are Condemned To Be Free (cn) | looks-like-title-or-lyric | [AI香奈美]We Are Condemned To Be Free |
| BV17NogYzEUi | 【】r | punctuation-residue | 【AI香奈美】r-906 / LeuR - ユメミ（做梦） |
| BV1XddBY5Ebu | []TNT弹道轨迹，还有人记得这个游戏吗？ | looks-like-title-or-lyric, punctuation-residue | [AI香奈美]TNT弹道轨迹，还有人记得这个游戏吗？ |
| BV1qtPsevEsj | 哼歌有一段像…… | looks-like-title-or-lyric | 香奈美哼歌有一段像…… |
| BV14dNHeCEHb | 卡拉彼丘 | character-or-game-token, metadata-not-song | 《卡拉彼丘》香奈美Be Shining翻唱 |
| BV1x5cSe6EGq | 的小曲儿吉他谱呈上！谱子后期做的，可能有很多小瑕疵，各位剪刀手战士当个参考，随意发挥～ | looks-like-title-or-lyric | 香奈美的小曲儿吉他谱呈上！谱子后期做的，可能有很多小瑕疵，各位剪刀手战士当个参考，随意发挥～ |
| BV1ZZcpexE9V | 布豪！捣蛋来袭！［］ | looks-like-title-or-lyric | 布豪！捣蛋来袭！［香奈美AI］ |
| BV1nZzCYhEZ4 | 熙熙攘攘、我们的卡丘 | looks-like-title-or-lyric | 香奈美献唱《熙熙攘攘、我们的卡丘》🧊 |
| BV17EBdYXEFr | 卡拉彼丘 | character-or-game-token, metadata-not-song | 《卡拉彼丘》你看世界好美l香奈美主题曲翻唱 |
| BV1ZCDzYCEkM | 卡拉彼丘 明 拉薇 艾卡 _合唱 | character-or-game-token | 【卡拉彼丘 明 拉薇 艾卡 香奈美 _AI合唱】为俄罗斯服役（为剪刀手服役） |
| BV1heDVYREXQ | （）然而世界绝对不是灰色，剪刀手征兵广告！你看 世界好美 | looks-like-title-or-lyric, punctuation-residue | （cover）然而世界绝对不是灰色，剪刀手征兵广告！你看 世界好美-卡拉彼丘/宴宁 |
| BV117xQeCEDs | 卡丘中的女王 | looks-like-title-or-lyric | Suno AI热唱【香奈美卡丘中的女王】 |
| BV1r44qePEBe | ai | metadata-not-song | 引航者我太想进步了[ai香奈美] |
| BV1994aegEBC | ai | metadata-not-song | [ai香奈美]莫问归期 |
| BV1eMH9eXE2C | 卡丘电台 | looks-like-title-or-lyric | 【卡丘电台】陕北硕鼠好得意~ |
| BV11H4y1F7kx | 你看世界好美 卡拉彼丘主题曲 | character-or-game-token | 香奈美  你看世界好美 卡拉彼丘香奈美主题曲翻唱 |
| BV1DVa6eMEUV | 卡丘MMD/4K | looks-like-title-or-lyric | 【卡丘MMD/4K】香奈美在意你有没有💖女朋友 |
| BV11whYezEXj | 卡丘电台 | looks-like-title-or-lyric | 【卡丘电台】香奈美真的想去海边——AI香奈美 |
| BV15b421z7QX | ai | metadata-not-song | 【ai香奈美】词不达意 |
| BV1az421U7qu | ai | metadata-not-song | 【ai香奈美】关于我爱你 |
| BV1DJ4m1H7rN | 虚拟 | metadata-not-song | ai香奈美《虚拟》“你是我朝夕相伴触手可及的虚拟” |
| BV1ym411m7Tz | ai | metadata-not-song | 【ai香奈美】温柔 |
| BV1fx42127Ua | ai | metadata-not-song | 【ai香奈美】心墙 |
| BV18E421g72v | ai | metadata-not-song | 【ai香奈美】 夜に駆ける（向夜晚奔去） |
| BV13z421Z7M8 | ai | metadata-not-song | 【ai香奈美】心做し (心理作用) |
| BV1Uj421d7a3 | 真的很火呢！ | looks-like-title-or-lyric | 香奈美真的很火呢！ |
| BV1my421B78a | 打完卡丘后在做什么？有没有空？可以来约会吗？ | looks-like-title-or-lyric | 打完卡丘后在做什么？有没有空？可以来约会吗？ |
| BV18A4m157CQ | 【】一路生花，但是大舌头 | looks-like-title-or-lyric, punctuation-residue | 【AI香奈美】一路生花，但是大舌头香奈美 |
| BV1Nv421i7pM | 和 我 一 起 变 成 光 吧 ！ | looks-like-title-or-lyric | 和 我 一 起 变 成 光 吧 ！ |
| BV1sp421Z77h | 卡拉彼丘公测PV | character-or-game-token | 使用夹子音并怪叫翻唱香奈美的小曲【卡拉彼丘公测PV】 |
| BV1BQ4y1p7in | 卡拉彼丘 | character-or-game-token, metadata-not-song | 【卡拉彼丘】我很菜，但希望你能注视着我。 |
