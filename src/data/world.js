// src/data/world.js

// 1. 靜態節點 (Hubs & Nodes)
export const WorldMap = {
    // ================== 起始區域：揚州城 (Hub) (0,0) ==================
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。角落裡有一口古老的水井，井水清澈見底。",
        allowSave: true, safe: true, hasWell: true,
        x: 0, y: 0, z: 0,
        npcs: ["waiter"],
        region: ["world", "inn"] 
    },
    "inn_2f": {
        title: "客棧二樓",
        description: "這裡是客棧的客房區。",
        allowSave: true, safe: true,
        x: 0, y: 0, z: 1,
        region: ["inn"]
    },
    "yangzhou_square": {
        title: "揚州廣場",
        description: "揚州城的中心廣場，人來人往。這裡是通往江湖各處的起點。往西是通往中原的官道，往南是迷霧森林，往北則是近郊森林。",
        x: 0, y: -1, z: 0,
        region: ["world"]
    },
    "street_e1": { title: "長安東街", description: "客棧東邊的街道。", x: 1, y: 0, z: 0, region: ["world"] },
    "market_sq": { title: "熱鬧市集", description: "這裡是城裡最熱鬧的市集。", x: 2, y: 0, z: 0, walls: ["north"], region: ["world"] },
    "bank": { title: "宏源錢莊", description: "金字招牌的錢莊。", safe: true, x: 3, y: 0, z: 0, region: ["world"] },
    
    "street_ne1": { 
        title: "青龍街", 
        description: "街道兩旁種滿了柳樹。往北是飛龍武館的大門。", 
        x: 1, y: 1, z: 0, 
        region: ["world"] 
    },
    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "叮叮噹噹的打鐵聲，牆上掛滿了各式兵器。往北可以通往武館的練武場。",
        x: 2, y: 1, z: 0, 
        region: ["world"], npcs: ["blacksmith"]
    },

    // ================== 飛龍武館 (Gym) ==================
    "gym_gate": {
        title: "武館大門",
        description: "氣派的朱紅大門，兩旁蹲著石獅子。上方懸掛著『飛龍武館』的金字招牌。往東是練武場，往北是一條幽靜的小徑。",
        x: 1, y: 2, z: 0, 
        safe: true, region: ["world", "gym"], allowSave: true
    },
    "gym_yard": {
        title: "練武場",
        description: "寬敞的露天廣場，地上鋪著整齊的青磚。弟子們在此處蹲馬步、練拳。往北是王教頭的房間，往東是李教頭的房間，往南是武器鋪。",
        x: 2, y: 2, z: 0, 
        safe: true, region: ["gym"],
    },
    "gym_room_wang": {
        title: "王教頭廳",
        description: "房間裡擺滿了刀槍棍棒，充滿陽剛之氣。王教頭正端坐在太師椅上喝茶。\n【這裡可以向 王教頭 學習刀、棍、槍與拳腳功夫】",
        x: 2, y: 3, z: 0, 
        safe: true, region: ["gym"], npcs: ["gym_master"], allowSave: true
    },
    "gym_room_li": {
        title: "李教頭廳",
        description: "牆上掛著各式劍器與長鞭，佈置雅致。李教頭正閉目養神。\n【這裡可以向 李教頭 學習劍、鞭、短兵與暗器功夫】",
        x: 3, y: 2, z: 0, 
        safe: true, region: ["gym"], npcs: ["gym_master_li"], allowSave: true
    },
    "gym_training": {
        title: "機關木人房",
        description: "這裡只有一個巨大的銅皮機關木人，是專門用來測試招式威力的。",
        x: 3, y: 3, z: 0, 
        safe: false, region: ["gym"], npcs: ["wooden_dummy", "wooden_dummy"]
    },

    // ================== 森林區域 (保留 3x3 探索區) ==================
    "gym_path": { 
        title: "武館後徑", 
        description: "一條連接武館與森林的小徑，兩旁雜草叢生。", 
        x: 1, y: 3, z: 0, region: ["world"] 
    },
    
    // Row 4 (入口層 - Tier 1)
    "forest_entry": { 
        title: "森林入口",
        description: "踏入森林，光線變得有些昏暗。這裡比較安全，偶爾有小動物出沒。",
        x: 1, y: 4, z: 0, region: ["world", "forest"], npcs: ["rabbit", "rabbit", "pheasant"] 
    },
    "forest_w1": { 
        title: "森林邊緣(西)",
        description: "森林的邊緣地帶，草叢很深。",
        x: 0, y: 4, z: 0, region: ["forest"], npcs: ["rabbit", "pheasant"] 
    },
    "forest_e1": { 
        title: "森林邊緣(東)",
        description: "這裡生長著一些野果樹，常有小動物來覓食。",
        x: 2, y: 4, z: 0, region: ["forest"], npcs: ["rabbit", "monkey"] 
    },

    // Row 5 (中層 - Tier 2/3)
    "forest_mid": { 
        title: "森林中部", 
        description: "樹木變得更加茂密，空氣中瀰漫著一股腐葉的味道。",
        x: 1, y: 5, z: 0, region: ["forest"], npcs: ["monkey", "monkey", "snake"] 
    },
    "forest_mid_w": { 
        title: "陰暗樹林", 
        description: "四周一片漆黑，陰風陣陣，小心毒蛇出沒。",
        x: 0, y: 5, z: 0, region: ["forest"], npcs: ["snake", "snake", "boar"] 
    },
    "forest_mid_e": { 
        title: "灌木叢", 
        description: "茂密的灌木叢阻擋了視線，似乎有什麼東西在注視著你。",
        x: 2, y: 5, z: 0, region: ["forest"], npcs: ["monkey", "bobcat"] 
    },

    // Row 6 (深層 - Tier 3/4)
    "forest_deep": { 
        title: "森林深處", 
        description: "古樹參天，遮蔽了陽光。這裡人跡罕至，充滿了危險的氣息。",
        x: 1, y: 6, z: 0, region: ["forest"], npcs: ["boar", "wolf"] 
    },
    "forest_deep_w": { 
        title: "野獸巢穴", 
        description: "一個巨大的岩石洞穴，周圍散落著白骨。",
        x: 0, y: 6, z: 0, region: ["forest"], npcs: ["wolf", "wolf", "bear"] 
    },
    "forest_deep_e": { 
        title: "迷霧林地", 
        description: "濃霧瀰漫，稍不留神就會迷失方向。強大的野獸隱藏在霧中。",
        x: 2, y: 6, z: 0, region: ["forest"], npcs: ["bobcat", "wolf"] 
    },

    // ================== 遠方門派與節點 (Remote Nodes) ==================
    // [修正] 座標已經調整為 perfect diagonal (45度) 或 straight line

    // 南方：茅山 (距離約 10 格, 直線向南)
    "maoshan_gate": {
        title: "茅山派山門",
        description: "霧氣在此處最為濃厚，隱約可見一座陰森的山門矗立在前方。門口貼滿了黃色的符紙，四周陰氣逼人。",
        allowSave: true, safe: true,
        x: 0, y: -12, z: 0, 
        region: ["maoshan"]
    },
    "maoshan_hall": {
        title: "三清大殿",
        description: "茅山派的主殿，供奉著三清道祖。香火雖然鼎盛，卻透著一股詭異的氣氛。",
        allowSave: true, safe: true,
        x: 0, y: -13, z: 0, region: ["maoshan"]
    },

    // 西方中繼站：漢口 (距離約 20 格, 直線向西)
    "hankou_ferry": {
        title: "漢口渡口",
        description: "寬闊的漢水在此流過，與長江交匯。千帆競渡，這裡是前往武當山和巴蜀的交通樞紐。",
        allowSave: true, safe: true,
        x: -20, y: -1, z: 0, region: ["world"]
    },

    // 西北分支：武當山 (距離漢口 10 格, 完美西北 NW)
    // 漢口(-20, -1) -> 武當(-30, 9). 差 X-10, Y+10
    "wudang_gate": {
        title: "解劍池",
        description: "武當山腳下，仰望山勢非凡。這裡立著一塊石碑，上書『解劍』二字。無論是誰，到此都需解下兵刃以示尊敬。",
        allowSave: true, safe: true,
        x: -30, y: 9, z: 0, region: ["wudang"]
    },
    "wudang_hall": {
        title: "紫霄宮",
        description: "武當派的主殿，莊嚴肅穆。許多道士正在廣場上演練太極拳。",
        allowSave: true, safe: true,
        x: -30, y: 9, z: 1, region: ["wudang"]
    },

    // 西南分支：巴蜀 (距離漢口 20 格, 完美西南 SW)
    // 漢口(-20, -1) -> 成都(-40, -21). 差 X-20, Y-20
    "chengdu_city": {
        title: "成都城",
        description: "天府之國的首府，街道寬闊，茶館林立，一派休閒景象。",
        allowSave: true, safe: true,
        x: -40, y: -21, z: 0, region: ["world"]
    },
    
    // 成都分支
    // 唐門 (完美正西 W): 成都(-40, -21) -> (-45, -21). 差 X-5
    "tang_gate": {
        title: "唐門世家",
        description: "一座宏偉的宅院，大門緊閉。周圍是迷霧竹林，門口設有許多機關暗哨，令人望而生畏。",
        allowSave: true, safe: true,
        x: -45, y: -21, z: 0, region: ["tangmen"]
    },
    // 峨嵋 (完美西南 SW): 成都(-40, -21) -> (-45, -26). 差 X-5, Y-5
    "emei_gate": {
        title: "峨嵋接引殿",
        description: "峨嵋天下秀，山路兩旁古木參天，景色幽靜。這裡是峨嵋派的山門，常有女弟子在此值守。",
        allowSave: true, safe: true,
        x: -45, y: -26, z: 0, region: ["emei"]
    },
    // 青城 (完美西北 NW): 成都(-40, -21) -> (-45, -16). 差 X-5, Y+5
    "qingcheng_gate": {
        title: "青城上清宮",
        description: "青城天下幽，道觀依山而建，與自然融為一體。這條小路通往著名的青城山。",
        allowSave: true, safe: true,
        x: -45, y: -16, z: 0, region: ["qingcheng"]
    },

    // 西北：西域與少林
    // 少林 (完美西北 NW): 揚州(0, -1) -> (-21, 20). 差 X-21, Y+21
    "shaolin_gate": {
        title: "少林寺山門",
        description: "天下武功出少林。嵩山少林寺威震江湖，山門前香客絡繹不絕。",
        allowSave: true, safe: true,
        x: -21, y: 20, z: 0, region: ["shaolin"]
    },
    // 崆峒 (完美西北 NW): 少林(-21, 20) -> (-50, 49). 差 X-29, Y+29
    "kongtong_gate": {
        title: "崆峒派",
        description: "山勢險峻，怪石嶙峋。崆峒派以此山為屏障，易守難攻。",
        allowSave: true, safe: true,
        x: -50, y: 49, z: 0, region: ["kongtong"]
    },
    // 崑崙 (完美正西 W): 崆峒(-50, 49) -> (-80, 49). 差 X-30
    "kunlun_gate": {
        title: "崑崙仙境",
        description: "萬山之祖，終年積雪。寒風刺骨，非常人所能忍受。這裡彷彿置身於仙境之中。",
        allowSave: true, safe: true,
        x: -80, y: 49, z: 0, region: ["kunlun"]
    },

    // ================== 特殊 ==================
    "ghost_gate": {
        title: "鬼門關",
        description: "四周陰風慘慘，鬼哭神號。濃霧之中隱約可見無數亡魂在排隊，等著孟婆湯...請在這邊待滿3分鐘。",
        safe: true, x: 9999, y: 9999, z: -9999, region: ["underworld"]
    }
};

