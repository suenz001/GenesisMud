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

    if (advancedLvl > baseLvl) {
        advancedLvl = baseLvl;
    }

    if (advancedLvl > 0) {
        return advancedLvl + Math.floor(baseLvl / 2);
    } else {
        return Math.floor(baseLvl / 2);
    }
}

// --- 計算戰鬥數值 (支援多部位防禦與屬性加成) ---
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
                if (effectiveAttr[key] !== undefined) {
                    effectiveAttr[key] += val;
                }
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

// 輔助：繪製進度條 HTML
function drawBar(label, current, max, colorStart, colorEnd, cmd = null) {
    const pct = Math.min(100, Math.max(0, (current / max) * 100));
    const barStyle = `width:${pct}%; background: linear-gradient(90deg, ${colorStart}, ${colorEnd}); height:100%; border-radius:2px;`;
    
    let btnHtml = "";
    if (cmd) {
        btnHtml = `<span style="float:right; cursor:pointer; color:#0ff; font-size:10px; margin-left:5px;" data-cmd="${cmd}">[修練]</span>`;
    }

    return `
    <div style="margin-bottom: 4px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:#aaa; margin-bottom:1px;">
            <span>${label}</span>
            <span>${current} / ${max} ${btnHtml}</span>
        </div>
        <div style="width:100%; height:6px; background:#333; border-radius:2px;">
            <div style="${barStyle}"></div>
        </div>
    </div>`;
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

    score: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        const s = getCombatStats(playerData); 

        const moneyStr = UI.formatMoney(playerData.money || 0);
        const potential = playerData.combat?.potential || 0;
        const kills = playerData.combat?.kills || 0;
        const enforce = playerData.combat?.enforce || 0;
        
        const showStat = (total, equip) => {
            if (equip > 0) return `<span style="color:#fff">${Math.floor(total)}</span> <span style="color:#00ff00; font-size:0.9em;">(+${equip})</span>`;
            return `<span style="color:#fff">${Math.floor(total)}</span>`;
        };

        const cmdSp = getSmartTrainCmd("respirate", attr.spiritual, attr.maxSpiritual);
        const cmdHp = getSmartTrainCmd("exercise", attr.force, attr.maxForce);
        const cmdMp = getSmartTrainCmd("meditate", attr.mana, attr.maxMana);

        // --- 開始構建美化版 HTML ---
        let h = "";
        h += `<div style="background: rgba(20,20,30,0.95); border: 1px solid #556; border-radius: 8px; padding: 15px; margin: 10px 0; box-shadow: 0 0 15px rgba(0,0,0,0.5);">`;
        
        // 1. 頭像與基本資料
        h += `<div style="display:flex; align-items:flex-start; margin-bottom: 15px; border-bottom: 1px dashed #445; padding-bottom: 10px;">`;
            // 左側：大頭貼 (Placeholder)
            h += `<div style="width: 60px; height: 60px; background: #222; border: 1px solid #444; border-radius: 4px; display:flex; justify-content:center; align-items:center; margin-right: 15px; color:#555; font-size: 24px;">
                    <i class="fas fa-user-ninja"></i>
                  </div>`;
            // 右側：基本資料
            h += `<div style="flex:1;">
                    <div style="font-size: 18px; color: #ffcc00; font-weight: bold; margin-bottom: 5px;">${playerData.name} <span style="font-size:12px; color:#888;">(${playerData.gender})</span></div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 13px;">
                        <div>${UI.attrLine("門派", playerData.sect || "無門無派")}</div>
                        <div>${UI.attrLine("殺氣", UI.txt(kills, "#ff5555"))}</div>
                        <div>${UI.attrLine("潛能", UI.txt(potential, "#ffff00", true))}</div>
                        <div>${UI.attrLine("財產", moneyStr)}</div>
                    </div>
                  </div>`;
        h += `</div>`;

        // 2. 天賦屬性 (Grid)
        h += `<div style="margin-bottom: 15px;">
                <div style="color: #33ccff; font-weight:bold; font-size:14px; margin-bottom:5px; border-left: 3px solid #33ccff; padding-left: 6px;">天賦屬性</div>
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 5px; background: #1a1a20; padding: 8px; border-radius: 4px;">
                    <div style="text-align:center;"><div style="color:#889;">膂力</div><div style="color:#eee; font-weight:bold;">${attr.str}</div></div>
                    <div style="text-align:center;"><div style="color:#889;">根骨</div><div style="color:#eee; font-weight:bold;">${attr.con}</div></div>
                    <div style="text-align:center;"><div style="color:#889;">悟性</div><div style="color:#eee; font-weight:bold;">${attr.int}</div></div>
                    <div style="text-align:center;"><div style="color:#889;">身法</div><div style="color:#eee; font-weight:bold;">${attr.per}</div></div>
                    <div style="text-align:center;"><div style="color:#889;">福緣</div><div style="color:#eee; font-weight:bold;">${attr.kar}</div></div>
                    <div style="text-align:center;"><div style="color:#889;">靈性</div><div style="color:#eee; font-weight:bold;">${attr.cor}</div></div>
                    <div style="text-align:center;"><div style="color:#889;">食物</div><div style="color:#eee;">${Math.floor((attr.food/attr.maxFood)*100)}%</div></div>
                    <div style="text-align:center;"><div style="color:#889;">飲水</div><div style="color:#eee;">${Math.floor((attr.water/attr.maxWater)*100)}%</div></div>
                </div>
              </div>`;

        // 3. 身體狀態 (Bars)
        h += `<div style="margin-bottom: 15px;">
                <div style="color: #ff5555; font-weight:bold; font-size:14px; margin-bottom:5px; border-left: 3px solid #ff5555; padding-left: 6px;">修練狀態</div>
                <div style="background: #1a1a20; padding: 10px; border-radius: 4px;">
                    ${drawBar("精 (SP) / 靈力", attr.sp, attr.maxSp, "#aa8800", "#ffd700", cmdSp)}
                    ${drawBar("氣 (HP) / 內力", attr.hp, attr.maxHp, "#880000", "#ff4444", cmdHp)}
                    ${drawBar("神 (MP) / 法力", attr.mp, attr.maxMp, "#000088", "#4444ff", cmdMp)}
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-top:8px; font-size:12px; text-align:center; color:#ccc;">
                        <div style="background:#222; padding:2px; border-radius:2px;">靈力: <span style="color:#ffd700">${attr.spiritual}/${attr.maxSpiritual}</span></div>
                        <div style="background:#222; padding:2px; border-radius:2px;">內力: <span style="color:#ff5555">${attr.force}/${attr.maxForce}</span></div>
                        <div style="background:#222; padding:2px; border-radius:2px;">法力: <span style="color:#4444ff">${attr.mana}/${attr.maxMana}</span></div>
                    </div>
                </div>
              </div>`;

        // 4. 戰鬥參數
        h += `<div>
                <div style="color: #00ff00; font-weight:bold; font-size:14px; margin-bottom:5px; border-left: 3px solid #00ff00; padding-left: 6px;">戰鬥參數</div>
                <div style="background: #1a1a20; padding: 10px; border-radius: 4px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size:13px;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:2px;">
                            <span style="color:#aaa;">攻擊力 (AP)</span> ${showStat(s.ap, s.equipAp)}
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:2px;">
                            <span style="color:#aaa;">防禦力 (DP)</span> ${showStat(s.dp, s.equipDp)}
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:2px;">
                            <span style="color:#aaa;">命中率 (Hit)</span> ${showStat(s.hit, s.equipHit)}
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:2px;">
                            <span style="color:#aaa;">閃避率 (Dodge)</span> ${showStat(s.dodge, 0)}
                        </div>
                    </div>
                    <div style="margin-top:8px; font-size:13px; text-align:right;">
                        <span style="color:#aaa;">內力加持 (Enforce):</span> <span style="color:${enforce>0?'#ff9800':'#666'}; font-weight:bold;">${enforce} 成</span>
                    </div>
                </div>
              </div>`;

        h += `</div>`; // End container
        
        UI.print(h, 'chat', true);
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
        msg += UI.txt(" 修練指令：", "#ffff00") + "exercise, respirate, meditate, enforce, autoforce\n";
        msg += UI.txt(" 戰鬥指令：", "#ff0000") + "kill (殺), fight (切磋)\n";
        msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
        msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy, sell\n";
        msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
        UI.print(msg, 'normal', true);
    }
};