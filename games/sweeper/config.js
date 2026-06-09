window.KANAMI_SWEEPER_CONFIG = {
  tuning: {
    storage: {
      bestKey: "kanami-sweeper-best"
    },
    board: {
      rows: 8,
      columns: 8,
      mineCount: 10,
      firstClickSafeNeighbors: true
    },
    timing: {
      timerTickMs: 1000,
      longPressMs: 520
    },
    symbols: {
      mine: "★",
      flag: "旗"
    },
    theme: {
      pageBackgroundImage: "../../res/images/backgrounds/Soda.png"
    },
    text: {
      ready: "第一格一定安全；手机上可以切换旗帜模式，或长按格子插旗。",
      firstSafe: "先翻开一格吧，香奈美会保证第一步安全。",
      flagOn: "这里先插旗，香奈美记住这个危险点。",
      flagOff: "旗帜收回，继续确认舞台。",
      risky: "周围有星光炸点，小心推进。",
      safe: "这里很安全，香奈美帮你展开一片区域。",
      win(timeText) {
        return `全部安全格都揭开啦！用时 ${timeText}，香奈美的舞台顺利开演。`;
      },
      lose: "星光炸点被踩到了。香奈美把舞台重新整理好，我们再试一次。"
    }
  },
  tileTemplates: {
    closed: {
      text: {
        name: "未翻开的舞台格"
      },
      asset: {
        background: "linear-gradient(145deg, rgba(246, 210, 110, 0.95), rgba(246, 144, 182, 0.82))"
      }
    },
    open: {
      text: {
        name: "安全舞台格"
      },
      asset: {
        background: "rgba(255, 255, 255, 0.82)"
      }
    },
    flagged: {
      text: {
        name: "旗帜标记"
      },
      asset: {
        background: "linear-gradient(145deg, rgba(117, 201, 230, 0.96), rgba(114, 211, 141, 0.88))"
      }
    },
    mine: {
      text: {
        name: "星光炸点"
      },
      asset: {
        background: "linear-gradient(145deg, #ff9fa5, #f6d26e)"
      }
    }
  }
};
