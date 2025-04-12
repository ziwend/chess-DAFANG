import { DIRECTIONS, CONFIG } from './gameConstants.js';
import { isInBoard, isOnEdge } from './boardUtils.js';
import { cacheManager } from './cacheManager.js';
import { debugLog } from './historyUtils.js';
import { FORMATION_POSITIONS } from './formationPositions.js';

export function checkFormation(row, col, currentColor, board) {
    let extraMoves = 0;
    let formationPositions = [];
    let formationType = '';
    // 从 FORMATION_POSITIONS 中获取当前坐标的值
    const formationData = FORMATION_POSITIONS.get(`${row}${col}`);

    // 检查 square（大方）
    const squareResult = checkSquare(currentColor, board, formationData.square);
    if (squareResult) {
        extraMoves += squareResult.extraMoves;
        formationPositions.push(...squareResult.formationPositions);
        formationType += squareResult.formationType;
    }

    // 检查 diagonal（斜线）
    const diagonalResult = checkDiagonal(currentColor, board, formationData.diagonal);

    if (diagonalResult) {
        extraMoves += diagonalResult.extraMoves;
        formationPositions.push(...diagonalResult.formationPositions);
        formationType += diagonalResult.formationType;
    }

    // 检查 dragon（龙）
    const dragonResult = checkDragon(currentColor, board, formationData.dragon);
    if (dragonResult) {
        extraMoves += dragonResult.extraMoves;
        formationPositions.push(...dragonResult.formationPositions);
        formationType += dragonResult.formationType;
    }

    // 如果没有形成任何阵型，返回 null
    if (extraMoves === 0) {
        return null;
    }

    formationPositions.push([row, col]); // 添加中心点

    return {
        extraMoves,
        formationPositions,
        formationType
    };
}

export function checkSquare(currentColor, board, squares) {
    let squareCount = 0;
    let formationPositions = [];

    for (const square of squares) {
        const tempPositions = [];
        let isValid = true;
        for (const [r, c] of square) {
            if (board[r][c]?.color === currentColor) {
                tempPositions.push([r, c]);
            } else {
                isValid = false;
                break;
            }
        }
        if (isValid) {
            formationPositions.push(...tempPositions);
            squareCount++;
        }
    }

    if (squareCount > 0) {
        return {
            extraMoves: squareCount, // 每个大方增加 1 次额外落子
            formationPositions,
            formationType: squareCount > 1 ? `${squareCount}个大方 ` : '大方 '
        };
    }

    return null;
}

export function checkDiagonal(currentColor, board, diagonals) {
    let extraMoves = 0;
    let formationPositions = [];
    let formationType = '';

    for (const diagonal of diagonals) {
        const tempPositions = [];
        let isValid = true;
        for (const [r, c] of diagonal) {
            if (board[r][c]?.color === currentColor) {
                tempPositions.push([r, c]);
            } else {
                isValid = false;
                break;
            }
        }
        if (isValid) {
            formationPositions.push(...tempPositions);
            extraMoves += diagonal.length - 1; // 每个斜线增加 (count - 2) 次额外落子
            formationType += `${diagonal.length + 1}斜 `;
        }
    }

    if (extraMoves > 0) {
        return {
            extraMoves,
            formationPositions,
            formationType
        };
    }

    return null;
}

export function checkDragon(currentColor, board, dragons) {
    if (!dragons) return null;

    let dragonCount = 0;
    let formationPositions = [];

    for (const dragon of dragons) {
        const tempPositions = [];
        let isValid = true;
        for (const [r, c] of dragon) {
            if (board[r][c]?.color === currentColor) {
                tempPositions.push([r, c]);
            } else {
                isValid = false;
                break;
            }
        }
        if (isValid) {
            formationPositions.push(...tempPositions);
            dragonCount++;
        }
    }

    if (dragonCount > 0) {
        return {
            extraMoves: dragonCount * 4, // 每条龙增加 4 次额外落子
            formationPositions,
            formationType: dragonCount > 1 ? '双龙 ' : '大龙 '
        };
    }

    return null;
}

