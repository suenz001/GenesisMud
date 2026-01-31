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

// 技能等級描述
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

// 輔助：更新玩家資料
async function updatePlayer(userId, data) {
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, data);
        return true;
    } catch (e) { console.error("更新失敗", e); return false; }
}

// 輔助：更新背包
async function updateInventory(playerData, userId) {
    return await updatePlayer(userId, { inventory: playerData.inventory });
}

// 輔助：消耗物品
async function consumeItem(playerData, userId, itemId, amount = 1) {
    const inventory = playerData.inventory || [];
    const itemIndex = inventory.findIndex(i => i.id === itemId || i.name === itemId);

    if (itemIndex === -1) {
        UI.print(`你身上沒有 ${itemId} 這樣東西。`, "error");
        return false;
    }
    const item = inventory[itemIndex];
    if (item.count > amount) {
        item.count -= amount;
    } else {
        inventory.splice(itemIndex, 1);
    }
    return await updateInventory(playerData, userId);
}

// 輔助：尋找房間內的 NPC
function findNPCInRoom(roomId, npcNameOrId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;
    if (room.npcs.includes(npcNameOrId)) return NPCDB[npcNameOrId];
    for (const npcId of room.npcs) {
        const npc = NPCDB[npcId];
        if (npc && npc.name === npcNameOrId) return npc;
    }
    return null;
}

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = UI.titleLine("江湖指南");
            msg += UI.txt(" 基本指令：", "#00ffff") + "score, skills, inventory (i)\n";
            msg += UI.txt(" 武學指令：", "#ff5555") + "apprentice (拜師), learn (學藝), enable (激發), practice (練習)\n";
            msg += UI.txt(" 修練指令：", "#ffff00") + "exercise (打坐), respirate (吐納)\n";
            msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
            msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy\n";
            msg += UI.txt(" 社交指令：", "#ff88ff") + "say, emote\n";
            msg += UI.txt(" 特殊指令：", "#ff0000") + "save, recall, suicide\n";
            msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
            UI.print(msg, 'normal', true);
        }
    },

    // --- 拜師 (Apprentice) ---
    'apprentice': {
        description: '拜師',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你想拜誰為師？", "error"); return; }
            
            const npc = findNPCInRoom(playerData.location, args[0]);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            if (!npc.family) {
                UI.print(`${npc.name} 說道：「我只是一介平民，不懂收徒。」`, "chat");
                return;
            }

            if (playerData.family && playerData.family.masterId) {
                UI.print(`你已經有師父了，是 ${playerData.family.masterId}。`, "error");
                return;
            }

            UI.print(`${npc.name} 哈哈大笑：「好！今日我就收你為徒！」`, "chat");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 恭恭敬敬地向 ${npc.name} 磕了三個響頭。`);

            playerData.family = {
                masterId: npc.id,
                masterName: npc.name,
                sect: npc.family
            };
            playerData.sect = npc.family === 'common_gym' ? '飛龍武館' : npc.family;

            await updatePlayer(userId, { 
                family: playerData.family, 
                sect: playerData.sect 
            });
        }
    },

    // --- 學藝 (Learn) - 消耗 SP (精) ---
    'learn': {
        description: '向師父學習技能',
        execute: async (playerData, args, userId) => {
            if (args.length < 3 || args[1] !== 'from') {
                UI.print("指令格式錯誤：learn <技能> from <對象>", "error");
                return;
            }
            
            const skillId = args[0];
            const masterId = args[2];
            const npc = findNPCInRoom(playerData.location, masterId);

            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            if (!playerData.family || playerData.family.masterId !== npc.id) {
                UI.print(`${npc.name} 說道：「我為何要教你？」(你必須先 apprentice 拜師)`, "chat");
                return;
            }

            if (!npc.skills || !npc.skills[skillId]) {
                UI.print(`${npc.name} 搖搖頭：「這門功夫我不會。」`, "chat");
                return;
            }

            const skillInfo = SkillDB[skillId];
            if (!skillInfo) { UI.print("世界上沒有這種武功。", "error"); return; }

            if (!playerData.skills) playerData.skills = {};
            const currentLevel = playerData.skills[skillId] || 0;
            const masterLevel = npc.skills[skillId];

            if (currentLevel >= masterLevel) {
                UI.print(`${npc.name} 說道：「你的造詣已經不輸給我了，我沒什麼可教你的。」`, "chat");
                return;
            }

            // 消耗計算：消耗 SP (精)
            const cost = 10 + Math.floor(currentLevel / 2);
            if (playerData.attributes.sp <= cost) {
                UI.print("你精神無法集中，需要休息一下。(精不足)", "error");
                return;
            }

            playerData.attributes.sp -= cost;
            playerData.skills[skillId] = currentLevel + 1;

            UI.print(`你向 ${npc.name} 請教了有關 ${skillInfo.name} 的訣竅。`, "system");
            UI.print(`(消耗了 ${cost} 點精)`, "chat");
            UI.print(`你的 ${skillInfo.name} 進步了！(等級 ${currentLevel + 1})`, "system", true);

            await updatePlayer(userId, { 
                "attributes.sp": playerData.attributes.sp,
                "skills": playerData.skills 
            });
        }
    },

    // --- 練習 (Practice) - 消耗 HP (氣) ---
    'practice': {
        description: '練習武功',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你要練習什麼？(practice <技能>)", "error"); return; }
            
            const skillId = args[0];
            const skillInfo = SkillDB[skillId];

            if (!skillInfo) { UI.print("這不是一種武功。", "error"); return; }
            
            if (!playerData.skills || !playerData.skills[skillId]) {
                UI.print("你根本不會這招，怎麼練？", "error");
                return;
            }

            const currentLevel = playerData.skills[skillId];

            if (skillInfo.base) {
                const baseLevel = playerData.skills[skillInfo.base] || 0;
                if (currentLevel >= baseLevel) {
                    UI.print(`你的 ${SkillDB[skillInfo.base].name} 火候不足，無法繼續領悟 ${skillInfo.name}。`, "error");
                    return;
                }
            }

            // 消耗計算：消耗 HP (氣)
            const cost = 10 + Math.floor(currentLevel / 2);
            if (playerData.attributes.hp <= cost) {
                UI.print("你氣喘如牛，手腳痠軟，實在練不動了。(氣不足)", "error");
                return;
            }

            playerData.attributes.hp -= cost;
            playerData.skills[skillId] = currentLevel + 1;

            UI.print(`你反覆演練 ${skillInfo.name}，對其中奧妙又多了一分體會。`, "system");
            UI.print(`(消耗了 ${cost} 點氣)`, "chat");
            UI.print(`你的 ${skillInfo.name} 進步了！(等級 ${currentLevel + 1})`, "system", true);

            MessageSystem.broadcast(playerData.location, `${playerData.name} 正在專心練習 ${skillInfo.name}。`);

            await updatePlayer(userId, { 
                "attributes.hp": playerData.attributes.hp,
                "skills": playerData.skills 
            });
        }
    },

    // --- 打坐 (Exercise) - 氣轉內力 ---
    'exercise': {
        description: '打坐 (消耗氣 -> 增加內力)',
        execute: async (playerData, args, userId) => {
            if (playerData.attributes.hp < 20) {
                UI.print("你的氣不足，無法打坐。", "error");
                return;
            }
            
            // 簡單公式：消耗 10 點氣，轉換為 5 點內力 (若未滿)
            const hpCost = 10;
            const forceGain = 5;

            // 檢查是否已滿
            if (playerData.attributes.force >= playerData.attributes.maxForce) {
                UI.print("你的內力充盈，無須打坐。", "system");
                return;
            }

            playerData.attributes.hp -= hpCost;
            playerData.attributes.force = Math.min(playerData.attributes.maxForce, playerData.attributes.force + forceGain);

            UI.print("你盤膝而坐，運轉周天，感覺內息增長了。", "system");
            UI.print(`(消耗 ${hpCost} 點氣，增加 ${forceGain} 點內力)`, "chat");
            
            MessageSystem.broadcast(playerData.location, `${playerData.name} 盤膝坐下，開始打坐運功。`);

            await updatePlayer(userId, {
                "attributes.hp": playerData.attributes.hp,
                "attributes.force": playerData.attributes.force
            });
        }
    },

    // --- 吐納 (Respirate) - 精轉法力 ---
    'respirate': {
        description: '吐納 (消耗精 -> 增加法力)',
        execute: async (playerData, args, userId) => {
            if (playerData.attributes.sp < 20) {
                UI.print("你的精神不足，無法吐納。", "error");
                return;
            }
            
            const spCost = 10;
            const manaGain = 5;

            if (playerData.attributes.mana >= playerData.attributes.maxMana) {
                UI.print("你的法力充盈，無須吐納。", "system");
                return;
            }

            playerData.attributes.sp -= spCost;
            playerData.attributes.mana = Math.min(playerData.attributes.maxMana, playerData.attributes.mana + manaGain);

            UI.print("你閉目凝神，呼吸吐納，感覺靈台一片清明。", "system");
            UI.print(`(消耗 ${spCost} 點精，增加 ${manaGain} 點法力)`, "chat");

            MessageSystem.broadcast(playerData.location, `${playerData.name} 閉上雙眼，開始呼吸吐納。`);

            await updatePlayer(userId, {
                "attributes.sp": playerData.attributes.sp,
                "attributes.mana": playerData.attributes.mana
            });
        }
    },

    // --- 激發/裝備 (Enable) ---
    'enable': {
        description: '激發進階武功',
        execute: async (playerData, args, userId) => {
            if (!playerData.enabled_skills) playerData.enabled_skills = {};

            if (args.length === 0) {
                let msg = UI.titleLine("目前激發的武功");
                for (const [type, skillId] of Object.entries(playerData.enabled_skills)) {
                    const sInfo = SkillDB[skillId];
                    msg += `${type.padEnd(12)}: ${sInfo ? sInfo.name : skillId}\n`;
                }
                if (Object.keys(playerData.enabled_skills).length === 0) msg += "無\n";
                msg += UI.titleLine("End");
                UI.print(msg, 'system');
                return;
            }

            if (args.length < 2) {
                UI.print("指令格式：enable <類型> <技能>", "error");
                return;
            }

            const type = args[0]; 
            const skillId = args[1];

            if (!playerData.skills || !playerData.skills[skillId]) {
                UI.print("你不會這招。", "error");
                return;
            }

            const skillInfo = SkillDB[skillId];
            if (skillInfo.base !== type) {
                const isParryException = (type === 'parry' && skillInfo.type === 'martial');
                if (!isParryException && skillInfo.base !== type) {
                    UI.print(`${skillInfo.name} 無法作為 ${type} 來使用。`, "error");
                    return;
                }
            }

            playerData.enabled_skills[type] = skillId;
            UI.print(`你將 ${type} 功夫設定為 ${skillInfo.name}。`, "system");

            await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
        }
    },

    // --- 狀態 (Score) - 已修正標籤 ---
    'score': {
        description: '查看詳細屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const skills = playerData.skills || {};
            const enabled = playerData.enabled_skills || {};
            
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

            const gender = playerData.gender || "未知";
            const moneyStr = UI.formatMoney(playerData.money || 0);

            let html = UI.titleLine(`${playerData.name} 的狀態`);
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-bottom:5px;">`;
            html += `<div>${UI.attrLine("性別", gender)}</div>`;
            html += `<div>${UI.attrLine("門派", playerData.sect || "無門無派")}</div>`;
            html += `</div>`;
            html += `<div>${UI.attrLine("財產", moneyStr)}</div><br>`;

            // 修正：使用使用者定義的 精(SP)/氣(HP)/神(MP)
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.txt("【 精 與 靈 】", "#ff5555")}</div><div></div>`;
            html += `<div>${UI.attrLine("精 (SP)", attr.sp + "/" + attr.maxSp)}</div>`;
            html += `<div>${UI.attrLine("靈力", attr.spiritual + "/" + attr.maxSpiritual)}</div>`;
            
            html += `<div>${UI.txt("【 氣 與 內 】", "#5555ff")}</div><div></div>`;
            html += `<div>${UI.attrLine("氣 (HP)", attr.hp + "/" + attr.maxHp)}</div>`;
            html += `<div>${UI.attrLine("內力", attr.force + "/" + attr.maxForce)}</div>`;

            html += `<div>${UI.txt("【 神 與 法 】", "#ffff55")}</div><div></div>`;
            html += `<div>${UI.attrLine("神 (MP)", attr.mp + "/" + attr.maxMp)}</div>`;
            html += `<div>${UI.attrLine("法力", attr.mana + "/" + attr.maxMana)}</div>`;
            html += `</div><br>`;

            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("食物", attr.food + "/" + attr.maxFood)}</div>`;
            html += `<div>${UI.attrLine("飲水", attr.water + "/" + attr.maxWater)}</div>`;
            html += `</div><br>`;

            html += UI.txt("【 戰鬥數值 】", "#00ff00") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("攻擊力", atk)}</div><div>${UI.attrLine("防禦力", def)}</div>`;
            html += `<div>${UI.attrLine("命中率", hitRate)}</div><div>${UI.attrLine("閃避率", dodge)}</div>`;
            html += `<div>${UI.attrLine("招架率", parry)}</div><div>${UI.attrLine("殺氣", 0)}</div>`;
            html += `</div>`;
            
            html += "<br>" + UI.titleLine("End of Status");
            UI.print(html, 'chat', true);
        }
    },
    'sc': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },
    'hp': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },

    // --- 其他指令 (保持不變) ---
    'skills': {
        description: '查看已習得武學',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);
            if (skillList.length === 0) { UI.print("你目前什麼都不會。", "chat"); return; }
            let html = UI.titleLine(`${playerData.name} 的武學`);
            html += `<table style="width:100%; text-align:left;">`;
            for (const [id, level] of skillList) {
                const info = SkillDB[id];
                const name = info ? info.name : id;
                const desc = getSkillLevelDesc(level);
                let enabledMark = "";
                if (playerData.enabled_skills) {
                    for (const [slot, equippedId] of Object.entries(playerData.enabled_skills)) {
                        if (equippedId === id) enabledMark += ` <span style="color:#00ff00; font-size:10px;">[${slot}]</span>`;
                    }
                }
                html += `<tr><td style="color:#fff; width:140px;">${name} (${id})${enabledMark}</td><td style="color:#00ffff; width:60px;">${level} 級</td><td>${desc}</td></tr>`;
            }
            html += `</table>` + UI.titleLine("End of Skills");
            UI.print(html, 'chat', true);
        }
    },
    'sk': { description: 'skills 簡寫', execute: (p) => commandRegistry['skills'].execute(p) },

    'look': {
        description: '觀察四周 (簡寫: l)',
        execute: (playerData, args) => {
            if (args && args.length > 0) {
                const target = args[0];
                const npc = findNPCInRoom(playerData.location, target);
                if (npc) {
                    let html = UI.titleLine(`${npc.name} (${npc.id})`);
                    html += UI.txt(npc.description, "#ddd") + "<br>";
                    if (npc.skills) {
                        html += UI.txt("他看起來身懷絕技：<br>", "#00ffff");
                        for (const [sid, lvl] of Object.entries(npc.skills)) {
                            const sInfo = SkillDB[sid];
                            if(sInfo) html += `- ${sInfo.name} (${lvl}級)<br>`;
                        }
                    }
                    UI.print(html, "system", true);
                    return;
                }
                const invItem = playerData.inventory.find(i => i.id === target || i.name === target);
                if (invItem) {
                    const itemData = ItemDB[invItem.id];
                    let html = UI.titleLine(`${itemData.name} (${invItem.id})`);
                    html += UI.txt(itemData.desc, "#ddd") + "<br>";
                    UI.print(html, "system", true);
                    return;
                }
                UI.print("你看不到那個東西。", "error");
                return;
            }
            MapSystem.look(playerData);
        }
    },
    'l': { description: 'look 簡寫', execute: (p, a) => commandRegistry['look'].execute(p, a) },

    'list': {
        description: '查看商品',
        execute: (playerData, args) => {
            const room = MapSystem.getRoom(playerData.location);
            let targetNPC = null;
            if (args.length > 0) targetNPC = findNPCInRoom(playerData.location, args[0]);
            else if (room.npcs && room.npcs.length > 0) targetNPC = NPCDB[room.npcs[0]];
            if (!targetNPC || !targetNPC.shop) return UI.print("這裡沒人在賣東西。", "error");
            let html = UI.titleLine(`${targetNPC.name} 的商品列表`);
            for (const [itemId, price] of Object.entries(targetNPC.shop)) {
                const itemInfo = ItemDB[itemId];
                const itemName = itemInfo ? itemInfo.name : itemId;
                const priceStr = UI.formatMoney(price);
                const buyCmd = `buy ${itemId} 1 from ${targetNPC.id}`;
                const buyBtn = UI.makeCmd("[買1個]", buyCmd, "cmd-btn cmd-btn-buy");
                html += `<div style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dotted #333;"><span>${UI.txt(itemName, "#fff")} ${UI.txt("("+itemId+")", "#666")}</span><span>${priceStr} ${buyBtn}</span></div>`;
            }
            html += UI.titleLine("End of List");
            UI.print(html, '', true);
        }
    },

    'inventory': {
        description: '背包',
        execute: (playerData) => {
            const items = playerData.inventory || [];
            const moneyStr = UI.formatMoney(playerData.money || 0);
            let html = UI.titleLine(`${playerData.name} 的背包`);
            html += `<div>${UI.attrLine("財產", moneyStr)}</div><br>`;
            if (items.length === 0) html += UI.txt("目前身上空空如也。<br>", "#888");
            else {
                items.forEach(item => {
                    const itemData = ItemDB[item.id];
                    let actions = "";
                    if (itemData) {
                        if (itemData.type === 'food') actions += UI.makeCmd("[吃]", `eat ${item.id}`, "cmd-btn");
                        if (itemData.type === 'drink') actions += UI.makeCmd("[喝]", `drink ${item.id}`, "cmd-btn");
                    }
                    actions += UI.makeCmd("[丟]", `drop ${item.id}`, "cmd-btn");
                    actions += UI.makeCmd("[看]", `look ${item.id}`, "cmd-btn");
                    const displayName = `${UI.txt(item.name, "#fff")} ${UI.txt("("+item.id+")", "#666")}`;
                    html += `<div>${displayName} x${item.count} ${actions}</div>`;
                });
            }
            html += "<br>" + UI.titleLine("End of Inventory");
            UI.print(html, 'chat', true);
        }
    },
    'i': { description: 'inventory 簡寫', execute: (p) => commandRegistry['inventory'].execute(p) },

    'buy': {
        description: '購買',
        execute: async (playerData, args, userId) => {
            if (args.length < 1) { UI.print("想買什麼？", "error"); return; }
            let itemName = args[0];
            let amount = 1;
            let npcName = null;
            if (args.length >= 2 && !isNaN(args[1])) amount = parseInt(args[1]);
            const fromIndex = args.indexOf('from');
            if (fromIndex !== -1 && fromIndex + 1 < args.length) npcName = args[fromIndex + 1];
            else { const room = MapSystem.getRoom(playerData.location); if (room.npcs && room.npcs.length > 0) npcName = room.npcs[0]; }
            const npc = findNPCInRoom(playerData.location, npcName);
            if (!npc) { UI.print("沒這個人。", "error"); return; }
            let targetItemId = null; let price = 0;
            if (npc.shop[itemName]) { targetItemId = itemName; price = npc.shop[itemName]; }
            else { for (const [sid, p] of Object.entries(npc.shop)) { if (ItemDB[sid] && ItemDB[sid].name === itemName) { targetItemId = sid; price = p; break; } } }
            if (!targetItemId) { UI.print("沒賣這個。", "error"); return; }
            const total = price * amount;
            if ((playerData.money || 0) < total) { UI.print("錢不夠。", "error"); return; }
            playerData.money -= total;
            if (!playerData.inventory) playerData.inventory = [];
            const exItem = playerData.inventory.find(i => i.id === targetItemId);
            const info = ItemDB[targetItemId];
            if (exItem) exItem.count += amount; else playerData.inventory.push({ id: targetItemId, name: info.name, count: amount });
            UI.print(`你買了 ${amount} 份 ${info.name}，花了 ${UI.formatMoney(total)}。`, "system", true);
            MessageSystem.broadcast(playerData.location, `${playerData.name} 向 ${npc.name} 買了 ${info.name}。`);
            await updatePlayer(userId, { money: playerData.money, inventory: playerData.inventory });
        }
    },

    'eat': {
        description: '吃',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("想吃什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            if (!invItem) return UI.print("你沒有這個。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'food') return UI.print("那不能吃！", "error");
            if (playerData.attributes.food >= playerData.attributes.maxFood) return UI.print("你吃不下了。", "system");
            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                playerData.attributes.food = Math.min(playerData.attributes.maxFood, playerData.attributes.food + itemData.value);
                UI.print(`你吃下了 ${invItem.name}。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 吃了 ${invItem.name}。`);
                await updatePlayer(userId, { "attributes.food": playerData.attributes.food });
            }
        }
    },

    'drink': {
        description: '喝',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("想喝什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            if (!invItem) return UI.print("你沒有這個。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'drink') return UI.print("那不能喝！", "error");
            if (playerData.attributes.water >= playerData.attributes.maxWater) return UI.print("你喝不下了。", "system");
            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                playerData.attributes.water = Math.min(playerData.attributes.maxWater, playerData.attributes.water + itemData.value);
                UI.print(`你喝了 ${invItem.name}。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 喝了 ${invItem.name}。`);
                await updatePlayer(userId, { "attributes.water": playerData.attributes.water });
            }
        }
    },

    'drop': {
        description: '丟',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("要丟什麼？", "system");
            const targetName = args[0];
            const inventory = playerData.inventory || [];
            const itemIndex = inventory.findIndex(i => i.id === targetName || i.name === targetName);
            if (itemIndex === -1) return UI.print("沒有這個東西。", "error");
            const item = inventory[itemIndex];
            if (item.count > 1) item.count--; else inventory.splice(itemIndex, 1);
            const success = await updateInventory(playerData, userId);
            if (success) {
                try {
                    await addDoc(collection(db, "room_items"), {
                        roomId: playerData.location,
                        itemId: item.id,
                        name: item.name,
                        droppedBy: playerData.name,
                        timestamp: new Date().toISOString()
                    });
                    UI.print(`你丟下了 ${item.name}。`, "system");
                    MessageSystem.broadcast(playerData.location, `${playerData.name} 丟下了 ${item.name}。`);
                    MapSystem.look(playerData);
                } catch (e) { console.error(e); UI.print("丟棄失敗。", "error"); }
            }
        }
    },

    'get': {
        description: '撿',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("要撿什麼？", "system");
            const targetId = args[0];
            try {
                const itemsRef = collection(db, "room_items");
                const q = query(itemsRef, where("roomId", "==", playerData.location), where("itemId", "==", targetId));
                const snapshot = await getDocs(q);
                if (snapshot.empty) return UI.print("地上沒這東西。", "error");
                const docSnap = snapshot.docs[0];
                const itemData = docSnap.data();
                await deleteDoc(doc(db, "room_items", docSnap.id));
                if (!playerData.inventory) playerData.inventory = [];
                const invItem = playerData.inventory.find(i => i.id === itemData.itemId);
                if (invItem) invItem.count++; else playerData.inventory.push({ id: itemData.itemId, name: itemData.name, count: 1 });
                await updateInventory(playerData, userId);
                UI.print(`你撿起了 ${itemData.name}。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 撿起了 ${itemData.name}。`);
                MapSystem.look(playerData);
            } catch (e) { console.error(e); UI.print("撿取失敗。", "error"); }
        }
    },

    'say': { description: '說', execute: (p, a) => { const msg = a.join(" "); UI.print(`你說：${msg}`, "chat"); MessageSystem.broadcast(p.location, `${p.name} 說：${msg}`, 'chat'); } },
    'emote': { description: '演', execute: (p, a) => { const msg = a.join(" "); UI.print(`${p.name} ${msg}`, "system"); MessageSystem.broadcast(p.location, `${p.name} ${msg}`, 'system'); } },
    'save': { description: '存檔', execute: async (p, a, u) => { if(MapSystem.getRoom(p.location).allowSave){ try{ await updatePlayer(u, {savePoint: p.location}); UI.print("紀錄已更新。", "system"); }catch(e){console.error(e);} }else UI.print("這裡不能存檔。", "error"); } },
    'recall': { description: '回城', execute: (p, a, u) => MapSystem.teleport(p, p.savePoint || "inn_start", u) },
    'suicide': { description: '刪除', execute: async (p, a, u) => { if(a[0]!=='confirm') return UI.print("輸入 suicide confirm 確認。", "error"); try{ await deleteDoc(doc(db,"players",u)); UI.print("資料已刪除。", "system"); await signOut(auth); }catch(e){ UI.print("失敗:"+e.message,"error"); } } }
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