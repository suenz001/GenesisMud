// src/systems/skill_system.js
import { UI } from "../ui.js";
import { SkillDB } from "../data/skills.js";
import { updatePlayer } from "./player.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js";
import { NPCDB } from "../data/npcs.js";

function getSkillLevelDesc(level) {
    let desc = "初學乍練";
    let color = "#aaa"; 
    if (level >= 500) { desc = "深不可測"; color = "#ff00ff"; }
    else if (level >= 400) { desc = "返璞歸真"; color = "#ff0000"; }
    else if (level >= 300) { desc = "出神入化"; color = "#ff8800"; }
    else if (level >= 200) { desc = "登峰造極"; color = "#ffff00"; }
    else if (level >= 150) { desc = "出類拔萃"; color = "#00ff00"; }
    else if (level >= 100) { desc = "爐火純青"; color = "#00ffff"; }
    else if (level >= 60) { desc = "融會貫通"; color = "#0088ff"; }
    else if (level >= 30) { desc = "駕輕就熟"; color = "#8888ff"; }
    else if (level >= 10) { desc = "略有小成"; color = "#ffffff"; }
    return UI.txt(desc, color);
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
    trainStat: async (playerData, userId, typeName, attrCur, attrMax, costAttr, costName) => {
        const attr = playerData.attributes;
        if (attr[costAttr] < 20) { UI.print(`你的${costName}不足，無法修練。`, "error"); return; }
    
        const maxVal = attr[attrMax];
        const curVal = attr[attrCur];
        const limit = maxVal * 2; 
    
        if (curVal >= limit) { UI.print(`你的${typeName}修為已達瓶頸，無法再累積了。`, "system"); return; }
    
        const cost = 10;
        const gain = 5 + Math.floor((playerData.skills?.force || 0) / 10); 
        
        let improved = false;
        
        if (curVal >= limit - 1) {
            const pot = playerData.combat?.potential || 0;
            if (pot < 1) { UI.print("你的潛能不足，無法突破瓶頸。", "error"); return; }
            attr[costAttr] -= 1; 
            playerData.combat.potential -= 1;
            attr[attrMax] += 1;
            attr[attrCur] = attr[attrMax]; 
            
            improved = true;
            let msg = `你運轉周天，只覺體內轟的一聲... ` + UI.txt(`你的${typeName}上限提升了！`, "#ffff00", true);
            UI.print(msg, "system", true);
        } else {
            attr[costAttr] -= cost;
            attr[attrCur] = Math.min(limit, curVal + gain);
            
            let msg = `你運轉周天，將${costName}轉化為${typeName} ... `;
            if (attr[attrCur] > maxVal) msg += `(${attr[attrCur]}/${maxVal} <span style="color:#00ff00">+${attr[attrCur] - maxVal}</span>)`;
            else msg += `(${attr[attrCur]}/${maxVal})`;
            UI.print(msg, "system", true);
        }
    
        UI.updateHUD(playerData);
    
        if (improved) {
            await updatePlayer(userId, { 
                [`attributes.${costAttr}`]: attr[costAttr],
                [`attributes.${attrCur}`]: attr[attrCur],
                [`attributes.${attrMax}`]: attr[attrMax],
                "combat.potential": playerData.combat.potential
            });
        } else {
            await updatePlayer(userId, { 
                [`attributes.${costAttr}`]: attr[costAttr],
                [`attributes.${attrCur}`]: attr[attrCur]
            });
        }
    },

    skills: (playerData) => {
        const skills = playerData.skills || {};
        const skillList = Object.entries(skills);
        if (skillList.length === 0) { UI.print("你目前什麼都不會。", "chat"); return; }
        
        let html = UI.titleLine(`${playerData.name} 的武學`);
        html += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap: 5px; align-items:center;">`;
        
        for (const [id, level] of skillList) {
            const info = SkillDB[id];
            if(id === 'parry') continue; 
            const name = info ? info.name : id;
            const desc = getSkillLevelDesc(level);
            let statusMark = "";
            
            if (playerData.enabled_skills) {
                for (const [slot, equippedId] of Object.entries(playerData.enabled_skills)) {
                    if (equippedId === id) statusMark = UI.txt(`[${slot}]`, "#00ff00");
                }
            }

            let btn = "";
            if (info && info.base) {
                const isEnabled = playerData.enabled_skills && playerData.enabled_skills[info.base] === id;
                btn = UI.makeCmd(isEnabled ? "[解除]" : "[激發]", isEnabled ? `unenable ${info.base}` : `enable ${info.base} ${id}`, "cmd-btn");
            }

            html += `<div style="color:#fff;">${name} <span style="color:#888; font-size:0.8em;">(${id})</span> ${statusMark}</div>`;
            html += `<div>${UI.txt(level+"級", "#00ffff")} <span style="font-size:0.8em;">${desc}</span></div>`;
            html += `<div>${btn}</div>`;
        }
        html += `</div>` + UI.titleLine("End");
        UI.print(html, 'chat', true);
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
            UI.print(msg, 'system', true); // === 修正：這裡本來是 system，建議加 true ===
            return;
        }

        const type = args[0]; 
        const skillId = args[1];

        if (!playerData.skills || !playerData.skills[skillId]) { UI.print("你不會這招。", "error"); return; }
        const skillInfo = SkillDB[skillId];
        
        // === [修正] 激發檢查：是否有基礎武學 ===
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
        if(a.length<3||a[1]!=='from'){UI.print("learn <skill> from <master>","error");return;} 
        const sid=a[0], mid=a[2]; 
        const npc=findNPCInRoom(p.location,mid); 
        if(!npc){UI.print("沒人","error");return;} 
        if(!p.family||p.family.masterId!==npc.id){UI.print("需拜師","error");return;} 
        if(!npc.skills[sid]){UI.print("他不會","chat");return;} 
        
        // 檢查 1: 不能超過師傅
        if((p.skills[sid]||0)>=npc.skills[sid]){UI.print("這招你已經學滿了，師父沒什麼好教你的了。","chat");return;} 
        
        const skillInfo = SkillDB[sid];

        // === [修正] 檢查 2: 基礎武學檢查 ===
        if (skillInfo && skillInfo.base) {
            const baseLvl = p.skills[skillInfo.base] || 0;
            if (baseLvl <= 0) {
                const baseName = SkillDB[skillInfo.base] ? SkillDB[skillInfo.base].name : skillInfo.base;
                UI.print(`你的${baseName}毫無根基，怎麼學得會這高深招式？`, "error");
                return;
            }
            // 檢查 3: 進階不能超過基礎
            const currentLvl = p.skills[sid] || 0;
            if (currentLvl >= baseLvl) {
                UI.print(`你的${baseName}火候不足，無法領悟更高深的${skillInfo.name}。`, "error");
                return;
            }
        }

        const spC=10+Math.floor((p.skills[sid]||0)/2), potC=5+Math.floor((p.skills[sid]||0)/5); 
        if(p.attributes.sp<=spC){UI.print("精不足","error");return;} 
        if((p.combat.potential||0)<potC){UI.print("潛能不足","error");return;} 
        
        p.attributes.sp-=spC; p.combat.potential-=potC; p.skills[sid]=(p.skills[sid]||0)+1; 
        UI.print(`學習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); 
        await updatePlayer(u,{"attributes.sp":p.attributes.sp,"combat.potential":p.combat.potential,"skills":p.skills}); 
    },
    
    practice: async (p,a,u) => { 
        if(a.length===0){UI.print("practice <skill>","error");return;} 
        const sid=a[0]; 
        if(!SkillDB[sid]){UI.print("沒這招","error");return;} 
        if(!(p.skills[sid])){UI.print("不會","error");return;} 
        
        // === [修正] 練習檢查：基礎武學 ===
        if (SkillDB[sid].base) {
            const baseLvl = p.skills[SkillDB[sid].base] || 0;
            if (p.skills[sid] >= baseLvl) {
                const baseName = SkillDB[SkillDB[sid].base] ? SkillDB[SkillDB[sid].base].name : SkillDB[sid].base;
                UI.print(`你的${baseName}火候不足，無法繼續提升${SkillDB[sid].name}。`, "error");
                return;
            }
        }

        const cost=10+Math.floor(p.skills[sid]/2); 
        if(p.attributes.hp<=cost){UI.print("氣不足","error");return;} 
        p.attributes.hp-=cost; p.skills[sid]++; 
        UI.print(`練習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); 
        await updatePlayer(u,{"attributes.hp":p.attributes.hp,"skills":p.skills}); 
    }
};