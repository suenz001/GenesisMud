// src/systems/commands.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js"; 

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

// 輔助：武學境界描述
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

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = "【江湖指南】\n";
            msg += "基本指令：score (狀態), skills (技能), i (背包)\n";
            msg += "特殊指令：save (存檔), recall (回城)\n";
            msg += "移動指令：n, s, e, w, u, d\n";
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
    
    // --- 新增：狀態指令 (score / sc / hp) ---
    'score': {
        description: '查看詳細屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const combat = playerData.combat || {}; // 防止舊帳號沒有 combat 欄位

            // 計算動態數值 (簡單範例：攻擊力 = 膂力 * 10)
            const atk = combat.attack || (attr.str * 10);
            const def = combat.defense || (attr.con * 10);

            let msg = `\n【 ${playerData.name} 的狀態 】\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 精：${attr.hp}/${attr.maxHp}   靈力：${attr.spiritual}/${attr.maxSpiritual}\n`;
            msg += ` 氣：${attr.mp}/${attr.maxMp}   內力：${attr.force}/${attr.maxForce}\n`;
            msg += ` 神：${attr.sp}/${attr.maxSp}   法力：${attr.mana}/${attr.maxMana}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 食物：${attr.food}/${attr.maxFood}  飲水：${attr.water}/${attr.maxWater}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 膂力：${attr.str}  膽識：${attr.cor || 20}\n`;
            msg += ` 悟性：${attr.int}  靈性：${attr.int} (同悟性)\n`; // 靈性常與悟性掛勾
            msg += ` 根骨：${attr.con}  定力：${attr.per}\n`;
            msg += ` 身法：${attr.dex}  福緣：${attr.kar}\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 攻擊力：${atk}     防禦力：${def}\n`;
            msg += ` 命中率：${combat.hitRate || 10}     閃避率：${combat.dodge || 10}\n`;
            msg += ` 招架率：${combat.parry || 10}     殺氣：0\n`;
            msg += `--------------------------------------------------\n`;
            msg += ` 經驗值：${combat.xp || 0}      潛能：${combat.potential || 0}\n`;
            
            UI.print(msg, 'chat');
        }
    },
    'sc': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },
    'hp': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },

    // --- 新增：技能指令 (skills / sk) ---
    'skills': {
        description: '查看已習得武學',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);

            if (skillList.length === 0) {
                UI.print("你目前什麼都不會。(這就是傳說中的小白?)", "chat");
                return;
            }

            let msg = `\n【 ${playerData.name} 的武學 】\n`;
            msg += `--------------------------------------------------\n`;
            
            // 技能名稱對照表 (之後可以移到外部 data)
            const skillNames = {
                "unarmed": "基本拳腳",
                "dodge": "基本輕功",
                "parry": "基本招架",
                "force": "基本內功"
            };

            for (const [id, level] of skillList) {
                const name = skillNames[id] || id; // 如果沒有中文名就顯示 id
                const desc = getSkillLevelDesc(level);
                // 格式對齊
                const nameStr = name.padEnd(10, '　'); // 使用全形空白填充對齊
                msg += ` ${nameStr} ${level.toString().padStart(3)}級 / ${desc}\n`;
            }
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'sk': { description: 'skills 簡寫', execute: (p) => commandRegistry['skills'].execute(p) },

    // --- 新增：背包指令 (inventory / i) ---
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
                    msg += ` ${item.name} x${item.count}\n`;
                });
            }
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'i': { description: 'inventory 簡寫', execute: (p) => commandRegistry['inventory'].execute(p) },

    // --- 原有指令 ---
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