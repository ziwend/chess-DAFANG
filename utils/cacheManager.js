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
    
    clear() {
        this.cache.clear();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletions: 0
        };
    }
    
    getAllKeys() {
        return Array.from(this.cache.keys());
    }
}

class CacheInstance {
    constructor(name, capacity) {
        this.name = name;
        this.lruCache = new LRUCache(capacity);
        this.cachePath = `${wx.env.USER_DATA_PATH}/${name}-cache_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    }

    get(key) {
        return this.lruCache.get(key);
    }

    set(key, value) {
        this.lruCache.set(key, value);
    }

    getAllKeys() {
        return this.lruCache.getAllKeys();
    }

    clear() {
        this.lruCache.clear();
    }

    printStats() {
        const stats = this.lruCache.getStats();
        debugLog(CONFIG.DEBUG, `Cache [${this.name}] Performance:
- Cache Size: ${stats.cacheSize}
- Total Requests: ${stats.totalRequests}
- Cache Hits: ${stats.hits}
- Cache Misses: ${stats.misses}
- Hit Rate: ${stats.hitRate}
- Sets: ${stats.sets}
- Deletions: ${stats.deletions}
`, this.getAllKeys());
    }

    saveToStorage() {
        this.printStats();
        // 这里可以实现将缓存保存到本地存储的逻辑
    }
}

class CacheManager {
    constructor() {
        this.caches = new Map();
        // 创建默认缓存实例，兼容现有代码
        this.createCache('formation', CONFIG.FORMATION_CHACE_SIZE);
    }

    createCache(name, capacity) {
        if (this.caches.has(name)) {
            debugLog(CONFIG.DEBUG, `缓存 ${name} 已存在，返回现有实例`);
            return this.caches.get(name);
        }
        
        const cacheInstance = new CacheInstance(name, capacity);
        this.caches.set(name, cacheInstance);
        return cacheInstance;
    }

    getCache(name) {
        if (!this.caches.has(name)) {
            debugLog(CONFIG.DEBUG, `缓存 ${name} 不存在，请先创建`);
            return null;
        }
        return this.caches.get(name);
    }

    deleteCache(name) {
        if (this.caches.has(name)) {
            this.caches.delete(name);
            return true;
        }
        return false;
    }

    // 兼容旧版API
    get(key) {
        return this.getCache('formation')?.get(key);
    }

    set(key, value) {
        return this.getCache('formation')?.set(key, value);
    }

    getAllKeys() {
        return this.getCache('formation')?.getAllKeys() || [];
    }

    printStats() {
        this.getCache('formation')?.printStats();
    }

    saveToStorage() {
        for (const [name, cache] of this.caches.entries()) {
            cache.saveToStorage();
        }
    }

    printAllStats() {
        for (const [name, cache] of this.caches.entries()) {
            cache.printStats();
        }
    }
}

// 单例导出，兼容现有代码
export const cacheManager = new CacheManager();

// 新的使用方式:
// const userCache = cacheManager.createCache('users', 100);
// userCache.set('user1', userData);
// const userData = userCache.get('user1');