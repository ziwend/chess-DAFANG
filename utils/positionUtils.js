import { DIRECTIONS, CONFIG } from './gameConstants.js';
import { checkFormation, checkSquare, hasNonFormationPieces, hasNonSquarePieces } from './formationChecker.js';
import { isBoardWillFull, isMaxPiecesCount, isOnEdge, isInBoard, canMove, canPlace, hasValidPiece, deepCopy } from './boardUtils.js';
import { debugLog } from './historyUtils.js';
import { FORMATION_POSITIONS } from './formationPositions.js';
import { MCTSAgent } from './MCTSAgent.js';

export function getValidPositions(phase, currentColor, data) {
    const opponentColor = currentColor === 'black' ? 'white' : 'black';

    try {
        if (phase === 'placing') return getValidPlacePositions(currentColor, opponentColor, data);
        if (phase === 'moving') return getValidMoves(currentColor, opponentColor, data);
        if (phase === 'removing') return getValidRemovePositions(currentColor, opponentColor, data);
    } catch (error) {
        console.error('Error in getValidPositions:', error);
    }

    return [];
}

function getValidPlacePositions(currentColor, opponentColor, data) {
    const { board, blackCount, whiteCount, extraMoves, playerConfig } = data;
    // 第一颗棋子放在[1,1],[1,4],[4,1],[4,4]四个角落
    if (blackCount === 0) { // TODO 这里强烈依赖黑方开始，白方后手的规则
        return getFirstPlacePositions();
    }

    // 最后一颗棋子，直接返回空闲位置
    if (isBoardWillFull(blackCount, whiteCount)) {
        return getLastPosition(board);
    }

    // 其他棋子
    let availablePositions = new Set();
    const finalPositions = [];
    let { bestSelfPosition, bestOpponentPosition } = evaluatePositions(board, currentColor, opponentColor, availablePositions);

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

    // const tempBoard = deepCopy(board);
    let uniquePositions = Array.from(availablePositions).map(pos => JSON.parse(pos));
    // 初始化
    const maxDepth = CONFIG.MAX_PIECES_COUNT - blackCount - whiteCount;
    const agent = new MCTSAgent({ 
        minSimulations: 2,
        maxSimulations: 100,
        maxDepth: maxDepth,
        DEBUG: CONFIG.DEBUG 
    });    

    // 对这些候选点做 MCTS 模拟搜索，得到胜率最高的点来决策。
    const bestPlace = agent.getBestPlace(
        currentColor,
        opponentColor,
        uniquePositions,
        board,
        evaluatePositions
    );

    if (bestPlace) {
        // 直接作为落子点返回
        return [{
            action: 'placing',
            position: bestPlace
        }];
    }


    // 5、己方不能形成阵型，对方也不能形成阵型，就优先放置在现有棋子周围
    uniquePositions.forEach(position => {
        finalPositions.push({
            action: 'placing',
            position: position
        });
    });

    debugLog(CONFIG.DEBUG, `5、己方不能形成阵型，对方也不能形成阵型，就优先放置在现有棋子周围`, uniquePositions);
    return finalPositions;
}

function getFirstPlacePositions() {
    const finalPositions = [];
    DIRECTIONS.CORNERPOSITIONS.forEach(({ pos, adjacent }) => {
        finalPositions.push({
            action: 'placing',
            position: pos
        });
    });
    return finalPositions;
}

function getLastPosition(board) {
    const freePositions = [];
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
            if (board[row][col] === null) {
                freePositions.push({
                    action: 'placing',
                    position: [row, col]
                });
                return freePositions;
            }
        }
    }
}

