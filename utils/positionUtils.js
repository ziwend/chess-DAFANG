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
    debugLog(CONFIG.DEBUG, '计算动态参数', config, '动态模拟次数:', optimalSimulations, '动态搜索深度:', optimalDepth);
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
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                if (hasValidPiece(r, c, tempBoard) !== opponentColor) {
                    continue;
                }
                if (tempBoard[r][c].isFormation) continue; // 如果已经形成阵型，则不能移除对方棋子，这里假设一个前提就是对方有不在阵型中的可移除棋子，简化了逻辑

                // 3. 记录每个移除位置能获得的最大extraMoves
                const maxExtraMovesForPosition = getMaxFormationRewardAfterMove(r, c, currentColor, tempBoard);

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
/**
 * 计算指定棋子周边的棋子移动到该位置后可获得的最大奖励
 * @param {number} r - 目标位置行
 * @param {number} c - 目标位置列
 * @param {string} color - 棋子颜色
 * @param {Array} board - 当前棋盘
 * @returns {Object} 包含最大奖励和形成阵型的位置信息
 */
function getMaxFormationRewardAfterMove(r, c, color, board) {
    let maxExtraMoves = 0;
    let maxFormationPositions = [];
    let fromPosition = null;  // 记录移动的源棋子位置

    // 检查周围所有可能移动到该位置的己方棋子
    for (const dir of DIRECTIONS.ADJACENT) {
        const srcRow = r + dir.dx;
        const srcCol = c + dir.dy;

        if (!isInBoard(srcRow, srcCol)) continue;

        if (hasValidPiece(srcRow, srcCol, board) !== color) continue;

        // 模拟移动
        const tempBoard = deepCopy(board);
        tempBoard[srcRow][srcCol] = null;
        tempBoard[r][c] = { 
            color: color,  // 确保设置 color
            isFormation: false 
        };

        // 检查是否形成有效阵型
        const formation = checkFormation(r, c, color, tempBoard);
        if (formation && formation.extraMoves > maxExtraMoves) {
            maxExtraMoves = formation.extraMoves;
            maxFormationPositions = formation.formationPositions;
            fromPosition = [srcRow, srcCol];  // 记录来源位置
        }
    }

    return {
        maxExtraMoves,
        formationPositions: maxFormationPositions,
        fromPosition  // 返回移动的源棋子位置
    };
}
function getValidRemovePositions(currentColor, opponentColor, data) {
    const { board, blackCount, whiteCount, isExchangeRemoving } = data;
    const isFirstRemove = isExchangeRemoving;
    const isSecondRemove = isBoardWillFull(blackCount, whiteCount);
    const nonFormationPieces = [];
    const diagonalOrDragonPieces = [];
    const squarePositions = [];
    let hasNonFormationPiecesFlag = false;
    let hasNonSquarePiecesFlag = null;
    let bestSelfPosition = null; // 便于己方形成阵型的最佳位置
    let bestOpponentPosition = null; // 破坏对方阵型的最佳位置
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0; // 对方阵型在移除某棋子后减少的吃子数，越大越好
    const evaluations = [];

    // 第一次移动，首先一个问题，棋盘上没有空位，
    if (!isFirstRemove) {
        // 首先假定至少存在一个空位，非第一次移除阶段
        const totalRewardResult = calculateTotalReward(board, opponentColor);
        const maxThreat_reward = totalRewardResult.maxThreat ? totalRewardResult.maxThreat.reward : 0;

        if (maxThreat_reward > 0) {
            const [toRow, toCol] = totalRewardResult.maxThreat.position; // 对方的最佳移动位置
            // 尝试移除该棋子后，计算对方能形成的最大阵型数
            const [row, col] = totalRewardResult.maxThreat.fromPosition; // 对方的最佳移动棋子，不一定是己方吃子的最佳位置，首先尝试移除它，看对方还能形成的最大吃子数，计算收益值

            const tempBoard = deepCopy(board);
            // TODO 该棋子在阵型中，先不考虑特殊场景，不能移除
            if (!board[row][col].isFormation) {
                tempBoard[row][col] = null; // 移除对方棋子
                // 2. 对空位计算最大奖励
                const reward = getMaxFormationRewardAfterMove(toRow, toCol, opponentColor, tempBoard);
                // 恢复棋盘状态
                tempBoard[row][col] = {
                    color: opponentColor,
                    isFormation: false
                };
                if (reward.maxExtraMoves < maxThreat_reward) {
                    maxOpponentExtraMoves = maxThreat_reward - reward.maxExtraMoves;
                    bestOpponentPosition = [row, col]; // 记录破坏对方阵型的最佳位置
                }
            }

            // 还要对比一下阵型中的棋子移除能否达到更好的破坏效果，或者是相同的效果
            for (const pos of totalRewardResult.maxThreat.formationPositions) {
                const [newRow, newCol] = pos;
                // 先检查是否为null
                if (tempBoard[newRow][newCol] === null) continue;

                // TODO 该棋子在阵型中，先不考虑特殊场景，不能移除
                if (tempBoard[newRow][newCol].isFormation) continue;

                tempBoard[newRow][newCol] = null; // 移除对方棋子
                const rewardAfterRemove = getMaxFormationRewardAfterMove(toRow, toCol, opponentColor, tempBoard);
                // 恢复棋盘状态
                tempBoard[newRow][newCol] = {
                    color: opponentColor,
                    isFormation: false
                };
                if (maxOpponentExtraMoves < maxThreat_reward - rewardAfterRemove.maxExtraMoves) {
                    bestOpponentPosition = pos; // 记录破坏对方阵型的最佳位置
                    maxOpponentExtraMoves = maxThreat_reward - rewardAfterRemove.maxExtraMoves;
                } else if (maxOpponentExtraMoves === maxThreat_reward - rewardAfterRemove.maxExtraMoves && maxOpponentExtraMoves > 0) {
                    // 最优的选择，移除阵型上的某颗棋子对方阵型完全被破坏，并且自己有一个吃子机会，对方还无法封堵；
                    // 继续对比一下是否有更好的选择，比如新位置周围没有对方棋子
                    const [oldRow, oldCol] = bestOpponentPosition;
                    const hasAdjacentPieceFlagOld = hasAdjacentPiece(oldRow, oldCol, opponentColor, tempBoard);
                    const hasAdjacentPieceFlagNew = hasAdjacentPiece(newRow, newCol, opponentColor, tempBoard);
                    if (hasAdjacentPieceFlagOld && !hasAdjacentPieceFlagNew) {
                        // 说明新位置周围没有对方棋子，且旧位置有对方棋子，则新位置更优
                        bestOpponentPosition = pos;
                        continue;
                    } else if (!hasAdjacentPieceFlagOld && hasAdjacentPieceFlagNew) {
                        // 说明新位置周围有对方棋子，且旧位置没有对方棋子，则旧位置更优
                        continue;
                    }
                    // 说明新位置和旧位置周围都有对方棋子，或者都没有对方棋子，则需要进一步对比，比如对比下移除新旧位置后己方能否形成阵型及获得的最大吃子数
                    const rewardAfterRemoveOld = getMaxFormationRewardAfterMove(oldRow, oldCol, currentColor, tempBoard);
                    const rewardAfterRemoveNew = getMaxFormationRewardAfterMove(newRow, newCol, currentColor, tempBoard);
                    if (rewardAfterRemoveOld.maxExtraMoves > rewardAfterRemoveNew.maxExtraMoves) {
                        // 说明旧位置移除后己方能形成阵型及获得的最大吃子数更多，则旧位置更优
                        continue;
                    } else if (rewardAfterRemoveOld.maxExtraMoves < rewardAfterRemoveNew.maxExtraMoves) {
                        // 说明新位置移除后己方能形成阵型及获得的最大吃子数更多，则新位置更优
                        bestOpponentPosition = pos;
                    } else {
                        // 说明新旧位置移除后己方能形成阵型及获得的最大吃子数相同，则继续对比该次移除对棋盘局势的影响，比如调用calculateTotalReward(board, opponentColor)看那次移除返回值小，选哪个位置
                        debugLog(CONFIG.DEBUG, `新旧位置移除后对方能形成阵型及获得的最大吃子数相同，继续对比该次移除对棋盘局势的影响`,tempBoard);
                        tempBoard[oldRow][oldCol] = null
                        const totalRewardResultOld = calculateTotalReward(tempBoard, opponentColor);
                        tempBoard[oldRow][oldCol] = {
                            color: opponentColor,
                            isFormation: false
                        };
                        tempBoard[newRow][newCol] = null; // 移除对方棋子
                        const totalRewardResultNew = calculateTotalReward(tempBoard, opponentColor);
                        // 恢复棋盘状态
                        tempBoard[newRow][newCol] = {
                            color: opponentColor,
                            isFormation: false
                        };
                        const totalRewardOld = totalRewardResultOld.totalReward;
                        const totalRewardNew = totalRewardResultNew.totalReward;

                        if (totalRewardOld > totalRewardNew) {
                            bestOpponentPosition = pos;
                            continue;
                        }

                        debugLog(CONFIG.DEBUG, `新旧位置移除后对方能形成阵型及获得的最大吃子数相同，对比该次移除对棋盘局势的影响也相等，旧位置=${totalRewardResultOld} 新位置=${totalRewardResultNew}`);
                    }

                    bestOpponentPosition = pos;
                }
            }

            if (bestOpponentPosition && !isFirstRemove) {
                return [{
                    action: 'removing',
                    position: bestOpponentPosition
                }];
            } else {
                if (maxThreat_reward === totalRewardResult.totalReward) {
                    // 说明对方通过移动可以形成的最大阵型中的所有棋子都已在阵型中，如何处理待考虑，是否还有其他阵型可以移除
                    debugLog(CONFIG.DEBUG, `对方通过移动可以形成的最大阵型中的所有棋子都已在阵型中，同时没有其他阵型可以移除，totalRewardResult=`, totalRewardResult);
                } else {
                    debugLog(CONFIG.DEBUG, `对方通过移动可以形成的最大阵型中的所有棋子都已在阵型中，待考虑破坏对方其他阵型，totalRewardResult=`, totalRewardResult);
                }
            }
        }
    }
    // 如果走到这里，说明根据当前棋盘状态，对方一个阵型都不能形成，那么主要考虑吃子是否便于己方形成阵型; 
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
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

            // 如果走到这里说明已经没有特殊棋子需要处理了

            // 第一次移除时，优先考虑移除后己方可以获得的吃子机会，即吃掉对方吃子机会，比较特殊，后面单独处理，先处理正常的移除逻辑，即移除后对方只能走棋来形成阵型或阻止己方形成阵型


            if (isFirstRemove) {
                // 第一次移除时，优先考虑移除后己方可以获得的吃子机会，即吃掉对方获得的吃子机会，不追求最大值，但要求对方移除一颗棋子后不能完全破坏阵型
                // 比如，移除对方第一个位置可以吃5颗子，但是对方移除1颗己方棋子就被破坏了，净剩为0，而移除第二个位置，可以吃2颗棋子，对方移除1颗己方棋子后，己方还是能吃1颗，则选第二个位置


                // 评估所有可能的移除位置
                const evaluation = evaluateFirstRemovePosition(row, col, board, currentColor, opponentColor);
                if (evaluation.isValid) {
                    evaluations.push(evaluation);
                }
                // 按净收益降序排序
                evaluations.sort((a, b) => b.netReward - a.netReward);

                if (evaluations.length > 0) {
                    // 找出净收益最大的所有位置
                    const maxNetReward = evaluations[0].netReward;
                    const bestPositions = evaluations.filter(e => e.netReward === maxNetReward);

                    debugLog(CONFIG.DEBUG, `首次移除评估结果:
                    - 候选位置数: ${evaluations.length}
                    - 最大净收益: ${maxNetReward}
                    - 最佳位置数: ${bestPositions.length}`);

                    // 如果有多个相同净收益的位置，选择初始收益较小的
                    // 因为初始收益小意味着对方需要移除的己方棋子更少
                    bestPositions.sort((a, b) => a.initialReward - b.initialReward);
                    bestSelfPosition = bestPositions[0].position;
                } else {
                    // 没有形成阵型，暂时先记录一下位置
                    nonFormationPieces.push([row, col]);
                }
                continue;
            }

            const formationAfterRemove = getMaxFormationRewardAfterMove(row, col, currentColor, board);
            if (formationAfterRemove.maxExtraMoves > maxSelfExtraMoves) {
                maxSelfExtraMoves = formationAfterRemove.maxExtraMoves;
                bestSelfPosition = [row, col];
                debugLog(CONFIG.DEBUG, `更新最佳己方位置：[${row},${col}]，可获得吃子数：${maxSelfExtraMoves}`);
                continue;
            } else if (formationAfterRemove.maxExtraMoves === maxSelfExtraMoves && maxSelfExtraMoves > 0) {
                // 如果相等，则需要对比一下是否有更好的选择，比如新位置周围没有对方棋子
                const [r, c] = bestSelfPosition;
                const hasAdjacentPieceFlagOld = hasAdjacentPiece(r, c, opponentColor, board);
                const hasAdjacentPieceFlagNew = hasAdjacentPiece(row, col, opponentColor, board);
                if (hasAdjacentPieceFlagOld && !hasAdjacentPieceFlagNew) {
                    bestSelfPosition = [row, col];
                    debugLog(CONFIG.DEBUG, `更新最佳己方位置：[${row},${col}]，可获得吃子数：${maxSelfExtraMoves}`);
                    continue;
                } else if (!hasAdjacentPieceFlagOld && hasAdjacentPieceFlagNew) {
                    // 说明新位置周围有对方棋子，且旧位置没有对方棋子，则旧位置更优
                    continue;
                }
                // 说明新位置和旧位置周围都有对方棋子，或者都没有对方棋子，则需要进一步对比，
                debugLog(CONFIG.DEBUG, `新${[row, col]}旧${bestSelfPosition}位置移除后己方能形成阵型及获得的最大吃子数相同，继续对比该次移除对棋盘局势的影响`);
            }
            // 没有形成阵型，暂时先记录一下位置
            nonFormationPieces.push([row, col]);
        }
    }

    // 按优先级返回结果
    if (bestSelfPosition) {
        // 第一次移除时优先己方吃子
        debugLog(CONFIG.DEBUG, `1-${currentColor}-己方可能形成阵型的位置:`, bestSelfPosition);
        return [{
            action: 'removing',
            position: bestSelfPosition
        }];
    } else if (bestOpponentPosition) {
        // 首次移动，己方不能形成阵型，优先对方吃子
        debugLog(CONFIG.DEBUG, `2-${currentColor}-对方可能形成阵型的位置:`, bestOpponentPosition);
        return [{
            action: 'removing',
            position: bestOpponentPosition
        }];
    }

    // 处理普通移除
    return handleNormalRemove(nonFormationPieces, diagonalOrDragonPieces, board, currentColor, opponentColor);
}

