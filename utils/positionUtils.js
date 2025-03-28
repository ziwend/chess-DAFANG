import { DIRECTIONS, WEIGHTS, GAME_PHASES } from './gameConstants.js';
import { checkFormation, checkSquare, hasNonFormationPieces, hasNonSquarePieces } from './formationChecker.js';
import { isBoardWillFull, isMaxPiecesCount, isOnEdge, isInBoard, canMove, canPlace, hasValidPiece } from './boardUtils.js';
import { validatePosition, isValidPlacement } from './validationUtils.js';
import { debugLog } from './historyUtils.js';
export function getValidPositions(phase, playerColor, data) {
    const opponentColor = playerColor === 'black' ? 'white' : 'black';

    try {
        if (phase === 'placing') return getValidPlacePositions(playerColor, opponentColor, data);
        if (phase === 'moving') return getValidMoves(playerColor, opponentColor, data);
        if (phase === 'removing') return getValidRemovePositions(playerColor, opponentColor, data);
    } catch (error) {
        console.error('Error in getValidPositions:', error);
    }

    return [];
}

export function getValidPlacePositions(color, opponentColor, data) {
    // 第一颗棋子放在[1,1],[1,4],[4,1],[4,4]四个角落
    if (data.blackCount === 0) { // TODO 这里强烈依赖黑方开始，白方后手的规则
        return getFirstPlacePositions();
    }
    const board = data.board;
    // 最后一颗棋子，直接返回空闲位置
    if (isBoardWillFull(data)) {
        return getFreePositions(board);
    }

    // 其他棋子
    const tempBoard = JSON.parse(JSON.stringify(board)); // 创建一个临时棋盘副本
    let availablePositions = new Set();
    let { tempPosition, tempOpponentPosition } = evaluatePositions(tempBoard, color, opponentColor, availablePositions, data);
    const finalPositions = [];
    // 1、优先判断放置在己方棋子周围是否会组成阵型，这样做的前提是该次落子不是奖励的机会,因为奖励的棋子形成的阵型不再给奖励
    if (tempPosition && !data.extraMoves > 0) {
        finalPositions.push({
            action: 'placing',
            position: tempPosition
        });
        if (data.isDebug) {
            console.log(`1、${color}棋子周围会组成阵型`);
        }
        return finalPositions;
    }

    // 2、接着检查对方棋子是否会组成阵型，如果会组成阵型，放在对方棋子周围
    if (tempOpponentPosition) {
        finalPositions.push({
            action: 'placing',
            position: tempOpponentPosition
        });
        if (data.isDebug) {
            console.log(`2、${color}对手方会组成阵型`);
        }

        return finalPositions;
    }

    // 3、如果己方棋子和对方棋子都不能形成阵型，则回头继续判断当己方连续放置两颗棋子时己方能否形成阵型，如果能形成阵型，优先放在己方棋子周围，使用checkFormation函数
    // 第一步遍历棋盘的时候，已经获取到了己方棋子周围哪些位置可以放置棋子，所以这里只需要遍历这些位置即可

    let uniquePositions = Array.from(availablePositions).map(pos => JSON.parse(pos));
    if (data.playerConfig[color].difficulty !== 'easy') {
        let possiblePositions = getPossibleFormationPositions(uniquePositions, tempBoard, color, opponentColor, data);
        if (possiblePositions && possiblePositions.length > 0) {
            if (possiblePositions.length > 1) {
                // 过滤周边包含更多己方棋子的位置
                //possiblePositions = filterByNeighbors(possiblePositions, tempBoard);
            }
            if (data.isDebug) {
                console.log(`3、${color}棋子周围放置2颗棋子会组成阵型`);
            }
            return possiblePositions;
        }
        // 在此之前还要判断一下对方是否在垂直或水平方向上形成3子连珠，且只有对方的棋子
    
        // 4、棋子放在靠近对方棋子，防止对方连续两颗棋子后形成阵型
        possiblePositions = getPossibleFormationPositions(uniquePositions, tempBoard, opponentColor, color, data);
        if (possiblePositions && possiblePositions.length > 0) {
            if (possiblePositions.length > 1) {
                // 过滤周边棋子最少的
                //possiblePositions = filterByNeighbors(possiblePositions, tempBoard);
            }
            if (data.isDebug) {
                console.log(`4、${color}放在对方棋子周围，防止连续放置2颗棋子组成阵型`);
            }
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
        if (data.isDebug) {
            console.log(`5、${color}放置在现有棋子周围，权重最高的位置`, JSON.stringify(topScoredPositions));
        }
        return finalPositions;
    }

    if (data.isDebug) {
        console.log(`没有找到有效数据`, JSON.stringify(topScoredPositions));
    }
    return finalPositions;
}

export function getFirstPlacePositions() {
    const finalPositions = [];
    DIRECTIONS.CORNERPOSITIONS.forEach(({ pos, adjacent }) => {
        finalPositions.push({
            action: 'placing',
            position: pos
        });
    });
    return finalPositions;
}

export function getFreePositions(board) {
    const freePositions = [];
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
            if (board[row][col] === null) {
                freePositions.push({
                    action: 'placing',
                    position: [row, col]
                });
            }
        }
    }
    return freePositions;
}

