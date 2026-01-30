// src/systems/commands.js
import { doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // 新增 deleteDoc
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"; // 新增 signOut
import { db, auth } from "../firebase.js"; // 引入 auth
import { UI } from "../ui.js";
import { MapSystem } from "./map.js"; 

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

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = "【江湖指南】\n";
            msg += "基本指令：score (狀態), skills (技能), i (背包)\n";
            msg += "特殊指令：save (存檔), recall (回城), suicide (刪除角色)\n";
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
    
    // --- 狀態指令 (新增性別顯示) ---
    'score': {
        description: '查看詳細屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const combat = playerData.combat || {};

            const atk = combat.attack || (attr.str * 10);
            const def = combat.defense || (attr.con * 10);

            // 顯示性別
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
            msg += ` 經驗值：${combat.xp || 0}      潛能：${combat.potential || 0}\n`;
            
            UI.print(msg, 'chat');
        }
    },
    'sc': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },
    'hp': { description: 'score 簡寫', execute: (p) => commandRegistry['score'].execute(p) },

    // --- 新增：自殺指令 (suicide) ---
    'suicide': {
        description: '刪除角色 (慎用)',
        execute: async (playerData, args, userId) => {
            // 需要輸入 suicide confirm 才能執行
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

                // 2. 登出 (這會觸發 main.js 的 onAuthStateChanged，回到登入畫面)
                await signOut(auth);

            } catch (e) {
                UI.print("自殺失敗(連死都不行?)：" + e.message, "error");
            }
        }
    },

    // --- 技能指令 ---
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
                const nameStr = name.padEnd(10, '　'); 
                msg += ` ${nameStr} ${level.toString().padStart(3)}級 / ${desc}\n`;
            }
            msg += `--------------------------------------------------\n`;
            UI.print(msg, 'chat');
        }
    },
    'sk': { description: 'skills 簡寫', execute: (p) => commandRegistry['skills'].execute(p) },

    // --- 背包指令 ---
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