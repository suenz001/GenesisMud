// src/systems/commands.js
import { UI } from "../ui.js";
import { MapSystem } from "./map.js"; // 引入地圖系統

// 輔助：方向縮寫對應
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
            msg += "移動指令：n, s, e, w, u, d, out, enter\n";
            UI.print(msg, 'system');
        }
    },
    'look': {
        description: '觀察四周 (簡寫: l)',
        execute: (playerData) => {
            MapSystem.look(playerData);
        }
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
            msg += ` 地點：${MapSystem.getRoom(playerData.location)?.title || '未知區域'}\n`;
            msg += ` ------------------\n`;
            msg += ` 精：${attr.hp}/100  氣：${attr.mp}/100\n`;
            msg += ` 神：${attr.sp}/100  靈：${attr.spiritual}\n`;
            msg += ` 門派：${playerData.sect === 'none' ? '無門無派' : playerData.sect}`;
            UI.print(msg, 'chat');
        }
    },
    'st': { 
        description: 'status 的簡寫',
        execute: (playerData) => commandRegistry['status'].execute(playerData)
    }
};

// 動態註冊移動指令 (把 n, s, e, w... 全部加進去)
Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = {
        description: `往 ${fullDir} 移動`,
        execute: (playerData, args, userId) => {
            MapSystem.move(playerData, fullDir, userId);
        }
    };
});

// 為了讓全名也能用 (例如打 north)
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
    // 注意：這裡多加了一個 userId 參數，因為移動需要存檔
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        
        // 如果玩家資料還沒載入完
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