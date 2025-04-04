import { DIRECTIONS,CONFIG} from './gameConstants.js';
import { isInBoard, isOnEdge } from './boardUtils.js';
import { cacheManager } from './cacheManager.js';
import { debugLog } from './historyUtils.js';

export function checkFormation(row, col, currentColor, newBoard) {
    // Generate cache key
    const cacheKey = cacheManager.generateKey(row, col, currentColor, newBoard);
    
    // Try to get from cache
    const cachedResult = cacheManager.get(cacheKey);
    if (cachedResult) {
        debugLog(CONFIG.DEBUG,'${currentColor}:Cache hit for formation check:', cacheKey);
        return cachedResult;
    }
    let extraMoves = 0;
    let formationPositions = [];
    let formationType = '';
    // const newBoard = this.data.board;
    // 检查大方
    const squareResult = checkSquare(row, col, currentColor, newBoard);
    if (squareResult.squareCount > 0) {
        extraMoves += squareResult.squareCount; // 每个大方增加1次额外落子
        formationPositions.push(...squareResult.formationPositions);
        formationType += squareResult.squareCount > 1 ? `${squareResult.squareCount}个大方 ` : '大方 ';
    }

    // 检查斜线
    const diagonalResult = checkDiagonal(row, col, currentColor, newBoard);
    if (diagonalResult.diagonalCounts.length > 0) {
        // 去重，确保每个斜线只被计算一次
        const uniqueDiagonalCounts = diagonalResult.diagonalCounts;

        for (const count of uniqueDiagonalCounts) {
            extraMoves += count - 2; // 每个斜线增加 (count - 2) 次额外落子
            formationPositions.push(...diagonalResult.formationPositions);
            formationType += `${count}斜 `; // 添加空格分隔多个斜线
        }
    }

    // 检查龙
    const dragonResult = checkDragon(row, col, currentColor, newBoard);
    if (dragonResult.dragonCount > 0) {
        extraMoves += dragonResult.dragonCount * 4; // 每条龙增加4次额外落子
        formationPositions.push(...dragonResult.formationPositions);
        formationType += dragonResult.dragonCount > 1 ? '双龙 ' : '大龙 ';
    }

    const result = extraMoves > 0 ? {
        extraMoves: extraMoves,
        formationPositions: formationPositions,
        formationType: formationType
    } : null;

    // Save to cache before returning
    cacheManager.set(cacheKey, result);
    return result;// 表示没有形成阵型
}

export function checkSquare(row, col, currentColor, newBoard) {
    const board = newBoard;
    let squareCount = 0;
    let formationPositions = [];

    for (let pattern of DIRECTIONS.SQUARE_PATTERNS) {
        let isSquare = true;
        let tempFormationPositions = [];
        for (let [dx, dy] of pattern) {
            const newRow = row + dx;
            const newCol = col + dy;
            const position = {targetRow: newRow, targetCol: newCol}
            if (!isInBoard(newRow, newCol) ||
                !board[newRow][newCol] ||
                board[newRow][newCol].color !== currentColor) {
                isSquare = false;
                break;
            }
            tempFormationPositions.push({
                row: newRow,
                col: newCol
            });
        }
        if (isSquare) {
            squareCount++; // 增加大方的数量
            formationPositions.push(...tempFormationPositions); // 添加中心点
            // 只添加一次中心点
            if (squareCount === 1) {
                formationPositions.push({
                    row: row,
                    col: col
                }); // 添加中心点
            }
        }
    }

    return {
        squareCount: squareCount,
        formationPositions: formationPositions
    };
}

export function checkDiagonal(row, col, currentColor, newBoard) {
    const board = newBoard;
    let diagonalCounts = []; // 记录所有斜线的连续棋子数量
    let formationPositions = []; // 记录所有斜线的棋子位置
    for (const dir of DIRECTIONS.DIAGONAL_PATTERNS) {
        const {
            dx,
            dy
        } = dir;

        // 计算整个方向上的棋子数，并寻找完整的边界
        let startRow = row,
            startCol = col;
        let endRow = row,
            endCol = col;
        let count = 1;
        let tempFormationPositions = [];
        // 向起点方向查找

        while (isInBoard(startRow - dx, startCol - dy) && board[startRow - dx][startCol - dy]?.color === currentColor) {
            count++;
            startRow -= dx;
            startCol -= dy;
            tempFormationPositions.push({
                row: startRow,
                col: startCol
            });
        }

        // 向终点方向查找
        while (isInBoard(endRow + dx, endCol + dy) && board[endRow + dx][endCol + dy]?.color === currentColor) {
            count++;
            endRow += dx;
            endCol += dy;
            tempFormationPositions.push({
                row: endRow,
                col: endCol
            });
        }

        // 只有当起点和终点都在棋盘边线上时，才符合斜线规则
        if (isOnEdge(startRow, startCol) && isOnEdge(endRow, endCol)) {
            if (count >= 3) { // 只记录3斜及以上的斜线
                diagonalCounts.push(count);
                if (formationPositions.length === 0) { // 如果斜线没有棋子，则添加中心点
                    formationPositions.push({
                        row: row,
                        col: col
                    }); // 添加中心点
                }
                formationPositions.push(...tempFormationPositions);
            }
        }
    }

    return {
        diagonalCounts: diagonalCounts,
        formationPositions: formationPositions
    };
}

