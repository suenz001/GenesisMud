// src/data/npcs.js

export const NPCDB = {
    "waiter": {
        id: "waiter",
        name: "店小二",
        description: "一位勤快的店小二，肩上搭著一條毛巾，正忙著招呼客人。",
        // 價格單位：文 (Coins)
        shop: {
            "rice": 50,         // 白米飯 50文
            "dumpling": 100,    // 肉包子 100文
            "bread": 30,        // 乾糧 30文
            "roast_chicken": 500, // 烤雞 500文
            "waterskin": 200,   // 牛皮水袋 200文
            "tea": 50,          // 烏龍茶 50文
            "wine": 1000        // 女兒紅 1兩銀子 (1000文)
        }
    }
};