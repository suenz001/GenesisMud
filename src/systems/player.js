// src/systems/player.js
import { doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { SkillDB } from "../data/skills.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js";

// --- 通用：更新玩家資料 ---
export async function updatePlayer(userId, data) {
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, data);
        return true;
    } catch (e) { console.error("更新失敗", e); return false; }
}

// --- [修改] 計算有效技能等級 (含等級限制邏輯) ---
export function getEffectiveSkillLevel(entity, baseType) {
    const skills = entity.skills || {};
    const enabled = entity.enabled_skills || {};
    
    // 基礎等級
    const baseLvl = skills[baseType] || 0;
    
    // 檢查進階武功
    let advancedLvl = 0;
    
    // 玩家邏輯：檢查 enabled_skills
    const enabledId = enabled[baseType];
    if (enabledId && skills[enabledId]) {
        advancedLvl = skills[enabledId];
    }

    // === [新增] 限制邏輯：進階武學等級不能超過基礎武學 ===
    if (advancedLvl > baseLvl) {
        advancedLvl = baseLvl;
    }

    if (advancedLvl > 0) {
        return advancedLvl + Math.floor(baseLvl / 2);
    } else {
        return Math.floor(baseLvl / 2);
    }
}

// --- 輔助：計算戰鬥數值 ---
export function getCombatStats(entity) {
    const attr = entity.attributes || {};
    const str = attr.str || 10;
    const con = attr.con || 10;
    const per = attr.per || 10;
    
    const equipment = entity.equipment || {};
    const weaponId = equipment.weapon || null;
    const weaponData = weaponId ? ItemDB[weaponId] : null;
    
    const atkType = weaponData ? weaponData.type : 'unarmed';
    const armorId = equipment.armor || null;
    const armorData = armorId ? ItemDB[armorId] : null;
    
    const effAtkSkill = getEffectiveSkillLevel(entity, atkType); 
    const effForce = getEffectiveSkillLevel(entity, 'force');    
    const effDodge = getEffectiveSkillLevel(entity, 'dodge');    

    const weaponDmg = weaponData ? (weaponData.damage || 0) : 0;
    const weaponHit = weaponData ? (weaponData.hit || 0) : 0;
    const armorDef = armorData ? (armorData.defense || 0) : 0;

    const ap = (str * 2.5) + (effAtkSkill * 5) + (effForce * 2) + weaponDmg;
    const dp = (con * 2.5) + (effForce * 5) + (effDodge * 2) + armorDef;
    const hit = (per * 2.5) + (effAtkSkill * 3) + weaponHit;
    const dodge = (per * 2.5) + (effDodge * 4) + (effAtkSkill * 1);

    return { ap, dp, hit, dodge, atkType, weaponData, effAtkSkill };
}

