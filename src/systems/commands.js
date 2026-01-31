// src/systems/commands.js
import { doc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 
import { MessageSystem } from "./messages.js"; 

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

// 技能等級顏色 (依照武俠小說境界)
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

// 輔助：更新背包到資料庫
async function updateInventory(playerData, userId) {
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, { inventory: playerData.inventory });
        return true;
    } catch (e) {
        console.error("更新背包失敗", e);
        return false;
    }
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

    if (room.npcs.includes(npcNameOrId)) {
        return NPCDB[npcNameOrId];
    }
    for (const npcId of room.npcs) {
        const npc = NPCDB[npcId];
        if (npc && npc.name === npcNameOrId) {
            return npc;
        }
    }
    return null;
}

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = UI.titleLine("江湖指南");
            msg += UI.txt(" 基本指令：", "#00ffff") + "score, skills, inventory (i)\n";
            msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
            msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy\n";
            msg += UI.txt(" 社交指令：", "#ff88ff") + "say, emote\n";
            msg += UI.txt(" 特殊指令：", "#ff0000") + "save, recall, suicide\n";
            msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
            UI.print(msg, 'normal', true);
        }
    },
    
    // --- 觀察 (Look) ---
    'look': {
        description: '觀察四周 (簡寫: l)',
        execute: (playerData, args) => {
            if (args && args.length > 0) {
                const target = args[0];
                const npc = findNPCInRoom(playerData.location, target);
                if (npc) {
                    let html = UI.titleLine(`${npc.name} (${npc.id})`);
                    html += UI.txt(npc.description, "#ddd") + "<br>";
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

    // --- 狀態 (Score) - 彩色版 ---
    'score': {
        description: '查看詳細屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const skills = playerData.skills || {};
            
            const atk = (attr.str * 10) + (skills.unarmed || 0);
            const def = (attr.con * 10) + (skills.parry || 0);
            const hitRate = (attr.dex * 10) + ((skills.unarmed || 0) * 2); 
            const dodge = (attr.dex * 10) + ((skills.dodge || 0) * 2);     
            const parry = (attr.str * 5) + (attr.con * 5) + ((skills.parry || 0) * 2); 

            const gender = playerData.gender || "未知";
            const moneyStr = UI.formatMoney(playerData.money || 0);

            // 使用 Grid 排版
            let html = UI.titleLine(`${playerData.name} 的狀態`);
            
            // 基礎資訊
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-bottom:5px;">`;
            html += `<div>${UI.attrLine("性別", gender)}</div>`;
            html += `<div>${UI.attrLine("門派", playerData.sect)}</div>`;
            html += `</div>`;
            html += `<div>${UI.attrLine("財產", moneyStr)}</div><br>`;

            // 三寶 (精氣神)
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.txt("【 精 與 靈 】", "#ff5555")}</div><div></div>`;
            html += `<div>${UI.attrLine("精", attr.hp + "/" + attr.maxHp)}</div>`;
            html += `<div>${UI.attrLine("靈力", attr.spiritual + "/" + attr.maxSpiritual)}</div>`;
            
            html += `<div>${UI.txt("【 氣 與 內 】", "#5555ff")}</div><div></div>`;
            html += `<div>${UI.attrLine("氣", attr.mp + "/" + attr.maxMp)}</div>`;
            html += `<div>${UI.attrLine("內力", attr.force + "/" + attr.maxForce)}</div>`;

            html += `<div>${UI.txt("【 神 與 法 】", "#ffff55")}</div><div></div>`;
            html += `<div>${UI.attrLine("神", attr.sp + "/" + attr.maxSp)}</div>`;
            html += `<div>${UI.attrLine("法力", attr.mana + "/" + attr.maxMana)}</div>`;
            html += `</div><br>`;

            // 生存
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("食物", attr.food + "/" + attr.maxFood)}</div>`;
            html += `<div>${UI.attrLine("飲水", attr.water + "/" + attr.maxWater)}</div>`;
            html += `</div><br>`;

            // 天賦屬性 (Cyan)
            html += UI.txt("【 天賦屬性 】", "#00ffff") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("膂力", attr.str)}</div><div>${UI.attrLine("膽識", attr.cor || 20)}</div>`;
            html += `<div>${UI.attrLine("悟性", attr.int)}</div><div>${UI.attrLine("靈性", attr.int)}</div>`;
            html += `<div>${UI.attrLine("根骨", attr.con)}</div><div>${UI.attrLine("定力", attr.per)}</div>`;
            html += `<div>${UI.attrLine("身法", attr.dex)}</div><div>${UI.attrLine("福緣", attr.kar)}</div>`;
            html += `</div><br>`;

            // 戰鬥屬性 (Green)
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

    // --- 技能 (Skills) - 彩色版 ---
    'skills': {
        description: '查看已習得武學',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);

            if (skillList.length === 0) {
                UI.print("你目前什麼都不會。", "chat");
                return;
            }

            let html = UI.titleLine(`${playerData.name} 的武學`);
            html += `<table style="width:100%; text-align:left;">`;
            
            const skillNames = {
                "unarmed": "基本拳腳", "dodge": "基本輕功",
                "parry": "基本招架", "force": "基本內功"
            };

            for (const [id, level] of skillList) {
                const name = skillNames[id] || id; 
                const desc = getSkillLevelDesc(level);
                // 技能名稱用亮白，等級用 Cyan
                html += `<tr>`;
                html += `<td style="color:#fff; width:120px;">${name}</td>`;
                html += `<td style="color:#00ffff; width:60px;">${level} 級</td>`;
                html += `<td>${desc}</td>`;
                html += `</tr>`;
            }
            html += `</table>`;
            html += UI.titleLine("End of Skills");
            UI.print(html, 'chat', true);
        }
    },
    'sk': { description: 'skills 簡寫', execute: (p) => commandRegistry['skills'].execute(p) },

    // --- 背包 (Inventory) - 彩色版 ---
    'inventory': {
        description: '查看背包與金錢',
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

                    // 物品名稱亮白，ID 深灰
                    const displayName = `${UI.txt(item.name, "#fff")} ${UI.txt("("+item.id+")", "#666")}`;
                    html += `<div>${displayName} x${item.count} ${actions}</div>`;
                });
            }
            html += "<br>" + UI.titleLine("End of Inventory");
            UI.print(html, 'chat', true);
        }
    },
    'i': { description: 'inventory 簡寫', execute: (p) => commandRegistry['inventory'].execute(p) },

    // --- 商品列表 (List) - 彩色版 ---
    'list': {
        description: '查看NPC販賣的商品',
        execute: (playerData, args) => {
            const room = MapSystem.getRoom(playerData.location);
            let targetNPC = null;
            if (args.length > 0) {
                targetNPC = findNPCInRoom(playerData.location, args[0]);
            } else {
                if (room.npcs && room.npcs.length > 0) {
                    targetNPC = NPCDB[room.npcs[0]];
                }
            }

            if (!targetNPC) return UI.print("這裡沒人在賣東西。", "error");
            if (!targetNPC.shop) return UI.print(`${targetNPC.name} 身上沒帶什麼東西賣。`, "chat");

            let html = UI.titleLine(`${targetNPC.name} 的商品列表`);
            
            for (const [itemId, price] of Object.entries(targetNPC.shop)) {
                const itemInfo = ItemDB[itemId];
                const itemName = itemInfo ? itemInfo.name : itemId;
                const priceStr = UI.formatMoney(price);
                
                const buyCmd = `buy ${itemId} 1 from ${targetNPC.id}`;
                const buyBtn = UI.makeCmd("[買1個]", buyCmd, "cmd-btn cmd-btn-buy");

                // 排版：名稱 ... 價格 [按鈕]
                const nameDisplay = `${UI.txt(itemName, "#fff")} ${UI.txt("("+itemId+")", "#666")}`;
                
                html += `<div style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dotted #333;">`;
                html += `<span>${nameDisplay}</span>`;
                html += `<span>${priceStr} ${buyBtn}</span>`;
                html += `</div>`;
            }
            html += UI.titleLine("End of List");
            UI.print(html, '', true);
        }
    },

    // --- 購買 (Buy) ---
    'buy': {
        description: '向NPC購買物品',
        execute: async (playerData, args, userId) => {
            if (args.length < 1) { UI.print("你想買什麼？(範例: buy rice)", "error"); return; }
            
            let itemName = args[0];
            let amount = 1;
            let npcName = null;

            if (args.length >= 2 && !isNaN(args[1])) amount = parseInt(args[1]);
            
            const fromIndex = args.indexOf('from');
            if (fromIndex !== -1 && fromIndex + 1 < args.length) {
                npcName = args[fromIndex + 1];
            } else {
                const room = MapSystem.getRoom(playerData.location);
                if (room.npcs && room.npcs.length > 0) npcName = room.npcs[0];
            }

            if (amount <= 0) { UI.print("你要買空氣嗎？", "error"); return; }

            const npc = findNPCInRoom(playerData.location, npcName);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            let targetItemId = null;
            let price = 0;

            if (npc.shop[itemName]) {
                targetItemId = itemName;
                price = npc.shop[itemName];
            } else {
                for (const [sid, p] of Object.entries(npc.shop)) {
                    if (ItemDB[sid] && ItemDB[sid].name === itemName) {
                        targetItemId = sid;
                        price = p;
                        break;
                    }
                }
            }

            if (!targetItemId) { UI.print(`${npc.name}(${npc.id}) 搖搖頭說：「客官，小店沒賣這個。」`, "chat"); return; }

            const totalPrice = price * amount;
            if ((playerData.money || 0) < totalPrice) {
                UI.print("你的錢不夠。(需要 " + UI.formatMoney(totalPrice) + ")", "error", true);
                return;
            }

            playerData.money -= totalPrice;
            if (!playerData.inventory) playerData.inventory = [];
            const existingItem = playerData.inventory.find(i => i.id === targetItemId);
            const itemInfo = ItemDB[targetItemId];

            if (existingItem) {
                existingItem.count += amount;
            } else {
                playerData.inventory.push({
                    id: targetItemId,
                    name: itemInfo.name,
                    count: amount
                });
            }

            UI.print(`你從 ${npc.name}(${npc.id}) 那裡買下了 ${amount} 份${itemInfo.name}(${targetItemId})，花費了 ${UI.formatMoney(totalPrice)}。`, "system", true);
            
            MessageSystem.broadcast(playerData.location, `${playerData.name} 向 ${npc.name} 買了一些 ${itemInfo.name}。`);

            try {
                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, {
                    money: playerData.money,
                    inventory: playerData.inventory
                });
            } catch (e) {
                console.error("交易失敗", e);
                UI.print("交易發生錯誤。", "error");
            }
        }
    },

    // --- 吃 (Eat) ---
    'eat': {
        description: '吃食物',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("你想吃什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'food') return UI.print("那個不能吃！", "error");
            
            const attr = playerData.attributes;
            if (attr.food >= attr.maxFood) return UI.print("你已經吃得很飽了。", "system");

            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                attr.food = Math.min(attr.maxFood, attr.food + itemData.value);
                UI.print(`你吃下了一份${invItem.name}，感覺體力恢復了。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 拿出 ${invItem.name} 吃幾口。`);
                
                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, { "attributes.food": attr.food });
            }
        }
    },

    // --- 喝 (Drink) ---
    'drink': {
        description: '喝飲料',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("你想喝什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'drink') return UI.print("那個不能喝！", "error");
            
            const attr = playerData.attributes;
            if (attr.water >= attr.maxWater) return UI.print("你一點也不渴。", "system");

            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                attr.water = Math.min(attr.maxWater, attr.water + itemData.value);
                UI.print(`你喝了一口${invItem.name}，感覺喉嚨滋潤多了。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 拿起 ${invItem.name} 喝了幾口。`);

                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, { "attributes.water": attr.water });
            }
        }
    },

    // --- 丟棄 (Drop) ---
    'drop': {
        description: '丟棄物品',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("你要丟掉什麼？", "system");
            const targetName = args[0];
            
            const inventory = playerData.inventory || [];
            const itemIndex = inventory.findIndex(i => i.id === targetName || i.name === targetName);

            if (itemIndex === -1) return UI.print("你身上沒有這個東西。", "error");
            
            const item = inventory[itemIndex];
            
            if (item.count > 1) item.count--;
            else inventory.splice(itemIndex, 1);

            const updateSuccess = await updateInventory(playerData, userId);
            if (!updateSuccess) return;

            try {
                await addDoc(collection(db, "room_items"), {
                    roomId: playerData.location,
                    itemId: item.id,
                    name: item.name,
                    droppedBy: playerData.name,
                    timestamp: new Date().toISOString()
                });
                
                UI.print(`你將 ${item.name} 丟棄在地上。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 丟下了一份 ${item.name}。`);
                
                MapSystem.look(playerData);

            } catch (e) {
                console.error("Drop failed", e);
                UI.print("丟棄失敗。", "error");
            }
        }
    },

    // --- 撿取 (Get) ---
    'get': {
        description: '撿取物品 (用法: get rice)',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("你要撿什麼？", "system");
            const targetId = args[0];

            try {
                const itemsRef = collection(db, "room_items");
                const q = query(itemsRef, 
                    where("roomId", "==", playerData.location),
                    where("itemId", "==", targetId)
                );
                
                const snapshot = await getDocs(q);
                if (snapshot.empty) {
                    return UI.print("地上沒有這個東西。", "error");
                }

                const docSnap = snapshot.docs[0];
                const itemData = docSnap.data();

                await deleteDoc(doc(db, "room_items", docSnap.id));

                if (!playerData.inventory) playerData.inventory = [];
                const invItem = playerData.inventory.find(i => i.id === itemData.itemId);
                
                if (invItem) {
                    invItem.count++;
                } else {
                    playerData.inventory.push({
                        id: itemData.itemId,
                        name: itemData.name,
                        count: 1
                    });
                }
                
                await updateInventory(playerData, userId);

                UI.print(`你撿起了一份 ${itemData.name}。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 撿起了一份 ${itemData.name}。`);
                
                MapSystem.look(playerData);

            } catch (e) {
                console.error("Get failed", e);
                UI.print("撿取失敗。", "error");
            }
        }
    },

    // --- 說話 (Say) ---
    'say': {
        description: '說話',
        execute: (playerData, args) => {
            if (args.length === 0) return UI.print("你想說什麼？", "system");
            const msg = args.join(" ");
            UI.print(`你說道：「${msg}」`, "chat");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 說道：「${msg}」`, 'chat');
        }
    },

    // --- 動作 (Emote) ---
    'emote': {
        description: '動作',
        execute: (playerData, args) => {
            if (args.length === 0) return UI.print("你想做什麼動作？", "system");
            const action = args.join(" ");
            UI.print(`${playerData.name} ${action}`, "system");
            MessageSystem.broadcast(playerData.location, `${playerData.name} ${action}`, 'system');
        }
    },

    // --- 存檔 (Save) ---
    'save': {
        description: '設定重生點',
        execute: async (playerData, args, userId) => {
            const currentRoom = MapSystem.getRoom(playerData.location);
            if (currentRoom && currentRoom.allowSave) {
                playerData.savePoint = playerData.location;
                try {
                    const playerRef = doc(db, "players", userId);
                    await updateDoc(playerRef, { savePoint: playerData.location });
                    UI.print("【系統】紀錄點已更新！", "system");
                } catch (e) { UI.print("存檔失敗：" + e.message, "error"); }
            } else {
                UI.print("這裡環境險惡，無法靜心紀錄。(請至客棧或門派大廳)", "error");
            }
        }
    },

    // --- 回城 (Recall) ---
    'recall': {
        description: '傳送回紀錄點',
        execute: (playerData, args, userId) => {
            const target = playerData.savePoint || "inn_start";
            MapSystem.teleport(playerData, target, userId);
        }
    },

    // --- 自殺 (Suicide) ---
    'suicide': {
        description: '刪除角色 (慎用)',
        execute: async (playerData, args, userId) => {
            if (args[0] !== 'confirm') {
                UI.print("【警告】這將永久刪除你的角色資料，無法復原！", "error");
                UI.print("若確定要自殺，請輸入： suicide confirm", "system");
                return;
            }

            try {
                UI.print("你長嘆一聲，決定結束這段江湖路...", "system");
                await deleteDoc(doc(db, "players", userId));
                UI.print("資料已刪除。", "system");
                await signOut(auth);
            } catch (e) {
                UI.print("自殺失敗：" + e.message, "error");
            }
        }
    }
};

// 註冊移動指令
Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = {
        description: `往 ${fullDir} 移動`,
        execute: (p, a, u) => MapSystem.move(p, fullDir, u)
    };
});
Object.values(dirMapping).forEach(fullDir => {
    if (!commandRegistry[fullDir]) {
        commandRegistry[fullDir] = {
            description: `往 ${fullDir} 移動`,
            execute: (p, a, u) => MapSystem.move(p, fullDir, u)
        };
    }
});

export const CommandSystem = {
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        if (!playerData) {
            UI.print("靈魂尚未歸位，請稍候...", "error");
            return;
        }
        const args = inputStr.trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();
        const command = commandRegistry[cmdName];

        if (command) {
            command.execute(playerData, args, userId);
        } else {
            UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error");
        }
    }
};