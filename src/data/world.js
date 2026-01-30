// src/data/world.js
export const WorldMap = {
    // === 中心區域 ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。角落裡幾個乞丐正在竊竊私語。\n【這裡可以休息，輸入 save 儲存進度】",
        allowSave: true,
        x: 0, y: 0, z: 0
        // 移除 exits: { out: ... }，現在全靠座標自動連線
    },

    "yangzhou_square": {
        title: "揚州廣場",
        description: "這裡是揚州城的中心廣場，人聲鼎沸，車水馬龍。正中央有一座巨大的石碑，上面刻著當今武林高手的排名。",
        x: 0, y: -1, z: 0 
        // 移除 enter
    },

    // === 東邊街道系統 ===
    "street_e1": {
        title: "長安東街",
        description: "客棧東邊的街道，往來行人絡繹不絕。",
        x: 1, y: 0, z: 0 
    },
    "market_sq": {
        title: "熱鬧市集",
        description: "這裡是城裡最熱鬧的市集，叫賣聲此起彼落。北邊是一面高聳的防火牆，阻擋了去路。",
        x: 2, y: 0, z: 0,
        // 【新增牆壁】阻擋往北 (神鋒武器鋪)
        walls: ["north"]
    },
    "bank": {
        title: "宏源錢莊",
        description: "這是一間金字招牌的錢莊，門口站著兩個彪形大漢。",
        x: 3, y: 0, z: 0
    },

    // === 東北邊街道 ===
    "street_ne1": {
        title: "青龍街",
        description: "街道兩旁種滿了柳樹，環境較為清幽。",
        x: 1, y: 1, z: 0
    },
    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "還沒進門就聽到叮叮噹噹的打鐵聲，牆上掛滿了刀槍劍戟。南邊是一面高牆。",
        x: 2, y: 1, z: 0,
        // 【新增牆壁】阻擋往南 (回到市集)
        walls: ["south"]
    },

    // === 西邊與南邊 ===
    "road_south": {
        title: "林間小徑",
        description: "通往武當山的小路。",
        x: 0, y: -2, z: 0
    },
    "road_west": {
        title: "西郊荒野",
        description: "景色荒涼，遠處有一座陰森的山頭。",
        x: -1, y: -1, z: 0
    },
    
    // === 茅山 ===
    "maoshan_foot": {
        title: "茅山腳下",
        description: "茅山腳下，霧氣瀰漫。",
        x: -2, y: -1, z: 0
    },
    "maoshan_gate": {
        title: "茅山派山門",
        description: "茅山派的大門。\n【此處可 save】",
        allowSave: true,
        x: -2, y: -1, z: 1
    }
};