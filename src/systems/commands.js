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

// 輔助函式：計算隱藏等級 (最高進階外功 + 最高進階內功)
function getLevel(character) {
    const skills = character.skills || {};
    let maxMartial = 0;
    let maxForce = 0;
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
            msg += UI.txt(" 戰鬥指令：", "#ff0000") + "kill (下殺手), fight (切磋)\n";
            msg += UI.txt(" 修練指令：", "#ffff00") + "exercise (打坐), meditate (冥想)\n";
            msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
            msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy\n";
            msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
            UI.print(msg, 'normal', true);
        }
    },

    // --- 冥想 (Meditate) - 替換 Respirate ---
    'meditate': {
        description: '冥想 (消耗精 -> 增加法力)',
        execute: async (playerData, args, userId) => {
            if (playerData.attributes.sp < 20) { UI.print("你的精神不足，無法冥想。", "error"); return; }
            const cost = 10; const gain = 5;
            if (playerData.attributes.mana >= playerData.attributes.maxMana) { UI.print("你的法力充盈，無須冥想。", "system"); return; }
            playerData.attributes.sp -= cost;
            playerData.attributes.mana = Math.min(playerData.attributes.maxMana, playerData.attributes.mana + gain);
            UI.print("你閉目凝神，進入冥想狀態，感覺靈台一片清明。", "system");
            UI.print(`(消耗 ${cost} 點精，增加 ${gain} 點法力)`, "chat");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 閉上雙眼，開始冥想。`);
            await updatePlayer(userId, { "attributes.sp": playerData.attributes.sp, "attributes.mana": playerData.attributes.mana });
        }
    },

    // --- 練習 (Practice) - 消耗氣 ---
    'practice': {
        description: '練習武功',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你要練習什麼？", "error"); return; }
            const skillId = args[0];
            const skillInfo = SkillDB[skillId];
            if (!skillInfo) { UI.print("這不是一種武功。", "error"); return; }
            if (!playerData.skills || !playerData.skills[skillId]) { UI.print("你不會這招。", "error"); return; }
            const currentLevel = playerData.skills[skillId];
            if (skillInfo.base) {
                const baseLevel = playerData.skills[skillInfo.base] || 0;
                if (currentLevel >= baseLevel) { UI.print(`你的 ${SkillDB[skillInfo.base].name} 火候不足。`, "error"); return; }
            }
            const cost = 10 + Math.floor(currentLevel / 2);
            if (playerData.attributes.hp <= cost) { UI.print("你氣喘如牛，練不動了。(氣不足)", "error"); return; }
            playerData.attributes.hp -= cost;
            playerData.skills[skillId] = currentLevel + 1;
            UI.print(`你反覆演練 ${skillInfo.name}，對其中奧妙又多了一分體會。`, "system");
            UI.print(`(消耗了 ${cost} 點氣)`, "chat");
            UI.print(`你的 ${skillInfo.name} 進步了！(${currentLevel + 1}級)`, "system", true);
            MessageSystem.broadcast(playerData.location, `${playerData.name} 正在專心練習 ${skillInfo.name}。`);
            await updatePlayer(userId, { "attributes.hp": playerData.attributes.hp, "skills": playerData.skills });
        }
    },

    // --- 學藝 (Learn) - 消耗精與潛能 ---
    'learn': {
        description: '向師父學習技能',
        execute: async (playerData, args, userId) => {
            if (args.length < 3 || args[1] !== 'from') { UI.print("格式：learn <技能> from <對象>", "error"); return; }
            const skillId = args[0];
            const masterId = args[2];
            const npc = findNPCInRoom(playerData.location, masterId);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }
            if (!playerData.family || playerData.family.masterId !== npc.id) { UI.print(`${npc.name} 說：「我為何要教你？」(需先拜師)`, "chat"); return; }
            if (!npc.skills || !npc.skills[skillId]) { UI.print(`${npc.name} 搖頭：「這招我不會。」`, "chat"); return; }
            
            const skillInfo = SkillDB[skillId];
            if (!skillInfo) { UI.print("沒這種武功。", "error"); return; }
            if (!playerData.skills) playerData.skills = {};
            const currentLevel = playerData.skills[skillId] || 0;
            if (currentLevel >= npc.skills[skillId]) { UI.print(`${npc.name} 說：「你已學盡我所能。」`, "chat"); return; }

            const spCost = 10 + Math.floor(currentLevel / 2);
            const potCost = 5 + Math.floor(currentLevel / 5);

            if (playerData.attributes.sp <= spCost) { UI.print("你精神無法集中。(精不足)", "error"); return; }
            const currentPot = playerData.combat ? (playerData.combat.potential || 0) : 0;
            if (currentPot < potCost) { UI.print(`潛能不足，無法領悟。(需要 ${potCost} 點)`, "error"); return; }

            playerData.attributes.sp -= spCost;
            playerData.combat.potential -= potCost;
            playerData.skills[skillId] = currentLevel + 1;

            UI.print(`你向 ${npc.name} 請教了 ${skillInfo.name}。`, "system");
            UI.print(`(消耗 ${spCost} 精，${potCost} 潛能)`, "chat");
            UI.print(`你的 ${skillInfo.name} 進步了！(${currentLevel + 1}級)`, "system", true);

            await updatePlayer(userId, { 
                "attributes.sp": playerData.attributes.sp,
                "combat.potential": playerData.combat.potential,
                "skills": playerData.skills 
            });
        }
    },

    // --- 殺敵 (Kill) ---
    'kill': {
        description: '下殺手',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你想殺誰？", "error"); return; }
            const room = MapSystem.getRoom(playerData.location);
            if (room.safe) { UI.print("這裡是安全區，禁止動武！", "error"); return; }
            
            const targetId = args[0];
            const npc = findNPCInRoom(playerData.location, targetId);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            const playerLvl = getLevel(playerData);
            const npcLvl = getLevel(npc);

            UI.print(`你對 ${npc.name} 下了毒手！`, "chat");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 對 ${npc.name} 下了毒手！`);
            UI.print(`經過激戰，${npc.name} 倒地身亡。`, "system");

            let potGain = 100 + ((npcLvl - playerLvl) * 10);
            if (potGain < 10) potGain = 10;

            if (!playerData.combat) playerData.combat = { potential: 0 };
            playerData.combat.potential = (playerData.combat.potential || 0) + potGain;

            UI.print(UI.txt(`戰鬥勝利！獲得 ${potGain} 點潛能。`, "#ffff00", true), "system", true);

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

            try {
                await addDoc(collection(db, "dead_npcs"), {
                    roomId: playerData.location, npcId: npc.id, index: npc.index, respawnTime: Date.now() + 300000
                });
            } catch (e) { console.error(e); }

            await updatePlayer(userId, { "combat.potential": playerData.combat.potential });
            MapSystem.look(playerData);
        }
    },

    // --- 狀態 (Score) ---
    'score': {
        description: '查看屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const skills = playerData.skills || {};
            const enabled = playerData.enabled_skills || {};
            const combat = playerData.combat || {};
            
            let unarmedLvl = skills['unarmed'] || 0;
            if (enabled['unarmed']) unarmedLvl = skills[enabled['unarmed']] || 0;
            const atk = (attr.str * 10) + unarmedLvl;
            
            let parryLvl = skills['parry'] || 0;
            if (enabled['parry']) parryLvl = skills[enabled['parry']] || 0;
            const def = (attr.con * 10) + parryLvl;
            
            let dodgeLvl = skills['dodge'] || 0;
            if (enabled['dodge']) dodgeLvl = skills[enabled['dodge']] || 0;
            const dodge = (attr.dex * 10) + dodgeLvl;

            const parry = (attr.str * 5) + (attr.con * 5) + ((skills.parry || 0) * 2);
            const hitRate = (attr.dex * 10) + (unarmedLvl * 2);

            const moneyStr = UI.formatMoney(playerData.money || 0);
            const potential = combat.potential || 0;

            let html = UI.titleLine(`${playerData.name} 的狀態`);
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("性別", playerData.gender)}</div><div>${UI.attrLine("門派", playerData.sect || "無")}</div>`;
            html += `<div>${UI.attrLine("財產", moneyStr)}</div>`;
            html += `<div>${UI.attrLine("潛能", UI.txt(potential, "#ffff00", true))}</div>`;
            html += `</div><br>`;

            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("精 (SP)", attr.sp+"/"+attr.maxSp)}</div><div>${UI.attrLine("靈力", attr.spiritual+"/"+attr.maxSpiritual)}</div>`;
            html += `<div>${UI.attrLine("氣 (HP)", attr.hp+"/"+attr.maxHp)}</div><div>${UI.attrLine("內力", attr.force+"/"+attr.maxForce)}</div>`;
            html += `<div>${UI.attrLine("神 (MP)", attr.mp+"/"+attr.maxMp)}</div><div>${UI.attrLine("法力", attr.mana+"/"+attr.maxMana)}</div>`;
            html += `</div><br>`;

            html += UI.txt("【 戰鬥 】", "#00ff00") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("攻擊", atk)}</div><div>${UI.attrLine("防禦", def)}</div>`;
            html += `<div>${UI.attrLine("命中", hitRate)}</div><div>${UI.attrLine("閃避", dodge)}</div>`;
            html += `</div>` + UI.titleLine("End");
            UI.print(html, 'chat', true);
        }
    },

    // --- 其他指令 (保持原樣或精簡參照) ---
    'look': { description: '觀察', execute: (p, a) => { 
        if(a.length>0) { 
            const npc = findNPCInRoom(p.location, a[0]); 
            if(npc) { 
                let h = UI.titleLine(npc.name); 
                h+=UI.txt(npc.description+"<br>", "#ddd"); 
                const isMaster = (p.family && p.family.masterId===npc.id); 
                if(!isMaster && npc.family) h+=UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn"); 
                if(isMaster && npc.skills) { 
                    h+=UI.txt("<br>師父會的武功：<br>","#0ff"); 
                    for(const [sid,l] of Object.entries(npc.skills)) h+=`- ${SkillDB[sid].name}(${sid}) ${UI.makeCmd("[學藝]", `learn ${sid} from ${npc.id}`, "cmd-btn")}<br>`; 
                } 
                UI.print(h, "system", true); 
                return; 
            } 
        } 
        MapSystem.look(p); 
    }},
    'l': { description: 'look', execute: (p, a) => commandRegistry['look'].execute(p, a) },
    'inventory': { description: '背包', execute: (p) => { let h=UI.titleLine("背包")+`<div>${UI.attrLine("財產", UI.formatMoney(p.money))}</div><br>`; if(!p.inventory||p.inventory.length===0)h+=UI.txt("空空如也。<br>","#888"); else p.inventory.forEach(i=>{ h+=`${UI.txt(i.name,"#fff")} (${i.id}) x${i.count} ${UI.makeCmd("[丟]",`drop ${i.id}`,"cmd-btn")} ${UI.makeCmd("[看]",`look ${i.id}`,"cmd-btn")}<br>`; }); UI.print(h, "chat", true); } },
    'i': { description: 'inventory', execute: (p) => commandRegistry['inventory'].execute(p) },
    'skills': { description: '技能', execute: (p) => { let h=UI.titleLine("武學"); for(const [k,v] of Object.entries(p.skills||{})) h+=`${SkillDB[k].name}: ${v}<br>`; UI.print(h, "chat", true); } },
    'buy': { description: '買', execute: async (p, a, u) => { /* ...完整buy邏輯同前... */ if(a.length<1){UI.print("買什麼?","error");return;} let n=a[0],amt=1,nn=null; if(a.length>=2&&!isNaN(a[1]))amt=parseInt(a[1]); if(a.indexOf('from')!==-1)nn=a[a.indexOf('from')+1]; else {const r=MapSystem.getRoom(p.location);if(r.npcs)nn=r.npcs[0];} const npc=findNPCInRoom(p.location,nn); if(!npc){UI.print("沒這個人","error");return;} let tid=null,pr=0; if(npc.shop[n]){tid=n;pr=npc.shop[n];}else{for(const[k,v]of Object.entries(npc.shop)){if(ItemDB[k]&&ItemDB[k].name===n){tid=k;pr=v;break;}}} if(!tid){UI.print("沒賣","error");return;} const tot=pr*amt; if((p.money||0)<tot){UI.print("錢不夠","error");return;} p.money-=tot; if(!p.inventory)p.inventory=[]; const ex=p.inventory.find(i=>i.id===tid); if(ex)ex.count+=amt; else p.inventory.push({id:tid,name:ItemDB[tid].name,count:amt}); UI.print(`買了 ${amt} ${ItemDB[tid].name}，花費 ${UI.formatMoney(tot)}。`,"system",true); await updatePlayer(u,{money:p.money,inventory:p.inventory}); } },
    'list': { description: '列表', execute: (p, a) => { /* ...完整list邏輯同前... */ const r=MapSystem.getRoom(p.location); let nn=null; if(a.length>0)nn=a[0]; else if(r.npcs)nn=r.npcs[0]; const npc=findNPCInRoom(p.location,nn); if(!npc||!npc.shop)return UI.print("沒人賣東西","error"); let h=UI.titleLine(npc.name+" 的商品"); for(const[k,v]of Object.entries(npc.shop)) h+=`<div style="display:flex;justify-content:space-between"><span>${UI.txt(ItemDB[k].name,"#fff")} (${k})</span><span>${UI.formatMoney(v)} ${UI.makeCmd("[買1]",`buy ${k} 1 from ${npc.id}`,"cmd-btn")}</span></div>`; UI.print(h, "", true); } },
    'eat': { description: '吃', execute: async (p, a, u) => { if(a.length===0)return UI.print("吃啥?","error"); const i=p.inventory.find(x=>x.id===a[0]||x.name===a[0]); if(!i)return UI.print("沒這個","error"); if(ItemDB[i.id].type!=='food')return UI.print("不能吃","error"); if(p.attributes.food>=p.attributes.maxFood)return UI.print("飽了","system"); await consumeItem(p,u,i.id); p.attributes.food=Math.min(p.attributes.maxFood,p.attributes.food+ItemDB[i.id].value); UI.print(`吃了 ${i.name}`,"system"); await updatePlayer(u,{"attributes.food":p.attributes.food}); } },
    'drink': { description: '喝', execute: async (p,a,u) => { if(a.length===0)return UI.print("喝啥?","error"); const i=p.inventory.find(x=>x.id===a[0]||x.name===a[0]); if(!i)return UI.print("沒這個","error"); if(ItemDB[i.id].type!=='drink')return UI.print("不能喝","error"); if(p.attributes.water>=p.attributes.maxWater)return UI.print("不渴","system"); await consumeItem(p,u,i.id); p.attributes.water=Math.min(p.attributes.maxWater,p.attributes.water+ItemDB[i.id].value); UI.print(`喝了 ${i.name}`,"system"); await updatePlayer(u,{"attributes.water":p.attributes.water}); } },
    'drop': { description: '丟', execute: async (p,a,u) => { if(a.length===0)return UI.print("丟啥?","error"); const idx=p.inventory.findIndex(x=>x.id===a[0]||x.name===a[0]); if(idx===-1)return UI.print("沒這個","error"); const it=p.inventory[idx]; if(it.count>1)it.count--; else p.inventory.splice(idx,1); await updatePlayer(u,{inventory:p.inventory}); await addDoc(collection(db,"room_items"),{roomId:p.location,itemId:it.id,name:it.name,droppedBy:p.name,timestamp:new Date().toISOString()}); UI.print(`丟下了 ${it.name}`,"system"); MapSystem.look(p); } },
    'get': { description: '撿', execute: async (p,a,u) => { if(a.length===0)return UI.print("撿啥?","error"); const q=query(collection(db,"room_items"),where("roomId","==",p.location),where("itemId","==",a[0])); const snap=await getDocs(q); if(snap.empty)return UI.print("地上沒這東西","error"); const d=snap.docs[0]; await deleteDoc(doc(db,"room_items",d.id)); const dat=d.data(); if(!p.inventory)p.inventory=[]; const ex=p.inventory.find(x=>x.id===dat.itemId); if(ex)ex.count++; else p.inventory.push({id:dat.itemId,name:dat.name,count:1}); await updatePlayer(u,{inventory:p.inventory}); UI.print(`撿起了 ${dat.name}`,"system"); MapSystem.look(p); } },
    'say': { description: '說', execute: (p,a)=>{const m=a.join(" ");UI.print(`你說：${m}`,"chat");MessageSystem.broadcast(p.location,`${p.name} 說：${m}`,'chat');}},
    'emote': { description: '演', execute: (p,a)=>{const m=a.join(" ");UI.print(`${p.name} ${m}`,"system");MessageSystem.broadcast(p.location,`${p.name} ${m}`,'system');}},
    'exercise': { description: '打坐', execute: async(p,a,u)=>{if(p.attributes.hp<20){UI.print("氣不足","error");return;}if(p.attributes.force>=p.attributes.maxForce){UI.print("內力滿了","system");return;}p.attributes.hp-=10;p.attributes.force+=5;UI.print("運功打坐。","system");await updatePlayer(u,{"attributes.hp":p.attributes.hp,"attributes.force":p.attributes.force});}},
    'enable': { description: '激發', execute: async (p, a, u) => { /* ...enable邏輯... */ if(!p.enabled_skills) p.enabled_skills={}; if(a.length<2){ UI.print("enable <type> <skill>", "error"); return; } const t=a[0]; const s=a[1]; if(!p.skills[s]){ UI.print("不會。", "error"); return; } p.enabled_skills[t]=s; UI.print("已激發。", "system"); await updatePlayer(u, {enabled_skills: p.enabled_skills}); } },
    'fight': { description: '切磋', execute: async(p,a,u)=>{if(a.length===0){UI.print("跟誰?","error");return;}const npc=findNPCInRoom(p.location,a[0]);if(!npc){UI.print("沒這個人","error");return;}UI.print(`與 ${npc.name} 切磋。`,"chat");}},
    'save': { description: '存', execute: async(p,a,u)=>{if(MapSystem.getRoom(p.location).allowSave){await updatePlayer(u,{savePoint:p.location});UI.print("已存檔","system");}else UI.print("不能存","error");}},
    'recall': { description: '回', execute: (p,a,u)=>MapSystem.teleport(p,p.savePoint||"inn_start",u)},
    'suicide': { description: '死', execute: async(p,a,u)=>{if(a[0]==='confirm'){await deleteDoc(doc(db,"players",u));await signOut(auth);}else UI.print("suicide confirm","error");}}
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