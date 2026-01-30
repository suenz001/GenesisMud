// src/main.js
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 引入自定義模組
import { UI } from "./ui.js";
import { CommandSystem } from "./systems/commands.js"; 
import { auth, db } from "./firebase.js"; // <--- 新增：引入初始化好的 auth 和 db

// --- 初始化 Firebase (這一段全部刪除，因為移到 firebase.js 了) ---
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
// const auth = getAuth(app);
// const db = getFirestore(app);

// --- 遊戲狀態 ---
let currentUser = null;
let localPlayerData = null; 

// --- 系統啟動 ---
UI.print("系統初始化中...", "system");

// 1. 監聽登入狀態 (直接使用匯入的 auth)
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        let displayName = user.email ? user.email.split('@')[0] : "匿名俠客";
        
        UI.print(`登入成功！歡迎 ${displayName}`, "system");
        UI.showLoginPanel(false);
        UI.enableGameInput(true);
        
        await checkAndCreatePlayerData(user, displayName);
        
    } else {
        currentUser = null;
        localPlayerData = null;
        UI.print("請登入以開始遊戲。", "system");
        UI.showLoginPanel(true);
        UI.enableGameInput(false);
    }
});

// 2. 綁定登入/註冊/匿名按鈕邏輯
UI.onAuthAction({
    onLogin: (email, pwd) => {
        if(!email || !pwd) return UI.showLoginError("請輸入帳號密碼");
        UI.showLoginError("登入中...");
        signInWithEmailAndPassword(auth, email, pwd)
            .catch(err => UI.showLoginError(getErrMsg(err.code)));
    },
    onRegister: (email, pwd) => {
        if(!email || !pwd) return UI.showLoginError("請輸入帳號密碼");
        UI.showLoginError("註冊中...");
        createUserWithEmailAndPassword(auth, email, pwd)
            .catch(err => UI.showLoginError(getErrMsg(err.code)));
    },
    onGuest: () => {
        UI.showLoginError("匿名登入中...");
        signInAnonymously(auth)
            .catch(err => UI.showLoginError(getErrMsg(err.code)));
    }
});

// 3. 處理遊戲指令
UI.onInput((cmd) => {
    if (!currentUser) {
        UI.print("請先登入。", "error");
        return;
    }
    CommandSystem.handle(cmd, localPlayerData, currentUser.uid);
});

// --- 輔助函式 ---

function getErrMsg(code) {
    switch(code) {
        case 'auth/invalid-email': return "Email 格式錯誤";
        case 'auth/user-not-found': return "找不到此帳號";
        case 'auth/wrong-password': return "密碼錯誤";
        case 'auth/email-already-in-use': return "此 Email 已被註冊";
        case 'auth/weak-password': return "密碼太弱 (需6位以上)";
        default: return "錯誤：" + code;
    }
}

async function checkAndCreatePlayerData(user, displayName) {
    // 這裡直接使用匯入的 db
    const playerRef = doc(db, "players", user.uid);
    try {
        const docSnap = await getDoc(playerRef);

        if (docSnap.exists()) {
            UI.print("讀取檔案成功... 你的江湖與你同在。", "system");
            localPlayerData = docSnap.data();
        } else {
            UI.print("檢測到新面孔，正在為您重塑肉身...", "system");
            
            const initialData = {
                name: displayName,
                email: user.email || "anonymous",
                location: "inn_start",
                attributes: {
                    hp: 100,      
                    mp: 100,      
                    sp: 100,      
                    spiritual: 0, 
                    str: 20,      
                    con: 20,      
                    dex: 20,      
                    int: 20,      
                    kar: 20,      
                    per: 20       
                },
                sect: "none",
                createdAt: new Date().toISOString()
            };

            await setDoc(playerRef, initialData);
            localPlayerData = initialData;
            
            UI.print("角色建立完成！", "system");
        }
    } catch (e) {
        UI.print("資料庫讀取失敗：" + e.message, "error");
    }
}