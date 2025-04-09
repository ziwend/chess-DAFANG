import { DIRECTIONS, WEIGHTS, GAME_PHASES, CONFIG } from './gameConstants.js';
import { checkFormation, checkSquare, hasNonFormationPieces, hasNonSquarePieces } from './formationChecker.js';
import { isBoardWillFull, isMaxPiecesCount, isOnEdge, isInBoard, canMove, canPlace, hasValidPiece, deepCopy } from './boardUtils.js';
import { validatePosition } from './validationUtils.js';
import { debugLog } from './historyUtils.js';
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
    const tempBoard = deepCopy(board); // 创建一个临时棋盘副本
    let availablePositions = new Set();
    let { tempPosition, tempOpponentPosition } = evaluatePositions(tempBoard, currentColor, opponentColor, availablePositions);
    const finalPositions = [];
    // 1、优先判断放置在己方棋子周围是否会组成阵型，这样做的前提是该次落子不是奖励的机会,因为奖励的棋子形成的阵型不再给奖励
    if (tempPosition && !extraMoves > 0) {
        finalPositions.push({
            action: 'placing',
            position: tempPosition
        });
        return finalPositions;
    }

    // 2、接着检查对方棋子是否会组成阵型，如果会组成阵型，放在对方棋子周围
    if (tempOpponentPosition) {
        finalPositions.push({
            action: 'placing',
            position: tempOpponentPosition
        });
        return finalPositions;
    }

    // 3、如果己方棋子和对方棋子都不能形成阵型，则回头继续判断当己方连续放置两颗棋子时己方能否形成阵型，如果能形成阵型，优先放在己方棋子周围，使用checkFormation函数
    // 第一步遍历棋盘的时候，已经获取到了己方棋子周围哪些位置可以放置棋子，所以这里只需要遍历这些位置即可

    let uniquePositions = Array.from(availablePositions).map(pos => JSON.parse(pos));
    if (playerConfig[currentColor].difficulty !== 'easy') {
        let possiblePositions = getPossibleFormationPositions(uniquePositions, tempBoard, currentColor, opponentColor);
        if (possiblePositions && possiblePositions.length > 0) {
            if (possiblePositions.length > 1) {
                // 过滤周边包含更多己方棋子的位置
                //possiblePositions = filterByNeighbors(possiblePositions, tempBoard);
            }
            debugLog(CONFIG.DEBUG, `3、${currentColor}棋子周围放置2颗棋子会组成阵型`, possiblePositions);
            return possiblePositions;
        }
        // 在此之前还要判断一下对方是否在垂直或水平方向上形成3子连珠，且只有对方的棋子

        // 4、棋子放在靠近对方棋子，防止对方连续两颗棋子后形成阵型
        possiblePositions = getPossibleFormationPositions(uniquePositions, tempBoard, opponentColor, currentColor);
        if (possiblePositions && possiblePositions.length > 0) {
            if (possiblePositions.length > 1) {
                // 过滤周边棋子最少的
                //possiblePositions = filterByNeighbors(possiblePositions, tempBoard);
            }
            debugLog(CONFIG.DEBUG, `4、${currentColor}放在对方棋子周围，防止连续放置2颗棋子组成阵型`, possiblePositions);
            return possiblePositions;
        }
    }

    // 5、己方不能形成阵型，对方也不能形成阵型，就优先放置在现有棋子周围
    const scoredPositions = scorePositions(uniquePositions);
    const highestScore = scoredPositions[0].score;
    const topScoredPositions = scoredPositions.filter(pos => pos.score === highestScore); // 选出评分最高的几个位置

    // 再选择出周围棋子数量最多的位置
    let countOfNeighbors = 0;
    topScoredPositions.forEach(({ position }) => {
        let tempCount = 0;
        for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
            const newRow = position[0] + dx;
            const newCol = position[1] + dy;

            if (isInBoard(newRow, newCol) && tempBoard[newRow][newCol]) {
                tempCount++;
            }
        }
        if (tempCount > countOfNeighbors) {
            countOfNeighbors = tempCount;
            tempPosition = position;
        }

    });
    if (tempPosition) {
        finalPositions.push({
            action: 'placing',
            position: tempPosition
        });
        debugLog(CONFIG.DEBUG, `5、${currentColor}放置在现有棋子周围，权重最高的位置`, topScoredPositions);
        return finalPositions;
    }

    debugLog(CONFIG.DEBUG, `6、没有找到有效数据`, topScoredPositions);
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
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    let tempPosition = null;
    let tempOpponentPosition = null;

    for (let row = 0; row < tempBoard.length; row++) {
        for (let col = 0; col < tempBoard[row].length; col++) {
            const result = getBestFormationPosition(row, col, tempBoard, currentColor, opponentColor, availablePositions);
            if (result.tempPosition) {
                if (tempExtraMoves < result.tempExtraMoves) {
                    tempExtraMoves = result.tempExtraMoves;
                    tempPosition = result.tempPosition;
                    debugLog(CONFIG.DEBUG, `0-evaluatePositions-己方${currentColor}形成阵型的位置:`, tempPosition, tempExtraMoves);
                } else if (tempExtraMoves === result.tempExtraMoves) {
                    const [oldRow, oldCol] = tempPosition;
                    const [newRow, newCol] = result.tempPosition;
                    if (WEIGHTS[oldRow][oldCol] < WEIGHTS[newRow][newCol]) {
                        tempExtraMoves = result.tempExtraMoves;
                        tempPosition = result.tempPosition;
                    } else if (WEIGHTS[oldRow][oldCol] === WEIGHTS[newRow][newCol]) {
                        debugLog(CONFIG.DEBUG, `0-${currentColor}该位置与之前的阵型获取的奖励相同，棋子的权重也相同`, result.tempPosition);
                    }
                }
            }

            if (result.tempOpponentPosition) {
                if (tempOpponentExtraMoves < result.tempOpponentExtraMoves) {
                    tempOpponentExtraMoves = result.tempOpponentExtraMoves;
                    tempOpponentPosition = result.tempOpponentPosition;
                    debugLog(CONFIG.DEBUG, `0-evaluatePositions-对方${opponentColor}形成阵型的位置:`, tempOpponentPosition, tempOpponentExtraMoves);
                } else if (tempOpponentExtraMoves === result.tempOpponentExtraMoves) {
                    const [oldRow, oldCol] = tempOpponentPosition;
                    const [newRow, newCol] = result.tempOpponentPosition;
                    if (WEIGHTS[oldRow][oldCol] < WEIGHTS[newRow][newCol]) {
                        tempOpponentExtraMoves = result.tempOpponentExtraMoves;
                        tempOpponentPosition = result.tempOpponentPosition;
                    } else if (WEIGHTS[oldRow][oldCol] === WEIGHTS[newRow][newCol]) {
                        debugLog(CONFIG.DEBUG, `0-${currentColor}对方在该位置与之前的阵型获取的奖励相同，棋子的权重也相同`, result.tempPosition);
                    }
                }
            }
        }
    }
    return { tempPosition, tempOpponentPosition };
}

