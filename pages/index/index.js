// 导入游戏常量
import { PLAYERS, GAMEHISTORY, NUMBERS, INITIAL_BOARD, GAME_PHASES, INIT_MESG } from '../../utils/gameConstants.js';
// 导入 棋手配置管理函数
import { loadPlayerConfig } from '../../utils/playerConfigManager.js';
import { isStillInFormation, checkFormation } from '../../utils/formationChecker.js';
import { saveUserMessageToHistory, saveAssistantMessageToHistory, exportGameHistory } from '../../utils/historyUtils.js';
import { hasValidMoves, updateBoard, isMaxPiecesCount, isBoardWillFull } from '../../utils/boardUtils.js';
import { handleAITurn } from '../../utils/aiUtils.js';
import { validatePosition } from '../../utils/validationUtils.js';

// 游戏主页面逻辑
Page({
    data: {
        players: PLAYERS,        // 玩家颜色
        message: INIT_MESG,        // 游戏状态提示           
        gameHistory: [],
        isDebug: true,
        lastRandomDecision: null,  // 新增：存储上一次的随机决策
        isGameStarted: false,
        isGameOver: false,
        boardRectCache: null  // 新增：缓存棋盘边界矩形
    },

    // 跳转到规则页面
    goToRules: function () {
        wx.navigateTo({
            url: '/pages/rules/rules'
        });
    },

    goToPlayerSetting: function (e) {
        const color = e.currentTarget.dataset.color;
        wx.navigateTo({
            url: `/pages/aiSetting/aiSetting?color=${color}`
        });
    },
    openMenu: function () {
        wx.showActionSheet({
            itemList: ['检查更新'], // 添加“检查更新”选项
            success: function (res) {
                console.log('用户选择了：', res.tapIndex);
                // 根据选择的菜单项执行相应操作
                if (res.tapIndex === 0) {
                    // 跳转到 GitHub Releases 页面
                    wx.setClipboardData({
                        data: 'https://github.com/ziwend/chess-DAFANG/releases',
                        success: function () {
                            wx.showModal({
                                title: '链接已复制，请在浏览器中打开',
                                showCancel: false,
                                confirmText: 'OK'
                            });
                        }
                    });
                }
            },
            fail: function (res) {
                console.log('用户取消了菜单');
            }
        });
    },
    // 从配置页面返回会重新加载
    onShow: function () {
        const playerConfig = loadPlayerConfig();
        if (this.data.isDebug) {
            console.log('onShow加载配置', JSON.stringify(playerConfig));
        }

        this.setData({
            playerConfig: playerConfig
        });
    },

    startGame: function () {
        const updateData = {
            board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
            currentPlayer: 0,            // 重置当前玩家为黑方
            dragPiece: null,            // 当前拖动的棋子信息
            blackCount: 0,            // 重置黑方棋子数量
            whiteCount: 0,            // 重置白方棋子数量
            extraMoves: 0,            // 重置额外移动次数
            gamePhase: GAME_PHASES.PLACING,            // 重置游戏阶段为放置阶段，游戏阶段：'placing'（布子）, 'moving'（移动）, 'removing'（吃子）
            isGameStarted: true,
            isGameOver: false,            // 新增游戏结束标志 
            message: '',            // 清空状态栏提示        
            elapsedTime: '00:00',            // 重置计时器
            flashPiece: {
                row: null,
                col: null
            },            // 重置闪烁棋子位置
            requestTask: null,            // 重置请求任务
            isExchangeRemoving: false,            // 重置交换吃子标志
            lastTapTime: null,            // 新增变量，用于记录上次点击时间
            blackLastMovedPiece: null,
            whiteLastMovedPiece: null,
            lastActionResult: null,
            isAnimationInProgress: false, // 新增：标记动画是否正在进行
        };
        // 启动计时器
        const timer = setInterval(() => {
            this.updateElapsedTime();
        }, 1000);
        updateData.timer = timer;
        if (this.data.isDebug) {
            // 添加用户消息到历史记录
            const userMessage = this.saveUserMessageToHistory("placing", "black", GAMEHISTORY, '');
            updateData.gameHistory = userMessage.gameHistory;
        }

        // 一次性更新所有数据
        this.setData(updateData);

        // TODO 判断一下如果当前config，黑色有配置，则当前AI
        this.handleAITurn(GAME_PHASES.PLACING, PLAYERS[this.data.currentPlayer]);
        this.showMessage("开局布子");
    },

    updateElapsedTime: function () {
        const currentTime = this.data.elapsedTime;
        const [minutes, seconds] = currentTime.split(':').map(Number);

        let newSeconds = seconds + 1;
        let newMinutes = minutes;

        if (newSeconds >= 60) {
            newSeconds = 0;
            newMinutes += 1;
        }

        const formattedTime = `${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}`;
        this.setData({
            elapsedTime: formattedTime
        });
    },

    restartGame: function () {
        if (this.data.timer) clearInterval(this.data.timer);
        if (this.data.requestTask) this.data.requestTask.abort();
        this.startGame();
    },
    // 检查游戏是否结束 this.data[`${currentColor}Count`]
    checkGameOver: async function () {
        const currentColor = this.data.players[this.data.currentPlayer];
        const opponentColor = currentColor === 'black' ? 'white' : 'black';
        const opponent = currentColor === 'black' ? '白方' : '黑方';
        const player = currentColor === 'black' ? '黑方' : '白方';
        // 还要修改第二个condition，当获得了额外移动次数，是没有切换棋手的，还是当前方
        const conditions = [{
            check: () => this.data[`${currentColor}Count`] < NUMBERS.MIN_PIECES_TO_WIN,
            feedback: `当前棋手的棋子少于3颗，对方${opponent}获胜`,
            winner: `${opponent}`
        },
        {
            check: () => this.data.extraMoves > 0 && this.data.extraMoves + NUMBERS.MIN_PIECES_TO_WIN > this.data[`${opponentColor}Count`],
            feedback: `对方吃子后，剩余棋子少于3颗，对方${opponent}获胜`,
            winner: `${player}`
        },
        {
            check: () => this.data.gamePhase === GAME_PHASES.MOVING && !this.hasValidMoves(currentColor),
            feedback: `当前棋手无棋子可以移动，对方${opponent}获胜`,
            winner: `${opponent}`
        }];

        for (const { check, winner, feedback } of conditions) {
            if (check()) {
                this.setData({
                    isGameOver: true,
                    isGameStarted: false,
                    gameHistory: [...this.data.gameHistory,
                    {
                        role: "user",
                        content: `游戏结束，获胜方: ${winner}`
                    },
                    {
                        role: "assistant",
                        content: `是的，因为: ${feedback}`
                    }
                    ]
                });

                if (this.data.isDebug) {
                    console.log(`游戏结束，获胜方: ${winner} ，因为: ${feedback}`);
                    // 等待导出完成
                    await this.exportGameHistory();
                }

                return winner; // 游戏结束，返回winner             
            }
        }

        return null; // 游戏未结束
    },

    hasValidMoves: function (currentColor) {
        return hasValidMoves(currentColor, this.data.board);
    },

    showGameOver: function (winner) {
        const tempFlag = true;
        if (this.data.isDebug && !tempFlag) {
            // 这里节省测试时间，正常还恢复对话框
            this.restartGame();
        } else {
            wx.showModal({
                title: `游戏结束，获胜方: ${winner}`,
                showCancel: false,
                confirmText: '重新开始',
                success: (res) => {
                    if (res.confirm) {
                        this.restartGame();
                    }
                }
            });
        }
    },

    onUnload: function () {
        if (this.data.timer) {
            clearInterval(this.data.timer);
            this.setData({ timer: null });
        }
        if (this.data.requestTask) {
            this.data.requestTask.abort();
            this.setData({ requestTask: null });
        }
        // 清理其他可能的资源
        this.setData({
            gameHistory: [],
            board: [],
            // ... 其他需要清理的状态
        });
        if (this.data.isDebug) {
            console.log('onUnload', JSON.stringify(this.data));
        }
    },

    // -------------手动下棋控制逻辑开始--------------
    handleDragStart: function (e) {
        // 非移动阶段不处理
        if (this.data.gamePhase !== GAME_PHASES.MOVING) {
            return;
        }
        const {
            row,
            col,
            color
        } = e.currentTarget.dataset;

        // 检查是否是当前玩家的回合
        const currentColor = this.data.players[this.data.currentPlayer];
        if (color !== currentColor) {
            this.showMessage('只能移动己方棋子');
            return;
        }
        if (this.data.playerConfig[currentColor].playerType !== 'self') {
            return;
        }

        this.setData({
            dragPiece: {
                color: color,
                startRow: row,
                startCol: col
            }
        });
    },

    handleTouchEnd: async function (e) {
        if (!this.data.isGameStarted) {
            return;
        }

        if (this.data.isAnimationInProgress) {
            this.showMessage('动画未结束，请稍后再试');
            return;
        }
        // 判断一下移动阶段是否有效
        if (this.data.gamePhase === GAME_PHASES.MOVING && !this.data.dragPiece) {
            this.showMessage('请选中要移动的棋子拖动');
            return;
        }

        const touch = e.changedTouches[0];
        const position = await this.getBoardPosition(touch);
        if (!position) return;
        const {
            boardX,
            boardY,
            boardRect
        } = position;

        // 棋子半径（假设为20px，根据实际棋子大小调整）
        const pieceRadius = 20;

        // 有效范围检测，考虑棋子半径
        const minX = -pieceRadius;
        const maxX = boardRect.width + pieceRadius;
        const minY = -pieceRadius;
        const maxY = boardRect.height + pieceRadius;

        if (boardX < minX || boardX > maxX || boardY < minY || boardY > maxY) {
            return;
        }

        // 计算点击的交叉点
        const cellSize = boardRect.width / 5; // 棋盘总宽度除以5个格子
        // 计算最近的交叉点
        let targetCol = Math.round(boardX / cellSize);
        let targetRow = Math.round(boardY / cellSize);

        // 边界检查
        targetCol = Math.max(0, Math.min(5, targetCol));
        targetRow = Math.max(0, Math.min(5, targetRow));

        // 检查点击位置是否在交叉点附近
        const clickX = targetCol * cellSize;
        const clickY = targetRow * cellSize;
        const tolerance = pieceRadius; // 使用棋子半径作为容差范围
        if (Math.abs(boardX - clickX) > tolerance || Math.abs(boardY - clickY) > tolerance) {
            // 点击位置离交叉点太远，忽略
            return;
        }

        // 获取当前玩家颜色
        const currentColor = this.data.players[this.data.currentPlayer];
        if (this.data.playerConfig[currentColor].playerType !== 'self') {
            return;
        }
        const targetPosition = { targetRow, targetCol };
        // 处理不同游戏阶段
        switch (this.data.gamePhase) {
            case GAME_PHASES.PLACING:
                this.handlePlace(currentColor, targetPosition);
                break;
            case GAME_PHASES.MOVING:
                const {
                    startRow,
                    startCol
                } = this.data.dragPiece;
                const movePositions = {
                    startRow, startCol, targetRow, targetCol
                };
                this.handleMove(currentColor, movePositions);
                break;
            case GAME_PHASES.REMOVING:
                this.handleRemove(currentColor, targetPosition);
                break;
            default:
                this.showMessage('当前阶段不支持此操作');
                break;
        }
    },

    getBoardPosition: function (touch) {
        if (!this.data.boardRectCache) {
            const query = wx.createSelectorQuery();
            query.select('.board').boundingClientRect();
            return new Promise((resolve) => {
                query.exec((res) => {
                    if (res && res[0]) {
                        this.setData({ boardRectCache: res[0] });
                        const boardX = touch.clientX - res[0].left;
                        const boardY = touch.clientY - res[0].top;
                        resolve({
                            boardX,
                            boardY,
                            boardRect: res[0]
                        });
                    } else {
                        resolve(null);
                    }
                });
            });
        } else {
            const boardX = touch.clientX - this.data.boardRectCache.left;
            const boardY = touch.clientY - this.data.boardRectCache.top;

            return Promise.resolve({
                boardX,
                boardY,
                boardRect: this.data.boardRectCache
            });
        }
    },

    handlePlace: function (currentColor, targetPosition) {
        if (!this.validatePosition(targetPosition, this.data.gamePhase, currentColor)) {
            this.handleInvalidPlacement(currentColor, targetPosition);
            return;
        }
        this.handlePlaceDrop(currentColor, targetPosition);
    },

    // 处理无效的放置
    handleInvalidPlacement: function (color, targetPosition) {
        const message = `${color}方上次放置的位置 [${targetPosition}] 无效，请重新选择`;
        this.showMessage(message);
    },
    // 处理放置阶段的落子逻辑
    handlePlaceDrop: function (currentColor, targetPosition) {
        const { targetRow, targetCol } = targetPosition;
        // 更新棋盘状态
        const newBoard = this.updateBoard(currentColor, null, null, targetRow, targetCol);
        const formationUpdate = this.checkFormation(targetRow, targetCol, currentColor, newBoard);

        // 计算更新数据
        let updateData = {
            board: newBoard,
            [`${currentColor}Count`]: this.data[`${currentColor}Count`] + 1,
        };
        if (formationUpdate) {
            formationUpdate.formationPositions.forEach(pos => {
                if (newBoard[pos.row] && newBoard[pos.row][pos.col] && newBoard[pos.row][pos.col].isFormation === false) {
                    newBoard[pos.row][pos.col].isFormation = true;
                }
            });

            // 显示提示
            this.showMessage('形成了' + formationUpdate.formationType);
            Object.assign(updateData, formationUpdate);
            updateData.lastActionResult = `你上次落子的位置[${targetRow},${targetCol}]形成了'${formationUpdate.formationType}'阵型，获得了${formationUpdate.extraMoves}次额外落子机会。`;
        }
        // 处理特殊情况
        if (this.isBoardWillFull()) {
            Object.assign(updateData, {
                extraMoves: 1,
                message: `请移除${this.data.currentPlayer === 1 ? '黑方' : '白方'}棋子`,
                isExchangeRemoving: true
            });
        } else if (this.data.extraMoves > 0) {
            updateData.extraMoves = this.data.extraMoves - 1;
            if (updateData.extraMoves === 0) updateData.currentPlayer = 1 - this.data.currentPlayer;
        } else if (!formationUpdate) {
            updateData.currentPlayer = 1 - this.data.currentPlayer;
        }

        updateData.flashPiece = {
            row: targetRow,
            col: targetCol
        };
        updateData.isAnimationInProgress = true;

        //更新place记录
        const decision = {
            action: GAME_PHASES.PLACING,
            position: [targetRow, targetCol]
        };
        if (this.data.isDebug) {
            updateData.gameHistory = [...this.data.gameHistory, {
                role: "assistant",
                content: JSON.stringify(decision)
            }];
        }

        // 更新数据并设置闪动棋子
        this.setData(updateData);
    },

    // 新增：检查棋盘是否已满
    isBoardWillFull: function () {
        return isBoardWillFull(this.data);
    },

    // 抽取：处理移动操作
    handleMove: function (color, movePositions) {
        if (!this.validatePosition(movePositions, this.data.gamePhase, color)) {
            this.handleInvalidMove(color, movePositions);
            return;
        }
        this.handleMoveDrop(color, movePositions);
    },

    handleInvalidMove: function (color, movePositions) {
        const message = `${color}方上次移动的位置 [${movePositions}] 无效，请重新选择`;
        this.showMessage(message);
    },

    // 处理移动阶段的落子逻辑
    handleMoveDrop: function (color, movePositions) {
        const {
            startRow,
            startCol,
            targetRow,
            targetCol
        } = movePositions;
        // 更新棋盘
        const newBoard = this.updateBoard(color, startRow, startCol, targetRow, targetCol);
        const formationUpdate = this.checkFormation(targetRow, targetCol, color, newBoard);

        let updateData = {
            board: newBoard,

        };

        const formationUpdateDestroy = this.checkFormation(startRow, startCol, color, this.data.board);
        if (formationUpdateDestroy) {
            if (formationUpdateDestroy.formationPositions && Array.isArray(formationUpdateDestroy.formationPositions)) {
                formationUpdateDestroy.formationPositions.forEach(pos => {
                    if (newBoard[pos.row][pos.col]) {
                        // 检查该棋子是否仍然参与其他阵型
                        const isStillInFormation = this.isStillInFormation(pos.row, pos.col, color, newBoard);
                        if (!isStillInFormation) {
                            newBoard[pos.row][pos.col].isFormation = false;
                        }
                    }
                });
            }
        }

        if (formationUpdate) {
            formationUpdate.formationPositions.forEach(pos => {
                if (newBoard[pos.row] && newBoard[pos.row][pos.col] && newBoard[pos.row][pos.col].isFormation === false) {
                    newBoard[pos.row][pos.col].isFormation = true;
                }
            });

            // 显示提示
            this.showMessage('形成' + formationUpdate.formationType);
            Object.assign(updateData, formationUpdate);
            updateData.lastActionResult = `你上次移动到的位置[${targetRow},${targetCol}]形成了'${formationUpdate.formationType}'阵型，获得了${formationUpdate.extraMoves}次吃子机会。`;

            updateData.message = `请移除${this.data.currentPlayer === 1 ? '黑方' : '白方'}棋子`;
        } else {
            updateData.currentPlayer = 1 - this.data.currentPlayer;
            updateData.message = `请${this.data.currentPlayer === 1 ? '黑方' : '白方'}移动棋子`;
            updateData.extraMoves = 0; //没有形成阵型
        }

        const historyKey = color === 'black' ? 'blackLastMovedPiece' : 'whiteLastMovedPiece';

        updateData[historyKey] = {
            startRow,
            startCol,
            targetRow,
            targetCol
        }; // 记录最后一次移动

        updateData.flashPiece = {
            row: targetRow,
            col: targetCol
        };
        updateData.isAnimationInProgress = true;
        updateData.dragPiece = null;

        // 直接保存 decision
        const decision = {
            action: GAME_PHASES.MOVING,
            position: [startRow, startCol],
            newPosition: [targetRow, targetCol]
        };

        const currentHistory = Array.isArray(this.data.gameHistory) ? this.data.gameHistory : [];
        if (this.data.isDebug) {
            updateData.gameHistory = [...currentHistory, {
                role: "assistant",
                content: JSON.stringify(decision)
            }];
        }

        // 更新数据并设置闪动棋子
        this.setData(updateData);
    },

    // 抽取：处理手动双击移除操作
    handleRemove: function (currentColor, targetPosition) {
        // 吃子阶段：双击对方棋子
        if (!this.lastTapTime) {
            this.lastTapTime = Date.now();
        } else if (Date.now() - this.lastTapTime < 600) { // 调整为500ms   
            // 移除对方棋子            
            if (!this.validatePosition(targetPosition, this.data.gamePhase, currentColor)) {
                const message = `你上次选择移除的位置: [${targetPosition}]无效，有更优先的棋子可移除，请重新选择`;
                this.showMessage(message);
                return;
            }

            this.handleRemovePhase(targetPosition);
            this.lastTapTime = null;
        } else {
            this.lastTapTime = Date.now();
            this.showMessage('请再点击一次移除对方的棋子');
        }
    },

    validatePosition: function (position, type, color) {
        return validatePosition(position, type, color, this.data.board);
    },

    // 处理吃子阶段
    handleRemovePhase: function (targetPosition) {
        let updateData = {
            flashPiece: {
                row: targetPosition.targetRow,
                col: targetPosition.targetCol
            },
            isAnimationInProgress: true
        };

        // 更新数据并设置闪动棋子
        this.setData(updateData);
        // 设置动画，删除逻辑在动画后处理
    },

    onAnimationEnd: async function (e) {
        // 标记动画结束
        let updateData = {
            flashPiece: {
                row: null,
                col: null
            },
            isAnimationInProgress: false
        };
        if (this.data.gamePhase === GAME_PHASES.MOVING) {
            // 先检查游戏是否结束
            const winner = await this.checkGameOver();
            if (winner) {
                this.showGameOver(winner);
                return;
            }
            if (this.data.extraMoves > 0) {
                updateData.gamePhase = GAME_PHASES.REMOVING;
            } else {
                updateData.gamePhase = GAME_PHASES.MOVING;
            }
            if (this.data.isDebug) {
                const userMessage = this.saveUserMessageToHistory(updateData.gamePhase, this.data.players[this.data.currentPlayer], this.data.gameHistory, this.data.lastActionResult);
                updateData.gameHistory = userMessage.gameHistory;
            }

            updateData.lastActionResult = null;
            this.setData(updateData);

            this.handleAITurn(this.data.gamePhase, this.data.players[this.data.currentPlayer]);
        } else if (this.data.gamePhase === GAME_PHASES.PLACING) {
            // 放置最后一颗棋子后
            // 检查棋盘是否已满
            if (this.isMaxPiecesCount()) {
                this.showMessage("棋盘已满，开始提子！");
                updateData.gamePhase = GAME_PHASES.REMOVING;
            } else {
                updateData.gamePhase = GAME_PHASES.PLACING;
            }

            if (this.data.isDebug) {
                // 增加一下操作的日志 
                const userMessage = this.saveUserMessageToHistory(updateData.gamePhase, this.data.players[this.data.currentPlayer], this.data.gameHistory, this.data.lastActionResult);
                updateData.gameHistory = userMessage.gameHistory;
            }

            updateData.lastActionResult = null;

            this.setData(updateData);

            this.handleAITurn(this.data.gamePhase, this.data.players[this.data.currentPlayer]);
        } else {
            const { row, col, color } = e.currentTarget.dataset;
            // 如果是移除阶段      
            this.handleAfterRemove(row, col, color);
        }
    },

    isMaxPiecesCount: function () {
        return isMaxPiecesCount(this.data);
    },

    // 处理移除棋子后的游戏状态
    handleAfterRemove: async function (row, col, color) {
        // 更新棋盘
        let newBoard = this.updateBoard(null, row, col, null, null);

        let updateData = {
            board: newBoard,
            flashPiece: {
                row: null,
                col: null
            },
            [`${color}Count`]: this.data[`${color}Count`] - 1,
            isAnimationInProgress: false
        };

        const formationUpdateDestroy = this.checkFormation(row, col, color, this.data.board);
        // 移除棋子后处理阵型状态
        if (formationUpdateDestroy && formationUpdateDestroy.formationPositions) {
            formationUpdateDestroy.formationPositions.forEach(pos => {
                if (newBoard[pos.row][pos.col]) {
                    const isStillInFormation = this.isStillInFormation(pos.row, pos.col, color, newBoard);
                    if (!isStillInFormation) newBoard[pos.row][pos.col].isFormation = false;
                }
            });
        }

        if (!this.data.isExchangeRemoving) { // 修改之后存在数字和message不同步的问题，如果把extramoves计数移动到这里就存在连续删除2个只计数一次的问题；
            if (this.data.extraMoves === 1) {
                updateData = {
                    ...updateData,
                    currentPlayer: 1 - this.data.currentPlayer,
                    gamePhase: GAME_PHASES.MOVING,
                    message: `请${this.data.currentPlayer === 1 ? '黑方' : '白方'}移动棋子`,
                    extraMoves: this.data.extraMoves - 1
                };
            } else {
                updateData = {
                    ...updateData,
                    message: `请继续移除${this.data.currentPlayer === 1 ? '黑方' : '白方'}棋子`,
                    extraMoves: this.data.extraMoves - 1
                };
            }
        } else { // 交换吃子
            updateData = {
                ...updateData,
                isExchangeRemoving: false,
                currentPlayer: 1 - this.data.currentPlayer,
                extraMoves: 1,
                message: `请移除${this.data.currentPlayer === 0 ? '黑方' : '白方'}棋子`,
            };
        }

        if (this.data.isDebug) {
            // 直接保存 decision
            const decision = {
                action: GAME_PHASES.REMOVING,
                position: [row, col]
            };
            updateData.gameHistory = [...this.data.gameHistory, {
                role: "assistant",
                content: JSON.stringify(decision)
            }];
        }

        // 更新数据并检查游戏是否结束
        this.setData(updateData);
        const winner = await this.checkGameOver();
        if (winner) {
            this.showGameOver(winner);
            return;
        }

        if (this.data.isDebug) {
            // 添加用户消息到历史记录
            const userMessage = this.saveUserMessageToHistory(
                this.data.gamePhase,
                this.data.players[this.data.currentPlayer],
                updateData.gameHistory,  // 使用更新后的历史记录
                ''
            );

            // 再次更新 gameHistory
            this.setData({
                gameHistory: userMessage.gameHistory
            });
        }

        this.handleAITurn(this.data.gamePhase, this.data.players[this.data.currentPlayer]);
    },
    // -------------手动下棋控制逻辑结束--------------
    //----------------辅助函数开始----------------
    checkFormation: function (row, col, currentColor, newBoard) {
        return checkFormation(row, col, currentColor, newBoard);
    },

    isStillInFormation: function (row, col, currentColor, newBoard) {
        return isStillInFormation(row, col, currentColor, newBoard);
    },

    updateBoard: function (color, startRow, startCol, targetRow, targetCol) {
        return updateBoard(color, startRow, startCol, targetRow, targetCol, this.data.board);
    },

    showMessage: function (message, icon = 'none', duration = 1500) {
        wx.showToast({
            title: message,
            icon,
            duration
        });
    },
    //--------------辅助函数结束---------------
    //------------------------AI处理逻辑开始--------------------------
    handleAITurn: async function (phase, aicolor) {
        await handleAITurn(phase, aicolor, this.data, this.setData.bind(this), this.showMessage.bind(this), this.processAIDecision.bind(this));
    },
    // 处理 AI 决策
    processAIDecision: function (phase, aicolor, decision) {
        const actions = {
            [GAME_PHASES.PLACING]: () => {
                const targetPostion = {
                    targetRow: decision.position[0],
                    targetCol: decision.position[1]
                }
                this.handlePlaceDrop(aicolor, targetPostion);
            },
            [GAME_PHASES.REMOVING]: () => this.setFlashPiece(decision.position[0], decision.position[1]),
            [GAME_PHASES.MOVING]: () => {
                const movePositions = {
                    startRow: decision.position[0],
                    startCol: decision.position[1],
                    targetRow: decision.newPosition[0],
                    targetCol: decision.newPosition[1],
                }
                this.handleMoveDrop(aicolor, movePositions);
            }
        };

        actions[phase]();
    },

    // 设置闪动棋子
    setFlashPiece: function (row, col) {
        this.setData({
            flashPiece: {
                row,
                col
            }
        });
    },
    //------------------------AI处理逻辑结束--------------------------

    // 新增：构建 message_history
    saveUserMessageToHistory: function (phase, playerColor, updatedHistory, lastActionResult) {
        return saveUserMessageToHistory(phase, playerColor, updatedHistory, lastActionResult, this.data.board);
    },

    saveAssistantMessageToHistory: function (content) {
        // 返回新的历史记录
        return saveAssistantMessageToHistory(this.data.gameHistory, content);
    },

    exportGameHistory: function () {
        exportGameHistory(this.data.gameHistory)
            .then(() => {
                this.setData({ gameHistory: [] }); // 清空历史数据
            })
            .catch(err => {
                console.error("导出游戏历史失败:", err);
            });
    },
    // 悔棋逻辑
    undoMove: function (e) {
        const color = e.currentTarget.dataset.color; // 获取悔棋的玩家颜色
        console.log(`${color}方请求悔棋`);
        // 在这里实现悔棋逻辑，例如撤销上一步操作
        wx.showToast({
            title: `${color === 'black' ? '黑方' : '白方'}悔棋`,
            icon: 'none'
        });
    },
});