export const PlayerSystem = {
    updatePlayer, 

    save: async (p, a, u) => {
        const room = MapSystem.getRoom(p.location);
        let updateData = { lastSaved: new Date().toISOString() };
        let msg = "遊戲進度已保存。";
        if (room && room.allowSave) {
            updateData.savePoint = p.location;
            msg += " (重生點已更新至此處)";
        }
        await updatePlayer(u, updateData);
        UI.print(msg, "system");
    },

    score: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        const combatStats = getCombatStats(playerData); 

        const moneyStr = UI.formatMoney(playerData.money || 0);
        const potential = playerData.combat?.potential || 0;
        const kills = playerData.combat?.kills || 0;
        const enforce = playerData.combat?.enforce || 0; // 顯示加力

        let html = UI.titleLine(`${playerData.name} 的狀態`);
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
        html += `<div>${UI.attrLine("性別", playerData.gender)}</div><div>${UI.attrLine("門派", playerData.sect || "無")}</div>`;
        html += `<div>${UI.attrLine("財產", moneyStr)}</div>`;
        html += `<div>${UI.attrLine("潛能", UI.txt(potential, "#ffff00", true))}</div>`;
        html += `</div><br>`;

        html += UI.txt("【 天賦屬性 】", "#00ffff") + "<br>";
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
        html += `<div>${UI.attrLine("膂力", attr.str)}</div><div>${UI.attrLine("根骨", attr.con)}</div>`;
        html += `<div>${UI.attrLine("悟性", attr.int)}</div><div>${UI.attrLine("定力", attr.per)}</div>`;
        html += `<div>${UI.attrLine("福緣", attr.kar)}</div><div>${UI.attrLine("靈性", attr.cor)}</div>`;
        html += `</div><br>`;
        
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
        html += `<div>${UI.attrLine("食物", attr.food+"/"+attr.maxFood)}</div><div>${UI.attrLine("飲水", attr.water+"/"+attr.maxWater)}</div>`;
        html += `</div><br>`;

        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
        html += `<div>${UI.txt("【 精 與 靈 】", "#ff5555")}</div><div>${UI.makeCmd("[運精]", "respirate", "cmd-btn")}</div>`;
        html += `<div>${UI.attrLine("精 (SP)", attr.sp+"/"+attr.maxSp)}</div>`;
        html += `<div>${UI.attrLine("靈力", attr.spiritual+"/"+attr.maxSpiritual)}</div>`;
        
        html += `<div>${UI.txt("【 氣 與 內 】", "#5555ff")}</div><div>${UI.makeCmd("[運氣]", "exercise", "cmd-btn")}</div>`;
        html += `<div>${UI.attrLine("氣 (HP)", attr.hp+"/"+attr.maxHp)}</div>`;
        html += `<div>${UI.attrLine("內力", attr.force+"/"+attr.maxForce)}</div>`;

        html += `<div>${UI.txt("【 神 與 法 】", "#ffff55")}</div><div>${UI.makeCmd("[運神]", "meditate", "cmd-btn")}</div>`;
        html += `<div>${UI.attrLine("神 (MP)", attr.mp+"/"+attr.maxMp)}</div>`;
        html += `<div>${UI.attrLine("法力", attr.mana+"/"+attr.maxMana)}</div>`;
        html += `</div><br>`;

        html += UI.txt("【 戰鬥參數 】", "#00ff00") + "<br>";
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
        html += `<div>${UI.attrLine("攻擊力", combatStats.ap)}</div><div>${UI.attrLine("防禦力", combatStats.dp)}</div>`;
        html += `<div>${UI.attrLine("命中率", combatStats.hit)}</div><div>${UI.attrLine("閃避率", combatStats.dodge)}</div>`;
        html += `<div>${UI.attrLine("殺氣", UI.txt(kills, "#ff0000"))}</div>`;
        // 顯示當前加力狀態
        html += `<div>${UI.attrLine("加力 (Enforce)", UI.txt(enforce+" 成", enforce > 0 ? "#ff9800" : "#aaa"))}</div>`;
        html += `</div>` + UI.titleLine("End");
        
        UI.print(html, 'chat', true);
    },

    // === [新增] 加力指令 ===
    enforce: async (p, a, u) => {
        if (a.length === 0) {
            UI.print(`目前加力：${p.combat.enforce || 0} 成`, "system");
            return;
        }
        let lvl = parseInt(a[0]);
        if (isNaN(lvl) || lvl < 0 || lvl > 10) {
            UI.print("加力範圍必須是 0 到 10。", "error");
            return;
        }

        if (!p.combat) p.combat = {};
        p.combat.enforce = lvl;
        
        if (lvl === 0) UI.print("你將內力收回丹田，不再加力。", "system");
        else UI.print(`你將全身功力凝聚，使用了 ${lvl} 成內力加強攻擊！`, "system");

        await updatePlayer(u, { "combat.enforce": lvl });
    },

    suicide: async (p, a, u) => {
        if(a[0]==='confirm'){
            await deleteDoc(doc(db,"players",u));
            await signOut(auth);
        } else {
            UI.print("請輸入 suicide confirm 以確認刪除角色。", "error");
        }
    },

    help: () => {
        let msg = UI.titleLine("江湖指南");
        msg += UI.txt(" 裝備指令：", "#ff5555") + "wield, unwield, wear, unwear\n";
        msg += UI.txt(" 基本指令：", "#00ffff") + "score, skills, inventory (i)\n";
        msg += UI.txt(" 武學指令：", "#ff5555") + "apprentice, learn, enable, unenable, practice\n";
        msg += UI.txt(" 修練指令：", "#ffff00") + "exercise, respirate, meditate, enforce (加力)\n";
        msg += UI.txt(" 戰鬥指令：", "#ff0000") + "kill (殺), fight (切磋)\n";
        msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
        msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy, sell\n";
        msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
        UI.print(msg, 'normal', true);
    }
};