function scorePositions(positions) {
    return positions.map(position => {
        const [row, col] = position;
        return {
            position,
            score: WEIGHTS[row][col]
        };
    }).sort((a, b) => b.score - a.score); // 按评分从高到低排序
}

function getBestFormationPosition(row, col, tempBoard, currentColor, opponentColor, availablePositions) {
    let tempPosition = null;
    let tempOpponentPosition = null;
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    let hasOpponentPiece = false;
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
                        // console.log('tempExtraMoves:', tempExtraMoves, 'formationUpdate.extraMoves:', formationUpdate.extraMoves);
                        if (tempExtraMoves < formationUpdate.extraMoves) { // 如果有额外移动次数
                            tempExtraMoves = formationUpdate.extraMoves;
                            tempPosition = [row, col];
                            return { tempPosition, tempOpponentPosition, tempExtraMoves, tempOpponentExtraMoves }; // 找到当前棋子形成的阵型，直接返回
                        } else if (tempExtraMoves === formationUpdate.extraMoves) {
                            const [oldRow, oldCol] = tempPosition;
                            if (WEIGHTS[row][col] > WEIGHTS[oldRow][oldCol]) {
                                tempPosition = [row, col];
                                debugLog(CONFIG.DEBUG, `0-getBestFormationPosition-己方${currentColor}-权重大的位置`, tempPosition);
                            } else if (WEIGHTS[row][col] === WEIGHTS[oldRow][oldCol]) {
                                debugLog(CONFIG.DEBUG, `0-getBestFormationPosition-己方${currentColor}-权重也一样, 待考虑是否返回`, [row, col]);
                            }
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
                    // console.log('tempOpponentExtraMoves:', tempOpponentExtraMoves, 'formationUpdate.extraMoves:', formationUpdate.extraMoves);
                    if (tempOpponentExtraMoves < formationUpdate.extraMoves) { // 如果有额外移动次数
                        tempOpponentExtraMoves = formationUpdate.extraMoves;
                        tempOpponentPosition = [row, col];
                        // 找到对方棋子形成的阵型，等一等
                    } else if (tempOpponentExtraMoves === formationUpdate.extraMoves) {
                        const [oldRow, oldCol] = tempOpponentPosition;
                        if (WEIGHTS[row][col] > WEIGHTS[oldRow][oldCol]) {
                            tempOpponentPosition = [row, col];
                            debugLog(CONFIG.DEBUG, `0-getBestFormationPosition-对方${opponentColor}new position权重更大:`, tempOpponentPosition);
                        } else if (WEIGHTS[row][col] === WEIGHTS[oldRow][oldCol]) {
                            debugLog(CONFIG.DEBUG, `0-getBestFormationPosition-对方${opponentColor}权重也一样, 待考虑是否返回`, [row, col]);
                        }
                    }
                }
            }

        }
    }
    return { tempPosition, tempOpponentPosition, tempExtraMoves, tempOpponentExtraMoves };
}

