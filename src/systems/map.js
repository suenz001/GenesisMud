// src/systems/map.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db } from "../firebase.js";

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

        // --- 新增：生存狀態檢查 ---
        const attr = playerData.attributes;
        if (attr.food <= 0 || attr.water <= 0) {
            UI.print("你餓得頭昏眼花，一步也走不動了...", "error");
            return; // 阻止移動
        }

        // 扣除食物與飲水
        attr.food = Math.max(0, attr.food - 1); // 每次移動扣 1
        attr.water = Math.max(0, attr.water - 1);
        
        // 飢餓提示
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
                "attributes.food": attr.food,   // 更新資料庫
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