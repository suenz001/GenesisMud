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

// --- 計算有效技能等級 (含等級限制邏輯) ---
export function getEffectiveSkillLevel(entity, baseType) {
    const skills = entity.skills || {};
    const enabled = entity.enabled_skills || {};
    
    const baseLvl = skills[baseType] || 0;
    let advancedLvl = 0;
    
    const enabledId = enabled[baseType];
    if (enabledId && skills[enabledId]) {
        advancedLvl = skills[enabledId];
    }

    // 進階武功等級不能超過基礎武功等級
    if (advancedLvl > baseLvl) {
        advancedLvl = baseLvl;
    }

    if (advancedLvl > 0) {
        return advancedLvl + Math.floor(baseLvl / 2);
    } else {
        return Math.floor(baseLvl / 2);
    }
}

// --- [修改] 計算戰鬥數值 (支援多部位防禦與屬性加成) ---
export function getCombatStats(entity) {
    // 1. 計算裝備提供的屬性加成 (Props)
    const baseAttr = entity.attributes || {};
    const effectiveAttr = { ...baseAttr }; // 複製一份基礎屬性
    const equipment = entity.equipment || {};
    
    let totalDefense = 0;
    let weaponDmg = 0;
    let weaponHit = 0;
    let weaponType = 'unarmed';
    let weaponData = null;

    // 遍歷所有裝備欄位
    for (const [slot, itemId] of Object.entries(equipment)) {
        if (!itemId) continue;
        const item = ItemDB[itemId];
        if (!item) continue;

        // 處理武器特有屬性
        if (slot === 'weapon') {
            weaponDmg = item.damage || 0;
            weaponHit = item.hit || 0;
            weaponType = item.type || 'unarmed';
            weaponData = item;
        } else {
            // 處理防具防禦力 (累加所有部位)
            if (item.defense) {
                totalDefense += item.defense;
            }
        }

        // 處理通用屬性加成 (props)
        if (item.props) {
            for (const [key, val] of Object.entries(item.props)) {
                if (effectiveAttr[key] !== undefined) {
                    effectiveAttr[key] += val;
                }
            }
        }
    }

    // 使用加成後的屬性進行計算
    const str = effectiveAttr.str || 10;
    const con = effectiveAttr.con || 10;
    const per = effectiveAttr.per || 10;
    const atkType = weaponType;
    
    // 取得各類技能等級
    const effAtkSkill = getEffectiveSkillLevel(entity, atkType); 
    const effForce = getEffectiveSkillLevel(entity, 'force');    
    const effDodge = getEffectiveSkillLevel(entity, 'dodge');    

    // 取得武功強度係數 (Rating)
    let atkRating = 1.0;
    let dodgeRating = 1.0;
    
    // 攻擊武功係數
    if (entity.enabled_skills && entity.enabled_skills[atkType]) {
        const sid = entity.enabled_skills[atkType];
        if (SkillDB[sid] && SkillDB[sid].rating) atkRating = SkillDB[sid].rating;
    } else {
        if (SkillDB[atkType]) atkRating = SkillDB[atkType].rating || 1.0;
    }

    // 輕功係數
    if (entity.enabled_skills && entity.enabled_skills['dodge']) {
        const sid = entity.enabled_skills['dodge'];
        if (SkillDB[sid] && SkillDB[sid].rating) dodgeRating = SkillDB[sid].rating;
    }

    const baseAp = (str * 2.5) + (effAtkSkill * 5 * atkRating) + (effForce * 2);
    const baseDp = (con * 2.5) + (effForce * 5) + (effDodge * 2 * dodgeRating);
    const baseHit = (per * 2.5) + (effAtkSkill * 3 * atkRating);
    const baseDodge = (per * 2.5) + (effDodge * 4 * dodgeRating) + (effAtkSkill * 1);

    const ap = baseAp + weaponDmg;
    const dp = baseDp + totalDefense; // 使用加總後的防禦力
    const hit = baseHit + weaponHit;
    const dodge = baseDodge; 

    return { 
        ap, dp, hit, dodge, 
        baseAp, baseDp, baseHit, baseDodge,
        equipAp: weaponDmg, 
        equipDp: totalDefense, 
        equipHit: weaponHit,
        atkType, weaponData, effAtkSkill,
        atkRating 
    };
}

// === 智慧修練指令生成邏輯 ===
function getSmartTrainCmd(cmd, cur, max) {
    const limit = max * 2;
    // 1. 若未滿最大值，補到滿 (Cost = Gap)
    if (cur < max) return `${cmd} ${max - cur}`;
    // 2. 若已滿但未達極限，執行一次大的 (或補到 limit)
    // 這裡直接設定消耗為剩餘空間，讓 skill_system 去執行累積
    if (cur < limit - 1) return `${cmd} ${limit - cur}`;
    // 3. 若已達瓶頸，執行 1 來觸發突破
    return `${cmd} 1`;
}