function getPossibleFormationPositions(uniquePositions, tempBoard, currentColor, opponentColor) {
    let tempPosition = null;
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
            debugLog(CONFIG.DEBUG, `1-getPossibleFormationPositions-在新位置${position}组成阵型的数量多于旧位置：`, tempPosition);
            countOfFormation = tempCount;
            tempPosition = position;
            equalPositions = [position]; // 重置相等位置数组

        } else if (tempCount > 0 && tempCount === countOfFormation) {
            equalPositions.push(position); // 添加到相等位置数组
            // TODO使用人为设定的权重是否靠谱？下面的决策并没有合理的依据
            /*
            const [newRow, newCol] = position;
            const [oldRow, oldCol] = tempPosition;            
            let countOfEmpty = 0;
            let countOfOldEmpty = 0;
            for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
                const newRow2 = newRow + dx;
                const newCol2 = newCol + dy;
                const targetPosition = { targetRow: newRow2, targetCol: newCol2 };

                if (validatePosition(targetPosition, GAME_PHASES.PLACING, currentColor, tempBoard)) {
                    countOfEmpty++;
                }
                const oldRow2 = oldRow + dx;
                const oldCol2 = oldCol + dy;
                const targetPosition2 = { targetRow: oldRow2, targetCol: oldCol2 };
                if (validatePosition(targetPosition2, GAME_PHASES.PLACING, currentColor, tempBoard)) {
                    countOfOldEmpty++;
                }
            }
            if (countOfEmpty > countOfOldEmpty) {
                tempPosition = position;
                equalPositions = [position]; // 重置相等位置数组
            } else if (countOfEmpty === countOfOldEmpty) {
                equalPositions.push(position); // 添加到相等位置数组
            }
            
            if (WEIGHTS[newRow][newCol] > WEIGHTS[oldRow][oldCol]) {
                tempPosition = position;
                equalPositions = [position]; // 重置相等位置数组
            } else if (WEIGHTS[newRow][newCol] === WEIGHTS[oldRow][oldCol]) {
                
            }*/
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
    if (tempPosition) {
        finalPositions.push({
            action: 'placing',
            position: tempPosition
        });
        return finalPositions;
    }

    return finalPositions;
}

