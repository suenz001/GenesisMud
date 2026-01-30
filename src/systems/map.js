// src/systems/map.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db } from "../firebase.js";
import { NPCDB } from "../data/npcs.js"; // 新增：引入 NPC 資料庫

const DIR_OFFSET = {
    'north': { x: 0, y: 1, z: 0 },
    'south': { x: 0, y: -1, z: 0 },
    'east':  { x: 1, y: 0, z: 0 },
    'west':  { x: -1, y: 0, z: 0 },
    'up':    { x: 0, y: 0, z: 1 },
    'down':  { x: 0, y: 0, z: -1 },
    'northeast': { x: 1, y: 1, z: 0 },
    'northwest': { x: -1, y: 1, z: 0 },
    'southeast': { x: 1, y: -1, z: 0 },
    'southwest': { x: -1, y: -1, z: 0 }
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

    look: (playerData) => {
        if (!playerData || !playerData.location) return;
        const room = WorldMap[playerData.location];
        if (!room) {
            UI.print("你陷入虛空...", "error");
            return;
        }

        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData);
        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);

        // --- 新增：顯示房間內的人物 (NPC 與 玩家) ---
        let chars = [];
        
        // 1. 顯示 NPC
        if (room.npcs && room.npcs.length > 0) {
            room.npcs.forEach(npcId => {
                const npc = NPCDB[npcId];
                // 格式：店小二(waiter)
                if (npc) chars.push(`${npc.name}(${npc.id})`);
                else chars.push(npcId);
            });
        }

        // 2. 顯示玩家自己 (未來多人連線時，這裡要改成顯示其他玩家)
        // 格式：[ 玩家 ] : 某某某
        chars.push(`[ 玩家 ] : ${playerData.name}`);

        if (chars.length > 0) {
            UI.print(`這裡明顯的人物有：${chars.join(", ")}`, "chat");
        }
        // ------------------------------------------

        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitList = Object.keys(validExits).join(", ");
        UI.print(`明顯的出口：${exitList || "無"}`, "chat");
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;
        const validExits = MapSystem.getAvailableExits(playerData.location);

        if (!validExits[direction]) {
            const room = WorldMap[playerData.location];
            if (room.walls && room.walls.includes(direction)) {
                UI.print("那邊是一面牆，過不去。", "error");
            } else {
                UI.print("那個方向沒有路。", "error");
            }
            return;
        }

        const attr = playerData.attributes;
        if (attr.food <= 0 || attr.water <= 0) {
            UI.print("你餓得頭昏眼花，一步也走不動了...", "error");
            return;
        }

        attr.food = Math.max(0, attr.food - 1);
        attr.water = Math.max(0, attr.water - 1);
        
        if (attr.food < 10) UI.print("你的肚子咕嚕咕嚕叫了起來。", "system");
        if (attr.water < 10) UI.print("你口乾舌燥，急需喝水。", "system");

        const nextRoomId = validExits[direction];
        playerData.location = nextRoomId;
        
        UI.print(`你往 ${direction} 走去...`);
        MapSystem.look(playerData);

        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: nextRoomId,
                "attributes.food": attr.food,
                "attributes.water": attr.water
            });
        } catch (e) {
            console.error(e);
        }
    },

    teleport: async (playerData, targetRoomId, userId) => {
        if (!WorldMap[targetRoomId]) {
            UI.print("目標地點不存在。", "error");
            return;
        }
        playerData.location = targetRoomId;
        UI.print("白光一閃...", "system");
        MapSystem.look(playerData);
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { location: targetRoomId });
        } catch (e) { console.error(e); }
    }
};