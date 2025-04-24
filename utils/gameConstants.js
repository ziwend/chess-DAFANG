// 游戏常量定义

// 方向常量
export const DIRECTIONS = {
    ADJACENT: [
        { dx: -1, dy: 0 },  // 上
        { dx: 1, dy: 0 },   // 下
        { dx: 0, dy: -1 },  // 左
        { dx: 0, dy: 1 }    // 右
    ],
    NEIGHBORS: [
        [-1, -1], [-1, 0], [0, -1], [0, 1], [-1, 1], [1, -1], [1, 1],[1, 0]  // 8个相邻点
    ],
    CORNERPOSITIONS: [
        { pos: [1, 1], adjacent: [[1, 2], [2, 1]] },
        { pos: [1, 4], adjacent: [[1, 3], [2, 4]] },
        { pos: [4, 1], adjacent: [[3, 1], [4, 2]] },
        { pos: [4, 4], adjacent: [[3, 4], [4, 3]] }
    ],  // 四个角落及其相邻位置
    SQUARE_PATTERNS: [
        [[-1, -1], [-1, 0], [0, -1]],  // 左上大方
        [[-1, 0], [-1, 1], [0, 1]],    // 右上大方
        [[0, -1], [1, -1], [1, 0]],    // 左下大方
        [[0, 1], [1, 0], [1, 1]]       // 右下大方
    ], // 大方方向
    DIAGONAL_PATTERNS: [{
        dx: 1,
        dy: 1
    },
    // 左上到右下
    {
        dx: 1,
        dy: -1
    } // 右上到左下
    ],  // 斜线方向
    DRAGON_PATTERNS: [{
                dx: 0,
                dy: 1
            },
            // 水平方向
            {
                dx: 1,
                dy: 0
            } // 垂直方向
            ], // 定义水平和垂直方向
};

// 位置权重
export const WEIGHTS = [
    [0, 0.5, 0.7, 0.7, 0.5, 0],
    [0.5, 1, 0.9, 0.9, 1, 0.5],
    [0.7, 0.9, 0.8, 0.8, 0.9, 0.7],
    [0.7, 0.9, 0.8, 0.8, 0.9, 0.7],
    [0.5, 1, 0.9, 0.9, 1, 0.5],
    [0, 0.5, 0.7, 0.7, 0.5, 0],
];

// AI系统提示
export const GAMEHISTORY = [{
    role: "system",
    content: "你是一个下大方棋的高手。棋盘是一个6横线6竖线的方形。" +
        "游戏由black和white两方参与，从 'placing'（放置）阶段开始，轮流放置棋子，如果一方放置的棋子组成了特殊阵型(3斜，4斜，5斜，6斜，大方和大龙，对应阵型中的棋子的isFormation标志会被设置为true)，获得额外放置的机会，继续放置棋子；" +
        "当棋盘放满棋子后，进入交替'removing'（吃子）阶段，双方各吃掉对方一颗非阵型中的棋子；" +
        "然后进入'moving'（移动）阶段, 移动的目的有两个，形成新的阵型，获取奖励，吃掉对方棋子或者是阻止对方形成新的阵型;" +
        "当棋盘上一方棋子的数量少于3颗或者无棋子可移动时，则对方获胜，游戏结束。" +
        "请根据发送给你的历史对局学习策略，然后根据当前棋盘状态(由一个6*6的二维数组组成，元素对象如{\"color\":\"black\",\"isFormation\":false})" +
        "和游戏阶段(placing|moving|removing)给出你的决策，返回content格式请严格限制为：" +
        "{\"action\": \"placing|moving|removing\", \"position\": [row,col], \"newPosition\": [row,col]}" +
        "其中\"newPosition\": [row,col]只有在对应action=moving时才需要，返回内容不得包含多余字符。"
}];

export const CONFIG = {
    DEBUG: true,
    FORMATION_CHACE_SIZE: 50,
    PLAYERS: ['black', 'white'],
    INIT_MESG: "点击中间按钮，从黑方开始轮流布子",
    INITIAL_BOARD: Array.from({ length: 6 }, () => new Array(6).fill(null)),
    GAME_PHASES: {
        PLACING: 'placing',
        MOVING: 'moving',
        REMOVING: 'removing'
    },
    BOARD_SIZE: 6,
    MIN_PIECES_TO_WIN: 3,
    MAX_PIECES_COUNT: 36,
    DEFAULT_PLAYER_CONFIG: {
        black: {
            playerType: 'self',
            difficulty: 'easy',
            aiConfig: {
                url: '',
                model: '',
                apiKey: ''
              }
        },
        white: {
            playerType: 'local',
            difficulty: 'easy',
            aiConfig: {
                url: '',
                model: '',
                apiKey: ''
              }
        }
    },
    MCTS_CONFIG: {
        easy: {
            minDepth: 1,
            maxDepth: 5,
            minSimulations: 10,
            maxSimulations: 50,
        },
        medium: {
            minDepth: 1,
            maxDepth: 10,
            minSimulations: 10,
            maxSimulations: 100,
        },
        hard: {
            minDepth: 1,
            maxDepth: 15,
            minSimulations: 10,
            maxSimulations: 150,
        },
    }, // 其他全局配置...
};
