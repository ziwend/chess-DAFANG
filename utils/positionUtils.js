import { DIRECTIONS, CONFIG, WEIGHTS } from './gameConstants.js';
import { checkFormation, checkSquare, hasNonFormationPieces, hasNonSquarePieces } from './formationChecker.js';
import { isBoardWillFull, isInBoard, hasValidPiece } from './boardUtils.js';
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

        if (evaluationResult.positions.length > 0) {
            // 返回所有最佳位置对应的放置指令
            return evaluationResult.positions.map(position => ({
                action: 'placing',
                position: position
            }));
        }

    }

    // 获取所有可用位置
    return bestPlaces.map(pos => ({
        action: 'placing',
        position: pos
    }));
}
function getFirstPlacePositions() {
    return DIRECTIONS.CORNERPOSITIONS.map(({ pos, adjacent }) => ({
        action: 'placing',
        position: pos
    }));
}

function getLastPosition(board) {
    const freePositions = [];
    for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
        for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
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

function checkImmediateWin(board, currentColor, opponentColor, availablePositions, extraMoves) {
    const finalPositions = [];
    let { bestSelfPosition, bestOpponentPosition } = evaluatePositions(board, currentColor, opponentColor, availablePositions);


    // 1、优先判断放置在己方棋子周围是否会组成阵型
    if (bestSelfPosition && !extraMoves > 0) {
        if (Array.isArray(bestSelfPosition[0])) {
            // 处理多个相等位置的情况
            if (bestSelfPosition.length > 1) {
                bestSelfPosition = selectPositionsByWeight(bestSelfPosition);
            }
            return bestSelfPosition.map(pos => ({
                action: 'placing',
                position: pos
            }));
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
            return bestOpponentPosition.map(pos => ({
                action: 'placing',
                position: pos
            }));
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
    // 计算每个位置的权重
    const positionsWithWeights = positions.map(pos => ({
        position: pos,
        weight: WEIGHTS[pos[0]][pos[1]]
    }));

    // 找出最大权重
    const maxWeight = Math.max(...positionsWithWeights.map(p => p.weight));

    // 返回权重等于最大权重的所有位置
    const bestPositions = positionsWithWeights
        .filter(p => p.weight === maxWeight)
        .map(p => p.position);

    return bestPositions;
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
function evaluatePositions(board, currentColor, opponentColor, availablePositions) {
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    let bestSelfPosition = null;
    let bestOpponentPosition = null;
    let equalPositions = []; // 用于存储多个相等的位置
    let equalPositionsOpponent = [];

    for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
        for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
            const result = getBestFormationPosition(row, col, board, currentColor, opponentColor, availablePositions);
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
function getBestFormationPosition(row, col, board, currentColor, opponentColor, availablePositions) {
    let bestSelfPosition = null;
    let bestOpponentPosition = null;
    let maxSelfExtraMoves = 0;
    let maxOpponentExtraMoves = 0;
    let hasFoundOpponentPiece = false;
    // 未对board做添加或移除棋子的操作
    if (board[row][col] === null) {
        for (let [deltaRow, deltaCol] of DIRECTIONS.NEIGHBORS) {
            const neighborRow = row + deltaRow;
            const neighborCol = col + deltaCol;

            // 1. 检查是否在棋盘内
            if (!isInBoard(neighborRow, neighborCol)) {
                continue;
            }

            // 2. 获取邻居位置的棋子
            const neighborPiece = board[neighborRow][neighborCol];
            if (!neighborPiece) {
                continue;
            }

            // 3. 记录可用位置
            availablePositions.add(JSON.stringify([row, col]));

            // 4. 处理己方棋子
            if (neighborPiece.color === currentColor) {
                const selfFormation = checkFormation(row, col, currentColor, board);
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
                const opponentFormation = checkFormation(row, col, opponentColor, board);
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
 * 评估放置位置并模拟移除对方棋子的综合收益，from getValidPlacePositions
 * @param {Array<Array<number>>} bestPlaces - 候选放置位置数组 
 * @param {Array<Array>} board - 当前棋盘
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {Object} 最佳放置位置及其收益
 */
function evaluatePlaceAndRemoveReward(bestPlaces, board, currentColor, opponentColor) {
    let maxTotalExtraMoves = 0;
    let bestPositions = []; // 改为数组存储所有最佳位置

    for (const pos of bestPlaces) {
        const [row, col] = pos;
        let currentTotalExtraMoves = 0;

        board[row][col] = {
            color: currentColor,
            isFormation: false
        };

        for (let r = 0; r < CONFIG.BOARD_SIZE; r++) {
            for (let c = 0; c < CONFIG.BOARD_SIZE; c++) {
                if (hasValidPiece(r, c, board) !== opponentColor) continue;
                if (board[r][c].isFormation) {
                    debugLog(false, `跳过阵型中的棋子 [${r},${c}]`);
                    continue;
                }
                // 模拟移除对方棋子r, c的己方收益，恢复时要恢复成对方的棋子
                const reward = getMaxFormationRewardAfterMove(r, c, currentColor, board);

                if (reward.maxExtraMoves > 0) {
                    currentTotalExtraMoves += reward.maxExtraMoves;
                }
            }
        }

        if (currentTotalExtraMoves > maxTotalExtraMoves) {
            maxTotalExtraMoves = currentTotalExtraMoves;
            bestPositions = [pos]; // 重置数组，只包含当前位置

        } else if (currentTotalExtraMoves === maxTotalExtraMoves) {
            bestPositions.push(pos); // 添加相同收益的位置
        }
        // 恢复棋盘
        board[row][col] = null;
    }

    debugLog(CONFIG.DEBUG, `\n1、按照放置后对己方阵型的影响评估:
    - 最大总收益: ${maxTotalExtraMoves}
    - 最佳位置数: ${bestPositions.length}
    - 候选位置数: ${bestPlaces.length}
    - 最佳位置列表:`, bestPositions);

    if (bestPositions.length > 1) {
        // 如果有多个相同收益的位置，使用权重过滤
        bestPositions = selectPositionsByWeight(bestPositions);
        debugLog(CONFIG.DEBUG, '2、按权重过滤后的bestPlaces', bestPositions);
    }
    if (bestPositions.length > 1) {
        bestPositions = filterPositionsByAdjacentPieces(
            bestPositions,
            board,
            currentColor,
            opponentColor
        );
    }

    return {
        positions: bestPositions, // 返回所有最佳位置
        totalReward: maxTotalExtraMoves
    };
}

/**
 * 根据相邻棋子数量过滤位置
 * @param {Array<Array<number>>} positions - 待过滤的位置列表
 * @param {Array<Array>} board - 当前棋盘
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {Array<Array<number>>} 过滤后的位置列表
 */
function filterPositionsByAdjacentPieces(positions, board, currentColor, opponentColor) {
    // 1. 计算每个位置的相邻棋子数量
    const positionsWithCount = positions.map(pos => {
        const [row, col] = pos;
        const { countAdjacent, countAdjacentOpponent } = countAdjacentPieces(
            row, col, currentColor, opponentColor, board
        );
        return {
            position: pos,
            selfCount: countAdjacent,
            opponentCount: countAdjacentOpponent
        };
    });

    // 2. 找出己方邻子最多的数量
    const maxSelfCount = Math.max(...positionsWithCount.map(p => p.selfCount));
    let filteredPositions = positionsWithCount.filter(p => p.selfCount === maxSelfCount);

    // 3. 如果还有多个位置，按对方邻子数量筛选
    if (filteredPositions.length > 1) {
        const maxOpponentCount = Math.max(...filteredPositions.map(p => p.opponentCount));
        filteredPositions = filteredPositions.filter(p => p.opponentCount === maxOpponentCount);
    }

    debugLog(CONFIG.DEBUG, `3、按相邻棋子过滤:
        - 初始位置数: ${positions.length}
        - 己方邻子最多数: ${maxSelfCount}
        - 对方邻子最多数: ${filteredPositions[0]?.opponentCount}
        - 过滤后位置数: ${filteredPositions.length}
        - 最终位置: ${JSON.stringify(filteredPositions.map(p => p.position))}
    `);

    return filteredPositions.map(p => p.position);
}
/**
 * 计算指定位置周边的color棋子移动到该位置后可获得的最大奖励
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

    let initialPieceColor = null;
    let initialPieceFormatiion = false;
    if (board[r][c]) {
        initialPieceColor = board[r][c].color;
        initialPieceFormatiion = board[r][c].isFormation
    }

    // 检查周围所有可能移动到该位置的己方棋子
    for (const dir of DIRECTIONS.ADJACENT) {
        const srcRow = r + dir.dx;
        const srcCol = c + dir.dy;

        if (!isInBoard(srcRow, srcCol)) continue;

        if (hasValidPiece(srcRow, srcCol, board) !== color) continue;

        // 暂存srcRow, srcCol棋子状态
        const formationFlag = board[srcRow][srcCol].isFormation;

        // 模拟移动
        board[srcRow][srcCol] = null;
        // 检查是否形成有效阵型
        const formation = checkFormation(r, c, color, board);
        if (formation && formation.extraMoves > maxExtraMoves) {
            maxExtraMoves = formation.extraMoves;
            maxFormationPositions = formation.formationPositions;
            fromPosition = [srcRow, srcCol];  // 记录来源位置
        }
        // 恢复棋盘状态
        board[srcRow][srcCol] = {
            color: color,  // 确保设置 color
            isFormation: formationFlag
        };
        
    }

    if (initialPieceColor) { // 恢复记录的原始棋子状态
        board[r][c] = {
            color: initialPieceColor,  // 确保设置 color
            isFormation: initialPieceFormatiion
        };
    } else {
        board[r][c] = null;
    }

    return {
        maxExtraMoves,
        formationPositions: maxFormationPositions,
        fromPosition  // 返回移动的源棋子位置
    };
}
function getValidRemovePositions(currentColor, opponentColor, data) {
    const { board, isExchangeRemoving } = data;
    const isFirstRemove = isExchangeRemoving;
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

            // TODO 该棋子在阵型中，先不考虑特殊场景，不能移除
            if (!board[row][col].isFormation) {
                // 对方的最佳移动棋子有可能在阵型中
                const initialPieceFormatiion = board[row][col].isFormation;
                board[row][col] = null; // 移除对方棋子
                // 2. 对空位计算最大奖励
                const reward = getMaxFormationRewardAfterMove(toRow, toCol, opponentColor, board);
                // 恢复棋盘状态
                board[row][col] = {
                    color: opponentColor,
                    isFormation: initialPieceFormatiion
                };
                if (reward.maxExtraMoves < maxThreat_reward) {
                    maxOpponentExtraMoves = maxThreat_reward - reward.maxExtraMoves;
                    bestOpponentPosition = [row, col]; // 记录破坏对方阵型的最佳位置
                }
            }
            debugLog(CONFIG.DEBUG, 'formationPositions-board',board);
            // 还要对比一下阵型中的棋子移除能否达到更好的破坏效果，或者是相同的效果
            for (const pos of totalRewardResult.maxThreat.formationPositions) {
                const [newRow, newCol] = pos;
                // 先检查是否为null
                if (board[newRow][newCol] === null) continue;

                // TODO 该棋子在阵型中，先不考虑特殊场景，不能移除
                if (board[newRow][newCol].isFormation) continue;

                board[newRow][newCol] = null; // 移除对方棋子newRow, newCol计算对空位toRow, toCol的影响
                const rewardAfterRemove = getMaxFormationRewardAfterMove(toRow, toCol, opponentColor, board);
                // 恢复对方棋子状态
                board[newRow][newCol] = {
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
                    const hasAdjacentPieceFlagOld = hasAdjacentPiece(oldRow, oldCol, opponentColor, board);
                    const hasAdjacentPieceFlagNew = hasAdjacentPiece(newRow, newCol, opponentColor, board);
                    if (hasAdjacentPieceFlagOld && !hasAdjacentPieceFlagNew) {
                        // 说明新位置周围没有对方棋子，且旧位置有对方棋子，则新位置更优
                        bestOpponentPosition = pos;
                        continue;
                    } else if (!hasAdjacentPieceFlagOld && hasAdjacentPieceFlagNew) {
                        // 说明新位置周围有对方棋子，且旧位置没有对方棋子，则旧位置更优
                        continue;
                    }
                    // 说明新位置和旧位置周围都有对方棋子，或者都没有对方棋子，则需要进一步对比，比如对比下移除新旧位置后己方能否形成阵型及获得的最大吃子数
                    const rewardAfterRemoveOld = getMaxFormationRewardAfterMove(oldRow, oldCol, currentColor, board);

                    const rewardAfterRemoveNew = getMaxFormationRewardAfterMove(newRow, newCol, currentColor, board);
                    debugLog(CONFIG.DEBUG, 'getMaxFormationRewardAfterMove-board',board);
                    if (rewardAfterRemoveOld.maxExtraMoves > rewardAfterRemoveNew.maxExtraMoves) {
                        // 说明旧位置移除后己方能形成阵型及获得的最大吃子数更多，则旧位置更优
                        continue;
                    } else if (rewardAfterRemoveOld.maxExtraMoves < rewardAfterRemoveNew.maxExtraMoves) {
                        // 说明新位置移除后己方能形成阵型及获得的最大吃子数更多，则新位置更优
                        bestOpponentPosition = pos;
                    } else if (rewardAfterRemoveOld.maxExtraMoves === rewardAfterRemoveNew.maxExtraMoves && rewardAfterRemoveOld.maxExtraMoves > 0) {
                        // 在评估新旧位置时
                        const impactComparison = comparePositionsImpact(
                            bestOpponentPosition,
                            pos,
                            board,
                            opponentColor
                        );
                        debugLog(CONFIG.DEBUG, 'comparePositionsImpact-board',board);
                        if (impactComparison > 0) {
                            bestOpponentPosition = pos;
                        } else if (impactComparison === 0) {
                            debugLog(CONFIG.DEBUG, `TODO-bestOpponentPosition-新旧位置移除后对棋盘局势影响相等， 和新位置是等效的，待考虑如何处理：`, pos, `旧位置=${bestOpponentPosition}`);
                        }
                    }

                    // TODO 继续对比一下，比如对方通过移动可以形成的最大阵型中的所有棋子都已在阵型中，待考虑破坏对方其他阵型，totalRewardResult=totalRewardResultOld
                    // bestOpponentPosition = pos;
                }
            }
debugLog(CONFIG.DEBUG, 'bestOpponentPosition-board',board);
            if (bestOpponentPosition && !isFirstRemove) {
                return [{
                    action: 'removing',
                    position: bestOpponentPosition
                }];
            } else {
                if (maxThreat_reward === totalRewardResult.totalReward) {
                    // 说明对方通过移动可以形成的最大阵型中的所有棋子都已在阵型中，如何处理待考虑，是否还有其他阵型可以移除
                    debugLog(CONFIG.DEBUG, `对方通过移动可以形成的最大阵型中的所有piece都已在阵型中，同时没有其他阵型可以移除，totalRewardResult=`, totalRewardResult);
                } else {
                    debugLog(CONFIG.DEBUG, `对方通过移动可以形成的最大阵型中的所有piece都已在阵型中，待考虑破坏对方其他阵型，totalRewardResult=`, totalRewardResult);
                }
            }
        }
    }
    // 如果走到这里，说明根据当前棋盘状态，对方一个阵型都不能形成，那么主要考虑吃子是否便于己方形成阵型; 
    for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
        for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
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
                        debugLog(CONFIG.DEBUG, '对方所有piece都为squarepieces', squarePositions);
                        return squarePositions.map(pos => ({
                            action: 'removing',
                            position: pos
                        }));
                    }
                    continue;
                }
                diagonalOrDragonPieces.push([row, col]);
                continue;
            }

            // 如果走到这里说明已经没有特殊棋子需要处理了

            // 第一次移除时，优先考虑移除后己方可以获得的吃子机会，即吃掉对方吃子机会，比较特殊，后面单独处理，先处理正常的移除逻辑，即移除后对方只能走棋来形成阵型或阻止己方形成阵型


            if (isFirstRemove) {
                // 第一次移除时，优先考虑移除后己方可以获得的吃子机会，即吃掉对方获得的吃子机会，不追求最大值，但要求对方移除一颗棋子后不能完全破坏阵型
                // 比如，移除对方第一个位置可以吃5颗子，但是对方移除1颗己方棋子就被破坏了，净剩为0，而移除第二个位置，可以吃2颗棋子，对方移除1颗己方棋子后，己方还是能吃1颗，则选第二个位置

                // 评估所有可能的对方棋子row, col
                const evaluation = evaluateFirstRemovePosition(row, col, board, currentColor, opponentColor);
                if (evaluation.isValid) {
                    evaluations.push(evaluation);
                } else {
                    // 没有形成阵型，暂时先记录一下位置
                    nonFormationPieces.push([row, col]);
                }
                continue;
            }

            // 模拟移除对方棋子row,col
            const formationAfterRemove = getMaxFormationRewardAfterMove(row, col, currentColor, board);

            if (formationAfterRemove.maxExtraMoves > maxSelfExtraMoves) {
                maxSelfExtraMoves = formationAfterRemove.maxExtraMoves;
                bestSelfPosition = [row, col];
                debugLog(CONFIG.DEBUG, `更新最佳己方位置，可获得吃子数：${maxSelfExtraMoves}`, bestSelfPosition);
                continue;
            } else if (formationAfterRemove.maxExtraMoves === maxSelfExtraMoves && maxSelfExtraMoves > 0) {
                // 如果相等，则需要对比一下是否有更好的选择，比如新位置周围没有对方棋子
                const [r, c] = bestSelfPosition;
                const hasAdjacentPieceFlagOld = hasAdjacentPiece(r, c, opponentColor, board);
                const hasAdjacentPieceFlagNew = hasAdjacentPiece(row, col, opponentColor, board);
                if (hasAdjacentPieceFlagOld && !hasAdjacentPieceFlagNew) {
                    bestSelfPosition = [row, col];
                    debugLog(CONFIG.DEBUG, `周围没有对方的新位置，可获得吃子数：${maxSelfExtraMoves}`, bestSelfPosition);
                    continue;
                } else if (!hasAdjacentPieceFlagOld && hasAdjacentPieceFlagNew) {
                    // 说明新位置周围有对方棋子，且旧位置没有对方棋子，则旧位置更优
                    continue;
                } else if (hasAdjacentPieceFlagOld && hasAdjacentPieceFlagNew) {
                    // 如果都有对方棋子，则对比选择邻子数量最少的那个 ;
                    // 获取两个位置的相邻棋子信息
                    const oldPosCount = countAdjacentPieces(bestSelfPosition[0], bestSelfPosition[1], currentColor, opponentColor, board);
                    const newPosCount = countAdjacentPieces(row, col, currentColor, opponentColor, board);

                    if (oldPosCount.countAdjacentOpponent > newPosCount.countAdjacentOpponent) {
                        // 新位置周围对手棋子更少，选择新位置
                        bestSelfPosition = [row, col];
                        debugLog(CONFIG.DEBUG, `选择新位置[${row},${col}]，对手邻子更少(${newPosCount.countAdjacentOpponent} < ${oldPosCount.countAdjacentOpponent})`);
                    } else if (oldPosCount.countAdjacentOpponent < newPosCount.countAdjacentOpponent) {
                        continue;
                    }
                }

                // 说明新位置和旧位置周围都有对方棋子，或者都没有对方棋子，则需要进一步对比造成对方吃子机会增减的多少
                const impactComparison = comparePositionsImpact(
                    bestSelfPosition,
                    [row, col],
                    board,
                    opponentColor
                );

                if (impactComparison > 0) {
                    bestSelfPosition = [row, col];
                    continue;
                } else if (impactComparison === 0) {
                    debugLog(CONFIG.DEBUG, `TODO-新旧位置周围都有对方piece，或者都没有对方piece，移除后对棋盘局势影响又相等， 待考虑如何处理，新位置=`, [row, col], `旧位置=${bestSelfPosition}`);
                    continue;
                }

            }
            // 没有形成阵型，暂时先记录一下位置
            nonFormationPieces.push([row, col]);
        }
    }

    // 棋盘遍历结束，按净收益降序对己方可以形成阵型的位置进行排序，仅用于第一次移除
    if (evaluations.length > 0) {
        evaluations.sort((a, b) => b.netReward - a.netReward);
        // 找出净收益最大的所有位置
        const maxNetReward = evaluations[0].netReward;
        const bestPositions = evaluations.filter(e => e.netReward === maxNetReward);

        debugLog(CONFIG.DEBUG, `首次移除评估结果:
                        - 候选位置数: ${evaluations.length}
                        - 最大净收益: ${maxNetReward}
                        - 最佳位置数: `,bestPositions);

        bestSelfPosition = filterBestPositionsInFirstRemove(bestPositions, board, currentColor, opponentColor);


    }
    // 使用统一的返回逻辑，处理己方可形成阵型或对方可能形成阵型的位置
    const bestPosition = handleSpecialRemove(isFirstRemove, bestSelfPosition, bestOpponentPosition);
    if (bestPosition) {
        return bestPosition;
    }

    // 处理普通移除，移除这些棋子，既不能破坏对方形成阵型，也不会方便自己形成阵型
    return handleNormalRemove(nonFormationPieces, diagonalOrDragonPieces, board, currentColor, opponentColor);
}

/**
 * 根据是否是第一次移除返回最佳位置
 * @param {boolean} isFirstRemove - 是否是第一次移除
 * @param {Array} bestSelfPosition - 己方最佳位置
 * @param {Array} bestOpponentPosition - 对手最佳位置
 * @returns {Array} 返回移除指令数组
 */
function handleSpecialRemove(isFirstRemove, bestSelfPosition, bestOpponentPosition) {
    // 第一次移除优先己方吃子
    if (isFirstRemove && bestSelfPosition) {
        debugLog(CONFIG.DEBUG, `1.首次移除-优先己方吃子位置:`, bestSelfPosition);
        return [{
            action: 'removing',
            position: bestSelfPosition
        }];
    }

    // 非首次移除优先阻止对手
    if (bestOpponentPosition) {
        debugLog(CONFIG.DEBUG, `2.非首次移除-优先阻止对手位置:`, bestOpponentPosition);
        return [{
            action: 'removing',
            position: bestOpponentPosition
        }];
    }

    // 如果没有对手威胁，考虑己方阵型
    if (bestSelfPosition) {
        debugLog(CONFIG.DEBUG, `3.无对手威胁-选择己方阵型位置:`, bestSelfPosition);
        return [{
            action: 'removing',
            position: bestSelfPosition
        }];
    }

    return null;
}

function handleNormalRemove(nonFormationPieces, diagonalOrDragonPieces, board, currentColor, opponentColor) {
    let validPositions = [...nonFormationPieces];
    if (validPositions.length === 0 && diagonalOrDragonPieces.length > 0) {
        validPositions.push(...diagonalOrDragonPieces);
    }

    // 优先选择可移动的棋子，然后再筛选movablePositions中向周围空位移动可阻止己方形成阵型的位置
    validPositions = validPositions.filter(pos => {
        let canMoveFlag = false;
        const [row, col] = pos;
        for (const dir of DIRECTIONS.ADJACENT) {
            const newRow = row + dir.dx;
            const newCol = col + dir.dy;
            if (!isValidMove(newRow, newCol, board)) continue;
            // 对空位newRow, newCol进行计算
            const reward = getMaxFormationRewardAfterMove(newRow, newCol, currentColor, board);
            if (reward.maxExtraMoves > 0) {
                debugLog(CONFIG.DEBUG, `\n评估移动: [${row},${col}] -> [${newRow},${newCol}]会阻止己方形成阵型，优先删除`);
                return true;
            }
            // 找到一个空位，该空位己方不能形成阵型，对应的对方棋子可以移除
            canMoveFlag = true;
        }
        return canMoveFlag;
    }
    );
    debugLog(CONFIG.DEBUG, '从普通移除中找到的movablePositionsWithBlocking=', validPositions);
    if (validPositions.length === 1) {
        return [{
            action: 'removing',
            position: validPositions[0]
        }];
    }

    // 如果没有可移动的棋子，或者可移动的棋子不唯一，则选择最少对方棋子的位置
    const leastOpponentPositions = selectLeastOpponentNeighbor(validPositions, board, currentColor, opponentColor);

    // 返回所有最优位置对应的移除指令
    return leastOpponentPositions.map(position => ({
        action: 'removing',
        position: position
    }));
}

/**
 * 比较两个位置移除后对棋盘局势的影响
 * @param {Array} oldPos - 旧位置 [row, col]
 * @param {Array} newPos - 新位置 [row, col]
 * @param {Array} board - 当前棋盘
 * @param {string} color - 评估目标颜色
 * @returns {number} 返回 -1:新位置更好, 0:相等, 1:旧位置更好
 */
function comparePositionsImpact(oldPos, newPos, board, color) {

    const [oldRow, oldCol] = oldPos;
    const [newRow, newCol] = newPos;

    // 1. 计算旧位置的影响
    board[oldRow][oldCol] = null;
    const totalRewardResultOld = calculateTotalReward(board, color);
    // 恢复棋盘状态
    board[oldRow][oldCol] = {
        color: color,
        isFormation: false
    };

    // 2. 计算新位置的影响
    board[newRow][newCol] = null;
    const totalRewardResultNew = calculateTotalReward(board, color);
    // 恢复棋盘状态
    board[newRow][newCol] = {
        color: color,
        isFormation: false
    };

    // 3. 比较影响
    if (totalRewardResultOld.totalReward > totalRewardResultNew.totalReward) {
        return 1; // 旧位置给对方机会更多，新位置更好
    } else if (totalRewardResultOld.totalReward < totalRewardResultNew.totalReward) {
        return -1; // 新位置给对方机会更多，旧位置更好
    }
    return 0; // 影响相等
}
/**
 * 评估首次移除的净收益
 * @param {number} row - 待评估的移除对方棋子位置行
 * @param {number} col - 待评估的移除对方棋子位置列
 * @param {Array} board - 当前棋盘
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {Object} 评估结果
 */
function evaluateFirstRemovePosition(row, col, board, currentColor, opponentColor) {
    // 1. 首先评估移除row,col对应对方棋子后己方能获得的最大吃子数
    const initialReward = getMaxFormationRewardAfterMove(row, col, currentColor, board);

    if (initialReward.maxExtraMoves === 0) {
        return {
            position: [row, col],
            initialReward: 0,
            netReward: 0,
            minNetRewardPositions: [],
            isValid: false
        };
    }

    // 2. 然后评估对方通过移除一颗己方棋子fromRow, fromCol后能破坏多少我方收益
    const [fromRow, fromCol] = initialReward.fromPosition;
    board[fromRow][fromCol] = null;
    const rewardAfterRemove = getMaxFormationRewardAfterMove(row, col, currentColor, board);
    // 恢复棋盘状态
    board[fromRow][fromCol] = {
        color: currentColor,
        isFormation: false
    };
    let minNetReward = rewardAfterRemove.maxExtraMoves; // 最小净收益初始化为移除要移动的那颗棋子后的
    let minNetRewardPosition = [initialReward.fromPosition]; // 改为数组，初始包含来源位置

    // 模拟对方移除己方每颗参与阵型的棋子
    for (const formationPos of initialReward.formationPositions) {
        if (!Array.isArray(formationPos)) continue;
        const [fRow, fCol] = formationPos;

        if (hasValidPiece(fRow, fCol, board) !== currentColor) continue;

        // TODO 如果己方这颗棋子已经在阵型中则不能移除，除非自己所有旗子都在阵型中,由于首次这样的概率很低，暂不考虑
        if (board[fRow][fCol].isFormation) continue;

        // 模拟对方移除己方这颗棋子fRow][fCol        
        board[fRow][fCol] = null;

        // 重新评估移除后己方还能获得多少吃子数
        const remainingReward = getMaxFormationRewardAfterMove(row, col, currentColor, board);
        // 恢复棋盘己方棋子fRow][fCol
        board[fRow][fCol] = {
            color: currentColor,
            isFormation: false
        };

        // 更新最小净收益及其对应位置
        const netReward = remainingReward.maxExtraMoves;
        if (netReward < minNetReward) {
            minNetReward = netReward;
            minNetRewardPosition = [formationPos]; // 重置数组，只包含当前位置
        } else if (netReward === minNetReward) {
            minNetRewardPosition.push([fRow, fCol]); // 如果相等，即便是阵型完全被破坏，netReward=0也要比较是否有更好的位置

        }
    }

    return {
        position: [row, col],
        initialReward: initialReward.maxExtraMoves,
        netReward: minNetReward,
        minNetRewardPosition: minNetRewardPosition, // 新增：返回导致最小净收益的位置
        isValid: true,
        formationPositions: initialReward.formationPositions
    };
}

/**
 * 从等净收益的位置中筛选最佳的移除位置
 * @param {Array} bestPositions - 具有相同最大净收益的位置列表
 * @param {Array} board - 当前棋盘状态
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {Array} 移除位置 [row, col]
 */
function filterBestPositionsInFirstRemove(bestPositions, board, currentColor, opponentColor) {
    // 1. 筛选掉minNetRewardPosition中对方可形成阵型的位置
    let filteredPositions = bestPositions.filter(pos => {
        // 检查该位置的所有minNetRewardPosition

        for (const minPos of pos.minNetRewardPosition) {
            const [row, col] = minPos;
            // 模拟移除该位置，检查对方是否能形成阵型
            board[row][col] = null;
            // 检查所有空位
            for (let r = 0; r < 6; r++) {
                for (let c = 0; c < 6; c++) {
                    if (board[r][c] !== null) continue;
                    // 对空位r,c
                    const reward = getMaxFormationRewardAfterMove(r, c, opponentColor, board);
                    if (reward.maxExtraMoves > 0) {
                        // 对方可以形成阵型，排除此位置
                        debugLog(CONFIG.DEBUG, `排除位置${pos.position}，因为移除${minPos}后对方可在${[r, c]}形成阵型`);
                        return false;
                    }
                }
            }
            // 恢复棋盘状态
            board[row][col] = {
                color: currentColor,
                isFormation: false
            };
        }
        return true;
    });
    if (filteredPositions.length === 0) { // 全部被排除说明此筛选无效，换下面的方式
        filteredPositions = bestPositions;
    }
    // 2. 如果还有多个位置，评估哪个造成的己方伤害最小
    if (filteredPositions.length > 1) {
        let maxSelfReward = -Infinity;
        let bestPosition = null;

        for (const pos of filteredPositions) {
            let minSelfReward = Infinity;


            // 对每个minNetRewardPosition评估对己方的影响
            for (const minPos of pos.minNetRewardPosition) {
                const [row, col] = minPos;
                board[row][col] = null;
                const selfReward = calculateTotalReward(board, currentColor);
                board[row][col] = {
                    color: currentColor,
                    isFormation: false
                };

                // 记录这个位置的最小己方收益
                if (selfReward.totalReward < minSelfReward) {
                    minSelfReward = selfReward.totalReward;
                }
            }

            // 选择最小己方收益最大的位置
            if (minSelfReward > maxSelfReward) {
                maxSelfReward = minSelfReward;
                bestPosition = pos;
                debugLog(CONFIG.DEBUG, `更新最佳位置${pos.position}，最小己方收益=${minSelfReward}`);
            } else if (minSelfReward === maxSelfReward) {
                debugLog(CONFIG.DEBUG, `保留位置${pos.position}，最小己方收益=${minSelfReward}, 待考虑这个位置对比以前的位置：`, bestPosition);
            }
        }

        return bestPosition ? bestPosition.position : null;
    } else if (filteredPositions.length === 1) {
        return filteredPositions[0].position;
    }

    // 3. 如果所有位置都被排除，返回null
    return null;
}

/**
 * 计算对应color棋手在所有空位row, col上可能获得的总奖励
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
    for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
        for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
            if (board[row][col] !== null) continue;

            // 2. 对每个空位row, col计算最大奖励
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
            }
        }
    }

    return {
        totalReward,
        potentialFormations: Array.from(potentialFormations).map(pos => JSON.parse(pos)), // 转回坐标数组
        maxThreat: maxThreat.position ? maxThreat : null
    };
}

/**
 * 选择周围对手棋子最少的所有位置
 * @param {Array<Array>} validPositions - 有效的位置列表
 * @param {Array<Array>} board - 当前棋盘
 * @param {string} currentColor - 当前玩家颜色
 * @param {string} opponentColor - 对手颜色
 * @returns {Array<Array<number>>} 返回所有最优位置
 */
function selectLeastOpponentNeighbor(validPositions, board, currentColor, opponentColor) {
    let minOpponentCount = Infinity;
    let bestPositions = []; // 改为数组存储所有最优位置

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

        // 更新最优位置列表
        if (opponentCount < minOpponentCount) {
            minOpponentCount = opponentCount;
            bestPositions = [position]; // 重置为新的最优位置

            if (opponentCount === 0) {
                debugLog(CONFIG.DEBUG, `找到周围无对手棋子的位置: [${row},${col}]`);
            }
        } else if (opponentCount === minOpponentCount) {
            bestPositions.push(position); // 添加相同数量的位置
            debugLog(CONFIG.DEBUG, `找到相同数量对手棋子的位置: [${row},${col}]，数量: ${opponentCount}`);
        }
    }

    debugLog(CONFIG.DEBUG, `选择周围对手棋子最少(${minOpponentCount}个)的位置列表: `, bestPositions);
    return bestPositions;
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
    for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
        for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
            if (hasValidPiece(row, col, board) !== currentColor) continue;

            for (const dir of DIRECTIONS.ADJACENT) {
                const newRow = row + dir.dx;
                const newCol = col + dir.dy;
                if (!isValidMove(newRow, newCol, board)) continue;

                debugLog(false, `\n评估己方棋子移动到空位: [${row},${col}] -> [${newRow},${newCol}]`);

                const evaluation = evaluateMoveValue(row, col, newRow, newCol, currentColor, opponentColor, board);

                debugLog(false, `移动评估结果:`, {
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
                    moves.selfFormationMoves.push({
                        move,
                        value: evaluation.selfFormation,
                        giveOpponent: evaluation.giveOpponent
                    });
                    continue;
                }

                // 2. 检查是否能阻止对方获得机会
                if (evaluation.preventOpponent > 0) {
                    moves.preventOpponentMoves.push({
                        move,
                        preventValue: evaluation.preventOpponent,
                        giveOpponent: evaluation.giveOpponent
                    });
                    continue;
                }

                // 3. 检查是否是安全移动
                if (moves.selfFormationMoves.length === 0 && moves.preventOpponentMoves.length === 0 && evaluation.giveOpponent === 0) {

                    // 1. 评估移动row, col对应己方旗子到空位newRow, newCol后是否能在下次移动形成阵型
                    const nextMoveFormations = evaluateNextMoveFormations(row, col, newRow, newCol, currentColor, opponentColor, board);

                    // 2. 评估这个位置是否是对方想要的位置
                    const opponentDesire = evaluateOpponentDesire(newRow, newCol, currentColor, opponentColor, board);

                    // 3. 评估位置的邻接棋子情况
                    const adjacentInfo = evaluateAdjacentPieces(newRow, newCol, currentColor, opponentColor, board);

                    moves.safeMoves.push({
                        move,
                        nextMoveFormations,
                        opponentDesire,
                        adjacentInfo
                    });
                    continue;
                }

                // 4. 记录风险移动
                debugLog(CONFIG.DEBUG, `风险移动，会给对方带来${evaluation.giveOpponent}的机会`, move);
                moves.worstMoves.push({
                    move,
                    giveOpponent: evaluation.giveOpponent
                });
            }
        }
    }

    // 打印移动统计
    debugLog(CONFIG.DEBUG, `\n===移动统计===`);
    debugLog(CONFIG.DEBUG, `己方阵型移动: ${moves.selfFormationMoves.length}个`, moves.selfFormationMoves);
    debugLog(CONFIG.DEBUG, `阻止对方移动: ${moves.preventOpponentMoves.length}个`, moves.preventOpponentMoves);
    debugLog(CONFIG.DEBUG, `安全移动: ${moves.safeMoves.length}个`, moves.safeMoves);
    debugLog(CONFIG.DEBUG, `风险移动: ${moves.worstMoves.length}个`, moves.worstMoves);

    // 选择最终移动
    if (moves.selfFormationMoves.length > 0) {
        // 先筛选奖励最大的
        const maxReward = Math.max(...moves.selfFormationMoves.map(m => m.value));
        const maxRewardMoves = moves.selfFormationMoves.filter(m => m.value === maxReward);
        // 在奖励最大的中再选给对方机会最少的
        const bestMoves = selectBestMoves(maxRewardMoves, 'giveOpponent', true);
        if (bestMoves.length > 0) {
            debugLog(CONFIG.DEBUG, `选择己方阵型移动:`, bestMoves);
            return bestMoves;  // 返回所有最佳移动
        }
    }

    // 2. 可以阻止对方且给对方带来机会最少的移动
    if (moves.preventOpponentMoves.length > 0) {
        const preventMoves = moves.preventOpponentMoves.filter(m => m.preventValue > m.giveOpponent);
        if (preventMoves.length > 0) {
            const bestMoves = selectBestMoves(preventMoves, 'preventValue');
            if (bestMoves.length > 0) {
                debugLog(CONFIG.DEBUG, `选择阻止对方移动:`, bestMoves);
                return bestMoves;
            }
        }
    }

    // 3. 安全移动（选择己方棋子最多的位置）
    // 修改安全移动的选择逻辑
    if (moves.safeMoves.length > 0) {
        // 1. 先找出可以下次移动形成阵型的位置
        const nextFormationMoves = moves.safeMoves.filter(m => m.nextMoveFormations.canFormFormation);
        if (nextFormationMoves.length > 0) {
            const bestMoves = selectBestMoves(nextFormationMoves, 'nextMoveFormations.maxReward');
            if (bestMoves.length > 0) return bestMoves;
        }

        const opponentDesireMoves = moves.safeMoves.filter(m => m.opponentDesire.isDesired);
        if (opponentDesireMoves.length > 0) {
            const bestMoves = selectBestMoves(opponentDesireMoves, 'opponentDesire.formationCount');
            if (bestMoves.length > 0) return bestMoves;
        }

        const bestMoves = selectBestMoves(moves.safeMoves, 'adjacentInfo.totalAdjacent');
        if (bestMoves.length > 0) return bestMoves;
    }


    // 4. 最后选择给对方带来机会最少的移动
    if (moves.worstMoves.length > 0) {
        const bestMoves = selectBestMoves(moves.worstMoves, 'giveOpponent', true);
        if (bestMoves.length > 0) return bestMoves;
    }
    debugLog(CONFIG.DEBUG, '没找到有效位置', moves);
    return [];
}


/**
 * 评估针对当前row,col这个空位下次移动是否能形成阵型
 */
function evaluateNextMoveFormations(fromRow, fromCol, toRow, toCol, currentColor, opponentColor, board) {
    let canFormFormation = false;
    let maxReward = 0;
    // 记录要移动的棋子阵型状态
    const initialPieceFormatiion = board[fromRow][fromCol].isFormation;
    // 先模拟移动该位置
    board[fromRow][fromCol] = null;

    // 检查周围的空位
    for (const dir of DIRECTIONS.ADJACENT) {
        const nextRow = toRow + dir.dx;
        const nextCol = toCol + dir.dy;

        if (!isInBoard(nextRow, nextCol) || board[nextRow][nextCol] !== null) continue;

        // 对空位nextRow, nextCol放置己方棋子计算最大收益
        const formation = getMaxFormationRewardAfterMove(nextRow, nextCol, currentColor, board);
        if (formation.maxExtraMoves > 0) {
            canFormFormation = true;
            maxReward = Math.max(maxReward, formation.maxExtraMoves);
        }
    }

    // 恢复棋盘状态
    board[fromRow][fromCol] = { color: currentColor, isFormation: initialPieceFormatiion };// from有可能是本来在阵型中的旗子

    return { canFormFormation, maxReward };
}

/**
 * 评估该空的位置对对手的价值
 */
function evaluateOpponentDesire(row, col, currentColor, opponentColor, board) {
    let isDesired = false;
    let formationCount = 0;
    let maxReward = 0;

    // row, col对应的是要移动到的空位
    const formation = getMaxFormationRewardAfterMove(row, col, opponentColor, board);
    if (formation.maxExtraMoves > 0) {
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

    // 1. 找出最优值
    const bestValue = minimum ?
        Math.min(...moves.map(m => getValue(m, keyPath))) :
        Math.max(...moves.map(m => getValue(m, keyPath)));

    // 2. 返回所有具有最优值的移动
    return moves
        .filter(m => getValue(m, keyPath) === bestValue)
        .map(m => m.move);
}
/**
 * 评估一个己方棋子row, col移动的价值
 */
function evaluateMoveValue(row, col, newRow, newCol, currentColor, opponentColor, board) {
    // 1. 检查移动到空位 newRow, newCol后能阻止多少对方吃子，对方吃子是基于移动前的棋盘的
    const preventResult = getMaxFormationRewardAfterMove(newRow, newCol, opponentColor, board);
    const preventOpponent = preventResult.maxExtraMoves;

    const initialPieceFormatiion = board[row][col].isFormation;

    board[row][col] = null;
    const formation = checkFormation(newRow, newCol, currentColor, board);
    // 恢复棋盘状态
    board[row][col] = { color: currentColor, isFormation: initialPieceFormatiion };

    // 2. 检查移动到新位置是否会形成己方阵型
    const selfFormation = formation ? formation.extraMoves : 0;

    // 3. 检查移动对方棋子到row,col对应的为己方棋子位置后给对方带来的吃子机会
    const giveResult = getMaxFormationRewardAfterMove(row, col, opponentColor, board);

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