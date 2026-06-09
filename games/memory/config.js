window.KANAMI_MEMORY_CONFIG = {
  tuning: {
    storage: {
      bestKey: "kanami-memory-best"
    },
    board: {
      columns: 4,
      mobileColumns: 4
    },
    timing: {
      mismatchHideDelayMs: 760,
      timerTickMs: 500
    },
    card: {
      frontText: "K",
      altPrefix: "香奈美卡片图案"
    },
    theme: {
      pageBackgroundImage: "../../res/images/backgrounds/Soda.png"
    },
    text: {
      ready: "香奈美已经洗好牌啦，第一张由你来翻。",
      firstPick: "第一张记住了吗？香奈美等你翻第二张。",
      matched: "配对成功，香奈美的应援力增加了。",
      mismatched: "没关系，香奈美刚刚也偷偷记住位置了。",
      newBest(moves, timeText) {
        return `全部配对成功！${moves} 步 ${timeText}，这是新的最佳记录。`;
      },
      finished(moves, timeText) {
        return `全部配对成功！${moves} 步 ${timeText}，香奈美已经把掌声送到啦。`;
      }
    }
  },
  cardTemplates: [
    {
      id: "stage-smile",
      text: {
        name: "舞台笑容",
        alt: "香奈美的舞台笑容"
      },
      asset: {
        image: "../../res/images/stamps/001.png"
      }
    },
    {
      id: "support-photo",
      text: {
        name: "应援照",
        alt: "香奈美应援照"
      },
      asset: {
        image: "../../res/images/stamps/002.jpg"
      }
    },
    {
      id: "spotlight",
      text: {
        name: "舞台照",
        alt: "香奈美舞台照"
      },
      asset: {
        image: "../../res/images/stamps/003.jpg"
      }
    },
    {
      id: "pink-heart",
      text: {
        name: "粉色心情",
        alt: "香奈美粉色心情"
      },
      asset: {
        image: "../../res/images/stamps/004.png"
      }
    },
    {
      id: "soft-light",
      text: {
        name: "柔光剪影",
        alt: "香奈美柔光剪影"
      },
      asset: {
        image: "../../res/images/stamps/005.jpg"
      }
    },
    {
      id: "soda-summer",
      text: {
        name: "Soda 夏日",
        alt: "香奈美 Soda 夏日背景"
      },
      asset: {
        image: "../../res/images/backgrounds/Soda.png"
      }
    },
    {
      id: "be-shinning",
      text: {
        name: "闪耀时刻",
        alt: "香奈美闪耀时刻背景"
      },
      asset: {
        image: "../../res/images/backgrounds/Be-Shinning.png"
      }
    },
    {
      id: "love-kanami",
      text: {
        name: "Love Kanami",
        alt: "Love Kanami"
      },
      asset: {
        image: "../../res/images/lovekanami.jpg"
      }
    }
  ]
};
