// src/data/spells.js
// 茅山派（及未來其他道法/佛法門派）的法術資料庫

export const SpellDB = {

    // ========= 雷霆符（thunder_seal）=========
    // 茅山基礎法術，強力單體傷害
    "thunder_seal": {
        id: "thunder_seal",
        name: "雷霆符",
        sect: "maoshan",
        mpCost: 80,
        cooldown: 12000,
        damageScale: 2.0,
        type: "single",
        bonusVs: ["ghost", "undead"],   // 對鬼怪有加成
        bonusMultiplier: 1.8,           // 加成倍率
        msg: (caster, target) => `
            <div style="margin-top:5px; border-left: 3px solid #ffdd00; padding-left:8px;">
            ${caster} 雙手結印，口中念動黃庭真言，忽然間天邊滾來一聲驚雷！<br>
            一道刺目的金色雷光自指尖迸射而出，法術
            <span style="color:#ffdd00; text-shadow:0 0 12px #ff8800; font-weight:bold; font-size:1.1em;">【 雷 霆 符 】</span>
            轟然劈向 ${target}！<br>
            <span style="color:#ffa500">「轟！」的一聲巨響，${target} 在雷光中顫抖不已！</span>
            </div>
        `
    },

    // ========= 陰火符（ghost_fire）=========
    // DoT 燃燒傷害，對鬼怪效果加倍
    "ghost_fire": {
        id: "ghost_fire",
        name: "陰火符",
        sect: "maoshan",
        mpCost: 60,
        cooldown: 18000,
        damageScale: 0.7,
        type: "dot",                    // 持續傷害
        dotTicks: 4,                    // 持續 4 回合(約 10 秒)
        effect: "burn",
        duration: 10,
        bonusVs: ["ghost", "undead"],
        bonusMultiplier: 2.0,
        msg: (caster, target) => `
            <div style="margin-top:5px; border-left: 3px solid #ff6600; padding-left:8px;">
            ${caster} 袖中取出一張邊緣已然泛黑的符籙，手腕輕輕一抖，符紙化作一團幽暗的藍黑色火焰！<br>
            法術
            <span style="color:#ff6600; text-shadow:0 0 10px #ff0000; font-weight:bold; font-size:1.1em;">【 陰 火 符 】</span>
            如幽靈般飄向 ${target}，嗤嗤附著在其軀體之上燃燒！<br>
            <span style="color:#ff4400">${target} 發出痛苦的哀號，陰火正侵蝕著它的本源！</span>
            </div>
        `
    },

    // ========= 鎖魂咒（soul_chain）=========
    // 控制 + 傷害，對鬼怪有壓倒性加成
    "soul_chain": {
        id: "soul_chain",
        name: "鎖魂咒",
        sect: "maoshan",
        mpCost: 100,
        cooldown: 25000,
        damageScale: 1.2,
        type: "control",
        effect: "stun",
        duration: 4,
        bonusVs: ["ghost", "undead"],
        bonusMultiplier: 3.0,           // 對鬼怪幾乎是必殺
        msg: (caster, target) => `
            <div style="margin-top:5px; border-left: 3px solid #9955ff; padding-left:8px;">
            ${caster} 猛地豎起三根手指，雙目倏地翻白，口中喃喃吐出一段連鬼神都為之色變的古老咒語！<br>
            數條由純粹法力凝結而成的金色鎖鏈憑空浮現，法術
            <span style="color:#cc88ff; text-shadow:0 0 12px #7700ff; font-weight:bold; font-size:1.1em;">【 鎖 魂 咒 】</span>
            死死縛住了 ${target} 的魂魄！<br>
            <span style="color:#aa66ff">${target} 發出一聲無聲的嘶鳴，被無形的鎖鏈困住，動彈不得！</span>
            </div>
        `
    },

    // ========= 五鬼驅邪（exorcism）=========
    // 茅山招牌 AOE 法術，對所有邪祟範圍清場
    "exorcism": {
        id: "exorcism",
        name: "五鬼驅邪",
        sect: "maoshan",
        mpCost: 150,
        cooldown: 20000,
        damageScale: 1.5,
        type: "aoe",
        bonusVs: ["ghost", "undead"],
        bonusMultiplier: 2.5,
        msg: (caster) => `
            <div style="margin-top:5px; border-left: 3px solid #ffaa00; padding-left:8px;">
            ${caster} 猛地撕開懷中最後一張符籙，仰天長嘯：<br>
            <span style="color:#ffd700; font-style:italic">「太上老君急急如律令——驅！」</span><br>
            法術
            <span style="color:#ffaa00; text-shadow:0 0 15px #ff8800; font-weight:bold; font-size:1.2em;">【 五 鬼 驅 邪 】</span>
            發動！一道金光如太陽升起般向四周席捲！<br>
            <span style="color:#ffcc44">邪祟遇此正法，無不顫抖驚懼！</span>
            </div>
        `
    }
};
