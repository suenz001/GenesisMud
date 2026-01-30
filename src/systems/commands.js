// src/systems/commands.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js"; 

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 'out': 'out', 'enter': 'enter',
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = "【江湖指南】\n";
            msg += "基本指令：look, status, help\n";
            msg += "特殊指令：save (存檔), recall (回城)\n";
            msg += "移動指令：n, s, e, w, u, d, out, enter\n";
            UI.print(msg, 'system');
        }
    },
    'look': {
        description: '觀察四周 (簡寫: l)',
        execute: (playerData) => MapSystem.look(playerData)
    },
    'l': {
        description: 'look 的簡寫',
        execute: (playerData) => MapSystem.look(playerData)
    },
    'status': {
        description: '查看個人狀態 (簡寫: st)',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            let msg = `【${playerData.name} 的狀態】\n`;
            msg += ` 地點：${MapSystem.getRoom(playerData.location)?.title || '未知'}\n`;
            msg += ` 存檔點：${MapSystem.getRoom(playerData.savePoint || 'inn_start')?.title || '無'}\n`;
            msg += ` ------------------\n`;
            msg += ` Essence (精): ${attr.hp}/100\n`;
            msg += ` Breath  (氣): ${attr.mp}/100\n`;
            msg += ` Spirit  (神): ${attr.sp}/100\n`;
            UI.print(msg, 'chat');
        }
    },
    
    // --- 新增：存檔指令 ---
    'save': {
        description: '設定重生點 (僅限客棧或門派)',
        execute: async (playerData, args, userId) => {
            const currentRoom = MapSystem.getRoom(playerData.location);
            
            // 檢查該房間是否允許存檔 (由 WorldMap 中的 allowSave 決定)
            if (currentRoom && currentRoom.allowSave) {
                playerData.savePoint = playerData.location;
                
                try {
                    const playerRef = doc(db, "players", userId);
                    await updateDoc(playerRef, {
                        savePoint: playerData.location
                    });
                    UI.print("【系統】紀錄點已更新！下次 Recall 將回到這裡。", "system");
                } catch (e) {
                    UI.print("存檔失敗：" + e.message, "error");
                }
            } else {
                UI.print("這裡環境險惡，無法靜心紀錄。(請至客棧或門派大廳)", "error");
            }
        }
    },

    // --- 新增：回城指令 ---
    'recall': {
        description: '傳送回紀錄點',
        execute: (playerData, args, userId) => {
            const target = playerData.savePoint || "inn_start"; // 預設回客棧
            MapSystem.teleport(playerData, target, userId);
        }
    }
};

// 移動指令註冊
Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = {
        description: `往 ${fullDir} 移動`,
        execute: (playerData, args, userId) => {
            MapSystem.move(playerData, fullDir, userId);
        }
    };
});
Object.values(dirMapping).forEach(fullDir => {
    if (!commandRegistry[fullDir]) {
        commandRegistry[fullDir] = {
            description: `往 ${fullDir} 移動`,
            execute: (playerData, args, userId) => {
                MapSystem.move(playerData, fullDir, userId);
            }
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