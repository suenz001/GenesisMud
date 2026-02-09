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

    // 進階武功等級不能超過基礎武功
    if (advancedLvl > baseLvl) {
        advancedLvl = baseLvl;
    }

    if (advancedLvl > 0) {
        return advancedLvl + Math.floor(baseLvl / 2);
    } else {
        return Math.floor(baseLvl / 2);
    }
}

// --- 計算戰鬥數值 ---
export function getCombatStats(entity) {
    const baseAttr = entity.attributes || {};
    const effectiveAttr = { ...baseAttr };
    const equipment = entity.equipment || {};
    
    let totalDefense = 0;
    let weaponDmg = 0;
    let weaponHit = 0;
    let weaponType = 'unarmed';
    let weaponData = null;

    for (const [slot, itemId] of Object.entries(equipment)) {
        if (!itemId) continue;
        const item = ItemDB[itemId];
        if (!item) continue;

        if (slot === 'weapon') {
            weaponDmg = item.damage || 0;
            weaponHit = item.hit || 0;
            weaponType = item.type || 'unarmed';
            weaponData = item;
        } else {
            if (item.defense) totalDefense += item.defense;
        }

        if (item.props) {
            for (const [key, val] of Object.entries(item.props)) {
                if (effectiveAttr[key] !== undefined) effectiveAttr[key] += val;
            }
        }
    }

    const str = effectiveAttr.str || 10;
    const con = effectiveAttr.con || 10;
    const per = effectiveAttr.per || 10;
    const atkType = weaponType;
    
    const effAtkSkill = getEffectiveSkillLevel(entity, atkType); 
    const effForce = getEffectiveSkillLevel(entity, 'force');    
    const effDodge = getEffectiveSkillLevel(entity, 'dodge');    

    let atkRating = 1.0;
    let dodgeRating = 1.0;
    
    if (entity.enabled_skills && entity.enabled_skills[atkType]) {
        const sid = entity.enabled_skills[atkType];
        if (SkillDB[sid] && SkillDB[sid].rating) atkRating = SkillDB[sid].rating;
    } else {
        if (SkillDB[atkType]) atkRating = SkillDB[atkType].rating || 1.0;
    }

    if (entity.enabled_skills && entity.enabled_skills['dodge']) {
        const sid = entity.enabled_skills['dodge'];
        if (SkillDB[sid] && SkillDB[sid].rating) dodgeRating = SkillDB[sid].rating;
    }

    const baseAp = (str * 2.5) + (effAtkSkill * 5 * atkRating) + (effForce * 2);
    const baseDp = (con * 2.5) + (effForce * 5) + (effDodge * 2 * dodgeRating);
    const baseHit = (per * 2.0) + (effAtkSkill * 5 * atkRating) + (effDodge * 3 * dodgeRating);
    const baseDodge = (per * 2.5) + (effDodge * 4 * dodgeRating) + (effAtkSkill * 1);

    const ap = baseAp + weaponDmg;
    const dp = baseDp + totalDefense; 
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

function getSmartTrainCmd(cmd, cur, max) {
    const limit = max * 2;
    if (cur < max) return `${cmd} ${max - cur}`;
    if (cur < limit - 1) return `${cmd} ${limit - cur}`;
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
        
        if (room && room.allowSave) {
            updateData.savePoint = p.location;
            msg += " (重生點已更新至此處)";
        }
        
        updateData.attributes = p.attributes;
        updateData.skills = p.skills;
        updateData.skill_exp = p.skill_exp || {}; 
        updateData.inventory = p.inventory;
        updateData.money = p.money;
        updateData.equipment = p.equipment;
        updateData.enabled_skills = p.enabled_skills;
        updateData.family = p.family;
        updateData.sect = p.sect;
        
        await updatePlayer(u, updateData);
        UI.print(msg, "system");
    },

    quit: async (p, a, u) => {
        if (p.state === 'fighting') {
            UI.print("戰鬥中不能離開遊戲！請先解決眼前的對手。", "error");
            return;
        }
        
        UI.print("你決定暫時離開這個江湖，改日再來。", "system");
        UI.print("正在保存檔案...", "system");
        
        await updatePlayer(u, {
            location: p.location,
            attributes: p.attributes,
            skills: p.skills,
            skill_exp: p.skill_exp || {}, 
            inventory: p.inventory,
            money: p.money,
            equipment: p.equipment,
            combat: p.combat,
            state: 'normal',
            combatTarget: null,
            lastSaved: new Date().toISOString()
        });

        await signOut(auth);
    },

    // [優化] Score 顯示：包含食物飲水與詳細修為
    score: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        const s = getCombatStats(playerData); 

        const moneyStr = playerData.money || 0;
        const potential = playerData.combat?.potential || 0;
        const kills = playerData.combat?.kills || 0;
        const enforce = playerData.combat?.enforce || 0;

        const cmdSp = getSmartTrainCmd("respirate", attr.spiritual, attr.maxSpiritual);
        const cmdHp = getSmartTrainCmd("exercise", attr.force, attr.maxForce);
        const cmdMp = getSmartTrainCmd("meditate", attr.mana, attr.maxMana);

        const border = UI.txt("---------------------------------------------------", "#444");
        
        let html = `<div style="font-family: 'Courier New', monospace; line-height: 1.4; background: rgba(0,0,0,0.3); padding: 10px; border: 1px solid #333;">`;
        
        html += `<div style="text-align:center; color:#00ffff; margin-bottom:5px;">≡ ${playerData.name} (${playerData.id}) ≡</div>`;
        html += `${border}<br>`;
        
        // 第一行：基本資料
        html += `<span style="color:#aaa">門派：</span><span style="color:#fff; display:inline-block; width:100px;">${playerData.sect || "無"}</span>`;
        html += `<span style="color:#aaa">性別：</span><span style="color:#fff">${playerData.gender}</span><br>`;
        
        // 第二行：資源
        html += `<span style="color:#aaa">財產：</span><span style="color:#ffd700; display:inline-block; width:100px;">${moneyStr}</span>`;
        html += `<span style="color:#aaa">潛能：</span><span style="color:#ffff00">${potential}</span><br>`;

        // 第三行：生存狀態
        html += `<span style="color:#aaa">食物：</span><span style="color:#00ff00; display:inline-block; width:100px;">${attr.food}/${attr.maxFood}</span>`;
        html += `<span style="color:#aaa">飲水：</span><span style="color:#00bfff">${attr.water}/${attr.maxWater}</span><br>`;
        
        html += `${border}<br>`;

        // 第四行：屬性 (一行顯示)
        html += `<span style="color:#88bbcc">膂</span>:${UI.txt(attr.str,"#fff")} <span style="color:#88bbcc">根</span>:${UI.txt(attr.con,"#fff")} <span style="color:#88bbcc">悟</span>:${UI.txt(attr.int,"#fff")} <span style="color:#88bbcc">定</span>:${UI.txt(attr.per,"#fff")} <span style="color:#88bbcc">福</span>:${UI.txt(attr.kar,"#fff")} <span style="color:#88bbcc">靈</span>:${UI.txt(attr.cor,"#fff")}<br>`;
        
        html += `${border}<br>`;

        // 第五行：修練數值 (Grid) - [更新] 顯示上限與倍率
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">`;
        
        // 左欄
        html += `<div>`;
        html += `精：<span style="color:#ffd700">${attr.sp}/${attr.maxSp}</span><br>`;
        html += `氣：<span style="color:#ff5555">${attr.hp}/${attr.maxHp}</span><br>`;
        html += `神：<span style="color:#00bfff">${attr.mp}/${attr.maxMp}</span><br>`;
        html += `</div>`;

        // 右欄
        html += `<div>`;
        html += `靈力：<span style="color:#eee">${attr.spiritual}/${attr.maxSpiritual * 2}</span> <span style="color:#888; font-size:0.9em;">(+${attr.maxSpiritual})</span> ${UI.makeCmd("[運]", cmdSp, "cmd-btn")}<br>`;
        html += `內力：<span style="color:#eee">${attr.force}/${attr.maxForce * 2}</span> <span style="color:#888; font-size:0.9em;">(+${attr.maxForce})</span> ${UI.makeCmd("[運]", cmdHp, "cmd-btn")}<br>`;
        html += `法力：<span style="color:#eee">${attr.mana}/${attr.maxMana * 2}</span> <span style="color:#888; font-size:0.9em;">(+${attr.maxMana})</span> ${UI.makeCmd("[運]", cmdMp, "cmd-btn")}<br>`;
        html += `</div>`;
        
        html += `</div>`; 

        html += `${border}<br>`;
        
        // 第六行：戰鬥參數
        html += `攻擊：<span style="color:#fff; display:inline-block; width:40px;">${Math.floor(s.ap)}</span> `;
        html += `防禦：<span style="color:#fff; display:inline-block; width:40px;">${Math.floor(s.dp)}</span> `;
        html += `殺氣：<span style="color:#ff0000">${kills}</span><br>`;
        
        html += `命中：<span style="color:#fff; display:inline-block; width:40px;">${Math.floor(s.hit)}</span> `;
        html += `閃避：<span style="color:#fff; display:inline-block; width:40px;">${Math.floor(s.dodge)}</span> `;
        html += `加力：<span style="color:#ff9800">${enforce}</span><br>`;
        
        html += `</div>`;

        UI.print(html, 'normal', true);
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

    // [優化] Help 顯示：分類更清晰，補齊遺漏指令
    help: () => {
        const border = UI.txt("---------------------------------------------------", "#444");
        let html = `<div style="font-family: 'Courier New', monospace; background: rgba(0,0,0,0.3); padding: 10px; border: 1px solid #333;">`;
        html += `<div style="text-align:center; color:#00ffff; margin-bottom:5px;">≡ 江湖指南 ≡</div>`;
        html += `${border}<br>`;
        
        // 定義樣式
        const catStyle = "color:#ff9800; font-weight:bold; display:inline-block; width:60px;";
        const cmdStyle = "color:#ccc;";

        // 系統
        html += `<div style="margin-bottom:5px;"><span style="${catStyle}">[系統]</span> `;
        html += `<span style="${cmdStyle}">save, quit, recall, help, suicide</span></div>`;

        // 狀態
        html += `<div style="margin-bottom:5px;"><span style="${catStyle}">[狀態]</span> `;
        html += `<span style="${cmdStyle}">score, skills, inventory (i)</span></div>`;

        // 物品與裝備
        html += `<div style="margin-bottom:5px;"><span style="${catStyle}">[物品]</span> `;
        html += `<span style="${cmdStyle}">get, drop, give, eat, drink, list, buy, sell</span><br>`;
        html += `<span style="display:inline-block; width:60px;"></span> <span style="${cmdStyle}">wear, unwear, wield, unwield</span></div>`;

        // 戰鬥
        html += `<div style="margin-bottom:5px;"><span style="${catStyle}">[戰鬥]</span> `;
        html += `<span style="${cmdStyle}">kill (殺), fight (切磋)</span></div>`;

        // 武學
        html += `<div style="margin-bottom:5px;"><span style="${catStyle}">[武學]</span> `;
        html += `<span style="${cmdStyle}">apprentice (拜師), learn (學習), practice (練習), study (讀書)</span><br>`;
        html += `<span style="display:inline-block; width:60px;"></span> <span style="${cmdStyle}">enable (激發), unenable (取消激發)</span></div>`;

        // 修練
        html += `<div style="margin-bottom:5px;"><span style="${catStyle}">[修練]</span> `;
        html += `<span style="${cmdStyle}">exercise (運氣), respirate (運精), meditate (運神)</span><br>`;
        html += `<span style="display:inline-block; width:60px;"></span> <span style="${cmdStyle}">enforce (加力), autoforce (自動修練)</span></div>`;
        
        // 行動
        html += `<div style="margin-bottom:5px;"><span style="${catStyle}">[行動]</span> `;
        html += `<span style="${cmdStyle}">look (l), n, s, e, w, u, d</span></div>`;

        html += `${border}<br>`;
        html += `<div style="color:#888; font-size:12px;">提示：點擊介面按鈕可直接執行大部分指令。</div>`;
        html += `</div>`;

        UI.print(html, 'normal', true);
    }
};