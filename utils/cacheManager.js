class CacheManager {
    constructor() {
        this.cache = new Map();
        this.storageKey = 'formation-cache';
        this.presetCachePath = `${wx.env.USER_DATA_PATH}/preset-cache.json`; // 使用可写路径
        this.initCache();
    }

    initCache() {
        try {
            const fs = wx.getFileSystemManager();
            // 尝试加载预置缓存
            try {
                fs.accessSync(this.presetCachePath); // 检查文件是否存在
                const presetCache = fs.readFileSync(this.presetCachePath, 'utf-8');
                const presetData = JSON.parse(presetCache);
                this.cache = new Map(Object.entries(presetData));
                console.log('Loaded preset cache successfully');
            } catch (e) {
                // 如果文件不存在，则创建一个空文件
                fs.writeFileSync(this.presetCachePath, '{}', 'utf-8');
                console.log('No preset cache found. Created a new preset cache file.');
            }

            // 加载运行时缓存（覆盖预置缓存的相同键）
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
            this.exportCache(); // 同步保存到文件
        } catch (error) {
            console.error('Error saving cache:', error);
        }
    }

    exportCache() {
        try {
            const jsonData = JSON.stringify(Object.fromEntries(this.cache), null, 2);
            const fs = wx.getFileSystemManager();
            fs.appendFileSync(this.presetCachePath, jsonData, 'utf-8');
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