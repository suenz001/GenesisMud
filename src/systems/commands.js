// src/systems/commands.js
import { doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js"; // 新增：引入物品資料庫

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
        // 用完了，移除
        inventory.splice(itemIndex, 1);
    }

    // 更新資料庫
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, { inventory: inventory });
        return true;
    } catch (e) {
        console.error("更新背包失敗", e);
        return false;
    }
}

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = "【江湖指南】\n";
            msg += "基本指令：score, skills, inventory (i)\n";
            msg += "生活指令：eat (吃), drink (喝), drop (丟), look (看物品)\n";
            msg += "社交指令：say (說話), emote (動作)\n";
            msg += "特殊指令：save, recall, suicide\n";
            msg += "移動指令：n, s, e, w, u, d\n";
            UI.print(msg, 'system');
        }
    },
    
    // --- 吃東西 (eat) ---
    'eat': {
        description: '吃食物 (用法: eat rice)',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) {
                UI.print("你想吃什麼？", "system");
                return;
            }
            const targetName = args[0];
            // 搜尋背包
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) {
                UI.print("你身上沒有這樣東西。", "error");
                return;
            }

            // 查閱資料庫屬性
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'food') {
                UI.print("那個不能吃！", "error");
                return;
            }

            const attr = playerData.attributes;
            if (attr.food >= attr.maxFood) {
                UI.print("你已經吃得很飽了。", "system");
                return;
            }

            // 執行消耗
            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                // 恢復數值
                const recover = itemData.value;
                attr.food = Math.min(attr.maxFood, attr.food + recover);
                
                UI.print(`你吃下了一份${invItem.name}，感覺體力恢復了。`, "system");
                UI.print(`(食物：${attr.food}/${attr.maxFood})`, "chat");
                
                // 更新屬性到 DB
                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, { "attributes.food": attr.food });
            }
        }
    },

    // --- 喝水 (drink) ---
    'drink': {
        description: '喝飲料 (用法: drink waterskin)',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) {
                UI.print("你想喝什麼？", "system");
                return;
            }
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) {
                UI.print("你身上沒有這樣東西。", "error");
                return;
            }

            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'drink') {
                UI.print("那個不能喝！", "error");
                return;
            }

            const attr = playerData.attributes;
            if (attr.water >= attr.maxWater) {
                UI.print("你一點也不渴。", "system");
                return;
            }

            // 執行消耗 (這裡假設水袋喝了會消失，如果要改成喝了變空瓶，邏輯會不同，這裡先簡單處理)
            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                const recover = itemData.value;
                attr.water = Math.min(attr.maxWater, attr.water + recover);
                
                UI.print(`你喝了一口${invItem.name}，感覺喉嚨滋潤多了。`, "system");
                UI.print(`(飲水：${attr.water}/${attr.maxWater})`, "chat");

                const playerRef = doc(db, "players", userId);
                await updateDoc(playerRef, { "attributes.water": attr.water });
            }
        }
    },

    // --- 丟棄物品 (drop) ---
    'drop': {
        description: '丟棄物品 (用法: drop rice)',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) {
                UI.print("你要丟掉什麼？", "system");
                return;
            }
            const targetName = args[0];
            const success = await consumeItem(playerData, userId, targetName);
            if (success) {
                UI.print(`你將 ${targetName} 丟棄在地上。`, "system");
                // 未來可以在這裡將物品加入地圖的 objects 列表
            }
        }
    },

    // --- 說話 (say) ---
    'say': {
        description: '說話 (用法: say 你好)',
        execute: (playerData, args) => {
            if (args.length === 0) {
                UI.print("你想說什麼？", "system");
                return;
            }
            const msg = args.join(" ");
            // 這裡目前只有自己看得到，未來加上多人連線會廣播給同房間的人
            UI.print(`你說道：「${msg}」`, "chat"); 
        }
    },

    // --- 表情動作 (emote) ---
    'emote': {
        description: '做動作 (用法: emote 大笑)',
        execute: (playerData, args) => {
            if (args.length === 0) {
                UI.print("你想做什麼動作？", "system");
                return;
            }
            const action = args.join(" ");
            UI.print(`${playerData.name} ${action}`, "system"); // 顯示黃色文字
        }
    },

    // --- 觀察物品 (look item) ---
    'look': {
        description: '觀察 (用法: look 或 look rice)',
        execute: (playerData, args) => {
            // 如果沒有參數，就是看地圖
            if (!args || args.length === 0) {
                MapSystem.look(playerData);
                return;
            }
            
            // 如果有參數，檢查是不是在看身上的東西
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (invItem) {
                const itemData = ItemDB[invItem.id];
                UI.print(`【${itemData.name}】`, "system");
                UI.print(itemData.desc || "看起來很普通。");
                UI.print(`數量：${invItem.count}`);
                return;
            }

            // 如果看的是自己
            if (targetName === 'me' || targetName === 'self') {
                commandRegistry['score'].execute(playerData);
                return;
            }

            UI.print("你沒看到那樣東西。", "error");
        }
    },
    'l': { description: 'look 簡寫', execute: (p, a) => commandRegistry['look'].execute(p, a) },

    // ... (保留原本的 score, skills, inventory, suicide, save, recall, status) ...
    'score': {
        description: '查看詳細屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const combat = playerData.combat || {};
            const atk = combat.attack || (attr.str * 10);
            const def = combat.defense || (attr.con * 10);
            const gender = playerData.gender || "未知";

            let msg = `\n【 ${playerData.name} 的狀態 】\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 性別：${gender}     門派：${playerData.sect}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 精：${attr.hp}/${attr.maxHp}   靈力：${attr.spiritual}/${attr.maxSpiritual}\n`;
            msg += ` 氣：${attr.mp}/${attr.maxMp}   內力：${attr.force}/${attr.maxForce}\n`;
            msg += ` 神：${attr.sp}/${attr.maxSp}   法力：${attr.mana}/${attr.maxMana}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 食物：${attr.food}/${attr.maxFood}  飲水：${attr.water}/${attr.maxWater}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 膂力：${attr.str}  膽識：${attr.cor || 20}\n`;
            msg += ` 悟性：${attr.int}  靈性：${attr.int}\n`;
            msg += ` 根骨：${attr.con}  定力：${attr.per}\n`;
            msg += ` 身法：${attr.dex}  福緣：${attr.kar}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 攻擊力：${atk}     防禦力：${def}\n`;
            msg += `--------------------------------------------------\n`;
            
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
            if (skillList.length === 0) {
                UI.print("你目前什麼都不會。", "chat");
                return;
            }
            let msg = `\n【 ${playerData.name} 的武學 】\n`;
            msg += `--------------------------------------------------\n`;
            const skillNames = { "unarmed": "基本拳腳", "dodge": "基本輕功", "parry": "基本招架", "force": "基本內功" };
            for (const [id, level] of skillList) {
                const name = skillNames[id] || id; 
                const desc = getSkillLevelDesc(level);
                const nameStr = name.padEnd(10, '　'); 
                msg += ` ${nameStr} ${level.toString().padStart(3)}級 / ${desc}\n`;
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
            let msg = `\n【 ${playerData.name} 的背包 】\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 身上的錢：${money} 兩白銀\n`;
            msg += `--------------------------------------------------\n`;
            if (items.length === 0) {
                msg += ` 目前身上空空如也。\n`;
            } else {
                items.forEach(item => {
                    msg += ` ${item.name} (${item.id}) x${item.count}\n`;
                });
            }
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'i': { description: 'inventory 簡寫', execute: (p) => commandRegistry['inventory'].execute(p) },

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
            } else {
                UI.print("這裡環境險惡，無法靜心紀錄。(請至客棧或門派大廳)", "error");
            }
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