// src/systems/player.js
import { doc, updateDoc, deleteDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { SkillDB } from "../data/skills.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js";
import { ConditionSystem } from "./conditions.js";
import { EMOTES } from "./commands.js";
import { PerformDB } from "../data/performs.js";
import { SpellDB } from "../data/spells.js";

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

    // [新增] 狀態系統加成 (Condition System)
    const statsObj = { ap, dp, hit, dodge, baseAp, baseDp, baseHit, baseDodge };
    ConditionSystem.applyModifiers(entity, statsObj);

    // [新增] 安全性：合理性上限防護 (Anti-Cheat 傷害封頂)
    if (statsObj.ap > 9999) statsObj.ap = 9999;
    if (statsObj.dp > 9999) statsObj.dp = 9999;
    if (statsObj.hit > 9999) statsObj.hit = 9999;
    if (statsObj.dodge > 9999) statsObj.dodge = 9999;

    return { 
        ap: statsObj.ap, dp: statsObj.dp, hit: statsObj.hit, dodge: statsObj.dodge, 
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

    // [優化] Score 顯示：包含食物飲水
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

        // [新增] 第三行：生存狀態
        html += `<span style="color:#aaa">食物：</span><span style="color:#00ff00; display:inline-block; width:100px;">${attr.food}/${attr.maxFood}</span>`;
        html += `<span style="color:#aaa">飲水：</span><span style="color:#00bfff">${attr.water}/${attr.maxWater}</span><br>`;
        
        html += `${border}<br>`;

        // 第四行：屬性 (一行顯示)
        html += `<span style="color:#88bbcc">膂</span>:${UI.txt(attr.str,"#fff")} <span style="color:#88bbcc">根</span>:${UI.txt(attr.con,"#fff")} <span style="color:#88bbcc">悟</span>:${UI.txt(attr.int,"#fff")} <span style="color:#88bbcc">定</span>:${UI.txt(attr.per,"#fff")} <span style="color:#88bbcc">福</span>:${UI.txt(attr.kar,"#fff")} <span style="color:#88bbcc">靈</span>:${UI.txt(attr.cor,"#fff")}<br>`;
        
        html += `${border}<br>`;

        // 第五行：修練數值 (Grid)
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">`;
        
        // 左欄
        html += `<div>`;
        html += `精：<span style="color:#ffd700">${attr.sp}/${attr.maxSp}</span><br>`;
        html += `氣：<span style="color:#ff5555">${attr.hp}/${attr.maxHp}</span><br>`;
        html += `神：<span style="color:#00bfff">${attr.mp}/${attr.maxMp}</span><br>`;
        html += `</div>`;

        // 右欄
        html += `<div>`;
        html += `靈力：<span style="color:#eee">${attr.spiritual}/${attr.maxSpiritual}</span> ${UI.makeCmd("[運]", cmdSp, "cmd-btn")}<br>`;
        html += `內力：<span style="color:#eee">${attr.force}/${attr.maxForce}</span> ${UI.makeCmd("[運]", cmdHp, "cmd-btn")}<br>`;
        html += `法力：<span style="color:#eee">${attr.mana}/${attr.maxMana}</span> ${UI.makeCmd("[運]", cmdMp, "cmd-btn")}<br>`;
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

        html += `</div>`;

        UI.print(html, 'normal', true);
    },

    hp: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        const border = UI.txt("--------------------------------------------", "#444");
        
        let html = `<div style="font-family: 'Courier New', monospace; line-height: 1.4; background: rgba(0,0,0,0.3); padding: 5px 10px; border: 1px solid #333; display:inline-block;">`;
        html += `<div style="text-align:center; color:#00ffff; margin-bottom:3px;">≡ ${playerData.name} (${playerData.id}) ≡</div>`;
        html += `${border}<br>`;
        html += `精：<span style="color:#ffd700; display:inline-block; width:80px;">${attr.sp}/${attr.maxSp}</span> `;
        html += `氣：<span style="color:#ff5555; display:inline-block; width:80px;">${attr.hp}/${attr.maxHp}</span> `;
        html += `神：<span style="color:#00bfff">${attr.mp}/${attr.maxMp}</span><br>`;
        
        html += `食物：<span style="color:#00ff00; display:inline-block; width:65px;">${attr.food}/${attr.maxFood}</span> `;
        html += `飲水：<span style="color:#00bfff">${attr.water}/${attr.maxWater}</span><br>`;
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

    who: async (p, a, u) => {
        // 設定在線判定閾值為最近 5 分鐘
        const threshold = Date.now() - 300000; 
        
        let showDetailed = false;
        let groupBySect = false;

        const args = a.map(arg => arg.toLowerCase());
        if (args.includes("-l")) showDetailed = true;
        if (args.includes("-class")) groupBySect = true;

        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("lastActive", ">", threshold)); 
            const snaps = await getDocs(q);

            let onlinePlayers = [];
            snaps.forEach(doc => {
                const data = doc.data();
                if (data.id) onlinePlayers.push(data);
            });

            if (onlinePlayers.length === 0) {
                UI.print("江湖中目前空無一人。", "system");
                return;
            }

            onlinePlayers.sort((a,b) => {
                let sA = (a.sect && a.sect !== 'none') ? a.sect : "江湖浪人";
                let sB = (b.sect && b.sect !== 'none') ? b.sect : "江湖浪人";
                if(sA === "江湖浪人") sA = "龘"; // force bottom sort
                if(sB === "江湖浪人") sB = "龘"; // force bottom sort
                
                if (groupBySect) {
                    if (sA !== sB) return sA.localeCompare(sB, 'zh-TW');
                }
                const bHp = b.attributes?.maxHp || 0;
                const aHp = a.attributes?.maxHp || 0;
                return bHp - aHp;
            });

            const border = UI.txt("===========================================", "#444");
            let html = `<div style="font-family: 'Courier New', monospace; line-height: 1.4; background: rgba(0,0,0,0.3); padding: 10px; border: 1px solid #333;">`;
            html += `<div style="color:#00ffff; margin-bottom:5px;">≡ 目前在線玩家 (共 ${onlinePlayers.length} 人) ≡</div>`;
            html += `${border}<br>`;

            if (showDetailed || groupBySect) {
                let currentSect = null;

                for (const player of onlinePlayers) {
                    const sect = (player.sect && player.sect !== 'none') ? player.sect : "江湖浪人";
                    
                    if (groupBySect && currentSect !== sect) {
                        currentSect = sect;
                        html += `<div style="color:#ffff00; margin-top:8px;">═ 【${sect}】 ═</div>`;
                    }

                    const genderStr = player.gender === '男' ? '少俠' : (player.gender === '女' ? '俠女' : '高人');
                    const sectStr = groupBySect ? "" : `【<span style="color:#ffff00">${sect}</span>】 `;
                    const familyStr = player.family ? ` <span style="color:#aaa">&lt;${player.family}&gt;</span>` : "";

                    html += ` ${sectStr}<span style="color:#fff">${player.name}</span> <span style="color:#88bbcc">(${player.id})</span> ${genderStr}${familyStr}<br>`;
                }
            } else {
                const names = onlinePlayers.map(p => ` <span style="color:#fff">${p.name}</span> <span style="color:#88bbcc">(${p.id})</span>`);
                html += names.join(", ") + "<br>";
            }

            html += `${border}</div>`;
            UI.print(html, "system", true);

        } catch (e) {
            console.error("查閱玩家名單失敗", e);
            if (e.message.includes('index')) {
                UI.print("查閱名單功能正在設定中(等待資料庫建立索引)。請稍後再試。", "error");
            } else {
                UI.print("查閱在線玩家失敗。", "error");
            }
        }
    },

    // [優化] Help 顯示：分類更清晰，加入新手引導與表格化排版
    help: (p, a) => {
        const border = UI.txt("===================================================", "#444");
        const divider = UI.txt("---------------------------------------------------", "#333");

        if (a && a[0] && a[0].toLowerCase() === 'emote') {
            const emoteKeys = Object.keys(EMOTES);
            let html = `<div style="font-family: 'Courier New', monospace; background: rgba(0,0,0,0.4); padding: 15px; border: 1px solid #444; border-radius: 5px; line-height: 1.5;">`;
            html += `<div style="text-align:center; color:#ffd700; font-size: 16px; font-weight:bold; margin-bottom:10px;">≡ 動作表情指令大全 ≡</div>`;
            html += `${border}<br>`;
            html += `<div style="color:#aaa; margin-bottom:10px;">
                    所有的表情指令都可以 <b>單獨使用</b>，或是 <b>指定對象 (包含玩家 ID 或 NPC ID)</b>。<br>
                    例如輸入：<br>
                    <span style="color:#00ff00;">smile</span> (顯示：你微微一笑。)<br>
                    <span style="color:#00ff00;">smile waiter</span> (顯示：你對著店小二微微一笑。)<br>
                    甚至可以在頻道中使用：<br>
                    <span style="color:#00ff00;">chat smile waiter</span> (全頻道廣播：張大俠對著店小二微微一笑。)
                    </div>`;
            html += `${divider}<br>`;
            
            // Grid 顯示
            html += `<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">`;
            for (const key of emoteKeys) {
                html += `<div style="color:#88bbcc; padding:2px;">• ${key}</div>`;
            }
            html += `</div>`;
            html += `${border}</div>`;
            return UI.print(html, "system", true);
        }

        if (a && a[0] && a[0].toLowerCase() === 'cast') {
            const spells = Object.values(SpellDB);
            const typeMap = { 'single': '單體', 'aoe': '範國全體', 'control': '控制', 'dot': 'DoT燃燒' };
            const effectMap = { 'stun': '點穴', 'burn': '燃燒', 'bleed': '流血' };

            let html = `<div style="font-family: 'Courier New', monospace; background: rgba(0,0,0,0.4); padding: 15px; border: 1px solid #444; border-radius: 5px; line-height: 1.6;">`;
            html += `<div style="text-align:center; color:#cc88ff; font-size: 16px; font-weight:bold; margin-bottom:10px;">≡ 茂山派法術大全 ≡</div>`;
            html += `${border}<br>`;
            html += `<div style="color:#aaa; margin-bottom:10px;">
                <b>施法要求：</b>已加入茂山派（apprentice xuanling）且携有 spells 技能<br>
                <b>消耗：</b>法力（MP）——吃automeditate修練<br>
                <b>指令：</b><span style="color:#cc88ff;">cast &lt;法術ID&gt; [&lt;目標ID&gt;]</span><br>
                <b>對鬼怪加成：</b><span style="color:#ffdd00;">ghost類×2.0、undead類×1.8，高階法術可達×3.0</span>
                </div>`;
            html += `${divider}<br>`;

            html += `<table style="width:100%; border-collapse:collapse; font-size:13px;">`;
            html += `<tr style="color:#cc88ff; border-bottom:1px solid #333;">
                <th style="text-align:left; padding:4px 8px;">ID</th>
                <th style="text-align:left; padding:4px 8px;">名稱</th>
                <th style="text-align:center; padding:4px 8px;">MP消耗</th>
                <th style="text-align:center; padding:4px 8px;">類型</th>
                <th style="text-align:center; padding:4px 8px;">冷卻</th>
                <th style="text-align:left; padding:4px 8px;">對鬼天克</th>
                <th style="text-align:left; padding:4px 8px;">特效</th>
            </tr>`;

            for (const sp of spells) {
                const typeName = typeMap[sp.type] || sp.type;
                const cdSec = (sp.cooldown / 1000).toFixed(0);
                const bonusText = sp.bonusVs ? `${sp.bonusVs.join('/')} ×${sp.bonusMultiplier}` : '—';
                const effectText = sp.effect ? (effectMap[sp.effect] || sp.effect) + (sp.duration ? ` (${sp.duration}s)` : '') : '—';
                html += `<tr style="border-bottom:1px solid #222; color:#ccc;">
                    <td style="padding:4px 8px; color:#cc88ff;">${sp.id}</td>
                    <td style="padding:4px 8px; color:#ffd700; font-weight:bold">${sp.name}</td>
                    <td style="text-align:center; padding:4px 8px; color:#88aaff;">${sp.mpCost}</td>
                    <td style="text-align:center; padding:4px 8px;">${typeName}</td>
                    <td style="text-align:center; padding:4px 8px; color:#aaa;">${cdSec}s</td>
                    <td style="padding:4px 8px; color:#ffdd00;">${bonusText}</td>
                    <td style="padding:4px 8px; color:#ff8888;">${effectText}</td>
                </tr>`;
            }
            html += `</table>`;
            html += `${border}</div>`;
            return UI.print(html, "system", true);
        }

        if (a && a[0] && a[0].toLowerCase() === 'perform') {
            const performs = Object.values(PerformDB);
            const skillMap = {
                'iron-palm': '鐵砂掌', 'eight-trigram-blade': '八卦刀', 'arhat-stick': '羅漢棍',
                'swift-sword': '疾風劍法', 'shadow-dagger': '如影隨形刺', 'cloud-whip': '流雲鞭',
                'golden-dart': '金錢鏑', 'yang-spear': '楊家槍'
            };
            const effectMap = { 'stun': '點穴（動彈不得）', 'bleed': '流血', 'bind': '定身' };
            const typeMap = { 'single': '單體', 'aoe': '範圍全體', 'multi_hit': '連擊', 'control': '控制' };
            
            let html = `<div style="font-family: 'Courier New', monospace; background: rgba(0,0,0,0.4); padding: 15px; border: 1px solid #444; border-radius: 5px; line-height: 1.6;">`;
            html += `<div style="text-align:center; color:#ff8800; font-size: 16px; font-weight:bold; margin-bottom:10px;">≡ 武學絕招大全 ≡</div>`;
            html += `${border}<br>`;
            html += `<div style="color:#aaa; margin-bottom:10px;">
                <b>如何使用絕招：</b><br>
                <span style="color:#ffd700;">perform &lt;招式ID&gt;</span> — 不指定目標，自動攻擊戰鬥中的對手<br>
                <span style="color:#ffd700;">perform &lt;招式ID&gt; &lt;NPC ID&gt;</span> — 指定攻擊目標<br>
                <span style="color:#ffd700;">perform &lt;招式ID&gt; &lt;玩家ID&gt;</span> — 對戰鬥中的玩家使用（需先進入戰鬥）<br>
                <b>需求：</b> 已學並激發對應武功 + 需持對應兵器 + 內力足够
                </div>`;
            html += `${divider}<br>`;

            html += `<table style="width:100%; border-collapse:collapse; font-size:13px;">`;
            html += `<tr style="color:#ff9800; border-bottom:1px solid #333;">
                <th style="text-align:left; padding:4px 8px;">ID</th>
                <th style="text-align:left; padding:4px 8px;">招式名</th>
                <th style="text-align:left; padding:4px 8px;">需求武功</th>
                <th style="text-align:center; padding:4px 8px;">類型</th>
                <th style="text-align:center; padding:4px 8px;">內力消耗</th>
                <th style="text-align:center; padding:4px 8px;">冷卻</th>
                <th style="text-align:left; padding:4px 8px;">特效</th>
            </tr>`;

            for (const pd of performs) {
                const skillName = skillMap[pd.skill] || pd.skill;
                const typeName = typeMap[pd.type] || pd.type;
                const effectName = pd.effect ? (effectMap[pd.effect] || pd.effect) + ` (${pd.duration}s)` : '—';
                const hitsNote = pd.hits ? ` ×${pd.hits}` : '';
                const cdSec = (pd.cooldown / 1000).toFixed(0);
                html += `<tr style="border-bottom:1px solid #222; color:#ccc;">
                    <td style="padding:4px 8px; color:#88bbcc;">${pd.id}</td>
                    <td style="padding:4px 8px; color:#ffd700; font-weight:bold">${pd.name}</td>
                    <td style="padding:4px 8px; color:#88cc88;">${skillName}</td>
                    <td style="text-align:center; padding:4px 8px;">${typeName}${hitsNote}</td>
                    <td style="text-align:center; padding:4px 8px; color:#88aaff;">${pd.forceCost}</td>
                    <td style="text-align:center; padding:4px 8px; color:#aaa;">${cdSec}s</td>
                    <td style="padding:4px 8px; color:#ff8888;">${effectName}</td>
                </tr>`;
            }
            html += `</table>`;
            html += `${border}</div>`;
            return UI.print(html, "system", true);
        }

        let html = `<div style="font-family: 'Courier New', monospace; background: rgba(0,0,0,0.4); padding: 15px; border: 1px solid #444; border-radius: 5px; line-height: 1.5;">`;
        html += `<div style="text-align:center; color:#ffd700; font-size: 16px; font-weight:bold; margin-bottom:10px;">≡ GenesisMud 江湖指南 ≡</div>`;
        html += `${border}<br>`;
        
        // --- 新手引導 ---
        html += `<div style="color:#00ffff; font-weight:bold; margin-bottom:5px;">【 新手村生存守則 】</div>`;
        html += `<div style="color:#ccc; font-size:13px; margin-bottom:10px;">
                1. <b>填飽肚子：</b> 遊戲中會隨時間消耗食物與飲水，記得去<span style="color:#00ff00">客棧</span>向小二買包子和水袋。<br>
                2. <b>拜師學藝：</b> 揚州廣場北邊有<span style="color:#00ff00">武館</span>，可以向武館教頭拜師 (<code>apprentice</code>)。<br>
                3. <b>讀書識字：</b> 去客棧二樓找<span style="color:#00ff00">朱先生</span>學習識字 (<code>learn literate</code>)，將來才能看懂武功。<br>
                4. <b>提升實力：</b> 使用 <code>skills</code> 查看擁有的武學，透過打坐 (<code>exercise</code>) 提昇內力。<br>
                5. <b>安全存錢：</b> 揚州廣場東邊有<span style="color:#00ff00">宏源錢莊</span>，可以將多餘的錢存入 (<code>deposit</code>)。
                </div>`;
        html += `${divider}<br>`;

        const catStyle = "color:#ff9800; font-weight:bold; display:inline-block; width:70px;";
        const cmdStyle = "color:#88bbcc; display:inline-block; width:130px; margin-left: 20px;";
        const descStyle = "color:#888; font-size: 13px;";
        const renderRow = (cmd, desc) => `<span style="${cmdStyle}">${cmd}</span><span style="${descStyle}">${desc}</span><br>`;

        // --- 交流 ---
        html += `<div style="margin-bottom:8px;"><span style="${catStyle}">[交流]</span><br>`;
        html += renderRow("say <文字>", "在目前的房間發言");
        html += renderRow("chat <文字>", "在全伺服器公共頻道發言");
        html += renderRow("class <文字>", "在門派專屬頻道發言");
        html += renderRow("emote <動作>", "扮演動作，例如: emote 笑了笑");
        html += renderRow("help emote", "列出所有的內建 MUD 動作表情清單");
        html += `</div>`;

        // --- 資訊 ---
        html += `<div style="margin-bottom:8px;"><span style="${catStyle}">[查詢]</span><br>`;
        html += renderRow("who", "查看目前在線的玩家");
        html += renderRow("who -l", "查看詳細的在線玩家名單");
        html += renderRow("who -class", "依門派分門別類查看在線名單");
        html += renderRow("score（或 sc）", "查看自己的狀態與數值");
        html += renderRow("skills (sk)", "查看自己的技能清單");
        html += renderRow("inventory (i)", "查看自己的背包物品");
        html += renderRow("hp", "查看角色簡略狀態");
        html += `</div>`;

        // --- 核心系統 ---
        html += `<div style="margin-bottom:8px;"><span style="${catStyle}">[系統]</span><br>`;
        html += renderRow("look (l)", "觀察四周環境與人物");
        html += renderRow("score", "查看個人狀態、財產與屬性面板");
        html += renderRow("skills (sk)", "查看已學會的武功與等級");
        html += renderRow("save", "保存遊戲進度 (更新重生點)");
        html += renderRow("quit", "離開遊戲 (請先確保不在戰鬥中)");
        html += `</div>`;

        // --- 探索 ---
        html += `<div style="margin-bottom:8px;"><span style="${catStyle}">[探索]</span><br>`;
        html += renderRow("n/s/e/w", "往東南西北移動 (或直接點擊畫面出口)");
        html += renderRow("say [內容]", "在當前房間說話");
        html += renderRow("ask [對象]", "向特定 NPC 探聽消息情報");
        html += `</div>`;

        // --- 物品 ---
        html += `<div style="margin-bottom:8px;"><span style="${catStyle}">[物品]</span><br>`;
        html += renderRow("inventory(i)", "查看背包內容");
        html += renderRow("get / drop", "撿起地上的物品 / 丟棄物品");
        html += renderRow("wield / wear", "裝備武器 / 穿戴防具");
        html += renderRow("buy / sell", "向商人購買物品 / 將物品賣給商人");
        html += renderRow("eat / drink", "吃東西 / 喝水");
        html += `</div>`;

        // --- 武學 ---
        html += `<div style="margin-bottom:8px;"><span style="${catStyle}">[武學]</span><br>`;
        html += renderRow("learn", "向導師請教武功 (需消耗潛能)");
        html += renderRow("practice", "自行練習進階武功 (需消耗氣血)");
        html += renderRow("enable", "激發進階武功以替換基礎武功效果");
        html += renderRow("autoforce", "自動進行內力(氣)修練循環");
        html += renderRow("autorespirate", "自動進行靈力(精)修練循環");
        html += renderRow("automeditate", "自動進行法力(神)修練循環");
        html += `</div>`;

        // --- 戰鬥 ---
        html += `<div style="margin-bottom:8px;"><span style="${catStyle}">[戰鬥]</span><br>`;
        html += renderRow("fight / kill", "與人切磋武藝 / 下殺手戰鬥到底");
        html += renderRow("enforce", "注入內力強化攻擊威力 (例如 enforce 5)");
        html += renderRow("perform <招式ID>", "施展特殊武功絕招 (例如 perform burning)");
        html += renderRow("help perform", "列出所有可用絕招與詳細資訊");
        html += `</div>`;

        html += `${border}<br>`;
        html += `<div style="color:#55aa55; font-size:12px; text-align:center;">💡 提示：介面上的藍色與黃色文字通常可直接點擊來執行對應動作。</div>`;
        html += `</div>`;

        UI.print(html, 'normal', true);
    }
};