export function checkDragon(row, col, currentColor, newBoard) {
    const board = newBoard;

    let dragonCount = 0; // 记录形成龙的数量
    let formationPositions = []; // 记录所有龙的棋子位置
    // 检查每个方向
    for (const dir of DIRECTIONS.DRAGON_PATTERNS) {
        const {
            dx,
            dy
        } = dir;

        // 向一个方向检查
        let r = row + dx;
        let c = col + dy;
        let count = 1;
        let edgeCount = isOnEdge(row, col) ? 1 : 0; // 统计边线上的棋子数量
        let tempFormationPositions = [];

        while (isInBoard(r,c) && board[r][c]?.color === currentColor) {
            count++;
            if (isOnEdge(r, c)) edgeCount++;
            if (edgeCount === 3) {
                break;
            }
            tempFormationPositions.push({
                row: r,
                col: c
            });
            r += dx;
            c += dy;
        }

        // 向相反方向检查
        r = row - dx;
        c = col - dy;
        

        while (isInBoard(r,c) && board[r][c]?.color === currentColor) {
            count++;
            if (isOnEdge(r, c)) edgeCount++;
            if (edgeCount === 3) {
                break;
            }
            tempFormationPositions.push({
                row: r,
                col: c
            });
            r -= dx;
            c -= dy;
        }

        // 检查是否形成6个连续棋子，并且不全部在边线上
        if (count === 6 && edgeCount < 3) {
            dragonCount++; // 增加龙的数量
            formationPositions.push(...tempFormationPositions);

            if (dragonCount === 1) {
                formationPositions.push({
                    row: row,
                    col: col
                }); // 添加中心点
            }
        }
    }

    return {
        dragonCount: dragonCount,
        formationPositions: formationPositions
    };
}

export function hasNonFormationPieces(opponentColor, board) {
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (board[row][col] && board[row][col].color === opponentColor) {
                if (!board[row][col].isFormation) {
                    return true; // 找到不在阵型中的棋子
                }
            }
        }
    }

    return false; // 没有找到不在阵型中的棋子
}

export function isStillInFormation(row, col, currentColor, newBoard) {
    // 检查大方
    const squareResult = checkSquare(row, col, currentColor, newBoard);
    if (squareResult.squareCount > 0) {
        return true; // 大方仍然完整
    }

    // 检查斜线
    const diagonalResult = checkDiagonal(row, col, currentColor, newBoard);
    if (diagonalResult.diagonalCounts.length > 0) {
        return true;
    }

    // 检查龙
    const dragonResult = checkDragon(row, col, currentColor, newBoard);
    if (dragonResult.dragonCount > 0) {
        return true;
    }

    return false; // 如果没有参与任何阵型，返回 false
}

export function hasNonSquarePieces(currentColor, formationPositions, row = 0, col = 0, board) {
    // 检查当前格子
    if (board[row][col] && board[row][col].color === currentColor) {
        const isInFormation = formationPositions.some(pos => pos.row === row && pos.col === col);
        if (!isInFormation) {
            const squareResult = checkSquare(row, col, currentColor, board);
            if (squareResult.squareCount === 0) {
                console.log('优先移除没有形成大方的棋子，比如第' + (row + 1) + '行, 第' + (col + 1) + '列的棋子');
                return true;
            } else {
                formationPositions.push(...squareResult.formationPositions);
            }
        }
    }

    // 递归检查下一个格子
    if (col < 5) {
        return hasNonSquarePieces(currentColor, formationPositions, row, col + 1, board);
    } else if (row < 5) {
        return hasNonSquarePieces(currentColor, formationPositions, row + 1, 0, board);
    }

    // 所有格子检查完毕，返回 false
    return false;
}