import { DIRECTIONS, CONFIG } from './gameConstants.js';

export function isOnEdge(row, col) {
    return row === 0 || row === 5 || col === 0 || col === 5;
}

export function isInBoard(row, col) {
    return row >= 0 && row <= 5 && col >= 0 && col <= 5;
}
export function canPlace(row, col, board) {
    return isInBoard(row, col) && !board[row][col];
}
export function canMove(row, col, board) {
    for (const dir of DIRECTIONS.ADJACENT) {
        const newRow = row + dir.dx;
        const newCol = col + dir.dy;
        if (isInBoard(newRow, newCol) && !board[newRow][newCol]) {
            return true; // 如果有一个方向可以移动，返回 true
        }
    }
    return false; // 所有方向都被占据，无法移动
}
export function hasValidPiece(row, col, board) {
    if (isInBoard(row, col) && board[row][col]) {
        return board[row][col].color;
    } else { // 如果不在棋盘上或没有棋子，返回 null
        return null;
    }
}
// 当前位置存在棋子且可以移动
export function hasValidPieceAndCanMove(currentColor, row, col, board) {
    if (board[row][col] && board[row][col].color === currentColor && canMove(row, col, board)) {
        return true;
    }
}
export function hasValidMoves(currentColor, board) {
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (hasValidPieceAndCanMove(currentColor, row, col, board)) {
                return true; // 如果有一个棋子可以移动，返回 true
            }

        }
    }
    return false; // 所有棋子都无法移动
}
// 新增棋盘放置棋子，移除棋子相关代码
export function updateBoard(color, startRow, startCol, targetRow, targetCol, board) {
    let newBoard = [...board];
    if (startRow !== null && startCol !== null) newBoard[startRow][startCol] = null;
    if (targetRow !== null && targetCol !== null) newBoard[targetRow][targetCol] = {
        color,
        isFormation: false
    };

    return newBoard;
}

/**
 * 在棋盘上放置棋子
 * @param {Array} board 棋盘
 * @param {Array} pos [row, col] 位置
 * @param {string} color 玩家颜色
 */
export function applyPlace(board, pos, color) {
    const [row, col] = pos;
    board[row][col] = {
        color,
        isFormation: false
    };
}

/**
 * 在棋盘上移除棋子
 * @param {Array} board 棋盘
 * @param {Array} pos [row, col] 位置
 */
export function unApplyPlace(board, pos) {
    const [row, col] = pos;
    board[row][col] = null;
}
export function isMaxPiecesCount(blackCount, whiteCount) {
    return blackCount + whiteCount === CONFIG.MAX_PIECES_COUNT;
}

// 新增：检查棋盘是否已满
export function isBoardWillFull(blackCount, whiteCount) {
    return blackCount + whiteCount + 1 === CONFIG.MAX_PIECES_COUNT;
}
// 新增：邻接棋子部分
/**
 * 评估位置row, col的邻接棋子情况
 */
export function evaluateAdjacentPieces(row, col, currentColor, opponentColor, board) {
    const { countAdjacent, countAdjacentOpponent } = countAdjacentPieces(row, col, currentColor, opponentColor, board);

    return {
        selfAdjacent: countAdjacent,
        opponentAdjacent: countAdjacentOpponent,
        totalAdjacent: Math.max(countAdjacent, countAdjacentOpponent)
    };
}

/**
 * 评估某位置row, col的邻接己方和对方棋子数量
 */
export function countAdjacentPieces(row, col, currentColor, opponentColor, board) {
    let countAdjacent = 0;
    let countAdjacentOpponent = 0;
    for (const dir of DIRECTIONS.ADJACENT) {
        const newRow = row + dir.dx;
        const newCol = col + dir.dy;
        if (hasValidPiece(newRow, newCol, board) === currentColor) {
            countAdjacent++;
        } else if (hasValidPiece(newRow, newCol, board) === opponentColor) {
            countAdjacentOpponent++;
        }
    }
    return { countAdjacent, countAdjacentOpponent };
}

/**
 * 评估某位置row, col是否有邻接的color棋子
 */
export function hasAdjacentPiece(row, col, color, board) {
    for (const dir of DIRECTIONS.ADJACENT) {
        const newRow = row + dir.dx;
        const newCol = col + dir.dy;
        if (hasValidPiece(newRow, newCol, board) === color) {
            return true; // 找到一个己方棋子，直接返回
        }
    }
    return false; // 没有找到任何己方棋子
}

/**
 * 专用的深拷贝函数,Performance: For simple use cases, it might be slower than the JSON method
 * const boardCopy = JSON.parse(JSON.stringify(currentBoard));
 * 已放弃使用该function
 */
export function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    const copy = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
        copy[key] = deepCopy(obj[key]);
    }
    return copy;
}