function getValidRemovePositions(currentColor, opponentColor, data) {
    const { board, blackCount, whiteCount } = data;
    const validPositions = [];
    let tempPosition = null;
    let tempOpponentPosition = null;
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    let largestMoves = 0; // 该变量指示在对方会形成阵型，此时移除对方阵型上的棋子后自己也能形成阵型时可以获得的额外吃子数
    const nonFormationPieces = [];
    const diagonalOrDragonPieces = [];
    const formationPositions = [];
    const hasNonFormationPiecesFlag = hasNonFormationPieces(opponentColor, board);
    const isFirstRemove = isMaxPiecesCount(blackCount, whiteCount);
    let hasNonSquarePiecesFlag = null;
    let possiblePosition = null;

    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if ((board[row][col] && board[row][col].color === currentColor) || board[row][col] === null) {
                continue;
            }

            if (hasNonFormationPiecesFlag && board[row][col].isFormation) {
                continue;
            }
            const piece = { row, col };
            if (!hasNonFormationPiecesFlag) {
                if (hasNonSquarePiecesFlag !== null && hasNonSquarePiecesFlag && formationPositions.length > 0) {
                    if (formationPositions.some(position => position[0] === row && position[1] === col)) {
                        continue;
                    }
                }
                const squareResult = checkSquare(row, col, opponentColor, board);
                if (squareResult.squareCount > 0) {
                    formationPositions.push(...squareResult.formationPositions);
                    debugLog(CONFIG.DEBUG, '当前对手大方所处位置=', squareResult.formationPositions);

                    hasNonSquarePiecesFlag = hasNonSquarePieces(opponentColor, formationPositions, 0, 0, board);
                    if (!hasNonSquarePiecesFlag) {
                        debugLog(CONFIG.DEBUG, '对方所有棋子都为squarepieces', formationPositions);
                        return formationPositions.map(pos => ({
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
                const newExtraMoves = evaluateFormation(row, col, currentColor, opponentColor, board, tempExtraMoves);
                if (newExtraMoves > tempExtraMoves) {
                    tempPosition = [row, col];
                    tempExtraMoves = newExtraMoves;
                    debugLog(CONFIG.DEBUG, `0-${currentColor}-棋盘满时，先考虑自己形成阵型,吃子数：${newExtraMoves}:`, tempPosition);
                    continue;
                } else if (newExtraMoves > 0 && newExtraMoves === tempExtraMoves) {
                    debugLog(CONFIG.DEBUG, `1-${currentColor}棋盘满时，先考虑自己形成阵型，该位置与之前的位置获取的奖励相等，待考虑:`, { pos, tempPosition });
                }
                if (tempPosition !== null) { // 已经找到一个可以自己形成阵型的位置了，就不再判断对方了
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

                const formationUpdate = checkFormation(newRow, newCol, opponentColor, board);
                if (formationUpdate === null) {
                    continue;
                }
                if (tempOpponentExtraMoves > formationUpdate.extraMoves) {
                    continue;
                }

                if (tempOpponentExtraMoves === formationUpdate.extraMoves) {
                    debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，会形成${formationUpdate.formationType}阵型，但是吃子数同之前的位置:`, tempOpponentPosition);
                    continue;
                }
                debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，会形成${formationUpdate.formationType}阵型，是否有效待判断`, formationUpdate.formationPositions);

                // TODO 存在的问题，当对方移动一颗棋子后既能形成大龙，大方和斜线阵型怎么取舍
                let countAdjacentOpponent = 4; // 周围可以移动的棋子最多四颗
                for (const pos of formationUpdate.formationPositions) {
                    // 先不判断空缺的位置 // 如果是空白的位置，则该位置周围不能有多于1个的对方棋子，否则吃子无效
                    if (pos[0] === newRow && pos[1] === newCol) continue;
                    // 还要判断该棋子是否已经在阵型中
                    const formationUpdateOpponent = checkFormation(pos[0], pos[1], opponentColor, board);
                    if (formationUpdateOpponent != null) {
                        debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子在${formationUpdateOpponent.formationType}阵型中不能移除`, pos);
                        continue;
                    }

                    // 再复查一下移除该棋子后对方的阵型是否被破坏
                    const tempBoard = deepCopy(board);
                    tempBoard[pos[0]][pos[1]] = null;
                    const formationUpdateDestroy = checkFormation(newRow, newCol, opponentColor, tempBoard);
                    // 破坏后的吃子数量还不如之前移除另外一个棋子破坏的吃子数量
                    if (formationUpdateDestroy != null && formationUpdate.extraMoves - formationUpdateDestroy.extraMoves <= tempOpponentExtraMoves) {
                        debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，该吃子破坏对方阵型带来的效果不如之前的位置：`, { pos, tempOpponentPosition });
                        continue;
                    }

                    // 寻找阵型上周围棋子最少得那颗
                    const result = countAdjacentPieces(pos[0], pos[1], currentColor, opponentColor, board);
                    if (result.countAdjacentOpponent < countAdjacentOpponent) {
                        countAdjacentOpponent = result.countAdjacentOpponent;
                        if (formationUpdateDestroy != null) {
                            tempOpponentExtraMoves = formationUpdate.extraMoves - formationUpdateDestroy.extraMoves;
                            debugLog(CONFIG.DEBUG, `1-${currentColor}移除对方后只能部分破坏对方阵型`, { pos, tempOpponentPosition });
                        } else {
                            tempOpponentExtraMoves = formationUpdate.extraMoves;
                        }

                        tempOpponentPosition = pos;
                        debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子${[row, col]}移动到${newRow},${newCol}后，会获得更多奖励，且该位置周围棋子比之前的少:`, { pos, tempOpponentPosition });
                    } else if (result.countAdjacentOpponent === countAdjacentOpponent) {
                        // 再判断该位置移除之后自己能不能形成阵型
                        const thisPosExtraMoves = evaluateFormation(pos[0], pos[1], currentColor, opponentColor, board, tempExtraMoves);
                        // 自己最多奖励的那个
                        if (largestMoves < thisPosExtraMoves) {
                            largestMoves = thisPosExtraMoves;
                            if (formationUpdateDestroy != null && formationUpdateDestroy.extraMoves < tempOpponentExtraMoves) {
                                tempOpponentExtraMoves = formationUpdateDestroy.extraMoves;
                            } else {
                                tempOpponentExtraMoves = formationUpdate.extraMoves;
                            }
                            tempOpponentPosition = pos;

                            debugLog(CONFIG.DEBUG, `1-${currentColor}找到对方阵型上自己可能形成阵型的位置:`, tempOpponentPosition, countAdjacentOpponent);
                        } else if (thisPosExtraMoves > 0 && largestMoves === thisPosExtraMoves) {
                            debugLog(CONFIG.DEBUG, `1-${currentColor}移除对方自己可能形成阵型的位置，该位置与之前的位置获取的奖励相等，待考虑:`, { pos, tempOpponentPosition });
                        }
                    }
                    debugLog(CONFIG.DEBUG, `1-${currentColor}-对方棋子移除后：`, { pos, tempOpponentPosition });
                }
                // 什么情况下吃对方移动的棋子，对方会形成阵型，但是其他棋子都在阵型中不能吃
                if (tempOpponentPosition === null) {
                    // 但是如果对方有两颗棋子也是无效吃子，一种有用的情况是多阵型情况下减少吃子数
                    tempOpponentExtraMoves = formationUpdate.extraMoves;
                    tempOpponentPosition = [row, col];
                    debugLog(CONFIG.DEBUG, `1-${currentColor}对方可能形成${formationUpdate.formationType}阵型，阵型上的棋子都不能吃`, [newRow, newCol]);
                } else if (countAdjacentOpponent > 0) {
                    // 再判断
                    const newResult = countAdjacentPieces(newRow, newCol, currentColor, opponentColor, board);
                    if (newResult.countAdjacentOpponent === 1) {
                        debugLog(CONFIG.DEBUG, `1-${currentColor}对方可能形成${formationUpdate.formationType}阵型，阵型上的棋子都有邻子，而要移动的棋子没有邻子`, [newRow, newCol]);
                        tempOpponentExtraMoves = formationUpdate.extraMoves;
                        tempOpponentPosition = [row, col];
                    }
                }
            }

            if (isFirstRemove) {
                continue;
            }

            // 如果对当前棋子检查之后获取了对方可能形成阵型的位置，则继续不再判断己方阵型
            if (isFirstRemove || tempOpponentPosition) {
                debugLog(CONFIG.DEBUG, `1-${currentColor}，首次移动不考虑对方阵型，或者已找到对方可能形成阵型的位置:`, tempOpponentPosition);
                continue
            }

            const newExtraMoves = evaluateFormation(row, col, currentColor, opponentColor, board, tempExtraMoves);
            if (newExtraMoves > 0) {
                tempPosition = [row, col];
                tempExtraMoves = newExtraMoves;
                debugLog(CONFIG.DEBUG, `2-${currentColor}自己可能形成阵型的位置:`, tempPosition);
                continue;
            }

            //如果移除不能阻止对方形成阵型，也不能自己组成阵型，则判断该棋子下一次移动后是否方便组成阵型
            nonFormationPieces.push(piece);

        }
    }

    const finalPositions = [];
    if (isFirstRemove && tempPosition) {
        debugLog(CONFIG.DEBUG, `1-${currentColor}-isFirstRemove-可能形成阵型的位置:`, tempPosition);
        const squareResult = checkSquare(tempPosition[0], tempPosition[1], opponentColor, board);
        if (squareResult.squareCount === 0) {
            finalPositions.push({
                action: 'removing',
                position: tempPosition
            });
            return finalPositions;
        }
    }

    if (tempOpponentPosition) {
        finalPositions.push({
            action: 'removing',
            position: tempOpponentPosition
        });
        return finalPositions;
    }

    if (tempPosition) {
        finalPositions.push({
            action: 'removing',
            position: tempPosition
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
        } else {
            console.log('重复的位置:', pos);
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

function getValidMoves(currentColor, opponentColor, data) {
    const { board } = data;
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    const finalPositions = [];
    const validMoves = [];
    const worstMoves = [];
    let betterMoves = null;
    let goodMoves = null;

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
                if (!canPlace(newRow, newCol, tempBoard)) {
                    continue;
                }

                // 可以移动，先判断移动后自己能不能形成阵型                
                const formationUpdate = checkFormation(newRow, newCol, currentColor, tempBoard);
                if (formationUpdate) {
                    if (tempExtraMoves < formationUpdate.extraMoves) {
                        tempExtraMoves = formationUpdate.extraMoves;
                        betterMoves = {
                            position: [row, col],
                            newPosition: [newRow, newCol]
                        };
                        debugLog(CONFIG.DEBUG, `1-${currentColor}-move后自己会形成阵型betterMoves: `, betterMoves);
                    } else {
                        debugLog(CONFIG.DEBUG, `1-${currentColor}-move到${newRow},${newCol}后自己会形成阵型但是获得的奖励与之前的一样,待考虑是否返回: `, betterMoves);
                    }
                    continue;
                }

                if (betterMoves) {
                    continue;
                }

                // 再判断移动后是否会阻止对方形成阵型
                destroyedOpponentExtraMoves = evaluateFormation(newRow, newCol, opponentColor, currentColor, tempBoard, tempOpponentExtraMoves);
                if (destroyedOpponentExtraMoves > 0 && tempOpponentExtraMoves <= destroyedOpponentExtraMoves) {
                    // 是不是goodmoves需要进一步判断
                    possiblePosition = [newRow, newCol];
                    debugLog(CONFIG.DEBUG, `2、${currentColor}-${row},${col}move到${newRow},${newCol}可阻止对方形成阵型，但是需要进一步判断移动后对方还能组成阵型吗 `, destroyedOpponentExtraMoves);
                    continue;
                }

                // 既不能己方形成阵型，也不能阻止对方形成阵型，备选
                commonPositions.push([newRow, newCol]);
                debugLog(CONFIG.DEBUG, `3、${currentColor}-${row},${col}移动到这些位置既不能己方形成阵型，也不能阻止对方形成阵型，备选：`, commonPositions);
            }

            // 如果截止当前还没有找到自己可以形成阵型的移动，则判断移动是否会给对方机会
            if (betterMoves) {
                continue;
            }

            // 如果移动给了对方机会，且吃子更多
            const newEvaluateFormationResult = evaluateFormation(row, col, opponentColor, currentColor, tempBoard, tempOpponentExtraMoves);
            if (destroyedOpponentExtraMoves < newEvaluateFormationResult) {
                debugLog(CONFIG.DEBUG, `4、${currentColor}-${row},${col} move后对方会形成阵型, 且获取更多的吃子tempOpponentExtraMoves=`, tempOpponentExtraMoves);
                if (possiblePosition) {
                    worstMoves.push({
                        action: 'moving',
                        position: [row, col],
                        newPosition: possiblePosition
                    });
                    debugLog(CONFIG.DEBUG, `4、${currentColor}-move后会阻止对方会形成阵型, worstMoves: `, worstMoves, destroyedOpponentExtraMoves);
                    continue;
                }
                if (commonPositions.length > 0) {
                    commonPositions.forEach(pos => {
                        worstMoves.push({
                            action: 'moving',
                            position: [row, col],
                            newPosition: pos
                        });
                    });
                    debugLog(CONFIG.DEBUG, `4、${currentColor}-move后对方会形成阵型, worstMoves: `, worstMoves);
                    continue;
                }
            } else if (destroyedOpponentExtraMoves === newEvaluateFormationResult && newEvaluateFormationResult > 0) {
                debugLog(CONFIG.DEBUG, `4、${currentColor}-${row},${col} move后对方会形成阵型, 但是获取的吃子数与对方一样，待考虑是否返回: `, commonPositions, possiblePosition);
            }

            if (possiblePosition) {
                // 如果移动没有给对方带来机会，同时又可以阻止对方形成阵型，是goodMoves
                goodMoves = {
                    position: [row, col],
                    newPosition: possiblePosition
                };
                tempOpponentExtraMoves = destroyedOpponentExtraMoves;
                debugLog(CONFIG.DEBUG, `3、${currentColor}-${row},${col}mov没有给对方带来机会，可阻止对方形成阵型 `, goodMoves);
                continue;
            }

            commonPositions.forEach(pos => {
                validMoves.push({
                    action: 'moving',
                    position: [row, col],
                    newPosition: pos
                });
            });
        }
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
    debugLog(CONFIG.DEBUG, `6、${currentColor}move后对方会形成阵型worstMoves:`, worstMoves);
    return worstMoves;
}

function evaluateFormation(row, col, currentColor, opponentColor, board, tempExtraMoves) {
    const formationUpdate = checkFormation(row, col, currentColor, board);
    if (formationUpdate) {
        const { countAdjacent, countAdjacentOpponent } = countAdjacentPieces(row, col, currentColor, opponentColor, board);

        if (isValidFormation(row, col, formationUpdate, countAdjacent, tempExtraMoves)) {
            return formationUpdate.extraMoves;
        }
        if (tempExtraMoves === formationUpdate.extraMoves) {
            console.log(`7、${currentColor}会形成阵型，但是获得的奖励与之前的一样,待考虑是否返回: `, `[${row}, ${col}]`);
        }
    }
    return 0;
}
function isValidFormation(row, col, formationUpdate, countAdjacent, tempExtraMoves) {
    if (formationUpdate.formationType.includes('斜') && countAdjacent > 0 && tempExtraMoves < formationUpdate.extraMoves) {
        return true;
    } else if (formationUpdate.formationType.includes('龙') && ((countAdjacent > 1 && isOnEdge(row, col)) || (countAdjacent > 2 && !isOnEdge(row, col))) && tempExtraMoves < formationUpdate.extraMoves) {
        return true;
    } else if ((formationUpdate.formationType.includes('方') && countAdjacent > 2) && tempExtraMoves < formationUpdate.extraMoves) {
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
    let tempPosition = null;
    let countOfFormation = 0; // 形成阵型的数量，同一个位置在不同方向可形成多个阵型
    let equalPositions = []; // 用于存储多个相等的位置
    const possibleMoves = [];
    let possibleMove = null;

    // 遍历 validMoves，将 newPosition 添加到 uniquePositions 中
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
            // 判断一下这两个位置的权重，哪个大选哪个
            const [newRow, newCol] = move.newPosition;
            const [oldRow, oldCol] = possibleMove.newPosition;

            if (WEIGHTS[newRow][newCol] > WEIGHTS[oldRow][oldCol]) {
                possibleMoves.push(move);
                equalPositions = [move]; // 重置相等位置数组            
            } else if (WEIGHTS[newRow][newCol] === WEIGHTS[oldRow][oldCol]) {
                // 如果权重相等，选择周围有更多空位的？
                let countOfEmpty = 0;
                let countOfOldEmpty = 0;
                for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
                    const newRow2 = newRow + dx;
                    const newCol2 = newCol + dy;
                    const targetPosition = { targetRow: newRow2, targetCol: newCol2 };

                    if (validatePosition(targetPosition, GAME_PHASES.PLACING, currentColor, tempBoard)) {
                        countOfEmpty++;
                    }
                    const oldRow2 = oldRow + dx;
                    const oldCol2 = oldCol + dy;
                    const targetPosition2 = { targetRow: oldRow2, targetCol: oldCol2 };
                    if (validatePosition(targetPosition2, GAME_PHASES.PLACING, currentColor, tempBoard)) {
                        countOfOldEmpty++;
                    }
                }
                if (countOfEmpty > countOfOldEmpty) {
                    possibleMove = move;
                    equalPositions = [move]; // 重置相等位置数组
                } else if (countOfEmpty === countOfOldEmpty) {
                    equalPositions.push(move); // 添加到相等位置数组
                }
            }
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
