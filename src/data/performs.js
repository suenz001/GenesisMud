// src/data/performs.js
import { UI } from "../ui.js";

// 絕招資料庫
export const PerformDB = {

    // ========= 鐵砂掌 (iron-palm) =========
    "burning": {
        id: "burning",
        name: "五指烈焰",
        skill: "iron-palm",
        weaponType: "unarmed",
        forceCost: 150,
        cooldown: 15000,
        damageScale: 2.5,
        type: "single",
        msg: (attacker, target) => `
            <div style="margin-top:5px; border-left: 3px solid #ff4500; padding-left:8px;">
            ${attacker} 雙目赤紅，全身骨節啪啪作響，一聲怒喝震動四野！<br>
            只見其雙掌驟然轉為焦黑，周圍空氣彷彿被點燃，一招 
            <span style="color:#ff4500; text-shadow:0 0 10px #ff0000; font-weight:bold; font-size:1.1em;">【 五 指 烈 焰 】</span> 
            重重印在 ${target} 的胸口！<br>
            <span style="color:#ffaa00">「啵」的一聲焦響，${target} 的胸口冒出一股黑煙！</span>
            </div>
        `
    },

    // ========= 八卦刀 (eight-trigram-blade) =========
    "vortex": {
        id: "vortex",
        name: "刀輪旋風",
        skill: "eight-trigram-blade",
        weaponType: "blade",
        forceCost: 200,
        cooldown: 20000,
        damageScale: 1.8,
        type: "aoe",
        msg: (attacker) => `
            <div style="margin-top:5px; border-left: 3px solid #00ffff; padding-left:8px;">
            ${attacker} 腳踏先天八卦方位，手中單刀越轉越快，竟化作一道 
            <span style="color:#00ffff; text-shadow:0 0 10px #0000ff; font-weight:bold; font-size:1.1em;">【 刀 輪 旋 風 】</span>！<br>
            <span style="color:#87ceeb">無數刀氣如狂風般向四周席捲而去，無人可避！</span>
            </div>
        `
    },

    // ========= 疾風劍法 (swift-sword) =========
    "flurry": {
        id: "flurry",
        name: "風捲殘雲",
        skill: "swift-sword",
        weaponType: "sword",
        forceCost: 180,
        cooldown: 20000,      // [調整] 4連擊合計傷害高，CD 由 18s 調整至 20s
        damageScale: 0.8,
        hits: 4,
        type: "multi_hit",
        msg: (attacker, target) => `
            <div style="margin-top:5px; border-left: 3px solid #e0ffff; padding-left:8px;">
            ${attacker} 身形一晃，瞬間化作數道殘影，劍尖顫動，一招 
            <span style="color:#ffffff; text-shadow:0 0 8px #cccccc; font-weight:bold; font-size:1.1em;">【 風 捲 殘 雲 】</span> 
            籠罩了 ${target} 全身！<br>
            <span style="color:#ddd">劍光如網，密不透風，四擊接踵而至！</span>
            </div>
        `
    },

    // ========= 楊家槍 (yang-spear) =========
    "backstab": {
        id: "backstab",
        name: "回馬槍",
        skill: "yang-spear",
        weaponType: "lance",
        forceCost: 120,
        cooldown: 25000,
        damageScale: 2.0,
        type: "control",
        effect: "stun",        // 點穴：無法動彈也無法攻擊
        duration: 4,           // 4 秒
        msg: (attacker, target) => `
            <div style="margin-top:5px; border-left: 3px solid #ffd700; padding-left:8px;">
            ${attacker} 佯裝敗退，拖槍而走，${target} 不知是計，緊追不捨。<br>
            突然 ${attacker} 大喝一聲，腰身一扭，一記 
            <span style="color:#ffd700; text-shadow:0 0 10px #8b0000; font-weight:bold; font-size:1.1em;">【 回 馬 槍 】</span> 
            破空刺出！<br>
            <span style="color:#ff5555">${target} 猝不及防，被槍桿狠狠掃中要穴，渾身一麻，動彈不得！</span>
            </div>
        `
    },

    // ========= 羅漢棍 (arhat-stick) — 新增 =========
    "smite": {
        id: "smite",
        name: "金剛伏魔杵",
        skill: "arhat-stick",
        weaponType: "stick",
        forceCost: 160,
        cooldown: 20000,
        damageScale: 2.2,
        type: "control",
        effect: "stun",        // 暈眩：被震懵，動彈不得
        duration: 3,
        msg: (attacker, target) => `
            <div style="margin-top:5px; border-left: 3px solid #ffd700; padding-left:8px;">
            ${attacker} 口宣一聲「阿彌陀佛」，雙目倏然睜大，全身金光湧現！<br>
            手中棍棒猛地凝聚內力，化作一道金色佛光，招式
            <span style="color:#ffd700; text-shadow:0 0 12px #ff8800; font-weight:bold; font-size:1.1em;">【 金 剛 伏 魔 杵 】</span>
            當頭砸向 ${target}！<br>
            <span style="color:#ffdd88">「轟」的一聲悶響，${target} 兩眼一花，天旋地轉！</span>
            </div>
        `
    },

    // ========= 如影隨形刺 (shadow-dagger) — 新增 =========
    "assassinate": {
        id: "assassinate",
        name: "鬼影背刺",
        skill: "shadow-dagger",
        weaponType: "dagger",
        forceCost: 170,
        cooldown: 22000,
        damageScale: 3.0,      // 高爆發傷害
        type: "control",
        effect: "bleed",       // 造成流血
        duration: 5,           // 流血持續 5 秒
        msg: (attacker, target) => `
            <div style="margin-top:5px; border-left: 3px solid #9370db; padding-left:8px;">
            ${attacker} 忽然消失在原地，下一瞬已出現在 ${target} 的身後！<br>
            手中匕首悄無聲息地刺出，招式
            <span style="color:#9370db; text-shadow:0 0 10px #4b0082; font-weight:bold; font-size:1.1em;">【 鬼 影 背 刺 】</span>
            精準刺穿了 ${target} 的防禦！<br>
            <span style="color:#cc0000">${target} 發出一聲悶哼，鮮血從傷口汩汩湧出，難以止歇！</span>
            </div>
        `
    },

    // ========= 流雲鞭 (cloud-whip) — 新增 =========
    "entangle": {
        id: "entangle",
        name: "雲霧鎖身",
        skill: "cloud-whip",
        weaponType: "whip",
        forceCost: 130,
        cooldown: 22000,
        damageScale: 1.5,      // 傷害較低，重在控制
        type: "control",
        effect: "stun",        // 被鞭子套住，動彈不得
        duration: 4,
        msg: (attacker, target) => `
            <div style="margin-top:5px; border-left: 3px solid #778899; padding-left:8px;">
            ${attacker} 長鞭在空中劃出一個大圈，帶起一片騰騰霧氣！<br>
            招式
            <span style="color:#e6e6fa; text-shadow:0 0 8px #da70d6; font-weight:bold; font-size:1.1em;">【 雲 霧 鎖 身 】</span>
            如同一條靈蛇般纏住了 ${target} 的四肢！<br>
            <span style="color:#aa99cc">${target} 被長鞭死死縛住，掙扎卻徒勞！</span>
            </div>
        `
    },

    // ========= 金錢鏢 (golden-dart) — 新增 =========
    "dartrain": {
        id: "dartrain",
        name: "連珠快鏢",
        skill: "golden-dart",
        weaponType: "throwing",
        forceCost: 140,
        cooldown: 18000,
        damageScale: 0.9,      // 3連擊，每發傷害中等
        hits: 3,
        type: "multi_hit",
        msg: (attacker, target) => `
            <div style="margin-top:5px; border-left: 3px solid #ffdf00; padding-left:8px;">
            ${attacker} 雙手如電，在衣袖間連續拂過，數枚金光閃閃的銅錢夾帶勁風而出！<br>
            招式
            <span style="color:#ffdf00; text-shadow:0 0 8px #ffa500; font-weight:bold; font-size:1.1em;">【 連 珠 快 鏢 】</span>
            三鏢齊發，分取 ${target} 的天靈、咽喉與心窩！<br>
            <span style="color:#ffcc44">鏢如流星，快得令人眼花撩亂！</span>
            </div>
        `
    }
};