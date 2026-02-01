// src/data/skills.js

export const SkillDB = {
    // ================== 基礎武學 (Basic) ==================
    "unarmed": {
        name: "基本拳腳", type: "martial", desc: "世間所有拳腳功夫的根基。",
        actions: [
            { msg: "$P揮出一拳，擊向$N的胸口。", damage: 10 },
            { msg: "$P飛起一腳，踢向$N的腰間。", damage: 15 },
            { msg: "$P雙掌一推，拍向$N的面門。", damage: 12 }
        ]
    },
    "sword": {
        name: "基本劍術", type: "martial", desc: "使用劍類兵器的基礎法門。",
        actions: [
            { msg: "$P手中的$w一抖，刺向$N。", damage: 15 },
            { msg: "$P向前一衝，手中$w砍向$N。", damage: 20 },
            { msg: "$P將$w橫掃，劃向$N的咽喉。", damage: 18 }
        ]
    },
    "blade": {
        name: "基本刀法", type: "martial", desc: "大開大闔的刀法基礎。",
        actions: [
            { msg: "$P大喝一聲，手中$w當頭劈向$N！", damage: 20 },
            { msg: "$P反手一撩，$w由下而上劃向$N的小腹。", damage: 18 },
            { msg: "$P刀勢如虹，$w橫削$N的肩膀。", damage: 15 }
        ]
    },
    "stick": {
        name: "基本棍法", type: "martial", desc: "以橫掃、劈打為主的棍法。",
        actions: [
            { msg: "$P掄起$w，呼的一聲砸向$N的腦袋。", damage: 18 },
            { msg: "$P手中$w橫掃千軍，掃向$N的下盤。", damage: 15 },
            { msg: "$P雙手持$w，直捅$N的胸口。", damage: 12 }
        ]
    },
    "dagger": {
        name: "基本短兵", type: "martial", desc: "短小精悍，貼身肉搏的技巧。",
        actions: [
            { msg: "$P欺身而上，手中$w刺向$N的心窩。", damage: 15 },
            { msg: "$P身形一矮，$w無聲無息地劃向$N的大腿。", damage: 12 },
            { msg: "$P反握$w，反手刺向$N的背心。", damage: 18 }
        ]
    },
    "whip": {
        name: "基本鞭法", type: "martial", desc: "長鞭揮舞，控制距離的武學。",
        actions: [
            { msg: "$P手腕一抖，$w如靈蛇般捲向$N的脖子。", damage: 15 },
            { msg: "$P用力一甩，$w啪的一聲抽在$N的臉上。", damage: 12 },
            { msg: "$P手中$w畫了個圈，套向$N的兵器。", damage: 10 }
        ]
    },
    "throwing": {
        name: "基本暗器", type: "martial", desc: "投擲暗器的基礎準頭練習。",
        actions: [
            { msg: "$P手一揚，一道寒光射向$N。", damage: 15 },
            { msg: "$P手指輕彈，暗器直奔$N的雙眼。", damage: 20 },
            { msg: "$P發出暗器，封住了$N的退路。", damage: 10 }
        ]
    },
    "lance": {
        name: "基本槍法", type: "martial", desc: "百兵之王，長槍的運用法門。",
        actions: [
            { msg: "$P抖動槍花，$w如毒龍出洞般刺向$N。", damage: 20 },
            { msg: "$P大喝一聲，手中$w猛地橫掃$N。", damage: 22 },
            { msg: "$P長槍一挺，$w直取$N的咽喉。", damage: 25 }
        ]
    },
    
    "force": { name: "基本內功", type: "force", desc: "修練內息的入門功夫。" },
    "dodge": { name: "基本閃躲", type: "dodge", desc: "閃避敵人攻擊的基礎身法。" },

    // ================== 進階武學 (Advanced) ==================
    
    // 拳腳 (Unarmed)
    "iron-palm": {
        name: "鐵砂掌", id: "iron-palm", base: "unarmed", type: "martial",
        desc: "剛猛無比的掌法，掌力如鐵。",
        actions: [
            { msg: "$P大喝一聲，雙掌變得漆黑，一記「鐵沙排空」擊向$N！", damage: 40 },
            { msg: "$P運氣於掌，一招「掌心雷」拍向$N的天靈蓋！", damage: 50 },
            { msg: "$P雙掌連環拍出，這招「黑風煞煞」封住了$N的所有退路！", damage: 45 }
        ]
    },

    // 劍 (Sword)
    "swift-sword": {
        name: "疾風劍法", id: "swift-sword", base: "sword", type: "martial",
        desc: "出劍如風，快如閃電。",
        actions: [
            { msg: "$P身形一晃，手中$w化作一道白光，一招「風馳電掣」刺向$N！", damage: 45 },
            { msg: "$P手腕疾抖，劍光如網，這招「狂風暴雨」罩向$N全身！", damage: 55 },
            { msg: "$P突然近身，手中$w疾刺$N眉心，好一招「電光火石」！", damage: 50 }
        ]
    },

    // 刀 (Blade) - 八卦刀
    "eight-trigram-blade": {
        name: "八卦刀", id: "eight-trigram-blade", base: "blade", type: "martial",
        desc: "配合八卦方位的刀法，攻守兼備。",
        actions: [
            { msg: "$P腳踏八卦方位，手中$w使出一招「乾三連」，三刀連環劈向$N！", damage: 45 },
            { msg: "$P刀勢沉穩，一招「坤六斷」將$N的攻勢盡數化解，順勢反撩！", damage: 40 },
            { msg: "$P身形旋轉，手中$w如狂風般捲出，這招「巽下斷」直取$N下盤！", damage: 50 }
        ]
    },

    // 棍 (Stick) - 羅漢棍
    "arhat-stick": {
        name: "羅漢棍", id: "arhat-stick", base: "stick", type: "martial",
        desc: "佛門入門棍法，招式平正，威力不俗。",
        actions: [
            { msg: "$P口宣佛號，手中$w一招「羅漢撞鐘」，直撞$N胸口！", damage: 42 },
            { msg: "$P舞動$w，密不透風，一招「金剛護體」震開了$N！", damage: 35 },
            { msg: "$P躍起半空，手中$w當頭砸下，好一招「佛光普照」！", damage: 55 }
        ]
    },

    // 短兵 (Dagger) - 如影隨形刺
    "shadow-dagger": {
        name: "如影隨形刺", id: "shadow-dagger", base: "dagger", type: "martial",
        desc: "如影子般貼身纏鬥，招招陰毒。",
        actions: [
            { msg: "$P身形忽左忽右，手中$w如鬼魅般刺出，這招「如影隨形」讓人防不勝防！", damage: 45 },
            { msg: "$P突然繞到$N身後，手中$w無聲刺出，一招「背刺」直取要害！", damage: 60 },
            { msg: "$P手中$w在掌心飛速旋轉，化作一片光影，切向$N的咽喉！", damage: 48 }
        ]
    },

    // 鞭 (Whip) - 流雲鞭
    "cloud-whip": {
        name: "流雲鞭", id: "cloud-whip", base: "whip", type: "martial",
        desc: "鞭法行雲流水，變幻莫測。",
        actions: [
            { msg: "$P手中$w抖動，如天邊流雲變幻，一招「白雲出岫」捲住$N！", damage: 40 },
            { msg: "$P手腕輕抖，$w在空中炸響，一招「烏雲蓋頂」劈頭蓋臉抽向$N！", damage: 45 },
            { msg: "$P長鞭揮舞成圈，如雲霧繚繞，這招「雲霧鎖身」困住了$N！", damage: 38 }
        ]
    },

    // 暗器 (Throwing) - 金錢鏢
    "golden-dart": {
        name: "金錢鏢", id: "golden-dart", base: "throwing", type: "martial",
        desc: "使用銅錢作為暗器的獨門手法。",
        actions: [
            { msg: "$P手指連彈，數枚銅錢帶著破空之聲，一招「滿天花雨」射向$N！", damage: 40 },
            { msg: "$P看似隨意一揮，一枚銅錢劃出一道弧線，直擊$N太陽穴！", damage: 50 },
            { msg: "$P雙手齊出，銅錢如連珠砲般射出，這招「連珠鏢」逼得$N手忙腳亂！", damage: 45 }
        ]
    },

    // 槍 (Lance) - 楊家槍
    "yang-spear": {
        name: "楊家槍", id: "yang-spear", base: "lance", type: "martial",
        desc: "戰場殺伐之術，氣勢磅礴。",
        actions: [
            { msg: "$P大喝一聲「回馬槍」，佯裝敗退，突然回身一槍刺穿$N！", damage: 65 },
            { msg: "$P手中$w抖出朵朵槍花，一招「梨花帶雨」罩向$N全身！", damage: 50 },
            { msg: "$P長槍如龍，氣勢如虹，這招「直搗黃龍」勢不可擋！", damage: 55 }
        ]
    },

    "turtle-force": { name: "龜息功", id: "turtle-force", base: "force", type: "force", desc: "模仿神龜呼吸的內功。" },
    "leaf-steps": { name: "隨風步", id: "leaf-steps", base: "dodge", type: "dodge", desc: "身形飄忽不定，如落葉隨風。" }
};