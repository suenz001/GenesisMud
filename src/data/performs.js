// src/data/performs.js
import { UI } from "../ui.js";

// 絕招資料庫
export const PerformDB = {
    // === 鐵砂掌絕招：五指烈焰 ===
    "burning": {
        id: "burning",
        name: "五指烈焰",
        skill: "iron-palm",      // 綁定的武功
        weaponType: "unarmed",   // 武器限制：空手
        forceCost: 150,          // 內力消耗
        cooldown: 15000,         // 冷卻時間 (毫秒)
        damageScale: 2.5,        // 基礎傷害倍率 (相對於普攻)
        type: "single",          // 類型：單體
        msg: (attacker, target) => `
            <div style="margin-top:5px;">
            ${attacker} 雙目赤紅，全身骨節啪啪作響，一聲怒喝震動四野！<br>
            只見其雙掌驟然轉為焦黑，周圍空氣彷彿被點燃，一招 
            <span style="color:#ff4500; text-shadow:0 0 10px #ff0000; font-weight:bold; font-size:1.1em;">【 五 指 烈 焰 】</span> 
            重重印在 ${target} 的胸口！<br>
            <span style="color:#ffaa00">「啵」的一聲焦響，${target} 的胸口冒出一股黑煙！</span>
            </div>
        `
    },

    // === 八卦刀絕招：刀輪旋風 ===
    "vortex": {
        id: "vortex",
        name: "刀輪旋風",
        skill: "eight-trigram-blade",
        weaponType: "blade",     // 武器限制：刀
        forceCost: 200,
        cooldown: 20000,
        damageScale: 1.8,        // 範圍攻擊倍率稍低
        type: "aoe",             // 類型：全體傷害
        msg: (attacker) => `
            <div style="margin-top:5px;">
            ${attacker} 腳踏先天八卦方位，手中單刀越轉越快，竟化作一道 
            <span style="color:#00ffff; text-shadow:0 0 10px #0000ff; font-weight:bold; font-size:1.1em;">【 刀 輪 旋 風 】</span>！<br>
            <span style="color:#87ceeb">無數刀氣如狂風般向四周席捲而去，無人可避！</span>
            </div>
        `
    },

    // === 疾風劍法絕招：風捲殘雲 ===
    "flurry": {
        id: "flurry",
        name: "風捲殘雲",
        skill: "swift-sword",
        weaponType: "sword",     // 武器限制：劍
        forceCost: 180,
        cooldown: 18000,
        damageScale: 0.8,        // 單發傷害較低，但會打多發
        hits: 4,                 // 連擊次數
        type: "multi_hit",       // 類型：連擊
        msg: (attacker, target) => `
            <div style="margin-top:5px;">
            ${attacker} 身形一晃，瞬間化作數道殘影，劍尖顫動，一招 
            <span style="color:#ffffff; text-shadow:0 0 8px #cccccc; font-weight:bold; font-size:1.1em;">【 風 捲 殘 雲 】</span> 
            籠罩了 ${target} 全身！<br>
            <span style="color:#ddd">劍光如網，密不透風！</span>
            </div>
        `
    },

    // === 楊家槍絕招：回馬槍 ===
    "backstab": {
        id: "backstab",
        name: "回馬槍",
        skill: "yang-spear",
        weaponType: "lance",     // 武器限制：槍
        forceCost: 120,
        cooldown: 25000,         // 控制技冷卻較長
        damageScale: 2.0,
        type: "buff_debuff",     // 類型：特殊效果
        effect: "busy",          // 效果：定身
        duration: 4,             // 定身秒數 (或回合數，這裡暫定秒數，後續系統配合)
        msg: (attacker, target) => `
            <div style="margin-top:5px;">
            ${attacker} 佯裝敗退，拖槍而走，${target} 不知是計，緊追不捨。<br>
            突然 ${attacker} 大喝一聲，腰身一扭，一記 
            <span style="color:#ffd700; text-shadow:0 0 10px #8b0000; font-weight:bold; font-size:1.1em;">【 回 馬 槍 】</span> 
            破空刺出！<br>
            <span style="color:#ff5555">${target} 猝不及防，被槍桿狠狠掃中要害，痛得齜牙咧嘴！</span>
            </div>
        `
    }
};