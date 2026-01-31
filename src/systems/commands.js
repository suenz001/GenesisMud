// src/systems/commands.js
import { doc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 
import { MessageSystem } from "./messages.js"; 
import { SkillDB } from "../data/skills.js";

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

// --- 輔助函式 ---

// 通用修練邏輯
// typeName: "內力", attrCur: "force", attrMax: "maxForce", costAttr: "hp", costName: "氣"
async function trainStat(playerData, userId, typeName, attrCur, attrMax, costAttr, costName) {
    const attr = playerData.attributes;
    
    // 1. 檢查消耗
    if (attr[costAttr] < 20) {
        UI.print(`你的${costName}不足，無法修練。`, "error");
        return;
    }

    const maxVal = attr[attrMax];
    const curVal = attr[attrCur];
    const limit = maxVal * 2; // 可儲備至雙倍

    // 2. 檢查是否已達極限 (2倍)
    if (curVal >= limit) {
        UI.print(`你的${typeName}修為已達瓶頸，無法再累積了。`, "system");
        return;
    }

    // 3. 執行修練
    const cost = 10;
    const gain = 5 + Math.floor((playerData.skills?.force || 0) / 10); 
    
    attr[costAttr] -= cost;
    attr[attrCur] = Math.min(limit, curVal + gain);

    let msg = `你運轉周天，將${costName}轉化為${typeName} ... `;
    
    // 4. 突破上限邏輯
    let improved = false;
    if (attr[attrCur] > maxVal) {
        const pot = playerData.combat?.potential || 0;
        if (pot > 0) {
            playerData.combat.potential--;
            attr[attrMax]++; // 提升上限
            improved = true;
            msg += UI.txt(`你的${typeName}上限提升了！`, "#ffff00", true);
        }
    }

    UI.print(msg, "system");
    UI.print(`(${typeName}: ${attr[attrCur]}/${attr[attrMax]})`, "chat");

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
}

function getLevel(character) {
    const skills = character.skills || {};
    let maxMartial = 0, maxForce = 0;
    for (const [sid, lvl] of Object.entries(skills)) {
        const skillInfo = SkillDB[sid];
        if (skillInfo && skillInfo.base) {
            if (skillInfo.type === 'martial' && lvl > maxMartial) maxMartial = lvl;
            if (skillInfo.type === 'force' && lvl > maxForce) maxForce = lvl;
        }
    }
    return maxMartial + maxForce;
}

function getSkillLevelDesc(level) {
    let desc = "";
    let color = "#fff";
    if (level < 10) { desc = "初學乍練"; color = "#aaa"; }
    else if (level < 30) { desc = "略有小成"; color = "#88ff88"; }
    else if (level < 60) { desc = "駕輕就熟"; color = "#00ffff"; }
    else if (level < 100) { desc = "融會貫通"; color = "#0088ff"; }
    else if (level < 150) { desc = "爐火純青"; color = "#ffff00"; }
    else if (level < 200) { desc = "出類拔萃"; color = "#ff8800"; }
    else if (level < 300) { desc = "登峰造極"; color = "#ff0000"; }
    else { desc = "出神入化"; color = "#ff00ff"; }
    return UI.txt(desc, color);
}

async function updatePlayer(userId, data) {
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, data);
        return true;
    } catch (e) { console.error("更新失敗", e); return false; }
}

async function updateInventory(playerData, userId) {
    return await updatePlayer(userId, { inventory: playerData.inventory });
}

