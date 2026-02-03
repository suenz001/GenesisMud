// src/main.js
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { UI } from "./ui.js";
import { CommandSystem } from "./systems/commands.js"; 
import { MapSystem } from "./systems/map.js"; 
import { ItemDB } from "./data/items.js"; 
import { auth, db } from "./firebase.js";

let currentUser = null;
let localPlayerData = null; 
let regenInterval = null; 

let gameState = 'INIT'; 
let tempCreationData = {}; 

let isAutoEat = false;
let isAutoDrink = false;

UI.print("系統初始化中...", "system");

UI.onAutoToggle({
    toggleEat: () => { isAutoEat = !isAutoEat; return isAutoEat; },
    toggleDrink: () => { isAutoDrink = !isAutoDrink; return isAutoDrink; }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        UI.showLoginPanel(false);
        UI.enableGameInput(true);
        await checkAndLoadPlayer(user);
    } else {
        if (regenInterval) {
            clearInterval(regenInterval);
            regenInterval = null;
        }
        CommandSystem.stopCombat();
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

function startRegeneration(user) {
    if (regenInterval) clearInterval(regenInterval);
    
    // [修改] 移除了 tickCount，因為不再需要計算時間扣除飢渴度
    
    regenInterval = setInterval(async () => {
        if (!localPlayerData || !user) return;
        
        const attr = localPlayerData.attributes;
        let msg = [];
        let changed = false;

        // === [修改] 全屬性自然回復邏輯 (每10秒一次) ===
        
        // 1. 基礎屬性 (HP/SP/MP) - 回復 10%
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

        // 2. 特殊屬性 (內力/靈力/法力) - 回復 5%
        // 這讓掛機也能慢慢積攢力量，但效率不如打坐
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
        
        // === [重要修改] 已移除自動扣除 food/water 的邏輯 ===
        // 現在只有在 MapSystem.move 移動時才會扣除 (在 systems/map.js 中實作)

        // 自動進食/飲水邏輯 (當移動導致飢餓時，這裡會幫忙補)
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

        if (changed) {
            // 僅更新 HUD，不顯示洗版訊息
            UI.updateHUD(localPlayerData);
            try {
                const playerRef = doc(db, "players", user.uid);
                await updateDoc(playerRef, { attributes: attr });
            } catch (e) {
                console.error("Auto regen save failed", e);
            }
        }

    }, 10000); 
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
            UI.print("讀取檔案成功... 你的江湖與你同在。", "system");
            localPlayerData = docSnap.data();
            
            if (localPlayerData.location === 'ghost_gate') {
                const deathTime = localPlayerData.deathTime || 0;
                const now = Date.now();
                const diff = now - deathTime;
                const waitTime = 180000; 

                if (diff >= waitTime) {
                    UI.print("你在鬼門關徘徊已久，是時候還陽了。", "system");
                    const respawnPoint = localPlayerData.savePoint || "inn_start";
                    localPlayerData.location = respawnPoint;
                    await updateDoc(playerRef, { location: respawnPoint });
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
        enabled_skills: {}
    };

    try {
        await setDoc(playerRef, initialData);
        localPlayerData = initialData;
        gameState = 'PLAYING';
        UI.print(`角色【${data.name}(${data.id})】建立完成！`, "system");
        CommandSystem.handle('look', localPlayerData, user.uid);
        startRegeneration(user);
    } catch (e) {
        UI.print("創建失敗：" + e.message, "error");
    }
}