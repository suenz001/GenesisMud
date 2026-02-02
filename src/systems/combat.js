// src/systems/combat.js
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc, 
    collection, addDoc, serverTimestamp, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { PlayerSystem, getCombatStats, updatePlayer } from "./player.js";
import { ItemDB } from "../data/items.js";

// 用來儲存本地的戰鬥循環計時器，避免重複啟動
// key: userId, value: intervalId
const combatIntervals = {};

// 取得隨機傷害浮動 (0.8 ~ 1.2)
function getDamageVariance() {
    return 0.8 + Math.random() * 0.4;
}

// 輔助：尋找房間內的目標 (回傳 ID, 類型, 索引)
async function findTargetInRoom(roomId, targetName) {
    // 1. 搜尋玩家 (這部分需擴充，目前假設主要是打 NPC)
    // 若需PVP，需查詢 players collection。這裡先專注於 PVE。

    // 2. 搜尋 NPC
    // 我們需要知道這個 NPC 在房間陣列中的 index，以生成唯一 ID
    // 唯一 ID 格式: "roomId_npcId_index" (例如: inn_start_rabbit_0)
    const { WorldMap } = await import("../data/world.js");
    const room = WorldMap[roomId];
    
    if (!room || !room.npcs) return null;

    let targetId = null;
    let targetIndex = -1;

    // 先比對 ID
    if (room.npcs.includes(targetName)) {
        targetId = targetName;
        targetIndex = room.npcs.indexOf(targetName);
    } else {
        // 比對 Name
        for (let i = 0; i < room.npcs.length; i++) {
            const nid = room.npcs[i];
            if (NPCDB[nid] && NPCDB[nid].name === targetName) {
                targetId = nid;
                targetIndex = i;
                break;
            }
        }
    }

    if (!targetId) return null;

    // 確認這個 NPC 是否還活著 (檢查 dead_npcs)
    // 注意：這是一個簡單的客戶端檢查，嚴格來說應該在 startCombat 做
    // 但為了回傳正確的 index，這裡暫時假設它是存在的，之後在 ensureActiveNPC 處理
    return { 
        id: targetId, 
        index: targetIndex, 
        uniqueId: `${roomId}_${targetId}_${targetIndex}`,
        type: 'npc',
        name: NPCDB[targetId].name
    };
}

// 核心：確保 NPC 已經被「實體化」到 firebase 的 active_npcs
async function ensureActiveNPC(uniqueId, npcId, roomId, index) {
    const activeRef = doc(db, "active_npcs", uniqueId);
    const activeSnap = await getDoc(activeRef);

    if (activeSnap.exists()) {
        return activeSnap.data();
    } else {
        // 檢查是否已死 (dead_npcs)
        // 這裡我們假設呼叫此函式時，已經確認過不是屍體，或者強制要讀取初始狀態
        // 從靜態資料庫 (NPCDB) 讀取原始資料
        const staticData = NPCDB[npcId];
        if (!staticData) return null;

        // 建立初始實體資料
        const newData = {
            id: uniqueId,         // Firebase 文件 ID
            npcId: npcId,         // 原始 ID (rabbit)
            index: index,         // 房間內的第幾隻
            name: staticData.name,
            roomId: roomId,
            
            // 複製戰鬥屬性
            attributes: { ...staticData.attributes },
            combat: { ...staticData.combat }, // 包含 hp, maxHp, attack, defense
            currentHp: staticData.combat.hp,  // 獨立出來方便讀取
            maxHp: staticData.combat.maxHp,
            
            skills: staticData.skills || {},
            
            state: 'normal',
            isUnconscious: false,
            lastCombatTime: Date.now() // 用於判斷是否過久沒戰鬥可移除
        };

        await setDoc(activeRef, newData);
        return newData;
    }
}

