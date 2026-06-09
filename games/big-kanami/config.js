window.BIG_KANAMI_CONFIG = {
  tuning: {
    stage: {
      width: 420,
      height: 540
    },
    bottle: {
      left: 42,
      right: 378,
      lipY: 86,
      floorY: 512,
      gameOverY: 112,
      sideWallThickness: 30,
      floorThickness: 34,
      floorExtraWidth: 28,
      wallExtraHeight: 28,
      wallYOffset: 8,
      bottomCurveDepth: 16
    },
    ball: {
      radiusScale: 0.92,
      nextPreviewMaxRadius: 29,
      guidePreviewSize: 72,
      guidePreviewMaxRadius: 29,
      labelMinRadius: 27,
      labelFontScale: 0.24,
      labelYOffsetScale: 0.52,
      rimWidthScale: 0.08,
      innerRimWidthScale: 0.045
    },
    physics: {
      gravityY: 0.88,
      wallFriction: 0.18,
      wallRestitution: 0.08,
      ballRestitution: 0.18,
      ballFriction: 0.22,
      ballFrictionAir: 0.002,
      ballBaseDensity: 0.001,
      ballDensityStep: 0.00018,
      mergeVelocityXScale: 0.28,
      mergeVelocityYScale: 0.2,
      mergeVelocityYMax: 2
    },
    spawn: {
      secondLevelChance: 0.18,
      dropCooldownMs: 560
    },
    gameOver: {
      graceMs: 1400,
      warningMs: 1600,
      settledVelocityY: 0.35
    },
    controls: {
      keyboardStep: 18
    },
    storage: {
      bestKey: "kanami-big-kanami-best"
    },
    theme: {
      pageBackgroundImage: "../../res/images/backgrounds/Soda.png"
    },
    text: {
      ready: "移动鼠标或手指选择杯口位置，点击舞台或按空格投下。香奈美准备好啦。",
      crowded: "杯口有点挤啦，香奈美要小心一点。",
      gameOverLine: "满到这里就结束",
      gameOver(score) {
        return `烧杯满啦，本次 ${score} 分。香奈美整理好舞台就能再来一局。`;
      },
      missingEngine: "物理引擎没有加载成功，香奈美暂时没法把球丢进烧杯里。"
    }
  },
  ballTemplates: [
    {
      id: "mini-kanami",
      text: {
        name: "小奈美",
        label: "小奈美",
        mergeText: "小奈美靠近一点，下一颗会更闪亮。"
      },
      ball: {
        baseRadius: 20,
        score: 2
      },
      asset: {
        fillColor: "#ffe26a",
        backgroundImage: "../../res/images/favicon.png",
        imageOpacity: 0.92,
        textColor: "#242538"
      }
    },
    {
      id: "starlight-kanami",
      text: {
        name: "星光奈美",
        label: "星光",
        mergeText: "合体成功，星光奈美登场。"
      },
      ball: {
        baseRadius: 25,
        score: 4
      },
      asset: {
        fillColor: "#73e0d5",
        backgroundImage: "../../res/images/stamps/001.png",
        imageOpacity: 0.92,
        textColor: "#242538"
      }
    },
    {
      id: "soda-kanami",
      text: {
        name: "Soda 奈美",
        label: "Soda",
        mergeText: "合体成功，Soda 奈美登场。"
      },
      ball: {
        baseRadius: 31,
        score: 8
      },
      asset: {
        fillColor: "#7fb4ff",
        backgroundImage: "../../res/images/backgrounds/Soda.png",
        imageOpacity: 0.9,
        textColor: "#242538"
      }
    },
    {
      id: "pink-heart-kanami",
      text: {
        name: "粉心奈美",
        label: "粉心",
        mergeText: "合体成功，粉心奈美登场。"
      },
      ball: {
        baseRadius: 38,
        score: 16
      },
      asset: {
        fillColor: "#ff83ad",
        backgroundImage: "../../res/images/stamps/004.png",
        imageOpacity: 0.92,
        textColor: "#242538"
      }
    },
    {
      id: "orange-light-kanami",
      text: {
        name: "橙光奈美",
        label: "橙光",
        mergeText: "合体成功，橙光奈美登场。"
      },
      ball: {
        baseRadius: 46,
        score: 32
      },
      asset: {
        fillColor: "#ffac4d",
        backgroundImage: "../../res/images/stamps/003.jpg",
        imageOpacity: 0.92,
        textColor: "#242538"
      }
    },
    {
      id: "blue-dance-kanami",
      text: {
        name: "青舞奈美",
        label: "青舞",
        mergeText: "合体成功，青舞奈美登场。"
      },
      ball: {
        baseRadius: 55,
        score: 64
      },
      asset: {
        fillColor: "#37b6c8",
        backgroundImage: "../../res/images/backgrounds/Be-Shinning.png",
        imageOpacity: 0.9,
        textColor: "#242538"
      }
    },
    {
      id: "violet-dream-kanami",
      text: {
        name: "紫梦奈美",
        label: "紫梦",
        mergeText: "合体成功，紫梦奈美登场。"
      },
      ball: {
        baseRadius: 66,
        score: 128
      },
      asset: {
        fillColor: "#8f72d8",
        backgroundImage: "../../res/images/stamps/005.jpg",
        imageOpacity: 0.9,
        textColor: "#242538"
      }
    },
    {
      id: "red-crown-kanami",
      text: {
        name: "红冠奈美",
        label: "红冠",
        mergeText: "合体成功，红冠奈美登场。"
      },
      ball: {
        baseRadius: 79,
        score: 256
      },
      asset: {
        fillColor: "#ef5f6c",
        backgroundImage: "../../res/images/stamps/002.jpg",
        imageOpacity: 0.9,
        textColor: "#242538"
      }
    },
    {
      id: "big-kanami",
      text: {
        name: "大奈美",
        label: "大奈美",
        mergeText: "合体成功，大奈美登场。",
        finalText: "超大奈美诞生！这首歌已经传到世界尽头啦。"
      },
      ball: {
        baseRadius: 94,
        score: 512
      },
      asset: {
        fillColor: "#2fce78",
        backgroundImage: "../../res/images/lovekanami.jpg",
        imageOpacity: 0.9,
        textColor: "#242538"
      }
    }
  ]
};
