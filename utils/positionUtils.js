import { DIRECTIONS, CONFIG, WEIGHTS } from './gameConstants.js';
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
    const availablePositions = new Set();
    let finalPositions = [];
    finalPositions = checkImmediateWin(board, currentColor, opponentColor, availablePositions, extraMoves);
    if (finalPositions.length > 0) {
        return finalPositions;
    }
    const emptySpaces = CONFIG.MAX_PIECES_COUNT - blackCount - whiteCount;
    const dynamicConfig = calculateOptimalParameters(emptySpaces, availablePositions, currentColor, playerConfig); // 计算最优的模拟参数
    // 初始化
    const agent = createMCTSAgent(dynamicConfig.dynamicSimulations, dynamicConfig.dynamicDepth);

    // 对这些候选点做 MCTS 模拟搜索，得到胜率最高的点来决策。
    let bestPlaces = agent.getBestPlace(
        currentColor,
        opponentColor,
        board,
        evaluatePositions,
        availablePositions
    );

    // 如果存在多个同分位置，根据 WEIGHTS 选择权重最大的位置
    if (bestPlaces.length > 1) {
        // 评估每个位置移除对方棋子后的综合收益
        const evaluationResult = evaluatePlaceAndRemoveReward(
            bestPlaces,
            board,
            currentColor,
            opponentColor
        );

        if (evaluationResult.position) {
            return [{
                action: 'placing',
                position: evaluationResult.position
            }];
        }
        // 如果没有找到最佳位置，则选择权重最大的一个位置
        bestPlaces = selectPositionsByWeight(bestPlaces);
        debugLog(CONFIG.DEBUG, '按权重过滤后的bestPlaces', bestPlaces);
    }

    bestPlaces.forEach(pos => {
        finalPositions.push({
            action: 'placing',
            position: pos
        });
    });
    

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

