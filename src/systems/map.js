// src/systems/map.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db } from "../firebase.js";

export const MapSystem = {
    // 取得當前房間物件
    getRoom: (roomId) => {
        return WorldMap[roomId];
    },

    // 執行「看」(Look)
    // 這是最核心的函式，移動後、登入後都會呼叫
    look: (playerData) => {
        if (!playerData || !playerData.location) return;
        
        const roomId = playerData.location;
        const room = WorldMap[roomId];

        // 錯誤處理：如果玩家卡在不存在的房間
        if (!room) {
            UI.print("你陷入了虛空之中... (錯誤：找不到地圖 " + roomId + ")", "error");
            return;
        }

        // 1. 更新介面顯示 (地點名稱)
        UI.updateLocationInfo(room.title);
        
        // 2. 更新 HUD (血條 + 小地圖)
        // 注意：UI.updateHUD 會自己去讀取 WorldMap 來畫 5x5 地圖，所以這裡不用傳出口
        UI.updateHUD(playerData); 

        // 3. 輸出文字描述到對話框
        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);
        
        // 4. 列出文字版出口 (輔助用)
        const exits = Object.keys(room.exits).join(", ");
        UI.print(`明顯的出口：${exits || "無"}`, "chat");
    },

    // 執行「移動」(Move)
    move: async (playerData, direction, userId) => {
        if (!playerData) return;

        const currentRoomId = playerData.location;
        const room = WorldMap[currentRoomId];

        // 檢查該方向是否有出口
        if (!room || !room.exits[direction]) {
            UI.print("那個方向沒有路。", "error");
            return;
        }

        const nextRoomId = room.exits[direction];
        
        // --- 本地端立即更新 (讓玩家感覺無延遲) ---
        playerData.location = nextRoomId;
        UI.print(`你往 ${direction} 走去...`);
        
        // 移動後立刻看四周
        MapSystem.look(playerData); 

        // --- 背景非同步存檔 ---
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

    // 執行「傳送」(Teleport) - 用於 Recall
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