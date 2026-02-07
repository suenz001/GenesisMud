// src/main.js
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { UI } from "./ui.js";
import { CommandSystem } from "./systems/commands.js"; 
import { MapSystem } from "./systems/map.js"; 
import { ItemDB } from "./data/items.js"; 
import { auth, db } from "./firebase.js";
import { PlayerSystem } from "./systems/player.js"; // 確保導入 PlayerSystem 以使用 quit
import { CombatSystem } from "./systems/combat.js"; // 引入 CombatSystem

let currentUser = null;
let localPlayerData = null; 
let regenInterval = null; 
let autoSaveInterval = null; 
let playerUnsubscribe = null;

let lastInputTime = Date.now();
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 分鐘無動作則登出
let heartbeatCounter = 0; // 用於控制心跳寫入頻率

let gameState = 'INIT'; 
let tempCreationData = {}; 

let isAutoEat = false;
let isAutoDrink = false;

UI.print("系統初始化中...", "system");

UI.onAutoToggle({
    toggleEat: () => { isAutoEat = !isAutoEat; return isAutoEat; },
    toggleDrink: () => { isAutoDrink = !isAutoDrink; return isAutoDrink; }
});

// 監聽 UI 的巨集更新事件
UI.onMacroUpdate(async (id, macroData) => {
    if (!currentUser || !localPlayerData) return;
    
    if (!localPlayerData.macros) localPlayerData.macros = {};
    
    if (!macroData.cmd) {
        delete localPlayerData.macros[id];
        UI.print(`已清除快捷鍵 ${id} 的設定。`, "system");
    } else {
        localPlayerData.macros[id] = macroData;
        UI.print(`快捷鍵 ${id} 已設定為: [${macroData.name}] ${macroData.cmd}`, "system");
    }

    UI.updateMacroButtons(localPlayerData.macros);

    try {
        const playerRef = doc(db, "players", currentUser.uid);
        await updateDoc(playerRef, { macros: localPlayerData.macros });
    } catch (e) {
        console.error("儲存巨集失敗", e);
        UI.print("設定儲存失敗，請檢查網路。", "error");
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        UI.showLoginPanel(false);
        UI.enableGameInput(true);
        lastInputTime = Date.now();
        
        // [關鍵修復] 登入時立即強制更新一次 lastActive，確保 look 能馬上看到人
        try {
            const playerRef = doc(db, "players", user.uid);
            // 這裡使用 setDoc merge 避免覆蓋，如果文件還不存在(新帳號)會由 checkAndLoadPlayer 處理
            // 但對於舊帳號，這能確保 lastActive 立即有值
            await setDoc(playerRef, { lastActive: Date.now() }, { merge: true });
        } catch(e) {
            console.log("更新登入時間失敗 (可能是新帳號):", e);
        }

        await checkAndLoadPlayer(user);
    } else {
        cleanupGameSession(); 
        currentUser = null;
        localPlayerData = null;
        gameState = 'INIT';
        tempCreationData = {};
        UI.print("請登入以開始遊戲。", "system");
        UI.showLoginPanel(true);
        UI.enableGameInput(false);
    }
});

window.addEventListener('beforeunload', (e) => {
    if (currentUser && localPlayerData) {
        // 嘗試標記狀態為離線
        const playerRef = doc(db, "players", currentUser.uid);
    }
});

function cleanupGameSession() {
    if (regenInterval) {
        clearInterval(regenInterval);
        regenInterval = null;
    }
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    if (playerUnsubscribe) {
        playerUnsubscribe(); 
        playerUnsubscribe = null;
    }
    CommandSystem.stopCombat();
}

