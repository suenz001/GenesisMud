// src/systems/combat.js
import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { NPCDB } from "../data/npcs.js";
import { ItemDB } from "../data/items.js";
import { SkillDB } from "../data/skills.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js"; 
import { updatePlayer, getCombatStats } from "./player.js";

// 用來儲存下一回合的 Timer ID，方便隨時中斷
let nextRoundTimer = null;

// 生成 NPC 在 active_npcs 中的唯一 ID
function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

// 取得難度顏色 (維持原本邏輯)
function getDifficultyInfo(playerData, npcId) {
    const npc = NPCDB[npcId];
    if (!npc) return { color: "#fff", ratio: 1 };
    
    // 這裡僅做簡單預估，不影響戰鬥邏輯
    const pStats = getCombatStats(playerData);
    
    // 簡易 NPC 數值計算
    let maxSkill = 0;
    let rating = 1.0;
    if (npc.skills) {
        for (const [sid, lvl] of Object.entries(npc.skills)) {
            const sInfo = SkillDB[sid];
            if (lvl > maxSkill) {
                maxSkill = lvl;
                if (sInfo && sInfo.rating) rating = sInfo.rating;
            }
        }
    }
    const str = npc.attributes?.str || 20;
    const con = npc.attributes?.con || 20;
    const ap = (str * 2.5) + (maxSkill * 5 * rating) + (npc.combat.attack || 0);
    const dp = (con * 2.5) + (maxSkill * 2) + (npc.combat.defense || 0);
    const npcCombatStat = { ap, dp };

    const pPower = (pStats.ap + pStats.dp) * 2 + playerData.attributes.maxHp;
    const nPower = (npcCombatStat.ap + npcCombatStat.dp) * 2 + npc.combat.maxHp;

    const ratio = nPower / (pPower || 1); 

    let color = "#ffffff"; 
    if (ratio < 0.5) color = "#888888"; 
    else if (ratio < 0.8) color = "#00ff00"; 
    else if (ratio < 1.2) color = "#ffffff"; 
    else if (ratio < 2.0) color = "#ffff00"; 
    else color = "#ff0000"; 

    return { color, ratio };
}

// 取得狀態描述文字
function getStatusDesc(name, current, max) {
    if (max <= 0) return null;
    const pct = current / max;
    if (pct <= 0) return UI.txt(`${name} 已經昏迷不醒，倒在地上一動也不動。`, "#888888");
    if (pct <= 0.1) return UI.txt(`${name} 搖頭晃腦，眼看就要倒在地上了！`, "#ff5555");
    if (pct <= 0.4) return UI.txt(`${name} 氣喘呼呼，看起來狀況不太好。`, "#ffaa00");
    return null; // 其他狀況不特別顯示，避免洗頻
}

// 計算等級總和 (用於潛能獎勵)
function getLevel(character) {
    const skills = character.skills || {};
    let maxMartial = 0, maxForce = 0;
    for (const [sid, lvl] of Object.entries(skills)) {
        const skillInfo = SkillDB[sid];
        if (skillInfo && skillInfo.base) {
            if (skillInfo.type === 'martial' && lvl > maxMartial) maxMartial = lvl;
            if (skillInfo.type === 'force' && lvl > maxForce) maxForce = lvl;
        }
    }
    return maxMartial + maxForce;
}

// 取得 NPC 戰鬥數值 (即時計算)
function getNPCCombatStats(npc, activeData) {
    const atkType = 'unarmed'; 
    let maxSkill = 0;
    let rating = 1.0; 

    if (npc.skills) {
        for (const [sid, lvl] of Object.entries(npc.skills)) {
            const sInfo = SkillDB[sid];
            if (lvl > maxSkill) {
                maxSkill = lvl;
                if (sInfo && sInfo.rating) rating = sInfo.rating;
            }
        }
    }
    const effAtkSkill = maxSkill;

    const str = npc.attributes?.str || 20;
    const con = npc.attributes?.con || 20;
    const per = npc.attributes?.per || 20;
    
    // 如果 activeData 有狀態 (如虛弱)，可以在此影響數值
    
    const ap = (str * 2.5) + (effAtkSkill * 5 * rating) + (npc.combat.attack || 0);
    const dp = (con * 2.5) + (effAtkSkill * 2) + (npc.combat.defense || 0);
    const hit = (per * 2.5) + (effAtkSkill * 3 * rating);
    const dodge = (per * 2.5) + (effAtkSkill * 4);

    return { ap, dp, hit, dodge, atkType, effAtkSkill, rating };
}

