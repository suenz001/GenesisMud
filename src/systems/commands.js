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
    // 使用抽離出的 updateInventory 函式
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
            let msg = "【江湖指南】\n";
            msg += "基本指令：score, skills, inventory (i)\n";
            msg += "生活指令：eat, drink, drop, get, look\n";
            msg += "交易指令：list, buy\n";
            msg += "社交指令：say, emote\n";
            msg += "特殊指令：save, recall, suicide\n";
            msg += "移動指令：n, s, e, w, u, d\n";
            UI.print(msg, 'system');
        }
    },
    
    // --- 觀察 (Look) ---
    'look': {
        description: '觀察四周 (簡寫: l)',
        execute: (playerData, args) => {
            // 如果有參數 (look item / look npc)
            if (args && args.length > 0) {
                const target = args[0];
                // 1. 先找 NPC
                const npc = findNPCInRoom(playerData.location, target);
                if (npc) {
                    UI.print(`【${npc.name}(${npc.id})】`, "system");
                    UI.print(npc.description);
                    return;
                }
                // 2. 再找身上的物品
                const invItem = playerData.inventory.find(i => i.id === target || i.name === target);
                if (invItem) {
                    const itemData = ItemDB[invItem.id];
                    UI.print(`【${itemData.name}(${invItem.id})】`, "system");
                    UI.print(itemData.desc);
                    return;
                }
                // 3. (進階可選) 找地上的物品，這裡暫略，直接顯示找不到
                UI.print("你看不到那個東西。", "error");
                return;
            }
            
            // 呼叫 MapSystem.look 顯示房間資訊 (包含地上物品顯示邏輯)
            MapSystem.look(playerData);
        }
    },
    'l': { description: 'look 簡寫', execute: (p, a) => commandRegistry['look'].execute(p, a) },

    // --- 狀態 (Score) ---
    'score': {
        description: '查看詳細屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const skills = playerData.skills || {};
            const combat = playerData.combat || {}; 
            
            // 動態計算戰鬥屬性
            const atk = (attr.str * 10) + (skills.unarmed || 0);
            const def = (attr.con * 10) + (skills.parry || 0);
            
            const hitRate = (attr.dex * 10) + ((skills.unarmed || 0) * 2); // 命中
            const dodge = (attr.dex * 10) + ((skills.dodge || 0) * 2);     // 閃避
            const parry = (attr.str * 5) + (attr.con * 5) + ((skills.parry || 0) * 2); // 招架

            const gender = playerData.gender || "未知";
            const moneyStr = UI.formatMoney(playerData.money || 0);

            let msg = `\n【 ${playerData.name} 的狀態 】\n--------------------------------------------------\n`;
            msg += ` 性別：${gender}     門派：${playerData.sect}\n`;
            msg += ` 財產：${moneyStr}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 精：${attr.hp}/${attr.maxHp}   靈力：${attr.spiritual}/${attr.maxSpiritual}\n`;
            msg += ` 氣：${attr.mp}/${attr.maxMp}   內力：${attr.force}/${attr.maxForce}\n`;
            msg += ` 神：${attr.sp}/${attr.maxSp}   法力：${attr.mana}/${attr.maxMana}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 食物：${attr.food}/${attr.maxFood}  飲水：${attr.water}/${attr.maxWater}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 攻擊力：${atk}     防禦力：${def}\n`;
            msg += ` 命中率：${hitRate}     閃避率：${dodge}\n`;
            msg += ` 招架率：${parry}     殺氣：0\n`;
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat', true);
        }
    },
    'sc': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },
    'hp': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },

    // --- 技能 (Skills) ---
    'skills': {
        description: '查看已習得武學',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);

            if (skillList.length === 0) {
                UI.print("你目前什麼都不會。", "chat");
                return;
            }

            let msg = `\n【 ${playerData.name} 的武學 】\n`;
            msg += `--------------------------------------------------\n`;
            
            const skillNames = {
                "unarmed": "基本拳腳",
                "dodge": "基本輕功",
                "parry": "基本招架",
                "force": "基本內功"
            };

            for (const [id, level] of skillList) {
                const name = skillNames[id] || id; 
                const desc = getSkillLevelDesc(level);
                // 簡單對齊
                const nameStr = name.padEnd(10, '　'); 
                msg += ` ${nameStr} ${level.toString().padStart(3)}級 / ${desc}\n`;
            }
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'sk': { description: 'skills 簡寫', execute: (p) => commandRegistry['skills'].execute(p) },

    // --- 背包 (Inventory) ---
    'inventory': {
        description: '查看背包與金錢',
        execute: (playerData) => {
            const items = playerData.inventory || [];
            const moneyStr = UI.formatMoney(playerData.money || 0);

            let html = `<br><div style="color:#00ffff">【 ${playerData.name} 的背包 】</div>`;
            html += `--------------------------------------------------<br>`;
            html += ` 財產：${moneyStr}<br>`;
            html += `--------------------------------------------------<br>`;
            
            if (items.length === 0) {
                html += ` 目前身上空空如也。<br>`;
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

                    html += ` ${item.name} (${item.id}) x${item.count} ${actions}<br>`;
                });
            }
            html += `--------------------------------------------------<br>`;
            UI.print(html, '', true);
        }
    },
    'i': { description: 'inventory 簡寫', execute: (p) => commandRegistry['inventory'].execute(p) },

    // --- 商品列表 (List) ---
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
                UI.print(`${targetNPC.name} 身上沒帶什麼東西賣。`, "chat");
                return;
            }

            let html = `<br><div style="color:#00ffff">【 ${targetNPC.name}(${targetNPC.id}) 的商品列表 】</div>`;
            html += `--------------------------------------------------<br>`;
            
            for (const [itemId, price] of Object.entries(targetNPC.shop)) {
                const itemInfo = ItemDB[itemId];
                const itemName = itemInfo ? itemInfo.name : itemId;
                const priceStr = UI.formatMoney(price);
                const buyCmd = `buy ${itemId} 1 from ${targetNPC.id}`;
                const buyBtn = UI.makeCmd("[買1個]", buyCmd, "cmd-btn cmd-btn-buy");

                html += `${itemName}(${itemId}) ... ${priceStr} ${buyBtn}<br>`;
            }
            html += `--------------------------------------------------<br>`;
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

            // 扣錢
            playerData.money -= totalPrice;
            
            // 加物品
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

            // 修正點：加入 true 參數以正確解析 formatMoney 返回的 HTML
            UI.print(`你從 ${npc.name}(${npc.id}) 那裡買下了 ${amount} 份${itemInfo.name}(${targetItemId})，花費了 ${UI.formatMoney(totalPrice)}。`, "system", true);
            
            // 廣播
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
                // 廣播
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
                // 廣播
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
            
            // 從背包移除 1 個
            if (item.count > 1) item.count--;
            else inventory.splice(itemIndex, 1);

            // 寫入背包更新
            const updateSuccess = await updateInventory(playerData, userId);
            if (!updateSuccess) return;

            // 寫入掉落物到資料庫 (room_items)
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
                
                // 刷新畫面顯示掉落物
                MapSystem.look(playerData);

            } catch (e) {
                console.error("Drop failed", e);
                UI.print("丟棄失敗。(請確認 Firestore Rules)", "error");
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

                // 撿起第一個符合的
                const docSnap = snapshot.docs[0];
                const itemData = docSnap.data();

                // 1. 從地上移除
                await deleteDoc(doc(db, "room_items", docSnap.id));

                // 2. 加入背包
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
                
                // 1. 刪除資料庫文件
                await deleteDoc(doc(db, "players", userId));
                UI.print("資料已刪除。", "system");

                // 2. 登出
                await signOut(auth);

            } catch (e) {
                UI.print("自殺失敗(連死都不行?)：" + e.message, "error");
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