// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { CommandSystem } from "./commands.js"; 
import { SkillDB } from "../data/skills.js"; 
import { CombatSystem } from "./combat.js";
import { ItemDB } from "../data/items.js";

const DIR_OFFSET = {
    'north': { x: 0, y: 1, z: 0 }, 'south': { x: 0, y: -1, z: 0 },
    'east':  { x: 1, y: 0, z: 0 }, 'west':  { x: -1, y: 0, z: 0 },
    'up':    { x: 0, y: 0, z: 1 }, 'down':  { x: 0, y: 0, z: -1 },
    'northeast': { x: 1, y: 1, z: 0 }, 'northwest': { x: -1, y: 1, z: 0 },
    'southeast': { x: 1, y: -1, z: 0 }, 'southwest': { x: -1, y: -1, z: 0 }
};

function getSkillDesc(level) {
    if (level >= 500) return UI.txt("深不可測", "#ff00ff");
    if (level >= 400) return UI.txt("返璞歸真", "#ff0000");
    if (level >= 300) return UI.txt("出神入化", "#ff8800");
    if (level >= 200) return UI.txt("登峰造極", "#ffff00");
    if (level >= 150) return UI.txt("出類拔萃", "#00ff00");
    if (level >= 100) return UI.txt("爐火純青", "#00ffff");
    if (level >= 60) return UI.txt("融會貫通", "#0088ff");
    if (level >= 30) return UI.txt("駕輕就熟", "#8888ff");
    return UI.txt("略有小成", "#ffffff");
}

