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

UI.print("系統初始化中...", "system");

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

UI.onInput((cmd) => {
    if (!currentUser) {
        UI.print("請先登入。", "error");
        return;
    }
    CommandSystem.handle(cmd, localPlayerData, currentUser.uid);
    if (localPlayerData) {
        UI.updateHUD(localPlayerData); 
    }
});

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
    const playerRef = doc(db, "players", user.uid);
    try {
        const docSnap = await getDoc(playerRef);

        if (docSnap.exists()) {
            UI.print("讀取檔案成功... 你的江湖與你同在。", "system");
            localPlayerData = docSnap.data();
        } else {
            UI.print("檢測到新面孔，正在為您重塑肉身...", "system");
            
            // --- 定義完整的初始資料結構 ---
            const initialData = {
                name: displayName,
                email: user.email || "anonymous",
                location: "inn_start",
                savePoint: "inn_start",
                
                // 1. 基礎與修為
                attributes: {
                    hp: 100, maxHp: 100, // 精
                    mp: 100, maxMp: 100, // 氣
                    sp: 100, maxSp: 100, // 神

                    spiritual: 10, maxSpiritual: 10, // 靈力
                    force: 10,     maxForce: 10,     // 內力
                    mana: 10,      maxMana: 10,      // 法力
                    
                    // 生存狀態 (會隨移動減少)
                    food: 100, maxFood: 100,
                    water: 100, maxWater: 100,

                    // 天賦屬性 (10-30隨機，這裡先給固定值)
                    str: 20, // 膂力 (影響攻擊、負重)
                    con: 20, // 根骨 (影響血量、防禦)
                    dex: 20, // 身法 (影響閃避、命中)
                    int: 20, // 悟性 (影響學習速度)
                    per: 20, // 定力 (影響法術抵抗、異常狀態)
                    kar: 20, // 福緣 (運氣)
                    cor: 20  // 膽識 (爆擊率?)
                },

                // 2. 戰鬥數值 (通常由屬性計算，這裡存基礎值)
                combat: {
                    xp: 0,          // 經驗值
                    potential: 0,   // 潛能 (學習技能用)
                    attack: 10,     // 攻擊力
                    defense: 10,    // 防禦力
                    hitRate: 10,    // 命中
                    dodge: 10,      // 閃避
                    parry: 10       // 招架
                },

                // 3. 技能列表 (格式: { skill_id: level })
                skills: {
                    "unarmed": 10, // 基本拳腳
                    "dodge": 10,   // 基本輕功
                    "parry": 10    // 基本招架
                },

                // 4. 背包與金錢
                money: 1000, // 初始銀兩
                inventory: [
                    { id: "bread", name: "乾糧", count: 3 },
                    { id: "waterskin", name: "水袋", count: 1 }
                ],
                equipment: {
                    weapon: null,
                    armor: null
                },

                sect: "none",
                createdAt: new Date().toISOString()
            };

            await setDoc(playerRef, initialData);
            localPlayerData = initialData;
            UI.print("角色建立完成！", "system");
        }
        
        CommandSystem.handle('look', localPlayerData, currentUser.uid);

    } catch (e) {
        UI.print("資料庫讀取失敗：" + e.message, "error");
    }
}