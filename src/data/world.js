// src/data/world.js

export const WorldMap = {
    // === 悅來客棧 ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。",
        allowSave: true,
        safe: true, // 安全區：禁止戰鬥
        x: 0, y: 0, z: 0,
        npcs: ["waiter"],
        region: ["world", "inn"] 
    },
    "inn_2f": {
        title: "客棧二樓",
        description: "這裡是客棧的客房區。",
        allowSave: true,
        safe: true, // 安全區
        x: 0, y: 0, z: 1,
        region: ["inn"]
    },

    // === 揚州城 ===
    "yangzhou_square": {
        title: "揚州廣場",
        description: "揚州城的中心廣場。",
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
        safe: true, // 錢莊通常也是安全區
        x: 3, y: 0, z: 0,
        region: ["world"]
    },
    "street_ne1": {
        title: "青龍街",
        description: "街道兩旁種滿了柳樹。北邊傳來陣陣喝采聲，似乎有間武館。",
        x: 1, y: 1, z: 0,
        region: ["world"]
    },
    "gym_hall": {
        title: "飛龍武館",
        description: "一間寬敞的武館。場地中央豎著幾根木樁。\n【這裡可以拜師 (apprentice) 和學藝 (learn)】",
        x: 1, y: 2, z: 0,
        safe: true, // 安全區：禁止踢館(暫時)
        region: ["world"],
        npcs: ["gym_master"],
        allowSave: true
    },
    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "叮叮噹噹的打鐵聲。",
        x: 2, y: 1, z: 0,
        walls: ["south"],
        region: ["world"]
    },

    // === 北方森林 (從武館北邊進入，或從青龍街往北走更深) ===
    // 這裡設定：武館(1,2) -> 北 -> 森林入口(1,3)
    "forest_entry": {
        title: "森林入口",
        description: "揚州城北門外的森林入口，光線變得有些昏暗，遠處傳來野獸的嚎叫聲。",
        x: 1, y: 3, z: 0,
        region: ["world", "forest"],
        npcs: ["rabbit", "rabbit"] // 兩隻兔子
    },
    "forest_path": {
        title: "林間小道",
        description: "一條蜿蜒的小路，周圍草叢很高，似乎隱藏著危險。",
        x: 1, y: 4, z: 0,
        region: ["forest"],
        npcs: ["rabbit", "boar"] // 兔子與野豬
    },
    "forest_deep": {
        title: "森林深處",
        description: "這裡樹木參天，遮蔽了陽光。空氣中瀰漫著一股血腥味。",
        x: 1, y: 5, z: 0,
        region: ["forest"],
        npcs: ["wolf", "boar"] 
    },
    "beast_nest": {
        title: "野獸巢穴",
        description: "一個巨大的洞穴，周圍散落著各種動物的白骨。",
        x: 2, y: 5, z: 0, // 往東走
        region: ["forest"],
        npcs: ["bear", "wolf"] // 熊與狼
    },

    // === 南邊與西邊 ===
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
        safe: true, // 山門設為安全區
        x: -2, y: -1, z: 1,
        region: ["maoshan"]
    },
    "maoshan_hall": {
        title: "三清大殿",
        description: "茅山派的主殿。",
        allowSave: true,
        safe: true,
        x: -2, y: -1, z: 2,
        region: ["maoshan"]
    }
};