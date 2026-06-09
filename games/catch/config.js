window.KANAMI_CATCH_CONFIG = {
  tuning: {
    storage: {
      bestKey: "kanami-catch-best"
    },
    durationSeconds: 30,
    board: {
      rows: 3,
      columns: 3
    },
    wave: {
      totalVisibleRatio: {
        start: 0.12,
        end: 0.24,
        easing: "easeInQuad",
        min: 1,
        max: 3
      },
      correctRatio: {
        start: 1,
        end: 0.66,
        easing: "linear",
        min: 1
      },
      decoyRatio: {
        start: 0,
        end: 0.34,
        easing: "linear",
        max: 2
      }
    },
    timing: {
      intervalMs: {
        start: 980,
        end: 430,
        easing: "easeInQuad"
      },
      visibleMs: {
        start: 760,
        end: 320,
        easing: "easeInQuad"
      },
      minBlankMs: 80,
      jitterMs: 36
    },
    scoring: {
      target: 1,
      decoy: -2
    },
    audio: {
      type: "sine",
      gain: 0.05
    },
    theme: {
      pageBackgroundImage: "../../res/images/backgrounds/Be-Shinning.png"
    },
    text: {
      ready: "准备好了就点开始，香奈美会在灯光里闪现。",
      hit: "抓到啦！香奈美把这一秒收进舞台相册。",
      decoy: "那是干扰光啦，香奈美提醒你冷静一点。",
      start: "灯光开始流动了，盯紧香奈美出现的位置。",
      runningButton: "进行中",
      restartButton: "再来",
      finish(score) {
        return `时间到！这次抓到 ${score} 次，香奈美已经记下你的应援速度。`;
      }
    }
  },
  targetTemplates: [
    {
      id: "flash-smile",
      text: {
        label: "香奈美闪现"
      },
      asset: {
        image: "../../res/images/stamps/001.png"
      },
      audio: {
        frequency: 720,
        durationSeconds: 0.07
      }
    },
    {
      id: "support-photo",
      text: {
        label: "香奈美应援照"
      },
      asset: {
        image: "../../res/images/stamps/002.jpg"
      },
      audio: {
        frequency: 760,
        durationSeconds: 0.07
      }
    },
    {
      id: "stage-photo",
      text: {
        label: "香奈美舞台照"
      },
      asset: {
        image: "../../res/images/stamps/003.jpg"
      },
      audio: {
        frequency: 800,
        durationSeconds: 0.07
      }
    }
  ],
  decoyTemplates: [
    {
      id: "noise-light",
      text: {
        label: "干扰灯"
      },
      asset: {
        image: "../../res/images/stamps/004.png"
      },
      audio: {
        frequency: 180,
        durationSeconds: 0.12
      }
    },
    {
      id: "noise-shadow",
      text: {
        label: "干扰剪影"
      },
      asset: {
        image: "../../res/images/stamps/005.jpg"
      },
      audio: {
        frequency: 160,
        durationSeconds: 0.12
      }
    }
  ]
};
