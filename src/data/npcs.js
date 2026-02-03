// src/data/npcs.js

export const NPCDB = {
    // === 城镇 NPC ===
    "waiter": {
        id: "waiter",
        name: "店小二",
        description: "一位勤快的店小二。",
        attributes: { str: 15, con: 15, per: 15, kar: 15, int: 15, cor: 15 },
        combat: { hp: 100, maxHp: 100, attack: 10, defense: 5, xp: 0 },
        shop: { "rice": 10, "dumpling": 15, "bread": 5, "roast_chicken": 50, "waterskin": 20, "tea": 10, "wine": 80 }
    },
    "blacksmith": {
        id: "blacksmith",
        name: "鐵匠",
        description: "一位肌肉虯結的壯漢，正揮舞著大鐵鎚打造兵器。",
        attributes: { str: 40, con: 40, per: 20, kar: 20, int: 20, cor: 20 },
        combat: { hp: 500, maxHp: 500, attack: 50, defense: 30, xp: 0 },
        shop: { 
            // --- 武器 (新手特價區) ---
            "stone": 10,           // 飛蝗石
            "wooden_staff": 50,    // 木棍
            "bamboo_spear": 80,    // 竹槍
            "dagger": 100,         // 匕首
            "leather_whip": 120,   // 皮鞭
            "iron_sword": 150,     // 鐵劍
            "throwing_knife": 300, // 柳葉飛刀
            "steel_blade": 400,    // 鋼刀

            // --- 防具與配件 (全身套裝) ---
            "straw_sandals": 10,   // 草鞋 (腳)
            "cloth_wrists": 15,    // 布護腕 (手)
            "cloth_cap": 20,       // 布帽 (頭)
            "cloth_trousers": 20,  // 粗布長褲 (腿)
            "old_cloak": 30,       // 破舊披風 (背)
            "cloth_armor": 50,     // 布衣 (身)
            "copper_amulet": 50,   // 護身符 (頸)
            
            // --- 進階防具 ---
            "leather_armor": 300,
            "leather_boots": 250
        }
    },
    "gym_master": {
        id: "gym_master",
        name: "王教頭",
        description: "飛龍武館的總教頭，精通十八般武藝，但似乎都不算頂尖。",
        title: "飛龍武館館主",
        family: "common_gym",
        attributes: { str: 60, con: 60, per: 50, kar: 30, int: 40, cor: 30 },
        combat: { hp: 2000, maxHp: 2000, attack: 100, defense: 80, xp: 0 },
        skills: { 
            "unarmed": 100, "sword": 100, "blade": 100, "stick": 100, 
            "dagger": 100, "whip": 100, "throwing": 100, "lance": 100,
            "force": 100, "dodge": 100, 
            "iron-palm": 80, "swift-sword": 80, "eight-trigram-blade": 70, 
            "arhat-stick": 75, "shadow-dagger": 65, "cloud-whip": 60,
            "golden-dart": 70, "yang-spear": 75, "turtle-force": 80, "leaf-steps": 80 
        }
    },

    // === 森林生物 (Tier 1: 新手村門口) ===
    "rabbit": {
        id: "rabbit",
        name: "野兔",
        description: "一隻可愛的小野兔，正在吃草。",
        attributes: { str: 5, con: 5, per: 25, kar: 20, int: 10, cor: 10 },
        combat: { hp: 50, maxHp: 50, attack: 10, defense: 0, xp: 10 }, 
        skills: { "dodge": 20, "unarmed": 10 }, 
        drops: [{ id: "rabbit_meat", rate: 1.0 }, { id: "rabbit_skin", rate: 0.5 }]
    },
    "pheasant": {
        id: "pheasant",
        name: "野雞",
        description: "一隻色彩斑斕的野雞，在草叢中覓食。",
        attributes: { str: 8, con: 5, per: 25, kar: 15, int: 10, cor: 10 },
        combat: { hp: 60, maxHp: 60, attack: 15, defense: 5, xp: 20 }, 
        skills: { "dodge": 25, "unarmed": 15 },
        drops: [{ id: "pheasant_meat", rate: 1.0 }, { id: "pheasant_feather", rate: 0.6 }]
    },

    // === 森林生物 (Tier 2: 森林外圍/空地) ===
    "monkey": {
        id: "monkey",
        name: "猴子",
        description: "一隻調皮的猴子，手裡拿著不知道哪來的果子。",
        attributes: { str: 10, con: 10, per: 40, kar: 15, int: 20, cor: 10 },
        combat: { hp: 80, maxHp: 80, attack: 20, defense: 10, xp: 35 }, 
        skills: { "dodge": 40, "unarmed": 25 },
        drops: [{ id: "wild_fruit", rate: 0.8 }]
    },
    "snake": {
        id: "snake",
        name: "蟒蛇",
        aggro: true, 
        description: "一條盤踞在樹枝上的蟒蛇，吐著信子。",
        attributes: { str: 15, con: 10, per: 20, kar: 10, int: 10, cor: 10 },
        combat: { hp: 90, maxHp: 90, attack: 28, defense: 5, xp: 45 }, 
        skills: { "dodge": 30, "unarmed": 35 },
        drops: [{ id: "snake_gall", rate: 0.2 }, { id: "snake_skin", rate: 0.5 }]
    },

    // === 森林生物 (Tier 3: 森林深處) ===
    "bobcat": {
        id: "bobcat",
        name: "山貓",
        description: "行動敏捷的山貓，眼神銳利。",
        attributes: { str: 18, con: 15, per: 35, kar: 10, int: 15, cor: 10 },
        combat: { hp: 110, maxHp: 110, attack: 32, defense: 15, xp: 55 }, 
        skills: { "dodge": 50, "unarmed": 40 },
        drops: [{ id: "bobcat_skin", rate: 0.4 }]
    },
    "boar": {
        id: "boar",
        name: "野豬",
        description: "一隻兇猛的野豬，皮糙肉厚。",
        attributes: { str: 25, con: 25, per: 10, kar: 10, int: 5, cor: 5 },
        combat: { hp: 150, maxHp: 150, attack: 40, defense: 25, xp: 70 }, 
        skills: { "dodge": 40, "unarmed": 60 },
        drops: [{ id: "boar_meat", rate: 1.0 }, { id: "boar_tooth", rate: 0.3 }]
    },

    // === 森林生物 (Tier 4: 危險區域) ===
    "wolf": {
        id: "wolf",
        name: "野狼",
        aggro: true, 
        description: "眼神兇惡的野狼，成群結隊。",
        attributes: { str: 30, con: 20, per: 30, kar: 10, int: 15, cor: 10 },
        combat: { hp: 200, maxHp: 200, attack: 50, defense: 20, xp: 100 },
        skills: { "dodge": 80, "unarmed": 80 },
        drops: [{ id: "wolf_skin", rate: 0.4 }]
    },
    "bear": {
        id: "bear",
        name: "黑熊",
        aggro: true, 
        description: "一頭巨大的黑熊，站起來像一座小山。",
        attributes: { str: 80, con: 80, per: 15, kar: 10, int: 10, cor: 10 },
        combat: { hp: 800, maxHp: 800, attack: 90, defense: 60, xp: 300 },
        skills: { "dodge": 60, "unarmed": 120, "force": 100 },
        drops: [{ id: "bear_skin", rate: 1.0 }, { id: "bear_paw", rate: 0.2 }]
    }
};