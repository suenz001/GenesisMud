// src/systems/messages.js
import { 
    getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";

let unsubscribes = [];

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

    listenToRooms: (roomIds) => {
        MessageSystem.stopListening();
        
        roomIds.forEach(roomId => {
            if (!roomId) return;
            // 標記是否為初次載入
            let isFirstRun = true;

            const q = query(
                collection(db, "world_logs"),
                where("roomId", "==", roomId),
                orderBy("timestamp", "desc"),
                limit(20) 
            );

            const unsub = onSnapshot(q, (snapshot) => {
                // 如果是第一次執行，直接忽略歷史訊息
                if (isFirstRun) {
                    isFirstRun = false;
                    return;
                }

                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        const data = change.doc.data();
                        const user = auth.currentUser;
                        
                        // 過濾掉自己的廣播
                        if (user && data.senderId === user.uid) {
                            return;
                        }

                        UI.print(data.text, data.type || 'system', true);
                    }
                });
            });
            unsubscribes.push(unsub);
        });
    },

    stopListening: () => {
        unsubscribes.forEach(unsub => unsub());
        unsubscribes = [];
    }
};