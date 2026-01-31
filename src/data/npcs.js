// src/data/npcs.js

export const NPCDB = {
    "waiter": {
        id: "waiter",
        name: "店小二",
        description: "一位勤快的店小二。",
        shop: { "rice": 50, "dumpling": 100, "bread": 30, "roast_chicken": 500, "waterskin": 200, "tea": 50, "wine": 1000 }
    },
    "gym_master": {
        id: "gym_master",
        name: "王教頭",
        description: "飛龍武館的總教頭。",
        skills: { "unarmed": 100, "sword": 100, "force": 100, "dodge": 100, "parry": 100, "iron-palm": 80, "swift-sword": 80, "turtle-force": 80, "leaf-steps": 80 },
        family: "common_gym",
        title: "飛龍武館館主"
    },

    // --- 新增：森林野獸 ---
    "rabbit": {
        id: "rabbit",
        name: "野兔",
        description: "一隻可愛的小野兔，正在吃草。",
        // 野獸通常只有基礎技能
        skills: { "dodge": 20, "unarmed": 10 }, 
        // 掉落物 (id: 物品ID, rate: 機率 0~1)
        drops: [
            { id: "rabbit_meat", rate: 1.0 },
            { id: "rabbit_skin", rate: 0.5 }
        ]
    },
    "boar": {
        id: "boar",
        name: "野豬",
        description: "一隻兇猛的野豬，長著長長的獠牙，脾氣看起來很不好。",
        skills: { "dodge": 40, "unarmed": 50, "parry": 40 },
        drops: [
            { id: "boar_meat", rate: 1.0 },
            { id: "boar_tooth", rate: 0.3 }
        ]
    },
    "wolf": {
        id: "wolf",
        name: "野狼",
        description: "眼神兇惡的野狼，嘴角流著口水，似乎餓了很久。",
        skills: { "dodge": 80, "unarmed": 80, "parry": 60 },
        drops: [
            { id: "wolf_skin", rate: 0.4 },
            { id: "rabbit_meat", rate: 0.5 } // 肚子裡可能有剛吃的兔子
        ]
    },
    "bear": {
        id: "bear",
        name: "黑熊",
        description: "一頭巨大的黑熊，站起來像座小山一樣。",
        skills: { "dodge": 60, "unarmed": 120, "parry": 100, "force": 100 }, // 皮厚血多
        drops: [
            { id: "bear_skin", rate: 1.0 },
            { id: "bear_paw", rate: 0.2 }
        ]
    }
};