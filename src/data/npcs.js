// src/data/npcs.js

export const NPCDB = {
    "waiter": {
        id: "waiter",
        name: "店小二",
        description: "一位勤快的店小二。",
        attributes: { str: 15, con: 15, per: 15, kar: 15, int: 15, cor: 15 },
        combat: { hp: 100, maxHp: 100, attack: 10, defense: 5, xp: 0 },
        shop: { "rice": 50, "dumpling": 100, "bread": 30, "roast_chicken": 500, "waterskin": 200, "tea": 50, "wine": 1000 }
    },
    "blacksmith": {
        id: "blacksmith",
        name: "鐵匠",
        description: "一位肌肉虯結的壯漢，正揮舞著大鐵鎚打造兵器。",
        attributes: { str: 40, con: 40, per: 20, kar: 20, int: 20, cor: 20 },
        combat: { hp: 500, maxHp: 500, attack: 50, defense: 30, xp: 0 },
        shop: { "iron_sword": 500, "steel_blade": 1000, "cloth_armor": 200, "leather_armor": 500 }
    },
    "gym_master": {
        id: "gym_master",
        name: "王教頭",
        description: "飛龍武館的總教頭。",
        attributes: { str: 60, con: 60, per: 50, kar: 30, int: 40, cor: 30 },
        combat: { hp: 2000, maxHp: 2000, attack: 100, defense: 80, xp: 0 },
        skills: { "unarmed": 100, "sword": 100, "force": 100, "dodge": 100, "iron-palm": 80, "swift-sword": 80, "turtle-force": 80, "leaf-steps": 80 },
        family: "common_gym",
        title: "飛龍武館館主"
    },
    "rabbit": {
        id: "rabbit",
        name: "野兔",
        description: "一隻可愛的小野兔，正在吃草。",
        attributes: { str: 5, con: 5, per: 25, kar: 20, int: 10, cor: 10 },
        combat: { hp: 50, maxHp: 50, attack: 10, defense: 0, xp: 10 },
        skills: { "dodge": 20, "unarmed": 10 }, 
        drops: [{ id: "rabbit_meat", rate: 1.0 }, { id: "rabbit_skin", rate: 0.5 }]
    },
    "boar": {
        id: "boar",
        name: "野豬",
        description: "一隻兇猛的野豬。",
        attributes: { str: 20, con: 20, per: 10, kar: 10, int: 5, cor: 5 },
        combat: { hp: 120, maxHp: 120, attack: 30, defense: 20, xp: 50 },
        skills: { "dodge": 40, "unarmed": 50 },
        drops: [{ id: "boar_meat", rate: 1.0 }, { id: "boar_tooth", rate: 0.3 }]
    },
    "wolf": {
        id: "wolf",
        name: "野狼",
        description: "眼神兇惡的野狼。",
        attributes: { str: 25, con: 20, per: 30, kar: 10, int: 15, cor: 10 },
        combat: { hp: 150, maxHp: 150, attack: 45, defense: 15, xp: 80 },
        skills: { "dodge": 80, "unarmed": 80 },
        drops: [{ id: "wolf_skin", rate: 0.4 }, { id: "rabbit_meat", rate: 0.5 }]
    },
    "bear": {
        id: "bear",
        name: "黑熊",
        description: "一頭巨大的黑熊。",
        attributes: { str: 80, con: 80, per: 15, kar: 10, int: 10, cor: 10 },
        combat: { hp: 800, maxHp: 800, attack: 90, defense: 60, xp: 300 },
        skills: { "dodge": 60, "unarmed": 120, "force": 100 },
        drops: [{ id: "bear_skin", rate: 1.0 }, { id: "bear_paw", rate: 0.2 }]
    }
};