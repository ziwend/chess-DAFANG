// MCTSAgent.js
import { CONFIG } from "./gameConstants";
import { debugLog } from "./historyUtils";
import { applyPlace, unApplyPlace } from "./boardUtils";

export class MCTSAgent {
    constructor(config = {}) {
        this.dynamicSimulations = config.dynamicSimulations || 100;
        this.dynamicDepth = config.dynamicDepth || 5;
        // Initialize the Map to track used positions
        this.usedPositions = new Map();
        this.simulationCache = new Map(); // 缓存模拟结果
        this.firstTurnCache = new Map(); // 缓存第一轮的可用位置
    }

    /**
     * 获取最佳落子位置
     * @param {string} player 当前玩家颜色
     * @param {string} opponent 对手颜色
     * @param {Array} board 当前棋盘状态
     * @param {Function} evaluatePositionsFn 用于评估局势的方法
     * @param {Set} availablePositions 所有可能的落子位置
     * @returns {Array} 最佳位置
     */


    // 修改 getBestPlace 方法中的相关代码
    getBestPlace(player, opponent, board, evaluatePositionsFn, availablePositions) {
        const options = Array.from(availablePositions).map(p => JSON.parse(p));
        const scores = new Map();

        for (const pos of options) {
            // 如果currentColor是white，防守一方
            // 在随机选择一个位置之前先判断一下，当前player是否为white防守方
            if (player === 'white') {
                // 如果是white防守方，则尝试让对方在当前availablePositions处放置一颗棋子，看对方是否还能形成阵型

                this.applyPlace(board, pos, opponent);
                const bestPositions = evaluatePositionsFn(board, player, opponent, new Set());
                // 意味着如果让对方黑方落子在pos，对方能形成多个阵型，对方就赢了
                if (bestPositions.bestOpponentPosition.length > 1) {
                    debugLog(CONFIG.DEBUG, `如果让${opponent}方放置在${pos},${opponent}方将获胜:`, bestPositions.bestOpponentPosition);
                    // 恢复棋盘状态
                    this.unApplyPlace(board, pos);
                    scores.set(JSON.stringify(pos), 1);
                    continue;
                }
                // 恢复棋盘状态
                this.unApplyPlace(board, pos);
            }

            this.applyPlace(board, pos, player);
            // 计算一次空位
            const emptyPositions = this.getEmptyPositions(board);

            // 为每个位置创建独立的统计对象
            const posStats = new PositionCoverageStats(pos, emptyPositions);
            //去除缓存，因为反应变慢，也没有命中缓存
            //  const boardKey = JSON.stringify(boardCopy);
            // if (this.simulationCache.has(boardKey)) {
            //     const cachedAvg = this.simulationCache.get(boardKey);
            //     scores.set(JSON.stringify(pos), cachedAvg);
            //     debugLog(CONFIG.DEBUG, '使用缓存得分:', pos, cachedAvg);
            //     continue;
            // }

            let totalScore = 0;
            for (let i = 0; i < this.dynamicSimulations; i++) {
                debugLog(false, `开始第${i + 1}次模拟，当前位置: ${pos}，availablePositions=`,options);
                const boardCopy = JSON.parse(JSON.stringify(board));
                // 因为已经模拟己方下了一颗棋子，所以下面要从opponent开始走
                const winner = this.simulateGame(boardCopy, opponent, player, evaluatePositionsFn, posStats, pos);
                totalScore += (winner === player) ? 1 : (winner === opponent ? 0 : 0.5);
            }

            this.unApplyPlace(board, pos);

            const avg = totalScore / this.dynamicSimulations;
            scores.set(JSON.stringify(pos), avg);
            // Clear firstTurnCache after completing simulations for this position
            this.firstTurnCache.clear();

            // 每个位置模拟结束后立即输出其统计信息
            const coverage = posStats.getCoverageStats();
            debugLog(CONFIG.DEBUG, `对${player}方在位置[${pos}]进行${this.dynamicSimulations}次MCTS模拟，每次走${this.dynamicDepth}步，平均分: ${avg.toFixed(4)}，总空位: ${coverage.totalEmpty}，已用空位: ${coverage.coveredCount}， 空位覆盖率: ${coverage.coverageRate}%
${coverage.coverageRate < 100 ? `- 未使用的空位: ${coverage.uncoveredPositions.join(', ')}` : '- 所有空位都被使用！'}--------------`, pos);
        }

        let bestScore = -Infinity;
        let bestPlaces = [];
        for (const [key, score] of scores.entries()) {
            if (score > bestScore) {
                bestScore = score;
                bestPlaces = [JSON.parse(key)];
            } else if (score === bestScore) {
                bestPlaces.push(JSON.parse(key));
            }
        }

        return bestPlaces;
    }


