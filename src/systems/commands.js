// src/systems/commands.js
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
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, { inventory: inventory });
        return true;
    } catch (e) {
        console.error("更新背包失敗", e);
        return false;
    }
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
            let msg = "【江湖指南】\n";
            msg += "基本指令：score, skills, inventory (i)\n";
            msg += "生活指令：eat, drink, drop, look\n";
            msg += "交易指令：list (看商品), buy <物品> <數量> from <NPC>\n";
            msg += "社交指令：say, emote\n";
            msg += "特殊指令：save, recall, suicide\n";
            msg += "移動指令：n, s, e, w, u, d\n";
            UI.print(msg, 'system');
        }
    },
    
    // --- 修改：查看商品 (list) - 增加英文顯示 ---
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

            if (!targetNPC) {
                UI.print("這裡沒有這個人，或者沒人在賣東西。", "error");
                return;
            }

            if (!targetNPC.shop) {
                UI.print(`${targetNPC.name}(${targetNPC.id}) 身上沒帶什麼東西賣。`, "chat");
                return;
            }

            let msg = `\n【 ${targetNPC.name}(${targetNPC.id}) 的商品列表 】\n`;
            msg += `--------------------------------------------------\n`;
            for (const [itemId, price] of Object.entries(targetNPC.shop)) {
                const itemInfo = ItemDB[itemId];
                const itemName = itemInfo ? itemInfo.name : itemId;
                
                // 格式：白米飯(rice) ...... 10兩
                const displayStr = `${itemName}(${itemId})`;
                // 使用 padEnd 讓排版整齊一點 (全形字算2格比較複雜，這裡簡單用空格補齊)
                msg += ` ${displayStr.padEnd(20, ' ')} ： 每單位 ${price} 兩\n`;
            }
            msg += `--------------------------------------------------\n`;
            msg += `(指令範例：buy rice 1 from waiter)\n`;
            UI.print(msg, 'chat');
        }
    },

    'buy': {
        description: '向NPC購買物品',
        execute: async (playerData, args, userId) => {
            if (args.length < 1) { // 至少要有 buy item
                 // 如果只有 buy，沒給參數，提示錯誤
                 UI.print("你想買什麼？(範例: buy rice)", "error");
                 return;
            }
            // 處理預設值：buy rice -> amount=1, npc=自動抓
            let itemName = args[0];
            let amount = 1;
            let npcName = null;

            // 簡單的參數解析邏輯
            if (args.length >= 2 && !isNaN(args[1])) {
                amount = parseInt(args[1]);
            }
            
            const fromIndex = args.indexOf('from');
            if (fromIndex !== -1 && fromIndex + 1 < args.length) {
                npcName = args[fromIndex + 1];
            } else {
                const room = MapSystem.getRoom(playerData.location);
                if (room.npcs && room.npcs.length > 0) {
                    npcName = room.npcs[0];
                }
            }

            if (amount <= 0) { UI.print("你要買空氣嗎？", "error"); return; }

            const npc = findNPCInRoom(playerData.location, npcName);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            // 允許輸入 ID 或 名稱
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

            if (!targetItemId) {
                UI.print(`${npc.name}(${npc.id}) 搖搖頭說：「客官，小店沒賣這個。」`, "chat");
                return;
            }

            const totalPrice = price * amount;
            if ((playerData.money || 0) < totalPrice) {
                UI.print("你的錢不夠。(需要 " + totalPrice + " 兩)", "error");
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

            UI.print(`你從 ${npc.name}(${npc.id}) 那裡買下了 ${amount} 份${itemInfo.name}(${targetItemId})，花費了 ${totalPrice} 兩。`, "system");

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
            
            // 呼叫 MapSystem.look，它現在會負責顯示房間內的 NPC
            MapSystem.look(playerData);
        }
    },
    'l': { description: 'look 簡寫', execute: (p, a) => commandRegistry['look'].execute(p, a) },

    // ... (其他指令 eat, drink, drop, say, emote, score, skills, inventory, suicide, save, recall 保持不變) ...
    // 為節省篇幅，請保留您原本檔案中的這些指令，不要刪除
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
    'inventory': {
        description: '查看背包與金錢',
        execute: (playerData) => {
            const items = playerData.inventory || [];
            const money = playerData.money || 0;
            let msg = `\n【 ${playerData.name} 的背包 】\n--------------------------------------------------\n`;
            msg += ` 身上的錢：${money} 兩白銀\n--------------------------------------------------\n`;
            if (items.length === 0) { msg += ` 目前身上空空如也。\n`; } 
            else { items.forEach(item => { msg += ` ${item.name}(${item.id}) x${item.count}\n`; }); }
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'i': { description: 'inventory 簡寫', execute: (p) => commandRegistry['inventory'].execute(p) },
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