export const MapSystem = {
    getRoom: (roomId) => WorldMap[roomId],

    getAvailableExits: (currentRoomId) => {
        const room = WorldMap[currentRoomId];
        if (!room) return {};
        const exits = {};
        if (room.exits) Object.assign(exits, room.exits);
        const currentRegions = room.region || ["world"];

        for (const [dir, offset] of Object.entries(DIR_OFFSET)) {
            if (room.walls && room.walls.includes(dir)) continue;
            const targetX = room.x + offset.x;
            const targetY = room.y + offset.y;
            const targetZ = room.z + offset.z;
            for (const [targetId, targetRoom] of Object.entries(WorldMap)) {
                if (targetRoom.x === targetX && targetRoom.y === targetY && targetRoom.z === targetZ) {
                    const targetRegions = targetRoom.region || ["world"];
                    const hasCommonRegion = currentRegions.some(r => targetRegions.includes(r));
                    if (hasCommonRegion && !exits[dir]) exits[dir] = targetId;
                }
            }
        }
        return exits;
    },

    look: async (playerData) => {
        if (!playerData || !playerData.location) return;
        
        const room = WorldMap[playerData.location];
        if (!room) { UI.print("你陷入虛空...", "error"); return; }

        MessageSystem.listenToRoom(playerData.location);
        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData);
        UI.print(`【${room.title}】`, "system");
        if (room.safe) UI.print(UI.txt("【 安全區 】", "#00ff00"), "system", true);
        UI.print(room.description);

        // === [新增] 先讀取房間內所有玩家資料，以便判斷 NPC 是否正在被戰鬥 ===
        let playersInRoom = [];
        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("location", "==", playerData.location));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach(doc => {
                const p = doc.data();
                // 順便排除自己，但在判斷 NPC 狀態時自己也要算進去，所以這裡先存原始資料
                playersInRoom.push(p); 
            });
        } catch (e) { console.error(e); }

        // 建立一個 "正在被戰鬥的 NPC" 集合 (格式: npcId_index)
        const fightingNpcKeys = new Set();
        playersInRoom.forEach(p => {
            if (p.state === 'fighting' && p.combatTarget) {
                fightingNpcKeys.add(`${p.combatTarget.id}_${p.combatTarget.index}`);
            }
        });

        // === 顯示 NPC 列表 ===
        if (room.npcs && room.npcs.length > 0) {
            let deadNPCs = [];
            try {
                const deadRef = collection(db, "dead_npcs");
                const q = query(deadRef, where("roomId", "==", playerData.location));
                const snapshot = await getDocs(q);
                const now = Date.now();
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (now >= data.respawnTime) {
                        deleteDoc(doc.ref); 
                    } else {
                        deadNPCs.push({ npcId: data.npcId, index: data.index });
                    }
                });
            } catch (e) { console.error(e); }

            let npcListHtml = "";
            room.npcs.forEach((npcId, index) => {
                const isDead = deadNPCs.some(d => d.npcId === npcId && d.index === index);
                if (!isDead) {
                    const npc = NPCDB[npcId];
                    if (npc) {
                        let statusTag = "";
                        
                        // [修改] 檢查這個 NPC 是否在戰鬥名單中 (不論是被我打，還是被別人打)
                        if (fightingNpcKeys.has(`${npcId}_${index}`)) {
                            statusTag = UI.txt(" 【戰鬥中】", "#ff0000", true);
                        }

                        const diff = CombatSystem.getDifficultyInfo(playerData, npcId);
                        const coloredName = UI.txt(npc.name, diff.color);

                        let links = `${coloredName} <span style="color:#aaa">(${npc.id})</span>${statusTag} `;
                        links += UI.makeCmd("[看]", `look ${npc.id}`, "cmd-btn");
                        
                        const isMyMaster = (playerData.family && playerData.family.masterId === npc.id);
                        if (!isMyMaster && npc.family) {
                            links += UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn");
                        }
                        
                        if (npc.shop) links += UI.makeCmd("[商品]", `list ${npc.id}`, "cmd-btn");
                        
                        if (playerData.state !== 'fighting') {
                            links += UI.makeCmd("[戰鬥]", `fight ${npc.id}`, "cmd-btn");
                            links += UI.makeCmd("[殺]", `kill ${npc.id}`, "cmd-btn cmd-btn-buy");
                        } 

                        npcListHtml += `<div style="margin-top:4px;">${links}</div>`;
                    }
                }
            });
            if (npcListHtml) UI.print(npcListHtml, "chat", true);
        }

        // === 顯示玩家列表 (使用剛才預先讀取的 playersInRoom) ===
        if (playersInRoom.length > 0) {
            let playerHtml = "";
            playersInRoom.forEach((p) => {
                // 排除自己
                if (auth.currentUser && p.id === playerData.id) return; 

                let status = "";
                // [修改] 只要狀態是 fighting，就加上紅字
                if (p.state === 'fighting') status = UI.txt(" 【戰鬥中】", "#ff0000", true);
                if (p.isUnconscious) status += UI.txt(" (昏迷)", "#888");

                playerHtml += `<div style="margin-top:2px;">[ 玩家 ] ${p.name} <span style="color:#aaa">(${p.id || 'unknown'})</span>${status}</div>`;
            });
            if (playerHtml) UI.print(playerHtml, "chat", true);
        }

        try {
            const itemsRef = collection(db, "room_items");
            const qItems = query(itemsRef, where("roomId", "==", playerData.location));
            const itemSnapshot = await getDocs(qItems);
            let itemHtml = "";
            itemSnapshot.forEach((doc) => {
                const item = doc.data();
                let link = `${UI.txt(item.name, "#ddd")} <span style="color:#666">(${item.itemId})</span> `;
                link += UI.makeCmd("[撿取]", `get ${item.itemId}`, "cmd-btn");
                itemHtml += `<div style="margin-top:2px;">${link}</div>`;
            });
            if (itemHtml) UI.print(itemHtml, "chat", true);
        } catch (e) { console.error(e); }

        if (room.hasWell) {
            UI.print(`這裡有一口清澈的${UI.txt("水井", "#00ffff")}。 ${UI.makeCmd("[喝水]", "drink water", "cmd-btn")}`, "chat", true);
        }

        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitKeys = Object.keys(validExits);
        
        if (exitKeys.length === 0) UI.print(`明顯的出口：無`, "chat");
        else {
            const exitLinks = exitKeys.map(dir => UI.makeCmd(dir, dir, "cmd-link")).join(", ");
            UI.print(`明顯的出口：${exitLinks}`, "chat", true);
        }
    },

    lookTarget: (playerData, targetId) => {
        // 1. 優先檢查玩家身上的背包
        if (playerData.inventory) {
            const item = playerData.inventory.find(i => i.id === targetId || i.name === targetId);
            if (item) {
                const info = ItemDB[item.id];
                if (info) {
                    UI.print(UI.titleLine(info.name), "chat", true);
                    UI.print(info.desc || "看起來平平無奇。");
                    UI.print(UI.attrLine("價值", UI.formatMoney(info.value)), "chat", true);
                    
                    if (info.damage) UI.print(UI.attrLine("殺傷力", info.damage), "chat", true);
                    if (info.defense) UI.print(UI.attrLine("防禦力", info.defense), "chat", true);
                    
                    UI.print(UI.titleLine("End"), "chat", true);
                    return; 
                }
            }
        }

        // 2. 檢查房間內的 NPC
        const room = WorldMap[playerData.location];
        if (room.npcs && room.npcs.includes(targetId)) {
            const npc = NPCDB[targetId];
            if (npc) {
                UI.print(UI.titleLine(npc.name), "chat", true); 
                UI.print(npc.description);
                UI.print(UI.attrLine("體力", `${npc.combat.hp}/${npc.combat.maxHp}`), "chat", true); 

                if (playerData.family && playerData.family.masterId === npc.id && npc.skills) {
                    let skillHtml = `<br>${UI.txt("【 師傳武學 】", "#ffff00")}<br>`;
                    skillHtml += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap:5px;">`;
                    
                    for (const [sid, lvl] of Object.entries(npc.skills)) {
                        const sInfo = SkillDB[sid];
                        if (sInfo) {
                            skillHtml += `<div>${sInfo.name} <span style="color:#aaa">(${sid})</span></div>`;
                            skillHtml += `<div>${UI.txt(lvl+"級", "#00ffff")}</div>`;
                            skillHtml += `<div>${getSkillDesc(lvl)} ${UI.makeCmd("[學習]", `learn ${sid} from ${npc.id}`, "cmd-btn")}</div>`;
                        }
                    }
                    skillHtml += `</div>`;
                    UI.print(skillHtml, "chat", true);
                }
                
                UI.print(UI.titleLine("End"), "chat", true);
                return;
            }
        }
        
        UI.print("你看不到 " + targetId + "。", "error");
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;
        
        if (playerData.state === 'fighting') {
            if (Math.random() < 0.5) {
                 UI.print("你被敵人纏住了，無法脫身！", "error");
                 return;
            } else {
                 UI.print("你狼狽地逃出了戰圈...", "system");
                 if(CommandSystem.stopCombat) CommandSystem.stopCombat(userId);
            }
        }

        const validExits = MapSystem.getAvailableExits(playerData.location);
        if (!validExits[direction]) {
            const room = WorldMap[playerData.location];
            if (room.walls && room.walls.includes(direction)) UI.print("那邊是一面牆，過不去。", "error");
            else UI.print("那個方向沒有路。", "error");
            return;
        }
        const attr = playerData.attributes;
        if (attr.food <= 0 || attr.water <= 0) { UI.print("你餓得頭昏眼花...", "error"); return; }
        attr.food = Math.max(0, attr.food - 1);
        attr.water = Math.max(0, attr.water - 1);
        
        await MessageSystem.broadcast(playerData.location, `${playerData.name} 往 ${direction} 離開了。`);
        
        const nextRoomId = validExits[direction];
        playerData.location = nextRoomId;
        
        playerData.state = 'normal'; 
        playerData.combatTarget = null;

        UI.print(`你往 ${direction} 走去...`);
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: nextRoomId, 
                "attributes.food": attr.food, 
                "attributes.water": attr.water,
                state: 'normal',
                combatTarget: null
            });
        } catch (e) { console.error(e); }
        await MapSystem.look(playerData);
        await MessageSystem.broadcast(nextRoomId, `${playerData.name} 走了過來。`);
    },

    teleport: async (playerData, targetRoomId, userId) => {
        if (!WorldMap[targetRoomId]) return UI.print("目標地點不存在。", "error");
        
        if (playerData.state === 'fighting' && CommandSystem.stopCombat) {
            CommandSystem.stopCombat(userId);
        }

        await MessageSystem.broadcast(playerData.location, `${playerData.name} 消失了。`);
        playerData.location = targetRoomId;
        playerData.state = 'normal'; 
        playerData.combatTarget = null;

        UI.print("白光一閃...", "system");
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: targetRoomId, 
                state: 'normal',
                combatTarget: null
            });
        } catch (e) { console.error(e); }
        await MapSystem.look(playerData);
        await MessageSystem.broadcast(targetRoomId, `${playerData.name} 出現了。`);
    }
};