// src/data/world.js

export const WorldMap = {
    // === 中心區域 ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。角落裡幾個乞丐正在竊竊私語。\n【這裡可以休息，輸入 save 儲存進度】",
        allowSave: true,
        x: 0, y: 0, z: 0,
        exits: {} // 注意：這裡不用寫 south，系統會自動根據座標連到揚州廣場
    },

    // === 南邊區域 ===
    "yangzhou_square": {
        title: "揚州廣場",
        description: "這裡是揚州城的中心廣場，人聲鼎沸，車水馬龍。正中央有一座巨大的石碑，上面刻著當今武林高手的排名。",
        x: 0, y: -1, z: 0, // 在客棧南邊 (y-1)
        exits: {} // 自動連結：北邊是客棧，南邊是林間小徑，西邊是荒野
    },
    "road_south": {
        title: "林間小徑",
        description: "路徑漸漸變得幽靜，兩旁是茂密的竹林，空氣中帶著一絲濕潤。",
        x: 0, y: -2, z: 0, // 在廣場南邊
        exits: {}
    },

    // === 東邊街道系統 ===
    "street_e1": {
        title: "長安東街",
        description: "客棧東邊的街道，往來行人絡繹不絕。",
        x: 1, y: 0, z: 0, // 客棧東邊 (x+1)
        exits: {} 
    },
    "market_sq": {
        title: "熱鬧市集",
        description: "這裡是城裡最熱鬧的市集，叫賣聲此起彼落。",
        x: 2, y: 0, z: 0,
        exits: {}
    },
    "bank": {
        title: "宏源錢莊",
        description: "這是一間金字招牌的錢莊，門口站著兩個彪形大漢。",
        x: 3, y: 0, z: 0,
        exits: {}
    },

    // === 東北邊街道 ===
    "street_ne1": {
        title: "青龍街",
        description: "街道兩旁種滿了柳樹，環境較為清幽。",
        x: 1, y: 1, z: 0, // 長安東街的北邊 (y+1)
        exits: {}
    },
    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "還沒進門就聽到叮叮噹噹的打鐵聲，牆上掛滿了刀槍劍戟。",
        x: 2, y: 1, z: 0,
        exits: {}
    },

    // === 西邊區域 ===
    "road_west": {
        title: "西郊荒野",
        description: "景色荒涼，遠處有一座陰森的山頭。",
        x: -1, y: -1, z: 0, // 廣場西邊
        exits: {}
    },
    "maoshan_foot": {
        title: "茅山腳下",
        description: "茅山腳下，霧氣瀰漫。",
        x: -2, y: -1, z: 0, // 荒野西邊
        exits: {} // 注意：往上(up)屬於特殊移動，還是要在 exits 寫，或者用 z 軸自動判定
    },
    
    // === 特殊高度區域 (茅山) ===
    "maoshan_gate": {
        title: "茅山派山門",
        description: "茅山派的大門。\n【此處可 save】",
        allowSave: true,
        x: -2, y: -1, z: 1, // 座標同山腳，但 Z=1 (上面)
        exits: {} // 系統會自動判定 down 連到 z=0 的山腳
    }
};