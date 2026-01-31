// src/main.js
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { UI } from "./ui.js";
import { CommandSystem } from "./systems/commands.js"; 
import { auth, db } from "./firebase.js";

let currentUser = null;
let localPlayerData = null; 

// 遊戲狀態控制
// 'INIT': 初始化
// 'CREATION_ID': 輸入英文ID (新增)
// 'CREATION_NAME': 輸入中文名稱
// 'CREATION_GENDER': 輸入性別
// 'PLAYING': 正常遊戲
let gameState = 'INIT'; 
let tempCreationData = {}; 

UI.print("系統初始化中...", "system");

// 1. 監聽登入狀態
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        UI.showLoginPanel(false);
        UI.enableGameInput(true);
        await checkAndLoadPlayer(user);
    } else {
        currentUser = null;
        localPlayerData = null;
        gameState = 'INIT';
        tempCreationData = {};
        UI.print("請登入以開始遊戲。", "system");
        UI.showLoginPanel(true);
        UI.enableGameInput(false);
    }
});

UI.onAuthAction({
    onLogin: (email, pwd) => {
        if(!email || !pwd) return UI.showLoginError("請輸入帳號密碼");
        UI.showLoginError("登入中...");
        signInWithEmailAndPassword(auth, email, pwd).catch(err => UI.showLoginError(getErrMsg(err.code)));
    },
    onRegister: (email, pwd) => {
        if(!email || !pwd) return UI.showLoginError("請輸入帳號密碼");
        UI.showLoginError("註冊中...");
        createUserWithEmailAndPassword(auth, email, pwd).catch(err => UI.showLoginError(getErrMsg(err.code)));
    },
    onGuest: () => {
        UI.showLoginError("匿名登入中...");
        signInAnonymously(auth).catch(err => UI.showLoginError(getErrMsg(err.code)));
    }
});

// 3. 處理輸入
UI.onInput((cmd) => {
    if (!currentUser) {
        UI.print("請先登入。", "error");
        return;
    }

    if (gameState === 'PLAYING') {
        CommandSystem.handle(cmd, localPlayerData, currentUser.uid);
        if (localPlayerData) {
            UI.updateHUD(localPlayerData); 
        }
    } 
    else if (['CREATION_ID', 'CREATION_NAME', 'CREATION_GENDER'].includes(gameState)) {
        handleCreationInput(cmd);
    }
});

// --- 輔助函式 ---

async function handleCreationInput(input) {
    const val = input.trim();
    if (!val) return;

    // 步驟 1: 輸入英文 ID
    if (gameState === 'CREATION_ID') {
        // 檢查格式：只能英文字母，2~12字元
        const idRegex = /^[a-zA-Z]{2,12}$/;
        if (!idRegex.test(val)) {
            UI.print("ID 格式錯誤：限 2-12 個英文字母 (A-Z, a-z)。", "error");
            return;
        }
        
        const newId = val.toLowerCase();
        UI.print(`正在檢查 ID [${newId}] 是否可用...`, "system");

        // 檢查唯一性 (查詢資料庫是否有相同 ID)
        const playersRef = collection(db, "players");
        const q = query(playersRef, where("id", "==", newId));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            UI.print(`ID [${newId}] 已經被使用了，請換一個。`, "error");
            return;
        }

        tempCreationData.id = newId; // 存入 ID
        gameState = 'CREATION_NAME';
        UI.print(`ID [${newId}] 可用！`, "system");
        UI.print("請問大俠尊姓大名？(中文名稱)");
        return;
    }

    // 步驟 2: 輸入中文名稱
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

    // 步驟 3: 輸入性別
    if (gameState === 'CREATION_GENDER') {
        let gender = "";
        if (['男', 'm', 'male'].includes(val.toLowerCase())) gender = "男";
        else if (['女', 'f', 'female'].includes(val.toLowerCase())) gender = "女";
        
        if (!gender) {
            UI.print("請輸入 '男' 或 '女'。", "error");
            return;
        }

        tempCreationData.gender = gender;
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

async function checkAndLoadPlayer(user) {
    const playerRef = doc(db, "players", user.uid);
    try {
        const docSnap = await getDoc(playerRef);

        if (docSnap.exists()) {
            UI.print("讀取檔案成功... 你的江湖與你同在。", "system");
            localPlayerData = docSnap.data();
            gameState = 'PLAYING'; 
            CommandSystem.handle('look', localPlayerData, user.uid);
        } else {
            UI.print("檢測到新面孔...", "system");
            UI.print("請輸入您想使用的【英文 ID】(純英文字母，不可重複)：");
            gameState = 'CREATION_ID'; // 從 ID 開始
        }
    } catch (e) {
        UI.print("資料庫讀取失敗：" + e.message, "error");
    }
}

async function createNewCharacter(user, data) {
    const playerRef = doc(db, "players", user.uid);
    UI.print("正在為您重塑肉身...", "system");

    const initialData = {
        id: data.id,     // 新增 ID 欄位
        name: data.name,
        gender: data.gender,
        email: user.email || "anonymous",
        location: "inn_start",
        savePoint: "inn_start",
        attributes: {
            hp: 100, maxHp: 100, mp: 100, maxMp: 100, sp: 100, maxSp: 100,
            spiritual: 10, maxSpiritual: 10, force: 10, maxForce: 10, mana: 10, maxMana: 10,
            food: 100, maxFood: 100, water: 100, maxWater: 100,
            str: 20, con: 20, dex: 20, int: 20, per: 20, kar: 20, cor: 20
        },
        combat: { xp: 0, potential: 0, attack: 10, defense: 10, hitRate: 10, dodge: 10, parry: 10 },
        skills: { "unarmed": 10, "dodge": 10, "parry": 10 },
        money: 1000,
        inventory: [
            { id: "rice", name: "白米飯", count: 2 },
            { id: "dumpling", name: "肉包子", count: 3 },
            { id: "waterskin", name: "牛皮水袋", count: 1 }
        ],
        equipment: { weapon: null, armor: null },
        sect: "none",
        createdAt: new Date().toISOString()
    };

    try {
        await setDoc(playerRef, initialData);
        localPlayerData = initialData;
        gameState = 'PLAYING';
        UI.print(`角色【${data.name}(${data.id})】建立完成！`, "system");
        CommandSystem.handle('look', localPlayerData, user.uid);
    } catch (e) {
        UI.print("創建失敗：" + e.message, "error");
    }
}