// 核心：戰鬥回合執行 (每一回合讀寫 Firebase)
async function executeCombatRound(playerId, npcUniqueId, npcBaseId, roomId, mode) {
    // 1. 讀取雙方最新狀態
    const playerRef = doc(db, "players", playerId);
    const npcRef = doc(db, "active_npcs", npcUniqueId);

    const [pSnap, nSnap] = await Promise.all([getDoc(playerRef), getDoc(npcRef)]);

    if (!pSnap.exists() || !nSnap.exists()) {
        await CombatSystem.stopCombat(playerId);
        return;
    }

    const pData = pSnap.data();
    const nData = nSnap.data();

    // 2. 驗證戰鬥條件
    if (pData.location !== roomId || nData.roomId !== roomId) {
        UI.print("對手已經不在這裡了。", "system");
        await CombatSystem.stopCombat(playerId);
        return;
    }
    
    if (pData.attributes.hp <= 0 || pData.isUnconscious) {
        UI.print("你已經倒下了...", "error");
        await CombatSystem.stopCombat(playerId);
        return;
    }

    if (nData.currentHp <= 0 || nData.isUnconscious) {
        // NPC 已經失去戰鬥能力
        await handleVictory(playerId, pData, nData, npcUniqueId, npcBaseId, roomId, mode);
        return;
    }

    // 3. 計算戰鬥數值
    const pStats = getCombatStats(pData);
    
    // NPC 數據轉換 (為了配合 getCombatStats，稍微調整結構)
    const npcEntity = {
        attributes: nData.attributes,
        skills: nData.skills,
        equipment: {}, // NPC 通常沒有裝備系統，直接用數值
        enabled_skills: {} 
    };
    // 這裡我們簡化 NPC 計算，直接用 base 數值 + 技能
    // 如果想要更精確，可以使用 getCombatStats 傳入 npcEntity
    // 但因為 NPCDB 結構較簡單，我們手動計算簡易版
    const nAtk = nData.combat.attack + (nData.skills?.unarmed || 0);
    const nDef = nData.combat.defense + (nData.skills?.dodge || 0);
    const nHit = (nData.attributes.per || 10) * 2;
    const nDodge = (nData.attributes.per || 10) * 2 + (nData.skills?.dodge || 0);

    let messages = [];
    let pNewHp = pData.attributes.hp;
    let nNewHp = nData.currentHp;

    // === 玩家攻擊 NPC ===
    // 命中判定: 玩家命中 vs NPC 閃避
    const pHitRate = Math.max(0.1, (pStats.hit / (pStats.hit + nDodge)) * 1.2); 
    const pIsHit = Math.random() < pHitRate;

    if (pIsHit) {
        // 傷害計算: (玩家攻擊 - NPC 防禦) * 浮動
        let dmg = Math.max(1, (pStats.ap - nDef) * getDamageVariance());
        dmg = Math.floor(dmg);
        nNewHp -= dmg;
        
        // 戰鬥敘述 (簡易版，可搭配 messages.js 擴充)
        const skillName = pData.enabled_skills?.unarmed || "拳腳";
        messages.push(`${pData.name} 使出 ${skillName}，對 ${nData.name} 造成了 ${UI.txt(dmg, "#ff5555")} 點傷害！`);
    } else {
        messages.push(`${pData.name} 的攻擊被 ${nData.name} 靈巧地閃過了。`);
    }

    // === NPC 攻擊 玩家 (如果 NPC 還活著) ===
    if (nNewHp > 0) {
        // 命中判定
        const nHitRate = Math.max(0.1, (nHit / (nHit + pStats.dodge)) * 1.1);
        const nIsHit = Math.random() < nHitRate;

        if (nIsHit) {
            let dmg = Math.max(1, (nAtk - pStats.dp) * getDamageVariance());
            dmg = Math.floor(dmg);
            pNewHp -= dmg;
            messages.push(`${nData.name} 發起反擊，對你造成了 ${UI.txt(dmg, "#ff0000")} 點傷害！`);
        } else {
            messages.push(`${nData.name} 的攻擊被你閃過了。`);
        }
    }

    // 4. 寫入 Firebase (每回合強制寫入)
    // 輸出訊息
    messages.forEach(msg => {
        UI.print(msg, "chat");
        MessageSystem.broadcast(roomId, msg);
    });

    // 更新資料庫
    const updates = [];
    
    // 更新玩家
    updates.push(updatePlayer(playerId, {
        "attributes.hp": pNewHp,
        state: 'fighting',
        combatTarget: { id: npcBaseId, index: nData.index, name: nData.name } // 保持鎖定
    }));

    // 更新 NPC (Active List)
    updates.push(updateDoc(npcRef, {
        currentHp: nNewHp,
        lastCombatTime: Date.now(),
        targetId: playerId
    }));

    await Promise.all(updates);

    // 5. 檢查是否結束
    if (pNewHp <= 0) {
        UI.print(UI.txt("你眼前一黑，倒在地上不省人事...", "#888888"), "system");
        await updatePlayer(playerId, { isUnconscious: true, state: 'unconscious', combatTarget: null });
        await CombatSystem.stopCombat(playerId);
    } else if (nNewHp <= 0) {
        // 下一回合 loop 會進來處理 handleVictory
        // 但為了即時性，我們這裡直接呼叫處理結束邏輯
        // 重新讀取確保數據一致? 不用，直接傳入最新數值
        // 但為了保險，讓下一次 Loop 處理 Victory 邏輯會更乾淨
    }
}