export const PlayerSystem = {
    updatePlayer, 
    
    save: async (p, a, u) => {
        if (p.state === 'fighting') {
             UI.print("戰鬥中不能存檔！", "error");
             return;
        }
        const room = MapSystem.getRoom(p.location);
        let updateData = { lastSaved: new Date().toISOString() };
        let msg = "遊戲進度已保存。";
        
        // 只有在允許存檔的地方才會更新重生點
        if (room && room.allowSave) {
            updateData.savePoint = p.location;
            msg += " (重生點已更新至此處)";
        }
        
        // 這裡我們也順便把其他重要狀態存入，確保萬無一失
        updateData.attributes = p.attributes;
        updateData.skills = p.skills;
        updateData.inventory = p.inventory;
        updateData.money = p.money;
        updateData.equipment = p.equipment;
        
        await updatePlayer(u, updateData);
        UI.print(msg, "system");
    },

    // === [新增] 離開遊戲 ===
    quit: async (p, a, u) => {
        if (p.state === 'fighting') {
            UI.print("戰鬥中不能離開遊戲！請先解決眼前的對手。", "error");
            return;
        }
        
        UI.print("你決定暫時離開這個江湖，改日再來。", "system");
        UI.print("正在保存檔案...", "system");
        
        // 執行完整存檔 (確保最新狀態被保存)
        await updatePlayer(u, {
            location: p.location,
            attributes: p.attributes,
            skills: p.skills,
            inventory: p.inventory,
            money: p.money,
            equipment: p.equipment,
            combat: p.combat,
            state: 'normal',
            combatTarget: null,
            lastSaved: new Date().toISOString()
        });

        // 登出 Firebase，這會觸發 main.js 的 onAuthStateChanged，自動回到登入畫面
        await signOut(auth);
    },

    score: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        const s = getCombatStats(playerData); 

        const moneyStr = UI.formatMoney(playerData.money || 0);
        const potential = playerData.combat?.potential || 0;
        const kills = playerData.combat?.kills || 0;
        const enforce = playerData.combat?.enforce || 0;
        const showStat = (total, equip) => {
            if (equip > 0) return `${Math.floor(total)} <span style="color:#00ff00;">(+${equip})</span>`;
            return Math.floor(total);
        };

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

        // === 智慧按鈕生成 ===
        const cmdSp = getSmartTrainCmd("respirate", attr.spiritual, attr.maxSpiritual);
        const cmdHp = getSmartTrainCmd("exercise", attr.force, attr.maxForce);
        const cmdMp = getSmartTrainCmd("meditate", attr.mana, attr.maxMana);

        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
        html += `<div>${UI.txt("【 精 與 靈 】", "#ff5555")}</div><div>${UI.makeCmd("[運精]", cmdSp, "cmd-btn")}</div>`;
        html += `<div>${UI.attrLine("精 (SP)", attr.sp+"/"+attr.maxSp)}</div>`;
        html += `<div>${UI.attrLine("靈力", attr.spiritual+"/"+attr.maxSpiritual)}</div>`;
        
        html += `<div>${UI.txt("【 氣 與 內 】", "#5555ff")}</div><div>${UI.makeCmd("[運氣]", cmdHp, "cmd-btn")}</div>`;
        html += `<div>${UI.attrLine("氣 (HP)", attr.hp+"/"+attr.maxHp)}</div>`;
        html += `<div>${UI.attrLine("內力", attr.force+"/"+attr.maxForce)}</div>`;

        html += `<div>${UI.txt("【 神 與 法 】", "#ffff55")}</div><div>${UI.makeCmd("[運神]", cmdMp, "cmd-btn")}</div>`;
        html += `<div>${UI.attrLine("神 (MP)", attr.mp+"/"+attr.maxMp)}</div>`;
        html += `<div>${UI.attrLine("法力", attr.mana+"/"+attr.maxMana)}</div>`;
        html += `</div><br>`;

        html += UI.txt("【 戰鬥參數 】", "#00ff00") + "<br>";
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
        html += `<div>${UI.attrLine("攻擊力", showStat(s.ap, s.equipAp))}</div><div>${UI.attrLine("防禦力", showStat(s.dp, s.equipDp))}</div>`;
        html += `<div>${UI.attrLine("命中率", showStat(s.hit, s.equipHit))}</div><div>${UI.attrLine("閃避率", showStat(s.dodge, 0))}</div>`;
        html += `<div>${UI.attrLine("殺氣", UI.txt(kills, "#ff0000"))}</div>`;
        html += `<div>${UI.attrLine("內力運用", UI.txt(enforce+" 成", enforce > 0 ? "#ff9800" : "#aaa"))}</div>`;
        html += `</div>` + UI.titleLine("End");
        
        UI.print(html, 'chat', true);
    },

    enforce: async (p, a, u) => {
        if (a.length === 0) {
            UI.print(`目前內力運用：${p.combat.enforce || 0} 成`, "system");
            return;
        }
        let lvl = parseInt(a[0]);
        if (isNaN(lvl) || lvl < 0 || lvl > 10) {
            UI.print("內力運用範圍必須是 0 到 10。", "error");
            return;
        }
        if (!p.combat) p.combat = {};
        p.combat.enforce = lvl;
        if (lvl === 0) UI.print("你將內力收回丹田，不再運用內力加強招式。", "system");
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
        msg += UI.txt(" 系統指令：", "#fff") + "save, quit, suicide\n";
        msg += UI.txt(" 裝備指令：", "#ff5555") + "wield, unwield, wear, unwear\n";
        msg += UI.txt(" 基本指令：", "#00ffff") + "score, skills, inventory (i)\n";
        msg += UI.txt(" 武學指令：", "#ff5555") + "apprentice, learn, enable, unenable, practice\n";
        msg += UI.txt(" 修練指令：", "#ffff00") + "exercise, respirate, meditate, enforce (內力運用)\n";
        msg += UI.txt(" 戰鬥指令：", "#ff0000") + "kill (殺), fight (切磋)\n";
        msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
        msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy, sell\n";
        msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
        UI.print(msg, 'normal', true);
    }
};