// 閃避訊息生成
function getDodgeMessage(entity, attackerName) {
    let msg = `$N身形一晃，閃過了$P的攻擊！`; 
    let activeDodge = null;
    if (entity.enabled_skills && entity.enabled_skills.dodge) {
        activeDodge = entity.enabled_skills.dodge;
    } else if (entity.skills && entity.skills.dodge && entity.skills.dodge > 20) {
        // 預設閃避
    }

    if (activeDodge && SkillDB[activeDodge] && SkillDB[activeDodge].dodge_actions) {
        const actions = SkillDB[activeDodge].dodge_actions;
        msg = actions[Math.floor(Math.random() * actions.length)];
    }

    return UI.txt(msg.replace(/\$N/g, entity.name || "你").replace(/\$P/g, attackerName), "#aaa");
}

// === 核心戰鬥循環 ===
// 這是每一回合執行的函式，負責讀取 -> 計算 -> 寫入
async function processRound(userId, uniqueNpcId, isLethal) {
    // 1. 讀取最新狀態 (READ Phase)
    let playerSnap, npcSnap;
    try {
        playerSnap = await getDoc(doc(db, "players", userId));
        npcSnap = await getDoc(doc(db, "active_npcs", uniqueNpcId));
    } catch (e) {
        console.error("讀取戰鬥數據失敗", e);
        CombatSystem.stopCombat(userId);
        return;
    }

    if (!playerSnap.exists()) { CombatSystem.stopCombat(userId); return; }
    
    const pData = playerSnap.data();
    
    // 如果玩家已經不在戰鬥狀態 (可能被指令停止，或移動了)，終止循環
    if (pData.state !== 'fighting' || !pData.combatTarget) {
        CombatSystem.stopCombat(userId);
        return;
    }

    // 解析 NPC 數據
    // 注意：如果是第一回合，active_npcs 可能還沒建立，需要從 NPCDB 初始化
    // 但在 startCombat 我們會強制先建立，所以這裡假設 active_npcs 應該存在
    // 若不存在代表 NPC 可能已被殺死或過期
    if (!npcSnap.exists()) {
        UI.print("對手似乎已經不在這裡了。", "system");
        CombatSystem.stopCombat(userId);
        return;
    }

    const nData = npcSnap.data();
    const npcTemplate = NPCDB[nData.npcId]; // 取得原始靜態資料 (用於技能/屬性計算)

    if (!npcTemplate) {
        CombatSystem.stopCombat(userId);
        return;
    }

    // 檢查位置是否一致 (防呆)
    if (pData.location !== nData.roomId) {
        UI.print("你和對手不在同一個地方。", "error");
        CombatSystem.stopCombat(userId);
        return;
    }

    // 2. 判定勝負與昏迷 (CHECK Phase - Pre-combat)
    if (pData.isUnconscious) {
        UI.print("你現在昏迷不醒，無法戰鬥！", "error");
        CombatSystem.stopCombat(userId);
        return;
    }
    if (nData.isUnconscious || nData.currentHp <= 0) {
        if (isLethal) {
             // 繼續執行處決邏輯
        } else {
             UI.print(`${nData.npcName} 已經倒在地上，無法再與你切磋了。`, "system");
             CombatSystem.stopCombat(userId);
             return;
        }
    }

    // 3. 計算傷害 (CALC Phase)
    const pStats = getCombatStats(pData);
    const nStats = getNPCCombatStats(npcTemplate, nData);
    let logs = []; // 收集本回合訊息，稍後廣播

    // --- 玩家攻擊 NPC ---
    let dmgToNpc = 0;
    
    // 內力運算
    const enforceLevel = pData.combat?.enforce || 0;
    let forceBonus = 0;
    let actualForceCost = 0;
    
    if (enforceLevel > 0 && pData.attributes.force > 0) {
         const maxForce = pData.attributes.maxForce || 10;
         let cost = Math.floor(maxForce * (enforceLevel / 10) * 0.3);
         if (cost < 1) cost = 1;
         actualForceCost = Math.min(pData.attributes.force, cost);
         // 簡單加成公式
         forceBonus = Math.floor(actualForceCost * (1 + (pData.skills?.force || 0)/100));
         pData.attributes.force -= actualForceCost;
    }

    // 命中判定
    const pHitChance = Math.random() * (pStats.hit + nStats.dodge);
    const pIsHit = nData.isUnconscious ? true : (pHitChance < pStats.hit);

    // 取得招式描述
    let enabledType = pData.enabled_skills && pData.enabled_skills[pStats.atkType];
    let activeSkillId = enabledType || pStats.atkType;
    let skillInfo = SkillDB[activeSkillId];
    let action = skillInfo?.actions ? skillInfo.actions[Math.floor(Math.random() * skillInfo.actions.length)] : { msg: "$P攻擊$N。", damage: 10 };

    let atkMsg = action.msg
        .replace(/\$P/g, pData.name)
        .replace(/\$N/g, nData.npcName)
        .replace(/\$w/g, pStats.weaponData ? pStats.weaponData.name : "雙手");

    logs.push(UI.txt(atkMsg, "#ffff00")); // 攻擊敘述

    if (pIsHit) {
        let rawDmg = pStats.ap - nStats.dp;
        rawDmg += ((action.damage || 10) * (pStats.atkRating || 1.0)) / 2;
        rawDmg += forceBonus;
        rawDmg = rawDmg * (0.9 + Math.random() * 0.2);
        if (rawDmg <= 0) rawDmg = Math.random() * 5 + 1;
        
        // 切磋模式傷害減半
        if (!isLethal) rawDmg = rawDmg / 2;

        dmgToNpc = Math.round(rawDmg);
        
        // 內力消耗提示
        let extraInfo = "";
        if (actualForceCost > 0) extraInfo = ` (運功-${actualForceCost})`;
        
        logs.push(UI.txt(`(造成 ${dmgToNpc} 點傷害${extraInfo})`, "chat"));
    } else {
        logs.push(getDodgeMessage({name: nData.npcName, skills: npcTemplate.skills}, pData.name));
    }

    // --- NPC 攻擊 玩家 (如果 NPC 清醒) ---
    let dmgToPlayer = 0;
    if (!nData.isUnconscious && nData.currentHp > 0) {
        const nHitChance = Math.random() * (nStats.hit + pStats.dodge);
        const nIsHit = (nHitChance < nStats.hit);
        
        let npcAtkMsg = UI.txt(`${nData.npcName} 往 ${pData.name} 發起攻擊！`, "#ff5555");
        logs.push(npcAtkMsg);

        if (nIsHit) {
            let rawDmg = nStats.ap - pStats.dp;
            if (rawDmg <= 0) rawDmg = Math.random() * 3 + 1;
            if (!isLethal) rawDmg = rawDmg / 2;
            
            dmgToPlayer = Math.round(rawDmg);
            logs.push(`(你受到了 ${dmgToPlayer} 點傷害)`);
        } else {
            logs.push(getDodgeMessage(pData, nData.npcName));
        }
    }

    // 4. 更新數值 (UPDATE Logic)
    let newNpcHp = nData.currentHp - dmgToNpc;
    let newPlayerHp = pData.attributes.hp - dmgToPlayer;
    let npcBecameUnconscious = false;
    let playerBecameUnconscious = false;
    let npcDied = false;
    let playerDied = false;

    // 檢查 NPC 狀態
    if (newNpcHp <= 0) {
        newNpcHp = 0;
        if (isLethal) {
            npcDied = true;
        } else {
            npcBecameUnconscious = true;
        }
    }

    // 檢查 玩家 狀態
    if (newPlayerHp <= 0) {
        newPlayerHp = 0;
        // 玩家血歸零，無論是 fight 還是 kill，玩家都會暈
        // 如果是 NPC kill 玩家，則玩家死亡 (這裡暫設 NPC 比較仁慈，或是看需求)
        // 為了簡單，假設 PVE 中 NPC 打贏玩家，玩家先昏迷，後續處理死亡邏輯
        if (isLethal) {
             playerDied = true; // 被殺死
        } else {
             playerBecameUnconscious = true; // 切磋輸了
        }
    }

    // 5. 寫入資料庫 (WRITE Phase)
    // 必須等待寫入完成，才能進行下一回合
    
    // 準備 NPC 更新資料
    let npcUpdateData = {
        currentHp: newNpcHp,
        lastCombatTime: Date.now()
    };
    if (npcBecameUnconscious) npcUpdateData.isUnconscious = true;

    // 準備 玩家 更新資料
    let playerUpdateData = {
        "attributes.hp": newPlayerHp,
        "attributes.force": pData.attributes.force
    };
    if (playerBecameUnconscious) playerUpdateData.isUnconscious = true;

    const updates = [];

    // 如果 NPC 死了，不更新 active_npcs，而是刪除它
    if (npcDied) {
        updates.push(deleteDoc(doc(db, "active_npcs", uniqueNpcId)));
    } else {
        updates.push(updateDoc(doc(db, "active_npcs", uniqueNpcId), npcUpdateData));
    }

    updates.push(updatePlayer(userId, playerUpdateData));

    // 廣播本回合訊息
    logs.forEach(l => {
        UI.print(l, "system", true); // 本地顯示
        MessageSystem.broadcast(pData.location, l); // 廣播
    });

    // 顯示血量狀態描述
    const pStatus = getStatusDesc("你", newPlayerHp, pData.attributes.maxHp);
    if(pStatus) { UI.print(pStatus, "chat", true); MessageSystem.broadcast(pData.location, pStatus.replace("你", pData.name)); }
    
    const nStatus = getStatusDesc(nData.npcName, newNpcHp, nData.maxHp);
    if(nStatus) { UI.print(nStatus, "chat", true); MessageSystem.broadcast(pData.location, nStatus); }

    // 執行寫入
    await Promise.all(updates);
    
    UI.updateHUD({...pData, attributes: {...pData.attributes, hp: newPlayerHp}}); // 本地 UI 立即更新

    // 6. 結算與下一回合 (Next Round Logic)

    // A. 玩家死亡/昏迷
    if (playerDied) {
        await handlePlayerDeath(pData, userId);
        CombatSystem.stopCombat(userId);
        return;
    }
    if (playerBecameUnconscious) {
        const loseMsg = UI.txt("你眼前一黑，知道自己輸了，連忙跳出戰圈。", "#ffaa00", true);
        UI.print(loseMsg, "system", true);
        MessageSystem.broadcast(pData.location, UI.txt(`${pData.name} 敗下陣來，暈了過去。`, "#ffaa00", true));
        CombatSystem.stopCombat(userId);
        return;
    }

    // B. NPC 死亡/昏迷
    if (npcDied) {
        // 執行掉落與獎勵
        await handleKillReward(npcTemplate, pData, userId, uniqueNpcId, nData);
        CombatSystem.stopCombat(userId);
        return;
    }
    if (npcBecameUnconscious) {
        // 切磋勝利
        const winMsg = UI.txt(`${nData.npcName} 拱手說道：「佩服佩服，是在下輸了。」`, "#00ff00", true);
        UI.print(winMsg, "chat", true);
        MessageSystem.broadcast(pData.location, winMsg);
        
        // 給予少量潛能獎勵
        let pot = (pData.combat.potential || 0) + 10;
        await updatePlayer(userId, { 
            "combat.potential": pot,
            state: 'normal', 
            combatTarget: null 
        });
        
        CombatSystem.stopCombat(userId); // 停止計時器
        return;
    }

    // C. 雙方都還活著且清醒 -> 設定下一回合
    nextRoundTimer = setTimeout(() => {
        processRound(userId, uniqueNpcId, isLethal);
    }, 2000); // 2秒後執行下一回合
}

