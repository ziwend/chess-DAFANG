import { CACHE } from './formationCache.js'; // 引入 CACHE 常量
import { DIRECTIONS, CONFIG } from './gameConstants.js';
import { debugLog } from './historyUtils.js';

class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletions: 0
        };
    }

    get(key) {
        if (!this.cache.has(key)) {
            this.stats.misses++;
            return undefined;
        }

        // 更新访问顺序
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.stats.deletions++;

        this.cache.set(key, value);
        this.stats.sets++;

        this.stats.hits++;

        return value;
    }

    set(key, value) {
        
        // Check for shorter keys with same value
        for (const [existingKey, existingValue] of this.cache.entries()) {
            if (key.includes(existingKey) &&
                JSON.stringify(existingValue) === JSON.stringify(value)) {
                debugLog(false, `插入新的key=${key}，删除较短key=${existingKey}的重复value:`, existingValue);
                this.cache.delete(existingKey);
                this.stats.deletions++;
                // break; // Only delete the first matching shorter key
            }
        }

        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.stats.deletions++;
            debugLog(CONFIG.DEBUG, '更新访问顺序', key);
        } else if (this.cache.size >= this.capacity) {
            // 删除最久未使用的项
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.stats.deletions++;
            debugLog(CONFIG.DEBUG, `插入新的key=${key}删除最久未使用的项${firstKey}`, value);
        }

        this.cache.set(key, value);
        this.stats.sets++;
    }
    getStats() {
        const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) * 100 || 0;
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            hitRate: hitRate.toFixed(2) + '%',
            totalRequests: this.stats.hits + this.stats.misses
        };
    }
    entries() {
        return this.cache.entries();
    }
}

class CacheManager {
    constructor() {
        this.lruCache = new LRUCache(20000); // 限制缓存大小
        this.presetCachePath = `${wx.env.USER_DATA_PATH}/preset-cache_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        this.initCache();
    }

    initCache() {
        try {
            // 加载 CACHE 常量中的数据
            Object.entries(CACHE).forEach(([key, value]) => {
                this.lruCache.set(key, value);
            });
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
        return Array.from(this.lruCache.cache.keys());
    }
    get(key) {
        return this.lruCache.get(key);
    }

    set(key, value) {
        this.lruCache.set(key, value);
    }


    printStats() {
        const stats = this.lruCache.getStats();
        console.log(`Cache Performance:
- Cache Size: ${stats.cacheSize}
- Total Requests: ${stats.totalRequests}
- Cache Hits: ${stats.hits}
- Cache Misses: ${stats.misses}
- Hit Rate: ${stats.hitRate}
- Sets: ${stats.sets}
- Deletions: ${stats.deletions}
`);
    }

    saveToStorage() {
        // After some cache operations
        this.printStats();

        try {
            // Get all keys and sort them
            const sortedKeys = this.getAllKeys().sort();

            // Create array of [key, value] pairs
            const sortedEntries = sortedKeys.map(key => [
                key,
                this.lruCache.get(key)
            ]);

            // Convert to object and serialize
            const jsonData = JSON.stringify(Object.fromEntries(sortedEntries));

            // 直接写入文件
            const fs = wx.getFileSystemManager();
            fs.writeFileSync(this.presetCachePath, jsonData, 'utf-8');
            debugLog(CONFIG.DEBUG, 'Cache exported to preset file successfully', this.presetCachePath, sortedEntries.length);
            
        } catch (error) {
            console.error('Error exporting cache to preset file:', error);
        }
    }

}

export const cacheManager = new CacheManager();