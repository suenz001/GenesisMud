// src/systems/commands.js
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js"; 
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 

import { CombatSystem } from "./combat.js";
import { PlayerSystem, updatePlayer } from "./player.js";
import { InventorySystem } from "./inventory.js";
import { SkillSystem } from "./skill_system.js";
import { PerformSystem } from "./perform_system.js"; // [新增] 引入絕招系統

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

const commandRegistry = {
    // === 基礎與玩家指令 ===
    'help': { description: '查看指令列表', execute: PlayerSystem.help },
    'score': { description: '查看屬性', execute: PlayerSystem.score },
    'save': { description: '存檔', execute: PlayerSystem.save },
    'quit': { description: '離開遊戲', execute: PlayerSystem.quit }, 
    'suicide': { description: '自殺刪檔', execute: PlayerSystem.suicide },
    'hp': { description: '狀態', execute: (p) => UI.updateHUD(p) },
    
    // === 戰鬥與切磋指令 ===
    'kill': { description: '下殺手', execute: CombatSystem.kill },
    'fight': { description: '切磋', execute: CombatSystem.fight },
    'perform': { description: '施展絕招', execute: PerformSystem.execute }, // [新增] 絕招指令
    'y': { description: '接受', execute: CombatSystem.acceptDuel },
    'yes': { description: '接受', execute: CombatSystem.acceptDuel },
    'n': { description: '拒絕', execute: CombatSystem.rejectDuel },
    'no': { description: '拒絕', execute: CombatSystem.rejectDuel },

    // === 物品與交易指令 ===
    'wield': { description: '裝備武器', execute: InventorySystem.wield },
    'unwield': { description: '卸下武器', execute: InventorySystem.unwield },
    'wear': { description: '穿戴防具', execute: InventorySystem.wear },
    'unwear': { description: '脫下防具', execute: InventorySystem.unwear },
    'eat': { description: '吃', execute: InventorySystem.eat },
    'drink': { description: '喝', execute: InventorySystem.drink },
    'buy': { description: '買', execute: InventorySystem.buy },
    'sell': { description: '賣', execute: InventorySystem.sell },
    'list': { description: '列表', execute: InventorySystem.list },
    'drop': { description: '丟', execute: InventorySystem.drop },
    'get': { description: '撿', execute: InventorySystem.get },
    'inventory': { description: '背包', execute: InventorySystem.inventory },
    'i': { description: '背包 (縮寫)', execute: InventorySystem.inventory },
    'give': { description: '給予', execute: InventorySystem.give },

    // === 技能與修練指令 ===
    'skills': { description: '查看技能', execute: SkillSystem.skills },
    'sk': { description: '查看技能 (縮寫)', execute: SkillSystem.skills },
    'learn': { description: '學藝', execute: SkillSystem.learn },
    'practice': { description: '練習', execute: SkillSystem.practice },
    'apprentice': { description: '拜師', execute: SkillSystem.apprentice },
    'betray': { description: '叛出師門', execute: SkillSystem.betray },
    'enable': { description: '激發', execute: SkillSystem.enable },
    'unenable': { description: '解除激發', execute: SkillSystem.unenable },
    'abandon': { description: '放棄技能', execute: SkillSystem.abandon },
    
    // === 屬性修練指令 ===
    'exercise': { description: '運氣', execute: (p,a,u) => SkillSystem.trainStat(p,u,"內力","force","maxForce","hp","氣",a) },
    'respirate': { description: '運精', execute: (p,a,u) => SkillSystem.trainStat(p,u,"靈力","spiritual","maxSpiritual","sp","精",a) },
    'meditate': { description: '運神', execute: (p,a,u) => SkillSystem.trainStat(p,u,"法力","mana","maxMana","mp","神",a) },
    
    // === 內力運用與自動修練指令 ===
    'exert': { description: '運功', execute: SkillSystem.exert },
    'autoforce': { description: '自動修練內力', execute: SkillSystem.autoForce },
    'enforce': { description: '加力', execute: PlayerSystem.enforce },

    // === 地圖與社交指令 ===
    'look': { 
        description: '觀察', 
        execute: (p, a) => { 
            if (a.length > 0) {
                import("./map.js").then(m => m.MapSystem.lookTarget(p, a[0], a[1]));
            } else {
                import("./map.js").then(m => m.MapSystem.look(p));
            }
        } 
    },
    'say': { description: '說', execute: (p,a)=>{const m=a.join(" ");UI.print(`你: ${m}`,"chat");MessageSystem.broadcast(p.location,`${p.name} 說: ${m}`);} },
    'emote': { description: '演', execute: (p,a)=>{const m=a.join(" ");UI.print(`${p.name} ${m}`,"system");MessageSystem.broadcast(p.location,`${p.name} ${m}`);} },
    'recall': { 
        description: '回', 
        execute: (p,a,u) => {
            if (p.location === "ghost_gate") { UI.print("鬼門關豈是你想來就來，想走就走的？", "error"); return; }
            MapSystem.teleport(p, p.savePoint||"inn_start", u);
        } 
    }
};

