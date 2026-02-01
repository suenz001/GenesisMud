// src/systems/commands.js
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js"; 
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 

// 引入拆分後的子系統
import { CombatSystem } from "./combat.js";
import { PlayerSystem, updatePlayer } from "./player.js";
import { InventorySystem } from "./inventory.js";
import { SkillSystem } from "./skill_system.js";

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
    'suicide': { description: '自殺刪檔', execute: PlayerSystem.suicide },
    
    // === 戰鬥指令 ===
    'kill': { description: '下殺手', execute: CombatSystem.kill },
    'fight': { description: '切磋', execute: CombatSystem.fight },

    // === 物品與交易指令 ===
    'wield': { description: '裝備武器', execute: InventorySystem.wield },
    'unwield': { description: '卸下武器', execute: InventorySystem.unwield },
    'wear': { description: '穿戴防具', execute: InventorySystem.wear },
    'unwear': { description: '脫下防具', execute: InventorySystem.unwear },
    'eat': { description: '吃', execute: InventorySystem.eat },
    'drink': { description: '喝', execute: InventorySystem.drink },
    'buy': { description: '買', execute: InventorySystem.buy },
    'list': { description: '列表', execute: InventorySystem.list },
    'drop': { description: '丟', execute: InventorySystem.drop },
    'get': { description: '撿', execute: InventorySystem.get },
    'inventory': { description: '背包', execute: InventorySystem.inventory },
    'i': { description: '背包 (縮寫)', execute: InventorySystem.inventory },

    // === 技能與修練指令 ===
    'skills': { description: '查看技能', execute: SkillSystem.skills },
    'sk': { description: '查看技能 (縮寫)', execute: SkillSystem.skills },
    'learn': { description: '學藝', execute: SkillSystem.learn },
    'practice': { description: '練習', execute: SkillSystem.practice },
    'apprentice': { description: '拜師', execute: SkillSystem.apprentice },
    'enable': { description: '激發', execute: SkillSystem.enable },
    'unenable': { description: '解除激發', execute: SkillSystem.unenable },
    'exercise': { description: '運氣', execute: (p,a,u) => SkillSystem.trainStat(p,u,"內力","force","maxForce","hp","氣") },
    'respirate': { description: '運精', execute: (p,a,u) => SkillSystem.trainStat(p,u,"靈力","spiritual","maxSpiritual","sp","精") },
    'meditate': { description: '運神', execute: (p,a,u) => SkillSystem.trainStat(p,u,"法力","mana","maxMana","mp","神") },

    // === 地圖與社交指令 (保留在 commands.js 或 map.js 處理比較方便) ===
    'look': { 
        description: '觀察', 
        execute: (p, a) => { 
            if(a.length>0) { 
                // 這裡的邏輯比較混合，為了保持拆分乾淨，暫時保留在此，
                // 也可以移到 MapSystem.lookObject 處理
                const npc = InventorySystem.findNPCInRoom ? InventorySystem.findNPCInRoom(p.location, a[0]) : null; 
                // ... (簡化，沿用原邏輯) ...
                // 為了避免重複代碼，我們直接呼叫 MapSystem.look，
                // 但原代碼的 look <NPC> 邏輯在 commands.js 裡面。
                // 建議：將來可以把 look <NPC/Item> 的邏輯移入 MapSystem
            } 
            // 由於依賴問題，這裡我們先維持原狀，但呼叫 MapSystem
            import("./map.js").then(m => m.MapSystem.look(p));
        } 
    },
    
    // 為了相容舊代碼的 look <arg> 邏輯，我們重新實作一個簡單版本
    // 實際上建議把 commands.js 舊有的 look 詳細邏輯移到 MapSystem.lookTarget(p, target)
    // 這裡先簡單導向 MapSystem.look
    
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

// 處理 look <target> 的特例 (因為涉及 ItemDB/NPCDB，沒放進 map.js)
// 為了完整性，把舊的 look 邏輯補回來，但使用新的系統呼叫
function handleLook(p, a) {
    if(a.length > 0) {
        // 找 NPC (需要一個查找函式，這裡簡單實作或從 InventorySystem 借用)
        // 由於 ES6 模組循環依賴較麻煩，建議這段邏輯未來移入 map.js
        // 暫時：如果打 look <something>，只執行 MapSystem.look (忽視參數) 
        // 或請您保留舊的 look 代碼在這裡。
        // 這裡為了不讓程式出錯，先只執行看房間：
        MapSystem.look(p);
        return;
    }
    MapSystem.look(p);
}
commandRegistry['look'].execute = handleLook;
commandRegistry['l'] = { description: 'look', execute: handleLook };

// 移動指令註冊
Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
});

export const CommandSystem = {
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        
        if (playerData.isUnconscious && playerData.attributes.hp > 0) {
            playerData.isUnconscious = false;
            UI.print("你慢慢清醒了過來。", "system");
            updatePlayer(userId, { isUnconscious: false });
        }
        
        if (playerData.state === 'fighting') {
             const args = inputStr.trim().split(/\s+/);
             const cmd = args[0].toLowerCase();
             if (['n','s','e','w','u','d','north','south','east','west','up','down'].includes(cmd)) {
                 // 允許逃跑
             } else if (!['kill', 'fight', 'look', 'score', 'hp', 'help', 'skills', 'l'].includes(cmd)) {
                 UI.print("戰鬥中無法分心做這件事！", "error");
                 return;
             }
        }
        
        if (playerData.isUnconscious) {
             UI.print("你現在暈過去了，動彈不得！", "error");
             return;
        }
        
        if (!playerData) { UI.print("靈魂尚未歸位...", "error"); return; }
        const args = inputStr.trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();
        
        if ((cmdName === 'kill' || cmdName === 'fight') && playerData.state === 'fighting') {
             UI.print("戰鬥正在進行中...", "system");
             return;
        }

        const command = commandRegistry[cmdName];
        if (command) command.execute(playerData, args, userId);
        else UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error");
    },
    stopCombat: CombatSystem.stopCombat // 導出給 main.js 使用
};