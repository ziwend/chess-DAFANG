// MCTSAgent.js
import { CONFIG } from "./gameConstants";
import { debugLog } from "./historyUtils";

export class MCTSAgent {
    constructor(config = {}) {
        this.maxDepth = config.maxDepth || 4;
        this.maxSimulations = config.maxSimulations || 50;
        this.minSimulations = config.minSimulations || 2;
        this.dynamicSimulation = config.dynamicSimulation !== false;
        this.DEBUG = config.DEBUG || false;
        // Initialize the Map to track used positions
        this.usedPositions = new Map();
    }

    /**
     * 获取最佳落子位置
     * @param {string} currentColor 当前玩家颜色
     * @param {string} opponentColor 对手颜色
     * @param {Array} possiblePositions 所有可能的落子位置
     * @param {Array} tempBoard 当前棋盘状态
     * @param {Function} evaluatePositionsFn 用于评估局势的方法
     * @returns {Array|null} 最佳位置或null
     */
    getBestPlace(currentColor, opponentColor, possiblePositions, tempBoard, evaluatePositionsFn) {
        let bestScore = -Infinity;
        let bestPlace = null;

        for (const position of possiblePositions) {
            const score = this.runMCTSForPlace(tempBoard, currentColor, opponentColor, position, evaluatePositionsFn);
            debugLog(this.DEBUG, '模拟位置得分:', position, score);
            if (score > bestScore) {
                bestScore = score;
                bestPlace = position;
            }
        }
        debugLog(this.DEBUG, '最佳落子位置:', bestPlace, '得分:', bestScore, currentColor);

        return bestPlace;
        //return null; // only test
    }

    /**
     * 针对某个落子位置运行一次MCTS模拟
     * @param {Array} tempBoard 当前棋盘状态
     * @param {string} currentColor 当前玩家颜色
     * @param {string} opponentColor 对手颜色
     * @param {Array} position 当前模拟的落子位置
     * @param {Function} evaluatePositionsFn 用于评估局势的方法
     * @returns {number} 模拟得分
     */
    runMCTSForPlace(tempBoard, currentColor, opponentColor, position, evaluatePositionsFn) {
        this.applyPlace(tempBoard, position, currentColor);

        const winner = this.checkImmediateWin(tempBoard, currentColor, opponentColor, evaluatePositionsFn);
        this.unApplyPlace(tempBoard, position);

        if (winner === currentColor) return 1000;
        if (winner === opponentColor) return -1000;
        if (winner === 'draw') return 0;

        const boardCopy = JSON.parse(JSON.stringify(tempBoard));
        this.applyPlace(boardCopy, position, currentColor);

        const availablePositions = new Set();
        evaluatePositionsFn(boardCopy, opponentColor, currentColor, availablePositions);
        const availableCount = availablePositions.size;

        let simulations = this.maxSimulations;
        if (this.dynamicSimulation) {
            const estimatedCombos = Math.pow(availableCount, Math.min(this.maxDepth, availableCount));
            simulations = Math.min(this.maxSimulations, Math.max(this.minSimulations, estimatedCombos));
        }

        let wins = 0;
        for (let i = 0; i < simulations; i++) {
            const simBoard = JSON.parse(JSON.stringify(boardCopy));
            const result = this.simulateGame(simBoard, opponentColor, currentColor, evaluatePositionsFn);
            if (result === currentColor) wins++;
            else if (result === 'draw') wins += 0.5;
            else if (result === opponentColor) wins--;
        }

        return wins;
    }

    checkImmediateWin(board, currentColor, opponentColor, evaluatePositionsFn) {
        const availablePositions = new Set();
        const { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(board, currentColor, opponentColor, availablePositions);
        if (bestSelfPosition) return currentColor;
        if (bestOpponentPosition) return opponentColor;

        return availablePositions.size === 0 ? 'draw' : null;
    }
    /**
     * 模拟游戏进行若干步，返回赢家
     * @param {Array} board 当前棋盘
     * @param {string} currentColor 当前玩家颜色
     * @param {string} opponentColor 对手颜色
     * @param {Function} evaluatePositionsFn 评估函数（需生成下一步可落子位置）
     * @returns {string} 胜利者颜色或'draw'
     */
    simulateGame(board, currentColor, opponentColor, evaluatePositionsFn) {
        let turn = 0;
        let player = currentColor;
        let other = opponentColor;

        while (turn < this.maxDepth) {
            const availablePositions = new Set();
            const { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(board, player, other, availablePositions);

            // 处理己方最佳位置数组
            if (bestSelfPosition) {
                // 如果是数组的数组，说明有多个相等的最佳位置
                if (Array.isArray(bestSelfPosition[0])) {
                    // 随机选择一个位置
                    const randomIndex = Math.floor(Math.random() * bestSelfPosition.length);
                    this.applyPlace(board, bestSelfPosition[randomIndex], player);
                    return player;
                } else {
                    this.applyPlace(board, bestSelfPosition, player);
                    return player;
                }
            }

            let place = null;
        // 处理对手最佳位置数组
        if (bestOpponentPosition) {
            if (Array.isArray(bestOpponentPosition[0])) {
                // 随机选择一个位置
                const randomIndex = Math.floor(Math.random() * bestOpponentPosition.length);
                place = bestOpponentPosition[randomIndex];
            } else {
                place = bestOpponentPosition;
            }
        }  else {
                const possible = Array.from(availablePositions).map(p => JSON.parse(p));

                if (possible.length === 0) break;

                place = this.pickRandom(possible);
            }

            // debugLog(CONFIG.DEBUG, '模拟位置:', place, 'turn:', turn);
            this.applyPlace(board, place, player);

            [player, other] = [other, player];
            turn++;
        }
        this.clearUsedPositions(); // 清理已使用位置记录
        return this.estimateWinner(board);
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
        let black = 0, white = 0;
        for (let row of board) {
            for (let cell of row) {
                if (cell?.color === 'black') black++;
                if (cell?.color === 'white') white++;
            }
        }
        return black > white ? 'black' : white > black ? 'white' : 'draw';
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

