// src/data/skills.js

export const SkillDB = {
    // === 基礎武學 (Basic Skills) ===
    "unarmed": {
        name: "基本拳腳",
        base: null, // 基礎武學沒有 base
        type: "martial",
        desc: "世間所有拳腳功夫的根基。"
    },
    "sword": {
        name: "基本劍術",
        base: null,
        type: "martial",
        desc: "使用劍類兵器的基礎法門。"
    },
    "force": {
        name: "基本內功",
        base: null,
        type: "force",
        desc: "修練內息的入門功夫，能提升精氣神的上限。"
    },
    "dodge": {
        name: "基本閃躲",
        base: null,
        type: "dodge",
        desc: "閃避敵人攻擊的基礎身法。"
    },
    "parry": {
        name: "基本招架",
        base: null,
        type: "martial",
        desc: "格擋敵人攻擊的技巧。"
    },

    // === 進階武學 (Advanced Skills) ===
    
    // 拳腳進階
    "iron-palm": {
        name: "鐵砂掌",
        id: "iron-palm",
        base: "unarmed", // 對應基礎拳腳
        type: "martial",
        desc: "剛猛無比的掌法，掌力如鐵，中者筋斷骨折。"
    },

    // 劍法進階
    "swift-sword": {
        name: "疾風劍法",
        id: "swift-sword",
        base: "sword", // 對應基礎劍術
        type: "martial",
        desc: "出劍如風，快如閃電，以速度取勝的劍法。"
    },

    // 內功進階
    "turtle-force": {
        name: "龜息功",
        id: "turtle-force",
        base: "force", // 對應基礎內功
        type: "force",
        desc: "模仿神龜呼吸的內功，氣息綿長，極大增強生命力。"
    },

    // 輕功進階
    "leaf-steps": {
        name: "隨風步",
        id: "leaf-steps",
        base: "dodge", // 對應基礎閃躲
        type: "dodge",
        desc: "身形飄忽不定，如落葉隨風而舞，令人捉摸不透。"
    }
};