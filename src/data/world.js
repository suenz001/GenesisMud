// src/data/world.js
export const WorldMap = {
    // === 中心區域 ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。角落裡幾個乞丐正在竊竊私語。\n【這裡可以休息，輸入 save 儲存進度】",
        allowSave: true,
        x: 0, y: 0, z: 0, // <--- 座標 (0,0)
        exits: { "east": "street_e1" }
    },

    // === 東邊街道系統 ===
    "street_e1": {
        title: "長安東街",
        description: "客棧東邊的街道，往來行人絡繹不絕。",
        x: 1, y: 0, z: 0,
        exits: { 
            "west": "inn_start",
            "east": "market_sq",
            "north": "street_ne1" // 往北岔路
        }
    },
    "market_sq": {
        title: "熱鬧市集",
        description: "這裡是城裡最熱鬧的市集，叫賣聲此起彼落。",
        x: 2, y: 0, z: 0,
        exits: { 
            "west": "street_e1",
            "east": "bank"
        }
    },
    "bank": {
        title: "宏源錢莊",
        description: "這是一間金字招牌的錢莊，門口站著兩個彪形大漢。",
        x: 3, y: 0, z: 0,
        exits: { "west": "market_sq" }
    },

    // === 東北邊街道 ===
    "street_ne1": {
        title: "青龍街",
        description: "街道兩旁種滿了柳樹，環境較為清幽。",
        x: 1, y: 1, z: 0,
        exits: { 
            "south": "street_e1",
            "east": "weapon_shop"
        }
    },
    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "還沒進門就聽到叮叮噹噹的打鐵聲，牆上掛滿了刀槍劍戟。",
        x: 2, y: 1, z: 0,
        exits: { "west": "street_ne1" }
    },

    // === 其他區域 (揚州廣場移到南邊) ===
    "yangzhou_square": {
        title: "揚州廣場",
        description: "城市的中心廣場，連接著四面八方。",
        x: 0, y: -1, z: 0, // 客棧南邊
        exits: {
            "north": "inn_start", // 這裡假設客棧在廣場北邊
            "south": "road_south",
            "west": "road_west"
        }
    },
    "road_west": {
        title: "西郊荒野",
        description: "景色荒涼，遠處有一座陰森的山頭。",
        x: -1, y: -1, z: 0,
        exits: { 
            "east": "yangzhou_square",
            "northwest": "maoshan_foot"
        }
    },
    "maoshan_foot": {
        title: "茅山腳下",
        description: "茅山腳下，霧氣瀰漫。",
        x: -2, y: 0, z: 0, // 稍微調整座標以配合地圖顯示
        exits: {
            "southeast": "road_west",
            "up": "maoshan_gate"
        }
    },
    "maoshan_gate": {
        title: "茅山派山門",
        description: "茅山派的大門。\n【此處可 save】",
        allowSave: true,
        x: -2, y: 0, z: 1, // 高度 Z=1
        exits: { "down": "maoshan_foot" }
    },
    "road_south": {
        title: "林間小徑",
        description: "通往武當山的小路。",
        x: 0, y: -2, z: 0,
        exits: { "north": "yangzhou_square" }
    }
};