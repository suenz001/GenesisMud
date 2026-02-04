// src/data/world.js

export const WorldMap = {
    // ================== 起始區域：揚州城 (Hub) ==================
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
        description: "揚州城的中心廣場，人來人往。往西是通往中原的官道，往南是迷霧森林，往北則是近郊森林。",
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
        // 移除 walls: ["north"]，讓它可以連通到北邊的練武場 (2,2)
        region: ["world"], npcs: ["blacksmith"]
    },

    // ================== 飛龍武館區域 (Gym Complex) ==================
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
        safe: false, region: ["gym"], npcs: ["wooden_dummy", "wooden_dummy", "wooden_dummy"]
    },

    // ================== 北方：森林區域 (3x3 Map) ==================
    // 連接通道
    "gym_path": {
        title: "武館後徑",
        description: "一條連接武館與森林的小徑，兩旁雜草叢生。",
        x: 1, y: 3, z: 0, region: ["world"]
    },

    // Row 4 (入口層 - Tier 1)
    "forest_entry": { // (1,4)
        title: "森林入口",
        description: "踏入森林，光線變得有些昏暗。這裡比較安全，偶爾有小動物出沒。",
        x: 1, y: 4, z: 0, region: ["world", "forest"], npcs: ["rabbit", "rabbit", "pheasant"]
    },
    "forest_w1": { // (0,4)
        title: "森林邊緣(西)",
        description: "森林的邊緣地帶，草叢很深。",
        x: 0, y: 4, z: 0, region: ["forest"], npcs: ["rabbit", "pheasant"]
    },
    "forest_e1": { // (2,4)
        title: "森林邊緣(東)",
        description: "這裡生長著一些野果樹，常有小動物來覓食。",
        x: 2, y: 4, z: 0, region: ["forest"], npcs: ["rabbit", "monkey"]
    },

    // Row 5 (中層 - Tier 2/3)
    "forest_mid": { // (1,5)
        title: "森林中部",
        description: "樹木變得更加茂密，空氣中瀰漫著一股腐葉的味道。",
        x: 1, y: 5, z: 0, region: ["forest"], npcs: ["monkey", "monkey", "snake"]
    },
    "forest_mid_w": { // (0,5)
        title: "陰暗樹林",
        description: "四周一片漆黑，陰風陣陣，小心毒蛇出沒。",
        x: 0, y: 5, z: 0, region: ["forest"], npcs: ["snake", "snake", "boar"]
    },
    "forest_mid_e": { // (2,5)
        title: "灌木叢",
        description: "茂密的灌木叢阻擋了視線，似乎有什麼東西在注視著你。",
        x: 2, y: 5, z: 0, region: ["forest"], npcs: ["monkey", "bobcat"]
    },

    // Row 6 (深層 - Tier 3/4)
    "forest_deep": { // (1,6)
        title: "森林深處",
        description: "古樹參天，遮蔽了陽光。這裡人跡罕至，充滿了危險的氣息。",
        x: 1, y: 6, z: 0, region: ["forest"], npcs: ["boar", "wolf"]
    },
    "forest_deep_w": { // (0,6)
        title: "野獸巢穴",
        description: "一個巨大的岩石洞穴，周圍散落著白骨。",
        x: 0, y: 6, z: 0, region: ["forest"], npcs: ["wolf", "wolf", "bear"]
    },
    "forest_deep_e": { // (2,6)
        title: "迷霧林地",
        description: "濃霧瀰漫，稍不留神就會迷失方向。強大的野獸隱藏在霧中。",
        x: 2, y: 6, z: 0, region: ["forest"], npcs: ["bobcat", "wolf"]
    },

    // ================== 南方：茅山路徑 (Maoshan Path) ==================
    "road_south": {
        title: "南門官道",
        description: "出了揚州南門，是一條平坦的官道，通往太湖方向。",
        x: 0, y: -2, z: 0, region: ["world"]
    },
    "misty_path_1": {
        title: "迷霧小徑",
        description: "道路兩旁開始出現濃重的霧氣，能見度變低，四周寂靜無聲。",
        x: 0, y: -3, z: 0, region: ["world"]
    },
    "maoshan_foot": {
        title: "茅山腳下",
        description: "霧氣在此處最為濃厚，隱約可見一座陰森的山門矗立在前方。這裡陰氣逼人。",
        x: 0, y: -4, z: 0, region: ["world", "maoshan"]
    },
    "maoshan_gate": {
        title: "茅山派山門",
        description: "一座古樸陰森的道觀矗立在眼前，門口貼滿了黃色的符紙。",
        allowSave: true, safe: true,
        x: 0, y: -4, z: 1, region: ["maoshan"]
    },
    "maoshan_hall": {
        title: "三清大殿",
        description: "茅山派的主殿，供奉著三清道祖。香火雖然鼎盛，卻透著一股詭異的氣氛。",
        allowSave: true, safe: true,
        x: 0, y: -4, z: 2, region: ["maoshan"]
    },

    // ================== 西方：中央官道 (Central Road) ==================
    "road_west": {
        title: "西郊荒野",
        description: "揚州城西郊，人煙稀少，只有幾棵枯樹孤零零地立著。",
        x: -1, y: -1, z: 0, region: ["world"]
    },
    "official_road_1": {
        title: "中央官道",
        description: "這是一條連接東西方的寬闊官道，路上偶爾有鏢車經過。",
        x: -2, y: -1, z: 0, region: ["world"]
    },
    "official_road_2": {
        title: "漢水渡口",
        description: "寬闊的漢水在此流過，這裡是前往武當山和巴蜀的必經之地。",
        x: -3, y: -1, z: 0, region: ["world"]
    },

    // ================== 武當山區域 (Wudang) ==================
    "wudang_foot": {
        title: "武當山腳",
        description: "仰望武當山，只見雲霧繚繞，氣勢非凡。一條石階蜿蜒向上。",
        x: -4, y: -1, z: 0, region: ["world", "wudang"]
    },
    "wudang_gate": {
        title: "解劍池",
        description: "這裡立著一塊石碑，上書『解劍』二字。無論是誰，到此都需解下兵刃以示尊敬。",
        allowSave: true, safe: true,
        x: -4, y: -1, z: 1, region: ["wudang"]
    },
    "wudang_hall": {
        title: "紫霄宮",
        description: "武當派的主殿，莊嚴肅穆。許多道士正在廣場上演練太極拳。",
        allowSave: true, safe: true,
        x: -4, y: -1, z: 2, region: ["wudang"]
    },

    // ================== 西南：巴蜀棧道 (Shu Road) ==================
    // 從漢水渡口往南進入巴蜀
    "shu_road_1": {
        title: "蜀道入口",
        description: "『蜀道難，難於上青天』。道路變得崎嶇險峻，兩旁是萬丈深淵。",
        x: -3, y: -2, z: 0, region: ["world"]
    },
    "shu_road_2": {
        title: "青衣江畔",
        description: "江水湍急，水流撞擊岩石發出巨大的轟鳴聲。這裡是一個三岔路口。",
        x: -3, y: -3, z: 0, region: ["world"]
    },
    
    // --- 唐門 (Tangmen) ---
    "bamboo_forest": {
        title: "迷霧竹林",
        description: "一片茂密的竹林，霧氣瀰漫，很容易迷失方向。據說唐門就在這深處。",
        x: -2, y: -3, z: 0, region: ["world"]
    },
    "tang_gate": {
        title: "唐門世家",
        description: "一座宏偉的宅院，大門緊閉。門口設有許多機關暗哨，令人望而生畏。",
        allowSave: true, safe: true,
        x: -1, y: -3, z: 0, region: ["tangmen"]
    },

    // --- 峨嵋 (Emei) ---
    "emei_foot": {
        title: "峨嵋山腳",
        description: "峨嵋天下秀。山路兩旁古木參天，景色幽靜。",
        x: -3, y: -4, z: 0, region: ["world", "emei"]
    },
    "emei_gate": {
        title: "接引殿",
        description: "峨嵋派的山門，常有女弟子在此值守。",
        allowSave: true, safe: true,
        x: -3, y: -4, z: 1, region: ["emei"]
    },

    // --- 青城 (Qingcheng) ---
    "qingcheng_path": {
        title: "青城幽徑",
        description: "青城天下幽。這條小路通往著名的青城山。",
        x: -4, y: -3, z: 0, region: ["world"]
    },
    "qingcheng_gate": {
        title: "上清宮",
        description: "青城派的大本營，建築依山而建，與自然融為一體。",
        allowSave: true, safe: true,
        x: -5, y: -3, z: 1, region: ["qingcheng"]
    },

    // ================== 西北：西域商道 (Silk Road) ==================
    // 從漢水渡口往西
    "silk_road_1": {
        title: "黃土高坡",
        description: "放眼望去，滿目黃土。風沙很大，吹得人睜不開眼。",
        x: -4, y: -1, z: 0, walls: ["east"], 
        region: ["world"]
    },
    "silk_road_2": {
        title: "絲綢之路",
        description: "一條漫長的商道，通往遙遠的西域。路上偶爾可見駱駝商隊。",
        x: -5, y: -1, z: 0, region: ["world"]
    },

    // --- 崆峒 (Kongtong) ---
    "kongtong_foot": {
        title: "崆峒山腳",
        description: "山勢險峻，怪石嶙峋。",
        x: -5, y: 0, z: 0, region: ["world", "kongtong"]
    },
    "kongtong_gate": {
        title: "崆峒派",
        description: "崆峒派以此山為屏障，易守難攻。",
        allowSave: true, safe: true,
        x: -5, y: 0, z: 1, region: ["kongtong"]
    },

    // --- 崑崙 (Kunlun) ---
    "kunlun_foot": {
        title: "崑崙冰山",
        description: "萬山之祖，終年積雪。寒風刺骨，非常人所能忍受。",
        x: -6, y: -1, z: 0, region: ["world", "kunlun"]
    },
    "kunlun_gate": {
        title: "崑崙仙境",
        description: "崑崙派所在地，彷彿置身於仙境之中，但寒氣逼人。",
        allowSave: true, safe: true,
        x: -6, y: -1, z: 1, region: ["kunlun"]
    },

    // ================== 特殊區域 ==================
    "ghost_gate": {
        title: "鬼門關",
        description: "四周陰風慘慘，鬼哭神號。濃霧之中隱約可見無數亡魂在排隊，等著孟婆湯...請在這邊待滿3分鐘",
        safe: true,
        x: 9999, y: 9999, z: -9999, 
        region: ["underworld"]
    }
};