// 處理勝利與 NPC 死亡/昏迷邏輯
async function handleVictory(playerId, pData, nData, npcUniqueId, npcBaseId, roomId, mode) {
    await CombatSystem.stopCombat(playerId);

    if (mode === 'fight') {
        // 切磋模式：NPC 昏迷
        UI.print(`${nData.name} 晃了幾下，倒在地上暈了過去。`, "system");
        MessageSystem.broadcast(roomId, `${nData.name} 被 ${pData.name} 打暈了。`);
        
        await updateDoc(doc(db, "active_npcs", npcUniqueId), {
            isUnconscious: true,
            currentHp: 0, // 確保是 0
            state: 'unconscious'
        });
        
        await updatePlayer(playerId, { state: 'normal', combatTarget: null });

    } else {
        // 殺戮模式：NPC 死亡
        UI.print(UI.txt(`${nData.name} 慘叫一聲，倒在血泊中死了。`, "#ff0000"), "system");
        MessageSystem.broadcast(roomId, `${nData.name} 被 ${pData.name} 殺死了！`);

        // 1. 產生屍體 (Room Items)
        const corpseName = `${nData.name}的屍體`;
        await addDoc(collection(db, "room_items"), {
            roomId: roomId,
            itemId: "corpse",
            name: corpseName,
            desc: "一具死狀淒慘的屍體。",
            droppedBy: pData.name,
            timestamp: serverTimestamp(),
            isCorpse: true, // 標記為屍體，可能可以割肉或搜屍
            sourceNpcId: npcBaseId
        });

        // 2. 掉落物處理 (從 NPCDB 讀取掉落率)
        const staticNpc = NPCDB[npcBaseId];
        if (staticNpc && staticNpc.drops) {
            for (const drop of staticNpc.drops) {
                if (Math.random() < drop.rate) {
                    const itemInfo = ItemDB[drop.id];
                    if (itemInfo) {
                        await addDoc(collection(db, "room_items"), {
                            roomId: roomId,
                            itemId: drop.id,
                            name: itemInfo.name,
                            timestamp: serverTimestamp()
                        });
                        UI.print(`一樣東西從屍體身上掉了出來：${itemInfo.name}`, "system");
                    }
                }
            }
        }

        // 3. 玩家獎勵 (XP / 潛能)
        // 簡單公式：NPC XP / 10
        const gainXp = Math.floor((staticNpc.combat.xp || 0) / 5) + 1;
        const gainPot = Math.floor(gainXp / 3) + 1;
        
        const newXp = (pData.combat.xp || 0) + gainXp;
        const newPot = (pData.combat.potential || 0) + gainPot;
        const newKills = (pData.combat.kills || 0) + 1;

        UI.print(`你獲得了 ${gainXp} 點經驗、${gainPot} 點潛能。`, "system");
        
        await updatePlayer(playerId, { 
            state: 'normal', 
            combatTarget: null,
            "combat.xp": newXp,
            "combat.potential": newPot,
            "combat.kills": newKills
        });

        // 4. 刪除 active_npcs 資料
        await deleteDoc(doc(db, "active_npcs", npcUniqueId));

        // 5. 寫入 dead_npcs (供重生系統使用)
        // 使用唯一 ID 確保不會重複寫入
        await setDoc(doc(db, "dead_npcs", npcUniqueId), {
            npcId: npcBaseId,
            index: nData.index,
            roomId: roomId,
            deathTime: serverTimestamp(),
            respawnTime: Date.now() + 180000 // 3分鐘後重生
        });
    }
}

