import { checkFormation, checkSquare, hasNonFormationPieces, hasNonSquarePieces } from './formationChecker.js';
import { isInBoard } from './boardUtils.js';
import { GAME_PHASES } from './gameConstants.js';

export function validatePosition(position, type, color, board) {
    const validations = {
        [GAME_PHASES.PLACING]: () => isValidPlacement(position, board),
        [GAME_PHASES.MOVING]: () => isValidMovement(position, board),
        [GAME_PHASES.REMOVING]: () => isValidRemoval(color, position, board)
    };

    return validations[type] ? validations[type]() : false;
}

function isValidPlacement(targetPosition, board) {
    return isInBoard(targetPosition) && !board[targetPosition.targetRow][targetPosition.targetCol];
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

    // 检查是否处于大方阵型
    const squareResult = checkSquare(targetPosition.targetRow, targetPosition.targetCol, opponentColor, board);
    if (squareResult.squareCount > 0) {
        const formationPositions = squareResult.formationPositions;
        if (hasNonSquarePieces(opponentColor, formationPositions, 0, 0, board)) return false;
    }

    return true;
}

export function isRepeatingMove(aicolor, startRow, startCol, targetRow, targetCol, data) {
    const historyKey = aicolor === 'black' ? 'blackLastMovedPiece' : 'whiteLastMovedPiece';
    const lastMove = data[historyKey];
    if (!lastMove) return false; // 第一次移动，不需要检测 

    // 检查是否与上一次移动相同
    const isSameMove = lastMove.startRow === targetRow &&
        lastMove.startCol === targetCol &&
        lastMove.targetRow === startRow &&
        lastMove.targetCol === startCol;

    if (!isSameMove) return false;

    // 模拟移动
    const tempBoard = JSON.parse(JSON.stringify(data.board));
    tempBoard[startRow][startCol] = null;
    tempBoard[targetRow][targetCol] = { color: aicolor, isFormation: false };

    // 检查是否形成阵型或获得额外吃子机会
    const formationUpdate = checkFormation(targetRow, targetCol, aicolor, tempBoard);

    // 如果移动对棋盘有积极影响，允许重复移动
    return !formationUpdate;
}