// 縮寫處理
function handleLook(p, a) {
    if (a.length > 0) {
        import("./map.js").then(m => m.MapSystem.lookTarget(p, a[0], a[1]));
    } else {
        MapSystem.look(p);
    }
}
commandRegistry['look'].execute = handleLook;
commandRegistry['l'] = { description: 'look', execute: handleLook };

Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
    commandRegistry[fullDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
});

export const CommandSystem = {
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        
        const args = inputStr.trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();
        
        // 暈倒檢測
        if (playerData.isUnconscious && playerData.attributes.hp > 50) {
            playerData.isUnconscious = false;
            UI.print("你慢慢清醒了過來。", "system");
            updatePlayer(userId, { isUnconscious: false });
        }

        if (playerData.isUnconscious) {
             UI.print("你現在暈過去了，動彈不得！", "error");
             return;
        }

        // 修練狀態過濾
        if (playerData.state === 'exercising') {
            const allowedExercisingCmds = ['autoforce', 'look', 'l', 'score', 'hp', 'skills', 'sk', 'help', 'inventory', 'i'];
            if (!allowedExercisingCmds.includes(cmdName)) {
                UI.print("你正在專心修練，無法分心做這件事！(輸入 autoforce 解除)", "error");
                return;
            }
        }
        
        // 戰鬥狀態指令過濾
        if (playerData.state === 'fighting') {
             if (['n','s','e','w','u','d','north','south','east','west','up','down'].includes(cmdName)) {
                 // 允許戰鬥中嘗試移動 (逃跑)
             } else if (![
                 'kill', 'fight', 'perform', // [新增] 允許戰鬥中使用 perform
                 'look', 'score', 'hp', 'help', 'skills', 'l',
                 'enforce', 'exert', 'inventory', 'i', 'eat', 'drink', 'wield', 'unwield' 
             ].includes(cmdName)) {
                 UI.print("戰鬥中無法分心做這件事！", "error");
                 return;
             }
        }
        
        // [新增] 忙碌狀態 (Busy) 過濾
        // 如果玩家被定身，大部分指令都不能用
        if (playerData.busy && Date.now() < playerData.busy) {
            // 允許查看狀態的指令
            const allowedBusyCmds = ['look', 'l', 'score', 'hp', 'inventory', 'i', 'help'];
            if (!allowedBusyCmds.includes(cmdName)) {
                const remaining = Math.ceil((playerData.busy - Date.now()) / 1000);
                UI.print(`你現在動彈不得！(剩餘 ${remaining} 秒)`, "error");
                return;
            }
        }
        
        if (!playerData) { UI.print("靈魂尚未歸位...", "error"); return; }
        
        const command = commandRegistry[cmdName];
        if (command) command.execute(playerData, args, userId);
        else UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error");
    },
    stopCombat: CombatSystem.stopCombat
};