// src/data/items.js

export const ItemDB = {
    // --- 食物類 ---
    "rice": {
        name: "白米飯",
        type: "food",
        value: 40, // 回復食物值
        desc: "一碗熱騰騰、香噴噴的白米飯。"
    },
    "dumpling": {
        name: "肉包子",
        type: "food",
        value: 20,
        desc: "一個皮薄餡多的大肉包，看起來很好吃。"
    },
    "bread": {
        name: "乾糧",
        type: "food",
        value: 15,
        desc: "一塊乾硬的大餅，適合出遠門時攜帶。"
    },
    "roast_chicken": {
        name: "烤雞",
        type: "food",
        value: 80,
        desc: "一隻烤得金黃酥脆的肥雞，令人垂涎三尺。"
    },

    // --- 飲品類 ---
    "waterskin": {
        name: "牛皮水袋",
        type: "drink",
        value: 50, // 回復飲水值
        desc: "一個鼓鼓的牛皮水袋，裝滿了清水。"
    },
    "tea": {
        name: "烏龍茶",
        type: "drink",
        value: 30,
        desc: "一杯剛泡好的熱茶，清香撲鼻。"
    },
    "wine": {
        name: "女兒紅",
        type: "drink",
        value: 20,
        desc: "一罈陳年好酒，聞起來酒香四溢。(喝酒可能會誤事？)"
    }
};