function evaluatePositions(tempBoard, currentColor, opponentColor, availablePositions) {
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    let bestSelfPosition = null;
    let bestOpponentPosition = null;
    let equalPositions = []; // 用于存储多个相等的位置
    let equalPositionsOpponent = [];

    for (let row = 0; row < tempBoard.length; row++) {
        for (let col = 0; col < tempBoard[row].length; col++) {
            const result = getBestFormationPosition(row, col, tempBoard, currentColor, opponentColor, availablePositions);
            if (result.bestSelfPosition) {
                if (maxSelfExtraMoves < result.maxSelfExtraMoves) {
                    maxSelfExtraMoves = result.maxSelfExtraMoves;
                    bestSelfPosition = result.bestSelfPosition;
                    equalPositions = [bestSelfPosition]; // 重置相等位置数组
                } else if (maxSelfExtraMoves === result.maxSelfExtraMoves) {
                    equalPositions.push(result.bestSelfPosition); // 添加到相等位置数组                    
                }
            }

            if (result.bestOpponentPosition) {
                if (maxOpponentExtraMoves < result.maxOpponentExtraMoves) {
                    maxOpponentExtraMoves = result.maxOpponentExtraMoves;
                    bestOpponentPosition = result.bestOpponentPosition;
                    equalPositionsOpponent = [bestOpponentPosition]; // 重置相等位置数组
                } else if (maxOpponentExtraMoves === result.maxOpponentExtraMoves) {
                    equalPositionsOpponent.push(result.bestOpponentPosition); // 添加到相等位置数组

                }
            }
        }
    }

    return {
        bestSelfPosition: equalPositions.length > 1 ? equalPositions : bestSelfPosition,
        bestOpponentPosition: equalPositionsOpponent.length > 1 ? equalPositionsOpponent : bestOpponentPosition,
        maxSelfExtraMoves,
        maxOpponentExtraMoves
    };
}
function getBestFormationPosition(row, col, currentBoard, currentColor, opponentColor, availablePositions) {
    let bestSelfPosition = null;
    let bestOpponentPosition = null;
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    let hasFoundOpponentPiece = false;

    if (currentBoard[row][col] === null) {
        for (let [deltaRow, deltaCol] of DIRECTIONS.NEIGHBORS) {
            const neighborRow = row + deltaRow;
            const neighborCol = col + deltaCol;

            // 1. 检查是否在棋盘内
            if (!isInBoard(neighborRow, neighborCol)) {
                continue;
            }

            // 2. 获取邻居位置的棋子
            const neighborPiece = currentBoard[neighborRow][neighborCol];
            if (!neighborPiece) {
                continue;
            }

            // 3. 记录可用位置
            availablePositions.add(JSON.stringify([row, col]));

            // 4. 处理己方棋子
            if (neighborPiece.color === currentColor) {
                const selfFormation = checkFormation(row, col, currentColor, currentBoard);
                if (selfFormation) {
                    maxSelfExtraMoves = selfFormation.extraMoves;
                    bestSelfPosition = [row, col];
                    // 找到己方可以形成阵型的位置，直接返回
                    return {
                        bestSelfPosition,
                        bestOpponentPosition,
                        maxSelfExtraMoves,
                        maxOpponentExtraMoves
                    };
                }
                if (hasFoundOpponentPiece) {
                    // 如果已经找到对方棋子，则周围既有己方，又有对方旗子，且都已经判断过阵型，不再继续
                    break;
                }
            }
            // 5. 处理对方棋子
            else if (neighborPiece.color === opponentColor && !hasFoundOpponentPiece) {
                hasFoundOpponentPiece = true;
                const opponentFormation = checkFormation(row, col, opponentColor, currentBoard);
                if (opponentFormation) {
                    maxOpponentExtraMoves = opponentFormation.extraMoves;
                    bestOpponentPosition = [row, col];
                    // debugLog(CONFIG.DEBUG, `找到对方可能形成阵型的位置: ${opponentColor}`, [row, col], maxOpponentExtraMoves);
                }
            }
        }
    }

    return {
        bestSelfPosition,
        bestOpponentPosition,
        maxSelfExtraMoves,
        maxOpponentExtraMoves
    };
}

function getBestFormationPosition2(row, col, tempBoard, currentColor, opponentColor, availablePositions, data) {
    let bestSelfPosition = null;
    let bestOpponentPosition = null;
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    let hasOpponentPiece = false;
    const { whiteCount, blackCount } = data;

    // 有空位，且周围有棋子
    if (tempBoard[row][col] === null) {
        for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
            const newRow = row + dx;
            const newCol = col + dy;

            if (isInBoard(newRow, newCol) && tempBoard[newRow][newCol]) {
                availablePositions.add(JSON.stringify([row, col]));
                if (tempBoard[newRow][newCol].color === currentColor) { // 如果周围有己方棋子
                    // 判断一下是否形成阵型
                    const formationUpdate = checkFormation(row, col, currentColor, tempBoard);
                    if (formationUpdate) {
                        // 判断一下extramoves，记录到tempPosition和tempExtraMoves中
                        if (maxSelfExtraMoves < formationUpdate.extraMoves) { // 如果有额外移动次数
                            maxSelfExtraMoves = formationUpdate.extraMoves;
                            bestSelfPosition = [row, col];
                            return { bestSelfPosition, bestOpponentPosition, maxSelfExtraMoves, maxOpponentExtraMoves }; // 找到当前棋子形成的阵型，直接返回
                        } else if (maxSelfExtraMoves === formationUpdate.extraMoves) {
                            debugLog(CONFIG.DEBUG, `0-getBestFormationPosition-己方${currentColor}-获得奖励一样, 待考虑是否返回`, [row, col]);
                        }
                    }
                }
            } else { // 对方棋子
                if (hasOpponentPiece) {
                    // 如果对方棋子已经存在，则不考虑
                    continue;
                } else {
                    hasOpponentPiece = true;
                }

                // 判断一下是否形成阵型
                const formationUpdate = checkFormation(row, col, opponentColor, tempBoard);
                if (formationUpdate) {
                    // 判断一下extramoves，记录到tempPosition和tempExtraMoves中
                    if (maxOpponentExtraMoves < formationUpdate.extraMoves) { // 如果有额外移动次数
                        maxOpponentExtraMoves = formationUpdate.extraMoves;
                        bestOpponentPosition = [row, col];
                        // 找到对方棋子形成的阵型，等一等
                    } else if (maxOpponentExtraMoves === formationUpdate.extraMoves) {
                        debugLog(CONFIG.DEBUG, `0-getBestFormationPosition-对方${opponentColor}奖励一样, 待考虑是否返回`, [row, col]);
                        const [oldRow, oldCol] = bestOpponentPosition;
                    }
                }
            }

        }
    }
    return { bestSelfPosition, bestOpponentPosition, maxSelfExtraMoves, maxOpponentExtraMoves };
}