export function checkFormation2(row, col, currentColor, newBoard) {
    let extraMoves = 0;
    let formationPositions = [];
    let formationType = '';
    // const newBoard = this.data.board;
    debugLog(CONFIG.DEBUG, `[${row},${col}]`, null);
    // 检查大方
    const squareResult = checkSquare2(row, col, currentColor, newBoard);
    if (squareResult.squareCount > 0) {
        extraMoves += squareResult.squareCount; // 每个大方增加1次额外落子
        formationPositions.push(...squareResult.formationPositions);
        formationType += squareResult.squareCount > 1 ? `${squareResult.squareCount}个大方 ` : '大方 ';
    }

    // 检查斜线
    const diagonalResult = checkDiagonal2(row, col, currentColor, newBoard);
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

    const dragonResult = checkDragon2(row, col, currentColor, newBoard);
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

    return result;// 表示没有形成阵型
}

// Check if this key is part of any existing null-valued key or is part of a valid formation
function checkExistingFormations(cacheKey, allCacheKeys) {
    // Early return if key length is too short to represent a valid formation
    if (cacheKey.length < 6) {
        debugLog(false, 'Key too short for valid formation:', cacheKey);
        return null;
    }
    // 将cacheKey分割成坐标对
    const coordinates = [];
    for (let i = 0; i < cacheKey.length; i += 2) {
        coordinates.push([
            parseInt(cacheKey.substr(i, 1)),
            parseInt(cacheKey.substr(i + 1, 1))
        ]);
    }

    // Special check for keys of length 6
    if (cacheKey.length === 6) {
        // 创建有效的斜线组合 (使用数组形式的坐标)
        const validDiagonalSets = [
            [[0, 2], [1, 1], [2, 0]], // 左上到右下的斜线
            [[0, 3], [1, 4], [2, 5]], // 左上到右下的斜线
            [[3, 0], [4, 1], [5, 2]], // 左下到右上的斜线
            [[3, 5], [4, 4], [5, 3]]  // 左下到右上的斜线
        ];

        // 检查是否匹配任意一组有效的斜线坐标
        // 检查是否匹配任意一组有效的斜线坐标
        for (const diagonalSet of validDiagonalSets) {
            if (diagonalSet.every(([row, col]) =>
                coordinates.some(([r, c]) => r === row && c === col)
            )) {
                // 直接使用数组格式的坐标
                return {
                    extraMoves: 1,
                    formationPositions: diagonalSet,
                    formationType: "3斜 "
                };
            }
        }

        // 如果没有找到匹配的斜线组合
        debugLog(false, `Invalid diagonal formation for key:`, cacheKey);
        return undefined;
    }
    if (cacheKey.length <= 12) { // 短的key不需要缓存
        return undefined;
    }
    // Try to get from cache
    const cachedResult = cacheManager.get(cacheKey);
    if (cachedResult !== undefined) {  // Change this line
        return cachedResult;  // Now properly handles null values
    }

    for (const existingKey of allCacheKeys) {
        // Skip if current key is not part of existing key
        if (!existingKey.includes(cacheKey)) continue;

        const existingResult = cacheManager.get(existingKey);

        // If existing formation is null, this combination is invalid
        if (existingResult === null) {
            debugLog(false, `Key ${cacheKey} is part of a known invalid formation: ${existingKey}`);
            return null;
        }

        // Check if all formation positions are in the shorter key coordinates
        const isSubset = existingResult.formationPositions.every(([fRow, fCol]) =>
            coordinates.some(([row, col]) => row === fRow && col === fCol)
        );

        if (isSubset) {
            debugLog(false, `Key ${cacheKey} is part of valid formation: ${existingKey}`, existingResult);
            return existingResult;
        }
    }
    return undefined; // No matching formation found
}
export function checkSquare2(row, col, currentColor, newBoard) {
    const board = newBoard;
    let squareCount = 0;
    let formationPositions = [];

    for (let pattern of DIRECTIONS.SQUARE_PATTERNS) {
        let isSquare = true;
        let tempFormationPositions = [];
        for (let [dx, dy] of pattern) {
            const newRow = row + dx;
            const newCol = col + dy;
            const position = { targetRow: newRow, targetCol: newCol }
            if (!isInBoard(newRow, newCol) ||
                !board[newRow][newCol] ||
                board[newRow][newCol].color !== currentColor) {
                isSquare = false;
                break;
            }
            tempFormationPositions.push([newRow, newCol]); // 使用数组表示坐标
        }
        if (isSquare) {
            squareCount++; // 增加大方的数量
            formationPositions.push(...tempFormationPositions);

            // 只添加一次中心点
            if (squareCount === 1) {
                formationPositions.push([row, col]); // 添加中心点
            }
        }
    }
    debugLog(CONFIG.DEBUG, 'square:', formationPositions);
    return {
        squareCount: squareCount,
        formationPositions: formationPositions
    };
}

