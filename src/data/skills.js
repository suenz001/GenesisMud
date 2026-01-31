// src/data/skills.js

export const SkillDB = {
    // === 基礎武學 ===
    "unarmed": {
        name: "基本拳腳",
        type: "martial",
        desc: "世間所有拳腳功夫的根基。",
        actions: [
            { msg: "$P揮出一拳，擊向$N的胸口。", damage: 10 },
            { msg: "$P飛起一腳，踢向$N的腰間。", damage: 15 },
            { msg: "$P雙掌一推，拍向$N的面門。", damage: 12 }
        ]
    },
    "sword": {
        name: "基本劍術",
        type: "martial",
        desc: "使用劍類兵器的基礎法門。",
        actions: [
            { msg: "$P手中的$w一抖，刺向$N。", damage: 15 },
            { msg: "$P向前一衝，手中$w砍向$N。", damage: 20 },
            { msg: "$P將$w橫掃，劃向$N的咽喉。", damage: 18 }
        ]
    },
    "force": { name: "基本內功", type: "force", desc: "修練內息的入門功夫。" },
    "dodge": { name: "基本閃躲", type: "dodge", desc: "閃避敵人攻擊的基礎身法。" },
    "parry": { name: "基本招架", type: "martial", desc: "格擋敵人攻擊的技巧。" },

    // === 進階武學 ===
    "iron-palm": {
        name: "鐵砂掌",
        id: "iron-palm",
        base: "unarmed",
        type: "martial",
        desc: "剛猛無比的掌法，掌力如鐵。",
        actions: [
            { msg: "$P大喝一聲，雙掌變得漆黑，一記「鐵沙排空」擊向$N！", damage: 40 },
            { msg: "$P運氣於掌，一招「掌心雷」拍向$N的天靈蓋！", damage: 50 },
            { msg: "$P雙掌連環拍出，這招「黑風煞煞」封住了$N的所有退路！", damage: 45 },
            { msg: "$P深吸一口氣，單掌緩緩推出，這招「開碑裂石」重重印在$N胸口！", damage: 60 }
        ]
    },

    "swift-sword": {
        name: "疾風劍法",
        id: "swift-sword",
        base: "sword",
        type: "martial",
        desc: "出劍如風，快如閃電。",
        actions: [
            { msg: "$P身形一晃，手中$w化作一道白光，一招「風馳電掣」刺向$N！", damage: 45 },
            { msg: "$P手腕疾抖，劍光如網，這招「狂風暴雨」罩向$N全身！", damage: 55 },
            { msg: "$P突然近身，手中$w疾刺$N眉心，好一招「電光火石」！", damage: 50 },
            { msg: "$P身隨劍走，如風捲殘雲般使出「風捲樓殘」，$w劃過$N的要害！", damage: 65 }
        ]
    },

    "turtle-force": { name: "龜息功", id: "turtle-force", base: "force", type: "force", desc: "模仿神龜呼吸的內功。" },
    "leaf-steps": { name: "隨風步", id: "leaf-steps", base: "dodge", type: "dodge", desc: "身形飄忽不定，如落葉隨風。" }
};