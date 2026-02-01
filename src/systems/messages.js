// src/systems/messages.js
import { 
    getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";

let unsubscribe = null; 

export const MessageSystem = {
    broadcast: async (roomId, text, type = 'system') => {
        try {
            const user = auth.currentUser;
            const senderId = user ? user.uid : "SYSTEM";

            await addDoc(collection(db, "world_logs"), {
                roomId: roomId,
                text: text,
                type: type,
                senderId: senderId, 
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("廣播失敗", e);
        }
    },

    listenToRoom: (roomId) => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }

        // [修改] 標記是否為初次載入
        let isFirstRun = true;

        const q = query(
            collection(db, "world_logs"),
            where("roomId", "==", roomId),
            orderBy("timestamp", "desc"),
            limit(20) 
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
            // [修改] 如果是第一次執行 (監聽剛建立)，直接忽略這批資料 (視為歷史訊息)
            // 這樣可以完美避免進入房間時顯示殘留訊息，也不會受客戶端時間誤差影響
            if (isFirstRun) {
                isFirstRun = false;
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const user = auth.currentUser;
                    
                    // 過濾掉自己的廣播 (避免重複顯示本地已知的動作)
                    if (user && data.senderId === user.uid) {
                        return;
                    }

                    // 顯示訊息 (第三個參數 true 代表支援 HTML 顏色代碼)
                    UI.print(data.text, data.type || 'system', true);
                }
            });
        });
    },

    stopListening: () => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    }
};