/**
 * 评估首次移除的净收益
 * @param {number} row - 待评估的移除位置行
 * @param {number} col - 待评估的移除位置列
 * @param {Array} board - 当前棋盘
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {Object} 评估结果
 */
function evaluateFirstRemovePosition(row, col, board, currentColor, opponentColor) {
    // 1. 首先评估移除该位置后己方能获得的最大吃子数
    const initialReward = getMaxFormationRewardAfterMove(row, col, currentColor, board);

    if (initialReward.maxExtraMoves === 0) {
        return {
            position: [row, col],
            initialReward: 0,
            netReward: 0,
            isValid: false
        };
    }

    // 2. 然后评估对方通过移除一颗己方棋子后能破坏多少我方收益
    let minNetReward = initialReward.maxExtraMoves; // 最小净收益初始化为最大收益
    const counterBoard = deepCopy(board);
    // 模拟对方移除己方每颗参与阵型的棋子
    for (const formationPos of initialReward.formationPositions) {
        if (!Array.isArray(formationPos)) continue;
        const [fRow, fCol] = formationPos;

        if (hasValidPiece(fRow, fCol, board) !== currentColor) continue;

        // 模拟对方移除己方这颗棋子        
        counterBoard[fRow][fCol] = null;

        // 重新评估移除后己方还能获得多少吃子数
        const remainingReward = getMaxFormationRewardAfterMove(row, col, currentColor, counterBoard);
        // 恢复棋盘状态
        counterBoard[fRow][fCol] = {
            color: currentColor,
            isFormation: false
        };
        // 更新最小净收益
        const netReward = remainingReward.maxExtraMoves;
        if (netReward < minNetReward) {
            minNetReward = netReward;
        }
    }

    debugLog(CONFIG.DEBUG, `评估移除位置[${row},${col}]:
    - 初始收益: ${initialReward.maxExtraMoves}
    - 最小净收益: ${minNetReward}
    - 阵型位置: ${JSON.stringify(initialReward.formationPositions)}`);

    return {
        position: [row, col],
        initialReward: initialReward.maxExtraMoves,
        netReward: minNetReward,
        isValid: minNetReward > 0,
        formationPositions: initialReward.formationPositions
    };
}
/**
 * 计算对应color棋手在所有空位上可能获得的总奖励
 * @param {Array<Array>} board - 当前棋盘
 * @param {string} color - 棋子颜色
 * @param {string} currentColor - 当前玩家颜色
 * @returns {Object} 对手可能获得的总奖励信息
 */