export function checkDiagonal2(row, col, currentColor, newBoard) {
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
            tempFormationPositions.push([startRow, startCol]); // 使用数组表示坐标
        }

        // 向终点方向查找
        while (isInBoard(endRow + dx, endCol + dy) && board[endRow + dx][endCol + dy]?.color === currentColor) {
            count++;
            endRow += dx;
            endCol += dy;
            tempFormationPositions.push([endRow, endCol]); // 使用数组表示坐标
        }

        // 只有当起点和终点都在棋盘边线上时，才符合斜线规则
        if (isOnEdge(startRow, startCol) && isOnEdge(endRow, endCol)) {
            if (count >= 3) { // 只记录3斜及以上的斜线
                diagonalCounts.push(count);
                if (formationPositions.length === 0) { // 如果斜线没有棋子，则添加中心点
                    formationPositions.push([row, col]); // 添加中心点
                }
                formationPositions.push(...tempFormationPositions);
            }
        }
    }
    debugLog(CONFIG.DEBUG, 'diagonal:', formationPositions);
    return {
        diagonalCounts: diagonalCounts,
        formationPositions: formationPositions
    };
}

export function checkDragon2(row, col, currentColor, newBoard) {
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

        while (isInBoard(r, c) && board[r][c]?.color === currentColor) {
            count++;
            if (isOnEdge(r, c)) edgeCount++;
            if (edgeCount === 3) {
                break;
            }
            tempFormationPositions.push([r, c]); // 使用数组表示坐标
            r += dx;
            c += dy;
        }

        // 向相反方向检查
        r = row - dx;
        c = col - dy;


        while (isInBoard(r, c) && board[r][c]?.color === currentColor) {
            count++;
            if (isOnEdge(r, c)) edgeCount++;
            if (edgeCount === 3) {
                break;
            }
            tempFormationPositions.push([r, c]); // 使用数组表示坐标
            r -= dx;
            c -= dy;
        }

        // 检查是否形成6个连续棋子，并且不全部在边线上
        if (count === 6 && edgeCount < 3) {
            dragonCount++; // 增加龙的数量
            formationPositions.push(...tempFormationPositions);

            if (dragonCount === 1) {
                formationPositions.push([row, col]); // 添加中心点
            }
        }
    }
    debugLog(CONFIG.DEBUG, 'dragon:', formationPositions);
    return {
        dragonCount: dragonCount,
        formationPositions: formationPositions
    };
}

export function hasNonFormationPieces(opponentColor, board) {
    debugLog(CONFIG.DEBUG, 'hasNonFormationPieces:', opponentColor);
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (board[row][col]?.color === opponentColor) {
                if (!board[row][col].isFormation) {
                    return true; // 找到不在阵型中的棋子
                }
            }
        }
    }

    return false; // 没有找到不在阵型中的棋子
}

