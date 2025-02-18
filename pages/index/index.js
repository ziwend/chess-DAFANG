// 游戏主页面逻辑
Page({
    data: {
      board: [], // 棋盘数据
      players: ['black', 'white'], // 玩家颜色
      currentPlayer: 0, // 当前玩家索引，默认黑子
      gameOver: false, // 游戏是否结束
      dragPiece: null, // 当前拖动的棋子信息
      blackCount: 0, // 黑方棋子数量
      whiteCount: 0, // 白方棋子数量
      extraMoves: 0,  // 额外移动次数
      gamePhase: 'placing', // 游戏阶段：'placing'（放置）, 'moving'（移动）, 'removing'（吃子）
      message: '', // 游戏状态提示
      intersections: [], // 存储所有交叉点的位置
      isUpdating: false, // 添加状态更新标志
      isExchangeRemoving: false, // 新增标志位，标记是否处于交换吃子阶段
    },
    onLoad: function() {
      this.initBoardAndIntersections();
    },
    // 初始化棋盘和交叉点位置
    initBoardAndIntersections: function() {
      let board = [];
      let intersections = [];
      for (let i = 0; i < 6; i++) {
        board.push(new Array(6).fill(null));
        for (let j = 0; j < 6; j++) {
          intersections.push({
            row: i,
            col: j,
            x: j * 100 + 50, // 交叉点位于格子中心
            y: i * 100 + 50  // 交叉点位于格子中心
          });
        }
      }

      this.setData({ 
        board: board, 
        currentPlayer: 0, // 重置当前玩家为黑方
        gameOver: false, // 重置游戏状态
        blackCount: 0, // 重置黑方棋子数量
        whiteCount: 0, // 重置白方棋子数量
        extraMoves: 0, // 重置额外移动次数
        gamePhase: 'placing', // 重置游戏阶段为放置阶段
        message: '', // 清空状态栏提示
        intersections: intersections
      });
    },
    // 开始拖动
    handleDragStart: function(e) {
      // 如果正在更新状态，不允许开始新的拖动
      if (this.data.isUpdating) {
        return;
      }
  
      const { source, row, col, color } = e.currentTarget.dataset;
      
      // 检查是否是当前玩家的回合，考虑extraMoves
      const currentColor = this.data.players[this.data.currentPlayer];

      // 新增阶段判断
      switch(this.data.gamePhase) {
        case 'placing': // 放置阶段只能从棋盒拿棋子
          if (source !== 'box') {
            this.showMessage('放置阶段只能从棋盒拿子');
            return;
          } else {
            // 检查是否对方回合
            if (color !== currentColor) {
              this.showMessage('现在请对方放置棋子');
              return;
            }
          }
          break;
      
        case 'moving': // 移动阶段只能移动己方棋子
          if (source !== 'board' || this.data.board[row][col]?.color !== currentColor) {
            this.showMessage('只能移动己方棋子');
            return;
          }
          break;
      
        case 'removing': // 吃子阶段可以拖动棋子
          if (source !== 'board' || this.data.board[row][col]?.color === currentColor) {
            this.showMessage('只能拖动对方的棋子');
            return;
          }
          break;
      }

      // 检查游戏是否结束
      if (this.data.gameOver) {
        this.showMessage('游戏已结束');
        return;
      }
  
      this.setData({
        dragPiece: {
          source,
          color: source === 'board' ? this.data.board[row][col].color : color,
          startRow: row,
          startCol: col
        }
      });
    },
    handleTouchEnd: async function(e) {
      // 检查 dragPiece 是否为 null
      if (!this.data.dragPiece) {
        return;
      }

      const { source, color, startRow, startCol } = this.data.dragPiece;

      const touch = e.changedTouches[0];
      const position = await this.getBoardPosition(touch);
      if (!position) return;

      const { boardX, boardY, boardRect } = position;

        // 检查是否在棋盘范围内，并计算最近的交叉点
        if (boardX >= 0 && boardX <= boardRect.width && boardY >= 0 && boardY <= boardRect.height) {
          const gridSize = boardRect.width / 5; // 因为是6x6的棋盘，所以有5个格子宽度
          const targetCol = Math.round(boardX / gridSize);
          const targetRow = Math.round(boardY / gridSize);

          // 检查该位置是否已有棋子
          if (!this.data.board[targetRow][targetCol]) {
            switch (this.data.gamePhase) {
              case 'placing':
                this.handlePlaceDrop(targetRow, targetCol, color);
                break;
              case 'moving':
                // 验证移动距离                
                if (Math.abs(targetRow - startRow) + Math.abs(targetCol - startCol) !== 1) {
                  this.showMessage('每次只能移动一格！');
                  this.clearDragState();
                  return;
                }

                this.handleMoveDrop(color, startRow, startCol, targetRow, targetCol);
                break;
              default:
                this.showMessage('当前阶段不支持此操作');
                break;
            }     
          } 
        } else {          
          if (this.data.gamePhase === 'removing') {
            this.handleRemovePhase(startRow, startCol);
          } else {
            this.showMessage('请在棋盘范围内落子');
          }
        }

        // 清空拖动状态
        this.clearDragState();
      
    },

    // 处理吃子阶段的逻辑
    handleRemovePhase: function(startRow, startCol) {      
      const success = this.removeOpponentPiece(startRow, startCol);
      
      if (success) {
        // 判断是否处于交换吃子阶段
        if (!this.data.isExchangeRemoving) {
          // 如果Count等于0，进入移动棋子阶段
          if (this.data.extraMoves === 0) {
            this.setData({
              currentPlayer: 1 - this.data.currentPlayer,
              gamePhase: 'moving',
              message: `请${this.data.currentPlayer === 1 ? '黑方' : '白方'}移动棋子` // 请对方移动棋子
            });
          } else {
            // 如果Count大于0，进入继续吃子阶段
            this.setData({
              message: `请移除${this.data.currentPlayer === 1 ? '黑方' : '白方'}棋子`
            });
          }
        } else {
          // 交换吃子回合，进入对方吃子阶段
          this.setData({              
            isExchangeRemoving: false,
            currentPlayer: 1 - this.data.currentPlayer,
            extraMoves: 1,
            message: `请移除${this.data.currentPlayer ===0 ? '黑方' : '白方'}棋子` // 请对方移除一个棋子
          });
        }
      }
      this.checkGameOver();
    },

 
    // 清空拖动状态
    clearDragState: function() {
      this.setData({
        dragPiece: null
      });
    },

    // 处理放置阶段的落子逻辑
    handlePlaceDrop: function(row, col, color) {
      // 更新棋盘
      const { newBoard, formationUpdate } = this.updateBoardAndCheckFormation(row, col, color);
      
      // 准备要更新的数据对象
      let updateData = {
        board: newBoard,
        isUpdating: true
      };

      // 更新棋子数量
      if (color === 'black') {
        updateData.blackCount = this.data.blackCount + 1;
      } else {
        updateData.whiteCount = this.data.whiteCount + 1;
      }

      if (formationUpdate) {
        // 显示提示
        this.showMessage('形成' + formationUpdate.formationType);

        Object.assign(updateData, formationUpdate);
      }

      // 检查棋盘是否已满
      if (this.isBoardFull()) {   
        this.showMessage('棋盘已满，现在请双方各移除对方的一个棋子');
        updateData.gamePhase = 'removing';
        updateData.extraMoves = 1; //逻辑调整为棋盘满后，接着吃子 
        updateData.message = `请移除${this.data.currentPlayer ===1 ? '黑方' : '白方'}棋子`; // 请对方移除一个棋子        
        updateData.isExchangeRemoving = true;
      } else {
        // 处理额外移动次数
        if (this.data.extraMoves > 0) {
          updateData.extraMoves = this.data.extraMoves - 1;

          // 判断最后一次，切换对方回合
          if (updateData.extraMoves === 0) {
            updateData.currentPlayer = 1 - this.data.currentPlayer;
            updateData.message = '';
          }
        } else {
          // 没有形成阵型切换对方回合
          if (!formationUpdate) {
            updateData.currentPlayer = 1 - this.data.currentPlayer;
            updateData.message = '';
          }
        }
      }

      // 使用一次setData更新所有状态
      this.setData(updateData, () => {
        // 结束更新状态
        setTimeout(() => {
          this.setData({
            isUpdating: false
          });
        }, 100); // 添加小延迟确保UI更新完成
      });
    },

    // 处理移动阶段的落子逻辑
    handleMoveDrop: function(color, startRow, startCol, row, col) {
      // 更新棋盘
      // 更新棋盘
      const { newBoard, formationUpdate } = this.updateBoardAndCheckFormation(row, col, color, startRow, startCol);
      // 准备要更新的数据对象
      let updateData = {
        board: newBoard,
        isUpdating: true
      };
      if (formationUpdate) {
        Object.assign(updateData, formationUpdate);
      }   

      // 检查是否形成阵型
      const formationUpdateDestroy = this.checkFormation(startRow, startCol, color); 
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

      // 处理额外移动次数，在移动阶段，如果形成阵型，则不切换回合，获得的额外移动次数可用于吃子
      if (updateData.extraMoves > 0) {
        // 切换到吃子阶段，同时更新吃子次数
        updateData.gamePhase = 'removing';
        updateData.message = `请移除${this.data.currentPlayer === 1 ? '黑方' : '白方'}棋子`;
      } else if (!formationUpdate) {
        // 没有形成阵型，切换对方回合
        updateData.currentPlayer = 1 - this.data.currentPlayer;
        updateData.message = `请${this.data.currentPlayer === 1 ? '黑方' : '白方'}移动棋子`;  // 请对方移动棋子
      }

      // 使用一次setData更新所有状态
      this.setData(updateData, () => {
        setTimeout(() => {
          this.setData({ isUpdating: false });
        }, 100);
      });

      // 检查游戏是否结束
      this.checkGameOver();
    },

    // 检查特殊阵型（大方、三斜等）
    checkFormation: function(row, col, currentColor) {
      let extraMoves = 0;
      let formationPositions = [];
      let formationType = '';
      const newBoard = this.data.board;
      // 检查大方
      const squareResult = this.checkSquare(row, col, currentColor, newBoard);
      if (squareResult.squareCount > 0) {
        extraMoves += squareResult.squareCount; // 每个大方增加1次额外落子
        formationPositions.push(...squareResult.formationPositions);
        formationType += squareResult.squareCount > 1 ? `${squareResult.squareCount}个大方 ` : '大方 ';
      }
      
      // 检查斜线
      const diagonalResult = this.checkDiagonal(row, col, currentColor, newBoard);
      if (diagonalResult.diagonalCounts.length > 0) {
        // 去重，确保每个斜线只被计算一次
        const uniqueDiagonalCounts = diagonalResult.diagonalCounts;
        
        for (const count of uniqueDiagonalCounts) {
          extraMoves += count - 2; // 每个斜线增加 (count - 2) 次额外落子
          formationPositions.push(...diagonalResult.formationPositions);
          formationType += `${count}斜 `; // 添加空格分隔多个斜线
        }
      }
      
      // 检查龙
      const dragonResult = this.checkDragon(row, col, currentColor, newBoard);
      if (dragonResult.dragonCount > 0) {
        extraMoves += dragonResult.dragonCount * 4; // 每条龙增加4次额外落子
        formationPositions.push(...dragonResult.formationPositions);
        formationType += dragonResult.dragonCount > 1 ? '双龙 ' : '龙 ';
      }
      
      if (extraMoves > 0) {
        // 返回需要更新的数据
        return {
            extraMoves: extraMoves,
            formationPositions: formationPositions,
            formationType: formationType
          };  
      }
      return null; // 表示没有形成阵型
    },
     
    // 检查是否形成大方
    checkSquare: function(row, col, currentColor, newBoard) {
      const board = newBoard;
      
      // 检查周围的四个点位
      const directions = [
        [[-1, -1], [-1, 0], [0, -1]], // 左上大方
        [[-1, 0], [-1, 1], [0, 1]],   // 右上大方
        [[0, -1], [1, -1], [1, 0]],   // 左下大方
        [[0, 1], [1, 0], [1, 1]]      // 右下大方
      ];
      
      let squareCount = 0; // 记录形成大方的数量
      let formationPositions = []; // 记录所有大方的棋子位置
      

      for (let pattern of directions) {
        let isSquare = true;
        let tempFormationPositions = [];
        for (let [dx, dy] of pattern) {
          const newRow = row + dx;
          const newCol = col + dy;
          if (!this.isValidPosition(newRow, newCol) || 
              !board[newRow][newCol] ||
              board[newRow][newCol].color !== currentColor) {
            isSquare = false;
            break;
          }
          tempFormationPositions.push({row: newRow, col: newCol});
        }
        if (isSquare) {
          squareCount++; // 增加大方的数量
          formationPositions.push(...tempFormationPositions); // 添加中心点
          // 只添加一次中心点
          if (squareCount === 1) {
            formationPositions.push({row: row, col: col}); // 添加中心点
          }
        }
      }

      return {
        squareCount: squareCount,
        formationPositions: formationPositions
      };
    },
    
    // 检查斜线
    checkDiagonal: function(row, col, currentColor, newBoard) {
      const board = newBoard;
      
      // 两个斜线方向：左上到右下、右上到左下
      const directions = [
        { dx: 1, dy: 1 },   // 左上到右下
        { dx: 1, dy: -1 }   // 右上到左下
      ];

      let diagonalCounts = []; // 记录所有斜线的连续棋子数量
      let formationPositions = []; // 记录所有斜线的棋子位置

      for (const dir of directions) {
        const { dx, dy } = dir;

        // 计算整个方向上的棋子数，并寻找完整的边界
        let startRow = row, startCol = col;
        let endRow = row, endCol = col;
        let count = 1;
        let tempFormationPositions = [];
        // 向起点方向查找
        while (this.isValidPosition(startRow - dx, startCol - dy) &&
               board[startRow - dx][startCol - dy]?.color === currentColor) {
          count++;
          startRow -= dx;
          startCol -= dy;
          tempFormationPositions.push({row: startRow, col: startCol});
        }

        // 向终点方向查找
        while (this.isValidPosition(endRow + dx, endCol + dy) &&
               board[endRow + dx][endCol + dy]?.color === currentColor) {
          count++;
          endRow += dx;
          endCol += dy;
          tempFormationPositions.push({row: endRow, col: endCol});
        }

        // 只有当起点和终点都在棋盘边线上时，才符合斜线规则
        if (this.isOnEdge(startRow, startCol) && this.isOnEdge(endRow, endCol)) {
          
          if (count >= 3) { // 只记录3斜及以上的斜线
            diagonalCounts.push(count);
            if (formationPositions.length === 0) { // 如果斜线没有棋子，则添加中心点
              formationPositions.push({row: row, col: col}); // 添加中心点
            }
            formationPositions.push(...tempFormationPositions);
          }
        }
      }

      return {
        diagonalCounts: diagonalCounts,
        formationPositions: formationPositions
      };
    },      
    
    // 检查是否在边线
    isOnEdge: function(row, col) {
      return row === 0 || row === 5 || col === 0 || col === 5;
    },      
    
    // 检查龙（横竖六子连线）
    checkDragon: function(row, col, currentColor, newBoard) {
      const board = newBoard;
      
      // 定义水平和垂直方向
      const directions = [
        { dx: 0, dy: 1 },  // 水平方向
        { dx: 1, dy: 0 }   // 垂直方向
      ];

      let dragonCount = 0; // 记录形成龙的数量
      let formationPositions = []; // 记录所有龙的棋子位置

      // 检查每个方向
      for (const dir of directions) {
        const { dx, dy } = dir;

        // 向一个方向检查
        let r = row + dx;
        let c = col + dy;
        let count = 1;
        let edgeCount = this.isOnEdge(row, col) ? 1 : 0; // 统计边线上的棋子数量
        let tempFormationPositions = [];
        while (this.isValidPosition(r, c) && board[r][c]?.color === currentColor) {
          count++;
          if (this.isOnEdge(r, c)) edgeCount++;
          if(edgeCount === 3){
            break;
          }
          tempFormationPositions.push({row: r, col: c});
          r += dx;
          c += dy;
        }

        // 向相反方向检查
        r = row - dx;
        c = col - dy;
        while (this.isValidPosition(r, c) && board[r][c]?.color === currentColor) {
          count++;
          if (this.isOnEdge(r, c)) edgeCount++;
          if(edgeCount === 3){
            break;
          }
          tempFormationPositions.push({row: r, col: c});
          r -= dx;
          c -= dy;
        }

        // 检查是否形成6个连续棋子，并且不全部在边线上
        if (count === 6 && edgeCount < 3) {
          dragonCount++; // 增加龙的数量
          
          formationPositions.push(...tempFormationPositions);

          if (dragonCount === 1) {
            formationPositions.push({row: row, col: col}); // 添加中心点
          }
        }
      }

      return {
        dragonCount: dragonCount,
        formationPositions: formationPositions
      };
    },
    
    // 检查位置是否有效
    isValidPosition: function(row, col) {
      return row >= 0 && row <= 5 && col >= 0 && col <= 5;
    },
    // 检查游戏是否结束
    checkGameOver: function() {
      const conditions = [
        { check: () => this.data.blackCount < 3, winner: '白方' },
        { check: () => this.data.whiteCount < 3, winner: '黑方' },
        { check: () => this.data.currentPlayer === 0 && this.data.extraMoves >= this.data.whiteCount -2, winner: '黑方' },
        { check: () => this.data.currentPlayer === 1 && this.data.extraMoves >= this.data.blackCount -2, winner: '白方' },
        { check: () => this.data.gamePhase === 'moving' && !this.hasValidMoves(), winner: this.data.currentPlayer === 0 ? '白方' : '黑方' }
      ];

      for (const { check, winner } of conditions) {
        if (check()) {
          this.showGameOver(winner);
          break;
        }
      }
    },
    showGameOver: function(winner) {
      this.setData({ gameOver: true });
      wx.showModal({
        title: '游戏结束',
        content: `${winner}获胜！`,
        showCancel: false,
        confirmText: '重新开始',
        success: (res) => {
          if (res.confirm) {
            this.initBoardAndIntersections();
          }
        }
      });
    },
    // 重新开始游戏
    restartGame: function() {
      this.initBoardAndIntersections();
    },
    // 跳转到规则页面
    goToRules: function() {
      wx.navigateTo({
        url: '/pages/rules/rules'
      });
    },

    // 新增：检查棋盘是否已满
    isBoardFull: function() {
      // 获取当前棋子数量
      let totalCount = this.data.blackCount + this.data.whiteCount;
      // 因为判断时棋盘还未更新，所以需要加1
      totalCount += 1;
      
      // 棋盘总格子数为36
      return totalCount === 36;
    },

    // 移除对方棋子
    removeOpponentPiece: function(row, col) {
      // 对方棋子的颜色
      const currentColor = this.data.players[1-this.data.currentPlayer];

      // 优先级 1：优先移除不在阵型中的棋子
      if (!this.data.board[row][col].isFormation) { 
        // 直接移除
        return this._removePiece(row, col);
      }
      
      //  当前棋子在阵型中，同时棋盘中有不在阵型中的棋子，优先移除不在阵型中的棋子
      if (this.hasNonFormationPieces(currentColor)) {        
        return false;
      } 
      
      // 优先级 2：如果没有不在阵型中的棋子，移除斜线或龙阵型中的棋子
      const newBoard = this.data.board;
      // 检查当前棋子是否处在大方
      const squareResult = this.checkSquare(row, col, currentColor, newBoard);
      if (squareResult.squareCount > 0) {
        let formationPositions = [];
        // 处在大方阵型中，再判断盘中是否有其他棋子不包含'大方'
        formationPositions.push(...squareResult.formationPositions);
        const hasNonSquarePieces = this.hasNonSquarePieces(currentColor, formationPositions);
        if(!hasNonSquarePieces){
          return this._removePiece(row, col);
        }  
        
        return false;
        
      }
      // 不在大方阵型中，直接移除棋子
      return this._removePiece(row, col); 
    },


    // 内部方法：实际移除棋子
    _removePiece: function(row, col) {
      const targetPiece = this.data.board[row][col];

      // 更新棋盘
      let newBoard = [...this.data.board];
      newBoard[row][col] = null;

      // 更新棋子数量
      let newBlackCount = this.data.blackCount;
      let newWhiteCount = this.data.whiteCount;
      if (targetPiece.color === 'black') newBlackCount--;
      if (targetPiece.color === 'white') newWhiteCount--;

      // 检查是否形成阵型
      const formationUpdate = this.checkFormation(row, col, targetPiece.color);
      if (formationUpdate) { 
        if (formationUpdate.formationPositions && Array.isArray(formationUpdate.formationPositions)) {
          formationUpdate.formationPositions.forEach(pos => {
            if (newBoard[pos.row][pos.col]) {
              // 检查该棋子是否仍然参与其他阵型
              const isStillInFormation = this.isStillInFormation(pos.row, pos.col, targetPiece.color, newBoard);
              if (!isStillInFormation) {
                newBoard[pos.row][pos.col].isFormation = false;
              }
            }
          });
        }
      }

      this.setData({
        board: newBoard,
        blackCount: newBlackCount,
        whiteCount: newWhiteCount,
        extraMoves: this.data.extraMoves - 1
      });

      return true;
    },

    hasNonSquarePieces: function(currentColor, formationPositions, row = 0, col = 0) {
      const board = this.data.board;

      // 检查当前格子
      if (board[row][col] && board[row][col].color === currentColor) {
        const isInFormation = formationPositions.some(pos => pos.row === row && pos.col === col);
        if (!isInFormation) {
          const squareResult = this.checkSquare(row, col, currentColor, board);
          if (squareResult.squareCount === 0) {
            this.showMessage('优先移除对方阵型中没有形成大方的棋子，比如第' + (row + 1) + '行, 第' + (col + 1) + '列的棋子');
            return true;
          } else {
            formationPositions.push(...squareResult.formationPositions);
          }
        }
      }

      // 递归检查下一个格子
      if (col < 5) {
        return this.hasNonSquarePieces(currentColor, formationPositions, row, col + 1);
      } else if (row < 5) {
        return this.hasNonSquarePieces(currentColor, formationPositions, row + 1, 0);
      }

      // 所有格子检查完毕，返回 false
      return false;
    },
    // 检查是否有不在阵型中的棋子
    hasNonFormationPieces: function(opponentColor) {
      const board = this.data.board;

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          if (board[row][col] && board[row][col].color === opponentColor) {
            if (!board[row][col].isFormation) {
              this.showMessage('优先移除不在阵型中的棋子，比如第' + (row+1) + '行, 第' + (col+1) + '列的棋子');
              return true; // 找到不在阵型中的棋子
            }
          }
        }
      }

      return false; // 没有找到不在阵型中的棋子
    },


    // 检查棋子是否仍然参与其他阵型
    isStillInFormation: function(row, col, currentColor, newBoard) {

      // 检查大方
      const squareResult = this.checkSquare(row, col, currentColor, newBoard);
      if (squareResult.squareCount > 0) {
        return true; // 大方仍然完整
      }

      // 检查斜线
      const diagonalResult = this.checkDiagonal(row, col, currentColor, newBoard);
      if (diagonalResult.diagonalCounts.length > 0) {
        return true;
      }

      // 检查龙
      const dragonResult = this.checkDragon(row, col, currentColor, newBoard);
      if (dragonResult.dragonCount > 0) {
        return true;
      }

      return false; // 如果没有参与任何阵型，返回 false
    },

    // 检查某个棋子是否可以移动
    canMove: function(row, col) {
      const board = this.data.board;
      const directions = [
        { dx: -1, dy: 0 }, // 上
        { dx: 1, dy: 0 },  // 下
        { dx: 0, dy: -1 }, // 左
        { dx: 0, dy: 1 }   // 右
      ];

      for (const dir of directions) {
        const newRow = row + dir.dx;
        const newCol = col + dir.dy;
        if (this.isValidPosition(newRow, newCol) && !board[newRow][newCol]) {
          return true; // 如果有一个方向可以移动，返回 true
        }
      }
      return false; // 所有方向都被占据，无法移动
    },

    // 检查当前玩家是否有棋子可以移动
    hasValidMoves: function() {
      const board = this.data.board;
      const currentColor = this.data.players[this.data.currentPlayer];

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          if (board[row][col] && board[row][col].color === currentColor && this.canMove(row, col)) {
            return true; // 如果有一个棋子可以移动，返回 true
          }
        }
      }
      return false; // 所有棋子都无法移动
    },

    updateBoardAndCheckFormation: function(row, col, color, startRow = null, startCol = null) {
      let newBoard = [...this.data.board];
      newBoard[row][col] = { color, isFormation: false };

      if (startRow !== null && startCol !== null) {
        newBoard[startRow][startCol] = null;
      }

      const formationUpdate = this.checkFormation(row, col, color);
      if (formationUpdate) {
        formationUpdate.formationPositions.forEach(pos => {
          if (newBoard[pos.row] && newBoard[pos.row][pos.col] && newBoard[pos.row][pos.col].isFormation === false) {
            newBoard[pos.row][pos.col].isFormation = true;
          }
        });
      }

      return { newBoard, formationUpdate };
    },

    showMessage: function(message, icon = 'none', duration = 1500) {
      wx.showToast({ title: message, icon, duration });
    },

    getBoardPosition: function(touch) {
      const query = wx.createSelectorQuery();
      query.select('.board').boundingClientRect();
      return new Promise((resolve) => {
        query.exec((res) => {
          if (res && res[0]) {
            const boardRect = res[0];
            const boardX = touch.clientX - boardRect.left;
            const boardY = touch.clientY - boardRect.top;
            resolve({ boardX, boardY, boardRect });
          } else {
            resolve(null);
          }
        });
      });
    },
  });
