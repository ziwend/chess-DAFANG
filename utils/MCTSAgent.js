// MCTSAgent.js
import { CONFIG } from "./gameConstants";
import { debugLog } from "./historyUtils";

export class MCTSAgent {
    constructor(config = {}) {
        this.simulations = config.simulations || 100;
        this.maxDepth = config.maxDepth || 4;
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
        let bestMove = null;

        for (const position of possiblePositions) {
            const score = this.runMCTSForPlace(tempBoard, currentColor, opponentColor, position, evaluatePositionsFn);
            debugLog(CONFIG.DEBUG, '模拟位置得分:', position, score);
            if (score > bestScore) {
                bestScore = score;
                bestMove = position;
            }
        }
        debugLog(CONFIG.DEBUG, '最佳落子位置:', bestMove, '得分:', bestScore, currentColor);
        return bestMove;
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
        // 执行模拟
        let wins = 0;
        for (let i = 0; i < this.simulations; i++) {
            const boardCopy = JSON.parse(JSON.stringify(tempBoard));
            this.applyPlace(boardCopy, position, currentColor);
            const winner = this.simulateGame(boardCopy, opponentColor, currentColor, evaluatePositionsFn);
            if (winner === currentColor) wins++;
            else if (winner === 'draw') wins += 0.5;
        }
        return wins;
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
            const { bestSelfPosition } = evaluatePositionsFn(board, player, other, availablePositions);
            const possible = Array.from(availablePositions).map(p => JSON.parse(p));

            if (possible.length === 0) break;

            const move = this.pickRandom(possible);
            this.applyPlace(board, move, player);

            if (bestSelfPosition) return player;

            [player, other] = [other, player];
            turn++;
        }

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

    /**
     * 撤销棋盘上的某个落子
     * @param {Array} board 棋盘
     * @param {Array} pos [row, col] 位置
     */
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
     * 从数组中随机选择一个元素
     * @param {Array} array 候选数组
     * @returns {*} 随机选中的元素
     */
    pickRandom(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

