const ACHIEVEMENTS = {
    FORMATIONS: {
        FIRST_FORMATION: { id: 'first_formation', name: '阵法入门', desc: '首次形成阵型', points: 10 },
        FORMATION_MASTER: { id: 'formation_master', name: '阵法大师', desc: '累计形成50次阵型', points: 100 },
        DRAGON_MASTER: { id: 'dragon_master', name: '降龙大师', desc: '首次形成大龙阵', points: 50 }
    },
    VICTORIES: {
        FIRST_WIN: { id: 'first_win', name: '初战告捷', desc: '首次获胜', points: 20 },
        WIN_STREAK: { id: 'win_streak', name: '连胜达人', desc: '连续获胜3次', points: 30 },
        MASTER_WIN: { id: 'master_win', name: '战胜高手', desc: '在困难模式下获胜', points: 50 }
    },
    SKILLS: {
        QUICK_LEARNER: { id: 'quick_learner', name: '快速学习', desc: '完成新手教程', points: 10 },
        STRATEGIC_MIND: { id: 'strategic_mind', name: '战略思维', desc: '一局游戏中连续形成3个阵型', points: 40 }
    }
};

export const RANKS = [
    { name: '新手学徒', minPoints: 0 },
    { name: '棋艺初成', minPoints: 100 },
    { name: '阵法师', minPoints: 300 },
    { name: '棋道大师', minPoints: 600 },
    { name: '棋圣', minPoints: 1000 }
];

const DAILY_TASKS = [
    { id: 'daily_game', desc: '每日对战1局', points: 10 },
    { id: 'daily_win', desc: '每日获胜1次', points: 20 },
    { id: 'daily_duration', desc: '每日对战15分钟', points: 15 }
];

export const RewardManager = {
    checkAchievements: function(gameData, storageData) {
        const newAchievements = [];
        
        // 检查阵型相关成就
        if (gameData.formationCount === 1) {
            newAchievements.push(ACHIEVEMENTS.FORMATIONS.FIRST_FORMATION);
        }
        
        // 检查胜利相关成就
        if (!storageData.hasFirstWin && gameData.isWinner) {
            newAchievements.push(ACHIEVEMENTS.VICTORIES.FIRST_WIN);
        }
        
        // 检查连胜
        if (gameData.winStreak >= 3) {
            newAchievements.push(ACHIEVEMENTS.VICTORIES.WIN_STREAK);
        }
        
        return newAchievements;
    },

    updatePlayerStats: function(gameData) {
        const stats = wx.getStorageSync('playerStats') || {
            totalGames: 0,
            totalWins: 0,
            totalPoints: 0,
            achievements: [],
            rank: RANKS[0].name
        };
    
        // 更新统计数据
        stats.totalGames++;
        if (gameData.isWinner) {
            stats.totalWins++;
            stats.totalPoints += 10; // 获胜奖励10积分
        }
    
        // 检查是否需要更新段位
        for (let i = RANKS.length - 1; i >= 0; i--) {
            if (stats.totalPoints >= RANKS[i].minPoints) {
                stats.rank = RANKS[i].name;
                break;
            }
        }
    
        // 更新每日任务
        const { tasks, pointsEarned } = this.updateDailyTasks(gameData);
    
        // 保存更新后的统计数据
        wx.setStorageSync('playerStats', stats);
    
        return { stats, tasks, pointsEarned };
    },

    getDailyTasks: function() {
        const today = new Date().toDateString();
        const tasks = wx.getStorageSync('dailyTasks') || {};
        
        if (tasks.date !== today) {
            // 重置每日任务
            tasks.date = today;
            tasks.list = DAILY_TASKS.map(task => ({...task, completed: false}));
            wx.setStorageSync('dailyTasks', tasks);
        }
        
        return tasks.list;
    },
    updateDailyTasks: function(gameData) {
        const tasks = wx.getStorageSync('dailyTasks') || { list: [] };
        let pointsEarned = 0;
    
        tasks.list.forEach(task => {
            if (!task.completed) {
                // 检查任务完成条件
                if (task.id === 'daily_game' && gameData.totalGames >= 1) {
                    task.completed = true;
                    pointsEarned += task.points;
                } else if (task.id === 'daily_win' && gameData.totalWins >= 1) {
                    task.completed = true;
                    pointsEarned += task.points;
                } else if (task.id === 'daily_duration' && gameData.formationCount >= 3) {
                    task.completed = true;
                    pointsEarned += task.points;
                }
            }
        });
    
        // 更新任务列表
        wx.setStorageSync('dailyTasks', tasks);
    
        // 更新玩家积分
        const stats = wx.getStorageSync('playerStats') || { totalPoints: 0 };
        stats.totalPoints += pointsEarned;
        wx.setStorageSync('playerStats', stats);
    
        return { tasks: tasks.list, pointsEarned };
    },
};