import { CACHE } from './formationCache.js'; // 引入 CACHE 常量

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.storageKey = 'formation-cache';
        const basePath = `${wx.env.USER_DATA_PATH}/preset-cache`; //
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileExtension = '.json'; // 文件扩展名
        this.presetCachePath = `${basePath}_${timestamp}${fileExtension}`;; // 使用可写路径
        this.saveTimeout = null; // 防抖定时器
        this.initCache();
    }

    initCache() {
        try {
            // 加载 CACHE 常量中的数据
            Object.entries(CACHE).forEach(([key, value]) => {
                this.cache.set(key, value);
            });
            console.log('Loaded CACHE constant successfully',this.cache.size);
        } catch (error) {
            console.error('Error initializing cache:', error);
        }
    }

    generateKey(row, col, currentColor, board) {
        // 仅记录棋子的坐标
        let key = '';
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
              if (row === r && col === c) {
                key += `#${r}#${c}`; // 记录输入坐标
                continue;
              }
                const piece = board[r][c];
                if (piece && piece.color === currentColor) {
                    key += `${r}${c}`; // 将坐标拼接为字符串
                }
            }
        }
        // 返回最终的 key
        if (!key.includes('#')){
          console.log(key, row, col, currentColor, JSON.stringify(board));

        }
        return key;
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value) {
        this.cache.set(key, value);
    }

    saveToStorage() {
        const jsonData = JSON.stringify(Object.fromEntries(this.cache));
        this.exportCache(jsonData); // 同步保存到文件
    }

    exportCache(jsonData) {
        try {
            const fs = wx.getFileSystemManager();
            fs.writeFileSync(this.presetCachePath, jsonData, 'utf-8');
            console.log('Cache exported to preset file successfully');
        } catch (error) {
            console.error('Error exporting cache to preset file:', error);
        }
    }

    clear() {
        try {
            this.cache.clear();
            wx.removeStorageSync(this.storageKey);

            // 同时清除预置缓存文件
            const fs = wx.getFileSystemManager();
            fs.unlinkSync(this.presetCachePath);
            console.log('Cache cleared successfully');
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }
}

export const cacheManager = new CacheManager();