export function evaluatePositions(tempBoard, color, opponentColor, availablePositions, data) {
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    let tempPosition = null;
    let tempOpponentPosition = null;

    for (let row = 0; row < tempBoard.length; row++) {
        for (let col = 0; col < tempBoard[row].length; col++) {
            const result = getBestFormationPosition(row, col, tempBoard, color, opponentColor, availablePositions, data);
            if (result.tempPosition) {
                if (tempExtraMoves < result.tempExtraMoves) {
                    tempExtraMoves = result.tempExtraMoves;
                    tempPosition = result.tempPosition;
                } else if (tempExtraMoves === result.tempExtraMoves) {
                    const [oldRow, oldCol] = tempPosition;
                    const [newRow, newCol] = result.tempPosition;
                    if (WEIGHTS[oldRow][oldCol] < WEIGHTS[newRow][newCol]) {
                        tempExtraMoves = result.tempExtraMoves;
                        tempPosition = result.tempPosition;
                    }
                }
            }

            if (result.tempOpponentPosition) {
                if (tempOpponentExtraMoves < result.tempOpponentExtraMoves) {
                    tempOpponentExtraMoves = result.tempOpponentExtraMoves;
                    tempOpponentPosition = result.tempOpponentPosition;
                } else if (tempOpponentExtraMoves === result.tempOpponentExtraMoves) {
                    const [oldRow, oldCol] = tempOpponentPosition;
                    const [newRow, newCol] = result.tempOpponentPosition;
                    if (WEIGHTS[oldRow][oldCol] < WEIGHTS[newRow][newCol]) {
                        tempOpponentExtraMoves = result.tempOpponentExtraMoves;
                        tempOpponentPosition = result.tempOpponentPosition;
                    }
                }
            }
        }
    }
    return { tempPosition, tempOpponentPosition };
}

export function scorePositions(positions) {
    return positions.map(position => {
        const [row, col] = position;
        return {
            position,
            score: WEIGHTS[row][col]
        };
    }).sort((a, b) => b.score - a.score); // 按评分从高到低排序
}