function setupPlayerListener(user, isFirstLoad = false) {
    if (playerUnsubscribe) playerUnsubscribe(); 

    const playerRef = doc(db, "players", user.uid);
    
    playerUnsubscribe = onSnapshot(playerRef, (docSnap) => {
        if (docSnap.exists()) {
            localPlayerData = docSnap.data();
            
            UI.updateHUD(localPlayerData);
            
            // 戰鬥狀態自動同步
            if (localPlayerData.state === 'fighting' && localPlayerData.combatTarget) {
                 CombatSystem.syncCombatState(localPlayerData, user.uid);
            }
            
            if (localPlayerData.macros) {
                UI.updateMacroButtons(localPlayerData.macros);
            } else {
                UI.updateMacroButtons({});
            }

            if (isFirstLoad) {
                isFirstLoad = false; 
                
                UI.print("讀取檔案成功... 你的江湖與你同在。", "system");
                
                if (localPlayerData.location === 'ghost_gate') {
                    const deathTime = localPlayerData.deathTime || 0;
                    const now = Date.now();
                    const diff = now - deathTime;
                    const waitTime = 180000; 

                    if (diff >= waitTime) {
                        UI.print("你在鬼門關徘徊已久，是時候還陽了。", "system");
                        const respawnPoint = localPlayerData.savePoint || "inn_start";
                        localPlayerData.location = respawnPoint;
                        updateDoc(playerRef, { location: respawnPoint });
                        CommandSystem.handle('look', localPlayerData, user.uid);
                    } else {
                        const remaining = Math.ceil((waitTime - diff) / 1000);
                        UI.print(`你還需要在鬼門關反省 ${remaining} 秒...`, "system");
                        
                        setTimeout(async () => {
                             const pSnap2 = await getDoc(playerRef);
                             if (pSnap2.data().location === 'ghost_gate') {
                                 UI.print("一道金光閃過，你還陽了！", "system");
                                 const respawnPoint = localPlayerData.savePoint || "inn_start";
                                 localPlayerData.location = respawnPoint;
                                 await updateDoc(playerRef, { location: respawnPoint });
                                 MapSystem.look(localPlayerData);
                             }
                        }, waitTime - diff);
                        
                        CommandSystem.handle('look', localPlayerData, user.uid);
                    }
                } else {
                    CommandSystem.handle('look', localPlayerData, user.uid);
                }

                gameState = 'PLAYING'; 
                startRegeneration(user);
            }
        }
    });
}

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

UI.onInput((cmd) => {
    // 每次輸入指令時，重置閒置計時器
    lastInputTime = Date.now();

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

function startRegeneration(user) {
    if (regenInterval) clearInterval(regenInterval);
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    
    // 這個循環每 10 秒執行一次
    regenInterval = setInterval(async () => {
        if (!localPlayerData || !user) return;
        
        // 1. 閒置檢測邏輯
        const now = Date.now();
        if (now - lastInputTime > IDLE_TIMEOUT) {
            // 如果不在修練狀態，則強制登出
            if (localPlayerData.state !== 'exercising') {
                UI.print("【系統】由於長時間未活動，系統將您自動登出。", "system", true);
                // 呼叫 quit 指令邏輯
                await PlayerSystem.quit(localPlayerData, [], user.uid);
                return; // 中斷後續邏輯
            }
        }

        // 2. 心跳 (Heartbeat) 與 恢復邏輯
        // 每 6 次循環 (約 60 秒) 強制更新一次 lastActive，證明自己還活著
        heartbeatCounter++;
        let forceUpdate = false;
        
        if (heartbeatCounter >= 6) {
            heartbeatCounter = 0;
            forceUpdate = true;
        }

        const attr = localPlayerData.attributes;
        let changed = false;

        // 自然恢復邏輯
        if (attr.hp < attr.maxHp) {
            const recover = Math.floor(attr.maxHp * 0.1); 
            attr.hp = Math.min(attr.maxHp, attr.hp + recover);
            changed = true;
        }
        if (attr.sp < attr.maxSp) {
            const recover = Math.floor(attr.maxSp * 0.1);
            attr.sp = Math.min(attr.maxSp, attr.sp + recover);
            changed = true;
        }
        if (attr.mp < attr.maxMp) {
            const recover = Math.floor(attr.maxMp * 0.1);
            attr.mp = Math.min(attr.maxMp, attr.mp + recover);
            changed = true;
        }

        if (attr.force < attr.maxForce) {
            const recover = Math.max(1, Math.floor(attr.maxForce * 0.05));
            attr.force = Math.min(attr.maxForce, attr.force + recover);
            changed = true;
        }
        if (attr.spiritual < attr.maxSpiritual) {
            const recover = Math.max(1, Math.floor(attr.maxSpiritual * 0.05));
            attr.spiritual = Math.min(attr.maxSpiritual, attr.spiritual + recover);
            changed = true;
        }
        if (attr.mana < attr.maxMana) {
            const recover = Math.max(1, Math.floor(attr.maxMana * 0.05));
            attr.mana = Math.min(attr.maxMana, attr.mana + recover);
            changed = true;
        }
        
        // 自動飲食邏輯
        if (localPlayerData.inventory) {
            if (isAutoEat && attr.food < attr.maxFood * 0.8) {
                const foodItem = localPlayerData.inventory.find(i => {
                    const info = ItemDB[i.id];
                    return info && info.type === 'food';
                });
                if (foodItem) {
                    UI.print(`[自動] 肚子餓了，拿出了${foodItem.name}。`, "system");
                    await CommandSystem.handle(`eat ${foodItem.id}`, localPlayerData, user.uid);
                    changed = true; 
                }
            }

            if (isAutoDrink && attr.water < attr.maxWater * 0.8) {
                const drinkItem = localPlayerData.inventory.find(i => {
                    const info = ItemDB[i.id];
                    return info && info.type === 'drink';
                });
                if (drinkItem) {
                    UI.print(`[自動] 口渴了，拿出了${drinkItem.name}。`, "system");
                    await CommandSystem.handle(`drink ${drinkItem.id}`, localPlayerData, user.uid);
                    changed = true;
                }
            }
        }

        // 執行資料庫更新
        if (changed || forceUpdate) {
            UI.updateHUD(localPlayerData);
            try {
                const playerRef = doc(db, "players", user.uid);
                // 準備更新資料，包含屬性與最後活動時間(心跳)
                const updatePayload = { 
                    attributes: attr,
                    lastActive: Date.now() // 更新心跳時間
                };
                await updateDoc(playerRef, updatePayload);
            } catch (e) {
                console.error("Auto regen save failed", e);
            }
        }
    }, 10000); 

    autoSaveInterval = setInterval(async () => {
        if (!localPlayerData || !user) return;
        
        try {
            const playerRef = doc(db, "players", user.uid);
            await updateDoc(playerRef, {
                attributes: localPlayerData.attributes,
                skills: localPlayerData.skills,
                inventory: localPlayerData.inventory,
                money: localPlayerData.money,
                equipment: localPlayerData.equipment,
                combat: localPlayerData.combat,
                location: localPlayerData.location,
                macros: localPlayerData.macros || {},
                lastActive: Date.now(), // 自動存檔也更新心跳
                lastSaved: new Date().toISOString()
            });
            UI.print("【系統】自動保存了進度。", "system");
        } catch (e) {
            console.error("Auto save failed", e);
        }
    }, 600000); 
}

async function handleCreationInput(input) {
    const val = input.trim();
    if (!val) return;

    if (gameState === 'CREATION_ID') {
        const idRegex = /^[a-zA-Z]{2,12}$/;
        if (!idRegex.test(val)) {
            UI.print("ID 格式錯誤：限 2-12 個英文字母 (A-Z, a-z)。", "error");
            return;
        }
        
        const newId = val.toLowerCase();
        UI.print(`正在檢查 ID [${newId}] 是否可用...`, "system");

        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("id", "==", newId));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                UI.print(`ID [${newId}] 已經被使用了，請換一個。`, "error");
                return;
            }

            tempCreationData.id = newId; 
            gameState = 'CREATION_NAME';
            UI.print(`ID [${newId}] 可用！`, "system");
            UI.print("請問大俠尊姓大名？(中文名稱)");
        } catch (e) {
            console.error(e);
            UI.print("檢查 ID 失敗：" + e.message, "error");
        }
        return;
    }

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
            setupPlayerListener(user, true);
        } else {
            UI.print("檢測到新面孔...", "system");
            UI.print("請輸入您想使用的【英文 ID】(純英文字母，不可重複)：");
            gameState = 'CREATION_ID'; 
        }
    } catch (e) {
        UI.print("資料庫讀取失敗：" + e.message, "error");
    }
}

