// src/systems/map.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db } from "../firebase.js";

// 方向對應的座標變化
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

    // --- 新核心：動態計算出口 ---
    getAvailableExits: (currentRoomId) => {
        const room = WorldMap[currentRoomId];
        if (!room) return {};

        const exits = {};

        // 1. 先加入手動設定的特殊出口 (如 enter, out)
        if (room.exits) {
            Object.assign(exits, room.exits);
        }

        // 2. 自動偵測座標鄰居
        for (const [dir, offset] of Object.entries(DIR_OFFSET)) {
            // 如果這個方向被牆擋住了，就跳過
            if (room.walls && room.walls.includes(dir)) continue;

            // 計算目標座標
            const targetX = room.x + offset.x;
            const targetY = room.y + offset.y;
            const targetZ = room.z + offset.z;

            // 搜尋地圖上符合該座標的房間
            // (資料量大時建議建立座標索引 cache，目前遍歷即可)
            for (const [targetId, targetRoom] of Object.entries(WorldMap)) {
                if (targetRoom.x === targetX && 
                    targetRoom.y === targetY && 
                    targetRoom.z === targetZ) {
                    
                    // 找到了鄰居！加入出口列表
                    // 注意：如果手動 exits 已經定義了這個方向，以手動為準 (覆蓋)
                    if (!exits[dir]) {
                        exits[dir] = targetId;
                    }
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
            UI.print("你陷入虛空... (錯誤：找不到地圖 " + playerData.location + ")", "error");
            return;
        }

        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData);

        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);
        
        // 使用動態計算的出口來顯示
        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitList = Object.keys(validExits).join(", ");
        UI.print(`明顯的出口：${exitList || "無"}`, "chat");
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;

        // 使用動態計算的出口來判斷是否可移動
        const validExits = MapSystem.getAvailableExits(playerData.location);

        if (!validExits[direction]) {
            // 增加一點沉浸感：如果是因為有牆壁
            const room = WorldMap[playerData.location];
            if (room.walls && room.walls.includes(direction)) {
                UI.print("那邊是一面牆，過不去。", "error");
            } else {
                UI.print("那個方向沒有路。", "error");
            }
            return;
        }

        const nextRoomId = validExits[direction];
        
        // 更新與存檔
        playerData.location = nextRoomId;
        UI.print(`你往 ${direction} 走去...`);
        MapSystem.look(playerData);

        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { location: nextRoomId });
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