// src/systems/map.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db } from "../firebase.js";

// 方向偏移量定義
const offsets = {
    'north':     { x: 0, y: 1, z: 0 },
    'south':     { x: 0, y: -1, z: 0 },
    'east':      { x: 1, y: 0, z: 0 },
    'west':      { x: -1, y: 0, z: 0 },
    'northeast': { x: 1, y: 1, z: 0 },
    'northwest': { x: -1, y: 1, z: 0 },
    'southeast': { x: 1, y: -1, z: 0 },
    'southwest': { x: -1, y: -1, z: 0 },
    'up':        { x: 0, y: 0, z: 1 },
    'down':      { x: 0, y: 0, z -1: -1 } // 注意：z軸處理
};

// 簡寫對應 (讓系統內部統一用全名)
const shortDirMap = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'ne': 'northeast', 'nw': 'northwest', 'se': 'southeast', 'sw': 'southwest',
    'u': 'up', 'd': 'down'
};

export const MapSystem = {
    getRoom: (roomId) => {
        return WorldMap[roomId];
    },

    // --- 新增：動態計算所有出口 ---
    getAvailableExits: (room) => {
        const exits = { ...room.exits }; // 先複製原本手動設定的 (例如 "out", "enter")

        // 遍歷所有方向，檢查座標上是否有房間
        for (const [dir, offset] of Object.entries(offsets)) {
            const targetX = room.x + offset.x;
            const targetY = room.y + offset.y;
            const targetZ = room.z + offset.z;

            // 搜尋地圖 (資料量大時建議改用 Map<"x,y,z", roomId> 優化，目前遍歷即可)
            for (const [targetId, targetRoom] of Object.entries(WorldMap)) {
                if (targetRoom.x === targetX && 
                    targetRoom.y === targetY && 
                    targetRoom.z === targetZ) {
                    
                    // 找到相鄰房間！自動加入出口
                    exits[dir] = targetId;
                    break;
                }
            }
        }
        return exits;
    },

    look: (playerData) => {
        if (!playerData || !playerData.location) return;
        
        const roomId = playerData.location;
        const room = WorldMap[roomId];

        if (!room) {
            UI.print("你陷入了虛空之中... (錯誤：找不到地圖 " + roomId + ")", "error");
            return;
        }

        // 使用動態計算的出口
        const dynamicExits = MapSystem.getAvailableExits(room);

        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData); 

        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);
        
        // 顯示出口
        const exitList = Object.keys(dynamicExits).map(dir => {
            // 顯示中文方向會更親切
            return dir; 
        }).join(", ");
        
        UI.print(`明顯的出口：${exitList || "無"}`, "chat");
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;

        // 處理縮寫 (n -> north)
        const fullDir = shortDirMap[direction] || direction;

        const currentRoomId = playerData.location;
        const room = WorldMap[currentRoomId];
        
        // 取得動態出口列表
        const dynamicExits = MapSystem.getAvailableExits(room);

        // 檢查方向
        if (!room || !dynamicExits[fullDir]) {
            UI.print("那個方向沒有路。", "error");
            return;
        }

        const nextRoomId = dynamicExits[fullDir];
        
        // 更新與存檔
        playerData.location = nextRoomId;
        UI.print(`你往 ${fullDir} 走去...`);
        MapSystem.look(playerData); 

        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, {
                location: nextRoomId
            });
        } catch (e) {
            console.error("移動存檔失敗", e);
            UI.print("系統警告：位置儲存失敗，請檢查網路。", "error");
        }
    },

    teleport: async (playerData, targetRoomId, userId) => {
        if (!WorldMap[targetRoomId]) {
            UI.print("傳送失敗：目標地點不存在。", "error");
            return;
        }

        playerData.location = targetRoomId;
        UI.print("你唸動咒語，腳下升起一道白光...", "system");
        
        MapSystem.look(playerData);

        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, {
                location: targetRoomId
            });
        } catch (e) {
            console.error("傳送存檔失敗", e);
            UI.print("存檔失敗：" + e.message, "error");
        }
    }
};