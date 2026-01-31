// src/systems/messages.js
import { 
    getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";

let unsubscribe = null; // 用來儲存取消監聽的函式

export const MessageSystem = {
    // 發送廣播訊息到指定房間
    broadcast: async (roomId, text, type = 'system') => {
        try {
            // 獲取當前發送者的 ID
            const user = auth.currentUser;
            const senderId = user ? user.uid : "SYSTEM";

            await addDoc(collection(db, "world_logs"), {
                roomId: roomId,
                text: text,
                type: type,
                senderId: senderId, // 記錄是誰發送的
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("廣播失敗", e);
        }
    },

    // 開始監聽某個房間的動態
    listenToRoom: (roomId) => {
        // 如果之前有監聽別的房間，先取消，避免訊息錯亂
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }

        // 記錄開始監聽的時間點 (防止顯示歷史訊息)
        const enterTime = Date.now();

        // 監聽 world_logs 集合
        const q = query(
            collection(db, "world_logs"),
            where("roomId", "==", roomId),
            orderBy("timestamp", "desc"),
            limit(20) 
        );

        // 開啟即時監聽
        unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                // 我們只關心新增的訊息 (added)
                if (change.type === "added") {
                    const data = change.doc.data();
                    const user = auth.currentUser;
                    
                    // --- 過濾機制 1：過濾掉歷史訊息 ---
                    // 如果訊息有時間戳記 (Server端已寫入)，且時間早於我們進入房間的時間，則視為歷史訊息不顯示。
                    // (減去 2000ms 是為了緩衝網路延遲或時鐘誤差，避免剛發生的訊息被誤刪)
                    // 如果 data.timestamp 為 null (代表是本地端剛送出的暫存)，視為最新訊息，不攔截。
                    if (data.timestamp) {
                        const msgTime = data.timestamp.toDate().getTime();
                        if (msgTime < enterTime - 2000) {
                            return; 
                        }
                    }

                    // --- 過濾機制 2：過濾掉自己的廣播 ---
                    // 因為本地端指令 (如 move, kill) 通常已經用 UI.print 顯示過 "你往北離開了"
                    // 所以這裡要過濾掉廣播傳回來的 "某某某 往北離開了"，避免重複洗頻。
                    if (user && data.senderId === user.uid) {
                        return;
                    }

                    // 通過過濾，顯示訊息
                    UI.print(data.text, data.type || 'system');
                }
            });
        });
    },

    // 停止監聽 (登出時使用)
    stopListening: () => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    }
};