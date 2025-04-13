// MCTSAgent.js
import { CONFIG } from "./gameConstants";
import { debugLog } from "./historyUtils";
export class MCTSAgent {
    constructor(config = {}) {
        this.simulations = config.simulations || 100;
        this.maxDepth = config.maxDepth || 4;
    }

    /**
     * 决策函数 - 给出最佳落子位置
     */
    getBestPlace(currentColor, opponentColor, possiblePositions, tempBoard, evaluatePositionsFn) {

        const finalPositions = [];
        possiblePositions.forEach(position => {
            // 递归检查下一层
            this.runMCTSForPlace(tempBoard, currentColor, opponentColor, position, evaluatePositionsFn);
        });

        return null; // 这里需要实现评估函数来选择最佳落子位置
    }

    getBestMove(currentColor, opponentColor, possiblePositions, tempBoard) {

        return this.runMCTS2(tempBoard, currentColor, opponentColor, possiblePositions);
    }

    runMCTSForPlace(tempBoard, currentColor, opponentColor, position, evaluatePositionsFn) {
        // 其他棋子
        let availablePositions = new Set();
        this.applyPlace(tempBoard, position, currentColor);
        let player = currentColor;
        let other = opponentColor;
        // 交换选手
        [player, other] = [other, player];
        // 放一个棋子后，模拟对方也放一个棋子, 假设己方放置一颗棋子后还差一颗就会形成阵型了，则对方一定会去封堵这个
        let { bestSelfPosition, bestOpponentPosition } = evaluatePositionsFn(tempBoard, player, other, availablePositions);
        // 此种场景bestOpponentPosition一定有值，落子
        if (bestSelfPosition) {
            this.applyPlace(tempBoard, bestSelfPosition, player);
            // 交换选手
            [player, other] = [other, player];
            debugLog(CONFIG.DEBUG, "bestSelfPostion", bestSelfPosition, player);
            // 放一个棋子后，模拟对方也放一个棋子, 假设己方放置一颗棋子后还差一颗就会形成阵型了，则对方一定会去封堵这个
            this.unApplyPlace(tempBoard, bestSelfPosition);
        } else {
            if (bestOpponentPosition) {
                this.applyPlace(tempBoard, bestOpponentPosition, player);
                // 交换选手
                [player, other] = [other, player];
                debugLog(CONFIG.DEBUG, "bestOpponentPosition", bestOpponentPosition, player)
                // 放一个棋子后，模拟对方也放一个棋子, 假设己方放置一颗棋子后还差一颗就会形成阵型了，则对方一定会去封堵这个
                this.unApplyPlace(tempBoard, bestOpponentPosition);
            } else {
                // availablePositions周边空位肯定有值
                const possible = Array.from(availablePositions).map(p => JSON.parse(p));

                const pos = this.pickRandom(possible);
                this.applyPlace(tempBoard, pos, player);
                // 交换选手
                [player, other] = [other, player];
                debugLog(CONFIG.DEBUG, "pickRandom", pos, player)
                this.unApplyPlace(tempBoard, pos);
            }
        }

        this.unApplyPlace(tempBoard, position);
    }

    runMCTS2(tempBoard, currentColor, opponentColor, candidatePositions) {

        const stats = {};

        for (let i = 0; i < this.simulations; i++) {
            const pos = this.pickRandom(candidatePositions);
            this.applyMove(tempBoard, pos, currentColor);

            const winner = this.simulateGame(tempBoard, opponentColor, currentColor);

            const key = `${pos[0]},${pos[1]}`;
            if (!stats[key]) stats[key] = { wins: 0, visits: 0 };
            if (winner === currentColor) stats[key].wins += 1;
            stats[key].visits += 1;
        }

        let bestPos = null;
        let bestWinRate = -1;

        for (let pos of candidatePositions) {
            const key = `${pos[0]},${pos[1]}`;
            const { wins = 0, visits = 1 } = stats[key] || {};
            const winRate = wins / visits;
            if (winRate > bestWinRate) {
                bestWinRate = winRate;
                bestPos = pos;
            }
        }

        return bestPos;
    }

    simulateGame(board, currentColor, opponentColor) {
        let turn = 0;
        let player = currentColor;
        let other = opponentColor;

        const maxTurns = this.maxDepth;

        while (turn < maxTurns) {
            const availablePositions = new Set();
            // TODO: 这里需要实现获取可用位置的逻辑
            const possible = Array.from(availablePositions).map(p => JSON.parse(p));
            if (possible.length === 0) break;

            const move = this.pickRandom(possible);
            this.applyMove(board, move, player);

            // 交换选手
            [player, other] = [other, player];
            turn++;
        }

        return this.estimateWinner(board);
    }
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
    applyMove(board, pos, color) {
        const [row, col] = pos;
        board[row][col] = {
            color,
            isFormation: false
        };
    }

    estimateWinner(board) { // 估计赢家,logic to determine the winner based on the board state
        let black = 0, white = 0;
        for (let row of board) {
            for (let cell of row) {
                if (cell?.color === 'black') black++;
                if (cell?.color === 'white') white++;
            }
        }
        return black > white ? 'black' : 'white';
    }

    pickRandom(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}
