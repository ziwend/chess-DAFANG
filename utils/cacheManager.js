import { CACHE } from './formationCache.js'; // 引入 CACHE 常量
import { DIRECTIONS,CONFIG } from './gameConstants.js';
import { debugLog } from './historyUtils.js';

class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        
        // 更新访问顺序
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
            debugLog(CONFIG.DEBUG, '更新访问顺序', key, this.cache.size);
        } else if (this.cache.size >= this.capacity) {
            // 删除最久未使用的项
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            debugLog(CONFIG.DEBUG, '删除最久未使用的项', firstKey, this.cache.size);
        }
        this.cache.set(key, value);
    }

    entries() {
        return this.cache.entries();
    }
}

class CacheManager {
    constructor() {
        this.cache = new LRUCache(20000); // 限制缓存大小
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

            debugLog(CONFIG.DEBUG, 'Loaded CACHE constant successfully', this.cache.size);
        } catch (error) {
            console.error('Error initializing cache:', error);
        }
    }

    generateKey(row, col, currentColor, board) {
        const visited = new Set(); // 同时用作访问记录和收集坐标
        
        const findConnectedPieces = (r, c) => {
            const posKey = `${r}${c}`;
            if (visited.has(posKey)) return;
            
            visited.add(posKey);
    
            // Check each neighboring position
            for (const [dx, dy] of DIRECTIONS.NEIGHBORS) {
                const newRow = r + dx;
                const newCol = c + dy;
    
                // Check bounds and piece validity
                if (newRow >= 0 && newRow < board.length &&
                    newCol >= 0 && newCol < board[0].length &&
                    board[newRow][newCol]?.color === currentColor) {
    
                    findConnectedPieces(newRow, newCol);
                }
            }
        };
    
        // Start DFS from input position
        findConnectedPieces(row, col);
        
        // 将visited集合转换为数组并排序，确保生成的key是稳定的
        return Array.from(visited).join('');
    }
    getAllKeys() {
        return Array.from(this.cache.cache.keys());
    }
    get(key) {
        return this.cache.get(key);
    }

    set(key, value) {
        this.cache.set(key, value);
    }

    saveToStorage() {
        try {
            // 将 Map 转换为数组并按 key 排序
            const sortedEntries = Array.from(this.cache.entries())
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
            
            // 转换为对象并序列化
            const jsonData = JSON.stringify(Object.fromEntries(sortedEntries));
            
            // 直接写入文件
            const fs = wx.getFileSystemManager();
            fs.writeFileSync(this.presetCachePath, jsonData, 'utf-8');
            debugLog(CONFIG.DEBUG, 'Cache exported to preset file successfully', this.presetCachePath, this.cache.size);
        } catch (error) {
            console.error('Error exporting cache to preset file:', error);
        }
    }

}

export const cacheManager = new CacheManager();