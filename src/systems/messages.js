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

        const enterTime = Date.now();

        const q = query(
            collection(db, "world_logs"),
            where("roomId", "==", roomId),
            orderBy("timestamp", "desc"),
            limit(20) 
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const user = auth.currentUser;
                    
                    if (data.timestamp) {
                        const msgTime = data.timestamp.toDate().getTime();
                        if (msgTime < enterTime - 2000) {
                            return; 
                        }
                    }

                    if (user && data.senderId === user.uid) {
                        return;
                    }

                    // [修改] 這裡加入 true，讓廣播訊息支援 HTML (例如戰鬥顏色)
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