// src/main.js
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { UI } from "./ui.js";
import { CommandSystem } from "./systems/commands.js"; 
import { auth, db } from "./firebase.js";

let currentUser = null;
let localPlayerData = null; 

// 遊戲狀態控制
// 'INIT': 初始化中
// 'CREATION_NAME': 輸入名字中
// 'CREATION_GENDER': 輸入性別中
// 'PLAYING': 正常遊戲中
let gameState = 'INIT'; 
let tempCreationData = {}; // 暫存創建資料

UI.print("系統初始化中...", "system");

// 1. 監聽登入狀態
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        UI.showLoginPanel(false);
        UI.enableGameInput(true);
        
        // 檢查是否有存檔
        await checkAndLoadPlayer(user);
        
    } else {
        // 登出後的重置
        currentUser = null;
        localPlayerData = null;
        gameState = 'INIT';
        tempCreationData = {};
        
        UI.print("請登入以開始遊戲。", "system");
        UI.showLoginPanel(true);
        UI.enableGameInput(false);
    }
});

// 2. 綁定按鈕
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

// 3. 處理輸入 (根據 gameState 決定行為)
UI.onInput((cmd) => {
    if (!currentUser) {
        UI.print("請先登入。", "error");
        return;
    }

    // 如果正在正常遊戲
    if (gameState === 'PLAYING') {
        CommandSystem.handle(cmd, localPlayerData, currentUser.uid);
        if (localPlayerData) {
            UI.updateHUD(localPlayerData); 
        }
    } 
    // 如果正在創建角色
    else if (gameState === 'CREATION_NAME' || gameState === 'CREATION_GENDER') {
        handleCreationInput(cmd);
    }
});

// --- 輔助函式 ---

// 處理角色創建的對話流程
async function handleCreationInput(input) {
    const val = input.trim();
    if (!val) return;

    if (gameState === 'CREATION_NAME') {
        if (val.length < 2) {
            UI.print("名字太短了，請重新輸入：", "error");
            return;
        }
        tempCreationData.name = val;
        gameState = 'CREATION_GENDER';
        UI.print(`幸會，${val}。`, "system");
        UI.print("請問大俠是【男】還是【女】？(請輸入 男 或 女)");
        return;
    }

    if (gameState === 'CREATION_GENDER') {
        let gender = "";
        if (['男', 'm', 'male'].includes(val.toLowerCase())) gender = "男";
        else if (['女', 'f', 'female'].includes(val.toLowerCase())) gender = "女";
        
        if (!gender) {
            UI.print("請輸入 '男' 或 '女'。", "error");
            return;
        }

        tempCreationData.gender = gender;
        // 資料收集完畢，開始寫入資料庫
        await createNewCharacter(currentUser, tempCreationData);
    }
}

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

// 檢查並讀取存檔
async function checkAndLoadPlayer(user) {
    const playerRef = doc(db, "players", user.uid);
    try {
        const docSnap = await getDoc(playerRef);

        if (docSnap.exists()) {
            UI.print("讀取檔案成功... 你的江湖與你同在。", "system");
            localPlayerData = docSnap.data();
            gameState = 'PLAYING'; // 進入遊戲模式
            
            // 登入後自動 Look
            CommandSystem.handle('look', localPlayerData, user.uid);
        } else {
            // 沒存檔 -> 進入創建模式
            UI.print("檢測到新面孔...", "system");
            UI.print("請問大俠尊姓大名？");
            gameState = 'CREATION_NAME';
        }
    } catch (e) {
        UI.print("資料庫讀取失敗：" + e.message, "error");
    }
}

// 建立新角色 (寫入資料庫)
async function createNewCharacter(user, data) {
    const playerRef = doc(db, "players", user.uid);
    UI.print("正在為您重塑肉身...", "system");

    const initialData = {
        name: data.name,
        gender: data.gender, // 紀錄性別
        email: user.email || "anonymous",
        location: "inn_start",
        savePoint: "inn_start",
        
        // 基礎與修為
        attributes: {
            hp: 100, maxHp: 100,
            mp: 100, maxMp: 100,
            sp: 100, maxSp: 100,
            spiritual: 10, maxSpiritual: 10,
            force: 10,     maxForce: 10,
            mana: 10,      maxMana: 10,
            food: 100, maxFood: 100,
            water: 100, maxWater: 100,
            str: 20, con: 20, dex: 20, int: 20, per: 20, kar: 20, cor: 20
        },

        // 戰鬥數值
        combat: {
            xp: 0, potential: 0,
            attack: 10, defense: 10,
            hitRate: 10, dodge: 10, parry: 10
        },

        // 技能
        skills: {
            "unarmed": 10,
            "dodge": 10,
            "parry": 10
        },

        // 背包
        money: 1000,
        inventory: [
            { id: "bread", name: "乾糧", count: 3 },
            { id: "waterskin", name: "水袋", count: 1 }
        ],
        equipment: { weapon: null, armor: null },
        sect: "none",
        createdAt: new Date().toISOString()
    };

    try {
        await setDoc(playerRef, initialData);
        localPlayerData = initialData;
        gameState = 'PLAYING'; // 切換為遊戲模式
        UI.print(`角色【${data.name}】建立完成！`, "system");
        
        // 自動開始
        CommandSystem.handle('look', localPlayerData, user.uid);
    } catch (e) {
        UI.print("創建失敗：" + e.message, "error");
    }
}