function getPossibleFormationPositions(uniquePositions, tempBoard, currentColor, opponentColor) {
    let bestSelfPosition = null;
    let countOfFormation = 0; // 形成阵型的数量，同一个位置在不同方向可形成多个阵型
    let equalPositions = []; // 用于存储多个相等的位置

    let index = 0; // 初始化索引
    const visited = new Set(); // 用于记录已访问的位置
    while (index < uniquePositions.length) {
        const position = uniquePositions[index]; // 获取当前索引的元素
        const key = `${position[0]},${position[1]}`; // 唯一标识位置
        if (visited.has(key)) {
            index++;
            continue; // 跳过已访问的位置
        }
        visited.add(key); // 标记为已访问
        // 递归检查下一层
        tempBoard[position[0]][position[1]] = {
            color: currentColor,
            isFormation: false
        };
        let tempCount = 0;
        for (let row = 0; row < tempBoard.length; row++) {
            for (let col = 0; col < tempBoard[row].length; col++) {
                if (tempBoard[row][col] !== null) {
                    continue;
                }
                // 当前为空位，再判断周围有没有己方棋子，如果有，再判断是否能形成阵型
                for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
                    const newRow = row + dx;
                    const newCol = col + dy;

                    if (!isInBoard(newRow, newCol) || tempBoard[newRow][newCol] === null || tempBoard[newRow][newCol].color === opponentColor) {
                        continue;
                    }
                    // 如果周围有己方棋子，判断一下是否形成阵型
                    const formationUpdate = checkFormation(row, col, currentColor, tempBoard);
                    if (formationUpdate) {
                        tempCount++;
                        const newPosition = [row, col];
                        // 确保新位置不重复添加
                        if (!uniquePositions.some(pos => pos[0] === newPosition[0] && pos[1] === newPosition[1])) {
                            uniquePositions.push(newPosition);
                        }
                    }
                    // 在一个空位周围找到了己方棋子，不管能不能形成阵型都停止循环
                    break;
                }
            }
        }
        tempBoard[position[0]][position[1]] = null; // 恢复原来的棋盘
        if (tempCount > countOfFormation) {
            countOfFormation = tempCount;
            bestSelfPosition = position;
            equalPositions = [position]; // 重置相等位置数组

        } else if (tempCount > 0 && tempCount === countOfFormation) {
            equalPositions.push(position); // 添加到相等位置数组
        }
        index++; // 增加索引，处理下一个位置        
    }

    let finalPositions = [];
    if (equalPositions.length > 1) {
        equalPositions.forEach(position => {
            finalPositions.push({
                action: 'placing',
                position: position
            });
        });
        return finalPositions; // 返回所有相等的位置
    }
    if (bestSelfPosition) {
        finalPositions.push({
            action: 'placing',
            position: bestSelfPosition
        });
        return finalPositions;
    }

    return finalPositions;
}

