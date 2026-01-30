// src/data/npcs.js

export const NPCDB = {
    "waiter": {
        id: "waiter",
        name: "店小二",
        description: "一位勤快的店小二，肩上搭著一條毛巾，正忙著招呼客人。",
        // 商品列表 (對應 ItemDB 的 id : 價格)
        shop: {
            "rice": 10,         // 白米飯 10兩
            "dumpling": 20,     // 肉包子 20兩
            "bread": 5,         // 乾糧 5兩
            "roast_chicken": 50,// 烤雞 50兩
            "waterskin": 20,    // 牛皮水袋 20兩
            "tea": 10,          // 烏龍茶 10兩
            "wine": 100         // 女兒紅 100兩
        }
    }
    // 未來可以加 "guard", "boss" 等
};