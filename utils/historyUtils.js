import { INITIAL_BOARD } from "./gameConstants";

export function saveUserMessageToHistory(phase, playerColor, updatedHistory, lastActionResult, board) {
    const boardState = getBoardState(board);
    const feedback = lastActionResult || '';

    // 定义消息模板
    const messageTemplate = `当前棋盘状态: ${JSON.stringify(boardState)} ，你的棋子颜色: ${playerColor}，` +
        `当前阶段: '${phase}'` +
        '。请根据当前棋局给出最佳决策。';

    // 返回新的历史记录
    return {
        gameHistory: [...updatedHistory, {
            role: "user",
            content: feedback + messageTemplate
        }]
    };
}
// 3.// filepath: d:\Documents\xiaochengxu\utils\historyUtils.js
export function saveAssistantMessageToHistory(gameHistory, content) {
    // 返回新的历史记录
    return [...gameHistory, {
        role: "assistant",
        content: typeof content === 'string' ? content : JSON.stringify(content)
    }];
}
// **获取当前棋盘状态**
function getBoardState(board) {
    if (!board) {
        board = INITIAL_BOARD;
    }
    return board.map(row => row.map(cell => cell ? {
        color: cell.color,
        isFormation: cell.isFormation
    } : null));
}

export function exportGameHistory(gameHistory) {
    return new Promise((resolve, reject) => {
        const basePath = `${wx.env.USER_DATA_PATH}/game_history`; // 基础路径
        const fileExtension = '.jsonl'; // 文件扩展名
        const maxFileSize = 5 * 1024 * 1024; // 5MB

        const data = JSON.stringify({ messages: gameHistory }) + '\n';

        const writeDataToFile = (index, files) => {
            if (index >= files.length) {
                // 如果所有文件都已满，创建新文件
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const newFilePath = `${basePath}_${timestamp}${fileExtension}`;
                wx.getFileSystemManager().writeFileSync(newFilePath, data, 'utf8');
                console.log("创建新文件:", newFilePath);
                resolve();
            } else {
                const filePath = `${wx.env.USER_DATA_PATH}/${files[index]}`;
                const stats = wx.getFileSystemManager().statSync(filePath);
                if (stats.size + data.length <= maxFileSize) {
                    // 向找到的未满文件追加数据
                    wx.getFileSystemManager().appendFileSync(filePath, data, 'utf8');
                    console.log("追加到现有文件:", filePath);
                    resolve();
                } else {
                    // 递归检查下一个文件
                    writeDataToFile(index + 1, files);
                }
            }
        };

        try {
            const files = wx.getFileSystemManager().readdirSync(wx.env.USER_DATA_PATH)
                .filter(file => file.startsWith('game_history') && file.endsWith(fileExtension))
                .sort((a, b) =>
                    wx.getFileSystemManager().statSync(`${wx.env.USER_DATA_PATH}/${b}`).birthtime -
                    wx.getFileSystemManager().statSync(`${wx.env.USER_DATA_PATH}/${a}`).birthtime
                );

            // 开始递归检查文件
            writeDataToFile(0, files);

        } catch (err) {
            console.error("文件操作失败:", err);
            reject(err);
        }
    });
}

export function debugLog(isDebug, message, data, ...args) {
    if (isDebug) {
        console.log(message, JSON.stringify(data), ...args);
    }
}