function checkImmediateWin(currentBoard, currentColor, opponentColor, availablePositions, extraMoves) {
    const finalPositions = [];
    let { bestSelfPosition, bestOpponentPosition } = evaluatePositions(currentBoard, currentColor, opponentColor, availablePositions);

    // 1、优先判断放置在己方棋子周围是否会组成阵型
    if (bestSelfPosition && !extraMoves > 0) {
        if (Array.isArray(bestSelfPosition[0])) {
            // 处理多个相等位置的情况
            if (bestSelfPosition.length > 1) {
                bestSelfPosition = selectPositionsByWeight(bestSelfPosition);
            }
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
            if (bestOpponentPosition.length > 1) {
                bestOpponentPosition = selectPositionsByWeight(bestOpponentPosition);
            }
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

/**
 * 从多个位置中选择权重最大的位置
 * @param {Array<Array<number>>} positions 位置数组，每个位置是 [row, col] 格式
 * @returns {Array<Array<number>>} 权重最大的位置数组
 */
function selectPositionsByWeight(positions) {
    if (!positions.length) return [];

    // 找出最大权重
    let maxWeight = -Infinity;
    positions.forEach(pos => {
        const [row, col] = pos;
        const weight = WEIGHTS[row][col];
        if (weight > maxWeight) maxWeight = weight;
    });

    // 筛选出权重等于最大权重的位置
    return positions.filter(pos => {
        const [row, col] = pos;
        return WEIGHTS[row][col] === maxWeight;
    });
}

/**
 * 创建 MCTSAgent 实例的工厂函数
 * @param {string} currentColor - 当前玩家颜色
 * @param {number} dynamicSimulations - 
 * @param {number} dynamicDepth
 * @returns {MCTSAgent} 配置好的 MCTSAgent 实例
 */
function createMCTSAgent(dynamicSimulations, dynamicDepth) {

    // 返回配置好的 MCTSAgent 实例
    return new MCTSAgent({
        dynamicSimulations: dynamicSimulations,
        dynamicDepth: dynamicDepth
    });
}

/**
 * 计算最优的模拟参数
 * @param {Array} emptySpaces -当前可用位置数
 * @param {Set} availablePositions - 当前可用位置
 * @returns {Object} 最优的模拟参数
 */
function calculateOptimalParameters(emptySpaces, availablePositions, currentColor, playerConfig) {
    // 获取当前玩家的难度配置
    const difficulty = playerConfig[currentColor].difficulty;
    const config = CONFIG.MCTS_CONFIG[difficulty];

    // 2. 计算当前可用位置数
    const currentMoves = availablePositions.size;

    // 3. 计算理论上完整遍历所需的最小模拟次数
    // 每个深度的可能移动数会随着棋子增加先增加后减少，这个跟棋盘的空位数有关
        // 根据空位数动态估算每轮平均可用移动数
        let averageMovesPerTurn;
        if (emptySpaces >= 30) {  // 开局阶段 (前6步)
            averageMovesPerTurn = Math.min(currentMoves * 1.2, 12);  // 可能增长但限制上限
        } else if (emptySpaces >= 18) {  // 中盘阶段
            // 18-30空位时是移动数最多的阶段
            averageMovesPerTurn = Math.min(currentMoves * 1.5, 16);
        } else if (emptySpaces >= 10) {  // 后中盘
            // 10-18空位时开始下降
            averageMovesPerTurn = Math.max(currentMoves * 0.8, 6);
        } else {  // 残局阶段
            // 空位较少时，可用移动显著减少
            averageMovesPerTurn = Math.max(currentMoves * 0.6, 1);
        }
    const theoreticalMinSimulations = Math.ceil(Math.pow(averageMovesPerTurn, 2)); // 保证至少能覆盖两层决策

    // 4. 根据剩余空位动态调整搜索深度
    const optimalDepth = Math.max(config.minDepth, Math.min(config.maxDepth, emptySpaces));

    // 5. 调整模拟次数，确保能覆盖关键分支
    const optimalSimulations = Math.min(
        config.maxSimulations, // 最大限制
        Math.max(
            config.minSimulations,  // 最小限制
            theoreticalMinSimulations
        )
    );
    debugLog(CONFIG.DEBUG, '计算动态参数',config, '动态模拟次数:', optimalSimulations, '动态搜索深度:', optimalDepth);
    return {
        dynamicSimulations: optimalSimulations,
        dynamicDepth: optimalDepth
    };
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

/**
 * 评估放置位置并模拟移除对方棋子的综合收益
 * @param {Array<Array<number>>} bestPlaces - 候选放置位置数组 
 * @param {Array<Array>} board - 当前棋盘
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {Object} 最佳放置位置及其收益
 */
function evaluatePlaceAndRemoveReward(bestPlaces, board, currentColor, opponentColor) {
    let maxTotalExtraMoves = 0;
    let bestPosition = null;

    // 遍历每个候选放置位置
    for (const pos of bestPlaces) {
        const [row, col] = pos;
        let currentTotalExtraMoves = 0;

        // 1. 模拟在该位置放置己方棋子
        const tempBoard = deepCopy(board);
        tempBoard[row][col] = {
            color: currentColor,
            isFormation: false
        };

        // 2. 遍历棋盘上所有对方棋子，模拟移除
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 6; c++) {
                if (hasValidPiece(r, c, tempBoard) !== opponentColor) {
                    continue;
                }
                if (tempBoard[r][c].isFormation) continue; // 如果己方棋子已经形成阵型，则不能移除对方棋子

                // 3. 记录每个移除位置能获得的最大extraMoves
                let maxExtraMovesForPosition = 0;

                // 4. 检查周围所有己方棋子移动到该位置的情况
                for (const dir of DIRECTIONS.ADJACENT) {
                    const nearRow = r + dir.dx;
                    const nearCol = c + dir.dy;

                    if (!isInBoard(nearRow, nearCol)) continue;

                    // 检查己方棋子是否可以移动到该位置形成阵型
                    if (hasValidPiece(nearRow, nearCol, tempBoard) === currentColor) {
                        // 模拟移动己方棋子
                        tempBoard[nearRow][nearCol] = null;


                        // 检查是否形成有效阵型
                        const formation = checkFormation(r, c, currentColor, tempBoard);
                        // 恢复棋盘状态

                        tempBoard[nearRow][nearCol] = { color: currentColor, isFormation: false };
                        if (formation && formation.extraMoves > maxExtraMovesForPosition) {
                            maxExtraMovesForPosition = formation.extraMoves;
                        }
                    }
                }

                // 5. 对于该移除位置，累加所有不同己方棋子能获得的最大extraMoves
                currentTotalExtraMoves += maxExtraMovesForPosition;
            }
        }

        // 5. 更新最大收益
        if (currentTotalExtraMoves > maxTotalExtraMoves) {
            maxTotalExtraMoves = currentTotalExtraMoves;
            bestPosition = pos;
        } else if (currentTotalExtraMoves === maxTotalExtraMoves) {
            debugLog(CONFIG.DEBUG, `当前位置${pos}收益: ${currentTotalExtraMoves}与之前位置相等：`, bestPosition);
        }
    }

    return {
        position: bestPosition,
        totalReward: maxTotalExtraMoves
    };
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
                // 修改评估己方阵型的代码
                debugLog(CONFIG.DEBUG, `检查首次移除位置[${row},${col}]`);
                // 首次移除时，优先考虑移除后己方可以获得的吃子机会
                const formationAfterRemove = canFormFormationAfterRemove(row, col, currentColor, board);
                if (formationAfterRemove.canForm) {
                    debugLog(CONFIG.DEBUG, `移除[${row},${col}]后，己方棋子可移动形成阵型，吃子数：${formationAfterRemove.extraMoves}`);
                    if (formationAfterRemove.extraMoves > maxSelfExtraMoves) {
                        maxSelfExtraMoves = formationAfterRemove.extraMoves;
                        bestSelfPosition = [row, col];
                        debugLog(CONFIG.DEBUG, `更新最佳己方位置：[${row},${col}]，可获得吃子数：${maxSelfExtraMoves}`);
                    }
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
                if (maxOpponentExtraMoves < formationUpdateOpponent.extraMoves) {
                    maxOpponentExtraMoves = formationUpdateOpponent.extraMoves;
                    // 记录新的最大值时，需要重新评估所有位置
                    bestOpponentPosition = null;
                    betterOpponentPosition = null;

                    // 输出日志用于调试
                    debugLog(CONFIG.DEBUG, `发现更大的奖励值: ${maxOpponentExtraMoves}, 重置位置评估`);
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

                    // 计算破坏效果
                    const currentDestroyEffect = formationUpdateOpponent.extraMoves - (formationUpdateDestroy ? formationUpdateDestroy.extraMoves : 0);
                    debugLog(CONFIG.DEBUG, `评估移除位置 ${pos}: 原始奖励=${formationUpdateOpponent.extraMoves}, 破坏后=${formationUpdateDestroy?.extraMoves || 0}, 净效果=${currentDestroyEffect}`);

                    // 检查移除后己方是否能形成阵型
                    const selfFormationPossible = canFormFormationAfterRemove(pos[0], pos[1], currentColor, board);
                    if (selfFormationPossible.canForm) {
                        debugLog(CONFIG.DEBUG, `移除${pos}后己方可形成阵型，奖励=${selfFormationPossible.extraMoves}`);
                    }

                    // 综合评估位置价值：
                    // 1. 破坏对方阵型的效果
                    // 2. 是否能让己方形成阵型
                    // 3. 周围棋子数量
                    // 寻找阵型上周围棋子最少得那颗
                    const result = countAdjacentPieces(pos[0], pos[1], currentColor, opponentColor, board);

                    // 计算综合分数
                    const totalScore = currentDestroyEffect           // 破坏对方阵型的效果
                        + (selfFormationPossible.canForm ? selfFormationPossible.extraMoves * 2 : 0)  // 己方形成阵型的潜力（加权）
                        - result.countAdjacentOpponent * 0.5;        // 周围对手棋子数量（负面影响）

                    debugLog(CONFIG.DEBUG, `位置${pos}的综合评分=${totalScore}, 包含：破坏效果=${currentDestroyEffect}, 己方机会=${selfFormationPossible.canForm ? selfFormationPossible.extraMoves : 0}, 周围棋子=${result.countAdjacentOpponent}`);

                    if (totalScore > maxOpponentExtraMoves) {
                        maxOpponentExtraMoves = totalScore;
                        bestOpponentPosition = pos;
                        debugLog(CONFIG.DEBUG, `更新最佳位置为${pos}, 综合评分=${totalScore}`);
                    }
                    /*                     if (result.countAdjacentOpponent < countAdjacentOpponent) {
                                            countAdjacentOpponent = result.countAdjacentOpponent;
                                            if (formationUpdateDestroy) {
                                                const currentDestroyEffect = formationUpdateOpponent.extraMoves - (formationUpdateDestroy ? formationUpdateDestroy.extraMoves : 0);
                    
                                                // 记录和输出每个位置的评估结果
                                                debugLog(CONFIG.DEBUG, `评估位置 ${pos}: 原始奖励=${formationUpdateOpponent.extraMoves}, 破坏后=${formationUpdateDestroy.extraMoves}, 净效果=${currentDestroyEffect}`);
                    
                                                if (currentDestroyEffect > maxOpponentExtraMoves) {
                                                    maxOpponentExtraMoves = currentDestroyEffect;
                                                    bestOpponentPosition = pos;
                                                    debugLog(CONFIG.DEBUG, `更新最佳位置: ${pos}, 净效果=${currentDestroyEffect}`);
                                                }
                                            } else {
                                                // 完全破坏阵型的情况
                                                const currentDestroyEffect = formationUpdateOpponent.extraMoves;
                                                if (currentDestroyEffect > maxOpponentExtraMoves) {
                                                    maxOpponentExtraMoves = currentDestroyEffect;
                                                    bestOpponentPosition = pos;
                                                    debugLog(CONFIG.DEBUG, `完全破坏阵型，更新最佳位置: ${pos}, 效果=${currentDestroyEffect}`);
                                                }
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
                                        } */
                    debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${pos}进行判断后当bestOpponentPosition及最大吃子数：`, bestOpponentPosition, maxOpponentExtraMoves);
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
                                debugLog(CONFIG.DEBUG, `1-${currentColor}只在没有更好的position时才考虑移动的棋子位置${[row, col]}`, maxOpponentExtraMoves);
                            }
                        }
                    } else if (betterOpponentPosition) {
                        bestOpponentPosition = betterOpponentPosition;
                        maxOpponentExtraMoves = formationUpdateOpponent.extraMoves;
                        debugLog(CONFIG.DEBUG, `1-${currentColor}对方${[newRow, newCol]}周围棋子数量不等于1`, bestOpponentPosition, newResult.countAdjacentOpponent);
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
                debugLog(CONFIG.DEBUG, `1-${currentColor}，首次删除，或者已找到对方可能形成阵型的位置:`, bestOpponentPosition);
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
        // 首次移除优先己方吃子
        debugLog(CONFIG.DEBUG, `1-${currentColor}-isFirstRemove-可能形成阵型的位置:`, bestSelfPosition);
        finalPositions.push({
            action: 'removing',
            position: bestSelfPosition
        });
        return finalPositions;
    }
    // 第二次及以后，优先阻止对方吃子
    if (!isFirstRemove && (betterOpponentPosition || bestOpponentPosition)) {
        const pos = betterOpponentPosition || bestOpponentPosition;
        debugLog(CONFIG.DEBUG, `2-${currentColor}-优先阻止对方吃子的位置:`, pos);
        finalPositions.push({
            action: 'removing',
            position: pos
        });
        return finalPositions;
    }

    // 如果无法阻止对方，则再考虑己方形成阵型
    if (bestSelfPosition) {
        debugLog(CONFIG.DEBUG, `2-${currentColor}-无法阻止对方，选择己方可形成阵型的位置:`, bestSelfPosition);
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
    // 对方和自己都不能形成阵型的位置，优先选择对方可以移动的棋子
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
/**
 * 检查移除对方棋子后，是否有己方棋子可以移动到该位置形成阵型
 */
function canFormFormationAfterRemove(row, col, currentColor, board) {
    // 1. 先检查该位置周围是否有己方棋子
    if (!hasAdjacentPiece(row, col, currentColor, board)) {
        return { canForm: false, extraMoves: 0 };
    }

    // 2. 创建移除了该对方棋子的临时棋盘

    let maxExtraMoves = 0;

    // 检查是否能形成阵型
    const formation = checkFormation(row, col, currentColor, board);
    if (formation) {
        maxExtraMoves = formation.extraMoves;
    }

    return {
        canForm: maxExtraMoves > 0,
        extraMoves: maxExtraMoves
    };
}

function hasAdjacentPiece(row, col, currentColor, board) {
    for (const dir of DIRECTIONS.ADJACENT) {
        const newRow = row + dir.dx;
        const newCol = col + dir.dy;
        if (hasValidPiece(newRow, newCol, board) === currentColor) {
            return true; // 找到一个己方棋子，直接返回
        }
    }
    return false; // 没有找到任何己方棋子
}

function getValidMoves(currentColor, opponentColor, data) {
    const { board } = data;
    const moves = {
        selfFormationMoves: [],    // 第一优先级：己方可形成阵型的移动
        preventOpponentMoves: [],  // 第二优先级：可以阻止对方获得机会的移动
        safeMoves: [],            // 第三优先级：不会给对方带来机会的移动
        worstMoves: []            // 第四优先级：会给对方带来机会的移动
    };

    // 遍历所有可能的移动
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (hasValidPiece(row, col, board) !== currentColor) continue;

            for (const dir of DIRECTIONS.ADJACENT) {
                const newRow = row + dir.dx;
                const newCol = col + dir.dy;
                if (!isValidMove(newRow, newCol, board)) continue;
                // 创建临时棋盘
                const tempBoard = deepCopy(board);
                tempBoard[row][col] = null;
                tempBoard[newRow][newCol] = { color: currentColor, isFormation: false };

                debugLog(CONFIG.DEBUG, `\n评估移动: [${row},${col}] -> [${newRow},${newCol}]`);

                const evaluation = evaluateMoveValue(row, col, newRow, newCol, currentColor, opponentColor, tempBoard);
                debugLog(CONFIG.DEBUG, `移动评估结果:`, {
                    自己形成阵型: evaluation.selfFormation,
                    可阻止对方: evaluation.preventOpponent,
                    给对方机会: evaluation.giveOpponent,
                    净收益: evaluation.netBenefit
                });

                const move = {
                    action: 'moving',
                    position: [row, col],
                    newPosition: [newRow, newCol]
                };

                // 1. 检查是否能形成己方阵型
                if (evaluation.selfFormation > 0) {
                    debugLog(CONFIG.DEBUG, `发现可形成阵型的移动，奖励=${evaluation.selfFormation}`);
                    moves.selfFormationMoves.push({
                        move,
                        value: evaluation.selfFormation,
                        giveOpponent: evaluation.giveOpponent
                    });
                    continue;
                }

                // 2. 检查是否能阻止对方获得机会
                if (evaluation.preventOpponent > 0) {
                    debugLog(CONFIG.DEBUG, `发现可阻止对方的移动，价值=${evaluation.preventOpponent}，给对方机会=${evaluation.giveOpponent}`);
                    moves.preventOpponentMoves.push({
                        move,
                        preventValue: evaluation.preventOpponent,
                        giveOpponent: evaluation.giveOpponent
                    });
                    continue;
                }

                // 3. 检查是否是安全移动
                if (evaluation.giveOpponent === 0) {
                    // 1. 评估移动后是否能在下次移动形成阵型
                    const nextMoveFormations = evaluateNextMoveFormations(newRow, newCol, currentColor, opponentColor, tempBoard);

                    // 2. 评估这个位置是否是对方想要的位置
                    const opponentDesire = evaluateOpponentDesire(newRow, newCol, currentColor, opponentColor, tempBoard);

                    // 3. 评估位置的邻接棋子情况
                    const adjacentInfo = evaluateAdjacentPieces(newRow, newCol, currentColor, opponentColor, tempBoard);

                    moves.safeMoves.push({
                        move,
                        nextMoveFormations,
                        opponentDesire,
                        adjacentInfo
                    });
                    continue;
                }

                // 4. 记录风险移动
                debugLog(CONFIG.DEBUG, `风险移动，会给对方带来${evaluation.giveOpponent}的机会`);
                moves.worstMoves.push({
                    move,
                    giveOpponent: evaluation.giveOpponent
                });
            }
        }
    }

    // 打印移动统计
    debugLog(CONFIG.DEBUG, `\n===移动统计===`);
    debugLog(CONFIG.DEBUG, `己方阵型移动: ${moves.selfFormationMoves.length}个`);
    debugLog(CONFIG.DEBUG, `阻止对方移动: ${moves.preventOpponentMoves.length}个`);
    debugLog(CONFIG.DEBUG, `安全移动: ${moves.safeMoves.length}个`);
    debugLog(CONFIG.DEBUG, `风险移动: ${moves.worstMoves.length}个`);

    // 选择最终移动
    let finalMove;
    if (moves.selfFormationMoves.length > 0) {
        finalMove = selectBestMoves(moves.selfFormationMoves, 'giveOpponent', true)[0];
        debugLog(CONFIG.DEBUG, `选择己方阵型移动:`, finalMove);
        return [finalMove];
    }

    // 2. 可以阻止对方且给对方带来机会最少的移动
    if (moves.preventOpponentMoves.length > 0) {
        const preventMoves = moves.preventOpponentMoves.filter(m => m.preventValue > m.giveOpponent);
        if (preventMoves.length > 0) {
            finalMove = selectBestMoves(preventMoves, 'preventValue')[0];
            debugLog(CONFIG.DEBUG, `选择阻止对方移动:`, finalMove);
            return [finalMove];
        }
    }

    // 3. 安全移动（选择己方棋子最多的位置）
    // 修改安全移动的选择逻辑
    if (moves.safeMoves.length > 0) {
        // 1. 先找出可以下次移动形成阵型的位置
        const nextFormationMoves = moves.safeMoves.filter(m => m.nextMoveFormations.canFormFormation);
        if (nextFormationMoves.length > 0) {
            // 选择能获得最多奖励的位置
            return selectBestMoves(nextFormationMoves, 'nextMoveFormations.maxReward');
        }

        // 2. 再找出对方想要的位置
        const opponentDesireMoves = moves.safeMoves.filter(m => m.opponentDesire.isDesired);
        if (opponentDesireMoves.length > 0) {
            // 选择对方最想要的位置(可形成最多阵型的位置)
            return selectBestMoves(opponentDesireMoves, 'opponentDesire.formationCount');
        }

        // 3. 最后根据邻接棋子数量选择
        return selectBestMoves(moves.safeMoves, 'adjacentInfo.totalAdjacent');
    }


    // 4. 最后选择给对方带来机会最少的移动
    if (moves.worstMoves.length > 0) {
        return selectBestMoves(moves.worstMoves, 'giveOpponent', true);
    }

    return [];
}


/**
 * 评估下次移动是否能形成阵型
 */
function evaluateNextMoveFormations(row, col, currentColor, opponentColor, board) {
    let canFormFormation = false;
    let maxReward = 0;

    // 检查周围的空位
    for (const dir of DIRECTIONS.ADJACENT) {
        const nextRow = row + dir.dx;
        const nextCol = col + dir.dy;

        if (!isInBoard(nextRow, nextCol) || board[nextRow][nextCol] !== null) continue;

        const tempBoard = deepCopy(board);
        tempBoard[nextRow][nextCol] = { color: currentColor, isFormation: false };

        const formation = checkFormation(nextRow, nextCol, currentColor, tempBoard);
        if (formation && isValidFormation(nextRow, nextCol, formation,
            countAdjacentPieces(nextRow, nextCol, currentColor, opponentColor, tempBoard).countAdjacent, 0)) {
            canFormFormation = true;
            maxReward = Math.max(maxReward, formation.extraMoves);
        }
    }

    return { canFormFormation, maxReward };
}

/**
 * 评估位置对对手的价值
 */
function evaluateOpponentDesire(row, col, currentColor, opponentColor, board) {
    let isDesired = false;
    let formationCount = 0;
    let maxReward = 0;

    const tempBoard = deepCopy(board);
    tempBoard[row][col] = { color: opponentColor, isFormation: false };

    const formation = checkFormation(row, col, opponentColor, tempBoard);
    if (formation && isValidFormation(row, col, formation,
        countAdjacentPieces(row, col, opponentColor, currentColor, tempBoard).countAdjacent, 0)) {
        isDesired = true;
        formationCount++;
        maxReward = formation.extraMoves;
    }

    return { isDesired, formationCount, maxReward };
}

/**
 * 评估位置的邻接棋子情况
 */
function evaluateAdjacentPieces(row, col, currentColor, opponentColor, board) {
    const { countAdjacent, countAdjacentOpponent } = countAdjacentPieces(row, col, currentColor, opponentColor, board);

    return {
        selfAdjacent: countAdjacent,
        opponentAdjacent: countAdjacentOpponent,
        totalAdjacent: Math.max(countAdjacent, countAdjacentOpponent)
    };
}

/**
 * 选择最佳移动
 */
function selectBestMoves(moves, keyPath, minimum = false) {
    if (moves.length === 0) return [];

    // 处理嵌套属性路径
    const getValue = (obj, path) => {
        return path.split('.').reduce((acc, key) => acc ? acc[key] : undefined, obj);
    };

    moves.sort((a, b) => {
        const valueA = getValue(a, keyPath);
        const valueB = getValue(b, keyPath);
        return minimum ? valueA - valueB : valueB - valueA;
    });

    const bestValue = getValue(moves[0], keyPath);
    return moves
        .filter(m => getValue(m, keyPath) === bestValue)
        .map(m => m.move);
}
/**
 * 评估一个移动的价值
 */
function evaluateMoveValue(row, col, newRow, newCol, currentColor, opponentColor, tempBoard) {

    const formation = checkFormation(newRow, newCol, currentColor, tempBoard);
    // 1. 检查移动到新位置是否会形成己方阵型
    const selfFormation = formation ? formation.extraMoves : 0;


    // 2. 检查移动后能阻止多少对方吃子
    const formationPreventOpponent = checkFormation(newRow, newCol, opponentColor, tempBoard);
    // const preventOpponent = formationPreventOpponent ? formationPreventOpponent.extraMoves : 0;
    const preventOpponent = evaluateFormation(newRow, newCol, opponentColor, currentColor, tempBoard, 0);

    // 3. 检查移动后给对方带来的吃子机会
    const giveOpponent = evaluateFormation(row, col, opponentColor, currentColor, tempBoard, 0);

    return {
        selfFormation,
        preventOpponent,
        giveOpponent,
        netBenefit: preventOpponent - giveOpponent
    };
}

function isValidMove(row, col, board) {
    return isInBoard(row, col) && board[row][col] === null;
}

function getValidMoves3(currentColor, opponentColor, data) {
    const { board } = data;
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    const finalPositions = [];
    const validMoves = [];
    const worstMoves = [];
    let betterMoves = null; // 形成己方阵型的移动
    let goodMoves = null;
    let equalPositions = []; // 用于存储多个相等的位置
    // 添加新变量来跟踪每个移动对应的对方可能获得的奖励
    const moveRewards = new Map();

    // 新增：用于记录净收益最大的移动
    let bestNetBenefit = -Infinity;
    let bestNetBenefitMoves = [];

    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (hasValidPiece(row, col, board) !== currentColor) continue;
            const tempBoard = deepCopy(board);
            tempBoard[row][col] = null;
            // 记录当前棋子周边己方和对方棋子数量
            let countAdjacent = 0;
            let countAdjacentOpponent = 0;
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
                if (!isInBoard(newRow, newCol)) continue;

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

                if (betterMoves) continue;

                // 修改这部分：评估移动的净收益
                destroyedOpponentExtraMoves = evaluateFormation(newRow, newCol, opponentColor, currentColor, tempBoard, maxOpponentExtraMoves);
                if (destroyedOpponentExtraMoves > 0) {
                    // 计算移动后是否会给对方带来机会
                    const afterMoveOpponentBenefit = evaluateFormation(row, col, opponentColor, currentColor, tempBoard, maxOpponentExtraMoves);
                    const netBenefit = destroyedOpponentExtraMoves - afterMoveOpponentBenefit;
                    debugLog(CONFIG.DEBUG, `2、${currentColor}-${row},${col}move到${newRow},${newCol}后可阻止对方形成阵型，净收益=${netBenefit}`, destroyedOpponentExtraMoves);

                    // 新增：记录净收益最大的所有移动
                    if (netBenefit > bestNetBenefit) {
                        bestNetBenefit = netBenefit;
                        bestNetBenefitMoves = [{
                            action: 'moving',
                            position: [row, col],
                            newPosition: [newRow, newCol]
                        }];
                    } else if (netBenefit === bestNetBenefit) {
                        bestNetBenefitMoves.push({
                            action: 'moving',
                            position: [row, col],
                            newPosition: [newRow, newCol]
                        });
                    }
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
            if (betterMoves) continue;

            if (possiblePosition || commonPositions.length > 0) {
                // 如果移动给了对方机会，且吃子更多
                const newEvaluateFormationResult = evaluateFormation(row, col, opponentColor, currentColor, tempBoard, maxOpponentExtraMoves);
                const netBenefit = destroyedOpponentExtraMoves - newEvaluateFormationResult;
                // 修改判断条件，考虑净收益
                if (newEvaluateFormationResult > 0) {
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
    // 己方形成阵型的移动
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
        // 优先筛选移动后对方吃子为0的安全移动
        const safeMoves = [];
        validMoves.forEach(move => {
            const tempBoard = deepCopy(board);
            tempBoard[move.position[0]][move.position[1]] = null;
            tempBoard[move.newPosition[0]][move.newPosition[1]] = { color: currentColor, isFormation: false };
            const opponentEat = evaluateFormation(move.newPosition[0], move.newPosition[1], opponentColor, currentColor, tempBoard, 0);
            if (opponentEat === 0) {
                safeMoves.push(move);
            }
        });
        if (safeMoves.length > 0) {
            debugLog(CONFIG.DEBUG, `5-0、${currentColor}优先选择移动后对方吃子为0的安全移动`, safeMoves);
            return safeMoves;
        }

        //对于这些要按照place的逻辑再判断一下
        let possiblePositions = getPossibleMoves(validMoves, board, currentColor, opponentColor);
        if (possiblePositions && possiblePositions.length > 0) {
            debugLog(CONFIG.DEBUG, `5-1、${currentColor}棋子周围放置2颗棋子会组成阵型`, possiblePositions);
            return possiblePositions;
        }
        possiblePositions = getPossibleMoves(validMoves, board, opponentColor, currentColor);
        if (possiblePositions && possiblePositions.length > 0) {
            debugLog(CONFIG.DEBUG, `5-2、${currentColor}放在对方棋子周围，防止连续放置2颗棋子组成阵型`, possiblePositions);
            return possiblePositions;
        }
        debugLog(CONFIG.DEBUG, `5-3、${currentColor}既不能自己形成阵型，也不能阻止对方形成阵型`, validMoves);
        return validMoves;
    }

    // 新增：只在净收益为正时才返回
    if (bestNetBenefitMoves.length > 0 && bestNetBenefit > 0) {
        debugLog(CONFIG.DEBUG, `2-${currentColor}-净收益最大移动:`, bestNetBenefitMoves, bestNetBenefit);
        return bestNetBenefitMoves;
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
