import { DEFAULT_PLAYER_CONFIG } from './gameConstants';
export function loadPlayerConfig() {
    const playerConfig = wx.getStorageSync('playerConfig') || DEFAULT_PLAYER_CONFIG;
    return playerConfig;
}

export function updatePlayerConfig(color, config) {
    const newPlayerConfig = {
        ...loadPlayerConfig(),
        [color]: config
    };
    if (typeof newPlayerConfig === 'object' && newPlayerConfig !== null) {
        wx.setStorageSync('playerConfig', newPlayerConfig);
    } else {
        console.error('PlayerConfig 格式错误:', newPlayerConfig);
    }
}