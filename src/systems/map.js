// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { ItemDB } from "../data/items.js";
import { SkillDB } from "../data/skills.js"; // 記得引入 SkillDB

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

        let chars = [];
        
        // --- NPC 顯示邏輯 (含師徒按鈕) ---
        if (room.npcs && room.npcs.length > 0) {
            let deadNPCs = [];
            try {
                const deadRef = collection(db, "dead_npcs");
                const q = query(deadRef, where("roomId", "==", playerData.location));
                const snapshot = await getDocs(q);
                const now = Date.now();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (now >= data.respawnTime) deleteDoc(doc.ref);
                    else deadNPCs.push({ npcId: data.npcId, index: data.index });
                });
            } catch (e) { console.error(e); }

            room.npcs.forEach((npcId, index) => {
                const isDead = deadNPCs.some(d => d.npcId === npcId && d.index === index);
                if (!isDead) {
                    const npc = NPCDB[npcId];
                    if (npc) {
                        let links = `${npc.name}(${npc.id})`;
                        links += UI.makeCmd("[看]", `look ${npc.id}`, "cmd-btn");
                        
                        // 師徒互動按鈕
                        const isMyMaster = (playerData.family && playerData.family.masterId === npc.id);
                        if (!isMyMaster && npc.family) {
                            links += UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn");
                        }
                        // 已拜師則在 look npc 時顯示學藝，這裡只顯示基本按鈕，避免畫面過亂
                        
                        if (npc.shop) links += UI.makeCmd("[商品]", `list ${npc.id}`, "cmd-btn");
                        
                        // 戰鬥按鈕
                        links += UI.makeCmd("[戰鬥]", `fight ${npc.id}`, "cmd-btn");
                        links += UI.makeCmd("[下殺手]", `kill ${npc.id}`, "cmd-btn cmd-btn-buy");

                        chars.push(links);
                    }
                }
            });
        }

        // 其他玩家
        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("location", "==", playerData.location));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                if (auth.currentUser && doc.id !== auth.currentUser.uid) {
                    const p = doc.data();
                    chars.push(`[ 玩家 ] : ${p.name}(${p.id || 'unknown'})`);
                }
            });
        } catch (e) { console.error(e); }

        if (chars.length > 0) UI.print(`這裡明顯的人物有：${chars.join("、")}`, "chat", true);

        // 掉落物
        try {
            const itemsRef = collection(db, "room_items");
            const qItems = query(itemsRef, where("roomId", "==", playerData.location));
            const itemSnapshot = await getDocs(qItems);
            let droppedItems = [];
            itemSnapshot.forEach((doc) => {
                const item = doc.data();
                let link = `${item.name}(${item.itemId})`;
                link += UI.makeCmd("[撿取]", `get ${item.itemId}`, "cmd-btn");
                droppedItems.push(link);
            });
            if (droppedItems.length > 0) UI.print(`地上的物品：${droppedItems.join("、")}`, "chat", true);
        } catch (e) { console.error(e); }

        // 出口
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
        UI.print(`你往 ${direction} 走去...`);
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { location: nextRoomId, "attributes.food": attr.food, "attributes.water": attr.water });
        } catch (e) { console.error(e); }
        await MapSystem.look(playerData);
        await MessageSystem.broadcast(nextRoomId, `${playerData.name} 走了過來。`);
    },

    teleport: async (playerData, targetRoomId, userId) => {
        if (!WorldMap[targetRoomId]) return UI.print("目標地點不存在。", "error");
        await MessageSystem.broadcast(playerData.location, `${playerData.name} 消失了。`);
        playerData.location = targetRoomId;
        UI.print("白光一閃...", "system");
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { location: targetRoomId });
        } catch (e) { console.error(e); }
        await MapSystem.look(playerData);
        await MessageSystem.broadcast(targetRoomId, `${playerData.name} 出現了。`);
    }
};