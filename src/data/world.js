// src/data/world.js

export const WorldMap = {
    // === 悅來客棧 (連接點) ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。",
        allowSave: true,
        x: 0, y: 0, z: 0,
        npcs: ["waiter"],
        // 關鍵：它既連接著外面(world)，也連接著樓上(inn)
        region: ["world", "inn"] 
    },
    "inn_2f": {
        title: "客棧二樓",
        description: "這裡是客棧的客房區，一條長長的走廊，兩旁是整潔的廂房。環境比樓下安靜許多。",
        allowSave: true,
        x: 0, y: 0, z: 1, // 雖然高度是 1
        region: ["inn"]   // 但它只屬於 inn，所以看不到茅山(maoshan)
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
        description: "街道兩旁種滿了柳樹。",
        x: 1, y: 1, z: 0,
        region: ["world"]
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
    
    // === 茅山區域 (獨立次元) ===
    "maoshan_foot": {
        title: "茅山腳下",
        description: "茅山腳下，霧氣瀰漫。",
        x: -2, y: -1, z: 0,
        // 連接世界與茅山
        region: ["world", "maoshan"] 
    },
    "maoshan_gate": {
        title: "茅山派山門",
        description: "一座古樸陰森的道觀矗立在眼前。\n【此處可 save】",
        allowSave: true,
        x: -2, y: -1, z: 1,
        region: ["maoshan"] // 純茅山區域
    },
    "maoshan_hall": {
        title: "三清大殿",
        description: "茅山派的主殿，供奉著三清道祖。",
        allowSave: true,
        x: -2, y: -1, z: 2,
        region: ["maoshan"]
    }
};