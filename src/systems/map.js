// src/systems/map.js
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";

const db = getFirestore();

export const MapSystem = {
    // 取得當前房間資訊
    getRoom: (roomId) => {
        return WorldMap[roomId];
    },

    // 執行看 (Look)
    look: (playerData) => {
        if (!playerData || !playerData.location) return;
        
        const roomId = playerData.location;
        const room = WorldMap[roomId];

        if (!room) {
            UI.print("你陷入了虛空之中... (錯誤：找不到地圖 " + roomId + ")", "error");
            return;
        }

        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);
        
        // 顯示出口
        const exits = Object.keys(room.exits).join(", ");
        UI.print(`明顯的出口：${exits || "無"}`, "chat");
    },

    // 執行移動
    move: async (playerData, direction, userId) => {
        if (!playerData) return;

        const currentRoomId = playerData.location;
        const room = WorldMap[currentRoomId];

        // 1. 檢查有無出口
        if (!room || !room.exits[direction]) {
            UI.print("那個方向沒有路。", "error");
            return;
        }

        const nextRoomId = room.exits[direction];
        const nextRoom = WorldMap[nextRoomId];

        // 2. 更新本地記憶體 (讓玩家感覺無延遲)
        playerData.location = nextRoomId;
        
        UI.print(`你往 ${direction} 走去...`);
        MapSystem.look(playerData); // 移動後自動看一次

        // 3. 背景更新資料庫 (Firestore)
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, {
                location: nextRoomId
            });
        } catch (e) {
            console.error("移動存檔失敗", e);
            UI.print("系統警告：位置儲存失敗，請檢查網路。", "error");
        }
    }
};