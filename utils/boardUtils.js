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

export function updateBoard(color, startRow, startCol, targetRow, targetCol, board) {
    let newBoard = [...board];
    if (startRow !== null && startCol !== null) newBoard[startRow][startCol] = null;
    if (targetRow !== null && targetCol !== null) newBoard[targetRow][targetCol] = {
        color,
        isFormation: false
    };

    return newBoard;
}

export function isMaxPiecesCount (blackCount, whiteCount) {
    return blackCount + whiteCount === CONFIG.MAX_PIECES_COUNT;
}

// 新增：检查棋盘是否已满
export function isBoardWillFull (blackCount, whiteCount) {
    return blackCount + whiteCount + 1 === CONFIG.MAX_PIECES_COUNT;
}

// 创建一个专用的深拷贝函数
export function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    const copy = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      copy[key] = deepCopy(obj[key]);
    }
    return copy;
  }