function getValidRemovePositions(currentColor, opponentColor, data) {
    const { board, blackCount, whiteCount } = data;
    const validPositions = [];
    let bestSelfPosition = null;
    let bestOpponentPosition = null;
    let betterOpponentPosition = null; //部分破坏对方阵型
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    let largestMoves = 0; // 该变量指示在对方会形成阵型，此时移除对方阵型上的棋子后自己也能形成阵型时可以获得的额外吃子数
    const nonFormationPieces = [];
    const diagonalOrDragonPieces = [];
    const squarePositions = [];
    let hasNonFormationPiecesFlag = false;
    const isFirstRemove = isMaxPiecesCount(blackCount, whiteCount);
    let hasNonSquarePiecesFlag = null;
    let possiblePosition = null;

    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if ((board[row][col] && board[row][col].color === currentColor) || board[row][col] === null) {
                continue;
            }

            if (board[row][col].isFormation) {
                if (hasNonFormationPiecesFlag || hasNonFormationPieces(opponentColor, board)) {
                    hasNonFormationPiecesFlag = true; // 有棋子不在阵型，则不考虑
                    continue;
                }
            } else {
                hasNonFormationPiecesFlag = true;
            }
            const piece = { row, col };
            if (!hasNonFormationPiecesFlag) {
                if (hasNonSquarePiecesFlag !== null && hasNonSquarePiecesFlag && squarePositions.length > 0) {
                    if (squarePositions.some(position => position[0] === row && position[1] === col)) {
                        continue; // 如果该棋子已经在大方阵型中，但是还有不在大方中的旗子，则不考虑
                    }
                }
                // 没有不在阵型中的旗子，则判断该棋子是否在大方阵型中
                const formationData = FORMATION_POSITIONS.get(`${row}${col}`);
                // 检查大方
                const squareResult = checkSquare(opponentColor, board, formationData.square);

                if (squareResult) {
                    squarePositions.push(...squareResult.formationPositions);
                    debugLog(CONFIG.DEBUG, '当前对手大方所处位置=', squareResult.formationPositions);

                    hasNonSquarePiecesFlag = hasNonSquarePieces(opponentColor, squarePositions, board);
                    if (!hasNonSquarePiecesFlag) {
                        debugLog(CONFIG.DEBUG, '对方所有棋子都为squarepieces', squarePositions);
                        return squarePositions.map(pos => ({
                            action: 'removing',
                            position: pos
                        }));
                    }
                    continue;
                }
                diagonalOrDragonPieces.push(piece);
                continue;
            }

            if (isFirstRemove) {
                const newExtraMoves = evaluateFormation(row, col, currentColor, opponentColor, board, maxSelfExtraMoves);
                if (newExtraMoves >= maxSelfExtraMoves && newExtraMoves > 0) {
                    bestSelfPosition = [row, col];
                    maxSelfExtraMoves = newExtraMoves;
                    debugLog(CONFIG.DEBUG, `0-${currentColor}-棋盘满时，先考虑自己形成阵型,吃子数：${newExtraMoves}:`, bestSelfPosition);
                    continue;
                }
                if (bestSelfPosition !== null) { // 已经找到一个可以自己形成阵型的位置了，就不再判断对方了
                    continue;
                }
            }

            // 再判断该棋子移动后，对方是否形成阵型
            for (const dir of DIRECTIONS.ADJACENT) {
                const newRow = row + dir.dx;
                const newCol = col + dir.dy;
                if (!isInBoard(newRow, newCol) || (board[newRow][newCol] && board[newRow][newCol].color === opponentColor)) {
                    continue;
                }
                if (board[newRow][newCol] !== null && !isFirstRemove) {
                    continue;
                }
                const newBoard = deepCopy(board);
                newBoard[row][col] = null;
                const formationUpdateOpponent = checkFormation(newRow, newCol, opponentColor, newBoard);
                if (formationUpdateOpponent === null) {
                    continue;
                }
                if (maxOpponentExtraMoves > formationUpdateOpponent.extraMoves) {
                    continue;
                }

                if (maxOpponentExtraMoves === formationUpdateOpponent.extraMoves) {
                    debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，会形成${formationUpdateOpponent.formationType}阵型，但是吃子数同之前的位置:`, bestOpponentPosition);
                    continue;
                }
                debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，会获得${formationUpdateOpponent.extraMoves}次吃子`, formationUpdateOpponent.formationPositions);

                // TODO 存在的问题，当对方移动一颗棋子后既能形成大龙，大方和斜线阵型怎么取舍
                let countAdjacentOpponent = 4; // 周围可以移动的棋子最多四颗
                for (const pos of formationUpdateOpponent.formationPositions) {
                    // 先不判断空缺的位置 // 如果是空白的位置，则该位置周围不能有多于1个的对方棋子，否则吃子无效
                    if (pos[0] === newRow && pos[1] === newCol) continue;
                    // 还要判断该棋子是否已经在阵型中
                    if (board[pos[0]][pos[1]].isFormation) {
                        debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${pos}已经在阵型中`, pos);
                        continue;
                    }

                    // 再复查一下移除该棋子后对方的阵型是否被破坏
                    const tempBoard = deepCopy(board);
                    tempBoard[pos[0]][pos[1]] = null;
                    const formationUpdateDestroy = checkFormation(newRow, newCol, opponentColor, tempBoard);
                    // 破坏后的吃子数量还不如之前移除另外一个棋子破坏的吃子数量
                    if (formationUpdateDestroy && formationUpdateOpponent.extraMoves - formationUpdateDestroy.extraMoves <= maxOpponentExtraMoves && maxOpponentExtraMoves > 0) {
                        debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，如果吃掉${pos}破坏对方阵型带来的效果不如之前的位置：`, bestOpponentPosition);
                        continue;
                    }

                    // 寻找阵型上周围棋子最少得那颗
                    const result = countAdjacentPieces(pos[0], pos[1], currentColor, opponentColor, board);
                    if (result.countAdjacentOpponent < countAdjacentOpponent) {
                        countAdjacentOpponent = result.countAdjacentOpponent;
                        if (formationUpdateDestroy) {
                            maxOpponentExtraMoves = formationUpdateOpponent.extraMoves - formationUpdateDestroy.extraMoves;
                            betterOpponentPosition = pos;
                            debugLog(CONFIG.DEBUG, `1-${currentColor}-移除对方${pos}后只能部分破坏对方阵型`, formationUpdateOpponent.extraMoves, formationUpdateDestroy.extraMoves);
                        } else {
                            maxOpponentExtraMoves = formationUpdateOpponent.extraMoves;
                            bestOpponentPosition = pos;
                            debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，会获得更多奖励，且该位置周围棋子比之前的少:`, { pos, bestOpponentPosition });
                        }
                    } else if (result.countAdjacentOpponent === countAdjacentOpponent) {
                        // 再判断该位置移除之后自己能不能形成阵型
                        const thisPosExtraMoves = evaluateFormation(pos[0], pos[1], currentColor, opponentColor, board, maxSelfExtraMoves);
                        // 自己最多奖励的那个
                        if (largestMoves <= thisPosExtraMoves && thisPosExtraMoves > 0) {
                            largestMoves = thisPosExtraMoves;
                            if (formationUpdateDestroy != null && formationUpdateDestroy.extraMoves < maxOpponentExtraMoves) {
                                maxOpponentExtraMoves = formationUpdateDestroy.extraMoves;
                                bestOpponentPosition = pos;
                                debugLog(CONFIG.DEBUG, `1-${currentColor}-找到对方阵型上自己形成阵型的位置`, bestOpponentPosition, maxOpponentExtraMoves);
                            } else {
                                maxOpponentExtraMoves = formationUpdateOpponent.extraMoves;
                                bestOpponentPosition = pos;
                                debugLog(CONFIG.DEBUG, `1-${currentColor}找到对方阵型上自己可能形成阵型的位置:`, bestOpponentPosition, countAdjacentOpponent);
                            }
                        } else {
                            debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${pos}周围棋子数量相同, 该位置移除之后自己不能形成阵型`, bestOpponentPosition, countAdjacentOpponent);
                        }
                    }
                    debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${pos}判断移除后：`, bestOpponentPosition, maxOpponentExtraMoves);
                }
                if (betterOpponentPosition || (bestOpponentPosition && countAdjacentOpponent > 0)) {
                    const newResult = countAdjacentPieces(newRow, newCol, currentColor, opponentColor, board);
                    if (newResult.countAdjacentOpponent === 1) {
                        // 只在没有更好的position时才考虑移动的棋子位置
                        if (!betterOpponentPosition && !bestOpponentPosition) {
                            const currentBenefit = formationUpdateOpponent.extraMoves;
                            if (currentBenefit > maxOpponentExtraMoves) {
                                maxOpponentExtraMoves = currentBenefit;
                                bestOpponentPosition = [row, col];
                            }
                        }
                    } else if (betterOpponentPosition) {
                        bestOpponentPosition = betterOpponentPosition;
                        maxOpponentExtraMoves = formationUpdateOpponent.extraMoves;
                    }
                }
                // 什么情况下吃对方移动的棋子，对方会形成阵型，但是其他棋子都在阵型中不能吃
                if (bestOpponentPosition === null) {
                    // 但是如果对方有两颗棋子也是无效吃子，一种有用的情况是多阵型情况下减少吃子数
                    maxOpponentExtraMoves = formationUpdateOpponent.extraMoves;
                    bestOpponentPosition = [row, col];
                    debugLog(CONFIG.DEBUG, `1-${currentColor}对方可能形成${formationUpdateOpponent.formationType}阵型，阵型上的棋子都不能吃`, [newRow, newCol]);
                }
            }

            // 如果对当前棋子检查之后获取了对方可能形成阵型的位置，则继续不再判断己方阵型
            if (isFirstRemove || bestOpponentPosition) {
                debugLog(CONFIG.DEBUG, `1-${currentColor}，首次删除不考虑对方阵型，或者已找到对方可能形成阵型的位置:`, bestOpponentPosition);
                continue
            }

            const newExtraMoves = evaluateFormation(row, col, currentColor, opponentColor, board, maxSelfExtraMoves);
            if (newExtraMoves > 0) {
                bestSelfPosition = [row, col];
                maxSelfExtraMoves = newExtraMoves;
                debugLog(CONFIG.DEBUG, `2-${currentColor}自己可能形成阵型的位置:`, bestSelfPosition);
                continue;
            }

            //如果移除不能阻止对方形成阵型，也不能自己组成阵型，则判断该棋子下一次移动后是否方便组成阵型
            nonFormationPieces.push(piece);

        }
    }

    const finalPositions = [];
    if (isFirstRemove && bestSelfPosition) {
        debugLog(CONFIG.DEBUG, `1-${currentColor}-isFirstRemove-可能形成阵型的位置:`, bestSelfPosition);

        const formationData = FORMATION_POSITIONS.get(`${bestSelfPosition[0]}${bestSelfPosition[1]}`);
        const squareResult = checkSquare(opponentColor, board, formationData.square);
        if (!squareResult) {
            finalPositions.push({
                action: 'removing',
                position: bestSelfPosition
            });
            return finalPositions;
        }
    }

    if (bestOpponentPosition) {
        finalPositions.push({
            action: 'removing',
            position: bestOpponentPosition
        });
        return finalPositions;
    }

    if (bestSelfPosition) {
        finalPositions.push({
            action: 'removing',
            position: bestSelfPosition
        });
        return finalPositions;
    }

    if (nonFormationPieces.length > 0) {
        validPositions.push(...nonFormationPieces);
        debugLog(CONFIG.DEBUG, `3-${currentColor}，对方和自己都不能形成阵型的位置:`, nonFormationPieces);
    } else if (diagonalOrDragonPieces.length > 0) {
        validPositions.push(...diagonalOrDragonPieces);
        debugLog(CONFIG.DEBUG, `3-${currentColor}，对方棋子都在阵型中，非方棋子:`, diagonalOrDragonPieces);
    }

    const uniquePositions = [];
    validPositions.forEach(pos => {
        if (!uniquePositions.some(p => p.row === pos.row && p.col === pos.col)) {
            uniquePositions.push(pos);
        }
    });

    const movablePositions = uniquePositions.filter(pos => canMove(pos.row, pos.col, board));
    if (movablePositions.length > 0) {
        return movablePositions.map(pos => ({
            action: 'removing',
            position: [pos.row, pos.col]
        }));
    }

    const getOpponentNeighborCount = (row, col) => {
        let count = 0;
        for (const dir of DIRECTIONS.ADJACENT) {
            const newRow = row + dir.dx;
            const newCol = col + dir.dy;
            if (isInBoard(newRow, newCol) && board[newRow][newCol]?.color !== currentColor) {
                count++;
            }
        }
        return count;
    };
    const sortedPositions = uniquePositions.sort((a, b) => {
        const aCount = getOpponentNeighborCount(a.row, a.col);
        const bCount = getOpponentNeighborCount(b.row, b.col);
        return aCount - bCount; // 按周围对手棋子数量从少到多排序
    });
    // 只返回周围棋子最少的那个位置
    const leastOpponentPosition = sortedPositions[0]; // 取排序后的第一个位置

    return [{
        action: 'removing',
        position: [leastOpponentPosition.row, leastOpponentPosition.col]
    }];
}

function hasBetterMove(currentColor, opponentColor, board, maxSelfExtraMoves) {
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (hasValidPiece(row, col, board) !== currentColor) {
                continue;
            }
            const tempBoard = deepCopy(board);
            tempBoard[row][col] = null;
            // 记录当前棋子周边己方和对方棋子数量
            let countAdjacent = 0;
            let countAdjacentOpponent = 0
            for (const dir of DIRECTIONS.ADJACENT) {
                const newRow = row + dir.dx;
                const newCol = col + dir.dy;
                if (hasValidPiece(newRow, newCol, board) === opponentColor) {
                    countAdjacentOpponent++;
                    continue;
                }
                if (hasValidPiece(newRow, newCol, board) === currentColor) {
                    countAdjacent++;
                    continue;
                }
                if (!isInBoard(newRow, newCol)) {
                    continue;
                }

                // 可以移动，先判断移动后自己能不能形成阵型                
                const formationUpdate = checkFormation(newRow, newCol, currentColor, tempBoard);
                if (formationUpdate) {
                    if (maxSelfExtraMoves === formationUpdate.extraMoves) {
                        return true;
                    }
                    continue;
                }
            }
        }
    }
}

function getValidMoves(currentColor, opponentColor, data) {
    const { board } = data;
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    const finalPositions = [];
    const validMoves = [];
    const worstMoves = [];
    let betterMoves = null;
    let goodMoves = null;
    let equalPositions = []; // 用于存储多个相等的位置
    // 添加新变量来跟踪每个移动对应的对方可能获得的奖励
    const moveRewards = new Map();
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (hasValidPiece(row, col, board) !== currentColor) {
                continue;
            }
            const tempBoard = deepCopy(board);
            tempBoard[row][col] = null;
            // 记录当前棋子周边己方和对方棋子数量
            let countAdjacent = 0;
            let countAdjacentOpponent = 0
            let possiblePosition = null;
            let commonPositions = [];
            let destroyedOpponentExtraMoves = 0;
            let bestDestroyedExtraMoves = 0;  // 添加这个变量来跟踪最大值
            for (const dir of DIRECTIONS.ADJACENT) {
                const newRow = row + dir.dx;
                const newCol = col + dir.dy;
                if (hasValidPiece(newRow, newCol, board) === opponentColor) {
                    countAdjacentOpponent++;
                    continue;
                }
                if (hasValidPiece(newRow, newCol, board) === currentColor) {
                    countAdjacent++;
                    continue;
                }
                if (!isInBoard(newRow, newCol)) {
                    continue;
                }

                // 可以移动，先判断移动后自己能不能形成阵型                
                const formationUpdate = checkFormation(newRow, newCol, currentColor, tempBoard);
                if (formationUpdate) {
                    if (maxSelfExtraMoves < formationUpdate.extraMoves) {
                        maxSelfExtraMoves = formationUpdate.extraMoves;
                        betterMoves = {
                            position: [row, col],
                            newPosition: [newRow, newCol]
                        };
                        equalPositions = [betterMoves]; // 重置相等位置数组
                        debugLog(false, `1-${currentColor}-move后自己会形成阵型betterMoves: `, betterMoves, maxSelfExtraMoves);
                    } else if (maxSelfExtraMoves === formationUpdate.extraMoves) {
                        betterMoves = {
                            position: [row, col],
                            newPosition: [newRow, newCol]
                        };
                        equalPositions.push(betterMoves); // 添加到相等位置数组                        
                    }
                    continue;
                }

                if (betterMoves) {
                    continue;
                }

                // 修改这部分：评估移动的净收益
                destroyedOpponentExtraMoves = evaluateFormation(newRow, newCol, opponentColor, currentColor, tempBoard, maxOpponentExtraMoves);
                if (destroyedOpponentExtraMoves > 0) {
                    // 计算移动后是否会给对方带来机会
                    const afterMoveOpponentBenefit = evaluateFormation(row, col, opponentColor, currentColor, tempBoard, maxOpponentExtraMoves);

                    // 如果净收益为正（阻止的收益大于带来的机会）
                    if (destroyedOpponentExtraMoves > afterMoveOpponentBenefit) {
                        if (destroyedOpponentExtraMoves > bestDestroyedExtraMoves) {
                            bestDestroyedExtraMoves = destroyedOpponentExtraMoves;
                            possiblePosition = [newRow, newCol];
                            debugLog(CONFIG.DEBUG, `2、${currentColor}-${row},${col}move到${newRow},${newCol}后可阻止对方形成阵型，净收益=${destroyedOpponentExtraMoves - afterMoveOpponentBenefit}`, destroyedOpponentExtraMoves);
                        }
                    } else {
                        // 如果净收益为负或零，加入到 worstMoves
                        const move = {
                            action: 'moving',
                            position: [row, col],
                            newPosition: [newRow, newCol]
                        };
                        worstMoves.push(move);
                        moveRewards.set(JSON.stringify(move), afterMoveOpponentBenefit);
                    }
                    continue;
                }
                // 既不能己方形成阵型，也不能阻止对方形成阵型，备选
                commonPositions.push([newRow, newCol]);

            }

            // 如果截止当前还没有找到自己可以形成阵型的移动，则判断移动是否会给对方机会
            if (betterMoves) {
                continue;
            }

            if (possiblePosition || commonPositions.length > 0) {
                // 如果移动给了对方机会，且吃子更多
                const newEvaluateFormationResult = evaluateFormation(row, col, opponentColor, currentColor, tempBoard, maxOpponentExtraMoves);

                // 修改判断条件，考虑净收益
                if (newEvaluateFormationResult > 0) {
                    const netBenefit = destroyedOpponentExtraMoves - newEvaluateFormationResult;

                    if (netBenefit < 0) {  // 只有在净收益为负时才加入 worstMoves
                        if (possiblePosition) {
                            const move = {
                                action: 'moving',
                                position: [row, col],
                                newPosition: possiblePosition
                            };
                            worstMoves.push(move);
                            moveRewards.set(JSON.stringify(move), Math.abs(netBenefit));
                            continue;
                        }
                        if (commonPositions.length > 0) {
                            commonPositions.forEach(pos => {
                                const move = {
                                    action: 'moving',
                                    position: [row, col],
                                    newPosition: pos
                                };
                                worstMoves.push(move);
                                moveRewards.set(JSON.stringify(move), Math.abs(netBenefit));
                            });
                            continue;
                        }
                    }
                }
                if (possiblePosition) {
                    // 如果移动没有给对方带来机会，同时又可以阻止对方形成阵型，是goodMoves
                    goodMoves = {
                        position: [row, col],
                        newPosition: possiblePosition
                    };
                    maxOpponentExtraMoves = destroyedOpponentExtraMoves;
                    debugLog(CONFIG.DEBUG, `3、${currentColor}-${row},${col}mov后没有给对方带来机会，可阻止对方形成阵型 `, goodMoves, maxOpponentExtraMoves);
                    continue;
                }
            }
            if (commonPositions.length > 0) {
                commonPositions.forEach(pos => {
                    validMoves.push({
                        action: 'moving',
                        position: [row, col],
                        newPosition: pos
                    });
                });
            }
        }
    }
    if (equalPositions.length > 1) {
        equalPositions.forEach(position => {
            finalPositions.push({
                action: 'moving',
                position: position.position,
                newPosition: position.newPosition
            });
        });
        debugLog(CONFIG.DEBUG, `1-${currentColor}-move后自己会形成阵型但是获得的奖励与之前的一样: `, equalPositions);
        return finalPositions; // 返回所有相等的位置
    }

    if (betterMoves) {
        finalPositions.push({
            action: 'moving',
            position: betterMoves.position,
            newPosition: betterMoves.newPosition
        });
        return finalPositions;
    }
    if (goodMoves) {
        finalPositions.push({
            action: 'moving',
            position: goodMoves.position,
            newPosition: goodMoves.newPosition
        });
        return finalPositions;
    }
    if (validMoves.length > 0) {
        //对于这些要按照place的逻辑再判断一下
        let possiblePositions = getPossibleMoves(validMoves, board, currentColor, opponentColor);
        if (possiblePositions && possiblePositions.length > 0) {
            if (possiblePositions.length > 1) {
                // 过滤周边包含更多己方棋子的位置
                //possiblePositions = filterByNeighbors(possiblePositions, tempBoard);
            }
            debugLog(CONFIG.DEBUG, `5-1、${currentColor}棋子周围放置2颗棋子会组成阵型`, possiblePositions);
            return possiblePositions;
        }
        // 在此之前还要判断一下对方是否在垂直或水平方向上形成3子连珠，且只有对方的棋子

        // 4、棋子放在靠近对方棋子，防止对方连续两颗棋子后形成阵型
        possiblePositions = getPossibleMoves(validMoves, board, opponentColor, currentColor);
        if (possiblePositions && possiblePositions.length > 0) {
            if (possiblePositions.length > 1) {
                // 过滤周边棋子最少的
                //possiblePositions = filterByNeighbors(possiblePositions, tempBoard);
            }
            debugLog(CONFIG.DEBUG, `5-2、${currentColor}放在对方棋子周围，防止连续放置2颗棋子组成阵型`, possiblePositions);
            return possiblePositions;
        }
        debugLog(CONFIG.DEBUG, `5-3、${currentColor}既不能自己形成阵型，也不能阻止对方形成阵型`, validMoves);
        return validMoves;
    }
    // 在返回worstMoves之前，先按对方可能获得的奖励值排序
    if (worstMoves.length > 0) {
        worstMoves.sort((a, b) => {
            const rewardA = moveRewards.get(JSON.stringify(a)) || 0;
            const rewardB = moveRewards.get(JSON.stringify(b)) || 0;
            return rewardA - rewardB; // 按对方可能获得的奖励从小到大排序
        });

        // 只返回对方获得奖励最小的移动
        const minReward = moveRewards.get(JSON.stringify(worstMoves[0]));
        return worstMoves.filter(move =>
            (moveRewards.get(JSON.stringify(move)) || 0) === minReward
        );
    }
    return worstMoves;
}

function calculateNetBenefit(row, col, newRow, newCol, currentColor, opponentColor, board) {
    const tempBoard = deepCopy(board);
    tempBoard[row][col] = null;

    // 1. 计算移动前对方可能获得的奖励
    const beforeMoveReward = evaluateFormation(newRow, newCol, opponentColor, currentColor, board, 0);

    // 2. 计算移动后对方可能获得的奖励
    const afterMoveReward = evaluateFormation(row, col, opponentColor, currentColor, tempBoard, 0);

    // 3. 计算净收益 = 阻止的奖励 - 带来的机会
    return beforeMoveReward - afterMoveReward;
}
// 按净收益排序移动
function sortMovesByNetBenefit(moves, board, currentColor, opponentColor) {
    return moves.sort((a, b) => {
        const benefitA = calculateNetBenefit(
            a.position[0], a.position[1],
            a.newPosition[0], a.newPosition[1],
            currentColor, opponentColor, board
        );
        const benefitB = calculateNetBenefit(
            b.position[0], b.position[1],
            b.newPosition[0], b.newPosition[1],
            currentColor, opponentColor, board
        );
        return benefitB - benefitA;  // 从高到低排序
    });
}
function evaluateFormation(row, col, currentColor, opponentColor, board, maxSelfExtraMoves) {
    const formationUpdate = checkFormation(row, col, currentColor, board);
    if (!formationUpdate) return 0;

    const { countAdjacent, countAdjacentOpponent } = countAdjacentPieces(row, col, currentColor, opponentColor, board);

    if (isValidFormation(row, col, formationUpdate, countAdjacent, maxSelfExtraMoves)) {
        return formationUpdate.extraMoves;
    }

    return 0;
}
function isValidFormation(row, col, formationUpdate, countAdjacent, maxSelfExtraMoves) {
    if (formationUpdate.formationType.includes('斜') && countAdjacent > 0 && maxSelfExtraMoves <= formationUpdate.extraMoves) {
        return true;
    } else if (formationUpdate.formationType.includes('龙') && ((countAdjacent > 1 && isOnEdge(row, col)) || (countAdjacent > 2 && !isOnEdge(row, col))) && maxSelfExtraMoves <= formationUpdate.extraMoves) {
        return true;
    } else if ((formationUpdate.formationType.includes('方') && countAdjacent > 2) && maxSelfExtraMoves <= formationUpdate.extraMoves) {
        return true;
    }

    return false;
}
function countAdjacentPieces(row, col, currentColor, opponentColor, board) {
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
function countNeighborPieces(row, col, currentColor, opponentColor, board) {
    let countNeighbor = 0; // 己方棋子数量
    let countNeighborOpponent = 0; // 对方棋子数量
    let countFree = 0; // 空位数量

    for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
        const newRow = row + dx;
        const newCol = col + dy;

        // 检查是否在棋盘范围内
        if (!isInBoard(newRow, newCol)) {
            continue;
        }

        // 检查棋子颜色
        const piece = board[newRow][newCol];
        if (piece?.color === currentColor) {
            countNeighbor++;
        } else if (piece?.color === opponentColor) {
            countNeighborOpponent++;
        } else if (piece === null) {
            countFree++;
        }
    }

    return { countNeighbor, countNeighborOpponent, countFree };
}
function getPossibleMoves(validMoves, board, currentColor, opponentColor) {
    let countOfFormation = 0; // 形成阵型的数量，同一个位置在不同方向可形成多个阵型
    let equalPositions = []; // 用于存储多个相等的位置
    const possibleMoves = [];
    let possibleMove = null;

    // 遍历 validMoves，将 newPosition 添加到 
    validMoves.forEach(move => {
        const tempBoard = deepCopy(board);
        // 递归检查下一层
        tempBoard[move.newPosition[0]][move.newPosition[1]] = {
            color: currentColor,
            isFormation: false
        };
        tempBoard[move.position[0]][move.position[1]] = null;
        let tempCount = 0;
        for (let row = 0; row < tempBoard.length; row++) {
            for (let col = 0; col < tempBoard[row].length; col++) {
                if (tempBoard[row][col] !== null) {
                    continue;
                }
                // 当前为空位，再判断周围有没有己方棋子，如果有，再判断是否能形成阵型
                for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
                    const newRow = row + dx;
                    const newCol = col + dy;

                    if (!isInBoard(newRow, newCol) || tempBoard[newRow][newCol] === null || tempBoard[newRow][newCol].color === opponentColor) {
                        continue;
                    }
                    // 如果周围有己方棋子，判断一下是否形成阵型
                    const formationUpdate = checkFormation(row, col, currentColor, tempBoard);
                    if (formationUpdate) {
                        tempCount++;
                    }
                    // 在一个空位周围找到了己方棋子，不管能不能形成阵型都停止循环
                    break;
                }
            }
        }
        if (tempCount > countOfFormation) {
            countOfFormation = tempCount;
            possibleMove = move;
            // possibleMoves.push(move);
            equalPositions = [move]; // 重置相等位置数组
        } else if (tempCount > 0 && tempCount === countOfFormation) {
            equalPositions.push(move); // 添加到相等位置数组            
        }
    });

    if (equalPositions.length > 1) {
        return equalPositions; // 返回所有相等的位置
    }
    if (possibleMove) {
        return possibleMoves.push(possibleMove);
    }

    return null;
}
