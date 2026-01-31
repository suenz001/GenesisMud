// src/data/world.js

export const WorldMap = {
    // === 悅來客棧 ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。",
        allowSave: true,
        x: 0, y: 0, z: 0,
        npcs: ["waiter"],
        region: ["world", "inn"] 
    },
    "inn_2f": {
        title: "客棧二樓",
        description: "這裡是客棧的客房區，環境比樓下安靜許多。",
        allowSave: true,
        x: 0, y: 0, z: 1,
        region: ["inn"]
    },

    // === 揚州公共區域 ===
    "yangzhou_square": {
        title: "揚州廣場",
        description: "這裡是揚州城的中心廣場，人聲鼎沸。",
        x: 0, y: -1, z: 0,
        region: ["world"]
    },
    "street_e1": {
        title: "長安東街",
        description: "客棧東邊的街道。",
        x: 1, y: 0, z: 0,
        region: ["world"]
    },
    "market_sq": {
        title: "熱鬧市集",
        description: "這裡是城裡最熱鬧的市集。",
        x: 2, y: 0, z: 0,
        walls: ["north"],
        region: ["world"]
    },
    "bank": {
        title: "宏源錢莊",
        description: "金字招牌的錢莊。",
        x: 3, y: 0, z: 0,
        region: ["world"]
    },
    "street_ne1": {
        title: "青龍街",
        description: "街道兩旁種滿了柳樹。北邊傳來陣陣喝采聲，似乎有間武館。",
        x: 1, y: 1, z: 0,
        region: ["world"]
    },
    
    // --- 新增：飛龍武館 ---
    "gym_hall": {
        title: "飛龍武館",
        description: "一間寬敞的武館，場地中央豎著幾根木樁。許多學徒正在練習基本功。\n【這裡可以拜師 (apprentice) 和學藝 (learn)】",
        x: 1, y: 2, z: 0, // 位於青龍街 (1,1) 的北邊
        region: ["world"],
        npcs: ["gym_master"], // 放置王教頭
        allowSave: true // 方便玩家練功存檔
    },

    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "叮叮噹噹的打鐵聲。",
        x: 2, y: 1, z: 0,
        walls: ["south"],
        region: ["world"]
    },
    "road_south": {
        title: "林間小徑",
        description: "通往武當山的小路。",
        x: 0, y: -2, z: 0,
        region: ["world"]
    },
    "road_west": {
        title: "西郊荒野",
        description: "景色荒涼。",
        x: -1, y: -1, z: 0,
        region: ["world"]
    },
    
    // === 茅山區域 ===
    "maoshan_foot": {
        title: "茅山腳下",
        description: "茅山腳下，霧氣瀰漫。",
        x: -2, y: -1, z: 0,
        region: ["world", "maoshan"] 
    },
    "maoshan_gate": {
        title: "茅山派山門",
        description: "一座古樸陰森的道觀矗立在眼前。",
        allowSave: true,
        x: -2, y: -1, z: 1,
        region: ["maoshan"]
    },
    "maoshan_hall": {
        title: "三清大殿",
        description: "茅山派的主殿，供奉著三清道祖。",
        allowSave: true,
        x: -2, y: -1, z: 2,
        region: ["maoshan"]
    }
};