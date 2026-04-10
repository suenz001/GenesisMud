// src/data/world.js

// 1. 靜態節點 (Hubs & Nodes)
export const WorldMap = {
    // ================== 起始區域：揚州城 (Hub) ==================
    // [重構] 以廣場 (0,0) 為中心，解決導航錯亂問題
    
    "yangzhou_square": {
        title: "揚州廣場",
        description: "揚州城的中心廣場，青石板鋪就的地面被歲月與無數江湖兒女的腳步打磨得光滑如鏡。這裡人丁興旺，南腔北調匯聚於此。往北是一座酒香四溢的客棧，向西則是通往中原腹地的寬闊官道。南邊霧氣濛濛，隱約有條小徑通往茅山，東邊則傳來絡繹不絕的市集喧嘩聲。",
        x: 0, y: 0, z: 0,
        region: ["world"]
    },

    "inn_start": {
        title: "悅來客棧",
        description: "這裡是揚州城最負盛名的『悅來客棧』。一進門便能聞到誘人的酒肉香氣，滿堂食客推杯換盞。牆上高懸一塊黑底金字的『賓至如歸』牌匾。客棧角落裡那口古井依舊清澈甘甜。往南出了大門便是揚州廣場。",
        allowSave: true, safe: true, hasWell: true,
        x: 0, y: 1, z: 0, // [移位] 位於廣場北方
        npcs: ["waiter"],
        region: ["world", "inn"] 
    },
    "inn_2f": {
        title: "客棧二樓",
        description: "客棧的二樓，一條鋪著紅地毯的狹長走廊通向兩側的天字號客房。這裡環境幽雅清靜，淡淡的檀香讓人緊繃的神經都放鬆了下來，是打坐調息與安穩就寢的絕佳地點。",
        allowSave: true, safe: true,
        x: 0, y: 1, z: 1,
        region: ["inn"]
    },

    "street_e1": { 
        title: "長安東街", 
        description: "長安東街是揚州最繁華的主幹道之一。街道兩旁店鋪林立，酒樓茶館櫛比鱗次，各式各樣的布帆招牌迎風招展。這裡總是熙熙攘攘，充滿了紅塵的生機。", 
        x: 1, y: 0, z: 0, 
        region: ["world"] 
    },
    "market_sq": { 
        title: "熱鬧市集", 
        description: "熱鬧非凡的揚州大市集。賣菜的、算命的、耍雜技的將這裡擠得水泄不通。空氣中瀰漫著包子剛出爐的香氣。往南走，喧嘩聲中漸漸混入了一陣朗朗的讀書聲，那裡是著名的通儒書院。", 
        x: 2, y: 0, z: 0, 
        region: ["world"] 
    },
    // [新增] 書院 (Market 的南邊)
    "academy": {
        title: "通儒書院",
        description: "通儒書院內彌漫著濃厚的墨香與書卷氣。大堂正中掛著一幅至聖先師的巨大畫像，兩側擺放著整齊的書桌與文房四寶。來到這裡，浮躁的武人心志也不由得沈澱了下來。",
        x: 2, y: -1, z: 0, 
        safe: true, region: ["world"], npcs: ["scholar_zhu"]
    },

    "bank": { 
        title: "宏源錢莊", 
        description: "宏源錢莊的門庭若市，門口掛著一塊純金打造、閃閃發光的『金字招牌』。這裡不僅守衛森嚴，裡面更不時傳出一陣陣銀兩碰撞與算盤撥動的清脆聲響。", 
        safe: true, x: 3, y: 0, z: 0, 
        region: ["world"], npcs: ["banker"]
    },
    
    "street_ne1": { 
        title: "青龍街", 
        description: "青龍街兩側種滿了垂柳，微風拂過，柳條如綠絲帶般搖曳生姿。相較於東街的喧囂，這裡顯得肅穆許多。隱約能聽見北邊傳來陣陣雄渾的呼喝與兵器碰撞之聲。", 
        x: 1, y: 1, z: 0, 
        region: ["world"] 
    },
    "weapon_shop": {
        title: "神鋒武器鋪",
        description: "武器鋪內熱氣逼人，巨大的火爐日夜不息地燃燒著。牆上掛滿了各式刀槍劍戟，在爐火的映照下閃爍著森森寒光。往北走就可以直接通往飛龍武館的練武場。",
        x: 2, y: 1, z: 0, 
        region: ["world"], npcs: ["blacksmith"]
    },

    // ================== 飛龍武館 (Gym) ==================
    "gym_gate": {
        title: "武館大門",
        description: "兩座巨大的青石獅子威武地蹲踞在朱紅大門兩側。上方高懸著一塊黑底金字的『飛龍武館』巨型牌匾。從裡面不斷傳出整齊劃一的練武呼嘯聲，威震四方。往東是練武場，往北則是一條幽靜的小徑。",
        x: 1, y: 2, z: 0, 
        safe: true, region: ["world", "gym"], allowSave: true
    },
    "gym_yard": {
        title: "練武場",
        description: "寬敞的露天廣場上鋪著平整厚實的青磚，磚面上隨處可見坑坑窪窪的掌印與腳印。數十名武館弟子正揮汗如雨地蹲著馬步、演練著基礎拳法。往北是王教頭的演武廳，往東是李教頭的劍室。",
        x: 2, y: 2, z: 0, 
        safe: true, region: ["gym"],
    },
    "gym_room_wang": {
        title: "王教頭廳",
        description: "大廳內瀰漫著一股濃烈的跌打藥酒氣味。兩旁的兵器架上插滿了數十斤重的厚背砍山刀與盤龍棍，彰顯著這裡主人剛猛無儔的戰鬥風格。\n【這裡可以向 王教頭 學習刀、棍、槍與拳腳功夫】",
        x: 2, y: 3, z: 0, 
        safe: true, region: ["gym"], npcs: ["gym_master"], allowSave: true
    },
    "gym_room_li": {
        title: "李教頭廳",
        description: "這裡的佈置相當雅致清幽，一陣淡淡的茶香撲鼻而來。牆壁上掛著數幅描寫劍意與輕功身法的山水字畫，角落放著一盆素雅的蘭花，透著一絲出塵的殺意。\n【這裡可以向 李教頭 學習劍、鞭、短兵與暗器功夫】",
        x: 3, y: 2, z: 0, 
        safe: true, region: ["gym"], npcs: ["gym_master_li"], allowSave: true
    },
    "gym_training": {
        title: "機關木人房",
        description: "狹小的房間中央只聳立著一尊巨大的銅皮機關木樁。這木樁的關節處用上好的精鋼打造，不僅能承受極大的打擊力量，甚至會因機關牽引而模擬出真人的防禦姿勢。",
        x: 3, y: 3, z: 0, 
        safe: false, region: ["gym"], npcs: ["wooden_dummy", "wooden_dummy"]
    },

    // ================== 森林區域 (保留 3x3 探索區) ==================
    "gym_path": { 
        title: "武館後徑", 
        description: "這是一條連接武館與北方茂密森林的泥土小徑。道路兩旁雜草叢生，越往北走，空氣中的濕度就越高，甚至能聞到一絲淡淡的腐葉氣味。", 
        x: 1, y: 3, z: 0, region: ["world"] 
    },
    
    // Row 4 (入口層)
    "forest_entry": { 
        title: "森林入口",
        description: "踏入森林的瞬間，頭頂的陽光立刻被參天巨木的枝葉切割成細碎的光斑。四周安靜得只剩下風吹過樹葉的沙沙聲，偶爾有幾隻溫馴的小動物在草叢間探出頭來。",
        x: 1, y: 4, z: 0, region: ["world", "forest"], npcs: ["rabbit", "rabbit", "pheasant"] 
    },
    "forest_w1": { 
        title: "森林邊緣(西)", description: "森林邊緣地帶的雜草深及大腿。稍微靠近灌木叢，就能聽見一些窸窸窣窣的聲響，似乎有不少小生命隱藏在其中。",
        x: 0, y: 4, z: 0, region: ["forest"], npcs: ["rabbit", "pheasant"] 
    },
    "forest_e1": { 
        title: "森林邊緣(東)", description: "這裡生長著幾棵結滿了不知名紅果實的野果樹。樹下散落著一些動物吃剩的殘渣，看來是野生動物們最愛的天然食堂。",
        x: 2, y: 4, z: 0, region: ["forest"], npcs: ["rabbit", "monkey"] 
    },

    // Row 5 (中層)
    "forest_mid": { 
        title: "森林中部", description: "越往深處走，樹木就越發粗壯茂密。空氣中瀰漫著濃重的腐葉泥土味，地上的枯枝敗葉踩上去會發出清脆的斷裂聲，在寂靜的林中顯得格外刺耳。",
        x: 1, y: 5, z: 0, region: ["forest"], npcs: ["monkey", "monkey", "snake"] 
    },
    "forest_mid_w": { 
        title: "陰暗樹林", description: "這裡的地形呈現一個小窪地，四周一片漆黑，陰冷的山風吹得人毛骨悚然。幾條粗大的冷血動物在樹幹上緩慢爬行的摩擦聲令人心驚肉跳。",
        x: 0, y: 5, z: 0, region: ["forest"], npcs: ["snake", "snake", "boar"] 
    },
    "forest_mid_e": { 
        title: "灌木叢", description: "幾乎要半個人高的荊棘與灌木完全阻擋了視線。這是一處天然的狩獵埋伏點，你總覺得背後似乎有幾雙銳利的眼睛正在死死地盯著你的脖子。",
        x: 2, y: 5, z: 0, region: ["forest"], npcs: ["monkey", "bobcat"] 
    },

    // Row 6 (深層)
    "forest_deep": { 
        title: "森林深處", description: "數十人合抱的古樹參天蔽日，徹底將外界的陽光隔絕在外。這裡人跡罕至，空氣中隱隱飄浮著一股濃烈的血腥味與野獸的腥臊氣。",
        x: 1, y: 6, z: 0, region: ["forest"], npcs: ["boar", "wolf"] 
    },
    "forest_deep_w": { 
        title: "野獸巢穴", description: "前方是一個巨大的天然岩石洞穴。洞口周圍散落著無數不知名動物的慘白骨骸，偶爾傳出幾聲震撼胸腔的恐怖低吼，這是真正處於食物鏈頂端的凶獸領地。",
        x: 0, y: 6, z: 0, region: ["forest"], npcs: ["wolf", "wolf", "bear"] 
    },
    "forest_deep_e": { 
        title: "迷霧林地", description: "一大片終年不散的乳白色濃霧將這裡完全吞噬。在三步之外就無法視物的環境中，那些習慣了黑暗的強大獵食者才是真正的支配者。",
        x: 2, y: 6, z: 0, region: ["forest"], npcs: ["bobcat", "wolf"] 
    },

    // ================== 遠方門派與節點 (Remote Nodes - Coordinates Aligned) ==================
    // [修正] 座標調整以確保 45度角 或 直線移動

    // 南方：茅山 (0, 0) -> (0, -10) [直線 South]
    "maoshan_gate": {
        title: "茅山派山門",
        description: `茅山派的山門矗立在荒山雨霧之中，兩側青石柱上各刻著一行寒意凜凜的古篆——「生死有命」、「鬼神莫犯」。大門前站著一名身形挺拔的道童，神情雖稚卻氣度不凡，見生人靠近便將手中的符籙握得更緊。四周數十張黃色符紙隨山風獵獵作響，似乎隨時都要飛昇而去。
<br>【這裡可以向 玄靈子道人 拜師入門，或學習基礎的拳腳、劍術與咒術】`,
        allowSave: true, safe: true,
        x: 0, y: -10, z: 0, 
        region: ["maoshan"],
        npcs: ["maoshan_boy", "xuanling"]
    },
    "maoshan_hall": {
        title: "三清大殿",
        description: `大殿內香煙裊裊，深褐色的巨型神像在搖曳的燭火中若隱若現。供桌上擺放著七七四十九個牛皮紙符，個個都磨得發黑，浸透了歲月的法力。殿中央懸著一口古銅大鐘，據說能在正子時敲響，驅散方圓五里的陰煞之氣。弟子們在此朝拜、抄錄道經，空氣中瀰漫著松脂香燭的氣味，令人心神沉澱。`,
        allowSave: true, safe: true,
        x: 0, y: -11, z: 0,
        region: ["maoshan"],
        npcs: ["maoshan_disc2"]
    },
    "maoshan_courtyard": {
        title: "松鶴庭院",
        description: `一個四面由青磚矮牆圍成的廣場，中央種了三棵百年以上的古松，樹冠如蓋，遮天蔽日。茅山弟子在此晨練拳腳，空氣中迴響著整齊的呼喝聲與符術的低鳴共鳴。庭院石板上刻著密密麻麻的八卦圖騰，每逢月圓之夜，據說這些圖騰會自行散發幽光。
<br>【可在此與弟子切磋武練，或向 玄靈子道人 學習武功】`,
        allowSave: true, safe: true,
        x: 0, y: -12, z: 0,
        region: ["maoshan"],
        npcs: ["maoshan_disc1", "xuanling"]
    },
    "maoshan_library": {
        title: "道藏閣",
        description: `道藏閣是茅山派最神聖的藏書聖地，三層小樓塞滿了泛黃的竹簡與厚重的古籍。許多書卷年代久遠，翻開時有陳年書香與淡淡的符水氣息撲面而來。書架間偶爾漂著幾塊自己游移的符籙，是前輩高人留下的索引機關，指示著重要典籍的位置。弟子白澤一臉書卷氣地坐在角落，正舔著毛筆抄錄符文。
<br>【這裡可以向弟子 白澤 了解法術系統，或自行打坐(automeditate)修練法力】`,
        allowSave: true, safe: true,
        x: 1, y: -12, z: 0,
        region: ["maoshan"],
        npcs: ["maoshan_disc2"]
    },
    "maoshan_altar": {
        title: "符籙壇",
        description: `符籙壇四周是一圈深及膝蓋的白石欄杆，欄杆上雕鑿著綿延不絕的神鬼符文。壇心是一塊直徑逾丈的黑色玄石，其上永遠燃著一團誰也不知道從何而起的幽藍火焰，雨打不熄、風吹不滅。玄煞老道就站在火焰旁，張開雙臂，口中無聲地吐出一段只有鬼神才能聽見的上古咒語——他的手指間，雷光交織。
<br>【需加入茅山且 spells 等級達 30，才能向 玄煞老道 學習高階法術】`,
        allowSave: true, safe: true,
        x: -1, y: -12, z: 0,
        region: ["maoshan"],
        npcs: ["xuansha", "wandering_ghost"]
    },
    "maoshan_crypt": {
        title: "陰煞地窟",
        description: `一條布滿黏滑青苔、極為陡峭的石階通向山腹深處。越往下走，氣溫越是驟降，腳下的地面隱約可見一道道瘮人的抓痕——那是什麼爪子留下的？石壁上嵌著幾根早已燃盡、只剩焦黑燈芯的油燈，浸在漫漫長夜中任憑邪祟自由遊蕩。遠處不知哪個角落傳來一聲低沉、喑啞的哀嚎。
<br><span style="color:#ff4444">【危險區域！這裡藏有枯骨殭屍與飄蕩孤魂，法術在此對它們有顯著加成】</span>`,
        safe: false,
        x: 0, y: -13, z: 0,
        region: ["maoshan"],
        npcs: ["jiangshi", "jiangshi", "wandering_ghost", "wandering_ghost"]
    },
    "maoshan_peak": {
        title: "茅山絕頂",
        description: `踏上絕頂，雲霧在腳下翻湧，彷彿整個世界都沉沒在白茫茫的虛空之中。絕頂中央矗立著一座只有一人高的黑石道塔，塔身刻滿了密密麻麻的咒文，散發著一股令人心悸的法力波動。這裡是茅山派舉行重大儀式的聖地，等閒弟子絕不許踏足，胡亂入侵者將受到嚴厲懲處。`,
        allowSave: true, safe: true,
        x: 0, y: -14, z: 0,
        region: ["maoshan"]
    },

    // 西方中繼站：漢口 (0, 0) -> (-20, 0) [直線 West]
    "hankou_ferry": {
        title: "漢口渡口",
        description: "漢水與長江的交匯處，水面寬闊無垠，江水滔滔東去。這裡千帆競渡，百舸爭流，碼頭上擠滿了南來北往的商賈與腳夫，叫罵聲與裝卸貨物的沉悶撞擊聲交織在一起，是前往武當山和巴蜀的必經樞紐。",
        allowSave: true, safe: true,
        x: -20, y: 0, z: 0, region: ["world"]
    },

    // 西北分支：武當山 (漢口 -20,0 -> 武當 -35,15) [正西北 X-15, Y+15]
    "wudang_gate": {
        title: "解劍池",
        description: "武當山腳下的解劍池水波不興，清澈見底。旁邊立著一塊數尺高的古老石碑，上書鐵畫銀鉤的『解劍』二字。碑上隱隱透出無匹的劍意，警告著所有來路不明的江湖客：無論你是何方神聖，到此都需解下兵刃以示尊敬。",
        allowSave: true, safe: true,
        x: -35, y: 15, z: 0, region: ["wudang"]
    },
    "wudang_hall": {
        title: "紫霄宮",
        description: "紫霄宮是武當派的主殿，其飛簷翹角，氣勢恢宏而不失道家莊嚴。殿前那巨大的太極圖案廣場上，數十名穿著雪白道袍的弟子正隨著雲捲雲舒的節奏，緩緩演練著綿延不絕的太極拳。",
        allowSave: true, safe: true,
        x: -35, y: 15, z: 1, region: ["wudang"]
    },

    // 西南分支：巴蜀 (漢口 -20,0 -> 成都 -45,-25) [正西南 X-25, Y-25]
    "chengdu_city": {
        title: "成都城",
        description: "素有『天府之國』美譽的成都。城內青磚黛瓦的建築錯落有致，街邊各式茶館林立，小販們正操著一聲聲道地的川音兜售著辣味四溢的特色小吃，整座城市洋溢著一種悠閒愜意的獨特氛圍。",
        allowSave: true, safe: true,
        x: -45, y: -25, z: 0, region: ["world"]
    },
    
    // 成都周邊門派 (微調位置以配合成都新座標)
    "tang_gate": {
        title: "唐門世家",
        description: "唐門世家坐落在一片終年被瘴氣籠罩的迷霧竹林之中。高聳的石牆外圍佈滿了閃爍著藍光的鐵藜蒺，厚重的精鋼大門緊緊閉攏。周圍的密林裡安靜得連一聲鳥叫都沒有，顯然隱藏著無數致命的機關與暗哨。",
        allowSave: true, safe: true,
        x: -50, y: -25, z: 0, region: ["tangmen"]
    },
    "emei_gate": {
        title: "峨嵋接引殿",
        description: "『峨嵋天下秀』，此言不虛。接引殿前古木參天，松風如濤，一條蜿蜒陡峭的青石棧道直入雲霄。空氣中飄散著淡淡的檀香與山林獨有的清新氣息，隱約還能聽見遠處傳來的悠揚鐘聲。",
        allowSave: true, safe: true,
        x: -50, y: -30, z: 0, region: ["emei"]
    },
    "qingcheng_gate": {
        title: "青城上清宮",
        description: "『青城天下幽』，上清宮宛如鑲嵌在蒼翠山崖間的一顆明珠。紅牆青瓦在參天古柏的掩映下顯得古樸自然，與周圍的山水完美地融為了一體，令人心生脫俗之感。",
        allowSave: true, safe: true,
        x: -50, y: -20, z: 0, region: ["qingcheng"]
    },

    // 西北：少林 (客棧 0,1 -> 少林 -29,30) [正西北 X-29, Y+29]
    "shaolin_gate": {
        title: "少林寺山門",
        description: "『天下武功出少林』。巍峨聳立的少林寺山門前，兩株生長了數百年的古柏猶如兩名怒目金剛般守護著這片武學聖地。前來上香的信徒與前來求學的武林人士絡繹不絕，少林威名，可見一斑。",
        allowSave: true, safe: true,
        x: -29, y: 30, z: 0, region: ["shaolin"]
    },

    // 絲綢之路：(少林 -29,30 -> 崆峒 -69,30) [直線 West, 距離 40]
    "kongtong_gate": {
        title: "崆峒派",
        description: "崆峒派依仗著奇峰突兀、怪石嶙峋的地勢而建。周圍山道險峻異常，幾乎是在峭壁上硬生生開鑿出來的。整個門派彷彿一頭盤踞在絕壁上的猛虎，憑藉著天險屏障，易守難攻。",
        allowSave: true, safe: true,
        x: -69, y: 30, z: 0, region: ["kongtong"]
    },

    // 崑崙：(崆峒 -69,30 -> 崑崙 -99,60) [正西北 X-30, Y+30]
    "kunlun_gate": {
        title: "崑崙仙境",
        description: "此乃萬山之祖，終年積雪不化，寒風如刀般刮過臉頰。在雲霧繚繞的雪峰之巔，卻神奇地長著幾株翠綠的奇松，宛如世外桃源般的崑崙仙境便隱藏在此等絕境之中。",
        allowSave: true, safe: true,
        x: -99, y: 60, z: 0, region: ["kunlun"]
    },

    // ================== 特殊 ==================
    "ghost_gate": {
        title: "鬼門關",
        description: "四周陰風慘慘，鬼哭神號。濃霧之中隱約可見無數面容扭曲的亡魂正排著望不到盡頭的長隊，等著領取那碗能忘卻今生緣的孟婆湯... 閻王要你三更死，誰敢留人到五更。(請在這邊待滿3分鐘等待隨機還陽)",
        safe: true, x: 9999, y: 9999, z: -9999, region: ["underworld"]
    }
};

