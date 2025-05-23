import { checkFormation, checkSquare, hasNonFormationPieces, hasNonSquarePieces } from './formationChecker.js';
import { canPlace } from './boardUtils.js';
import { CONFIG } from './gameConstants.js';
import { FORMATION_POSITIONS } from './formationPositions.js';
export function validatePosition(position, type, color, board) {
    const validations = {
        [CONFIG.GAME_PHASES.PLACING]: () => isValidPlacement(position, board),
        [CONFIG.GAME_PHASES.MOVING]: () => isValidMovement(position, board),
        [CONFIG.GAME_PHASES.REMOVING]: () => isValidRemoval(color, position, board)
    };

    return validations[type] ? validations[type]() : false;
}

function isValidPlacement(targetPosition, board) {
    return canPlace(targetPosition.targetRow, targetPosition.targetCol, board);
}

function isValidMovement(movePositions, board) {
    const { startRow, startCol, targetRow, targetCol } = movePositions;
    // 检查是否只移动一格
    if (Math.abs(targetRow - startRow) + Math.abs(targetCol - startCol) !== 1) {
        return false;
    }

    // 检查目标位置是否有效且为空
    return isValidPlacement({ targetRow, targetCol }, board);
}

function isValidRemoval(currentColor, targetPosition, board) {
    const piece = board[targetPosition.targetRow][targetPosition.targetCol];
    if (!piece) return false; // 目标为空
    const opponentColor = piece?.color;
    if (opponentColor === currentColor) {
        return false;
    }; // 只能移除对方的棋子
    // 如果棋子不在阵型中，可以直接移除
    if (!piece.isFormation) return true;

    return canRemovePiece(targetPosition, opponentColor, board);
}

function canRemovePiece(targetPosition, opponentColor, board) {
    // 如果棋盘上有不在阵型中的棋子，优先移除它们
    if (hasNonFormationPieces(opponentColor, board)) return false;

    // 检查是否处于大方阵型targetPosition.targetRow, targetPosition.targetCol, 
    const formationData = FORMATION_POSITIONS.get(`${targetPosition.targetRow}${targetPosition.targetCol}`);
    
        // 检查 square（大方）
    const squareResult = checkSquare(opponentColor, board, formationData.square);
    if (squareResult) {
        const formationPositions = squareResult.formationPositions;
        if (hasNonSquarePieces(opponentColor, formationPositions,board)) return false;
    }

    return true;
}

export function isRepeatingMove(aicolor, decision, data) {
    const historyKey = aicolor === 'black' ? 'blackLastMovedPiece' : 'whiteLastMovedPiece';
    const lastMove = data[historyKey];
    if (!lastMove) return false; // 第一次移动，不需要检测 

    // 检查是否与上一次移动相同
    const isSameMove = lastMove.startRow === decision.newPosition[0] &&
        lastMove.startCol === decision.newPosition[1] &&
        lastMove.targetRow === decision.position[0] &&
        lastMove.targetCol === decision.position[1];

    if (!isSameMove) return false;

    // 模拟移动
    let tempBoard = data.board;
    tempBoard[decision.position[0]][decision.position[1]] = null;
    tempBoard[decision.newPosition[0]][decision.newPosition[1]] = { color: aicolor, isFormation: false };
    // 检查是否形成阵型或获得额外吃子机会
    const formationUpdate = checkFormation(decision.newPosition[0], decision.newPosition[1], aicolor, tempBoard);
    // 恢复棋盘状态
    tempBoard[decision.position[0]][decision.position[1]] = { color: aicolor, isFormation: false };
    tempBoard[decision.newPosition[0]][decision.newPosition[1]] = null;
    // 如果移动对棋盘有积极影响，允许重复移动
    return !formationUpdate;
}