// 2. 路徑定義 (Paths)
// 系統會根據這些定義自動生成中間的房間
// [修正] Distance 設定為座標差減1，確保 1 格 1 步
export const WorldPaths = [
    // 揚州 -> 茅山 (南行, Delta 11)
    {
        id: "path_yangzhou_maoshan",
        from: "yangzhou_square",
        to: "maoshan_gate",
        distance: 10,
        type: "misty_road",
        desc: "這是一條通往茅山的小徑，越走霧氣越重，四周寂靜無聲。"
    },
    // 揚州 -> 漢口 (西行官道, Delta 20)
    {
        id: "path_yangzhou_hankou",
        from: "yangzhou_square",
        to: "hankou_ferry",
        distance: 19,
        type: "official_road",
        desc: "這是一條連接東西方的寬闊官道，路上偶爾有鏢車經過，只有幾棵枯樹孤零零地立著。"
    },
    // 揚州 -> 少林 (西北, Delta 21)
    {
        id: "path_yangzhou_shaolin",
        from: "yangzhou_square",
        to: "shaolin_gate",
        distance: 20,
        type: "official_road",
        desc: "這是一條通往中原腹地的官道，遠處嵩山巍峨聳立。"
    },
    // 漢口 -> 武當 (西北, Delta 10)
    {
        id: "path_hankou_wudang",
        from: "hankou_ferry",
        to: "wudang_gate",
        distance: 9,
        type: "mountain_path",
        desc: "離開渡口往西北行，山勢漸高，雲霧繚繞，氣勢非凡，正是前往武當山的路徑。"
    },
    // 漢口 -> 成都 (西南, Delta 20)
    {
        id: "path_hankou_chengdu",
        from: "hankou_ferry",
        to: "chengdu_city",
        distance: 19,
        type: "shu_road",
        desc: "『蜀道難，難於上青天』。道路變得崎嶇險峻，兩旁是萬丈深淵，下方是奔騰的江水。"
    },
    // 成都 -> 唐門 (正西, Delta 5)
    { id: "path_cd_tang", from: "chengdu_city", to: "tang_gate", distance: 4, type: "bamboo_path", desc: "穿過一片茂密的竹林，霧氣瀰漫，很容易迷失方向。前方隱約可見唐門世家。" },
    // 成都 -> 峨嵋 (西南, Delta 5)
    { id: "path_cd_emei", from: "chengdu_city", to: "emei_gate", distance: 4, type: "mountain_path", desc: "峨嵋山路秀麗清幽，古木參天，令人心曠神怡。" },
    // 成都 -> 青城 (西北, Delta 5)
    { id: "path_cd_qing", from: "chengdu_city", to: "qingcheng_gate", distance: 4, type: "mountain_path", desc: "青城天下幽，這條小徑格外安靜。" },

    // 少林 -> 崆峒 (西北, Delta 29)
    {
        id: "path_silk_road",
        from: "shaolin_gate", 
        to: "kongtong_gate",
        distance: 28,
        type: "desert",
        desc: "出了玉門關，便是茫茫戈壁。黃土高坡，滿目黃土。風沙很大，吹得人睜不開眼。"
    },
    // 崆峒 -> 崑崙 (正西, Delta 30)
    {
        id: "path_kongtong_kunlun",
        from: "kongtong_gate",
        to: "kunlun_gate",
        distance: 29,
        type: "snow_path",
        desc: "越往西走，地勢越高，空氣越稀薄。遠處崑崙雪山終年積雪，寒風刺骨。"
    }
];