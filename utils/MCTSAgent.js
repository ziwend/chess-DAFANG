// MCTSAgent.js
import { CONFIG, WEIGHTS } from "./gameConstants";
import { debugLog } from "./historyUtils";

export class MCTSAgent {
    constructor(config = {}) {
        this.maxDepth = config.maxDepth || 5;
        this.maxSimulations = config.maxSimulations || 100;
        this.currentPlayer = config.currentPlayer || 'black';

        // Initialize the Map to track used positions
        this.usedPositions = new Map();
        this.simulationCache = new Map(); // 缓存模拟结果
    }

    /**
     * 获取最佳落子位置
     * @param {string} currentColor 当前玩家颜色
     * @param {string} opponentColor 对手颜色
     * @param {Array} possiblePositions 所有可能的落子位置
     * @param {Array} currentBoard 当前棋盘状态
     * @param {Function} evaluatePositionsFn 用于评估局势的方法
     * @returns {Array} 最佳位置
     */
    getBestPlace(currentColor, opponentColor, currentBoard, evaluatePositionsFn, extraMoves) {
        const availablePositions = new Set();
        let finalPositions = [];
        finalPositions = this.checkImmediateWin(currentBoard, currentColor, opponentColor, evaluatePositionsFn, availablePositions, extraMoves);
        if (finalPositions.length > 0) {
            return finalPositions;
        }

        const { black, white } = this.countStones(currentBoard);
        const empty = 36 - black - white;
        const dynamicSimulations = Math.min(this.maxSimulations, Math.pow(empty, 2));
        const dynamicDepth = Math.max(4, Math.min(this.maxDepth, empty));

        const options = Array.from(availablePositions).map(p => JSON.parse(p));
        const scores = new Map();

        for (const pos of options) {
            const boardCopy = JSON.parse(JSON.stringify(currentBoard));
            this.applyPlace(boardCopy, pos, currentColor);

            const boardKey = JSON.stringify(boardCopy);
            if (this.simulationCache.has(boardKey)) {
                const cachedAvg = this.simulationCache.get(boardKey);
                scores.set(JSON.stringify(pos), cachedAvg);
                debugLog(CONFIG.DEBUG, '使用缓存得分:', pos, cachedAvg);
                continue;
            }

            let totalScore = 0;
            for (let i = 0; i < dynamicSimulations; i++) {
                const simBoard = JSON.parse(JSON.stringify(boardCopy));
                const winner = this.simulateGame(simBoard, opponentColor, currentColor, evaluatePositionsFn, dynamicDepth);
                if (winner === currentColor) {
                    totalScore += 1;
                } else if (winner === opponentColor) {
                    totalScore += 0;
                } else {
                    totalScore += this.evaluateBoardScore(simBoard, currentColor, opponentColor, evaluatePositionsFn);
                }
            }

            const avg = totalScore / dynamicSimulations;
            this.simulationCache.set(boardKey, avg);
            scores.set(JSON.stringify(pos), avg);
            debugLog(false, `${currentColor}对${pos}进行${dynamicSimulations}次MCTS模拟得分:`, avg,);
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
        // 如果存在多个同分位置，根据 WEIGHTS 选择权重最大的位置
        if (bestPlaces.length > 1) {
            let maxWeight = -Infinity;
            bestPlaces = bestPlaces.filter(pos => {
                const [row, col] = pos;
                const weight = WEIGHTS[row][col];
                if (weight > maxWeight) {
                    maxWeight = weight;
                    return true;
                } else if (weight === maxWeight) {
                    return true;
                }
                return false;
            });
        }

        bestPlaces.forEach(pos => {
            finalPositions.push({
                action: 'placing',
                position: pos
            });
        });
        debugLog(CONFIG.DEBUG, `${currentColor}得分=${bestScore}的最佳落子位置:`, bestPlaces);

        return finalPositions;
    }

    checkImmediateWin(currentBoard, currentColor, opponentColor, evaluatePositionsFn, availablePositions, extraMoves) {
        const finalPositions = [];
        let { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(currentBoard, currentColor, opponentColor, availablePositions);

        // 1、优先判断放置在己方棋子周围是否会组成阵型
        if (bestSelfPosition && !extraMoves > 0) {
            if (Array.isArray(bestSelfPosition[0])) {
                // 处理多个相等位置的情况
                bestSelfPosition.forEach(pos => {
                    finalPositions.push({
                        action: 'placing',
                        position: pos
                    });
                });
            } else {
                finalPositions.push({
                    action: 'placing',
                    position: bestSelfPosition
                });
            }
            return finalPositions;
        }

        // 2、处理对方可能的位置
        if (bestOpponentPosition) {
            if (Array.isArray(bestOpponentPosition[0])) {
                // 处理多个相等位置的情况
                bestOpponentPosition.forEach(pos => {
                    finalPositions.push({
                        action: 'placing',
                        position: pos
                    });
                });
            } else {
                finalPositions.push({
                    action: 'placing',
                    position: bestOpponentPosition
                });
            }
            return finalPositions;
        }

        return [];
    }
    playFixedSimulation(board, player, opponent, evaluatePositionsFn, maxTurns) {
        let current = player;
        let other = opponent;
        for (let t = 0; t < maxTurns; t++) {
            const availablePositions = new Set();
            const { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(board, current, other, availablePositions);

            if (bestSelfPosition) {
                const move = Array.isArray(bestSelfPosition[0]) ? this.pickRandom(bestSelfPosition) : bestSelfPosition;
                this.applyPlace(board, move, current);
                return current === this.currentPlayer ? current : other;
            }

            const options = Array.from(availablePositions).map(p => JSON.parse(p));
            if (options.length === 0) break;

            const strategic = options.find(pos => {
                const simBoard = JSON.parse(JSON.stringify(board));
                this.applyPlace(simBoard, pos, current);
                const { bestSelfPosition } = evaluatePositionsFn(simBoard, current, other, new Set());
                return bestSelfPosition != null;
            });

            const move = strategic || this.pickRandom(options);
            this.applyPlace(board, move, current);
            [current, other] = [other, current];
        }

        const winner = this.estimateWinner(board);
        return winner;
    }
    /**
     * 模拟游戏进行若干步，返回赢家
     * @param {Array} board 当前棋盘
     * @param {string} currentColor 当前玩家颜色
     * @param {string} opponentColor 对手颜色
     * @param {Function} evaluatePositionsFn 评估函数（需生成下一步可落子位置）
     * @returns {string} 胜利者颜色或'draw'
     */
    simulateGame(board, player, opponent, evaluatePositionsFn, dynamicDepth = this.maxDepth) {
        let turn = 0;
        while (turn < dynamicDepth) {
            const availablePositions = new Set();
            const { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(board, player, opponent, availablePositions);

            // 处理己方最佳位置数组
            if (bestSelfPosition) {
                // 如果是数组的数组，说明有多个相等的最佳位置
                return player;
            }

            let move = null;
            const options = Array.from(availablePositions).map(p => JSON.parse(p));

            if (options.length === 0) break;

            const opportunities = options.filter(pos => {
                const tempBoard = JSON.parse(JSON.stringify(board));
                this.applyPlace(tempBoard, pos, player);
                const chance = evaluatePositionsFn(tempBoard, player, opponent, new Set());
                return !!chance.bestSelfPosition;
            });
            const threats = options.filter(pos => {
                const tempBoard = JSON.parse(JSON.stringify(board));
                this.applyPlace(tempBoard, pos, opponent);
                const threatCheck = evaluatePositionsFn(tempBoard, opponent, player, new Set());
                return !!threatCheck.bestSelfPosition;
            });

            if (opportunities.length > 0) {
                move = this.pickRandom(opportunities);
            } else if (threats.length > 0) {
                move = this.pickRandom(threats);
            } else {
                move = this.pickRandom(options);
            }

            this.applyPlace(board, move, player);
            [player, opponent] = [opponent, player];
            turn++;
        }

        const finalAvailable = new Set();
        const { bestSelfPosition } = evaluatePositionsFn(board, player, opponent, finalAvailable);
        if (bestSelfPosition) return player;

        const score = this.evaluateBoardScore(board, player, opponent, evaluatePositionsFn);
        return score > 0.5 ? player : score < 0.5 ? opponent : 'draw';
    }

    evaluateBoardScore(board, player, opponent, evaluatePositionsFn) {
        const { black, white } = this.countStones(board);
        const available = new Set();
        const { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(board, player, opponent, available);

        let materialScore = player === 'black' ? black - white : white - black;
        let threatBonus = bestSelfPosition ? 0.2 : 0;
        let dangerPenalty = bestOpponentPosition ? -0.2 : 0;

        let score = 0.5 + materialScore * 0.01 + threatBonus + dangerPenalty;
        return Math.max(0, Math.min(1, score));
    }

    /**
     * 在棋盘上放置棋子
     * @param {Array} board 棋盘
     * @param {Array} pos [row, col] 位置
     * @param {string} color 玩家颜色
     */
    applyPlace(board, pos, color) {
        const [row, col] = pos;
        board[row][col] = {
            color,
            isFormation: false
        };
    }

    unApplyPlace(board, pos) {
        const [row, col] = pos;
        board[row][col] = null;
    }
    /**
     * 根据棋盘当前状态估算赢家（用于平局判定）
     * @param {Array} board 当前棋盘
     * @returns {string} 胜者颜色或'draw'
     */
    estimateWinner(board) {
        const { black, white } = this.countStones(board);
        return black > white ? 'black' : white > black ? 'white' : 'draw';
    }

    countStones(board) {
        let black = 0, white = 0;
        for (let row of board) {
            for (let cell of row) {
                if (cell?.color === 'black') black++;
                if (cell?.color === 'white') white++;
            }
        }
        return { black, white };
    }
    estimateScore(board, player, opponent, evaluatePositionsFn) {
        const available = new Set();
        const { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(board, player, opponent, available);
        if (bestSelfPosition && !bestOpponentPosition) return 1;
        if (!bestSelfPosition && bestOpponentPosition) return 0;
        return 0.5;
    }
    /**
     * 从数组中选择一个未使用的随机元素
     * @param {Array} array 候选数组
     * @returns {*} 随机选中的元素
     */
    pickRandom(array) {
        if (!array.length) return null;

        // 获取当前数组的唯一键
        const arrayKey = JSON.stringify(array.sort());
        const usedIndices = this.usedPositions.get(arrayKey) || new Set();

        // 如果所有位置都已使用，重置记录
        if (usedIndices.size >= array.length) {
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
}

