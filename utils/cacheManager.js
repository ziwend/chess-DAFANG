class CacheManager {
    constructor() {
        this.cache = new Map();
        this.storageKey = 'formation-cache';
        this.presetCachePath = './preset-cache.json';
        this.initCache();
    }

    initCache() {
        try {
            // 1. 先加载预置缓存
            const fs = wx.getFileSystemManager();
            try {
                const presetCache = fs.readFileSync(this.presetCachePath, 'utf-8');
                const presetData = JSON.parse(presetCache);
                this.cache = new Map(Object.entries(presetData));
                console.log('Loaded preset cache successfully');
            } catch (e) {
                console.log('No preset cache found or error loading preset cache:', e);
            }

            // 2. 加载运行时缓存（会覆盖预置缓存的相同键）
            const storageData = wx.getStorageSync(this.storageKey);
            if (storageData) {
                const runtimeData = JSON.parse(storageData);
                Object.entries(runtimeData).forEach(([key, value]) => {
                    this.cache.set(key, value);
                });
                console.log('Loaded runtime cache successfully');
            }
        } catch (error) {
            console.error('Error initializing cache:', error);
        }
    }

    generateKey(row, col, currentColor, board) {
        return JSON.stringify({ row, col, currentColor, board });
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value) {
        this.cache.set(key, value);
        this.saveToStorage();
    }

    saveToStorage() {
        try {
            const jsonData = JSON.stringify(Object.fromEntries(this.cache));
            wx.setStorageSync(this.storageKey, jsonData);
            
            // 同时更新预置缓存文件
            this.exportCache();
        } catch (error) {
            console.error('Error saving cache:', error);
        }
    }

    exportCache() {
        try {
            const jsonData = JSON.stringify(Object.fromEntries(this.cache), null, 2);
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
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }
}

export const cacheManager = new CacheManager();