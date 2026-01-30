// src/systems/map.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db } from "../firebase.js";

export const MapSystem = {
    getRoom: (roomId) => {
        return WorldMap[roomId];
    },

    look: (playerData) => {
        if (!playerData || !playerData.location) return;
        
        const roomId = playerData.location;
        const room = WorldMap[roomId];

        if (!room) {
            UI.print("你陷入了虛空之中... (錯誤：找不到地圖 " + roomId + ")", "error");
            return;
        }

        UI.updateLocationInfo(room.title); 
        // 傳入出口資訊給 UI 畫小地圖
        UI.updateHUD(playerData, room.exits); 

        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);
        
        const exits = Object.keys(room.exits).join(", ");
        UI.print(`明顯的出口：${exits || "無"}`, "chat");
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;

        const currentRoomId = playerData.location;
        const room = WorldMap[currentRoomId];

        if (!room || !room.exits[direction]) {
            UI.print("那個方向沒有路。", "error");
            return;
        }

        const nextRoomId = room.exits[direction];
        
        playerData.location = nextRoomId;
        UI.print(`你往 ${direction} 走去...`);
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

    // --- 新增：瞬間傳送 (用於 Recall) ---
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
        }
    }
};