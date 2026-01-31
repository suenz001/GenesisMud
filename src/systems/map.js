// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { ItemDB } from "../data/items.js"; // 新增引用 ItemDB

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
        UI.print(room.description);

        // --- 人物顯示 ---
        let chars = [];
        if (room.npcs && room.npcs.length > 0) {
            room.npcs.forEach(npcId => {
                const npc = NPCDB[npcId];
                if (npc) {
                    let links = `${npc.name}(${npc.id})`;
                    links += UI.makeCmd("[看]", `look ${npc.id}`, "cmd-btn");
                    if (npc.shop) links += UI.makeCmd("[商品]", `list ${npc.id}`, "cmd-btn");
                    chars.push(links);
                }
            });
        }
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

        // --- 新增：顯示掉落物 (從 room_items 集合讀取) ---
        try {
            const itemsRef = collection(db, "room_items");
            const qItems = query(itemsRef, where("roomId", "==", playerData.location));
            const itemSnapshot = await getDocs(qItems);
            let droppedItems = [];
            
            itemSnapshot.forEach((doc) => {
                const item = doc.data();
                // 顯示格式：白米飯(rice) [撿取]
                let link = `${item.name}(${item.itemId})`;
                // 傳入 item.itemId 以便 get 指令使用
                link += UI.makeCmd("[撿取]", `get ${item.itemId}`, "cmd-btn");
                droppedItems.push(link);
            });

            if (droppedItems.length > 0) {
                UI.print(`地上的物品：${droppedItems.join("、")}`, "chat", true);
            }

        } catch (e) { console.error("讀取地面物品失敗", e); }
        // ------------------------------------------------

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
        // ... (move 函式保持不變，為節省空間略過，請使用上一版的 move) ...
        // 請確保這裡有完整的 move 邏輯
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
        // ... (teleport 函式保持不變) ...
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