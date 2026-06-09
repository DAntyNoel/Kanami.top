window.KANAMI_SIMON_CONFIG = {
  tuning: {
    storage: {
      bestKey: "kanami-simon-best"
    },
    board: {
      columns: 2
    },
    timing: {
      introDelayMs: 420,
      flashMs: 260,
      sequenceStepMs: 470,
      nextRoundDelayMs: 760
    },
    audio: {
      type: "triangle",
      gain: 0.06,
      durationSeconds: 0.22
    },
    theme: {
      pageBackgroundImage: "../../res/images/backgrounds/Be-Shinning.png"
    },
    text: {
      idle: "按开始，香奈美先唱第一小节。",
      start: "第一小节要来啦。",
      listen: "香奈美正在亮灯，先认真听完这一小节。",
      repeat: "轮到你啦，照着刚才的顺序点亮舞台。",
      success: "完美跟上！香奈美再加一盏灯。",
      fail(round) {
        return `这一拍乱掉了，不过已经完成 ${round} 回合。香奈美等你再开场。`;
      }
    }
  },
  padTemplates: [
    {
      id: "pink",
      key: "q",
      tone: 392,
      text: {
        name: "粉色舞台灯",
        label: "粉"
      },
      asset: {
        color: "#ff70a6",
        backgroundImage: "../../res/images/stamps/004.png"
      }
    },
    {
      id: "blue",
      key: "w",
      tone: 523,
      text: {
        name: "蓝色舞台灯",
        label: "蓝"
      },
      asset: {
        color: "#70a6ff",
        backgroundImage: "../../res/images/backgrounds/Soda.png"
      }
    },
    {
      id: "gold",
      key: "a",
      tone: 659,
      text: {
        name: "金色舞台灯",
        label: "星"
      },
      asset: {
        color: "#ffd166",
        backgroundImage: "../../res/images/stamps/001.png"
      }
    },
    {
      id: "green",
      key: "s",
      tone: 784,
      text: {
        name: "绿色舞台灯",
        label: "绿"
      },
      asset: {
        color: "#5cd39d",
        backgroundImage: "../../res/images/backgrounds/Be-Shinning.png"
      }
    }
  ]
};