    /**
     * 模拟游戏进行若干步，返回赢家
     * @param {Array} board 当前棋盘
     * @param {string} player 当前玩家颜色
     * @param {string} opponent 对手颜色
     * @param {Function} evaluatePositionsFn 评估函数（需生成下一步可落子位置）
     * @returns {string} 胜利者颜色或'draw'
     */
    simulateGame(board, player, opponent, evaluatePositionsFn, boardStats, firstMove) {
        let turn = 0;
        while (turn < this.dynamicDepth) {
            const availablePositions = new Set();
            let bestSelfPosition = [];
            let bestOpponentPosition = [];  // 添加变量声明
            // 第一轮使用缓存
            if (turn === 0) {
                const boardKey = JSON.stringify(board);
                if (!this.firstTurnCache.has(boardKey)) {
                    // 首次计算时缓存结果
                    const result = evaluatePositionsFn(board, player, opponent, availablePositions);
                    bestSelfPosition = result.bestSelfPosition;       // 使用结果中的值
                    bestOpponentPosition = result.bestOpponentPosition; // 使用结果中的值
                    this.firstTurnCache.set(boardKey, {
                        positions: Array.from(availablePositions),
                        bestSelf: bestSelfPosition,
                        bestOpponent: bestOpponentPosition
                    });
                } else {
                    // 使用缓存
                    const cached = this.firstTurnCache.get(boardKey);
                    cached.positions.forEach(pos => availablePositions.add(pos));
                    bestSelfPosition = cached.bestSelf;
                    bestOpponentPosition = cached.bestOpponent;
                    debugLog(false, `使用第一轮缓存: ${availablePositions.size}个可用位置`);
                }
            } else {
                // 后续轮次正常计算
                const result = evaluatePositionsFn(board, player, opponent, availablePositions);
                bestSelfPosition = result.bestSelfPosition;
                bestOpponentPosition = result.bestOpponentPosition;
            }

            // 处理己方最佳位置数组
            if (bestSelfPosition.length > 0) {
                if (CONFIG.DEBUG) {
                    bestSelfPosition.forEach(pos => boardStats.recordUsed(pos));
                    debugLog(CONFIG.DEBUG, `针对可选位置[${firstMove}]交替放置第${turn}颗piece后${player}方获胜，bestSelf:`, bestSelfPosition);
                }
                return player;
            }

            let place = null;
            // 处理对手最佳位置数组
            if (bestOpponentPosition.length > 1) { // TODO 没法处理的情况时，对方下一步可以在不同的位置形成多个阵型，获得的奖励不一样也无法封堵
                // 如果有多个相等的最佳位置，对方有多个那就是堵不住了，说明对方赢了
                debugLog(CONFIG.DEBUG, `针对可选位置[${firstMove}]交替放置第${turn}颗piece后${opponent}方获胜，返回bestOpponentPosition:`, bestOpponentPosition);
                return opponent;
            } else if (bestOpponentPosition.length === 1) {
                place = bestOpponentPosition[0];
            } else {
                const options = Array.from(availablePositions).map(p => typeof p === 'string' ? JSON.parse(p) : p);
                if (options.length === 0) break;

                // 在随机选择一个位置之前先判断一下，当前player是否为white防守方
                if (player === 'white') {
                    // 如果是white防守方，则尝试让对方在当前availablePositions处放置一颗棋子，看对方是否还能形成阵型
                    for (const pos of options) {
                        this.applyPlace(board, pos, opponent);

                        const bestPositions = evaluatePositionsFn(board, player, opponent, new Set());
                        // 意味着如果让对方黑方落子在pos，对方能形成多个阵型，对方就赢了，所以white方要提前占领该位置
                        if (bestPositions.bestOpponentPosition.length > 1) {
                            debugLog(false, `针对可选位置[${firstMove}]交替放置第${turn}颗piece后如果让${opponent}方放置在${pos},${opponent}方将获胜:`, bestPositions.bestOpponentPosition, options, board);
                            place = pos;
                            // 恢复棋盘状态
                            // this.unApplyPlace(board, pos); 可以不恢复，因为后面会直接在该位置放置己方棋子
                            break;
                        }
                        // 恢复棋盘状态
                        this.unApplyPlace(board, pos);
                    }
                    if (!place) {
                        place = this.pickRandom(options);
                    }                    
                } else {
                    // 如果是black
                    place = this.pickRandom(options);
                }
            }

            // 记录本次使用的位置
            if (CONFIG.DEBUG) {
                boardStats.recordUsed(place);
            }

            this.applyPlace(board, place, player);
            [player, opponent] = [opponent, player];
            turn++;
        }

        const score = this.evaluateBoardScore(board, player, opponent, evaluatePositionsFn);
        return score > 0.5 ? player : score < 0.5 ? opponent : 'draw';
    }

