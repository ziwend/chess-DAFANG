import { requestAPI } from './requestUtils.js';
import { saveUserMessageToHistory, saveAssistantMessageToHistory } from './historyUtils.js';
import { getValidPositions } from './positionUtils.js';
import { isRepeatingMove } from './validationUtils.js';

export async function handleAITurn(phase, aicolor, data, setData, showMessage, processAIDecision) {
    if (data.isGameOver || data.playerConfig[aicolor].playerType === 'self') {
        return;
    }

    try {
        const decision = await fetchAIDecisionWithRetry(phase, aicolor, data, setData, showMessage);

        processAIDecision(phase, aicolor, decision);
    } catch (error) {
        console.error(`${aicolor}-AI决策失败，请重试:`, error);
        showMessage(`AI决策失败，请重试: ${error.message}`);
    }
}

async function fetchAIDecisionWithRetry(phase, aicolor, data, setData, showMessage) {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        let decision = null;
        let lastDecision = null;
        try {
            decision = await fetchAIDecision(phase, aicolor, data, setData, showMessage);
            return decision; // 成功获取决策后返回
        } catch (error) {
            retryCount++;
            

            // 如果是重复移动错误，保存最后一次决策
            if (error.message === 'AI 决策是重复移动') {
                lastDecision = error.decision; // 假设 error 中包含 decision
            } else {
                console.error(`${aicolor}-AI决策失败，重试 ${retryCount}/${maxRetries} 次:`, error);
            }

            // 重试 3 次后强制返回最后一次决策
            if (retryCount >= maxRetries) {
                if (lastDecision) {
                    console.warn('重试 3 次后仍然重复移动，强制接受决策');
                    return lastDecision;
                } else {
                    throw new Error(`重试 ${maxRetries} 次后仍然失败: ${error}`);
                }
            }

            await delay(1000); // 1 秒后重试
        }
    }
}
// 延时函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function fetchAIDecision(phase, aicolor, data, setData, showMessage) {
    // 获取有效位置
    const validPositions = getValidPositions(phase, aicolor, data);

    let jsonMatch;
    if (data.playerConfig[aicolor].playerType === 'ai') {
        // 根据阶段定义具体消息
        const phaseMessages = {
            placing: '{"action": "placing", "position": [row,col]}',
            moving: '{"action": "moving", "position": [row,col], "newPosition": [row,col]}',
            removing: '{"action": "removing", "position": [row,col]}'
        };

        // 获取并修改最后一条消息
        let gameHistory = data.gameHistory.map(msg => ({ ...msg }));  // 使用 let 声明
        if (gameHistory.length > 0) {
            const lastIndex = gameHistory.length - 1;
            if (typeof gameHistory[lastIndex].content === 'string') {
                gameHistory[lastIndex].content += `，可选的决策范围: ${JSON.stringify(validPositions)}。返回的content只能按照这样的格式输出：${phaseMessages[phase]}`;
            }
        }
        const { url, model, apiKey } = data.playerConfig[aicolor].aiConfig;
        const response = await requestAPI(url, 'POST', {
            model: model,
            messages: gameHistory,
            temperature: 1.0,
            stream: false
        }, {
            'Authorization': `Bearer ${apiKey}`
        }, setData);

        // 用完立马释放
        gameHistory = null;

        if (!response) throw new Error('API 响应为空');

        const content = url.includes('completions') ? response.choices?.[0]?.message?.content : response.message?.content;

        if (!content || typeof content !== 'string') {
            throw new Error('AI 返回的内容无效');
        }
        if (data.isDebug) {
            console.log(`ai 决策 =`, JSON.stringify(content));
        }

        jsonMatch = content.match(/\{.*\}/);
        if (!jsonMatch) {
            updateHistoryAndThrowError(phase, aicolor, content, '未找到有效 JSON 数据', data, setData);
        }

    } else { // 不使用 AI 时，本地生成决策
        jsonMatch = getRandomDecision(validPositions, data, setData);
    }

    if (data.isDebug) {
        console.log(`${aicolor === 'black' ? '黑方' : '白方'}, 决策 =`, jsonMatch[0]);
    }

    let decision;
    try {
        decision = JSON.parse(jsonMatch[0]);
    } catch (error) {
        updateHistoryAndThrowError(phase, aicolor, jsonMatch[0], `JSON 解析失败: ${error.message}`, data, setData);
    }

    if (!isDecisionValid(decision, validPositions)) {
        updateHistoryAndThrowError(phase, aicolor, jsonMatch[0], 'AI 决策无效', data, setData);
    }

    if (phase === 'moving' && validPositions.length > 1 && isRepeatingMove(aicolor, decision.position[0], decision.position[1], decision.newPosition[0], decision.newPosition[1], data)) {
        updateHistoryAndThrowError(phase, aicolor, jsonMatch[0], 'AI 决策是重复移动', data, setData);
    }

    return decision;
}

function updateHistoryAndThrowError(phase, aicolor, content, errorMessage, data, setData) {
    const updatedHistory = saveAssistantMessageToHistory(data.gameHistory, content);
    const lastActionResult = `AI 决策: ${JSON.stringify(content)} ，${errorMessage}，请参考用户给出的格式及备选范围，重新生成决策。`;
    const userMessage = saveUserMessageToHistory(phase, aicolor, updatedHistory, lastActionResult, data.board);
    setData({
        gameHistory: userMessage.gameHistory
    });
    if (data.isDebug) {
        console.log(`${aicolor}-AI 决策 ${errorMessage}`);
    }
    throw new Error(errorMessage);
}

function getRandomDecision(validPositions, data, setData) {
    const randomIndex = Math.floor(Math.random() * validPositions.length);
    let randomDecision = null;
    if (validPositions.length > 1) {
        if (data.lastRandomDecision !== randomIndex) {
            randomDecision = validPositions[randomIndex];
            setData({
                lastRandomDecision: randomIndex
            });
            return [JSON.stringify(randomDecision)];
        } else {
            if (data.isDebug) {
                console.log('随机决策已重复', randomIndex, JSON.stringify(validPositions));
            }
            return getRandomDecision(validPositions, data, setData);            
        }
    }

    return [JSON.stringify(validPositions[0])];
}

function isDecisionValid(decision, validPositions) {
    const isPositionValid = (position) => {
        return Array.isArray(position) &&
            position.length === 2 &&
            typeof position[0] === 'number' &&
            typeof position[1] === 'number';
    };

    if (!decision || !decision.action || !decision.position || !isPositionValid(decision.position) ||
        (decision.newPosition && !isPositionValid(decision.newPosition))) {
        return false;
    }

    switch (decision.action) {
        case 'placing':
        case 'removing':
            return validPositions.some(pos => pos.action === decision.action && pos.position[0] === decision.position[0] && pos.position[1] === decision.position[1]);
        case 'moving':
            return validPositions.some(move => move.action === decision.action && move.position[0] === decision.position[0] && move.position[1] === decision.position[1] && move.newPosition[0] === decision.newPosition[0] && move.newPosition[1] === decision.newPosition[1]);
        default:
            return false;
    }
}
