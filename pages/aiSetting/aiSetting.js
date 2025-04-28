import { updatePlayerConfig,loadPlayerConfig } from '../../utils/playerConfigManager.js';

Page({
  data: {
    color: '',
    playerType: 'self', // 新增：默认玩家类型
    difficulty: 'easy', // 新增：默认难度
    aiConfig: {
      url: '',
      model: '',
      apiKey: ''
    },
    currentConfig: {}
  },

  onLoad: function (options) {
    const color = options.color || 'black';
    const currentConfig = loadPlayerConfig();
    const playerConfig = currentConfig[color];
    this.setData({
      color: color,
      playerType: playerConfig.playerType,
      difficulty: playerConfig.difficulty,
      aiConfig: {
        url: playerConfig.aiConfig.url,
        model: playerConfig.aiConfig.model,
        apiKey: playerConfig.aiConfig.apiKey
      },
      currentConfig: currentConfig
    });
  },
  onColorChange: function (e) {
    const color = e.detail.value;
    const playerConfig = this.data.currentConfig[color];
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