// 2. 路徑定義 (Paths)
// 系統會根據這些定義自動生成中間的房間
export const WorldPaths = [
    // 揚州(0,0) -> 茅山(0,-10) [正南]
    {
        id: "path_yangzhou_maoshan",
        from: "yangzhou_square",
        to: "maoshan_gate",
        distance: 10,
        type: "misty_road",
        desc: "這是一條通往茅山的小徑，越走霧氣越重，四周寂靜無聲。"
    },
    // 揚州(0,0) -> 漢口(-20,0) [正西]
    {
        id: "path_yangzhou_hankou",
        from: "yangzhou_square",
        to: "hankou_ferry",
        distance: 20,
        type: "official_road",
        desc: "這是一條連接東西方的寬闊官道，路上偶爾有鏢車經過，只有幾棵枯樹孤零零地立著。"
    },
    // 客棧(0,1) -> 少林(-29,30) [正西北]
    {
        id: "path_yangzhou_shaolin",
        from: "inn_start",
        to: "shaolin_gate",
        distance: 29, // X:29, Y:29 => distance 29
        type: "official_road",
        desc: "這是一條通往中原腹地的官道，遠處嵩山巍峨聳立。"
    },
    // 漢口(-20,0) -> 武當(-35,15) [正西北]
    {
        id: "path_hankou_wudang",
        from: "hankou_ferry",
        to: "wudang_gate",
        distance: 15, // X:15, Y:15
        type: "mountain_path",
        desc: "離開渡口往西北行，山勢漸高，雲霧繚繞，氣勢非凡，正是前往武當山的路徑。"
    },
    // 漢口(-20,0) -> 成都(-45,-25) [正西南]
    {
        id: "path_hankou_chengdu",
        from: "hankou_ferry",
        to: "chengdu_city",
        distance: 25, // X:25, Y:25
        type: "shu_road",
        desc: "『蜀道難，難於上青天』。道路變得崎嶇險峻，兩旁是萬丈深淵，下方是奔騰的江水。"
    },
    // 成都周邊 (短途)
    { id: "path_cd_tang", from: "chengdu_city", to: "tang_gate", distance: 5, type: "bamboo_path", desc: "穿過一片茂密的竹林，霧氣瀰漫，很容易迷失方向。" },
    { id: "path_cd_emei", from: "chengdu_city", to: "emei_gate", distance: 5, type: "mountain_path", desc: "峨嵋山路秀麗清幽，古木參天，令人心曠神怡。" },
    { id: "path_cd_qing", from: "chengdu_city", to: "qingcheng_gate", distance: 5, type: "mountain_path", desc: "青城天下幽，這條小徑格外安靜。" },

    // 絲綢之路：少林(-29,30) -> 崆峒(-69,30) [正西]
    {
        id: "path_silk_road",
        from: "shaolin_gate", 
        to: "kongtong_gate",
        distance: 40,
        type: "desert",
        desc: "出了玉門關，便是茫茫戈壁。黃土高坡，滿目黃土。風沙很大，吹得人睜不開眼。"
    },
    // 崑崙：崆峒(-69,30) -> 崑崙(-99,60) [正西北]
    {
        id: "path_kongtong_kunlun",
        from: "kongtong_gate",
        to: "kunlun_gate",
        distance: 30, // X:30, Y:30
        type: "snow_path",
        desc: "越往西走，地勢越高，空氣越稀薄。遠處崑崙雪山終年積雪，寒風刺骨。"
    }
];