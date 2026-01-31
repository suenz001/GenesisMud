// src/data/npcs.js

export const NPCDB = {
    // 原有的店小二
    "waiter": {
        id: "waiter",
        name: "店小二",
        description: "一位勤快的店小二，肩上搭著一條毛巾，正忙著招呼客人。",
        shop: {
            "rice": 50,
            "dumpling": 100,
            "bread": 30,
            "roast_chicken": 500,
            "waterskin": 200,
            "tea": 50,
            "wine": 1000
        }
    },

    // --- 新增：武館教頭 ---
    "gym_master": {
        id: "gym_master",
        name: "王教頭",
        description: "飛龍武館的總教頭，身材魁梧，目光如電。他擅長鐵砂掌與疾風劍法。",
        // 師傅擁有的技能與等級 (玩家學藝不能超過此等級)
        skills: {
            "unarmed": 100,
            "sword": 100,
            "force": 100,
            "dodge": 100,
            "parry": 100,
            "iron-palm": 80,   // 進階拳腳
            "swift-sword": 80, // 進階劍法
            "turtle-force": 80,// 進階內功
            "leaf-steps": 80   // 進階輕功
        },
        // 門派標籤 (用於確認是否同門)
        family: "common_gym",
        title: "飛龍武館館主"
    }
};