export const CombatSystem = {
    // 供 commands.js 呼叫
    fight: async (playerData, args, userId) => {
        await CombatSystem.startCombat(playerData, args, userId, 'fight');
    },

    kill: async (playerData, args, userId) => {
        await CombatSystem.startCombat(playerData, args, userId, 'kill');
    },

    // 停止戰鬥
    stopCombat: async (userId) => {
        if (combatIntervals[userId]) {
            clearInterval(combatIntervals[userId]);
            delete combatIntervals[userId];
        }
        // 更新狀態回 normal (如果不暈的話)
        try {
            const ref = doc(db, "players", userId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const d = snap.data();
                if (!d.isUnconscious) {
                    await updatePlayer(userId, { state: 'normal', combatTarget: null });
                }
            }
        } catch(e) { console.error(e); }
    },

    // 啟動戰鬥邏輯
    startCombat: async (playerData, args, userId, mode) => {
        if (args.length === 0) return UI.print("你要攻擊誰？", "error");
        
        const targetName = args[0];
        
        // 1. 尋找目標
        const target = await findTargetInRoom(playerData.location, targetName);
        if (!target) return UI.print("這裡沒有這個人。", "error");

        if (playerData.state === 'fighting') {
             UI.print("你已經在戰鬥中了！", "error");
             return;
        }

        // 2. 如果是 NPC，確保資料已實體化到 active_npcs
        let activeData = null;
        if (target.type === 'npc') {
            // 檢查是否已死 (從 dead_npcs 查)
            const deadRef = doc(db, "dead_npcs", target.uniqueId);
            const deadSnap = await getDoc(deadRef);
            if (deadSnap.exists()) {
                 // 檢查重生時間 (雖然 map.js 已經過濾顯示，但防止時間差)
                 if (Date.now() < deadSnap.data().respawnTime) {
                     UI.print("那只是一具屍體。", "error");
                     return;
                 }
            }

            // 初始化 active_npcs
            activeData = await ensureActiveNPC(target.uniqueId, target.id, playerData.location, target.index);
            if (!activeData) {
                UI.print("發生錯誤：無法讀取 NPC 資料。", "error");
                return;
            }

            if (activeData.isUnconscious && activeData.currentHp <= 0 && mode === 'fight') {
                UI.print(`${activeData.name} 已經暈過去了，不需要再打了。`, "system");
                return;
            }
        }

        // 3. 設定初始戰鬥狀態
        UI.print(`你大喝一聲，對 ${target.name} 發起了攻擊！`, "chat");
        MessageSystem.broadcast(playerData.location, `${playerData.name} 對 ${target.name} 下了毒手！`);

        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: target.id, index: target.index, name: target.name }
        });

        // 4. 啟動戰鬥迴圈 (每 2 秒一回合)
        if (combatIntervals[userId]) clearInterval(combatIntervals[userId]);

        // 立即執行第一回合
        await executeCombatRound(userId, target.uniqueId, target.id, playerData.location, mode);

        combatIntervals[userId] = setInterval(async () => {
            await executeCombatRound(userId, target.uniqueId, target.id, playerData.location, mode);
        }, 2000); 
    },

    // 輔助：取得戰鬥難度顏色 (供 map.js 使用)
    getDifficultyInfo: (playerData, npcId) => {
        const npc = NPCDB[npcId];
        if (!npc) return { color: "#fff" };
        
        const pXp = playerData.combat ? (playerData.combat.xp || 0) : 0;
        const nXp = npc.combat.xp || 0;
        
        if (pXp > nXp * 10) return { color: "#888" }; // 簡單 (灰)
        if (pXp > nXp * 3) return { color: "#00ff00" }; // 容易 (綠)
        if (pXp < nXp / 3) return { color: "#ff0000" }; // 極難 (紅)
        return { color: "#ffff00" }; // 普通 (黃)
    }
};