async function consumeItem(playerData, userId, itemId, amount = 1) {
    const inventory = playerData.inventory || [];
    const itemIndex = inventory.findIndex(i => i.id === itemId || i.name === itemId);
    if (itemIndex === -1) { UI.print(`你身上沒有 ${itemId} 這樣東西。`, "error"); return false; }
    const item = inventory[itemIndex];
    if (item.count > amount) item.count -= amount; else inventory.splice(itemIndex, 1);
    return await updateInventory(playerData, userId);
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

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = UI.titleLine("江湖指南");
            msg += UI.txt(" 基本指令：", "#00ffff") + "score, skills, inventory (i)\n";
            msg += UI.txt(" 武學指令：", "#ff5555") + "apprentice, learn, enable, practice\n";
            msg += UI.txt(" 修練指令：", "#ffff00") + "exercise (運氣), respirate (運精), meditate (運神)\n";
            msg += UI.txt(" 戰鬥指令：", "#ff0000") + "kill (下殺手), fight (切磋)\n";
            msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
            msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy\n";
            msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
            UI.print(msg, 'normal', true);
        }
    },

    // --- 運氣 (Exercise) - 氣 -> 內力 ---
    'exercise': {
        description: '運氣練內力 (hp -> force)',
        execute: async (playerData, args, userId) => {
            await trainStat(playerData, userId, "內力", "force", "maxForce", "hp", "氣");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 盤膝坐下，閉目運氣。`);
        }
    },

    // --- 運精 (Respirate) - 精 -> 靈力 ---
    'respirate': {
        description: '運精練靈力 (sp -> spiritual)',
        execute: async (playerData, args, userId) => {
            await trainStat(playerData, userId, "靈力", "spiritual", "maxSpiritual", "sp", "精");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 閉目吐納，神色莊嚴。`);
        }
    },

    // --- 運神 (Meditate) - 神 -> 法力 ---
    'meditate': {
        description: '運神練法力 (mp -> mana)',
        execute: async (playerData, args, userId) => {
            await trainStat(playerData, userId, "法力", "mana", "maxMana", "mp", "神");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 閉上雙眼，進入冥想。`);
        }
    },

    // --- 殺敵 (Kill) - 完整戰鬥描述與判定 ---
    'kill': {
        description: '下殺手',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你想殺誰？", "error"); return; }
            const room = MapSystem.getRoom(playerData.location);
            if (room.safe) { UI.print("這裡是安全區。", "error"); return; }
            
            const targetId = args[0];
            const npc = findNPCInRoom(playerData.location, targetId);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            // --- 決定使用的武功 ---
            const skills = playerData.skills || {};
            const enabled = playerData.enabled_skills || {};
            
            // 檢查武器 (equipment.weapon 儲存的是物品ID)
            let weaponItem = null;
            if (playerData.equipment && playerData.equipment.weapon) {
                weaponItem = ItemDB[playerData.equipment.weapon];
            }

            // 決定類型：有武器用 sword，沒武器用 unarmed
            let skillType = weaponItem ? 'sword' : 'unarmed';
            
            // 取得實際使用的技能 ID (激發的 > 基礎的)
            let activeSkillId = enabled[skillType] || skillType;
            let skillInfo = SkillDB[activeSkillId];

            // 獲取招式
            let action = { msg: "$P對$N發起攻擊。", damage: 10 };
            if (skillInfo && skillInfo.actions && skillInfo.actions.length > 0) {
                action = skillInfo.actions[Math.floor(Math.random() * skillInfo.actions.length)];
            }

            // 替換變數
            let msg = action.msg
                .replace(/\$P/g, playerData.name)
                .replace(/\$N/g, npc.name)
                .replace(/\$w/g, weaponItem ? weaponItem.name : "雙手");

            // 計算傷害
            const skillLvl = skills[activeSkillId] || 0;
            // 簡單傷害公式：基礎傷害 + 技能等級/2 + 隨機
            const dmg = Math.floor(action.damage + (skillLvl * 0.5) + (Math.random() * 10));

            // 顯示戰鬥訊息
            UI.print(UI.txt(msg, "#ffff00"), "system");
            UI.print(`(造成了 ${dmg} 點傷害)`, "chat");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 對 ${npc.name} 下了毒手！`);

            // --- 結算 (簡化：一擊必殺) ---
            UI.print(`經過一番激戰，${npc.name} 慘叫一聲，倒在血泊中。`, "system");

            // 潛能獎勵
            const playerLvl = getLevel(playerData);
            const npcLvl = getLevel(npc);
            let potGain = 100 + ((npcLvl - playerLvl) * 10);
            if (potGain < 10) potGain = 10;

            if (!playerData.combat) playerData.combat = { potential: 0, kills: 0 };
            playerData.combat.potential = (playerData.combat.potential || 0) + potGain;
            
            // 增加殺氣
            playerData.combat.kills = (playerData.combat.kills || 0) + 1;

            UI.print(UI.txt(`戰鬥勝利！獲得 ${potGain} 點潛能。`, "#00ff00", true), "system", true);

            // 掉落
            if (npc.drops) {
                for (const drop of npc.drops) {
                    if (Math.random() <= drop.rate) {
                        const itemInfo = ItemDB[drop.id];
                        if(itemInfo) {
                            await addDoc(collection(db, "room_items"), {
                                roomId: playerData.location, itemId: drop.id, name: itemInfo.name, droppedBy: "SYSTEM", timestamp: new Date().toISOString()
                            });
                            UI.print(`${npc.name} 掉出了 ${itemInfo.name}。`, "system");
                        }
                    }
                }
            }

            // 記錄重生
            try {
                await addDoc(collection(db, "dead_npcs"), {
                    roomId: playerData.location, npcId: npc.id, index: npc.index, respawnTime: Date.now() + 300000
                });
            } catch (e) { console.error(e); }

            await updatePlayer(userId, { 
                "combat.potential": playerData.combat.potential,
                "combat.kills": playerData.combat.kills 
            });
            MapSystem.look(playerData);
        }
    },

    // --- 狀態 (Score) - 加入激發加成顯示與修練快捷鍵 ---
    'score': {
        description: '查看屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const skills = playerData.skills || {};
            const enabled = playerData.enabled_skills || {};
            const combat = playerData.combat || {};
            
            // 取得有效技能等級
            const getEffLvl = (type) => {
                const enabledSkill = enabled[type];
                if (enabledSkill && skills[enabledSkill]) return skills[enabledSkill];
                return skills[type] || 0;
            };

            const effUnarmed = getEffLvl('unarmed');
            const effDodge = getEffLvl('dodge');
            const effParry = getEffLvl('parry');
            const effSword = getEffLvl('sword'); 

            // 判斷武器 (假設 weapon 是 ID)
            const hasWeapon = playerData.equipment && playerData.equipment.weapon;
            let activeAtkSkill = hasWeapon ? effSword : effUnarmed;

            // 計算戰鬥數值
            const atk = (attr.str * 10) + activeAtkSkill;
            const def = (attr.con * 10) + effParry;
            const dodge = (attr.dex * 10) + effDodge;
            const parry = (attr.str * 5) + (attr.con * 5) + (effParry * 2);
            const hitRate = (attr.dex * 10) + (activeAtkSkill * 2);

            const moneyStr = UI.formatMoney(playerData.money || 0);
            const potential = combat.potential || 0;
            const kills = combat.kills || 0;

            let html = UI.titleLine(`${playerData.name} 的狀態`);
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("性別", playerData.gender)}</div><div>${UI.attrLine("門派", playerData.sect || "無")}</div>`;
            html += `<div>${UI.attrLine("財產", moneyStr)}</div>`;
            html += `<div>${UI.attrLine("潛能", UI.txt(potential, "#ffff00", true))}</div>`;
            html += `</div><br>`;

            // 精氣神與修練按鈕
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

            // 飲食與殺氣
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("食物", attr.food + "/" + attr.maxFood)}</div>`;
            html += `<div>${UI.attrLine("飲水", attr.water + "/" + attr.maxWater)}</div>`;
            html += `</div><br>`;

            html += UI.txt("【 戰鬥 】", "#00ff00") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("攻擊", atk)}</div><div>${UI.attrLine("防禦", def)}</div>`;
            html += `<div>${UI.attrLine("命中", hitRate)}</div><div>${UI.attrLine("閃避", dodge)}</div>`;
            html += `<div>${UI.attrLine("招架", parry)}</div><div>${UI.attrLine("殺氣", UI.txt(kills, "#ff0000"))}</div>`;
            html += `</div>` + UI.titleLine("End");
            UI.print(html, 'chat', true);
        }
    },

    // --- 技能 (Skills) - 增加激發按鈕 ---
    'skills': {
        description: '查看技能',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);
            if (skillList.length === 0) { UI.print("你目前什麼都不會。", "chat"); return; }
            
            let html = UI.titleLine(`${playerData.name} 的武學`);
            html += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap: 5px; align-items:center;">`;
            
            for (const [id, level] of skillList) {
                const info = SkillDB[id];
                const name = info ? info.name : id;
                const desc = getSkillLevelDesc(level);
                
                // 檢查是否已激發
                let statusMark = "";
                if (playerData.enabled_skills) {
                    for (const [slot, equippedId] of Object.entries(playerData.enabled_skills)) {
                        if (equippedId === id) statusMark = UI.txt(`[${slot}]`, "#00ff00");
                    }
                }

                // 激發按鈕 (如果是進階武功)
                let btn = "";
                if (info && info.base) {
                    btn = UI.makeCmd("[激發]", `enable ${info.base} ${id}`, "cmd-btn");
                }

                html += `<div style="color:#fff;">${name} <span style="color:#888; font-size:0.8em;">(${id})</span> ${statusMark}</div>`;
                html += `<div>${UI.txt(level+"級", "#00ffff")}</div>`;
                html += `<div>${btn}</div>`;
            }
            html += `</div>` + UI.titleLine("End");
            UI.print(html, 'chat', true);
        }
    },

    // --- 背包 (Inventory) - 確保吃喝按鈕 ---
    'inventory': {
        description: '背包',
        execute: (playerData) => {
            const items = playerData.inventory || [];
            const moneyStr = UI.formatMoney(playerData.money || 0);
            let html = UI.titleLine(`${playerData.name} 的背包`);
            html += `<div>${UI.attrLine("財產", moneyStr)}</div><br>`;
            
            if (items.length === 0) {
                html += UI.txt("目前身上空空如也。<br>", "#888");
            } else {
                items.forEach(item => {
                    const itemData = ItemDB[item.id];
                    let actions = "";
                    
                    if (itemData) {
                        if (itemData.type === 'food') actions += UI.makeCmd("[吃]", `eat ${item.id}`, "cmd-btn");
                        if (itemData.type === 'drink') actions += UI.makeCmd("[喝]", `drink ${item.id}`, "cmd-btn");
                    }
                    actions += UI.makeCmd("[丟]", `drop ${item.id}`, "cmd-btn");
                    actions += UI.makeCmd("[看]", `look ${item.id}`, "cmd-btn");

                    html += `<div>${UI.txt(item.name, "#fff")} x${item.count} ${actions}</div>`;
                });
            }
            html += "<br>" + UI.titleLine("End");
            UI.print(html, 'chat', true);
        }
    },

    // --- 其他指令 (保持不變) ---
    'i': { description: 'i', execute: (p)=>commandRegistry['inventory'].execute(p) },
    'sk': { description: 'sk', execute: (p)=>commandRegistry['skills'].execute(p) },
    'enable': { description: '激發', execute: async (p, a, u) => { if(!p.enabled_skills) p.enabled_skills={}; if(a.length<2){let m=UI.titleLine("激發"); for(const[t,s]of Object.entries(p.enabled_skills)){const i=SkillDB[s];m+=`${t}: ${i?i.name:s}\n`;} if(Object.keys(p.enabled_skills).length===0)m+="無\n"; UI.print(m,"system"); return;} const t=a[0],s=a[1]; if(!p.skills[s]){UI.print("不會","error");return;} const info=SkillDB[s]; if(info.base!==t && !(t==='parry'&&info.type==='martial')){UI.print("類型不符","error");return;} p.enabled_skills[t]=s; UI.print("已激發。","system"); await updatePlayer(u, {enabled_skills: p.enabled_skills}); } },
    'learn': { description: '學藝', execute: async (p,a,u)=>{ if(a.length<3||a[1]!=='from'){UI.print("learn <skill> from <master>","error");return;} const sid=a[0], mid=a[2]; const npc=findNPCInRoom(p.location,mid); if(!npc){UI.print("沒人","error");return;} if(!p.family||p.family.masterId!==npc.id){UI.print("需拜師","error");return;} if(!npc.skills[sid]){UI.print("他不會","chat");return;} if((p.skills[sid]||0)>=npc.skills[sid]){UI.print("學滿了","chat");return;} const spC=10+Math.floor((p.skills[sid]||0)/2), potC=5+Math.floor((p.skills[sid]||0)/5); if(p.attributes.sp<=spC){UI.print("精不足","error");return;} if((p.combat.potential||0)<potC){UI.print("潛能不足","error");return;} p.attributes.sp-=spC; p.combat.potential-=potC; p.skills[sid]=(p.skills[sid]||0)+1; UI.print(`學習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); await updatePlayer(u,{"attributes.sp":p.attributes.sp,"combat.potential":p.combat.potential,"skills":p.skills}); } },
    'practice': { description: '練習', execute: async (p,a,u)=>{ if(a.length===0){UI.print("practice <skill>","error");return;} const sid=a[0]; if(!SkillDB[sid]){UI.print("沒這招","error");return;} if(!(p.skills[sid])){UI.print("不會","error");return;} if(SkillDB[sid].base && p.skills[sid]>=p.skills[SkillDB[sid].base]){UI.print("基礎不足","error");return;} const cost=10+Math.floor(p.skills[sid]/2); if(p.attributes.hp<=cost){UI.print("氣不足","error");return;} p.attributes.hp-=cost; p.skills[sid]++; UI.print(`練習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); await updatePlayer(u,{"attributes.hp":p.attributes.hp,"skills":p.skills}); } },
    'look': { description: '觀察', execute: (p, a) => { if(a.length>0) { const npc = findNPCInRoom(p.location, a[0]); if(npc) { let h = UI.titleLine(`${npc.name} (${npc.id})`); h+=UI.txt(npc.description+"<br>", "#ddd"); const isMaster = (p.family && p.family.masterId===npc.id); if(!isMaster && npc.family) h+=UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn"); if(isMaster && npc.skills) { h+=UI.txt("<br>師父會的武功：<br>","#0ff"); for(const [sid,l] of Object.entries(npc.skills)) {const sInfo=SkillDB[sid]; if(sInfo) h+=`- ${sInfo.name}(${sid}) ${UI.makeCmd("[學藝]", `learn ${sid} from ${npc.id}`, "cmd-btn")}<br>`;} } UI.print(h, "system", true); return; } const invItem = p.inventory.find(i=>i.id===a[0]||i.name===a[0]); if(invItem) { const info = ItemDB[invItem.id]; UI.print(UI.titleLine(`${info.name} (${invItem.id})`)+UI.txt(info.desc,"#ddd"),"system",true); return; } } MapSystem.look(p); } },
    'l': { description: 'look', execute: (p, a) => commandRegistry['look'].execute(p, a) },
    'apprentice': { description: '拜師', execute: async (p,a,u)=>{if(a.length===0)return UI.print("拜誰?","error"); const npc=findNPCInRoom(p.location,a[0]); if(!npc||!npc.family)return UI.print("無法拜師","error"); p.family={masterId:npc.id,masterName:npc.name,sect:npc.family}; p.sect=npc.family; await updatePlayer(u,{family:p.family,sect:p.sect}); UI.print("拜師成功","chat");} },
    'fight': { description: '切磋', execute: async (p,a,u)=>{if(a.length===0)return UI.print("跟誰?","error"); const npc=findNPCInRoom(p.location,a[0]); if(!npc)return UI.print("沒人","error"); UI.print(`與 ${npc.name} 切磋。`,"chat");} },
    'buy': { description: '買', execute: async (p,a,u) => { if(a.length<1){UI.print("買啥?","error");return;} let n=a[0],amt=1,nn=null; if(a.length>=2&&!isNaN(a[1]))amt=parseInt(a[1]); if(a.indexOf('from')!==-1)nn=a[a.indexOf('from')+1]; else {const r=MapSystem.getRoom(p.location);if(r.npcs)nn=r.npcs[0];} const npc=findNPCInRoom(p.location,nn); if(!npc){UI.print("沒人","error");return;} let tid=null,pr=0; if(npc.shop[n]){tid=n;pr=npc.shop[n];}else{for(const[k,v]of Object.entries(npc.shop)){if(ItemDB[k]&&ItemDB[k].name===n){tid=k;pr=v;break;}}} if(!tid){UI.print("沒賣","error");return;} const tot=pr*amt; if((p.money||0)<tot){UI.print("錢不夠","error");return;} p.money-=tot; if(!p.inventory)p.inventory=[]; const ex=p.inventory.find(i=>i.id===tid); if(ex)ex.count+=amt; else p.inventory.push({id:tid,name:ItemDB[tid].name,count:amt}); UI.print(`買了 ${amt} ${ItemDB[tid].name}`,"system"); await updatePlayer(u,{money:p.money,inventory:p.inventory}); } },
    'list': { description: '列表', execute: (p,a) => { const r=MapSystem.getRoom(p.location); let nn=null; if(a.length>0)nn=a[0]; else if(r.npcs)nn=r.npcs[0]; const npc=findNPCInRoom(p.location,nn); if(!npc||!npc.shop)return UI.print("沒賣東西","error"); let h=UI.titleLine(npc.name+" 商品"); for(const[k,v]of Object.entries(npc.shop)) h+=`<div>${ItemDB[k].name}: ${UI.formatMoney(v)} ${UI.makeCmd("[買1]",`buy ${k} 1 from ${npc.id}`,"cmd-btn")}</div>`; UI.print(h,"",true); } },
    'eat': { description: '吃', execute: async (p,a,u) => { if(a.length===0)return UI.print("吃啥?","error"); const i=p.inventory.find(x=>x.id===a[0]||x.name===a[0]); if(!i)return UI.print("沒這個","error"); if(ItemDB[i.id].type!=='food')return UI.print("不能吃","error"); if(p.attributes.food>=p.attributes.maxFood)return UI.print("飽了","system"); await consumeItem(p,u,i.id); p.attributes.food=Math.min(p.attributes.maxFood,p.attributes.food+ItemDB[i.id].value); UI.print("吃了 "+i.name,"system"); await updatePlayer(u,{"attributes.food":p.attributes.food}); } },
    'drink': { description: '喝', execute: async (p,a,u) => { if(a.length===0)return UI.print("喝啥?","error"); const i=p.inventory.find(x=>x.id===a[0]||x.name===a[0]); if(!i)return UI.print("沒這個","error"); if(ItemDB[i.id].type!=='drink')return UI.print("不能喝","error"); if(p.attributes.water>=p.attributes.maxWater)return UI.print("不渴","system"); await consumeItem(p,u,i.id); p.attributes.water=Math.min(p.attributes.maxWater,p.attributes.water+ItemDB[i.id].value); UI.print("喝了 "+i.name,"system"); await updatePlayer(u,{"attributes.water":p.attributes.water}); } },
    'drop': { description: '丟', execute: async (p,a,u) => { if(a.length===0)return UI.print("丟啥?","error"); const idx=p.inventory.findIndex(x=>x.id===a[0]||x.name===a[0]); if(idx===-1)return UI.print("沒這個","error"); const it=p.inventory[idx]; if(it.count>1)it.count--; else p.inventory.splice(idx,1); await updatePlayer(u,{inventory:p.inventory}); await addDoc(collection(db,"room_items"),{roomId:p.location,itemId:it.id,name:it.name,droppedBy:p.name,timestamp:new Date().toISOString()}); UI.print("丟了 "+it.name,"system"); MapSystem.look(p); } },
    'get': { description: '撿', execute: async (p,a,u) => { if(a.length===0)return UI.print("撿啥?","error"); const q=query(collection(db,"room_items"),where("roomId","==",p.location),where("itemId","==",a[0])); const snap=await getDocs(q); if(snap.empty)return UI.print("沒東西","error"); const d=snap.docs[0]; await deleteDoc(doc(db,"room_items",d.id)); const dat=d.data(); if(!p.inventory)p.inventory=[]; const ex=p.inventory.find(x=>x.id===dat.itemId); if(ex)ex.count++; else p.inventory.push({id:dat.itemId,name:dat.name,count:1}); await updatePlayer(u,{inventory:p.inventory}); UI.print("撿了 "+dat.name,"system"); MapSystem.look(p); } },
    'say': { description: '說', execute: (p,a)=>{const m=a.join(" ");UI.print(`你: ${m}`,"chat");MessageSystem.broadcast(p.location,`${p.name} 說: ${m}`);} },
    'emote': { description: '演', execute: (p,a)=>{const m=a.join(" ");UI.print(`${p.name} ${m}`,"system");MessageSystem.broadcast(p.location,`${p.name} ${m}`);} },
    'save': { description: '存', execute: async(p,a,u)=>{await updatePlayer(u,{savePoint:p.location});UI.print("已存檔","system");} },
    'recall': { description: '回', execute: (p,a,u)=>MapSystem.teleport(p,p.savePoint||"inn_start",u) },
    'suicide': { description: '死', execute: async(p,a,u)=>{if(a[0]==='confirm'){await deleteDoc(doc(db,"players",u));await signOut(auth);}else UI.print("confirm?","error");} }
};

Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
});
Object.values(dirMapping).forEach(fullDir => {
    if (!commandRegistry[fullDir]) {
        commandRegistry[fullDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
    }
});

export const CommandSystem = {
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        if (!playerData) { UI.print("靈魂尚未歸位...", "error"); return; }
        const args = inputStr.trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();
        const command = commandRegistry[cmdName];
        if (command) command.execute(playerData, args, userId);
        else UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error");
    }
};