function calculateTotalReward(board, color) {
    let totalReward = 0;
    const potentialFormations = new Set(); // 改用 Set 来存储唯一的阵型位置
    let maxThreat = {
        position: null,
        reward: 0,
        fromPosition: null,
        formationPositions: [],
    };

    // 1. 先找出所有空位
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
            if (board[row][col] !== null) continue;

            // 2. 对每个空位计算最大奖励
            const reward = getMaxFormationRewardAfterMove(row, col, color, board);

            if (reward.maxExtraMoves > 0) {
                // 记录形成阵型的所有位置
                reward.formationPositions.forEach(pos => {
                    potentialFormations.add(JSON.stringify(pos));
                });
                totalReward += reward.maxExtraMoves;

                // 更新最大威胁
                if (reward.maxExtraMoves > maxThreat.reward) {
                    maxThreat = {
                        position: [row, col],
                        reward: reward.maxExtraMoves,
                        fromPosition: reward.fromPosition,
                        formationPositions: reward.formationPositions
                    };
                }

                debugLog(CONFIG.DEBUG, `空位[${row},${col}]的威胁:
                - 来源棋子: ${reward.fromPosition}
                - 获得奖励: ${reward.maxExtraMoves}
                - 阵型位置: ${JSON.stringify(reward.formationPositions)}`);
            }
        }
    }

    return {
        totalReward,
        potentialFormations: Array.from(potentialFormations).map(pos => JSON.parse(pos)), // 转回坐标数组
        maxThreat: maxThreat.position ? maxThreat : null
    };
}
function getValidRemovePositions2(currentColor, opponentColor, data) {
    const { board, blackCount, whiteCount } = data;
    const validPositions = [];
    let bestSelfPosition = null;
    let bestOpponentPosition = null;
    let maxSelfExtraMoves = 0;
    const nonFormationPieces = [];
    const diagonalOrDragonPieces = [];
    const squarePositions = [];
    let hasNonFormationPiecesFlag = false;
    const isFirstRemove = isMaxPiecesCount(blackCount, whiteCount);
    let hasNonSquarePiecesFlag = null;
    let equalPositions = [];
    let maxDestroyEffect = -Infinity;
    let bestDestroyPositions = [];

    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
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
                const formationAfterRemove = getMaxFormationRewardAfterMove(row, col, currentColor, board);
                if (formationAfterRemove.maxExtraMoves > maxSelfExtraMoves) {
                    maxSelfExtraMoves = formationAfterRemove.maxExtraMoves;
                    bestSelfPosition = [row, col];
                    debugLog(CONFIG.DEBUG, `更新最佳己方位置：[${row},${col}]，可获得吃子数：${maxSelfExtraMoves}`);
                }

                if (!bestSelfPosition) { // 已经找到一个可以自己形成阵型的位置了，就不再判断对方了
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
                // newBoard[row][col] = null;

                // 修改这部分代码:
                const result = getMaxFormationRewardAfterMove(newRow, newCol, opponentColor, newBoard);

                if (result.maxExtraMoves === 0 || result.maxExtraMoves < 1) {
                    continue;
                }

                // 新增：检查所有对方棋子移动到该位置的最大威胁
                let maxThreat = formationUpdateOpponent.extraMoves;
                for (let r = 0; r < 6; r++) {
                    for (let c = 0; c < 6; c++) {
                        if (hasValidPiece(r, c, newBoard) !== opponentColor) continue;
                        if (r === row && c === col) continue; // 跳过当前移动的棋子

                        // 检查其他棋子是否能移动到同一目标位置
                        let canMoveTo = false;
                        for (const dir of DIRECTIONS.ADJACENT) {
                            if (r + dir.dx === newRow && c + dir.dy === newCol) {
                                canMoveTo = true;
                                break;
                            }
                        }
                        if (!canMoveTo) continue;

                        const testBoard = deepCopy(newBoard);
                        testBoard[r][c] = null;
                        testBoard[newRow][newCol] = { color: opponentColor, isFormation: false };
                        const otherFormation = checkFormation(newRow, newCol, opponentColor, testBoard);
                        if (otherFormation && otherFormation.extraMoves > maxThreat) {
                            maxThreat = otherFormation.extraMoves;
                        }
                    }
                }

                if (maxOpponentExtraMoves > maxThreat) {
                    continue;
                }

                if (maxOpponentExtraMoves === maxThreat) {
                    debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子移动到${newRow},${newCol}后，会形成阵型，但是吃子数同之前的位置:`, bestOpponentPosition);
                    continue;
                }

                if (maxOpponentExtraMoves < maxThreat) {
                    maxOpponentExtraMoves = maxThreat;
                    // 记录新的最大值时，需要重新评估所有位置
                    bestOpponentPosition = null;
                    betterOpponentPosition = null;
                    debugLog(CONFIG.DEBUG, `发现更大的奖励值: ${maxOpponentExtraMoves}, 重置位置评估`);
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

                    // 只用净效果选最佳
                    if (currentDestroyEffect > maxDestroyEffect) {
                        maxDestroyEffect = currentDestroyEffect;
                        bestDestroyPositions = [pos];
                    } else if (currentDestroyEffect === maxDestroyEffect) {
                        bestDestroyPositions.push(pos);
                        // 检查移除后己方是否能形成阵型
                        const selfFormationPossible = getMaxFormationRewardAfterMove(pos[0], pos[1], currentColor, board);
                        if (selfFormationPossible.maxExtraMoves > 0) {
                            debugLog(CONFIG.DEBUG, `移除${pos}后己方可形成阵型，奖励=${selfFormationPossible.maxExtraMoves}`);
                        }
                        // 综合评估位置价值：
                        // 1. 破坏对方阵型的效果
                        // 2. 是否能让己方形成阵型
                        // 3. 周围棋子数量
                        // 寻找阵型上周围棋子最少得那颗

                    }

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
            const reward = getMaxFormationRewardAfterMove(row, col, currentColor, board);
            // 6. 检查己方棋子是否可以移动到该位置形成阵型
            if (reward > maxSelfExtraMoves) {
                bestSelfPosition = [row, col];
                equalPositions = [bestSelfPosition]; // 重置相等位置数组
                maxSelfExtraMoves = reward;
                debugLog(CONFIG.DEBUG, `2-${currentColor}自己可能形成阵型的位置:`, bestSelfPosition);
                continue;
            } else if (reward === maxSelfExtraMoves && reward > 0) {
                {
                    // 如果有多个相等位置，则将其存储在数组中
                    equalPositions.push([row, col]);
                    debugLog(CONFIG.DEBUG, `2-${currentColor}自己可能形成阵型的位置有多个bestSelfPosition:`, equalPositions);
                }

                //如果移除不能阻止对方形成阵型，也不能自己组成阵型，则判断该棋子下一次移动后是否方便组成阵型
                nonFormationPieces.push(piece);

            }
        }

        // 按优先级返回结果
        if (isFirstRemove && bestSelfPosition) {
            // 首次移除优先己方吃子
            debugLog(CONFIG.DEBUG, `1-${currentColor}-isFirstRemove-可能形成阵型的位置:`, bestSelfPosition);
            return [{
                action: 'removing',
                position: bestSelfPosition
            }];
        }
        // 第二次及以后，优先阻止对方吃子
        if (!isFirstRemove && bestDestroyPositions.length > 0) {
            debugLog(CONFIG.DEBUG, `2-${currentColor}-优先阻止对方吃子的位置(净效果最大):`, bestDestroyPositions, maxDestroyEffect);
            return bestDestroyPositions.map(pos => ({
                action: 'removing',
                position: pos
            }));
        }

        // 如果无法阻止对方，则再考虑己方形成阵型
        if (bestSelfPosition) {
            debugLog(CONFIG.DEBUG, `2-${currentColor}-无法阻止对方，选择己方可形成阵型的位置:`, bestSelfPosition);
            return [{
                action: 'removing',
                position: bestSelfPosition
            }];
        }

        // 处理普通移除
        return handleNormalRemove(nonFormationPieces, diagonalOrDragonPieces, board, currentColor, opponentColor);
    }
}
// 抽取处理普通移除的逻辑
function handleNormalRemove(nonFormationPieces, diagonalOrDragonPieces, board, currentColor, opponentColor) {
    const validPositions = [...nonFormationPieces];
    if (validPositions.length === 0 && diagonalOrDragonPieces.length > 0) {
        validPositions.push(...diagonalOrDragonPieces);
    }

    // 优先选择可移动的棋子
    const movablePositions = validPositions.filter(pos => canMove(pos[0], pos[1], board));

    if (movablePositions.length > 0) {
        let finalPositions = [];
        movablePositions.forEach(pos => {
            finalPositions.push(
                {
                    action: 'removing',
                    position: pos
                }
            );
        });
        return finalPositions;
    }

    // 如果没有可移动的棋子，则选择最少对方棋子的位置
    const leastOpponentPosition = selectLeastOpponentNeighbor(validPositions, board, currentColor, opponentColor);
    return [{
        action: 'removing',
        position: leastOpponentPosition
    }];
}

/**
 * 选择周围对手棋子最少的位置
 * @param {Array<Array>} validPositions - 有效的位置列表
 * @param {Array<Array>} board - 当前棋盘
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {{row: number, col: number}} 返回最优位置
 */
function selectLeastOpponentNeighbor(validPositions, board, currentColor, opponentColor) {
    let minOpponentCount = Infinity;
    let bestPosition = validPositions[0];

    for (const position of validPositions) {
        let opponentCount = 0;
        const [row, col] = position;

        // 检查8个相邻位置的对手棋子数量
        for (const [dx, dy] of DIRECTIONS.NEIGHBORS) {
            const newRow = row + dx;
            const newCol = col + dy;

            if (hasValidPiece(newRow, newCol, board) === opponentColor) {
                opponentCount++;
            }
        }

        // 记录最少对手棋子的位置
        if (opponentCount < minOpponentCount) {
            minOpponentCount = opponentCount;
            bestPosition = position;

            // 如果已经找到没有对手棋子的位置，直接返回
            if (opponentCount === 0) {
                debugLog(CONFIG.DEBUG, `找到周围无对手棋子的位置: [${row},${col}]`);
                return position;
            }
        }
    }

    debugLog(CONFIG.DEBUG, `选择周围对手棋子最少(${minOpponentCount}个)的位置: `, bestPosition);
    return bestPosition;
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
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
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
        // 先筛选奖励最大的
        const maxReward = Math.max(...moves.selfFormationMoves.map(m => m.value));
        const maxRewardMoves = moves.selfFormationMoves.filter(m => m.value === maxReward);
        // 在奖励最大的中再选给对方机会最少的
        finalMove = selectBestMoves(maxRewardMoves, 'giveOpponent', true)[0];
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
    const preventResult = getMaxFormationRewardAfterMove(newRow, newCol, opponentColor, tempBoard);
    const preventOpponent = preventResult.maxExtraMoves;

    // 3. 检查移动后给对方带来的吃子机会
    const giveResult = getMaxFormationRewardAfterMove(row, col, opponentColor, tempBoard);
    const giveOpponent = giveResult.maxExtraMoves;
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

// TODO 该function对多阵型的处理不太好，可能会导致对方形成多个阵型，需要优化
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