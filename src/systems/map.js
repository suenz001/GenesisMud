// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js"; // 引入訊息系統

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

        for (const [dir, offset] of Object.entries(DIR_OFFSET)) {
            if (room.walls && room.walls.includes(dir)) continue;
            const targetX = room.x + offset.x;
            const targetY = room.y + offset.y;
            const targetZ = room.z + offset.z;

            for (const [targetId, targetRoom] of Object.entries(WorldMap)) {
                if (targetRoom.x === targetX && targetRoom.y === targetY && targetRoom.z === targetZ) {
                    if (!exits[dir]) exits[dir] = targetId;
                    break;
                }
            }
        }
        return exits;
    },

    look: async (playerData) => {
        if (!playerData || !playerData.location) return;
        const room = WorldMap[playerData.location];
        if (!room) {
            UI.print("你陷入虛空...", "error");
            return;
        }

        // --- 關鍵：開始監聽這個房間的動態 ---
        // 每次 Look (通常發生在登入或移動後) 確保監聽正確的房間
        MessageSystem.listenToRoom(playerData.location);

        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData);
        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);

        let chars = [];
        
        // 1. NPC
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

        // 2. 其他玩家 (顯示 ID)
        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("location", "==", playerData.location));
            const querySnapshot = await getDocs(q);

            querySnapshot.forEach((doc) => {
                // 排除自己
                if (auth.currentUser && doc.id !== auth.currentUser.uid) {
                    const p = doc.data();
                    const pName = p.name || "無名氏";
                    const pId = p.id || "unknown"; // 取得 ID
                    
                    // 格式：大俠(hero123)
                    let pStr = `[ 玩家 ] : ${pName}(${pId})`;
                    chars.push(pStr);
                }
            });
        } catch (e) {
            console.error("讀取玩家列表失敗", e);
        }

        if (chars.length > 0) {
            UI.print(`這裡明顯的人物有：${chars.join("、")}`, "chat", true);
        }

        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitKeys = Object.keys(validExits);
        
        if (exitKeys.length === 0) {
            UI.print(`明顯的出口：無`, "chat");
        } else {
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
        if (attr.food <= 0 || attr.water <= 0) {
            UI.print("你餓得頭昏眼花，一步也走不動了...", "error");
            return;
        }

        attr.food = Math.max(0, attr.food - 1);
        attr.water = Math.max(0, attr.water - 1);
        
        // --- 廣播：離開舊房間 ---
        await MessageSystem.broadcast(playerData.location, `${playerData.name} 往 ${direction} 離開了。`);

        const nextRoomId = validExits[direction];
        playerData.location = nextRoomId;
        
        UI.print(`你往 ${direction} 走去...`);
        
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: nextRoomId,
                "attributes.food": attr.food,
                "attributes.water": attr.water
            });
        } catch (e) { console.error(e); }

        // --- 廣播：進入新房間 ---
        // 注意：要在 Look 之前廣播，或者 Look 之後廣播都可以
        // 這裡先執行 Look (這樣會切換監聽頻道到新房間)，然後發送「我來了」
        await MapSystem.look(playerData);
        await MessageSystem.broadcast(nextRoomId, `${playerData.name} 走了過來。`);
    },

    teleport: async (playerData, targetRoomId, userId) => {
        if (!WorldMap[targetRoomId]) return UI.print("目標地點不存在。", "error");
        
        await MessageSystem.broadcast(playerData.location, `${playerData.name} 化作一道白光消失了。`);
        
        playerData.location = targetRoomId;
        UI.print("白光一閃...", "system");
        
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { location: targetRoomId });
        } catch (e) { console.error(e); }

        await MapSystem.look(playerData);
        await MessageSystem.broadcast(targetRoomId, `${playerData.name} 在一陣白光中出現了。`);
    }
};