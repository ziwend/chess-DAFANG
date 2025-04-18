import { CONFIG } from './gameConstants';
export function loadPlayerConfig() {
    const playerConfig = wx.getStorageSync('playerConfig') || CONFIG.DEFAULT_PLAYER_CONFIG;
    return playerConfig;
}

export function updatePlayerConfig(color, config) {
    const currentConfig = loadPlayerConfig();
    const oppositeColor = color === 'black' ? 'white' : 'black';
    
    // 创建新的配置对象
    const newPlayerConfig = {
        ...currentConfig,
        [color]: config
    };

    // 处理 playerType 的切换逻辑
    if (!CONFIG.DEBUG && config.playerType !== currentConfig[color].playerType) {
        // 当切换为 self 时
        if (config.playerType === 'self') {
            // 将对方的 playerType 设置为当前方之前的类型
            newPlayerConfig[oppositeColor] = {
                ...newPlayerConfig[oppositeColor],
                playerType: currentConfig[color].playerType
            };
        }
        // 当从 self 切换为其他类型时
        else if (currentConfig[color].playerType === 'self') {
            // 将对方的 playerType 设置为 self
            newPlayerConfig[oppositeColor] = {
                ...newPlayerConfig[oppositeColor],
                playerType: 'self'
            };
        }
    }

    if (typeof newPlayerConfig === 'object' && newPlayerConfig !== null) {
        wx.setStorageSync('playerConfig', newPlayerConfig);
    } else {
        console.error('PlayerConfig 格式错误:', newPlayerConfig);
    }
}