export function isStillInFormation(row, col, currentColor, newBoard) {
    const formationData = FORMATION_POSITIONS.get(`${row}${col}`);
    // 检查大方
    const squareResult = checkSquare(currentColor, newBoard, formationData.square);
    if (squareResult) {
        return true; // 大方仍然完整
    }

    // 检查斜线
    const diagonalResult = checkDiagonal(currentColor, newBoard, formationData.diagonal);
    if (diagonalResult) {
        return true;
    }

    // 检查龙
    const dragonResult = checkDragon(currentColor, newBoard, formationData.dragon);
    if (dragonResult) {
        return true;
    }

    return false; // 如果没有参与任何阵型，返回 false
}
export function hasNonSquarePieces(currentColor, squarePositions, board) {
    // 遍历棋盘的每个格子
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            // 检查当前格子
            if (board[row][col] && board[row][col].color === currentColor) {
                const isInFormation = squarePositions.some(pos => pos[0] === row && pos[1] === col);
                if (!isInFormation) {
                    const formationData = FORMATION_POSITIONS.get(`${row}${col}`);

                    // 检查 square（大方）
                    const squareResult = checkSquare(currentColor, board, formationData.square);

                    if (squareResult === null) {
                        debugLog(CONFIG.DEBUG, '优先移除没有形成大方的棋子，比如第' + (row + 1) + '行, 第' + (col + 1) + '列的棋子');
                        return true; // 找到不在阵型中的棋子
                    } else {
                        squarePositions.push(...squareResult.formationPositions);
                    }
                }
            }
        }
    }

    // 所有格子检查完毕，返回 false
    return false;
}
export function hasNonSquarePieces2(currentColor, formationPositions, row = 0, col = 0, board) {
    // 检查当前格子
    if (board[row][col] && board[row][col].color === currentColor) {
        const isInFormation = formationPositions.some(pos => pos[0] === row && pos[1] === col);
        if (!isInFormation) {
            const squareResult = checkSquare(row, col, currentColor, board);
            if (squareResult.squareCount === 0) {
                debugLog(CONFIG.DEBUG, '优先移除没有形成大方的棋子，比如第' + (row + 1) + '行, 第' + (col + 1) + '列的棋子');
                return true;
            } else {
                formationPositions.push(...squareResult.formationPositions);
            }
        }
    }

    // 递归检查下一个格子
    if (col < 5) {
        return hasNonSquarePieces2(currentColor, formationPositions, row, col + 1, board);
    } else if (row < 5) {
        return hasNonSquarePieces2(currentColor, formationPositions, row + 1, 0, board);
    }

    // 所有格子检查完毕，返回 false
    return false;
}

function generateCacheKey(row, col, currentColor, board) {
    // 将棋盘状态转换为字符串（或哈希值）作为缓存的一部分
    const boardState = JSON.stringify(board);
    return `${row},${col},${currentColor},${boardState}`;
}

export function getCachedFormationOrCheck(row, col, currentColor, board) {
    const cacheKey = generateCacheKey(row, col, currentColor, board);
    
    // Try to get from cache
    const cachedResult = cacheManager.get(cacheKey);
    console.log('Trying to get cache for key:', cachedResult, cacheKey); // 调试日志
    if (cachedResult !== undefined) {  // Change this line
        return cachedResult;  // Now properly handles null values
    }

    // 调用原始函数并缓存结果
    const result = checkFormation(row, col, currentColor, board);

    return result;
}

export function checkFormationAndCache(row, col, currentColor, board) {
    // 调用原始函数并缓存结果
    const result = checkFormation(row, col, currentColor, board);
    const cacheKey = generateCacheKey(row, col, currentColor, board);
    console.log('Setting cache for key:', row, col); // 调试日志
    cacheManager.set(cacheKey, result);

    return result;
}