async function createNewCharacter(user, data) {
    const playerRef = doc(db, "players", user.uid);
    UI.print("正在為您重塑肉身...", "system");

    const initialData = {
        id: data.id,     
        name: data.name,
        gender: data.gender,
        email: user.email || "anonymous",
        location: "inn_start",
        savePoint: "inn_start",
        attributes: {
            hp: 100, maxHp: 100, mp: 100, maxMp: 100, sp: 100, maxSp: 100,
            spiritual: 10, maxSpiritual: 10, force: 10, maxForce: 10, mana: 10, maxMana: 10,
            food: 100, maxFood: 100, water: 100, maxWater: 100,
            str: 20, con: 20, int: 20, per: 20, kar: 20, cor: 20
        },
        combat: { 
            xp: 0, 
            potential: 100, 
            kills: 0, 
            attack: 10, defense: 10, hitRate: 10, dodge: 10 
        },
        skills: { "unarmed": 10, "dodge": 10 },
        money: 1000,
        inventory: [
            { id: "rice", name: "白米飯", count: 2 },
            { id: "dumpling", name: "肉包子", count: 3 },
            { id: "waterskin", name: "牛皮水袋", count: 1 }
        ],
        equipment: { weapon: null, armor: null },
        sect: "none",
        createdAt: new Date().toISOString(),
        enabled_skills: {},
        macros: {},
        lastActive: Date.now() // [新增] 初始化心跳
    };

    try {
        await setDoc(playerRef, initialData);
        setupPlayerListener(user, false); 
        
        localPlayerData = initialData;
        gameState = 'PLAYING';
        UI.print(`角色【${data.name}(${data.id})】建立完成！`, "system");
        CommandSystem.handle('look', localPlayerData, user.uid);
        startRegeneration(user);
    } catch (e) {
        UI.print("創建失敗：" + e.message, "error");
    }
}