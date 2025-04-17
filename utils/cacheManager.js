import { CONFIG } from './gameConstants.js';
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
        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.stats.deletions++;
            debugLog(CONFIG.DEBUG, '更新访问顺序', key);
        } else if (this.cache.size >= this.capacity) {
            // 删除最久未使用的项
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.stats.deletions++;
            // debugLog(CONFIG.DEBUG, `插入新的key=${key}删除最久未使用的项${firstKey}`, value);
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
        this.lruCache = new LRUCache(CONFIG.FORMATION_CHACE_SIZE); // 限制缓存大小
        this.presetCachePath = `${wx.env.USER_DATA_PATH}/preset-cache_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        //this.initCache();
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
    }

}

export const cacheManager = new CacheManager();