export function getBestFormationPosition(row, col, tempBoard, color, opponentColor, availablePositions, data) {
    let tempPosition = null;
    let tempOpponentPosition = null;
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    let hasOpponentPiece = false;
    // 有空位，且周围有棋子
    if (!tempBoard[row][col]) {
        for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
            const newRow = row + dx;
            const newCol = col + dy;
            
            if (isInBoard(newRow, newCol) && tempBoard[newRow][newCol]) {
                availablePositions.add(JSON.stringify([row, col]));
                if (tempBoard[newRow][newCol].color === color) { // 如果周围有己方棋子
                    // 判断一下是否形成阵型
                    const formationUpdate = checkFormation(row, col, color, tempBoard);
                    if (formationUpdate) {
                        // 判断一下extramoves，记录到tempPosition和tempExtraMoves中
                        // console.log('tempExtraMoves:', tempExtraMoves, 'formationUpdate.extraMoves:', formationUpdate.extraMoves);
                        if (tempExtraMoves < formationUpdate.extraMoves) { // 如果有额外移动次数
                            tempExtraMoves = formationUpdate.extraMoves;
                            tempPosition = [row, col];
                            if (data.isDebug) {
                                console.log(`己方${color}形成阵型的位置:`, JSON.stringify(tempPosition));
                            }
                            return { tempPosition, tempOpponentPosition, tempExtraMoves, tempOpponentExtraMoves }; // 找到当前棋子形成的阵型，直接返回
                        } else if (tempExtraMoves === formationUpdate.extraMoves) {
                            const [oldRow, oldCol] = tempPosition;
                            if (WEIGHTS[row][col] > WEIGHTS[oldRow][oldCol]) {
                                tempPosition = [row, col];
                                if (data.isDebug) {
                                    console.log('getBestFormationPosition-new position权重更大', JSON.stringify(tempPosition));
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
                            if (data.isDebug) {
                                console.log(`对方${opponentColor}形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                            }
                            // 找到对方棋子形成的阵型，等一等
                        } else if (tempOpponentExtraMoves === formationUpdate.extraMoves) {
                            const [oldRow, oldCol] = tempOpponentPosition;
                            if (WEIGHTS[row][col] > WEIGHTS[oldRow][oldCol]) {
                                tempOpponentPosition = [row, col];
                                if (data.isDebug) {
                                    console.log('getBestFormationPosition-对方 new position权重更大', JSON.stringify(tempOpponentPosition));
                                }
                            }
                        }
                    }
                }

            }
        }

    }
    return { tempPosition, tempOpponentPosition, tempExtraMoves, tempOpponentExtraMoves };
}

export function getPossibleFormationPositions(uniquePositions, tempBoard, color, opponentColor, data) {
    let tempPosition = null;
    let countOfFormation = 0; // 形成阵型的数量，同一个位置在不同方向可形成多个阵型
    let equalPositions = []; // 用于存储多个相等的位置

    uniquePositions.forEach(position => {
        // 递归检查下一层
        tempBoard[position[0]][position[1]] = {
            color: color,
            isFormation: false
        };
        let tempCount = 0;
        for (let row = 0; row < tempBoard.length; row++) {
            for (let col = 0; col < tempBoard[row].length; col++) {
                if (tempBoard[row][col]) {
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
                    const formationUpdate = checkFormation(row, col, color, tempBoard);
                    if (formationUpdate) {
                        tempCount++;
                        uniquePositions.push([row, col]);
                    }
                    // 在一个空位周围找到了己方棋子，不管能不能形成阵型都停止循环
                    break;
                }
            }
        }
        if (tempCount > countOfFormation) {
            countOfFormation = tempCount;
            tempPosition = position;
            equalPositions = [position]; // 重置相等位置数组
        } else if (tempCount > 0 && tempCount === countOfFormation) {
            // 判断一下这两个位置的权重，哪个大选哪个
            const [newRow, newCol] = position;
            const [oldRow, oldCol] = tempPosition;
            // console.log('getPossibleFormationPositions-new position', JSON.stringify(position), 'old position', JSON.stringify(tempPosition), 'WEIGHTS', WEIGHTS[newRow][newCol], WEIGHTS[oldRow][oldCol]);
            if (WEIGHTS[newRow][newCol] > WEIGHTS[oldRow][oldCol]) {
                tempPosition = position;
                equalPositions = [position]; // 重置相等位置数组
            } else if (WEIGHTS[newRow][newCol] === WEIGHTS[oldRow][oldCol]) {
                // 如果权重相等，选择周围有更多空位的？
                let countOfEmpty = 0;
                let countOfOldEmpty = 0;
                for (let [dx, dy] of DIRECTIONS.NEIGHBORS) {
                    const newRow2 = newRow + dx;
                    const newCol2 = newCol + dy;
                    const targetPosition = { targetRow: newRow2, targetCol: newCol2 };

                    if (validatePosition(targetPosition, GAME_PHASES.PLACING, color, tempBoard)) {
                        countOfEmpty++;
                    }
                    const oldRow2 = oldRow + dx;
                    const oldCol2 = oldCol + dy;
                    const targetPosition2 = { targetRow: oldRow2, targetCol: oldCol2 };
                    if (validatePosition(targetPosition2, GAME_PHASES.PLACING, color, tempBoard)) {
                        countOfOldEmpty++;
                    }
                }
                if (countOfEmpty > countOfOldEmpty) {
                    tempPosition = position;
                    equalPositions = [position]; // 重置相等位置数组
                } else {
                    equalPositions.push(position); // 添加到相等位置数组
                    if (data.isDebug) {
                        console.log(`getPossibleFormationPositions-周围空位${countOfEmpty}都相等，得考虑是否都返回`, JSON.stringify(position), 'old position', JSON.stringify(tempPosition));
                    }
                }
            }
        }
        tempBoard[position[0]][position[1]] = null; // 恢复原来的棋盘
    });
    // console.log('getPossibleFormationPositions-countOfFormation', countOfFormation, 'tempPosition', JSON.stringify(tempPosition), 'equalPositions', JSON.stringify(equalPositions));
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

export function getValidRemovePositions(currentColor, opponentColor, data) {
    const board = data.board;
    const validPositions = [];
    let tempPosition = null;
    let tempOpponentPosition = null;
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    const nonFormationPieces = [];
    const diagonalOrDragonPieces = [];
    const formationPositions = [];
    const hasNonFormationPiecesFlag = hasNonFormationPieces(opponentColor, board);
    const isFirstRemove = isMaxPiecesCount(data);
    let hasNonSquarePiecesFlag = null;

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
                    if (formationPositions.some(position => position.row === row && position.col === col)) {
                        continue;
                    }
                }
                const squareResult = checkSquare(row, col, opponentColor, board);
                if (squareResult.squareCount > 0) {
                    formationPositions.push(...squareResult.formationPositions);
                    if (data.isDebug) {
                        console.log('当前对手大方所处位置=', JSON.stringify(squareResult.formationPositions));
                    }
                    hasNonSquarePiecesFlag = hasNonSquarePieces(opponentColor, formationPositions, 0, 0, board);

                    if (!hasNonSquarePiecesFlag) {
                        if (data.isDebug) {
                            console.log('对方所有棋子都为squarepieces');
                        }
                        return formationPositions.map(pos => ({
                            action: 'removing',
                            position: [pos.row, pos.col]
                        }));
                    }
                    continue;
                }
                diagonalOrDragonPieces.push(piece);
                continue;
            }

            if (isFirstRemove) {
                const newExtraMoves = evaluateFormation(row, col , currentColor, opponentColor, board, tempExtraMoves);
                if (newExtraMoves !== null && newExtraMoves > tempExtraMoves) {
                    tempPosition = [row, col];
                    tempExtraMoves = newExtraMoves;
                    if (data.isDebug) {
                        console.log(`0-${currentColor}-棋盘满时，先考虑自己形成阵型:`, JSON.stringify(tempPosition), `吃子数：${newExtraMoves}`);
                    }
                    continue;
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
                if (!formationUpdate) {
                    continue;
                }

                if (tempOpponentExtraMoves >= formationUpdate.extraMoves) {
                    continue;
                }

                // 再判断一下相邻棋子，如果新位置周围有两颗棋子
                if (dir.dx === 0) { //左右移动的
                    // 则斜线移除新位置对角线方向，龙和大方移除水平或垂直方向只有一颗棋子的那颗
                    if (formationUpdate.formationType.includes('斜')) {
                        let largestMoves = 0;
                        for (const pos of formationUpdate.formationPositions) {
                            if (pos.row === newRow && pos.col === newCol) continue;
                            // 移除之后自己能形成阵型
                            const thisPosExtraMoves = evaluateFormation(pos.row,pos.col, currentColor, opponentColor, board, tempExtraMoves);
                            if (thisPosExtraMoves !== null) {
                                tempOpponentExtraMoves = formationUpdate.extraMoves;
                                tempOpponentPosition = [pos.row, pos.col];
                                console.log(`2-${currentColor}自己可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition),tempOpponentExtraMoves);
                                break;
                            }
                            // 判断该棋子周围没有自己的棋子，使用AJACENT判断
                            let hasAjacent = false;
                            for (const dir of DIRECTIONS.ADJACENT) {
                                if (hasValidPiece(opponentColor, pos.row + dir.dx, pos.col + dir.dy, board)) {
                                    hasAjacent = true;
                                    break;
                                }
                            }
                            if (!hasAjacent) {
                                tempOpponentExtraMoves = formationUpdate.extraMoves;
                                tempOpponentPosition = [pos.row, pos.col];
                                console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                                break;
                            }
                            // 自己最多奖励的那个
                            if (largestMoves < thisPosExtraMoves && pos.row !== newRow && pos.col !== newCol) {
                                largestMoves = thisPosExtraMoves;
                                tempOpponentExtraMoves = formationUpdate.extraMoves;
                                tempOpponentPosition = [pos.row, pos.col];
                                onsole.log(`1-${currentColor}duifang可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition),tempOpponentExtraMoves);
                                continue;
                            } else if (largestMoves === formationUpdate.extraMoves) {
                                console.log(`1-${currentColor}对方可能形成xie阵型的位置:`, JSON.stringify(pos),largestMoves);
                            }
                        }
                        if (data.isDebug) {
                            console.log(`${currentColor}对方可能形成xie阵型的位置:`, newRow, newCol);
                        }
                    }
                    if (formationUpdate.formationType.includes('方') || formationUpdate.formationType.includes('龙')) {     // 当前存在的问题是如果既有方，又有斜时，如果形成斜的阵型的吃子机会大于形成方时会有问题                    
                        // 再判断相对新位置的上下方向
                        if ((!isInBoard(newRow + 1, newCol) || board[newRow + 1][newCol] === null || board[newRow + 1][newCol].color === currentColor) && hasValidPiece(currentColor, newRow - 1, newCol, board)) {
                            tempOpponentExtraMoves = formationUpdate.extraMoves;
                            tempOpponentPosition = [newRow - 1, newCol];
                            console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                            break;
                        }
                        if ((!isInBoard(newRow - 1, newCol) || board[newRow - 1][newCol] === null || board[newRow - 1][newCol].color === currentColor) && hasValidPiece(currentColor, newRow + 1, newCol, board)) {
                            tempOpponentExtraMoves = formationUpdate.extraMoves;
                            tempOpponentPosition = [newRow + 1, newCol];
                            console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                            break;
                        }
                        // 再判断左右移动
                        if (hasValidPiece(opponentColor,newRow, col + 2 * dir.dy, board)) {
                            tempOpponentExtraMoves = formationUpdate.extraMoves;
                            tempOpponentPosition = [newRow, col + 2 * dir.dy];
                            console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                            break;
                        }

                    }


                }
                if (dir.dy === 0) { //上下移动的
                    // 当前存在的问题是如果既有方，又有斜时，如果形成斜的阵型的吃子机会大于形成方时会有问题
                    // 如果有多个斜线，优先移除吃子最多的斜线
                    if (formationUpdate.formationType.includes('斜')) {
                        let largestMoves = 0;
                        for (const pos of formationUpdate.formationPositions) {
                            if (pos.row === newRow && pos.col === newCol) continue;
                            // 移除之后自己能形成阵型
                            const thisPosExtraMoves = evaluateFormation(pos.row,pos.col, currentColor, opponentColor, board, tempExtraMoves);
                            if (thisPosExtraMoves !== null) {
                                tempOpponentExtraMoves = formationUpdate.extraMoves;
                                tempOpponentPosition = [pos.row, pos.col];
                                console.log(`2-${currentColor}自己可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition),tempOpponentExtraMoves);
                                break;
                            }
                            // 判断该棋子周围没有自己的棋子，使用AJACENT判断
                            let hasAjacent = false;
                            for (const dir of DIRECTIONS.ADJACENT) {
                                if (hasValidPiece(opponentColor,pos.row + dir.dx, pos.col + dir.dy, board)) {
                                    hasAjacent = true;
                                    break;
                                }
                            }
                            if (!hasAjacent ) {
                                tempOpponentExtraMoves = formationUpdate.extraMoves;
                                tempOpponentPosition = [pos.row, pos.col];
                                console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                                break;
                            }
                            // 再找最多斜的那个
                            if (largestMoves < thisPosExtraMoves ) {
                                largestMoves = thisPosExtraMoves;
                                tempOpponentExtraMoves = formationUpdate.extraMoves;
                                tempOpponentPosition = [pos.row, pos.col];
                                onsole.log(`1-${currentColor}duifang可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition),tempOpponentExtraMoves);
                                continue;
                            } else if (largestMoves === formationUpdate.extraMoves) {
                                console.log(`1-${currentColor}对方可能形成xie阵型的位置:`, JSON.stringify(pos),largestMoves);
                            }
                            if (data.isDebug) {
                                console.log(`1-${currentColor}对方可能形成xie阵型的位置:`, newRow, newCol);
                            }
                        }
                    }
                    if (formationUpdate.formationType.includes('方') || formationUpdate.formationType.includes('龙')) {
                        // 再判断相对新位置的左右方向
                        if ((!isInBoard(newRow, newCol + 1) || board[newRow][newCol + 1] === null || board[newRow][newCol + 1].color === currentColor) && hasValidPiece(currentColor, newRow, newCol - 1, board)) {
                            tempOpponentExtraMoves = formationUpdate.extraMoves;
                            tempOpponentPosition = [newRow, newCol - 1];
                            console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                            break;
                        }
                        if ((!isInBoard(newRow, newCol - 1) || board[newRow][newCol - 1] === null || board[newRow][newCol - 1].color === currentColor) && hasValidPiece(currentColor, newRow, newCol + 1, board)) {
                            tempOpponentExtraMoves = formationUpdate.extraMoves;
                            tempOpponentPosition = [newRow, newCol + 1];
                            console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                            break;
                        }
                        // 再判断上下移动
                        if (hasValidPiece(opponentColor,row + 2 * dir.dx, newCol, board)) {
                            tempOpponentExtraMoves = formationUpdate.extraMoves;
                            tempOpponentPosition = [row + 2 * dir.dx, newCol];
                            console.log(`1-${currentColor}对方可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                            break;
                        }
                    }

                }

                // 判断一下extramoves，记录到tempPosition和tempExtraMoves中
                if (tempOpponentExtraMoves < formationUpdate.extraMoves) { // 如果有额外移动次数
                    tempOpponentExtraMoves = formationUpdate.extraMoves;
                    tempOpponentPosition = [row, col];
                    break;
                } else {
                    console.log(`1-${currentColor}有多个对方可能形成阵型的位置:`, [row, col], JSON.stringify(tempOpponentPosition));
                }
            }

            if (isFirstRemove) {
                continue;
            }

            // 如果对当前棋子检查之后获取了对方可能形成阵型的位置，则继续
            if (tempOpponentPosition) {
                if (data.isDebug) {
                    console.log(`1-${currentColor}duifang可能形成阵型的位置:`, JSON.stringify(tempOpponentPosition));
                }
                continue
            }

            const newExtraMoves = evaluateFormation(row, col, currentColor, opponentColor, board, tempExtraMoves);
            if (newExtraMoves !== null) {
                tempPosition = [row, col];
                tempExtraMoves = newExtraMoves;
                if (data.isDebug) {
                    console.log(`3-${currentColor}自己可能形成阵型的位置:,newExtraMoves`, JSON.stringify(tempPosition),tempExtraMoves);
                }
                continue;
            }

            nonFormationPieces.push(piece);
        }
    }

    const finalPositions = [];
    if (isFirstRemove && tempPosition) {
        console.log(`1-${currentColor}-isFirstRemove-可能形成阵型的位置:`, JSON.stringify(tempPosition));
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
        console.log(`1-${currentColor}-tempOpponentPosition-可能形成阵型的位置:`, JSON.stringify(tempPosition));
        const squareResult = checkSquare(tempOpponentPosition[0], tempOpponentPosition[1], opponentColor, board);
        if (squareResult.squareCount === 0) {
            finalPositions.push({
                action: 'removing',
                position: tempOpponentPosition
            });
            return finalPositions;
        }
    }

    if (tempPosition) {
        console.log(`1-${currentColor}--可能形成阵型的位置:`, JSON.stringify(tempPosition));
        const squareResult = checkSquare(tempPosition[0], tempPosition[1], opponentColor, board);
        if (squareResult.squareCount === 0) {
            finalPositions.push({
                action: 'removing',
                position: tempPosition
            });
            return finalPositions;
        }
    }

    validPositions.push(...nonFormationPieces);
    validPositions.push(...diagonalOrDragonPieces);

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

export function getValidMoves(playerColor, opponentColor, data) {
    const board = data.board;
    let tempExtraMoves = 0;
    let tempOpponentExtraMoves = 0;
    const finalPositions = [];
    const validMoves = [];
    const worstMoves = [];
    let betterMoves = null;
    let goodMoves = null;

    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            if (!hasValidPiece(playerColor, row, col, board)) {
                continue;
            }
            const tempBoard = JSON.parse(JSON.stringify(board));
            tempBoard[row][col] = null;
            // 记录当前棋子周边己方和对方棋子数量
            let countAdjacent = 0;
            let countAdjacentOpponent = 0
            let possiblePosition = null;
            let commonPositions = [];
            for (const dir of DIRECTIONS.ADJACENT) {
                const newRow = row + dir.dx;
                const newCol = col + dir.dy;
                if (hasValidPiece(opponentColor, newRow, newCol, board)) {
                    countAdjacentOpponent++;
                    continue;
                }
                if (hasValidPiece(playerColor, newRow, newCol, board)) {
                    countAdjacent++;
                    continue;
                }
                if (!canPlace(newRow, newCol, tempBoard)) {
                    continue;

                }

                // 可以移动，先判断移动后自己能不能形成阵型                
                const formationUpdate = checkFormation(newRow, newCol, playerColor, tempBoard);
                if (formationUpdate) {
                    if (tempExtraMoves < formationUpdate.extraMoves) {
                        tempExtraMoves = formationUpdate.extraMoves;
                        betterMoves = {
                            position: [row, col],
                            newPosition: [newRow, newCol]
                        };
                        debugLog(data.isDebug,`1-${playerColor}-move后自己会形成阵型betterMoves: `, betterMoves);
                    } else {
                        debugLog(data.isDebug,`1-${playerColor}-move到${newRow},${newCol}后自己会形成阵型但是获得的奖励与之前的一样,待考虑是否返回: `, betterMoves);
                    }
                    continue;
                }

                // 再判断移动后是否会阻止对方形成阵型
                let canMoveFlag = false;                
                const opponentFormationUpdate = checkFormation(newRow, newCol, opponentColor, tempBoard);
                if (opponentFormationUpdate) {
                    const result = countAdjacentPieces(newRow, newCol, playerColor, opponentColor, tempBoard);                    
                    if (opponentFormationUpdate.formationType.includes('斜') && result.countAdjacentOpponent > 0) {
                        canMoveFlag = true;
                    } else if (opponentFormationUpdate.formationType.includes('龙')) {
                        if ((result.countAdjacentOpponent > 1 && isOnEdge(newRow, newCol)) || result.countAdjacentOpponent > 2) {
                            canMoveFlag = true;
                        }
                    } else if ((opponentFormationUpdate.formationType.includes('方') && result.countAdjacentOpponent > 2)) {
                        canMoveFlag = true;
                    } 
                }
                if (canMoveFlag) {
                    if (tempOpponentExtraMoves < opponentFormationUpdate.extraMoves) {
                        tempOpponentExtraMoves = opponentFormationUpdate.extraMoves;
                        // 是不是goodmoves需要进一步判断
                        possiblePosition = [newRow, newCol];
                        debugLog(data.isDebug, `2、${playerColor}-${row},${col}move可阻止对方形成阵型，但是需要进一步判断移动后对方还能组成阵型吗 `, possiblePosition);
                        continue;
                    } else {
                        debugLog(data.isDebug, `2、${playerColor}-${row},${col}move到${newRow},${newCol}可阻止对方形成阵型，但是对方形成的阵型奖励和之前的一个阵型一样多，待重新考虑并加以对比 `, tempOpponentExtraMoves);
                    }
                }

                // 既不能己方形成阵型，也不能阻止对方形成阵型，备选
                commonPositions.push([newRow, newCol]);
                debugLog(data.isDebug, `3、${playerColor}-${row},${col}移动到这些位置既不能己方形成阵型，也不能阻止对方形成阵型，备选：`, commonPositions);
            }

            // 如果截止当前还没有找到自己可以形成阵型的移动，则判断移动是否会给对方机会
            if (betterMoves) {
                continue;
            }
            let canNotMove = false;
            const destroyFormationUpdate = checkFormation(row, col, opponentColor, board);
            if (destroyFormationUpdate) {
                if (destroyFormationUpdate.formationType.includes('斜') && countAdjacentOpponent > 0) {
                    canNotMove = true;
                }
                else if (destroyFormationUpdate.formationType.includes('龙') && ((countAdjacentOpponent > 1 && isOnEdge(row, col)) || (countAdjacentOpponent > 2 && !isOnEdge(row, col)))) {
                    canNotMove = true;
                } else if ((destroyFormationUpdate.formationType.includes('方') && countAdjacentOpponent > 2)) {
                    canNotMove = true;
                }  
                // TODO 这里还需要考虑的是如果移动对方会形成3斜，不移动对方就形成5斜，这时要不要移动去封堵对方形成更大的阵型？
                if (canNotMove) {
                    if (destroyFormationUpdate.extraMoves > tempOpponentExtraMoves && commonPositions.length > 0) {
                        commonPositions.forEach(pos => {
                            worstMoves.push({
                                action: 'moving',
                                position: [row, col],
                                newPosition: pos
                            });
                        });
                        debugLog(data.isDebug, `4、${playerColor}-move后对方会形成阵型, worstMoves: `, worstMoves);
                        continue;
                    } else {
                        debugLog(data.isDebug, `4、${playerColor}-${row},${col}可移动可不移动，损失相同${destroyFormationUpdate.extraMoves}，待进一步分析:`, possiblePosition);
                    }
                }
            }

            if (possiblePosition) {
                goodMoves = {
                    position: [row, col],
                    newPosition: possiblePosition
                };
            }

            if (!canNotMove) {
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
        debugLog(data.isDebug, `5、${playerColor}既不能自己形成阵型，也不能阻止对方形成阵型`, validMoves);
        return validMoves;
    }
    debugLog(data.isDebug, `6、${playerColor}move后对方会形成阵型worstMoves:`, worstMoves);
    return worstMoves;
}

function evaluateFormation(row, col , currentColor, opponentColor, board, tempExtraMoves) {
    const formationUpdate = checkFormation(row, col, currentColor, board);
    if (formationUpdate) {
        const { countAdjacent, countAdjacentOpponent } = countAdjacentPieces(row, col, currentColor, opponentColor, board);
        console.log(`${currentColor}countAdjacent:${countAdjacent},countAdjacentOpponent:${countAdjacentOpponent}`);

        if ((formationUpdate.formationType.includes('方') && countAdjacent > 2) ) {
            if (tempExtraMoves < formationUpdate.extraMoves) {
                return formationUpdate.extraMoves;
            }
        } else if (formationUpdate.formationType.includes('龙') && ((countAdjacent > 1 && isOnEdge(row, col )) || (countAdjacent > 2 && !isOnEdge(row, col )))) {
            if (tempExtraMoves < formationUpdate.extraMoves) {
                return formationUpdate.extraMoves;
            }
        } else if (formationUpdate.formationType.includes('斜') && countAdjacent > 0 ) {
            if (tempExtraMoves < formationUpdate.extraMoves) {
                return formationUpdate.extraMoves;
            }
        }
    }
    return null;
}
function countAdjacentPieces(row, col, currentColor, opponentColor, board) {
    let countAdjacent = 0;
    let countAdjacentOpponent = 0;
    for (const dir of DIRECTIONS.ADJACENT) {
        const newRow = row + dir.dx;
        const newCol = col + dir.dy;
        if (hasValidPiece(currentColor, newRow, newCol, board)) {
            countAdjacent++;
        } else if (hasValidPiece(opponentColor, newRow, newCol, board)) {
            countAdjacentOpponent++;
        }
    }
    return { countAdjacent, countAdjacentOpponent };
}
