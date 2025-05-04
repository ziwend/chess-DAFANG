// 导入游戏常量
import {
  GAMEHISTORY,
  CONFIG
} from '../../utils/gameConstants.js';
// 导入 棋手配置管理函数
import {
  loadPlayerConfig
} from '../../utils/playerConfigManager.js';
import {
  checkFormation,
  isStillInFormation
} from '../../utils/formationChecker.js';
import {
  saveUserMessageToHistory,
  saveAssistantMessageToHistory,
  exportGameHistory,
  debugLog
} from '../../utils/historyUtils.js';
import {
  hasValidMoves,
  updateBoard,
  isMaxPiecesCount,
  isBoardWillFull,
  getBoardState,
  canMove
} from '../../utils/boardUtils.js';
import {
  handleAITurn
} from '../../utils/aiUtils.js';
import {
  validatePosition
} from '../../utils/validationUtils.js';
import {
  RewardManager,
  RANKS
} from '../../utils/rewardManager.js';
import {
  cacheManager
} from '../../utils/cacheManager.js';
import { playDropSound } from '../../utils/audio';

// 游戏主页面逻辑
Page({
  data: {
    players: CONFIG.PLAYERS, // 玩家颜色
    message: CONFIG.INIT_MESG, // 游戏状态提示           
    gameHistory: [],
    lastRandomDecision: null, // 新增：存储上一次的随机决策
    isGameStarted: false,
    isGameOver: false,
    boardRectCache: null, // 新增：缓存棋盘边界矩形
    playerStats: null,
    dailyTasks: [],
    newAchievements: [],
    showDailyTasks: false,
    isSilent: false,
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
      itemList: ['我的战绩', '设置玩家', '检查github更新', '检查gitee更新'], // 添加“检查更新”选项
      success: res => {
        // 根据选择的菜单项执行相应操作
        if (res.tapIndex === 0) {
          // 获取所有战绩
          const statistics = this.getAllGameResults();
          this.showStatistics(statistics);
        } else if (res.tapIndex === 1) {
          this.setPlayer('black');
        } else if (res.tapIndex === 2) {
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
        } else if (res.tapIndex === 3) {
          // 跳转到 Gitee Releases 页面
          wx.setClipboardData({
            data: 'https://gitee.com/ziwend/chess-DAFANG/releases/',
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
      fail: res => {
        debugLog(CONFIG.DEBUG, '用户取消了菜单', res);
      }
    });
  },
  setPlayer: function (color) {
    wx.navigateTo({
      url: `/pages/aiSetting/aiSetting?color=${color}`
    });
  },
  getAllGameResults: function () {
    const colors = ['black', 'white'];
    const statistics = {
      local: {}, // 本地对战成绩
      ai: {} // AI对战成绩
    };

    try {
      // 遍历所有可能的配置
      colors.forEach(color => {
        statistics.local[color] = {};
        statistics.ai[color] = {};

        // 获取所有存储的键
        const keys = wx.getStorageInfoSync().keys;

        // 过滤出与当前颜色相关的记录
        const colorKeys = keys.filter(key => key.startsWith(`gameResults_${color}_`));

        colorKeys.forEach(key => {
          const results = wx.getStorageSync(key) || {
            win: 0,
            loss: 0
          };
          const [_, __, opponent] = key.split('_'); // gameResults_black_easy

          // 根据对手类型分类
          if (['easy', 'medium', 'hard'].includes(opponent)) {
            statistics.local[color][opponent] = results;
          } else {
            statistics.ai[color][opponent] = results;
          }
        });
      });

      return statistics;
    } catch (error) {
      wx.showToast({
        title: '获取战绩失败',
        icon: 'none'
      });
      return {
        local: {
          black: {},
          white: {}
        },
        ai: {
          black: {},
          white: {}
        }
      };
    }
  },

  showStatistics: function (statistics) {
    let message = '';
    const colors = ['black', 'white'];
    const difficulties = ['easy', 'medium', 'hard'];

    // 对战本地玩家战绩
    message += '=== 对战本机战绩 ===\n\n';
    colors.forEach(color => {
      const hasLocalGames = difficulties.some(diff =>
        statistics.local[color][diff] &&
        (statistics.local[color][diff].win > 0 || statistics.local[color][diff].loss > 0)
      );

      if (hasLocalGames) {
        message += `${color === 'black' ? '执黑方先手' : '执白方后手'}:\n`;
        difficulties.forEach(difficulty => {
          const results = statistics.local[color][difficulty];
          if (results && (results.win > 0 || results.loss > 0)) {
            const difficultyText = {
              'easy': '简单',
              'medium': '中等',
              'hard': '困难'
            }[difficulty];
            message += `${difficultyText}难度: 胜${results.win}场 负${results.loss}场\n`;
          }
        });
        message += '\n';
      }
    });

    // 对战AI战绩
    const hasAiGames = colors.some(color =>
      Object.keys(statistics.ai[color]).length > 0
    );

    if (hasAiGames) {
      message += '=== 对战AI战绩 ===\n\n';
      colors.forEach(color => {
        const aiModels = Object.keys(statistics.ai[color]);
        if (aiModels.length > 0) {
          message += `${color === 'black' ? '执黑方先手' : '执白方后手'}:\n`;
          aiModels.forEach(model => {
            const results = statistics.ai[color][model];
            if (results && (results.win > 0 || results.loss > 0)) {
              message += `${model}: 胜${results.win}场 负${results.loss}场\n`;
            }
          });
          message += '\n';
        }
      });
    }

    if (message === '') {
      message = '暂无对战记录';
    }

    // 使用模态框展示战绩
    wx.showModal({
      title: '我的战绩',
      content: message,
      showCancel: false,
      confirmText: '确定'
    });
  },
  // 从配置页面返回会重新加载
  onShow: function () {
    const playerConfig = loadPlayerConfig();
    debugLog(false, 'onShow加载配置', playerConfig);

    this.setData({
      playerConfig: playerConfig
    });
  },
  onLoad: function () {
    // 加载玩家统计数据
    const playerStats = wx.getStorageSync('playerStats') || {
      totalGames: 0,
      totalWins: 0,
      totalPoints: 0,
      achievements: [],
      rank: RANKS[0].name
    };

    // 获取每日任务
    const dailyTasks = RewardManager.getDailyTasks();

    // 2. 初始化棋盘估算尺寸
    const updateData = {
      playerStats,
      dailyTasks,
    };

    // 3. 尝试读取缓存或计算估算值
    const cachedRect = wx.getStorageSync('boardRectCache');
    if (cachedRect) {
      updateData.boardRectCache = cachedRect;
      updateData.boardRectReady = true;
    } else {
      updateData.boardRectReady = false; // 明确标记未准备好
      const { windowWidth, windowHeight } = wx.getSystemInfoSync();
      const boardSize = windowWidth * (windowWidth / windowHeight > 0.6 ? 0.6 : 0.8);

      updateData.boardRectCache = {
        boardSize,
        cellSize: boardSize / 5,
        pieceSize: boardSize / 5 * 0.7
      };
    }

    this.setData(updateData);
  },
  onReady: async function () {
    // 1. 如果已有缓存且未失效，直接使用
    if (this.data.boardRectReady) return;

    // 2. 获取实际DOM位置
    try {
      await this.initBoardRect();
    } catch (err) {
      debugLog(CONFIG.DEBUG, '获取棋盘位置失败:', null, err);
      // 降级使用估算值
      this.setData({ boardRectReady: true });
    }
  },
  // 初始化棋盘尺寸和位置
  initBoardRect: function () {
    return new Promise((resolve) => {
      wx.createSelectorQuery()
        .select('.board')
        .boundingClientRect()
        .exec((res) => {
          if (res?.[0]) {
            const exactRect = {
              ...this.data.boardRectCache, // 保留估算的尺寸
              ...res[0], // 覆盖实际位置(left/top等)
              lastUpdated: Date.now()
            };

            this.setData({
              boardRectCache: exactRect,
              boardRectReady: true
            });

            wx.setStorageSync('boardRectCache', exactRect);
            debugLog(CONFIG.DEBUG, '棋盘位置初始化完成', exactRect);
            resolve();
          } else {
            debugLog(CONFIG.DEBUG, "wx.createSelectorQuery().select('.board')未完成", res);
            this.setData({ boardRectReady: true });
            resolve();
          }
        });
    });
  },

  toggleDailyTasks: function () {
    this.setData({
      showDailyTasks: !this.data.showDailyTasks
    });
  },

  startGame: function () {
    const updateData = {
      board: JSON.parse(JSON.stringify(CONFIG.INITIAL_BOARD)),
      currentPlayer: 0, // 重置当前玩家为黑方
      movingPiece: null, // 当前拖动的棋子信息
      blackCount: 0, // 重置黑方棋子数量
      whiteCount: 0, // 重置白方棋子数量
      extraMoves: 0, // 重置额外移动次数
      gamePhase: CONFIG.GAME_PHASES.PLACING, // 重置游戏阶段为放置阶段，游戏阶段：'placing'（布子）, 'moving'（移动）, 'removing'（吃子）
      isGameStarted: true,
      isGameOver: false, // 新增游戏结束标志 
      message: '', // 清空状态栏提示        
      elapsedTime: '00:00', // 重置计时器
      requestTask: null, // 重置请求任务
      isExchangeRemoving: false, // 重置交换吃子标志
      lastTapTime: null, // 新增变量，用于记录上次点击时间
      blackLastMovedPiece: null,
      whiteLastMovedPiece: null,
      lastActionResult: null,
      lastPlace: null,
      isAnimationInProgress: false, // 新增：标记动画是否正在进行
    };
    // 启动计时器
    const timer = setInterval(() => {
      this.updateElapsedTime();
    }, 1000);
    updateData.timer = timer;
    if (CONFIG.DEBUG) {
      // 添加用户消息到历史记录
      const userMessage = this.saveUserMessageToHistory(CONFIG.GAME_PHASES.PLACING, "black", GAMEHISTORY, '');
      updateData.gameHistory = userMessage.gameHistory;
    }

    // 一次性更新所有数据
    this.setData(updateData);

    // TODO 判断一下如果当前config，黑色有配置，则当前AI
    this.handleAITurn(CONFIG.GAME_PHASES.PLACING, this.data.players[this.data.currentPlayer]);
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
      check: () => this.data[`${currentColor}Count`] < CONFIG.MIN_PIECES_TO_WIN,
      feedback: `当前棋手的棋子少于3颗，对方${opponent}获胜`,
      winnerColor: opponentColor,
      losserColor: currentColor,
      winner: `${opponent}`
    },
    {
      check: () => this.data.extraMoves > 0 && this.data.extraMoves + CONFIG.MIN_PIECES_TO_WIN > this.data[`${opponentColor}Count`],
      feedback: `当前棋手吃子后，对方剩余棋子少于3颗，己方${player}获胜`,
      winnerColor: currentColor,
      losserColor: opponentColor,
      winner: `${player}`
    },
    {
      check: () => this.data.gamePhase === CONFIG.GAME_PHASES.MOVING && !this.hasValidMoves(currentColor),
      feedback: `当前棋手无棋子可以移动，对方${opponent}获胜`,
      winnerColor: opponentColor,
      losserColor: currentColor,
      winner: `${opponent}`
    }
    ];

    for (const {
      check,
      winner,
      winnerColor,
      losserColor,
      feedback
    } of conditions) {
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
        // 等待导出完成
        await this.exportGameHistory();
        let key = null;
        let message = null;
        if (this.data.playerConfig[winnerColor].playerType === 'self') {
          // 记录胜利信息
          // 根据对方类型生成key，如果是本机，使用difficulty，如果是ai则为aiConfig.model

          if (this.data.playerConfig[losserColor].playerType === 'local') {
            key = `gameResults_${winnerColor}_${this.data.playerConfig[losserColor].difficulty}`;
          } else if (this.data.playerConfig[losserColor].playerType === 'ai') {
            key = `gameResults_${winnerColor}_${this.data.playerConfig[losserColor].aiConfig.model}`;
          }

          this.recordGameResult(key, 'win');
          const totalWins = this.getGameResultCount(key, 'win');
          message = `恭喜您获胜啦！您已经打败对手${totalWins}次了，继续加油！`;
          // 更新玩家统计和检查成就
          const gameData = {
            isWinner: true,
            totalGames: this.data.playerStats.totalGames + 1,
            totalWins: this.data.playerStats.totalWins + 1,
            winStreak: this.data.winStreak || 0
          };

          const newAchievements = RewardManager.checkAchievements(gameData, this.data.playerStats);
          const {
            stats,
            tasks,
            pointsEarned
          } = RewardManager.updatePlayerStats(gameData);
          this.setData({
            playerStats: stats,
            dailyTasks: tasks,
            newAchievements
          });
          // 显示任务完成信息
          if (pointsEarned > 0) {
            wx.showToast({
              title: `完成每日任务，获得${pointsEarned}积分！`,
              icon: 'success',
              duration: 2000
            });
          } else if (newAchievements.length > 0) {
            this.showAchievements(newAchievements);
          } else {
            this.showGameOver(message);
          }

        } else if (this.data.playerConfig[losserColor].playerType === 'self') {
          // 记录失败信息
          if (this.data.playerConfig[winnerColor].playerType === 'local') {
            key = `gameResults_${losserColor}_${this.data.playerConfig[winnerColor].difficulty}`;
          } else if (this.data.playerConfig[winnerColor].playerType === 'ai') {
            key = `gameResults_${losserColor}_${this.data.playerConfig[winnerColor].aiConfig.model}`;
          }
          this.recordGameResult(key, 'loss');
          const totalWins = this.getGameResultCount(key, 'win');
          if (totalWins > 0) {
            message = `哦噢，您被打败了！没关系，您已经战胜对手${totalWins}次了，再来一场对决试试？`;
          } else {
            message = `哦噢，您被打败了！再来一场对决试试？`;
          }

          // 更新每日任务
          const gameData = {
            isWinner: false,
            totalGames: this.data.playerStats.totalGames + 1,
            totalWins: this.data.playerStats.totalWins,
            winStreak: this.data.winStreak || 0
          };
          const newAchievements = RewardManager.checkAchievements(gameData, this.data.playerStats);
          const {
            stats,
            tasks,
            pointsEarned
          } = RewardManager.updatePlayerStats(gameData);

          // 显示任务完成信息
          if (pointsEarned > 0) {
            wx.showToast({
              title: `完成每日任务，获得${pointsEarned}积分！`,
              icon: 'success',
              duration: 2000
            });
          } else if (newAchievements.length > 0) {
            this.showAchievements(newAchievements);
          } else {
            this.showGameOver(message);
          }

          this.setData({
            playerStats: stats,
            dailyTasks: tasks
          });
        }
        if (!message) {
          message = `游戏结束，获胜方: ${winner}`;
          debugLog(CONFIG.DEBUG, `游戏结束，获胜方: ${winner} ，因为:`, feedback);
          this.showGameOver(message);
        }
        // cacheManager.saveToStorage(); // 保存缓存到本地存储
        // debugLog(CONFIG.DEBUG, "boardRectCache", this.data.boardRectCache);
        return winner; // 游戏结束，返回winner             
      }
    }

    return null; // 游戏未结束
  },
  showAchievements: function (achievements) {
    let message = '🎉 恭喜获得新成就！\n\n';
    achievements.forEach(achievement => {
      message += `${achievement.name}: ${achievement.desc}\n获得 ${achievement.points} 点积分\n\n`;
    });

    wx.showModal({
      title: '新成就解锁',
      content: message,
      showCancel: false,
      confirmText: '太棒了'
    });
  },
  recordGameResult: function (key, result) {
    const results = wx.getStorageSync(key) || {
      win: 0,
      loss: 0
    };

    if (result === 'win') {
      results.win += 1;
    } else if (result === 'loss') {
      results.loss += 1;
    }

    wx.setStorageSync(key, results);
  },

  getGameResultCount: function (key, result) {
    const results = wx.getStorageSync(key) || {
      win: 0,
      loss: 0
    };
    return results[result] || 0;
  },

  hasValidMoves: function (currentColor) {
    return hasValidMoves(currentColor, this.data.board);
  },

  showGameOver: function (message) {
    const tempFlag = true; // 临时标志，测试用
    if (CONFIG.DEBUG && !tempFlag) {
      // 这里节省测试时间，正常还恢复对话框
      this.restartGame();
    } else {
      wx.showModal({
        title: message,
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
      this.setData({
        timer: null
      });
    }
    if (this.data.requestTask) {
      this.data.requestTask.abort();
      this.setData({
        requestTask: null
      });
    }
    // 清理其他可能的资源
    this.setData({
      gameHistory: [],
      board: [],
      // ... 其他需要清理的状态
    });

    debugLog(CONFIG.DEBUG, 'onUnload', this.data);
  },

  // -------------手动下棋控制逻辑开始--------------
  handleTouchStart: function (e) {
    // 非移动阶段不处理
    if (this.data.gamePhase !== CONFIG.GAME_PHASES.MOVING) {
      return;
    }
    /**/
    const touch = e.changedTouches[0];
    const validPosition = this.getValidBoardPosition(touch);

    if (!validPosition) {
      return;
    }

    const { targetRow: row, targetCol: col } = validPosition;
    const color = this.data.board[row][col].color;
    const currentColor = this.data.players[this.data.currentPlayer];
    if (color !== currentColor) {
      this.showMessage('只能移动己方棋子');
      return;
    }
    if (this.data.playerConfig[currentColor].playerType !== 'self') {
      return;
    }
    if (!canMove(row, col, this.data.board)) {
      return;
    }
    const cellSize = this.data.boardRectCache.cellSize;

    const offset = this.data.boardRectCache.pieceSize / 2;

    const startX = col * cellSize - offset;
    const startY = row * cellSize - offset;
    const startPieceIsFormation = this.data.board[row][col].isFormation;
    this.data.board[row][col] = null;

    this.setData({
      movingPiece: {
        color: color,
        initX: startX,
        initY: startY,
        currentX: startX,
        currentY: startY,
        startRow: row,
        startCol: col,
        startPieceColor: color,
        startPieceIsFormation: startPieceIsFormation,
      },
      board: this.data.board,
    });
    // 触发 touchmove 事件，确保 movingPiece 立即跟随手指
    setTimeout(() => {
      debugLog(CONFIG.DEBUG, "movingPiece=", this.data.movingPiece);
      // this.handleTouchMove(e);
    }, 50);

  },
  handleTouchMove: function (e) {
    if (!this.data.movingPiece) {
      return;
    }
    const now = Date.now();
    if (now - this.data.lastRender < 16) return; // 60fps限制

    const touch = e.touches[0];
    const position = this.getBoardPosition(touch);

    const { boardX, boardY } = position;

    // 更新 movingPiece 的 currentX, currentY
    const offset = this.data.boardRectCache.pieceSize / 2;
    this.setData({
      'movingPiece.currentX': boardX - offset,
      'movingPiece.currentY': boardY - offset,
      lastRender: now
    });
  },

  handleTouchEnd: function (e) {
    if (!this.data.isGameStarted) {
      return;
    }
    // 获取当前玩家颜色
    const currentColor = this.data.players[this.data.currentPlayer];
    if (this.data.playerConfig[currentColor].playerType !== 'self') {
      return;
    }
    if (this.data.isAnimationInProgress) {
      // this.showMessage('动画未结束，请稍后再试');
      // return;
    }
    // 判断一下移动阶段是否有效
    if (this.data.gamePhase === CONFIG.GAME_PHASES.MOVING && !this.data.movingPiece) {
      this.showMessage('请选中要移动的棋子拖动');
      return;
    }

    const touch = e.changedTouches[0];
    const validPosition = this.getValidBoardPosition(touch);

    if (!validPosition) {
      this.resetMovingPiece();
      return;
    }

    const { targetRow, targetCol } = validPosition;

    const targetPosition = {
      targetRow,
      targetCol
    };
    // 处理不同游戏阶段
    switch (this.data.gamePhase) {
      case CONFIG.GAME_PHASES.PLACING:
        this.handlePlace(currentColor, targetPosition);
        break;
      case CONFIG.GAME_PHASES.MOVING:
        const movePositions = {
          startRow: this.data.movingPiece.startRow,
          startCol: this.data.movingPiece.startCol,
          targetRow,
          targetCol
        };
        this.handleMove(currentColor, movePositions);
        break;
      case CONFIG.GAME_PHASES.REMOVING:
        this.handleRemove(currentColor, targetPosition);
        break;
      default:
        this.showMessage('当前阶段不支持此操作');
        break;
    }
  },

  getValidBoardPosition: function (touch) {
    const position = this.getBoardPosition(touch);

    const { boardX, boardY } = position;
    const cellSize = this.data.boardRectCache.cellSize;
    const pieceRadius = this.data.boardRectCache.pieceSize / 2; // 棋子半径，按你的配置
    const minX = -pieceRadius;
    const maxX = this.data.boardRectCache.boardSize + pieceRadius;
    const minY = -pieceRadius;
    const maxY = this.data.boardRectCache.boardSize + pieceRadius;

    if (boardX < minX || boardX > maxX || boardY < minY || boardY > maxY) {
      // <view class="board-container" bindtouchend="handleTouchEnd"> 解决棋盘外点击没反应的问题
      debugLog(false, '点击位置相对棋盘LEFT和TOP的距离：', position, 'minX', minX, 'maxX', maxX, 'minY', minY, 'maxY', maxY);
      return null;
    }


    let targetCol = Math.round(boardX / cellSize);
    let targetRow = Math.round(boardY / cellSize);

    // 边界修正
    targetCol = Math.max(0, Math.min(CONFIG.BOARD_SIZE - 1, targetCol));
    targetRow = Math.max(0, Math.min(CONFIG.BOARD_SIZE - 1, targetRow));

    const clickX = targetCol * cellSize;
    const clickY = targetRow * cellSize;
    const tolerance = pieceRadius;
    // 点击位置离交叉点太远，忽略
    if (Math.abs(boardX - clickX) > tolerance || Math.abs(boardY - clickY) > tolerance) {
      debugLog(CONFIG.DEBUG, 'getValidBoardPosition-touch outside board', position, clickX, clickY, tolerance);
      return null;
    }

    return {
      targetRow,
      targetCol,
    };
  },

  resetMovingPiece: function () {
    if (!this.data.movingPiece) return;

    const board = this.data.board;

    board[this.data.movingPiece.startRow][this.data.movingPiece.startCol] = {
      color: this.data.movingPiece.startPieceColor,
      isFormation: this.data.movingPiece.startPieceIsFormation
    }
    this.setData({
      movingPiece: null,
      board
    });
  },
  getBoardPosition: function (touch) {
    const boardX = touch.clientX - this.data.boardRectCache.left;
    const boardY = touch.clientY - this.data.boardRectCache.top;

    return {
      boardX,
      boardY,
    };
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
    // const message = `${color}方放置的第${targetPosition.targetRow + 1}行第${targetPosition.targetCol}列位置无效，请重新选择`;
    // this.showMessage(message);
  },
  // 处理放置阶段的落子逻辑
  handlePlaceDrop: function (currentColor, targetPosition) {
    const {
      targetRow,
      targetCol
    } = targetPosition;

    if (!this.data.isSilent) {
      playDropSound();
    }

    // 更新棋盘状态
    const newBoard = this.updateBoard(currentColor, null, null, targetRow, targetCol);
    
    // 计算更新数据
    let updateData = {
      board: newBoard,
      [`${currentColor}Count`]: this.data[`${currentColor}Count`] + 1,
      lastPlace: this.data.lastPlace? this.data.lastPlace + `${targetRow}${targetCol}`: `${targetRow}${targetCol}`,
    };

debugLog(CONFIG.DEBUG, `key1=${this.data.blackCount + this.data.whiteCount},key2=${this.data.lastPlace},value=`,`[${targetRow}, ${targetCol}]`);
      //更新place记录
      const decision = {
        action: CONFIG.GAME_PHASES.PLACING,
        position: [targetRow, targetCol]
      };
      updateData.gameHistory = [...this.data.gameHistory, {
        role: "assistant",
        content: JSON.stringify(decision)
      }];


    let lastActionResult = null;
    if (this.data[`${currentColor}Count`] >= CONFIG.MIN_PIECES_TO_WIN - 1) {
      const formationUpdate = checkFormation(targetRow, targetCol, currentColor, newBoard);
      if (formationUpdate) {
        this.updateFormationStatus(formationUpdate, newBoard);

        // 显示提示
        this.showMessage('形成了' + formationUpdate.formationType);
        Object.assign(updateData, formationUpdate);
        lastActionResult = `你上次在位置[${targetRow},${targetCol}]的落子构成了'${formationUpdate.formationType}'阵型，获得了${formationUpdate.extraMoves}次额外落子机会。`;
      }
      // 处理特殊情况
      if (this.isBoardWillFull()) {
        Object.assign(updateData, {
          extraMoves: 1,
          message: `请移除${this.data.currentPlayer === 1 ? '黑方' : '白方'}棋子`,
          isExchangeRemoving: true,
        });
      } else if (this.data.extraMoves > 0) {
        updateData.extraMoves = this.data.extraMoves - 1;
        if (updateData.extraMoves === 0) updateData.currentPlayer = 1 - this.data.currentPlayer;
      } else if (!formationUpdate) {
        updateData.currentPlayer = 1 - this.data.currentPlayer;
      }
    } else {
      // 己方第一颗和第二颗棋子，直接切换玩家
      updateData.currentPlayer = 1 - this.data.currentPlayer;
    }

    updateData.flashPiece = {
      row: targetRow,
      col: targetCol
    };
    updateData.isAnimationInProgress = true;

    // 更新数据并设置闪动棋子
    this.setData(updateData);

    // 如果不是最后一颗，增加一下操作的日志 
    if (!this.isMaxPiecesCount()){
      const userMessage = this.saveUserMessageToHistory(updateData.gamePhase, this.data.players[this.data.currentPlayer], this.data.gameHistory, lastActionResult);

      this.setData({
        gameHistory: userMessage.gameHistory,
      });
    }    

  },

  // 新增：检查棋盘是否已满
  isBoardWillFull: function () {
    return isBoardWillFull(this.data.blackCount, this.data.whiteCount);
  },

  // 抽取：处理移动操作
  handleMove: function (color, movePositions) {
    if (!this.validatePosition(movePositions, this.data.gamePhase, color)) {
      // 每次只能移动一格
      this.resetMovingPiece();
      return;
    }

    const {
      startRow,
      startCol,
      targetRow,
      targetCol
    } = movePositions;
    if (CONFIG.DEBUG) {
      // 直接保存 decision
      const decision = {
        action: CONFIG.GAME_PHASES.MOVING,
        position: [startRow, startCol],
        newPosition: [targetRow, targetCol]
      };

      const currentHistory = Array.isArray(this.data.gameHistory) ? this.data.gameHistory : [];
      this.setData({
        gameHistory: [...currentHistory, {
          role: "assistant",
          content: JSON.stringify(decision)
        }]
      });
    }

    this.handleAfterMove(color, startRow, startCol, targetRow, targetCol);
  },

  // 处理移动阶段的落子逻辑
  handleMoveDrop: async function (color, movePositions) {
    const {
      startRow,
      startCol,
      targetRow,
      targetCol
    } = movePositions;

    const cellSize = this.data.boardRectCache.cellSize;

    const offset = this.data.boardRectCache.pieceSize / 2; // 偏移量是棋子大小的一半

    // 计算起始位置时，去掉居中的偏移
    const startX = startCol * cellSize - offset;
    const startY = startRow * cellSize - offset;
    const endX = targetCol * cellSize - offset;
    const endY = targetRow * cellSize - offset;
    this.data.board[startRow][startCol] = null;
    // 1. 清空起点，设置 movingPiece 出现
    let updateData = {
      movingPiece: {
        color: color,
        initX: startX,  // 记录初始位置
        initY: startY
      },
      board: this.data.board,
      isAnimationInProgress: true
    };
    // 先显示到起点 (startX, startY)
    const appearAnimation = wx.createAnimation({
      duration: 0, // 直接到起点，不要动画
    });
    appearAnimation.translate(startX, startY).step();
    updateData.moveAnimation = appearAnimation.export();
    if (CONFIG.DEBUG) {
      // 直接保存 decision
      const decision = {
        action: CONFIG.GAME_PHASES.MOVING,
        position: [startRow, startCol],
        newPosition: [targetRow, targetCol]
      };

      const currentHistory = Array.isArray(this.data.gameHistory) ? this.data.gameHistory : [];

      updateData.gameHistory = [...currentHistory, {
        role: "assistant",
        content: JSON.stringify(decision)
      }];
    }
    this.setData(updateData);

    setTimeout(() => {
      const moveAnimation = wx.createAnimation({
        duration: 1500,
        timingFunction: 'ease-out',
      });
      moveAnimation.translate(endX, endY).step();
      this.setData({
        moveAnimation: moveAnimation.export()
      });

      // 动画结束后处理
      setTimeout(() => {
        this.handleAfterMove(color, startRow, startCol, targetRow, targetCol);
      }, 1600);  // 略长于动画时间
    }, 50);
  },

  // 处理移动棋子后的游戏状态
  handleAfterMove: async function (color, startRow, startCol, targetRow, targetCol) {
    // 更新棋盘
    const newBoard = this.updateBoard(color, startRow, startCol, targetRow, targetCol);
    const formationUpdate = checkFormation(targetRow, targetCol, color, newBoard);

    let updateData = {
      board: newBoard,
      movingPiece: null,
      moveAnimation: null,
      isAnimationInProgress: false,
    };

    const formationUpdateDestroy = checkFormation(startRow, startCol, color, this.data.board);

    this.handleDestroyedFormation(formationUpdateDestroy, newBoard, color);
    let lastActionResult = null;

    if (formationUpdate) {
      this.updateFormationStatus(formationUpdate, newBoard);

      // 显示提示
      this.showMessage('形成' + formationUpdate.formationType);
      Object.assign(updateData, formationUpdate);
      lastActionResult = `你上次移动到的位置[${targetRow},${targetCol}]形成了'${formationUpdate.formationType}'阵型，获得了${formationUpdate.extraMoves}次吃子机会。`;
      updateData.gamePhase = CONFIG.GAME_PHASES.REMOVING;
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
    };

    // updateData.flashPiece = {      row: targetRow,      col: targetCol    };
    updateData.movingPiece = null;

    if (CONFIG.DEBUG) {
      const boardState = getBoardState(this.data.board);
      const feedback = lastActionResult || '';

      // 定义消息模板
      const messageTemplate = `当前棋盘状态: ${JSON.stringify(boardState)} ，你的棋子颜色: ${color}，` +
        `当前阶段: '${this.data.gamePhase}'` +
        '。请根据当前棋局给出最佳决策。';

      updateData.gameHistory = [...this.data.gameHistory, {
        role: "user",
        content: feedback + messageTemplate
      }];
    }
    this.setData(updateData);
    // 先检查游戏是否结束
    const winner = await this.checkGameOver();
    if (winner) {
      return;
    }
    this.handleAITurn(this.data.gamePhase, this.data.players[this.data.currentPlayer]);
  },

  // 抽取：处理手动双击移除操作
  handleRemove: function (currentColor, targetPosition) {
    // 吃子阶段：双击对方棋子
    const now = Date.now();
    const isDoubleClick = this.lastTapTime && (now - this.lastTapTime < 600);
    
    if (isDoubleClick) {
        // 移除对方棋子            
        if (!this.validatePosition(targetPosition, this.data.gamePhase, currentColor)) {
            const message = `第${targetPosition.targetRow + 1}行第${targetPosition.targetCol}列棋子不能移除，请重新选择`;
            this.showMessage(message);
            this.lastTapTime = null;  // Reset on invalid position
            return;
        }

        this.handleRemovePhase(targetPosition);
        this.lastTapTime = null;  // Clear after successful removal
    } else {
        this.lastTapTime = now;
        if (this.lastTapTime) {
          debugLog(CONFIG.DEBUG, 'Double tap detected', { now, lastTapTime: this.lastTapTime });
            //this.showMessage('请再点击一次移除对方的棋子');
        }
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
    // 最后一次放置的动画，跟第一次删除的动画怎么区分
    if (this.data.gamePhase === CONFIG.GAME_PHASES.PLACING) {
      // 标记动画结束
      let updateData = {
        isAnimationInProgress: false,
        flashPiece: {
          row: null,
          col: null
        }
      }

      // 放置最后一颗棋子后
      // 检查棋盘是否已满
      if (this.isMaxPiecesCount()) {
        this.showMessage("棋盘已满，开始提子！");
        updateData.gamePhase = CONFIG.GAME_PHASES.REMOVING;
        // 增加一下操作的日志 
        const userMessage = this.saveUserMessageToHistory(updateData.gamePhase, this.data.players[this.data.currentPlayer], this.data.gameHistory, this.data.lastActionResult);
        updateData.gameHistory = userMessage.gameHistory;
        this.setData(updateData);
      }

      this.handleAITurn(this.data.gamePhase, this.data.players[this.data.currentPlayer]);
    } else {
      const {
        row,
        col,
        color
      } = e.currentTarget.dataset;
      // 如果是移除阶段      
      this.handleAfterRemove(row, col, color);
    }
  },

  isMaxPiecesCount: function () {
    return isMaxPiecesCount(this.data.blackCount, this.data.whiteCount);
  },

  // 处理移除棋子后的游戏状态
  handleAfterRemove: async function (row, col, color) {
    const formationUpdateDestroy = checkFormation(row, col, color, this.data.board);
    // 更新棋盘
    this.data.board[row][col] = null;
    const newBoard = this.data.board;
    let updateData = {
      board: newBoard,
      flashPiece: {
        row: null,
        col: null
      },
      [`${color}Count`]: this.data[`${color}Count`] - 1,
      isAnimationInProgress: false
    };


    // 移除棋子后处理阵型状态
    this.handleDestroyedFormation(formationUpdateDestroy, newBoard, color);

    if (!this.data.isExchangeRemoving) { // 修改之后存在数字和message不同步的问题，如果把extramoves计数移动到这里就存在连续删除2个只计数一次的问题；
      if (this.data.extraMoves === 1) {
        updateData = {
          ...updateData,
          currentPlayer: 1 - this.data.currentPlayer,
          gamePhase: CONFIG.GAME_PHASES.MOVING,
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

    if (CONFIG.DEBUG) {
      // 直接保存 decision
      const decision = {
        action: CONFIG.GAME_PHASES.REMOVING,
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
      return;
    }

    if (CONFIG.DEBUG) {
      // 添加用户消息到历史记录
      const userMessage = this.saveUserMessageToHistory(
        this.data.gamePhase,
        this.data.players[this.data.currentPlayer],
        updateData.gameHistory, // 使用更新后的历史记录
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
  updateBoard: function (color, startRow, startCol, targetRow, targetCol) {
    return updateBoard(color, startRow, startCol, targetRow, targetCol, this.data.board);
  },
  // 新增工具函数
  updateFormationStatus: function (formationUpdate, board) {
    formationUpdate.formationPositions.forEach(pos => {
      const [row, col] = pos;
      if (!board[row][col].isFormation) {
        board[row][col].isFormation = true;
      }
    });
  },

  // 新增: 检查和更新被破坏的阵型
  handleDestroyedFormation: function (formationUpdateDestroy, newBoard, color) {
    if (formationUpdateDestroy) {
      formationUpdateDestroy.formationPositions.forEach(pos => {
        const [row, col] = pos;
        if (newBoard[row][col]) {
          const isStillInFormationFlag = isStillInFormation(row, col, color, newBoard);
          if (!isStillInFormationFlag) {
            newBoard[row][col].isFormation = false;
          }
        }
      });
    }
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
      [CONFIG.GAME_PHASES.PLACING]: () => {
        const targetPostion = {
          targetRow: decision.position[0],
          targetCol: decision.position[1]
        }
        this.handlePlaceDrop(aicolor, targetPostion);
      },
      [CONFIG.GAME_PHASES.REMOVING]: () => this.setFlashPiece(decision.position[0], decision.position[1]),
      [CONFIG.GAME_PHASES.MOVING]: () => {
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
        this.setData({
          gameHistory: []
        }); // 清空历史数据
      })
      .catch(err => {
        console.error("导出游戏历史失败:", err);
      });
  },
  // 悔棋逻辑
  undoMove: function () {
    const color = this.data.players[this.data.currentPlayer]; // 获取悔棋的玩家颜色
    debugLog(CONFIG.DEBUG, `${color}方请求悔棋`);

    // 检查是否有历史记录可以撤销
    if (!this.data.gameHistory || this.data.gameHistory.length < 2) {
      wx.showToast({
        title: '没有足够的操作可以撤销',
        icon: 'none'
      });
      return;
    }

    // 从后往前查找，直到找到 role=user 且 content 包含“你的棋子颜色: color”
    let assistantAction = null;
    // 恢复棋盘状态
    let newBoard = this.data.board;
    let updateData = { isAnimationInProgress: false };
    updateData.gameHistory = JSON.parse(JSON.stringify(this.data.gameHistory));
    for (let i = this.data.gameHistory.length - 1; i >= 0; i--) {
      const record = this.data.gameHistory[i];
      // 找到对应的 role=assistant 的记录
      if (record.role === "assistant") {
        const userMessage = this.data.gameHistory[i - 1];
        // 使用正则表达式提取颜色
        const match = userMessage.content.match(/你的棋子颜色:\s*(\w+)/);
        const playerColor = match ? match[1] : null;
        assistantAction = JSON.parse(record.content);
        // 执行回退操作
        this.revertAction(assistantAction, newBoard, updateData, playerColor);
      }

      if (record.role === "user" && record.content.includes(`你的棋子颜色: ${color}`) && i < this.data.gameHistory.length - 1) {
        break;
      }
      // 删除最后一条记录
      updateData.gameHistory.pop();
    }

    // 更新相关变量
    updateData.board = newBoard;
    // 恢复当前玩家
    updateData.currentPlayer = this.data.players.indexOf(color);

    this.setData(updateData);

    wx.showToast({
      title: `${color === 'black' ? '黑方' : '白方'}悔棋成功`,
      icon: 'none'
    });
  },

  // 辅助方法：撤销单条操作
  revertAction: function (assistantAction, board, updateData, playerColor) {
    const {
      action,
      position,
      newPosition
    } = assistantAction;

    if (action === CONFIG.GAME_PHASES.PLACING) {
      const [row, col] = position;
      const color = board[row][col].color;
      board[row][col] = null; // 移除最近放置的棋子            
      updateData[`${color}Count`] = (updateData[`${color}Count`] || this.data[`${color}Count`]) - 1; // 减少棋子计数
      debugLog(CONFIG.DEBUG, '撤销放置操作', updateData.blackCount, updateData.whiteCount);
    } else if (action === CONFIG.GAME_PHASES.MOVING) {
      // 撤销移动操作
      const [startRow, startCol] = position;
      const [targetRow, targetCol] = newPosition;
      board[startRow][startCol] = board[targetRow][targetCol]; // 将棋子移回起始位置
      board[targetRow][targetCol] = null; // 清空目标位置
    } else if (action === CONFIG.GAME_PHASES.REMOVING) {
      // 撤销移除操作
      const [row, col] = position;
      // 恢复被移除的棋子
      const targetPostion = {
        targetRow: row,
        targetCol: col
      };
      opponentColor = playerColor === 'black' ? 'white' : 'black';
      this.handlePlaceDrop(opponentColor, targetPostion);
      updateData[`${opponentColor}Count`] = (updateData[`${opponentColor}Count`] || this.data[`${opponentColor}Count`]) + 1; // 增加被移除棋子的计数
    }
  },
});