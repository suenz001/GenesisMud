// src/data/world.js

export const WorldMap = {
    // === 中心區域 ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。角落裡幾個乞丐正在竊竊私語。\n【這裡可以休息，輸入 save 儲存進度】",
        allowSave: true,
        x: 0, y: 0, z: 0,
        // 配置 NPC：店小二
        npcs: ["waiter"]
    },

    "yangzhou_square": {
        title: "揚州廣場",
        description: "這裡是揚州城的中心廣場，人聲鼎沸，車水馬龍。正中央有一座巨大的石碑，上面刻著當今武林高手的排名。",
        x: 0, y: -1, z: 0
    },

    // === 東邊街道系統 (下路) ===
    "street_e1": {
        title: "長安東街",
        description: "客棧東邊的街道，往來行人絡繹不絕。北邊是一條幽靜的街道，東邊傳來市集的叫賣聲。",
        x: 1, y: 0, z: 0
    },
    "market_sq": {
        title: "熱鬧市集",
        description: "這裡是城裡最熱鬧的市集，叫賣聲此起彼落。北邊是一面高聳的防火牆，阻擋了去路。",
        x: 2, y: 0, z: 0,
        // 【牆壁阻擋】往北不通，必須繞路
        walls: ["north"]
    },
    "bank": {
        title: "宏源錢莊",
        description: "這是一間金字招牌的錢莊，門口站著兩個彪形大漢，警惕地看著四周。",
        x: 3, y: 0, z: 0
    },

    // === 東北邊街道系統 (上路) ===
    "street_ne1": {
        title: "青龍街",
        description: "街道兩旁種滿了柳樹，環境較為清幽。東邊隱約傳來打鐵的聲音。",
        x: 1, y: 1, z: 0
    },
    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "還沒進門就聽到叮叮噹噹的打鐵聲，牆上掛滿了刀槍劍戟。南邊是一面高牆，只能從西邊離開。",
        x: 2, y: 1, z: 0,
        // 【牆壁阻擋】往南不通，回不去市集
        walls: ["south"]
    },

    // === 南邊區域 ===
    "road_south": {
        title: "林間小徑",
        description: "通往武當山的小路，兩旁竹林鬱鬱蔥蔥。",
        x: 0, y: -2, z: 0
    },

    // === 西邊區域 ===
    "road_west": {
        title: "西郊荒野",
        description: "出了西門，景色變得荒涼起來。遠處有一座陰森的山頭。",
        x: -1, y: -1, z: 0
    },
    
    // === 茅山區域 (包含高度變化) ===
    "maoshan_foot": {
        title: "茅山腳下",
        description: "茅山腳下，霧氣瀰漫，抬頭望去，山道蜿蜒而上。",
        x: -2, y: -1, z: 0
    },
    "maoshan_gate": {
        title: "茅山派山門",
        description: "一座古樸陰森的道觀矗立在眼前，門口掛著兩盞幽綠的燈籠。\n【此處乃修道之地，可 save】",
        allowSave: true,
        // 座標 x,y 與山腳相同，但高度 z 為 1
        x: -2, y: -1, z: 1
    }
};