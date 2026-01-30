// src/systems/commands.js (請完全覆蓋)
import { doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

function getSkillLevelDesc(level) {
    if (level < 10) return "初學乍練";
    if (level < 30) return "略有小成";
    if (level < 60) return "駕輕就熟";
    if (level < 100) return "融會貫通";
    if (level < 150) return "爐火純青";
    if (level < 200) return "出類拔萃";
    if (level < 300) return "登峰造極";
    return "出神入化";
}

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
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, { inventory: inventory });
        return true;
    } catch (e) { return false; }
}

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
            let msg = "【江湖指南】\n";
            msg += "基本指令：score, skills, inventory (i)\n";
            msg += "生活指令：eat, drink, drop, look\n";
            msg += "交易指令：list, buy\n";
            msg += "社交指令：say, emote\n";
            msg += "特殊指令：save, recall, suicide\n";
            UI.print(msg, 'system');
        }
    },
    
    // --- 互動版 list ---
    'list': {
        description: '查看NPC販賣的商品',
        execute: (playerData, args) => {
            const room = MapSystem.getRoom(playerData.location);
            let targetNPC = null;
            if (args.length > 0) {
                targetNPC = findNPCInRoom(playerData.location, args[0]);
            } else {
                if (room.npcs && room.npcs.length > 0) targetNPC = NPCDB[room.npcs[0]];
            }

            if (!targetNPC) {
                UI.print("這裡沒有這個人，或者沒人在賣東西。", "error");
                return;
            }

            if (!targetNPC.shop) {
                UI.print(`${targetNPC.name} 身上沒帶什麼東西賣。`, "chat");
                return;
            }

            // 使用 HTML 輸出
            let html = `<br><div style="color:#00ffff">【 ${targetNPC.name}(${targetNPC.id}) 的商品列表 】</div>`;
            html += `--------------------------------------------------<br>`;
            
            for (const [itemId, price] of Object.entries(targetNPC.shop)) {
                const itemInfo = ItemDB[itemId];
                const itemName = itemInfo ? itemInfo.name : itemId;
                
                // 產生 [買] 按鈕： buy <item> 1 from <npc>
                const buyCmd = `buy ${itemId} 1 from ${targetNPC.id}`;
                const buyBtn = UI.makeCmd("[買1個]", buyCmd, "cmd-btn cmd-btn-buy");

                html += `${itemName}(${itemId}) ... 每單位 ${price} 兩 ${buyBtn}<br>`;
            }
            html += `--------------------------------------------------<br>`;
            UI.print(html, '', true); // isHtml = true
        }
    },

    // --- 互動版 inventory ---
    'inventory': {
        description: '查看背包與金錢',
        execute: (playerData) => {
            const items = playerData.inventory || [];
            const money = playerData.money || 0;

            let html = `<br><div style="color:#00ffff">【 ${playerData.name} 的背包 】</div>`;
            html += `--------------------------------------------------<br>`;
            html += ` 身上的錢：${money} 兩白銀<br>`;
            html += `--------------------------------------------------<br>`;
            
            if (items.length === 0) {
                html += ` 目前身上空空如也。<br>`;
            } else {
                items.forEach(item => {
                    const itemData = ItemDB[item.id];
                    let actions = "";
                    
                    // 根據類型產生按鈕
                    if (itemData) {
                        if (itemData.type === 'food') actions += UI.makeCmd("[吃]", `eat ${item.id}`, "cmd-btn");
                        if (itemData.type === 'drink') actions += UI.makeCmd("[喝]", `drink ${item.id}`, "cmd-btn");
                    }
                    actions += UI.makeCmd("[丟]", `drop ${item.id}`, "cmd-btn");
                    actions += UI.makeCmd("[看]", `look ${item.id}`, "cmd-btn");

                    html += ` ${item.name} (${item.id}) x${item.count} ${actions}<br>`;
                });
            }
            html += `--------------------------------------------------<br>`;
            UI.print(html, '', true);
        }
    },
    'i': { description: 'inventory 簡寫', execute: (p) => commandRegistry['inventory'].execute(p) },

    // ... (其他 buy, eat, drink, look 等指令保持邏輯不變，但請保留在檔案中) ...
    // 為確保檔案完整，以下重複貼上其他指令
    'buy': {
        description: '向NPC購買物品',
        execute: async (playerData, args, userId) => {
            if (args.length < 1) { UI.print("你想買什麼？", "error"); return; }
            let itemName = args[0];
            let amount = 1;
            let npcName = null;
            if (args.length >= 2 && !isNaN(args[1])) amount = parseInt(args[1]);
            const fromIndex = args.indexOf('from');
            if (fromIndex !== -1 && fromIndex + 1 < args.length) npcName = args[fromIndex + 1];
            else {
                const room = MapSystem.getRoom(playerData.location);
                if (room.npcs && room.npcs.length > 0) npcName = room.npcs[0];
            }

            const npc = findNPCInRoom(playerData.location, npcName);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            let targetItemId = null;
            let price = 0;
            if (npc.shop[itemName]) { targetItemId = itemName; price = npc.shop[itemName]; }
            else {
                for (const [sid, p] of Object.entries(npc.shop)) {
                    if (ItemDB[sid] && ItemDB[sid].name === itemName) { targetItemId = sid; price = p; break; }
                }
            }

            if (!targetItemId) { UI.print(`沒有賣這個。`, "chat"); return; }
            const totalPrice = price * amount;
            if ((playerData.money || 0) < totalPrice) { UI.print("錢不夠。", "error"); return; }

            playerData.money -= totalPrice;
            if (!playerData.inventory) playerData.inventory = [];
            const existingItem = playerData.inventory.find(i => i.id === targetItemId);
            const itemInfo = ItemDB[targetItemId];

            if (existingItem) existingItem.count += amount;
            else playerData.inventory.push({ id: targetItemId, name: itemInfo.name, count: amount });

            UI.print(`你買了 ${amount} 份${itemInfo.name}，花了 ${totalPrice} 兩。`, "system");
            try {
                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, { money: playerData.money, inventory: playerData.inventory });
            } catch (e) { UI.print("交易錯誤。", "error"); }
        }
    },
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
                UI.print(`你吃下了一份${invItem.name}。`, "system");
                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, { "attributes.food": attr.food });
            }
        }
    },
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
                UI.print(`你喝了一口${invItem.name}。`, "system");
                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, { "attributes.water": attr.water });
            }
        }
    },
    'drop': {
        description: '丟棄物品',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("你要丟掉什麼？", "system");
            const success = await consumeItem(playerData, userId, args[0]);
            if (success) UI.print(`你將 ${args[0]} 丟棄在地上。`, "system");
        }
    },
    'look': {
        description: '觀察四周 (簡寫: l)',
        execute: (playerData, args) => {
            if (args && args.length > 0) {
                const target = args[0];
                const npc = findNPCInRoom(playerData.location, target);
                if (npc) {
                    UI.print(`【${npc.name}(${npc.id})】`, "system");
                    UI.print(npc.description);
                    return;
                }
                const invItem = playerData.inventory.find(i => i.id === target || i.name === target);
                if (invItem) {
                    const itemData = ItemDB[invItem.id];
                    UI.print(`【${itemData.name}(${invItem.id})】`, "system");
                    UI.print(itemData.desc);
                    return;
                }
                UI.print("你看不到那個東西。", "error");
                return;
            }
            MapSystem.look(playerData);
        }
    },
    'l': { description: 'look 簡寫', execute: (p, a) => commandRegistry['look'].execute(p, a) },
    'say': { description: '說話', execute: (p, a) => { UI.print(`你說道：「${a.join(" ")}」`, "chat"); } },
    'emote': { description: '動作', execute: (p, a) => { UI.print(`${p.name} ${a.join(" ")}`, "system"); } },
    'score': {
        description: '查看詳細屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const combat = playerData.combat || {};
            const atk = combat.attack || (attr.str * 10);
            const def = combat.defense || (attr.con * 10);
            const gender = playerData.gender || "未知";
            let msg = `\n【 ${playerData.name} 的狀態 】\n--------------------------------------------------\n`;
            msg += ` 性別：${gender}     門派：${playerData.sect}\n--------------------------------------------------\n`;
            msg += ` 精：${attr.hp}/${attr.maxHp}   靈力：${attr.spiritual}/${attr.maxSpiritual}\n`;
            msg += ` 氣：${attr.mp}/${attr.maxMp}   內力：${attr.force}/${attr.maxForce}\n`;
            msg += ` 神：${attr.sp}/${attr.maxSp}   法力：${attr.mana}/${attr.maxMana}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 食物：${attr.food}/${attr.maxFood}  飲水：${attr.water}/${attr.maxWater}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 攻擊力：${atk}     防禦力：${def}\n--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'sc': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },
    'hp': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },
    'skills': {
        description: '查看已習得武學',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);
            if (skillList.length === 0) return UI.print("你目前什麼都不會。", "chat");
            let msg = `\n【 ${playerData.name} 的武學 】\n--------------------------------------------------\n`;
            const skillNames = { "unarmed": "基本拳腳", "dodge": "基本輕功", "parry": "基本招架", "force": "基本內功" };
            for (const [id, level] of skillList) {
                const name = skillNames[id] || id;
                const desc = getSkillLevelDesc(level);
                msg += ` ${name.padEnd(10, '　')} ${level.toString().padStart(3)}級 / ${desc}\n`;
            }
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'sk': { description: 'skills 簡寫', execute: (p) => commandRegistry['skills'].execute(p) },
    'suicide': {
        description: '刪除角色',
        execute: async (playerData, args, userId) => {
            if (args[0] !== 'confirm') {
                UI.print("【警告】這將永久刪除你的角色，無法復原！", "error");
                UI.print("若確定要自殺，請輸入： suicide confirm", "system");
                return;
            }
            try {
                UI.print("你長嘆一聲，決定結束這段江湖路...", "system");
                await deleteDoc(doc(db, "players", userId));
                UI.print("資料已刪除。", "system");
                await signOut(auth);
            } catch (e) { UI.print("自殺失敗：" + e.message, "error"); }
        }
    },
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
            } else { UI.print("這裡環境險惡，無法靜心紀錄。", "error"); }
        }
    },
    'recall': {
        description: '傳送回紀錄點',
        execute: (playerData, args, userId) => {
            const target = playerData.savePoint || "inn_start";
            MapSystem.teleport(playerData, target, userId);
        }
    }
};

Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = {
        description: `往 ${fullDir} 移動`,
        execute: (p, a, u) => MapSystem.move(p, fullDir, u)
    };
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
        if (command) { command.execute(playerData, args, userId); } 
        else { UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error"); }
    }
};