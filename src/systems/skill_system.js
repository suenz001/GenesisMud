// src/systems/skill_system.js
import { UI } from "../ui.js";
import { SkillDB, getSkillLevelDesc } from "../data/skills.js"; 
import { updatePlayer } from "./player.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js";
import { NPCDB } from "../data/npcs.js";

let autoForceInterval = null; 

// === 升級所需經驗值公式 (極速升級版) ===
function calculateMaxExp(level) {
    if (level < 150) {
        return Math.pow(level + 1, 2) * 5;
    } else {
        return Math.pow(level + 1, 3);
    }
}

function findNPCInRoom(roomId, npcNameOrId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;
    if (room.npcs.includes(npcNameOrId)) {
        const index = room.npcs.indexOf(npcNameOrId);
        const npcData = NPCDB[npcNameOrId];
        return { ...npcData, index: index };
    }
    for (let i = 0; i < room.npcs.length; i++) {
        const nid = room.npcs[i];
        const npc = NPCDB[nid];
        if (npc && npc.name === npcNameOrId) return { ...npc, index: i };
    }
    return null;
}

export const SkillSystem = {
    // === 自動修練內力 (Auto Force) ===
    autoForce: async (p, a, u) => {
        if (autoForceInterval || p.state === 'exercising') {
            if (autoForceInterval) clearInterval(autoForceInterval);
            autoForceInterval = null;
            p.state = 'normal'; 
            await updatePlayer(u, { state: 'normal' });
            UI.print("你停止了自動修練內力。", "system");
            return;
        }

        if (p.state === 'fighting') {
            UI.print("戰鬥中無法修練！", "error");
            return;
        }

        p.state = 'exercising';
        await updatePlayer(u, { state: 'exercising' });
        UI.print("你開始閉目養神，自動運轉內息... (再次輸入 autoforce 以解除)", "system");
        
        autoForceInterval = setInterval(async () => {
            if (p.state !== 'exercising') {
                clearInterval(autoForceInterval);
                autoForceInterval = null;
                UI.print("自動修練已被中斷。", "error");
                return;
            }

            const attr = p.attributes;
            const maxForce = attr.maxForce;
            const curForce = attr.force;
            const limit = maxForce * 2;

            if (attr.hp < 20) { return; }

            if (curForce < limit) {
                const needed = limit - curForce;
                const affordable = attr.hp - 10;
                if (affordable > 0) {
                    let amount = Math.min(needed, affordable, 100); 
                    await SkillSystem.trainStat(p, u, "內力", "force", "maxForce", "hp", "氣", [amount.toString()]);
                }
            } else {
                await SkillSystem.trainStat(p, u, "內力", "force", "maxForce", "hp", "氣", ["1"]);
            }
        }, 2000); 
    },

    // === 屬性修練 (Exercise/Respirate/Meditate) ===
    trainStat: async (playerData, userId, typeName, attrCur, attrMax, costAttr, costName, args) => {
        const attr = playerData.attributes;
        let cost = 10;

        if (args && args[0] === 'double') {
            const maxVal = attr[attrMax];
            const curVal = attr[attrCur];
            const limit = maxVal * 2;

            if (curVal >= limit) {
                UI.print(UI.txt(`你的${typeName}已經運轉至極限，無法再容納更多了。`, "#ffff00"), "system", true);
                return;
            }

            const needed = limit - curVal;
            const safeAvailable = Math.max(0, attr[costAttr] - 10);

            if (safeAvailable <= 0) {
                 UI.print(`你的${costName}不足，無法運氣。`, "error");
                 return;
            }

            cost = Math.min(needed, safeAvailable);
            if (cost < 1) cost = 10;

        } else if (args && args.length > 0) {
            const parsed = parseInt(args[0]);
            if (!isNaN(parsed) && parsed > 0) cost = parsed;
        }

        if (attr[costAttr] < cost) { 
            UI.print(`你的${costName}不足，無法修練。(需要 ${cost})`, "error"); 
            return; 
        }
    
        const maxVal = attr[attrMax];
        const curVal = attr[attrCur];
        const limit = maxVal * 2; 
    
        if (typeName === "內力") {
            const forceSkillLvl = playerData.skills.force || 0;
            const conBonus = playerData.attributes.con || 20;
            const maxCap = (forceSkillLvl + conBonus) * 10;

            if (maxVal >= maxCap) {
                UI.print(UI.txt(`你的基本內功修為限制了你的成就！`, "#ff5555"), "system", true);
                UI.print(`(內力上限已達 ${maxVal}，需提升基本內功等級或根骨才能突破)`, "system");
                
                if (autoForceInterval) {
                    clearInterval(autoForceInterval);
                    autoForceInterval = null;
                    playerData.state = 'normal';
                    await updatePlayer(userId, { state: 'normal' });
                    UI.print("已達瓶頸，自動修練停止。", "system");
                }
                return;
            }
        }

        const gain = cost + Math.floor((playerData.skills?.force || 0) / 10); 
        let improved = false;
        
        if (curVal >= limit - 1) {
            if (typeName !== "內力") {
                const pot = playerData.combat?.potential || 0;
                if (pot < 1) { UI.print("你的潛能不足，無法突破瓶頸。", "error"); return; }
                playerData.combat.potential -= 1;
            }
            
            attr[costAttr] -= cost; 
            attr[attrMax] += 1; 
            attr[attrCur] = attr[attrMax]; 
            
            improved = true;
            let msg = `你運轉周天，只覺體內轟的一聲... ` + UI.txt(`你的${typeName}上限提升了！`, "#ffff00", true);
            UI.print(msg, "system", true);

            if (typeName === "內力") {
                attr.maxHp = (attr.maxHp || 100) + 3;
                attr.hp += 3;
                UI.print(UI.txt(`受到真氣滋養，你的氣血上限也隨之提升了！`, "#00ff00"), "system", true);
            }

        } else {
            attr[costAttr] -= cost;
            const newVal = curVal + gain;
            attr[attrCur] = Math.min(limit, newVal);
            
            let msg = `你運轉周天，消耗 ${cost} 點${costName}，將其轉化為${typeName} ... `;
            if (attr[attrCur] > maxVal) {
                msg += `(${attr[attrCur]}/${maxVal} <span style="color:#00ff00">+${attr[attrCur] - maxVal}</span>)`;
                UI.print(msg + " 真氣在丹田內鼓盪，隨時可能突破。", "system", true);
            } else {
                msg += `(${attr[attrCur]}/${maxVal})`;
                UI.print(msg, "system");
            }
        }
    
        UI.updateHUD(playerData);
    
        let updateData = { 
            [`attributes.${costAttr}`]: attr[costAttr],
            [`attributes.${attrCur}`]: attr[attrCur]
        };

        if (improved) {
            updateData[`attributes.${attrMax}`] = attr[attrMax];
            updateData["combat.potential"] = playerData.combat.potential;
            if (typeName === "內力") {
                updateData["attributes.maxHp"] = attr.maxHp;
                updateData["attributes.hp"] = attr.hp;
            }
        }

        await updatePlayer(userId, updateData);
    },

    exert: async (playerData, args, userId) => {
        if (playerData.state === 'fighting') {
            UI.print("戰鬥中運功療傷太危險了！你無法分心。", "error");
            return;
        }
        
        if (playerData.state === 'exercising') {
            UI.print("你正在專心修練，無法分心運功。(輸入 autoforce 解除)", "error");
            return;
        }

        if (args.length === 0) {
            UI.print("指令格式: exert <regenerate|recover|refresh>", "error");
            return;
        }
        const type = args[0].toLowerCase();
        let targetCur, targetMax, name;

        if (type === 'recover') { targetCur = 'hp'; targetMax = 'maxHp'; name = '氣'; }
        else if (type === 'regenerate') { targetCur = 'sp'; targetMax = 'maxSp'; name = '精'; }
        else if (type === 'refresh') { targetCur = 'mp'; targetMax = 'maxMp'; name = '神'; }
        else { UI.print("未知的功能。請使用 recover(氣), regenerate(精), refresh(神)。", "error"); return; }

        const attr = playerData.attributes;
        if (attr[targetCur] >= attr[targetMax]) {
            UI.print(`你的${name}現在很充沛，不需要運功。`, "system");
            return;
        }

        const currentForce = attr.force;
        if (currentForce <= 0) {
            UI.print("你現在一點內力也沒有。", "error");
            return;
        }

        const forceLvl = playerData.skills.force || 0;
        const factor = 1 + (forceLvl / 50);

        const missing = attr[targetMax] - attr[targetCur];
        let cost = Math.ceil(missing / factor);

        let actualRecover = 0;
        let actualCost = 0;

        if (currentForce >= cost) {
            actualCost = cost;
            actualRecover = missing;
            attr.force -= actualCost;
            attr[targetCur] = attr[targetMax];
        } else {
            actualCost = currentForce;
            actualRecover = Math.floor(actualCost * factor);
            attr.force = 0;
            attr[targetCur] += actualRecover;
        }

        UI.print(`你運功${name === '氣' ? '療傷' : '提氣'}，消耗 ${actualCost} 點內力，恢復了 ${actualRecover} 點${name}。`, "system");
        
        UI.updateHUD(playerData);
        
        const updateData = {
            "attributes.force": attr.force,
            [`attributes.${targetCur}`]: attr[targetCur]
        };
        await updatePlayer(userId, updateData);
    },

    skills: (playerData) => {
        const skills = playerData.skills || {};
        const skillExps = playerData.skill_exp || {}; 
        
        const skillList = Object.entries(skills);
        if (skillList.length === 0) { UI.print("你目前什麼都不會。", "chat"); return; }
        
        // --- 美化版武學列表 ---
        let h = `<div style="background:rgba(20,20,30,0.9); padding:10px; border-radius:8px; border:1px solid #445;">`;
        h += `<div style="text-align:center; color:#00ffff; font-weight:bold; margin-bottom:10px; border-bottom:1px dashed #445; padding-bottom:5px;">
                ${playerData.name} 的武學修為
              </div>`;
        
        h += `<div style="display:grid; grid-template-columns: 1fr; gap: 8px;">`;
        
        for (const [id, level] of skillList) {
            const info = SkillDB[id];
            if(id === 'parry') continue; 
            const name = info ? info.name : id;
            const desc = getSkillLevelDesc(level);
            
            // 檢查激發狀態
            let isEnabled = false;
            let enabledSlot = "";
            if (playerData.enabled_skills) {
                for (const [slot, equippedId] of Object.entries(playerData.enabled_skills)) {
                    if (equippedId === id) {
                        isEnabled = true;
                        enabledSlot = slot; 
                    }
                }
            }

            // 操作按鈕
            let btn = "";
            if (info && info.base) {
                const isActive = playerData.enabled_skills && playerData.enabled_skills[info.base] === id;
                // 注意樣式：激發狀態下按鈕變色
                if (isActive) {
                    btn = UI.makeCmd("[解除]", `unenable ${info.base}`, "cmd-btn cmd-btn-buy");
                } else {
                    btn = UI.makeCmd("[激發]", `enable ${info.base} ${id}`, "cmd-btn");
                }
            }

            const curExp = skillExps[id] || 0;
            const maxExp = calculateMaxExp(level);
            // 經驗條計算
            const expPct = Math.min(100, Math.floor((curExp/maxExp)*100));
            const expBar = `<div style="height:2px; width:100%; background:#333; margin-top:3px;"><div style="width:${expPct}%; background:#00ff00; height:100%;"></div></div>`;

            // 卡片樣式
            const cardBg = isEnabled ? "rgba(0,50,0,0.4)" : "rgba(255,255,255,0.03)";
            const borderCol = isEnabled ? "#00aa00" : "#333";

            h += `<div style="background:${cardBg}; border:1px solid ${borderCol}; padding:8px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center;">
                            <span style="color:#fff; font-weight:bold; font-size:14px;">${name}</span>
                            <span style="color:#888; font-size:12px; margin-left:5px;">(${id})</span>
                            ${isEnabled ? `<span style="background:#006600; color:#fff; font-size:10px; padding:1px 4px; border-radius:2px; margin-left:5px;">激發: ${enabledSlot}</span>` : ""}
                        </div>
                        <div style="font-size:12px; margin-top:2px;">
                            <span style="color:#00ffff;">${level} 級</span> 
                            <span style="color:#aaa;">/ ${desc}</span>
                        </div>
                        ${expBar}
                    </div>
                    <div style="margin-left:10px;">
                        ${btn}
                    </div>
                  </div>`;
        }
        h += `</div>`; // End Grid
        h += `</div>`; // End Container
        UI.print(h, 'chat', true);
    },

    apprentice: async (playerData, args, userId) => {
        if (args.length === 0) { UI.print("你想拜誰為師？", "error"); return; }
        const npc = findNPCInRoom(playerData.location, args[0]);
        if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }
        if (!npc.family) { UI.print(`${npc.name} 說道：「我只是一介平民，不懂收徒。」`, "chat"); return; }
        if (playerData.family && playerData.family.masterId) { UI.print(`你已經有師父了，是 ${playerData.family.masterId}。`, "error"); return; }

        let msg = "";
        if (npc.id === 'gym_master') msg = `${npc.name} 哈哈大笑，拍了拍你的頭說道：「好！很有精神！今日我就收你為徒！」`;
        else msg = `${npc.name} 微微頷首，說道：「既然你有此誠意，我便收你為徒。」`;
        UI.print(msg, "chat");
        
        MessageSystem.broadcast(playerData.location, `${playerData.name} 恭恭敬敬地向 ${npc.name} 磕了三個響頭，拜入其門下。`);

        playerData.family = { masterId: npc.id, masterName: npc.name, sect: npc.family };
        playerData.sect = npc.family === 'common_gym' ? '飛龍武館' : npc.family;
        await updatePlayer(userId, { family: playerData.family, sect: playerData.sect });
    },

    enable: async (playerData, args, userId) => {
        if (!playerData.enabled_skills) playerData.enabled_skills = {};
        if (args.length < 2) {
            let msg = UI.titleLine("激發狀態");
            for (const [type, skillId] of Object.entries(playerData.enabled_skills)) {
                const sInfo = SkillDB[skillId];
                msg += `${UI.txt(type, "#00ffff")} : ${sInfo ? sInfo.name : skillId}\n`;
            }
            if (Object.keys(playerData.enabled_skills).length === 0) msg += "無\n";
            UI.print(msg, 'system', true); 
            return;
        }

        const type = args[0]; 
        const skillId = args[1];

        if (!playerData.skills || !playerData.skills[skillId]) { UI.print("你不會這招。", "error"); return; }
        const skillInfo = SkillDB[skillId];
        
        if (skillInfo.base) {
             const baseLvl = playerData.skills[skillInfo.base] || 0;
             if (baseLvl <= 0) {
                 const baseName = SkillDB[skillInfo.base] ? SkillDB[skillInfo.base].name : skillInfo.base;
                 UI.print(`你的${baseName}火候不足，無法激發${skillInfo.name}。`, "error");
                 return;
             }
        }

        if (skillInfo.base !== type) { UI.print("類型不符。", "error"); return; }

        if (playerData.enabled_skills[type] === skillId) {
            delete playerData.enabled_skills[type];
            UI.print(`已解除 ${type} 的激發。`, "system");
        } else {
            playerData.enabled_skills[type] = skillId;
            UI.print(`已將 ${type} 設定為 ${skillInfo.name}。`, "system");
        }

        await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
    },

    unenable: async (playerData, args, userId) => {
        if (args.length === 0) { UI.print("指令格式：unenable <類型>", "error"); return; }
        const type = args[0];
        if (!playerData.enabled_skills || !playerData.enabled_skills[type]) {
            UI.print(`你目前並沒有激發 ${type} 類型的武功。`, "error");
            return;
        }
        delete playerData.enabled_skills[type];
        UI.print(`你取消了 ${type} 的激發狀態。`, "system");
        await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
    },

    learn: async (p,a,u) => { 
        if(a.length<3||a[1]!=='from'){UI.print("指令格式：learn <技能ID> from <師父ID>","error");return;} 
        const sid=a[0], mid=a[2]; 
        const npc=findNPCInRoom(p.location,mid); 
        if(!npc){UI.print("這裡沒有這個人。","error");return;} 
        if(!p.family||p.family.masterId!==npc.id){UI.print("你必須先拜師才能向他請教。","error");return;} 
        if(!npc.skills[sid]){UI.print("師父並不會這招。","chat");return;} 
        
        const currentLvl = p.skills[sid] || 0;
        if(currentLvl >= npc.skills[sid]){UI.print("這招你已經學滿了，師父沒什麼好教你的了。","chat");return;} 
        
        const skillInfo = SkillDB[sid];

        if (skillInfo && skillInfo.base) {
            const baseLvl = p.skills[skillInfo.base] || 0;
            const baseName = SkillDB[skillInfo.base] ? SkillDB[skillInfo.base].name : skillInfo.base;
            
            if (baseLvl <= 0) {
                UI.print(`你的${baseName}毫無根基，怎麼學得會這高深招式？`, "error");
                return;
            }
            if (currentLvl >= baseLvl) {
                UI.print(`你的${baseName}火候不足，無法領悟更高深的${skillInfo.name}。`, "error");
                return;
            }
        }

        const spC = 5 + Math.floor(currentLvl / 5); 
        const potC = 1; 
        
        if(p.attributes.sp <= spC){UI.print("你現在精神不濟，無法專心聽講。(需要精: "+spC+")","error");return;} 
        if((p.combat.potential||0) < potC){UI.print("你的潛能不足，無法領悟其中的奧妙。(需要潛能: "+potC+")","error");return;} 
        
        p.attributes.sp -= spC; 
        p.combat.potential -= potC; 
        
        const int = p.attributes.int || 20;
        
        const rndMult = 5 + Math.random() * 5; 
        let gain = Math.floor((int * rndMult) + (currentLvl * 2));
        if (gain < 1) gain = 1;

        if (!p.skill_exp) p.skill_exp = {};
        if (!p.skill_exp[sid]) p.skill_exp[sid] = 0;

        p.skill_exp[sid] += gain;

        const maxExp = calculateMaxExp(currentLvl);
        let msg = "";

        if (p.skill_exp[sid] >= maxExp) {
            p.skills[sid] = currentLvl + 1;
            p.skill_exp[sid] -= maxExp; 
            msg = UI.txt(`你聽了${npc.name}的指導，頓悟了！${SkillDB[sid].name} 提升到了 ${p.skills[sid]} 級！`, "#00ff00", true);
        } else {
            msg = `你聽了${npc.name}的指導，對${SkillDB[sid].name}有了更深的了解。 (EXP +${gain})`;
        }
        
        UI.print(msg, "system", true); 
        
        await updatePlayer(u, {
            "attributes.sp": p.attributes.sp,
            "combat.potential": p.combat.potential,
            "skills": p.skills,
            "skill_exp": p.skill_exp 
        }); 
    },
    
    practice: async (p, a, u) => { 
        if(a.length === 0){ UI.print("指令格式：practice <基本武功> (例如 practice sword)", "error"); return; }
        const baseSkillId = a[0]; 
        
        if(!p.skills[baseSkillId]){ UI.print("你不會這項基本武功。", "error"); return; }
        
        let targetSkillId = baseSkillId;
        let isAdvanced = false;

        if (p.enabled_skills && p.enabled_skills[baseSkillId]) {
            targetSkillId = p.enabled_skills[baseSkillId];
            isAdvanced = true;
        }

        if (!p.skills[targetSkillId]) {
            if (isAdvanced) {
                UI.print(`你雖然激發了${targetSkillId}，但還沒學會，無法練習。`, "error");
                return;
            }
        }

        const skillName = SkillDB[targetSkillId] ? SkillDB[targetSkillId].name : targetSkillId;
        const currentLvl = p.skills[targetSkillId] || 0;
        const baseLvl = p.skills[baseSkillId] || 0;

        if (isAdvanced && currentLvl >= baseLvl) {
            const baseName = SkillDB[baseSkillId].name;
            UI.print(`你的${baseName}火候不足，無法繼續提升${skillName}。`, "error");
            return;
        }

        const cost = 20; 
        if (p.attributes.hp <= cost) { 
            UI.print("你氣息不順，需要休息一下。(需要氣: "+cost+")", "error"); 
            return; 
        }
        
        p.attributes.hp -= cost; 

        const int = p.attributes.int || 20;
        
        let gain = Math.floor((int * 2) + (baseLvl * 0.5));
        if (gain < 1) gain = 1;

        if (!p.skill_exp) p.skill_exp = {};
        if (!p.skill_exp[targetSkillId]) p.skill_exp[targetSkillId] = 0;

        p.skill_exp[targetSkillId] += gain;

        const maxExp = calculateMaxExp(currentLvl);
        let msg = "";

        if (p.skill_exp[targetSkillId] >= maxExp) {
            p.skills[targetSkillId] = currentLvl + 1;
            p.skill_exp[targetSkillId] -= maxExp; 
            msg = UI.txt(`你反覆練習${skillName}，終於融會貫通！等級提升到了 ${p.skills[targetSkillId]} 級！`, "#00ff00", true);
        } else {
            msg = `你練習${skillName}，獲得了 ${gain} 點經驗。 (${p.skill_exp[targetSkillId]}/${maxExp})`;
        }

        UI.print(msg, "system", true); 
        
        await updatePlayer(u, {
            "attributes.hp": p.attributes.hp,
            "skills": p.skills,
            "skill_exp": p.skill_exp
        }); 
    }
};