    evaluateBoardScore(board, player, opponent, evaluatePositionsFn) {
        const available = new Set();
        const { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(board, player, opponent, available);

        if (bestOpponentPosition.length > 1) {
            // 如果是数组的数组，说明有多个相等的最佳位置，对方有多个那就是堵不住了，说明对方赢了
            debugLog(CONFIG.DEBUG, `${player}的对手的最佳位置有多个那就是堵不住了，说明对方赢了:`, bestOpponentPosition);
            return 0;
        }

        let threatBonus = bestSelfPosition.length > 0 ? 0.2 : 0;
        let dangerPenalty = bestOpponentPosition.length > 0 ? -0.2 : 0;
        let score = 0.5 + threatBonus + dangerPenalty;
        return Math.max(0, Math.min(1, score));
    }

    /**
     * 在棋盘上放置棋子
     * @param {Array} board 棋盘
     * @param {Array} pos [row, col] 位置
     * @param {string} color 玩家颜色
     */
    applyPlace(board, pos, color) {
        applyPlace(board, pos, color);
    }

    unApplyPlace(board, pos) {
        unApplyPlace(board, pos);
    }

    /**
     * 从数组中选择一个未使用的随机元素
     * @param {Array} array 候选数组
     * @returns {*} 随机选中的元素
     */
    pickRandom(array) {
        if (!array.length) return null;

        // 排序生成唯一 key（避免排列不同导致重复）
        const arrayKey = JSON.stringify(array.slice().sort());

        if (!this.shuffleCache) this.shuffleCache = new Map();
        if (!this.shuffleCursor) this.shuffleCursor = new Map();

        // 初始化缓存
        if (!this.shuffleCache.has(arrayKey)) {
            const indices = [...Array(array.length).keys()];
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            this.shuffleCache.set(arrayKey, indices);
            this.shuffleCursor.set(arrayKey, 0);
        }

        const cursor = this.shuffleCursor.get(arrayKey);
        const sequence = this.shuffleCache.get(arrayKey);

        // 如果用完一轮，重新洗牌并从头开始
        if (cursor >= sequence.length) {
            debugLog(false, '所有位置都已使用，重置记录:', array);
            const indices = [...Array(array.length).keys()];
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            this.shuffleCache.set(arrayKey, indices);
            this.shuffleCursor.set(arrayKey, 0);
        }

        const currentCursor = this.shuffleCursor.get(arrayKey);
        const selectedIndex = this.shuffleCache.get(arrayKey)[currentCursor];
        this.shuffleCursor.set(arrayKey, currentCursor + 1);

        return array[selectedIndex];
    }
    pickRandom2(array) {
        if (!array.length) return null;

        // 获取当前数组的唯一键
        const arrayKey = JSON.stringify(array.sort());
        const usedIndices = this.usedPositions.get(arrayKey) || new Set();

        // 如果所有位置都已使用，重置记录
        if (usedIndices.size >= array.length) {
            debugLog(CONFIG.DEBUG, '所有位置都已使用，重置记录:', array);
            usedIndices.clear();
        }

        // 选择未使用的随机位置
        let availableIndices = [];
        for (let i = 0; i < array.length; i++) {
            if (!usedIndices.has(i)) {
                availableIndices.push(i);
            }
        }

        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        const selectedIndex = availableIndices[randomIndex];

        // 记录已使用的位置
        usedIndices.add(selectedIndex);
        this.usedPositions.set(arrayKey, usedIndices);

        return array[selectedIndex];
    }

    // 添加清理方法
    clearUsedPositions() {
        this.usedPositions.clear();
    }

    getEmptyPositions(board) {
        const emptyPositions = new Set();
        for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
            for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
                if (!board[row][col]) {
                    emptyPositions.add(JSON.stringify([row, col]));
                }
            }
        }
        return emptyPositions;
    }
}

class PositionCoverageStats {
    constructor(targetPos, emptyPositions) {
        this.targetPos = targetPos;
        this.emptyPositions = emptyPositions;  // 直接使用传入的空位集合
        this.usedPositions = new Map();
    }

    initEmptyPositions(board) {
        for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
            for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
                if (!board[row][col]) {
                    this.emptyPositions.add(JSON.stringify([row, col]));
                }
            }
        }
    }

    recordUsed(position) {
        const posStr = typeof position === 'string' ? position : JSON.stringify(position);
        const count = this.usedPositions.get(posStr) || 0;
        this.usedPositions.set(posStr, count + 1);
    }

    getCoverageStats() {
        const covered = new Set(this.usedPositions.keys());
        const uncovered = new Set(
            [...this.emptyPositions].filter(x => !covered.has(x))
        );

        return {
            targetPos: this.targetPos,
            totalEmpty: this.emptyPositions.size,
            coveredCount: covered.size,
            coverageRate: (covered.size / Math.max(1, this.emptyPositions.size) * 100).toFixed(2),
            uncoveredPositions: Array.from(uncovered),
            positionUsage: Object.fromEntries(
                Array.from(this.usedPositions.entries())
                    .sort(([, a], [, b]) => b - a)
            )
        };
    }
}