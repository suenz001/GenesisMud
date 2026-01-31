// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { CommandSystem } from "./commands.js"; // 引入 CommandSystem 以呼叫 stopCombat

const DIR_OFFSET = {
    'north': { x: 0, y: 1, z: 0 }, 'south': { x: 0, y: -1, z: 0 },
    'east':  { x: 1, y: 0, z: 0 }, 'west':  { x: -1, y: 0, z: 0 },
    'up':    { x: 0, y: 0, z: 1 }, 'down':  { x: 0, y: 0, z: -1 },
    'northeast': { x: 1, y: 1, z: 0 }, 'northwest': { x: -1, y: 1, z: 0 },
    'southeast': { x: 1, y: -1, z: 0 }, 'southwest': { x: -1, y: -1, z: 0 }
};

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

        // --- NPC 顯示 (過濾死亡) ---
        if (room.npcs && room.npcs.length > 0) {
            let deadNPCs = [];
            try {
                // 讀取該房間的屍體列表
                const deadRef = collection(db, "dead_npcs");
                const q = query(deadRef, where("roomId", "==", playerData.location));
                const snapshot = await getDocs(q);
                const now = Date.now();
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    // 檢查重生時間 (5分鐘 = 300000ms)
                    if (now >= data.respawnTime) {
                        deleteDoc(doc.ref); // 重生：刪除屍體紀錄
                    } else {
                        deadNPCs.push({ npcId: data.npcId, index: data.index });
                    }
                });
            } catch (e) { console.error(e); }

            let npcListHtml = "";
            room.npcs.forEach((npcId, index) => {
                // 精確比對 ID 和 Index，解決同名怪物問題
                const isDead = deadNPCs.some(d => d.npcId === npcId && d.index === index);
                
                if (!isDead) {
                    const npc = NPCDB[npcId];
                    if (npc) {
                        // 檢查是否為當前玩家的戰鬥目標
                        let statusTag = "";
                        if (playerData.state === 'fighting' && 
                            playerData.combatTarget && 
                            playerData.combatTarget.id === npcId && 
                            playerData.combatTarget.index === index) {
                            statusTag = UI.txt(" 【戰鬥中】", "#ff0000", true);
                        }

                        let links = `${UI.txt(npc.name, "#fff")} <span style="color:#aaa">(${npc.id})</span>${statusTag} `;
                        links += UI.makeCmd("[看]", `look ${npc.id}`, "cmd-btn");
                        
                        const isMyMaster = (playerData.family && playerData.family.masterId === npc.id);
                        if (!isMyMaster && npc.family) {
                            links += UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn");
                        }
                        
                        if (npc.shop) links += UI.makeCmd("[商品]", `list ${npc.id}`, "cmd-btn");
                        
                        // 戰鬥指令
                        if (playerData.state !== 'fighting') {
                            links += UI.makeCmd("[戰鬥]", `fight ${npc.id}`, "cmd-btn");
                            links += UI.makeCmd("[下殺手]", `kill ${npc.id}`, "cmd-btn cmd-btn-buy");
                        } else if (statusTag) {
                            // 戰鬥中顯示停止或逃跑提示，或不顯示
                        }

                        npcListHtml += `<div style="margin-top:4px;">${links}</div>`;
                    }
                }
            });
            if (npcListHtml) UI.print(npcListHtml, "chat", true);
        }

        // --- 玩家顯示 ---
        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("location", "==", playerData.location));
            const querySnapshot = await getDocs(q);
            let playerHtml = "";
            querySnapshot.forEach((doc) => {
                const p = doc.data();
                // 顯示所有玩家 (包含自己)
                let status = "";
                if (p.state === 'fighting') status = UI.txt(" 【戰鬥中】", "#ff0000", true);
                
                if (auth.currentUser && doc.id === auth.currentUser.uid) {
                    // 自己
                    playerHtml += `<div style="margin-top:2px;">[ 你 ] ${p.name}${status}</div>`;
                } else {
                    playerHtml += `<div style="margin-top:2px;">[ 玩家 ] ${p.name} <span style="color:#aaa">(${p.id || 'unknown'})</span>${status}</div>`;
                }
            });
            if (playerHtml) UI.print(playerHtml, "chat", true);
        } catch (e) { console.error(e); }

        // --- 掉落物顯示 ---
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

        // --- 出口顯示 ---
        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitKeys = Object.keys(validExits);
        
        if (exitKeys.length === 0) UI.print(`明顯的出口：無`, "chat");
        else {
            const exitLinks = exitKeys.map(dir => UI.makeCmd(dir, dir, "cmd-link")).join(", ");
            UI.print(`明顯的出口：${exitLinks}`, "chat", true);
        }
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;
        
        // 戰鬥中移動限制
        if (playerData.state === 'fighting') {
            // 逃跑機制：50% 機率成功
            if (Math.random() < 0.5) {
                 UI.print("你被敵人纏住了，無法脫身！", "error");
                 return;
            } else {
                 UI.print("你狼狽地逃出了戰圈...", "system");
                 // 呼叫 commands.js 的 stopCombat
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
        
        // 移動後清除戰鬥狀態 (保險起見)
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