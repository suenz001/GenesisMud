// src/systems/messages.js
import { 
    getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";

let unsubscribe = null; // 用來儲存取消監聽的函式

export const MessageSystem = {
    // 發送廣播訊息到指定房間
    broadcast: async (roomId, text, type = 'system') => {
        try {
            await addDoc(collection(db, "world_logs"), {
                roomId: roomId,
                text: text,
                type: type,
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

        // 監聽 world_logs 集合，條件：roomId 相符，按時間排序，只抓最新的
        const q = query(
            collection(db, "world_logs"),
            where("roomId", "==", roomId),
            orderBy("timestamp", "desc"),
            limit(5) 
        );

        // 開啟即時監聽
        unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                // 我們只關心新增的訊息 (added)
                if (change.type === "added") {
                    const data = change.doc.data();
                    
                    // 過濾掉太舊的訊息 (避免一進房間就顯示歷史訊息)
                    // 這裡簡單判斷：如果訊息產生時間跟現在差不到 2 秒才顯示 (或是頁面剛載入時的初始載入)
                    // 為了簡化，我們直接顯示，但實務上通常會過濾 local write
                    
                    // 只有當這條訊息不是「本地端剛剛產生」的時候才顯示
                    // (但為了讓玩家確認自己有送出，通常全部顯示也無妨，這裡我們加上一個簡單的判斷機制)
                    if (!snapshot.metadata.hasPendingWrites) {
                        UI.print(data.text, data.type || 'system');
                    }
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