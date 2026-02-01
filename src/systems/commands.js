// src/systems/commands.js
import { doc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 
import { MessageSystem } from "./messages.js"; 
import { SkillDB } from "../data/skills.js";

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

// 全域變數：戰鬥計時器與狀態
let combatInterval = null;
let currentCombatState = null; 

// --- 輔助：取得受傷狀態描述 ---
function getStatusDesc(name, current, max) {
    if (max <= 0) return null;
    const pct = current / max;
    
    if (pct <= 0.1 && pct > 0) {
        return UI.txt(`${name} 搖頭晃腦，眼看就要倒在地上了！`, "#ff5555");
    }
    if (pct <= 0.4 && pct > 0.1) {
        return UI.txt(`${name} 氣喘呼呼，看起來狀況不太好。`, "#ffaa00");
    }
    return null;
}

// --- 戰鬥與計算核心函式 ---

function getEffectiveSkillLevel(entity, baseType) {
    const skills = entity.skills || {};
    const enabled = entity.enabled_skills || {};
    
    // 取得基礎等級
    const baseLvl = skills[baseType] || 0;
    
    // 檢查是否有裝備/激發該類型的進階武功
    let advancedLvl = 0;
    
    if (entity.id && NPCDB[entity.id]) {
        // NPC 邏輯：掃描技能列表
        for (const [sid, lvl] of Object.entries(skills)) {
            const sInfo = SkillDB[sid];
            if (sInfo && sInfo.base === baseType && sInfo.type !== baseType) {
                if (lvl > advancedLvl) advancedLvl = lvl;
            }
        }
    } else {
        // 玩家邏輯：檢查 enabled_skills
        const enabledId = enabled[baseType];
        if (enabledId && skills[enabledId]) {
            advancedLvl = skills[enabledId];
        }
    }

    if (advancedLvl > 0) {
        return advancedLvl + Math.floor(baseLvl / 2);
    } else {
        return Math.floor(baseLvl / 2);
    }
}

function getCombatStats(entity) {
    // [NaN Fix] 確保所有屬性都有預設值 0
    const attr = entity.attributes || {};
    const str = attr.str || 10;
    const con = attr.con || 10;
    const per = attr.per || 10;
    
    const equipment = entity.equipment || {};
    
    // 1. 判斷使用武器類型 [修正邏輯：支援多種武器]
    const weaponId = equipment.weapon || null;
    const weaponData = weaponId ? ItemDB[weaponId] : null;
    
    // 如果有武器，攻擊類型直接使用武器的 type (例如 'blade', 'stick', 'whip')
    // 如果沒有武器，則預設為 'unarmed'
    const atkType = weaponData ? weaponData.type : 'unarmed';

    // 2. 判斷防具
    const armorId = equipment.armor || null;
    const armorData = armorId ? ItemDB[armorId] : null;
    
    // 3. 計算各類有效技能等級
    const effAtkSkill = getEffectiveSkillLevel(entity, atkType); 
    const effForce = getEffectiveSkillLevel(entity, 'force');    
    const effDodge = getEffectiveSkillLevel(entity, 'dodge');    

    // 4. 裝備加成
    const weaponDmg = weaponData ? (weaponData.damage || 0) : 0;
    const weaponHit = weaponData ? (weaponData.hit || 0) : 0;
    const armorDef = armorData ? (armorData.defense || 0) : 0;

    // 5. 計算四大屬性 (加權運算 - [平衡修正] 倍率由 10 降為 2.5)
    // 讓裝備和技能的影響力提升，並避免數值差距過大導致無法破防
    const ap = (str * 2.5) + (effAtkSkill * 5) + (effForce * 2) + weaponDmg;
    const dp = (con * 2.5) + (effForce * 5) + (effDodge * 2) + armorDef;
    const hit = (per * 2.5) + (effAtkSkill * 3) + weaponHit;
    const dodge = (per * 2.5) + (effDodge * 4) + (effAtkSkill * 1);

    return { ap, dp, hit, dodge, atkType, weaponData, effAtkSkill };
}

// 停止戰鬥函式
function stopCombat(userId) {
    if (combatInterval) {
        clearInterval(combatInterval);
        combatInterval = null;
    }
    currentCombatState = null;
    
    if (userId) {
        // 戰鬥結束，移除戰鬥狀態
        updatePlayer(userId, { state: 'normal', combatTarget: null });
    }
}

// --- 死亡與重生處理邏輯 ---

async function handlePlayerDeath(playerData, userId) {
    UI.print(UI.txt("你眼前一黑，感覺靈魂脫離了軀體...", "#ff0000", true), "system", true);
    stopCombat(userId);

    // 1. 技能懲罰：所有技能扣 1 等
    if (playerData.skills) {
        for (let skillId in playerData.skills) {
            if (playerData.skills[skillId] > 0) {
                playerData.skills[skillId] -= 1;
            }
        }
    }

    // 2. 傳送到鬼門關
    const deathLocation = "ghost_gate";
    
    // 補滿狀態 (變成鬼是滿血狀態)
    playerData.attributes.hp = playerData.attributes.maxHp;
    playerData.attributes.sp = playerData.attributes.maxSp;
    playerData.attributes.mp = playerData.attributes.maxMp;
    
    // 清除暈倒狀態
    delete playerData.isUnconscious;

    await updatePlayer(userId, {
        location: deathLocation,
        skills: playerData.skills,
        attributes: playerData.attributes,
        state: 'normal',
        combatTarget: null,
        isUnconscious: false
    });

    // [UI修正] 復活補滿血後，立即更新 UI
    UI.updateHUD(playerData);

    UI.print("你悠悠醒來，發現自己身處【鬼門關】。", "system");
    UI.print("你的武功修為受到了一些損耗。", "system");
    UI.print(UI.txt("黑白無常說道：「陽壽未盡？在這反省 3 分鐘再回去吧！」", "#aaa"), "chat");
    MapSystem.look(playerData);

    // 3. 設定 3 分鐘後重生 (180000 ms)
    setTimeout(async () => {
        // 重新讀取玩家資料確認他還在線上 (或沒登出)
        const pRef = doc(db, "players", userId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
            const currentP = pSnap.data();
            // 只有當玩家還在鬼門關時才傳送 (避免bug)
            if (currentP.location === "ghost_gate") {
                const respawnPoint = currentP.savePoint || "inn_start";
                
                // 本地更新
                playerData.location = respawnPoint;
                await updatePlayer(userId, { location: respawnPoint });
                
                // 如果是當前客戶端，顯示訊息
                if (auth.currentUser && auth.currentUser.uid === userId) {
                    UI.print("一道金光閃過，你還陽了！", "system");
                    MapSystem.look(playerData);
                }
            }
        }
    }, 180000); // 3分鐘 = 180000毫秒
}

// --- 一般輔助函式 ---

async function findAliveNPC(roomId, targetId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;

    // 取得該房間所有屍體
    const deadRef = collection(db, "dead_npcs");
    const q = query(deadRef, where("roomId", "==", roomId));
    const snapshot = await getDocs(q);
    
    const deadIndices = [];
    const now = Date.now();
    snapshot.forEach(doc => {
        const data = doc.data();
        if (now < data.respawnTime) {
            // 還沒重生 = 真的死了
            if (data.npcId === targetId) deadIndices.push(data.index);
        }
    });

    // 遍歷房間 NPC，找出第一個 ID 符合且不在屍體名單中的
    for (let i = 0; i < room.npcs.length; i++) {
        if (room.npcs[i] === targetId) {
            if (!deadIndices.includes(i)) {
                const npcData = NPCDB[targetId];
                // 初始化暈倒狀態 (如果沒有的話)
                return { ...npcData, index: i, isUnconscious: false }; 
            }
        }
    }
    return null;
}

async function trainStat(playerData, userId, typeName, attrCur, attrMax, costAttr, costName) {
    const attr = playerData.attributes;
    if (attr[costAttr] < 20) {
        UI.print(`你的${costName}不足，無法修練。`, "error");
        return;
    }

    const maxVal = attr[attrMax];
    const curVal = attr[attrCur];
    const limit = maxVal * 2; 

    if (curVal >= limit) {
        UI.print(`你的${typeName}修為已達瓶頸，無法再累積了。`, "system");
        return;
    }

    const cost = 10;
    const gain = 5 + Math.floor((playerData.skills?.force || 0) / 10); 
    
    let improved = false;
    
    if (curVal >= limit - 1) {
        const pot = playerData.combat?.potential || 0;
        if (pot < 1) {
            UI.print("你的潛能不足，無法突破瓶頸。", "error");
            return;
        }
        attr[costAttr] -= 1; 
        playerData.combat.potential -= 1;
        attr[attrMax] += 1;
        attr[attrCur] = attr[attrMax]; 
        
        improved = true;
        let msg = `你運轉周天，只覺體內轟的一聲... ` + UI.txt(`你的${typeName}上限提升了！`, "#ffff00", true);
        UI.print(msg, "system", true);
    } else {
        attr[costAttr] -= cost;
        attr[attrCur] = Math.min(limit, curVal + gain);
        
        let msg = `你運轉周天，將${costName}轉化為${typeName} ... `;
        if (attr[attrCur] > maxVal) {
            msg += `(${attr[attrCur]}/${maxVal} <span style="color:#00ff00">+${attr[attrCur] - maxVal}</span>)`;
        } else {
            msg += `(${attr[attrCur]}/${maxVal})`;
        }
        UI.print(msg, "system", true);
    }

    // [UI修正] 修練後立即更新 UI
    UI.updateHUD(playerData);

    if (improved) {
        await updatePlayer(userId, { 
            [`attributes.${costAttr}`]: attr[costAttr],
            [`attributes.${attrCur}`]: attr[attrCur],
            [`attributes.${attrMax}`]: attr[attrMax],
            "combat.potential": playerData.combat.potential
        });
    } else {
        await updatePlayer(userId, { 
            [`attributes.${costAttr}`]: attr[costAttr],
            [`attributes.${attrCur}`]: attr[attrCur]
        });
    }
}

function getSkillLevelDesc(level) {
    let desc = "初學乍練";
    let color = "#aaa"; 
    
    if (level >= 500) { desc = "深不可測"; color = "#ff00ff"; }
    else if (level >= 400) { desc = "返璞歸真"; color = "#ff0000"; }
    else if (level >= 300) { desc = "出神入化"; color = "#ff8800"; }
    else if (level >= 200) { desc = "登峰造極"; color = "#ffff00"; }
    else if (level >= 150) { desc = "出類拔萃"; color = "#00ff00"; }
    else if (level >= 100) { desc = "爐火純青"; color = "#00ffff"; }
    else if (level >= 60) { desc = "融會貫通"; color = "#0088ff"; }
    else if (level >= 30) { desc = "駕輕就熟"; color = "#8888ff"; }
    else if (level >= 10) { desc = "略有小成"; color = "#ffffff"; }

    return UI.txt(desc, color);
}

function getLevel(character) {
    const skills = character.skills || {};
    let maxMartial = 0, maxForce = 0;
    for (const [sid, lvl] of Object.entries(skills)) {
        const skillInfo = SkillDB[sid];
        if (skillInfo && skillInfo.base) {
            if (skillInfo.type === 'martial' && lvl > maxMartial) maxMartial = lvl;
            if (skillInfo.type === 'force' && lvl > maxForce) maxForce = lvl;
        }
    }
    return maxMartial + maxForce;
}

async function updatePlayer(userId, data) {
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, data);
        return true;
    } catch (e) { console.error("更新失敗", e); return false; }
}