// 處理玩家死亡
async function handlePlayerDeath(playerData, userId) {
    const deathMsg = UI.txt("你眼前一黑，感覺靈魂脫離了軀體...", "#ff0000", true);
    UI.print(deathMsg, "system", true);
    MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 慘叫一聲，倒在地上死了。`, "#ff0000", true));

    // 技能懲罰
    let newSkills = { ...playerData.skills };
    for (let s in newSkills) {
        if (newSkills[s] > 0) newSkills[s] = Math.max(0, newSkills[s] - 1);
    }

    const deathLocation = "ghost_gate";
    
    // 更新玩家為死亡狀態
    await updatePlayer(userId, {
        location: deathLocation,
        skills: newSkills,
        "attributes.hp": playerData.attributes.maxHp, // 死後補滿方便還陽
        "attributes.sp": playerData.attributes.maxSp,
        state: 'normal',
        combatTarget: null,
        isUnconscious: false,
        deathTime: Date.now() 
    });

    // 觸發地圖更新
    UI.print("你悠悠醒來，發現自己身處【鬼門關】。", "system");
    
    // 自動還陽計時 (保留原本邏輯)
    setTimeout(async () => {
        const pSnap = await getDoc(doc(db, "players", userId));
        if (pSnap.exists() && pSnap.data().location === "ghost_gate") {
            const respawnPoint = pSnap.data().savePoint || "inn_start";
            await updatePlayer(userId, { location: respawnPoint });
            UI.print("一道金光閃過，你還陽了！", "system");
            MapSystem.look({...playerData, location: respawnPoint});
        }
    }, 180000);
    
    MapSystem.look({...playerData, location: deathLocation});
}

// 處理 NPC 死亡獎勵
async function handleKillReward(npcTemplate, playerData, userId, uniqueNpcId, nData) {
    const deadMsg = UI.txt(`${nData.npcName} 慘叫一聲，被你結果了性命。`, "#ff0000", true);
    UI.print(deadMsg, "system", true);
    MessageSystem.broadcast(playerData.location, UI.txt(`${nData.npcName} 被 ${playerData.name} 殺死了。`, "#ff0000", true));
    
    // 計算經驗
    const pLvl = getLevel(playerData);
    const nLvl = getLevel(npcTemplate);
    let potGain = 100 + ((nLvl - pLvl) * 10);
    if (potGain < 10) potGain = 10;
    
    // 難度修正
    const diff = getDifficultyInfo(playerData, npcTemplate.id);
    if (diff.ratio < 0.5) { potGain = 0; UI.print("虐菜沒有收穫。", "chat"); }
    else if (diff.ratio < 0.8) potGain = Math.floor(potGain * 0.5);

    if (potGain > 0) {
        UI.print(UI.txt(`戰鬥勝利！獲得 ${potGain} 點潛能。`, "#00ff00", true), "system", true);
    }

    // 掉落物
    if (npcTemplate.drops) {
        for (const drop of npcTemplate.drops) {
            if (Math.random() <= drop.rate) {
                const itemInfo = ItemDB[drop.id];
                if(itemInfo) {
                    await addDoc(collection(db, "room_items"), {
                        roomId: playerData.location, 
                        itemId: drop.id, 
                        name: itemInfo.name, 
                        droppedBy: "SYSTEM", 
                        timestamp: serverTimestamp()
                    });
                    UI.print(`${nData.npcName} 掉出了 ${itemInfo.name}。`, "system");
                }
            }
        }
    }

    // 記錄屍體
    await addDoc(collection(db, "dead_npcs"), { 
        roomId: playerData.location, 
        npcId: npcTemplate.id, 
        index: nData.targetIndex || 0, // 需確保有此欄位，或從 uniqueId 解析
        respawnTime: Date.now() + 300000 
    });

    // 更新玩家數據
    await updatePlayer(userId, { 
        "combat.potential": (playerData.combat.potential || 0) + potGain,
        "combat.kills": (playerData.combat.kills || 0) + 1,
        state: 'normal',
        combatTarget: null
    });
    
    MapSystem.look(playerData);
}

// === 尋找活著的 NPC (helper) ===
async function findAliveNPC(roomId, targetId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;

    // 找出屍體
    const deadRef = collection(db, "dead_npcs");
    const q = query(deadRef, where("roomId", "==", roomId));
    const snapshot = await getDocs(q);
    
    const deadIndices = [];
    const now = Date.now();
    snapshot.forEach(doc => {
        const data = doc.data();
        if (now < data.respawnTime) {
            if (data.npcId === targetId) deadIndices.push(data.index);
        }
    });

    // 找第一個活著的 index
    for (let i = 0; i < room.npcs.length; i++) {
        if (room.npcs[i] === targetId) {
            if (!deadIndices.includes(i)) {
                return { ...NPCDB[targetId], index: i }; 
            }
        }
    }
    return null;
}

export const CombatSystem = {
    getDifficultyInfo, 

    stopCombat: async (userId) => {
        if (nextRoundTimer) {
            clearTimeout(nextRoundTimer);
            nextRoundTimer = null;
        }
        // 強制重置玩家狀態，避免卡在 fighting
        if (userId) {
            await updatePlayer(userId, { state: 'normal', combatTarget: null });
        }
    },

    kill: async (playerData, args, userId) => {
        CombatSystem.startCombat(playerData, args, userId, true);
    },

    fight: async (playerData, args, userId) => {
        CombatSystem.startCombat(playerData, args, userId, false);
    },

    startCombat: async (playerData, args, userId, isLethal) => {
        if (args.length === 0) { UI.print("你想對誰動手？", "error"); return; }
        if (playerData.state === 'fighting') { UI.print("你已經在戰鬥中了！", "error"); return; }
        
        const room = MapSystem.getRoom(playerData.location);
        if (room.safe) { UI.print("這裡是安全區，禁止動武。", "error"); return; }
        
        const targetId = args[0];
        const npc = await findAliveNPC(playerData.location, targetId);
    
        if (!npc) { UI.print("這裡沒有這個人，或者他已經倒下了。", "error"); return; }

        const uniqueId = getUniqueNpcId(playerData.location, npc.id, npc.index);
        
        // 1. 初始化或讀取 NPC 狀態
        // 這是"開始戰鬥"的關鍵一步，確保 active_npcs 有資料
        const activeRef = doc(db, "active_npcs", uniqueId);
        const activeSnap = await getDoc(activeRef);
        
        let currentHp = npc.combat.maxHp;
        let isUnconscious = false;

        if (activeSnap.exists()) {
            const data = activeSnap.data();
            currentHp = data.currentHp;
            isUnconscious = data.isUnconscious || false;
        } else {
            // 如果沒資料，創建一個滿血的
            await setDoc(activeRef, {
                currentHp: npc.combat.maxHp,
                maxHp: npc.combat.maxHp,
                roomId: playerData.location,
                npcName: npc.name,
                npcId: npc.id,        // 記錄 ID
                targetIndex: npc.index, // 記錄 Index
                isUnconscious: false,
                lastCombatTime: Date.now()
            });
        }

        // 檢查是否可以攻擊
        if (isUnconscious || currentHp <= 0) {
            if (isLethal) {
                // 如果是 kill 指令，允許對昏迷者補刀
                UI.print(`你對昏迷中的 ${npc.name} 下了毒手！`, "system");
            } else {
                UI.print(`${npc.name} 已經昏迷不醒，無法和你切磋。`, "error");
                return;
            }
        }

        const combatType = isLethal ? "下殺手" : "切磋";
        const color = isLethal ? "#ff0000" : "#ff8800";
        
        // 更新玩家狀態為戰鬥中
        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: npc.id, index: npc.index } 
        });

        // 顯示開始訊息
        const startMsg = UI.txt(`你對 ${npc.name} ${combatType}！戰鬥開始！`, color, true);
        UI.print(startMsg, "system", true);
        MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 對 ${npc.name} ${combatType}，大戰一觸即發！`, color, true));
        
        const initStatus = getStatusDesc(npc.name, currentHp, npc.combat.maxHp);
        if (initStatus) UI.print(initStatus, "chat", true);

        // 開始第一回合 (立即執行)
        processRound(userId, uniqueId, isLethal);
    }
};