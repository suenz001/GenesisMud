// src/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 引入自定義模組
import { firebaseConfig } from "./config.js";
import { UI } from "./ui.js";
import { CommandSystem } from "./systems/commands.js"; // 新增：引入指令系統

// --- 初始化 Firebase ---
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 遊戲狀態 ---
let currentUser = null;
let localPlayerData = null; // 新增：用來暫存玩家資料，讓指令系統可以隨時讀取

// --- 系統啟動 ---
UI.print("系統初始化中...", "system");

// 1. 監聽登入狀態
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        let displayName = user.email ? user.email.split('@')[0] : "匿名俠客";
        
        UI.print(`登入成功！歡迎 ${displayName}`, "system");
        UI.showLoginPanel(false);
        UI.enableGameInput(true);
        
        // 讀取或建立玩家資料
        await checkAndCreatePlayerData(user, displayName);
        
    } else {
        currentUser = null;
        localPlayerData = null; // 登出時清空資料
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

// 3. 處理遊戲指令 (已改用 CommandSystem)
UI.onInput((cmd) => {
    // 將指令字串與目前的玩家資料傳給系統處理
    CommandSystem.handle(cmd, localPlayerData);
});

// --- 輔助函式 ---

// 翻譯 Firebase 錯誤代碼
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

// 檢查並建立玩家資料
async function checkAndCreatePlayerData(user, displayName) {
    const playerRef = doc(db, "players", user.uid);
    try {
        const docSnap = await getDoc(playerRef);

        if (docSnap.exists()) {
            UI.print("讀取檔案成功... 你的江湖與你同在。", "system");
            // 將資料庫資料存入記憶體變數
            localPlayerData = docSnap.data();
        } else {
            UI.print("檢測到新面孔，正在為您重塑肉身...", "system");
            
            // 定義初始資料
            const initialData = {
                name: displayName,
                email: user.email || "anonymous",
                location: "inn_start", // 初始地點
                attributes: {
                    hp: 100,      // 精
                    mp: 100,      // 氣 (內力)
                    sp: 100,      // 神
                    spiritual: 0, // 靈力 (茅山專用)
                    str: 20,      // 膂力
                    con: 20,      // 根骨
                    dex: 20,      // 身法
                    int: 20,      // 悟性
                    kar: 20,      // 福緣
                    per: 20       // 定力
                },
                sect: "none",     // 門派
                createdAt: new Date().toISOString()
            };

            // 寫入資料庫
            await setDoc(playerRef, initialData);
            
            // 同時存入記憶體變數
            localPlayerData = initialData;
            
            UI.print("角色建立完成！", "system");
        }
    } catch (e) {
        UI.print("資料庫讀取失敗：" + e.message, "error");
    }
}