async function updateInventory(playerData, userId) {
    return await updatePlayer(userId, { inventory: playerData.inventory });
}

async function consumeItem(playerData, userId, itemId, amount = 1) {
    const inventory = playerData.inventory || [];
    const itemIndex = inventory.findIndex(i => i.id === itemId || i.name === itemId);
    if (itemIndex === -1) { UI.print(`你身上沒有 ${itemId} 這樣東西。`, "error"); return false; }
    const item = inventory[itemIndex];
    if (item.count > amount) item.count -= amount; else inventory.splice(itemIndex, 1);
    
    // [UI修正] 吃東西/喝水後，物品減少與屬性恢復，需更新UI
    UI.updateHUD(playerData);
    
    return await updateInventory(playerData, userId);
}

function findNPCInRoom(roomId, npcNameOrId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;
    if (room.npcs.includes(npcNameOrId)) {
        const index = room.npcs.indexOf(npcNameOrId);
        const npcData = NPCDB[npcNameOrId];
        return { ...npcData, index: index };
    }
    for (let i = 0; i < room.npcs.length; i++) {
        const nid = room.npcs[i];
        const npc = NPCDB[nid];
        if (npc && npc.name === npcNameOrId) return { ...npc, index: i };
    }
    return null;
}

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = UI.titleLine("江湖指南");
            msg += UI.txt(" 裝備指令：", "#ff5555") + "wield, unwield, wear, unwear\n";
            msg += UI.txt(" 基本指令：", "#00ffff") + "score, skills, inventory (i)\n";
            msg += UI.txt(" 武學指令：", "#ff5555") + "apprentice, learn, enable, unenable, practice\n";
            msg += UI.txt(" 修練指令：", "#ffff00") + "exercise, respirate, meditate\n";
            msg += UI.txt(" 戰鬥指令：", "#ff0000") + "kill (下殺手), fight (切磋)\n";
            msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
            msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy\n";
            msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
            UI.print(msg, 'normal', true);
        }
    },

    'wield': {
        description: '裝備武器',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("你要裝備什麼武器？", "error");
            const itemId = args[0];
            const invItem = playerData.inventory.find(i => i.id === itemId);
            if (!invItem) return UI.print("你身上沒有這個東西。", "error");
            
            const itemData = ItemDB[itemId];
            
            // [修正] 支援所有新增的武器類型 (blade, stick, dagger, whip, throwing, lance)
            // 只要它在 items.js 定義為這些類型，或者定義為 'weapon'，就可以裝備
            const allowedTypes = ['weapon', 'sword', 'blade', 'stick', 'dagger', 'whip', 'throwing', 'lance'];
            
            if (!itemData || !allowedTypes.includes(itemData.type)) {
                return UI.print("這不是武器。", "error");
            }

            if (!playerData.equipment) playerData.equipment = {};
            if (playerData.equipment.weapon) {
                UI.print(`你先放下了手中的${ItemDB[playerData.equipment.weapon].name}。`, "system");
            }

            playerData.equipment.weapon = itemId;
            UI.print(`你裝備了 ${itemData.name}。`, "system");
            await updatePlayer(userId, { equipment: playerData.equipment });
        }
    },
    'unwield': {
        description: '卸下武器',
        execute: async (playerData, args, userId) => {
            if (!playerData.equipment || !playerData.equipment.weapon) return UI.print("你目前沒有裝備武器。", "error");
            const wName = ItemDB[playerData.equipment.weapon].name;
            playerData.equipment.weapon = null;
            UI.print(`你放下了手中的 ${wName}。`, "system");
            await updatePlayer(userId, { equipment: playerData.equipment });
        }
    },
    'wear': {
        description: '穿戴防具',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("你要穿什麼？", "error");
            const itemId = args[0];
            const invItem = playerData.inventory.find(i => i.id === itemId);
            if (!invItem) return UI.print("你身上沒有這個東西。", "error");
            
            const itemData = ItemDB[itemId];
            if (!itemData || itemData.type !== 'armor') return UI.print("這不是防具。", "error");

            if (!playerData.equipment) playerData.equipment = {};
            if (playerData.equipment.armor) {
                UI.print(`你脫下了身上的${ItemDB[playerData.equipment.armor].name}。`, "system");
            }

            playerData.equipment.armor = itemId;
            UI.print(`你穿上了 ${itemData.name}。`, "system");
            await updatePlayer(userId, { equipment: playerData.equipment });
        }
    },
    'unwear': {
        description: '脫下防具',
        execute: async (playerData, args, userId) => {
            if (!playerData.equipment || !playerData.equipment.armor) return UI.print("你身上沒有穿防具。", "error");
            const aName = ItemDB[playerData.equipment.armor].name;
            playerData.equipment.armor = null;
            UI.print(`你脫下了身上的 ${aName}。`, "system");
            await updatePlayer(userId, { equipment: playerData.equipment });
        }
    },

    'eat': {
        description: '吃',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("想吃什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'food') return UI.print("那個不能吃！", "error");
            
            const attr = playerData.attributes;
            if (attr.food >= attr.maxFood) return UI.print("你已經吃得很飽了。", "system");

            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                const recover = Math.min(attr.maxFood - attr.food, itemData.value);
                attr.food = Math.min(attr.maxFood, attr.food + itemData.value);
                
                UI.print(`你吃下了一份${invItem.name}，恢復了 ${recover} 點食物值。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 拿出 ${invItem.name} 吃幾口。`);
                
                await updatePlayer(userId, { "attributes.food": attr.food });
            }
        }
    },
    'drink': {
        description: '喝',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("想喝什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'drink') return UI.print("那個不能喝！", "error");
            
            const attr = playerData.attributes;
            if (attr.water >= attr.maxWater) return UI.print("你一點也不渴。", "system");

            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                const recover = Math.min(attr.maxWater - attr.water, itemData.value);
                attr.water = Math.min(attr.maxWater, attr.water + itemData.value);

                UI.print(`你喝了一口${invItem.name}，恢復了 ${recover} 點飲水值。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 拿起 ${invItem.name} 喝了幾口。`);

                await updatePlayer(userId, { "attributes.water": attr.water });
            }
        }
    },

    'exercise': { description: '運氣', execute: async (p,a,u) => trainStat(p,u,"內力","force","maxForce","hp","氣") },
    'respirate': { description: '運精', execute: async (p,a,u) => trainStat(p,u,"靈力","spiritual","maxSpiritual","sp","精") },
    'meditate': { description: '運神', execute: async (p,a,u) => trainStat(p,u,"法力","mana","maxMana","mp","神") },

    'apprentice': {
        description: '拜師',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你想拜誰為師？", "error"); return; }
            
            const npc = findNPCInRoom(playerData.location, args[0]);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            if (!npc.family) {
                UI.print(`${npc.name} 說道：「我只是一介平民，不懂收徒。」`, "chat");
                return;
            }

            if (playerData.family && playerData.family.masterId) {
                UI.print(`你已經有師父了，是 ${playerData.family.masterId}。`, "error");
                return;
            }

            let msg = "";
            if (npc.id === 'gym_master') {
                msg = `${npc.name} 哈哈大笑，拍了拍你的頭說道：「好！很有精神！今日我就收你為徒！」`;
            } else {
                msg = `${npc.name} 微微頷首，說道：「既然你有此誠意，我便收你為徒。」`;
            }
            UI.print(msg, "chat");
            
            MessageSystem.broadcast(playerData.location, `${playerData.name} 恭恭敬敬地向 ${npc.name} 磕了三個響頭，拜入其門下。`);

            playerData.family = {
                masterId: npc.id,
                masterName: npc.name,
                sect: npc.family
            };
            playerData.sect = npc.family === 'common_gym' ? '飛龍武館' : npc.family;

            await updatePlayer(userId, { family: playerData.family, sect: playerData.sect });
        }
    },

    'enable': {
        description: '激發',
        execute: async (playerData, args, userId) => {
            if (!playerData.enabled_skills) playerData.enabled_skills = {};
            if (args.length < 2) {
                let msg = UI.titleLine("激發狀態");
                for (const [type, skillId] of Object.entries(playerData.enabled_skills)) {
                    const sInfo = SkillDB[skillId];
                    msg += `${UI.txt(type, "#00ffff")} : ${sInfo ? sInfo.name : skillId}\n`;
                }
                if (Object.keys(playerData.enabled_skills).length === 0) msg += "無\n";
                UI.print(msg, 'system');
                return;
            }

            const type = args[0]; 
            const skillId = args[1];

            if (!playerData.skills || !playerData.skills[skillId]) { 
                UI.print("你不會這招。", "error"); return; 
            }
            const skillInfo = SkillDB[skillId];
            if (skillInfo.base !== type) { 
                UI.print("類型不符。", "error"); return; 
            }

            if (playerData.enabled_skills[type] === skillId) {
                delete playerData.enabled_skills[type];
                UI.print(`已解除 ${type} 的激發。`, "system");
            } else {
                playerData.enabled_skills[type] = skillId;
                UI.print(`已將 ${type} 設定為 ${skillInfo.name}。`, "system");
            }

            await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
        } 
    },

    'unenable': {
        description: '解除激發',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("指令格式：unenable <類型>", "error"); return; }
            const type = args[0];
            if (!playerData.enabled_skills || !playerData.enabled_skills[type]) {
                UI.print(`你目前並沒有激發 ${type} 類型的武功。`, "error");
                return;
            }
            delete playerData.enabled_skills[type];
            UI.print(`你取消了 ${type} 的激發狀態。`, "system");
            await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
        }
    },

    'skills': {
        description: '查看技能',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);
            if (skillList.length === 0) { UI.print("你目前什麼都不會。", "chat"); return; }
            
            let html = UI.titleLine(`${playerData.name} 的武學`);
            html += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap: 5px; align-items:center;">`;
            
            for (const [id, level] of skillList) {
                const info = SkillDB[id];
                if(id === 'parry') continue; 
                const name = info ? info.name : id;
                const desc = getSkillLevelDesc(level);
                let statusMark = "";
                
                if (playerData.enabled_skills) {
                    for (const [slot, equippedId] of Object.entries(playerData.enabled_skills)) {
                        if (equippedId === id) statusMark = UI.txt(`[${slot}]`, "#00ff00");
                    }
                }

                let btn = "";
                if (info && info.base) {
                    const isEnabled = playerData.enabled_skills && playerData.enabled_skills[info.base] === id;
                    btn = UI.makeCmd(isEnabled ? "[解除]" : "[激發]", isEnabled ? `unenable ${info.base}` : `enable ${info.base} ${id}`, "cmd-btn");
                }

                // [UI修正] 名稱後方顯示 ID
                html += `<div style="color:#fff;">${name} <span style="color:#888; font-size:0.8em;">(${id})</span> ${statusMark}</div>`;
                html += `<div>${UI.txt(level+"級", "#00ffff")} <span style="font-size:0.8em;">${desc}</span></div>`;
                html += `<div>${btn}</div>`;
            }
            html += `</div>` + UI.titleLine("End");
            UI.print(html, 'chat', true);
        }
    },

    'score': {
        description: '查看屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const combatStats = getCombatStats(playerData); 

            const moneyStr = UI.formatMoney(playerData.money || 0);
            const potential = playerData.combat?.potential || 0;
            const kills = playerData.combat?.kills || 0;

            let html = UI.titleLine(`${playerData.name} 的狀態`);
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("性別", playerData.gender)}</div><div>${UI.attrLine("門派", playerData.sect || "無")}</div>`;
            html += `<div>${UI.attrLine("財產", moneyStr)}</div>`;
            html += `<div>${UI.attrLine("潛能", UI.txt(potential, "#ffff00", true))}</div>`;
            html += `</div><br>`;

            html += UI.txt("【 天賦屬性 】", "#00ffff") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("膂力", attr.str)}</div><div>${UI.attrLine("根骨", attr.con)}</div>`;
            html += `<div>${UI.attrLine("悟性", attr.int)}</div><div>${UI.attrLine("定力", attr.per)}</div>`;
            html += `<div>${UI.attrLine("福緣", attr.kar)}</div><div>${UI.attrLine("靈性", attr.cor)}</div>`;
            html += `</div><br>`;
            
            // [修正] 加回食物與飲水
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("食物", attr.food+"/"+attr.maxFood)}</div><div>${UI.attrLine("飲水", attr.water+"/"+attr.maxWater)}</div>`;
            html += `</div><br>`;

            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.txt("【 精 與 靈 】", "#ff5555")}</div><div>${UI.makeCmd("[運精]", "respirate", "cmd-btn")}</div>`;
            html += `<div>${UI.attrLine("精 (SP)", attr.sp+"/"+attr.maxSp)}</div>`;
            html += `<div>${UI.attrLine("靈力", attr.spiritual+"/"+attr.maxSpiritual)}</div>`;
            
            html += `<div>${UI.txt("【 氣 與 內 】", "#5555ff")}</div><div>${UI.makeCmd("[運氣]", "exercise", "cmd-btn")}</div>`;
            html += `<div>${UI.attrLine("氣 (HP)", attr.hp+"/"+attr.maxHp)}</div>`;
            html += `<div>${UI.attrLine("內力", attr.force+"/"+attr.maxForce)}</div>`;

            html += `<div>${UI.txt("【 神 與 法 】", "#ffff55")}</div><div>${UI.makeCmd("[運神]", "meditate", "cmd-btn")}</div>`;
            html += `<div>${UI.attrLine("神 (MP)", attr.mp+"/"+attr.maxMp)}</div>`;
            html += `<div>${UI.attrLine("法力", attr.mana+"/"+attr.maxMana)}</div>`;
            html += `</div><br>`;

            html += UI.txt("【 戰鬥參數 】", "#00ff00") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("攻擊力", combatStats.ap)}</div><div>${UI.attrLine("防禦力", combatStats.dp)}</div>`;
            html += `<div>${UI.attrLine("命中率", combatStats.hit)}</div><div>${UI.attrLine("閃避率", combatStats.dodge)}</div>`;
            html += `<div>${UI.attrLine("殺氣", UI.txt(kills, "#ff0000"))}</div>`;
            html += `</div>` + UI.titleLine("End");
            
            UI.print(html, 'chat', true);
        }
    },

    // --- 殺敵 (Kill) - 包含狀態描述更新 ---
    'kill': {
        description: '下殺手',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你想殺誰？", "error"); return; }
            if (playerData.state === 'fighting') { UI.print("你已經在戰鬥中了！", "error"); return; }

            const room = MapSystem.getRoom(playerData.location);
            if (room.safe) { UI.print("這裡是安全區。", "error"); return; }
            
            const targetId = args[0];
            const npc = await findAliveNPC(playerData.location, targetId);

            if (!npc) { UI.print("這裡沒有這個人，或者他已經死了。", "error"); return; }

            UI.print(UI.txt(`你對 ${npc.name} 下了殺手！戰鬥開始！`, "#ff0000", true), "system", true);
            
            currentCombatState = {
                targetId: npc.id,
                targetIndex: npc.index, 
                npcHp: npc.combat.hp,
                maxNpcHp: npc.combat.maxHp,
                npcName: npc.name,
                roomId: playerData.location, 
                npcIsUnconscious: false 
            };

            await updatePlayer(userId, { 
                state: 'fighting', 
                combatTarget: { id: npc.id, index: npc.index } 
            });

            if (combatInterval) clearInterval(combatInterval);
            
            const combatRound = async () => {
                // 安全檢查：戰鬥停止或位置改變
                if (!currentCombatState) { if (combatInterval) clearInterval(combatInterval); return; }
                if (playerData.location !== currentCombatState.roomId) { stopCombat(userId); return; }

                const playerStats = getCombatStats(playerData);
                const npcStats = getCombatStats(npc); 

                // === 玩家 攻擊 NPC ===
                if (!playerData.isUnconscious) {
                    let enabledType = playerData.enabled_skills && playerData.enabled_skills[playerStats.atkType];
                    let activeSkillId = enabledType || playerStats.atkType;
                    let skillInfo = SkillDB[activeSkillId];

                    let action = { msg: "$P對$N發起攻擊。", damage: 10 };
                    if (skillInfo && skillInfo.actions && skillInfo.actions.length > 0) {
                        action = skillInfo.actions[Math.floor(Math.random() * skillInfo.actions.length)];
                    }

                    let skillBaseDmg = action.damage || 10;
                    
                    let msg = action.msg
                        .replace(/\$P/g, playerData.name)
                        .replace(/\$N/g, npc.name)
                        .replace(/\$w/g, playerStats.weaponData ? playerStats.weaponData.name : "雙手");

                    const pHitChance = Math.random() * (playerStats.hit + npcStats.dodge);
                    const isHit = currentCombatState.npcIsUnconscious ? true : (pHitChance < playerStats.hit);

                    UI.print(UI.txt(msg, "#ffff00"), "system", true); 

                    if (isHit) {
                        let damage = playerStats.ap - npcStats.dp;
                        damage += (skillBaseDmg / 2); 
                        damage = Math.floor(damage * (0.9 + Math.random() * 0.2));
                        if (damage <= 0) damage = Math.floor(Math.random() * 5) + 1;
                        if (isNaN(damage)) damage = 1; 

                        currentCombatState.npcHp -= damage;
                        UI.print(`(造成了 ${damage} 點傷害)`, "chat");

                        // [新增] 顯示 NPC 受傷狀態描述
                        const statusMsg = getStatusDesc(npc.name, currentCombatState.npcHp, currentCombatState.maxNpcHp);
                        if (statusMsg) UI.print(statusMsg, "chat", true);
                        
                        // --- NPC 狀態判定 ---
                        if (currentCombatState.npcHp <= 0) {
                            if (!currentCombatState.npcIsUnconscious) {
                                // 第一次歸零 -> 進入暈倒狀態
                                currentCombatState.npcIsUnconscious = true;
                                currentCombatState.npcHp = 0; 
                                // [UI修正] 補上 true
                                UI.print(UI.txt(`${npc.name} 搖頭晃腦，腳步踉蹌，咚的一聲倒在地上，動彈不得！`, "#888"), "system", true);
                            } else {
                                // 已經暈倒又被打 -> 真的死亡
                                UI.print(UI.txt(`${npc.name} 慘叫一聲，被你結果了性命。`, "#ff0000", true), "system", true);
                                
                                const playerLvl = getLevel(playerData);
                                const npcLvl = getLevel(npc); 
                                let potGain = 100 + ((npcLvl - playerLvl) * 10);
                                if (potGain < 10) potGain = 10;
                                
                                playerData.combat.potential = (playerData.combat.potential || 0) + potGain;
                                playerData.combat.kills = (playerData.combat.kills || 0) + 1;
                                UI.print(UI.txt(`戰鬥勝利！獲得 ${potGain} 點潛能。`, "#00ff00", true), "system", true);

                                // 掉落物
                                if (npc.drops) {
                                    for (const drop of npc.drops) {
                                        if (Math.random() <= drop.rate) {
                                            const itemInfo = ItemDB[drop.id];
                                            if(itemInfo) {
                                                await addDoc(collection(db, "room_items"), {
                                                    roomId: playerData.location, itemId: drop.id, name: itemInfo.name, droppedBy: "SYSTEM", timestamp: serverTimestamp()
                                                });
                                                UI.print(`${npc.name} 掉出了 ${itemInfo.name}。`, "system");
                                            }
                                        }
                                    }
                                }

                                await addDoc(collection(db, "dead_npcs"), { 
                                    roomId: playerData.location, npcId: npc.id, index: npc.index, respawnTime: Date.now() + 300000 
                                });

                                stopCombat(userId);
                                await updatePlayer(userId, { 
                                    "combat.potential": playerData.combat.potential,
                                    "combat.kills": playerData.combat.kills 
                                });
                                MapSystem.look(playerData); 
                                return; 
                            }
                        }
                    } else {
                        UI.print(UI.txt(`${npc.name} 身形一晃，閃過了你的攻擊！`, "#aaa"), "chat", true);
                    }
                } else {
                    UI.print("你現在暈頭轉向，根本無法攻擊！", "error");
                }

                // --- NPC 反擊 玩家 ---
                if (!currentCombatState.npcIsUnconscious && playerData.location === currentCombatState.roomId) {
                    let npcMsg = `${npc.name} 往 ${playerData.name} 撲了過來！`;
                    const nHitChance = Math.random() * (npcStats.hit + playerStats.dodge);
                    const nIsHit = playerData.isUnconscious ? true : (nHitChance < npcStats.hit);
                    
                    UI.print(UI.txt(npcMsg, "#ff5555"), "system", true);

                    if (nIsHit) {
                        // [BUG FIX] 修正攻擊力讀取錯誤 (npcStats.attack -> npcStats.ap)
                        // 之前版本因為讀不到 attack (undefined) 導致傷害計算錯誤 (變成 NaN 觸發保底 1 點)
                        let dmg = npcStats.ap - playerStats.dp;
                        if (dmg <= 0) dmg = Math.floor(Math.random() * 3) + 1;
                        if (isNaN(dmg)) dmg = 1;
                        
                        playerData.attributes.hp -= dmg;
                        
                        // [UI修正] 玩家受傷後，立即更新右側 UI
                        UI.updateHUD(playerData);

                        UI.print(`(你受到了 ${dmg} 點傷害)`, "chat");

                        // [新增] 顯示玩家受傷狀態描述
                        const statusMsg = getStatusDesc("你", playerData.attributes.hp, playerData.attributes.maxHp);
                        if (statusMsg) UI.print(statusMsg, "chat", true);

                        // --- 玩家 狀態判定 ---
                        if (playerData.attributes.hp <= 0) {
                            if (!playerData.isUnconscious) {
                                // 第一次歸零 -> 玩家暈倒
                                playerData.isUnconscious = true;
                                playerData.attributes.hp = 0;
                                UI.print(UI.txt("你只覺天旋地轉，站立不穩，咚的一聲倒在地上...", "#ff8800", true), "system", true);
                                await updatePlayer(userId, { "attributes.hp": 0, isUnconscious: true });
                            } else {
                                // 已經暈倒又被打 -> 玩家死亡
                                UI.print(UI.txt("這致命的一擊奪走了你最後的生機！", "#ff0000", true), "system", true);
                                await handlePlayerDeath(playerData, userId);
                                return; // 結束迴圈
                            }
                        }
                    } else {
                        UI.print(UI.txt(`你側身避開了 ${npc.name} 的攻擊。`, "#aaa"), "chat", true);
                    }
                } else if (currentCombatState.npcIsUnconscious) {
                    // [UI修正] 補上 true
                    UI.print(UI.txt(`${npc.name} 倒在地上，毫無反抗之力。`, "#888"), "chat", true);
                }

                await updatePlayer(userId, { "attributes.hp": playerData.attributes.hp });
            };

            combatRound();
            combatInterval = setInterval(combatRound, 2000); 
        }
    },

    'look': { 
        description: '觀察', 
        execute: (p, a) => { 
            if(a.length>0) { 
                const npc = findNPCInRoom(p.location, a[0]); 
                if(npc) { 
                    let h = UI.titleLine(`${npc.name} (${npc.id})`); 
                    h+=UI.txt(npc.description+"<br>", "#ddd"); 
                    const isMaster = (p.family && p.family.masterId===npc.id); 
                    if(!isMaster && npc.family) h+=UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn"); 
                    
                    if(isMaster && npc.skills) { 
                        h+=UI.txt("<br>師父會的武功：<br>","#0ff"); 
                        for(const [sid, lvl] of Object.entries(npc.skills)) {
                            const sInfo=SkillDB[sid]; 
                            if(sInfo) {
                                const desc = getSkillLevelDesc(lvl);
                                h+=`- ${sInfo.name}(${sid}) <span style="color:#ff0">${lvl}級 / ${desc}</span> ${UI.makeCmd("[學藝]", `learn ${sid} from ${npc.id}`, "cmd-btn")}<br>`;
                            }
                        } 
                    } 
                    UI.print(h, "system", true); 
                    return; 
                } 
                const invItem = p.inventory.find(i=>i.id===a[0]||i.name===a[0]); 
                if(invItem) { 
                    const info = ItemDB[invItem.id]; 
                    UI.print(UI.titleLine(`${info.name} (${invItem.id})`)+UI.txt(info.desc,"#ddd"),"system",true); 
                    return; 
                } 
            } 
            MapSystem.look(p); 
        } 
    },

    'inventory': { 
        description: '背包', 
        execute: (p) => { 
            let h = UI.titleLine("背包") + `<div>${UI.attrLine("財產", UI.formatMoney(p.money))}</div><br>`; 
            if (!p.inventory || p.inventory.length === 0) h += UI.txt("空空如也。<br>", "#888"); 
            else {
                p.inventory.forEach(i => { 
                    const dat = ItemDB[i.id]; 
                    if (!dat) return;
                    let act = ""; 
                    let status = "";

                    const isWeaponEquipped = p.equipment && p.equipment.weapon === i.id;
                    const isArmorEquipped = p.equipment && p.equipment.armor === i.id;

                    if (isWeaponEquipped) {
                        status = UI.txt(" (已裝備)", "#ff00ff");
                        act += UI.makeCmd("[卸下]", `unwield`, "cmd-btn");
                    } else if (isArmorEquipped) {
                        status = UI.txt(" (已穿戴)", "#ff00ff");
                        act += UI.makeCmd("[脫下]", `unwear`, "cmd-btn");
                    } else {
                        // [修正] 泛用武器裝備邏輯
                        const allowedTypes = ['weapon', 'sword', 'blade', 'stick', 'dagger', 'whip', 'throwing', 'lance'];
                        if (allowedTypes.includes(dat.type)) act += UI.makeCmd("[裝備]", `wield ${i.id}`, "cmd-btn");
                        if (dat.type === 'armor') act += UI.makeCmd("[穿戴]", `wear ${i.id}`, "cmd-btn");
                        if (dat.type === 'food') act += UI.makeCmd("[吃]", `eat ${i.id}`, "cmd-btn"); 
                        if (dat.type === 'drink') act += UI.makeCmd("[喝]", `drink ${i.id}`, "cmd-btn"); 
                        act += UI.makeCmd("[丟]", `drop ${i.id}`, "cmd-btn");
                    }
                    
                    act += UI.makeCmd("[看]", `look ${i.id}`, "cmd-btn"); 
                    h += `<div>${UI.txt(i.name, "#fff")} (${i.id}) x${i.count}${status} ${act}</div>`; 
                });
            }
            UI.print(h + UI.titleLine("End"), "chat", true); 
        } 
    },

    'sk': { description: 'sk', execute: (p)=>commandRegistry['skills'].execute(p) },
    'l': { description: 'look', execute: (p, a) => commandRegistry['look'].execute(p, a) },
    'i': { description: 'i', execute: (p)=>commandRegistry['inventory'].execute(p) },
    'fight': { description: '切磋', execute: async (p,a,u)=>{if(a.length===0)return UI.print("跟誰?","error"); const npc=findNPCInRoom(p.location,a[0]); if(!npc)return UI.print("沒人","error"); UI.print(`與 ${npc.name} 切磋。`,"chat");} },
    'learn': { description: '學藝', execute: async (p,a,u)=>{ if(a.length<3||a[1]!=='from'){UI.print("learn <skill> from <master>","error");return;} const sid=a[0], mid=a[2]; const npc=findNPCInRoom(p.location,mid); if(!npc){UI.print("沒人","error");return;} if(!p.family||p.family.masterId!==npc.id){UI.print("需拜師","error");return;} if(!npc.skills[sid]){UI.print("他不會","chat");return;} if((p.skills[sid]||0)>=npc.skills[sid]){UI.print("學滿了","chat");return;} const spC=10+Math.floor((p.skills[sid]||0)/2), potC=5+Math.floor((p.skills[sid]||0)/5); if(p.attributes.sp<=spC){UI.print("精不足","error");return;} if((p.combat.potential||0)<potC){UI.print("潛能不足","error");return;} p.attributes.sp-=spC; p.combat.potential-=potC; p.skills[sid]=(p.skills[sid]||0)+1; UI.print(`學習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); await updatePlayer(u,{"attributes.sp":p.attributes.sp,"combat.potential":p.combat.potential,"skills":p.skills}); } },
    'practice': { description: '練習', execute: async (p,a,u)=>{ if(a.length===0){UI.print("practice <skill>","error");return;} const sid=a[0]; if(!SkillDB[sid]){UI.print("沒這招","error");return;} if(!(p.skills[sid])){UI.print("不會","error");return;} if(SkillDB[sid].base && p.skills[sid]>=p.skills[SkillDB[sid].base]){UI.print("基礎不足","error");return;} const cost=10+Math.floor(p.skills[sid]/2); if(p.attributes.hp<=cost){UI.print("氣不足","error");return;} p.attributes.hp-=cost; p.skills[sid]++; UI.print(`練習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); await updatePlayer(u,{"attributes.hp":p.attributes.hp,"skills":p.skills}); } },
    'buy': { description: '買', execute: async (p,a,u) => { if(a.length<1){UI.print("買啥?","error");return;} let n=a[0],amt=1,nn=null; if(a.length>=2&&!isNaN(a[1]))amt=parseInt(a[1]); if(a.indexOf('from')!==-1)nn=a[a.indexOf('from')+1]; else {const r=MapSystem.getRoom(p.location);if(r.npcs)nn=r.npcs[0];} const npc=findNPCInRoom(p.location,nn); if(!npc){UI.print("沒人","error");return;} let tid=null,pr=0; if(npc.shop[n]){tid=n;pr=npc.shop[n];}else{for(const[k,v]of Object.entries(npc.shop)){if(ItemDB[k]&&ItemDB[k].name===n){tid=k;pr=v;break;}}} if(!tid){UI.print("沒賣","error");return;} const tot=pr*amt; if((p.money||0)<tot){UI.print("錢不夠","error");return;} p.money-=tot; if(!p.inventory)p.inventory=[]; const ex=p.inventory.find(i=>i.id===tid); if(ex)ex.count+=amt; else p.inventory.push({id:tid,name:ItemDB[tid].name,count:amt}); UI.print(`買了 ${amt} ${ItemDB[tid].name}`,"system"); await updatePlayer(u,{money:p.money,inventory:p.inventory}); } },
    
    // [UI修正] list 指令中，商品名稱後方加入 (id)
    'list': { 
        description: '列表', 
        execute: (p,a) => { 
            const r=MapSystem.getRoom(p.location); 
            let nn=null; 
            if(a.length>0)nn=a[0]; else if(r.npcs)nn=r.npcs[0]; 
            const npc=findNPCInRoom(p.location,nn); 
            if(!npc||!npc.shop)return UI.print("沒賣東西","error"); 
            let h=UI.titleLine(npc.name+" 商品"); 
            for(const[k,v]of Object.entries(npc.shop)) 
                h+=`<div>${ItemDB[k].name} <span style="color:#888">(${k})</span>: ${UI.formatMoney(v)} ${UI.makeCmd("[買1]",`buy ${k} 1 from ${npc.id}`,"cmd-btn")}</div>`; 
            UI.print(h,"",true); 
        } 
    },
    'drop': { description: '丟', execute: async (p,a,u) => { if(a.length===0)return UI.print("丟啥?","error"); const idx=p.inventory.findIndex(x=>x.id===a[0]||x.name===a[0]); if(idx===-1)return UI.print("沒這個","error"); const it=p.inventory[idx]; if(it.count>1)it.count--; else p.inventory.splice(idx,1); await updatePlayer(u,{inventory:p.inventory}); await addDoc(collection(db,"room_items"),{roomId:p.location,itemId:it.id,name:it.name,droppedBy:p.name,timestamp:serverTimestamp()}); UI.print("丟了 "+it.name,"system"); MapSystem.look(p); } },
    
    // [優化] 撿東西後不再刷新 Look，避免洗版
    'get': { 
        description: '撿', 
        execute: async (p,a,u) => { 
            if(a.length===0)return UI.print("撿啥?","error"); 
            const q=query(collection(db,"room_items"),where("roomId","==",p.location),where("itemId","==",a[0])); 
            const snap=await getDocs(q); 
            if(snap.empty)return UI.print("沒東西","error"); 
            const d=snap.docs[0]; 
            await deleteDoc(doc(db,"room_items",d.id)); 
            const dat=d.data(); 
            if(!p.inventory)p.inventory=[]; 
            const ex=p.inventory.find(x=>x.id===dat.itemId); 
            if(ex)ex.count++; else p.inventory.push({id:dat.itemId,name:dat.name,count:1}); 
            await updatePlayer(u,{inventory:p.inventory}); 
            UI.print("撿了 "+dat.name,"system"); 
        } 
    },
    'say': { description: '說', execute: (p,a)=>{const m=a.join(" ");UI.print(`你: ${m}`,"chat");MessageSystem.broadcast(p.location,`${p.name} 說: ${m}`);} },
    'emote': { description: '演', execute: (p,a)=>{const m=a.join(" ");UI.print(`${p.name} ${m}`,"system");MessageSystem.broadcast(p.location,`${p.name} ${m}`);} },
    'save': { 
        description: '存檔', 
        execute: async(p, a, u) => {
            const room = MapSystem.getRoom(p.location);
            let updateData = { lastSaved: new Date().toISOString() };
            let msg = "遊戲進度已保存。";
            if (room && room.allowSave) {
                updateData.savePoint = p.location;
                msg += " (重生點已更新至此處)";
            }
            await updatePlayer(u, updateData);
            UI.print(msg, "system");
        } 
    },
    'recall': { description: '回', execute: (p,a,u)=>MapSystem.teleport(p,p.savePoint||"inn_start",u) },
    'suicide': { description: '死', execute: async(p,a,u)=>{if(a[0]==='confirm'){await deleteDoc(doc(db,"players",u));await signOut(auth);}else UI.print("confirm?","error");} }
};

Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
});
Object.values(dirMapping).forEach(fullDir => {
    if (!commandRegistry[fullDir]) {
        commandRegistry[fullDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
    }
});

export const CommandSystem = {
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        
        if (playerData.state === 'fighting') {
             const args = inputStr.trim().split(/\s+/);
             const cmd = args[0].toLowerCase();
             if (['n','s','e','w','u','d','north','south','east','west','up','down'].includes(cmd)) {
             } else if (!['kill', 'look', 'score', 'hp', 'help', 'skills', 'l'].includes(cmd)) {
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
        
        if (cmdName === 'kill' && playerData.state === 'fighting') {
             UI.print("戰鬥正在進行中...", "system");
             return;
        }

        const command = commandRegistry[cmdName];
        if (command) command.execute(playerData, args, userId);
        else UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error");
    },
    stopCombat: stopCombat
};