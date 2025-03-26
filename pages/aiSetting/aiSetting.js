import { updatePlayerConfig } from '../../utils/playerConfigManager.js';

Page({
  data: {
    color: '',
    playerType: 'self', // 新增：默认玩家类型
    difficulty: 'easy', // 新增：默认难度
    aiConfig: {
      url: '',
      model: '',
      apiKey: ''
    }
  },

  onLoad: function (options) {
    const color = options.color;
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    const playerConfig = prevPage.data.playerConfig[color];
    this.setData({
      color: color,
      playerType: playerConfig.playerType,
      difficulty: playerConfig.difficulty,
      aiConfig: {
        url: playerConfig.aiConfig.url,
        model: playerConfig.aiConfig.model,
        apiKey: playerConfig.aiConfig.apiKey
      }
    });
  },

  onPlayerTypeChange: function (e) {
    this.setData({
      playerType: e.detail.value
    });
  },

  onDifficultyChange: function (e) {
    this.setData({
      difficulty: e.detail.value
    });
  },

  onUrlChange: function (e) {
    this.setData({
      'aiConfig.url': e.detail.value
    });
  },

  onModelChange: function (e) {
    this.setData({
      'aiConfig.model': e.detail.value
    });
  },

  onApiKeyChange: function (e) {
    this.setData({
      'aiConfig.apiKey': e.detail.value
    });
  },

  saveConfig: function () {
    const { color, playerType, difficulty, aiConfig } = this.data;

    const config = {
      playerType,
      difficulty,
      aiConfig
    };

    updatePlayerConfig(color, config);

    wx.navigateBack();
  }
});