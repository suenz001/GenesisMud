// src/data/npcs.js

export const NPCDB = {
    // === 城镇 NPC ===
    "waiter": {
        id: "waiter",
        name: "店小二",
        img: "assets/images/npcs/waiter.png",
        description: "一位穿著粗布麻衣的年輕伙計，肩膀上搭著一條洗到脫色的白毛巾。他滿臉堆著殷勤的笑容，正穿梭在各個客桌之間，手腳異常麻利。",
        attributes: { str: 15, con: 15, per: 15, kar: 15, int: 15, cor: 15 },
        combat: { hp: 300, maxHp: 300, attack: 10, defense: 5, xp: 0 },
        shop: { "rice": 10, "dumpling": 15, "bread": 5, "roast_chicken": 50, "waterskin": 20, "tea": 10, "wine": 80 },
        inquiries: {
            "name": "我是這家客棧的店小二，客官您要是餓了渴了，包在我身上！",
            "rumor": "客官您有所不知，最近城東那黑壓壓的林子裡，常常傳出滲人的狼嚎聲，您可千萬別亂跑啊。",
            "food": "客官若是餓了，儘管開口買(buy)些吃喝的！我們這兒的燒雞可是一絕。"
        }
    },
    "blacksmith": {
        id: "blacksmith",
        name: "鐵匠",
        img: "assets/images/npcs/blacksmith.png",
        description: "這位虯髯大漢赤裸著上半身，露出古銅色的虯結肌肉。他正揮舞著幾十斤重的巨鎚，『叮噹』作響地敲打著一塊燒紅的生鐵，火星四處飛濺，散發出驚人的熱流。",
        attributes: { str: 40, con: 40, per: 20, kar: 20, int: 20, cor: 20 },
        combat: { hp: 800, maxHp: 800, attack: 50, defense: 30, xp: 0 },
        shop: { 
            // --- 武器 (新手特價區) ---
            "stone": 10,           // 飛蝗石
            "wooden_staff": 50,    // 木棍
            "bamboo_spear": 80,    // 竹槍
            "dagger": 100,         // 匕首
            "leather_whip": 120,   // 皮鞭
            "iron_sword": 150,     // 鐵劍
            "throwing_knife": 300, // 柳葉飛刀
            "steel_blade": 400,    // 鋼刀

            // --- 防具與配件 (全身套裝) ---
            "straw_sandals": 10,   // 草鞋 (腳)
            "cloth_wrists": 15,    // 布護腕 (手)
            "cloth_cap": 20,       // 布帽 (頭)
            "cloth_trousers": 20,  // 粗布長褲 (腿)
            "old_cloak": 30,       // 破舊披風 (背)
            "cloth_armor": 50,     // 布衣 (身)
            "copper_amulet": 50,   // 護身符 (頸)
            
            // --- 進階防具 ---
            "leather_armor": 300,
            "leather_boots": 250
        }
    },
    // [新增] 書院 朱先生
    "scholar_zhu": {
        id: "scholar_zhu",
        name: "朱先生",
        title: "通儒書院夫子",
        img: "assets/images/npcs/scholar_zhu.png",
        description: "朱先生一襲洗得發白的長衫，頜下三縷長鬚隨風飄動。他手提一管狼毫，面前案上堆滿了古籍典冊。他的目光深邃而平和，彷彿已經看透了紅塵俗世的紛擾。",
        attributes: { str: 10, con: 10, per: 30, kar: 20, int: 40, cor: 10 },
        combat: { hp: 500, maxHp: 500, attack: 20, defense: 20, xp: 0 },
        skills: { "literate": 150, "force": 50 }, // 識字等級很高
        isPublicTutor: true,
        publicSkills: ["literate"], 
        shop: {
            "book_literate_1": 50,  // 三字經
            "book_literate_2": 200, // 千字文
            "book_buddha_1": 100,   // 心經
            "book_buddha_2": 500,   // 金剛經
            "book_taoism_1": 100,   // 符咒入門
            "book_taoism_2": 500    // 道德經
        },
        inquiries: {
            "name": "老朽朱先生，在此設館授徒。",
            "study": "年輕人若是不識字，將來就算拿到絕世武功秘笈也只能乾瞪眼啊！",
            "rumor": "聽說飛龍武館的王教頭和李教頭，兩人的武功路數截然不同呢。"
        }
    },
    // [新增] 錢莊老闆
    "banker": {
        id: "banker",
        name: "錢莊老闆",
        img: "assets/images/npcs/banker.png",
        description: "這位老闆姓錢，人如其名，全身上下穿金戴銀，一襲綾羅綢緞更是價值不斐。他手中那把純金打造的算盤被撥弄得『劈啪』作響，一雙小眼睛滴溜溜轉著，精明無比。",
        attributes: { str: 10, con: 10, per: 10, kar: 40, int: 50, cor: 10 },
        combat: { hp: 500, maxHp: 500, attack: 10, defense: 10, xp: 0 },
        isBanker: true,
        inquiries: {
            "name": "在下姓錢，大家都叫我錢老闆。客官要存錢(deposit)還是提錢(withdraw)？",
            "business": "我們宏源錢莊銀聯互通，童叟無欺！隨時可以來查帳(balance)。"
        }
    },
    
    // === 武館 NPC ===
    
    // 1. 王教頭 (力量/剛猛型)
    "gym_master": {
        id: "gym_master",
        name: "王教頭",
        title: "飛龍武館總教頭",
        img: "assets/images/npcs/gym_master.png",
        description: "王教頭生得膀大腰圓，猶如半截黑塔一般杵在庭院中。他手持一柄泛著寒光的特大號九環鋼刀，每一次呼吸都氣息悠長，顯然外家硬氣功已經練到了爐火純青的境界。",
        family: "common_gym",
        isMaster: true,
        attributes: { str: 50, con: 50, per: 30, kar: 30, int: 30, cor: 30 }, // 力量體質較高
        combat: { hp: 5000, maxHp: 5000, attack: 80, defense: 80, xp: 0 },
        skills: { 
            // 基礎內輕
            "force": 80, "dodge": 80,
            "turtle-force": 80, "leaf-steps": 80,
            
            // 專精外功 (刀、棍、槍、拳)
            "unarmed": 80, "blade": 80, "stick": 80, "lance": 80,
            
            // 進階外功
            "iron-palm": 80,           // 鐵砂掌
            "eight-trigram-blade": 80, // 八卦刀
            "arhat-stick": 80,         // 羅漢棍
            "yang-spear": 80           // 楊家槍
        },
        enabled_skills: {
            "force": "turtle-force",
            "dodge": "leaf-steps",
            "unarmed": "iron-palm",
            "blade": "eight-trigram-blade",
            "stick": "arhat-stick",
            "lance": "yang-spear"
        }
    },

    // 2. 李教頭 (技巧/靈敏型)
    "gym_master_li": {
        id: "gym_master_li",
        name: "李教頭",
        title: "飛龍武館副教頭",
        img: "assets/images/npcs/gym_master_li.jpg",
        description: "李教頭看似文弱骨瘦如柴，但他雙目開闔之間，隱隱有精光爆射而出。他的一雙手掌修長白皙，腰間盤著一條不知名材質製成的玄黑軟鞭，隨時準備發出致命一擊。",
        family: "common_gym",
        isMaster: true,
        attributes: { str: 30, con: 30, per: 50, kar: 30, int: 50, cor: 40 }, // 悟性靈性較高
        combat: { hp: 3500, maxHp: 3500, attack: 90, defense: 70, xp: 0 },
        skills: { 
            // 基礎內輕
            "force": 80, "dodge": 80,
            "turtle-force": 80, "leaf-steps": 80,
            
            // 專精外功 (劍、短兵、鞭、暗器) - 無 Unarmed
            "sword": 80, "dagger": 80, "whip": 80, "throwing": 80,
            
            // 進階外功
            "swift-sword": 80,    // 疾風劍法
            "shadow-dagger": 80,  // 如影隨形刺
            "cloud-whip": 80,     // 流雲鞭
            "golden-dart": 80     // 金錢鏢
        },
        enabled_skills: {
            "force": "turtle-force",
            "dodge": "leaf-steps",
            "sword": "swift-sword",
            "dagger": "shadow-dagger",
            "whip": "cloud-whip",
            "throwing": "golden-dart"
        }
    },

    // 3. 機關人 (傷害測試)
    "wooden_dummy": {
        id: "wooden_dummy",
        name: "機關人",
        img: "assets/images/npcs/wooden_dummy.png",
        description: "這是一具由魯班秘術打造而成的巨大機關人。它的主體由百年鐵木製成，外層更包覆著厚重且坑坑窪窪的黃銅皮。儘管它滿身傷痕，關節處的齒輪依然完美咬合著。",
        attributes: { str: 10, con: 100, per: 0, kar: 0, int: 0, cor: 0 },
        combat: { 
            hp: 50000, maxHp: 50000, // 高血量
            attack: 0, defense: 0,   // 零攻零防，真實傷害測試
            xp: 0                    // 無經驗值
        },
        skills: {} // 無技能
    },

    // === 森林生物 ===

    // Tier 1: 新手練手
    "rabbit": {
        id: "rabbit",
        name: "野兔",
        img: "assets/images/npcs/rabbit.webp",
        description: "一隻毛茸茸的小野兔，一對長耳朵正警覺地豎著。牠的鼻頭一抽一抽地嗅著周圍的空氣，遇到風吹草動便準備逃之夭夭。",
        attributes: { str: 5, con: 5, per: 25, kar: 20, int: 10, cor: 10 },
        combat: { hp: 200, maxHp: 200, attack: 15, defense: 5, xp: 20 }, 
        skills: { "unarmed": 10, "dodge": 10, "agile-beast": 5 },
        enabled_skills: { "unarmed": "agile-beast" },
        drops: [{ id: "rabbit_meat", rate: 1.0 }, { id: "rabbit_skin", rate: 0.5 }]
    },
    // Tier 1.5: 稍強
    "pheasant": {
        id: "pheasant",
        name: "野雞",
        img: "assets/images/npcs/pheasant.jpg",
        description: "這隻羽毛艷麗的野雞正在枯葉堆裡啄食著蟲子，牠那斑斕的尾羽在陽光下折射出亮眼的光彩。",
        attributes: { str: 8, con: 5, per: 25, kar: 15, int: 10, cor: 10 },
        combat: { hp: 300, maxHp: 300, attack: 20, defense: 10, xp: 40 }, 
        skills: { "unarmed": 15, "dodge": 15, "bird-hit": 15 },
        enabled_skills: { "unarmed": "bird-hit" },
        drops: [{ id: "pheasant_meat", rate: 1.0 }, { id: "pheasant_feather", rate: 0.6 }]
    },

    // Tier 2: 初學
    "monkey": {
        id: "monkey",
        name: "猴子",
        img: "assets/images/npcs/monkey.jpg",
        description: "這是一隻身手極其靈活的獼猴。牠單手攀在樹藤上盪來盪去，另一手還拿著剛搶來的果子，正對著你齜牙咧嘴地做著鬼臉。",
        attributes: { str: 10, con: 10, per: 40, kar: 15, int: 20, cor: 10 },
        combat: { hp: 600, maxHp: 600, attack: 30, defense: 20, xp: 70 }, 
        skills: { "unarmed": 30, "dodge": 30, "agile-beast": 20 }, 
        enabled_skills: { "unarmed": "agile-beast" },
        drops: [{ id: "wild_fruit", rate: 0.8 }]
    },
    // Tier 2.5: 入門
    "snake": {
        id: "snake",
        name: "蟒蛇",
        img: "assets/images/npcs/snake.jpg",
        aggro: true, 
        description: "一條大碗口粗的巨蟒，冰冷的鱗片在陰暗的樹林裡閃爍著幽光。它正高昂著扁平的三角頭部，吐著分叉的紅信死死盯著你。",
        attributes: { str: 15, con: 15, per: 20, kar: 10, int: 10, cor: 10 },
        combat: { hp: 1000, maxHp: 1000, attack: 50, defense: 30, xp: 120 }, 
        skills: { "unarmed": 30, "dodge": 30, "snake-move": 30, "force": 30 },
        enabled_skills: { "unarmed": "snake-move" },
        drops: [{ id: "snake_gall", rate: 0.2 }, { id: "snake_skin", rate: 0.5 }]
    },

    // Tier 3: 進階
    "bobcat": {
        id: "bobcat",
        name: "山貓",
        img: "assets/images/npcs/bobcat.jpg",
        description: "這隻山貓體型雖小，但充滿爆發力。牠那寶石般的豎瞳在黑暗中透出一股嗜血的野性，四爪間鋒利如刀的倒鉤若隱若現。",
        attributes: { str: 20, con: 20, per: 40, kar: 10, int: 15, cor: 10 },
        combat: { hp: 1500, maxHp: 1500, attack: 70, defense: 50, xp: 180 }, 
        skills: { "unarmed": 50, "dodge": 50, "wolf-claw": 50, "force": 30 }, 
        enabled_skills: { "unarmed": "wolf-claw" },
        drops: [{ id: "bobcat_skin", rate: 0.4 }]
    },
    // Tier 3.5: 挑戰
    "boar": {
        id: "boar",
        name: "野豬",
        img: "assets/images/npcs/boar.webp",
        description: "這頭成年雄性野豬渾身披著宛如鋼針般堅硬的黑色倒刺。牠最恐怖的是嘴邊那一對向外翻開、閃著寒光的巨大的獠牙，令人不寒而慄。",
        attributes: { str: 30, con: 30, per: 15, kar: 10, int: 5, cor: 5 },
        combat: { hp: 1800, maxHp: 1800, attack: 90, defense: 70, xp: 240 }, 
        skills: { "unarmed": 60, "dodge": 60, "boar-charge": 60, "force": 60 }, 
        enabled_skills: { "unarmed": "boar-charge" },
        drops: [{ id: "boar_meat", rate: 1.0 }, { id: "boar_tooth", rate: 0.3 }]
    },

    // Tier 4: 高手
    "wolf": {
        id: "wolf",
        name: "野狼",
        img: "assets/images/npcs/wolf.webp",
        aggro: true, 
        description: "這是一匹飢腸轆轆的孤狼。牠壓低了身體，背上的毛髮根根豎起，喉嚨裡正發出低沉且充滿威脅性的低吼聲。",
        attributes: { str: 35, con: 30, per: 35, kar: 10, int: 15, cor: 10 },
        combat: { hp: 2200, maxHp: 2200, attack: 110, defense: 90, xp: 300 },
        skills: { "unarmed": 80, "dodge": 80, "wolf-claw": 80, "force": 60 }, 
        enabled_skills: { "unarmed": "wolf-claw" },
        drops: [{ id: "wolf_skin", rate: 0.4 }]
    },
    // Tier 5: 森林霸主
    "bear": {
        id: "bear",
        name: "黑熊",
        img: "assets/images/npcs/bear.webp",
        aggro: true, 
        description: "被譽為森林霸主的巨大黑熊。當牠直立起身子時，龐大的陰影幾乎能把人完全籠罩。那巨大的熊掌只需一擊，就足以拍碎習武之人的天靈蓋。",
        attributes: { str: 50, con: 50, per: 20, kar: 10, int: 10, cor: 10 },
        combat: { hp: 3000, maxHp: 3000, attack: 150, defense: 120, xp: 500 },
        skills: { "unarmed": 100, "dodge": 100, "wolf-claw": 100, "force": 100 },
        enabled_skills: { "unarmed": "wolf-claw" },
        drops: [{ id: "bear_skin", rate: 1.0 }, { id: "bear_paw", rate: 0.2 }]
    },

    // ================ 茅山派 NPC ================

    // --- 師傅 ---
    "xuanling": {
        id: "xuanling",
        name: "玄靈子道人",
        title: "茅山派長老",
        family: "maoshan",
        isMaster: true,
        img: "assets/images/npcs/xuanling.png",
        description: "這位老道白鬚飄飄，面容雖已滿是皺紋，一雙眼睛卻明亮如電。他身著灰白道袍，胸前繡著三清玉符圖案，右手持一柄古樸的桃木劍，左手捻著一串用黑石珠子串成的道珠。山風吹來，他的衣袍與長鬚同時飄動，整個人如同立在雲端的謫仙。",
        attributes: { str: 35, con: 40, per: 45, kar: 30, int: 50, cor: 35 },
        combat: { hp: 3000, maxHp: 3000, attack: 120, defense: 100, xp: 0 },
        skills: {
            "unarmed": 80, "sword": 80, "spells": 120,
            "force": 80, "dodge": 80, "maoshan-sword": 80, "maoshan-force": 80, "tiangang-steps": 80, "maoshan-spells": 100
        },
        enabled_skills: {
            "sword": "maoshan-sword", "force": "maoshan-force", "dodge": "tiangang-steps", "spells": "maoshan-spells"
        },
        inquiries: {
            "茅山": "玄靈子捻動道珠，緩緩說道：「茅山立派已逾三百年，以符籙道法立足江湖，驅鬼辟邪乃是本門天職。你若心誠，可拜入我茅山門下，共同護守人間正道。」",
            "法術": "老道緩緩道：「法術消耗的是『法力』，也就是你體內的道家真元。若想修習法術，先得向我學習（learn）基本咒術（spells），再靠打坐（automeditate）積蓄道力，方可施法（cast）。」",
            "拜師": "玄靈子道人說道：「若你心誠向道，輸入『apprentice xuanling』即可拜入茅山。但此路一旦踏上，便要捨棄俗世的羁絆，一心求道。」",
            "怪物": "老道面色一沉：「山下地窟之中，有枯骨殭屍與飄蕩孤魂盤踞。普通武功雖能傷之，卻事倍功半。以茅山法術驅之，方是正道。」",
            "法力": "「道力，即你口中的法力，以心神（MP）為本。你若想修練法力，便需盤膝打坐（automeditate），以神運氣，緩緩凝聚。」"
        }
    },

    "xuansha": {
        id: "xuansha",
        name: "玄煞老道",
        title: "茅山派符籙長老",
        family: "maoshan",
        isMaster: true,
        img: "assets/images/npcs/xuansha.png",
        description: "此人赤發散亂，面容猙獰，若不是身著茅山道袍，怕是要被誤認為是某種邪祟。他的雙目充血泛紅，指尖常有幾縷細小的雷光游走。身後漂浮著七張半燃的符紙，那是他多年修為的法力外溢所致。見到生人靠近，他不言不語，只是輕輕嗤了一聲。",
        attributes: { str: 40, con: 45, per: 50, kar: 20, int: 60, cor: 30 },
        combat: { hp: 4000, maxHp: 4000, attack: 160, defense: 120, xp: 0 },
        skills: {
            "unarmed": 80, "sword": 60, "spells": 200,
            "force": 100, "dodge": 80, "maoshan-sword": 100, "maoshan-force": 120, "tiangang-steps": 100, "maoshan-spells": 180
        },
        enabled_skills: {
            "sword": "maoshan-sword", "force": "maoshan-force", "dodge": "tiangang-steps", "spells": "maoshan-spells"
        },
        inquiries: {
            "法術": "玄煞老道漫不經心地看了你一眼，冷冷問道：「你的咒術幾級了？沒到三十級，别來煩我。」",
            "雷霆符": "「五行雷法之首，凝天地浩然正氣一擊而出，对所有陰邪之物克制甚重。你若能讓我看看你的道行，或許可傳你修習之法。」",
            "鎖魂咒": "「此術非同小可，能直接鎖住對方的魂魄。對人類或許難以奏效，但面對孤魂野鬼，等同於直接縛住其本源，三招必滅。」"
        }
    },

    // --- 弟子 ---
    "maoshan_boy": {
        id: "maoshan_boy",
        name: "守山道童",
        family: "maoshan",
        description: "一個不過十三四歲的清秀少年，穿著寬大的青色道袍，頭上紮著兩個道髻，正站在山門前一板一眼地守衛。他的眼睛滴溜圓，對陌生人充滿好奇，但又盡力裝出一副不苟言笑的老成模樣。",
        attributes: { str: 15, con: 15, per: 18, kar: 20, int: 15, cor: 15 },
        combat: { hp: 300, maxHp: 300, attack: 20, defense: 15, xp: 0 },
        skills: { "unarmed": 10, "spells": 5 },
        inquiries: {
            "茅山": "道童挺起胸膛說道：「茅山派可是鼎鼎大名！我們師父說，茅山弟子守護世人三百年，功德無量！」",
            "拜師": "「想拜入茅山？那你得去找玄靈子師伯！他在山門裡面，或在後面的松鶴庭院。記得態度要誠懇喔！」",
            "地窟": "「地…地窟？」道童的臉色微微一白，「那地方我不去的！裡面有殭屍！師兄說普通人進去根本撐不了一刻鐘！」"
        }
    },

    "maoshan_disc1": {
        id: "maoshan_disc1",
        name: "茅山弟子·青風",
        family: "maoshan",
        description: "一名二十出頭的年輕道士，身形矯健，拳腳間透著幾分茅山派的道家韻味。他正在庭院中練習一套剛猛中帶著道法玄意的拳法，每一式都配合著低沉的吐納之聲，顯然已初窺茅山武學的門道。",
        attributes: { str: 25, con: 25, per: 25, kar: 20, int: 25, cor: 20 },
        combat: { hp: 1000, maxHp: 1000, attack: 70, defense: 55, xp: 50 },
        skills: { "unarmed": 40, "sword": 40, "spells": 20, "force": 30, "dodge": 35, "maoshan-sword": 30, "maoshan-spells": 10 },
        enabled_skills: { "unarmed": "unarmed", "sword": "maoshan-sword", "spells": "maoshan-spells" },
        inquiries: {
            "切磋": "青風道士笑道：「正好手癢！但你可別手下留情，茅山弟子不怕挫折！(輸入 fight maoshan_disc1)」",
            "法術": "「法術嘛…我剛開始學，還不太熟。不過師父說只要法力足夠，連殭屍也能一擊必殺！」"
        },
        drops: []
    },

    "maoshan_disc2": {
        id: "maoshan_disc2",
        name: "茅山弟子·白澤",
        family: "maoshan",
        description: "白澤道士生得文弱清秀，薄薄的嘴唇上方留著幾撮稀疏的鬍渣，手指上沾滿了墨跡。他是茅山派有名的「書符達人」，專長在符籙研究，在切磋上倒比不上同門師兄，但論起道法理論，無人能出其右。",
        attributes: { str: 15, con: 18, per: 20, kar: 18, int: 40, cor: 25 },
        combat: { hp: 700, maxHp: 700, attack: 45, defense: 40, xp: 0 },
        skills: { "unarmed": 20, "spells": 60, "force": 40, "maoshan-force": 30, "maoshan-spells": 50 },
        enabled_skills: { "force": "maoshan-force", "spells": "maoshan-spells" },
        inquiries: {
            "法術": "白澤放下毛筆，認真解釋道：「cast 指令的格式是：cast <法術ID> <目標ID>。例如：cast thunder_seal jiangshi。法術消耗的是你的法力（MP），所以要先用 automeditate 練習法力。」",
            "cast": "「cast 指令限茅山弟子使用。你要先（1）拜入茅山，（2）學習 spells 技能，（3）用 automeditate 積蓄法力，才能施法。對殭屍和孤魂的傷害會有大幅加成！」",
            "殭屍": "白澤壓低聲音說：「地窟裡的枯骨殭屍對普通物理攻擊有一定抗性，但對本派法術則毫無招架之力。尤其是雷霆符（thunder_seal），能讓它的骨骸直接灰飛煙滅！」"
        }
    },

    // --- 怪物（茅山特有）---
    "jiangshi": {
        id: "jiangshi",
        name: "枯骨殭屍",
        monsterType: "undead",        // 法術識別標籤
        img: "assets/images/npcs/jiangshi.png",
        aggro: true,
        description: "這具殭屍身軀已腐朽大半，但靠著陰煞之氣的支撐，仍然足以直立行走、殘忍殺戮。它的眼窩空洞，只有兩點磷火般的幽光閃爍，額頭上貼著一張幾乎磨蝕殆盡的符籙——那是當年壓制它的法術，如今早已失效。",
        attributes: { str: 40, con: 45, per: 15, kar: 5, int: 5, cor: 5 },
        combat: { hp: 1800, maxHp: 1800, attack: 105, defense: 110, xp: 120 },
        // 物理攻擊 20% 減傷（defense 高），法術傷害 ×1.8（由 cast_system 處理）
        skills: { "unarmed": 55, "dodge": 20, "wolf-claw": 55, "force": 40 },
        enabled_skills: { "unarmed": "wolf-claw" },
        drops: [
            { id: "yellow_talisman", rate: 0.5 },
            { id: "bone_chip", rate: 0.8 }
        ]
    },

    "wandering_ghost": {
        id: "wandering_ghost",
        name: "飄蕩孤魂",
        monsterType: "ghost",         // 法術識別標籤
        img: "assets/images/npcs/wandering_ghost.png",
        aggro: true,
        description: "這是一道飄忽不定的幽靈，生前或許是某位失意之人，如今魂魄殘存，在陰氣最重的地窟中徘徊不去。它的身軀幾乎是透明的，隱隱散發著令人骨寒的藍光，靠近時能聽見隱約的哭泣聲，分不清是悲傷還是憤怒。",
        attributes: { str: 20, con: 15, per: 40, kar: 5, int: 10, cor: 5 },
        combat: { hp: 600, maxHp: 600, attack: 80, defense: 30, xp: 80 },
        // 血量低、迴避高——物理難打，法術 ×2.0 加成
        skills: { "unarmed": 60, "dodge": 100, "force": 20 },
        enabled_skills: {},
        drops: [
            { id: "ghost_wisp", rate: 0.6 }
        ]
    }
};