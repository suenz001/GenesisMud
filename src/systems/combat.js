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

// 用來控制戰鬥迴圈的標記
let isFighting = false;
let currentCombatSessionId = 0;

function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

// === 同步 NPC 狀態 (寫入) ===
async function syncNpcState(uniqueId, currentHp, maxHp, roomId, npcName, isUnconscious = false) {
    try {
        const ref = doc(db, "active_npcs", uniqueId);
        await setDoc(ref, {
            currentHp: currentHp,
            maxHp: maxHp,
            roomId: roomId,
            npcName: npcName,
            isUnconscious: isUnconscious,
            lastCombatTime: Date.now()
        }, { merge: true });
        // console.log(`[Combat] Sync Write: ${npcName} HP:${currentHp}`);
    } catch (e) {
        console.error("同步 NPC 狀態失敗", e);
    }
}

// === 獲取 NPC 狀態 (讀取) ===
async function fetchNpcState(uniqueId, defaultMaxHp) {
    try {
        const ref = doc(db, "active_npcs", uniqueId);
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            // 檢查是否超時 (3分鐘沒戰鬥視為脫離)
            if (Date.now() - data.lastCombatTime > 180000) {
                await deleteDoc(ref);
                return { hp: defaultMaxHp, isUnconscious: false };
            } else {
                return { hp: data.currentHp, isUnconscious: data.isUnconscious };
            }
        }
    } catch (e) {
        console.error("讀取 NPC 狀態失敗", e);
    }
    // 如果沒有紀錄，回傳滿血狀態
    return { hp: defaultMaxHp, isUnconscious: false };
}

function getNPCCombatStats(npc) {
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
    
    const ap = (str * 2.5) + (effAtkSkill * 5 * rating) + (npc.combat.attack || 0);
    const dp = (con * 2.5) + (effAtkSkill * 2) + (npc.combat.defense || 0);
    const hit = (per * 2.5) + (effAtkSkill * 3 * rating);
    const dodge = (per * 2.5) + (effAtkSkill * 4);

    return { ap, dp, hit, dodge, atkType, effAtkSkill, rating };
}

function calculateCombatPower(stats, hp) {
    return (stats.ap + stats.dp) * 2 + hp;
}

export function getDifficultyInfo(playerData, npcId) {
    const npc = NPCDB[npcId];
    if (!npc) return { color: "#fff", ratio: 1 };

    const pStats = getCombatStats(playerData);
    const nStats = getNPCCombatStats(npc);

    const pPower = calculateCombatPower(pStats, playerData.attributes.maxHp);
    const nPower = calculateCombatPower(nStats, npc.combat.maxHp);

    const ratio = nPower / (pPower || 1); 

    let color = "#ffffff"; 
    if (ratio < 0.5) color = "#888888"; 
    else if (ratio < 0.8) color = "#00ff00"; 
    else if (ratio < 1.2) color = "#ffffff"; 
    else if (ratio < 2.0) color = "#ffff00"; 
    else color = "#ff0000"; 

    return { color, ratio };
}

function getStatusDesc(name, current, max) {
    if (max <= 0) return null;
    const pct = current / max;
    if (pct <= 0) return UI.txt(`${name} 已經昏迷不醒，倒在地上一動也不動。`, "#888888");
    if (pct <= 0.1 && pct > 0) return UI.txt(`${name} 搖頭晃腦，眼看就要倒在地上了！`, "#ff5555");
    if (pct <= 0.4 && pct > 0.1) return UI.txt(`${name} 氣喘呼呼，看起來狀況不太好。`, "#ffaa00");
    return null;
}

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

async function findAliveNPC(roomId, targetId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;

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

    for (let i = 0; i < room.npcs.length; i++) {
        if (room.npcs[i] === targetId) {
            if (!deadIndices.includes(i)) {
                const npcData = NPCDB[targetId];
                return { ...npcData, index: i, isUnconscious: false }; 
            }
        }
    }
    return null;
}

// 處理玩家死亡
async function handlePlayerDeath(playerData, userId) {
    const deathMsg = UI.txt("你眼前一黑，感覺靈魂脫離了軀體...", "#ff0000", true);
    UI.print(deathMsg, "system", true);
    MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 慘叫一聲，倒在地上死了。`, "#ff0000", true));

    CombatSystem.stopCombat(userId);

    if (playerData.skills) {
        for (let skillId in playerData.skills) {
            if (playerData.skills[skillId] > 0) playerData.skills[skillId] -= 1;
        }
    }

    const deathLocation = "ghost_gate";
    playerData.attributes.hp = playerData.attributes.maxHp;
    playerData.attributes.sp = playerData.attributes.maxSp;
    playerData.attributes.mp = playerData.attributes.maxMp;
    playerData.isUnconscious = false; // 重生後解除昏迷
    
    playerData.location = deathLocation; 

    await updatePlayer(userId, {
        location: deathLocation,
        skills: playerData.skills,
        attributes: playerData.attributes,
        state: 'normal',
        combatTarget: null,
        isUnconscious: false,
        deathTime: Date.now() 
    });

    UI.updateHUD(playerData);
    UI.print("你悠悠醒來，發現自己身處【鬼門關】。", "system");
    UI.print("你的武功修為受到了一些損耗。", "system");
    UI.print(UI.txt("黑白無常說道：「陽壽未盡？在這反省 3 分鐘再回去吧！」", "#aaa"), "chat", true);
    
    MapSystem.look(playerData);

    setTimeout(async () => {
        const pRef = doc(db, "players", userId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
            const currentP = pSnap.data();
            if (currentP.location === "ghost_gate") {
                const respawnPoint = currentP.savePoint || "inn_start";
                playerData.location = respawnPoint;
                await updatePlayer(userId, { location: respawnPoint });
                
                if (auth.currentUser && auth.currentUser.uid === userId) {
                    UI.print("一道金光閃過，你還陽了！", "system");
                    MapSystem.look(playerData);
                }
            }
        }
    }, 180000);
}

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

// 處理擊殺獎勵 (Kill)
async function handleKillReward(npc, playerData, currentCombatState, userId) {
    try {
        const deadMsg = UI.txt(`${npc.name} 慘叫一聲，被你結果了性命。`, "#ff0000", true);
        UI.print(deadMsg, "system", true);
        MessageSystem.broadcast(playerData.location, UI.txt(`${npc.name} 被 ${playerData.name} 殺死了。`, "#ff0000", true));
        
        const playerLvl = getLevel(playerData);
        const npcLvl = getLevel(npc); 
        let potGain = 100 + ((npcLvl - playerLvl) * 10);
        if (potGain < 10) potGain = 10;

        const ratio = currentCombatState.diffRatio;
        if (ratio < 0.5) {
            potGain = 0; 
            UI.print("這對手太弱了，你從戰鬥中毫無所獲。", "chat");
        } else if (ratio < 0.8) {
            potGain = Math.floor(potGain * 0.5);
            UI.print("這對手對你來說太輕鬆了，收穫不多。", "chat");
        }
        
        if (potGain > 0) {
            playerData.combat.potential = (playerData.combat.potential || 0) + potGain;
            UI.print(UI.txt(`戰鬥勝利！獲得 ${potGain} 點潛能。`, "#00ff00", true), "system", true);
        }
        
        playerData.combat.kills = (playerData.combat.kills || 0) + 1;

        if (npc.drops) {
            for (const drop of npc.drops) {
                if (Math.random() <= drop.rate) {
                    const itemInfo = ItemDB[drop.id];
                    if(itemInfo) {
                        await addDoc(collection(db, "room_items"), {
                            roomId: playerData.location, itemId: drop.id, name: itemInfo.name, droppedBy: "SYSTEM", timestamp: serverTimestamp()
                        });
                        UI.print(`${npc.name} 掉出了 ${itemInfo.name}。`, "system");
                    }
                }
            }
        }

        await addDoc(collection(db, "dead_npcs"), { 
            roomId: playerData.location, npcId: npc.id, index: npc.index, respawnTime: Date.now() + 300000 
        });
        
        // 刪除受傷紀錄 (因為已經死了)
        try {
            await deleteDoc(doc(db, "active_npcs", currentCombatState.uniqueId));
        } catch (e) { /* ignore */ }

        await updatePlayer(userId, { 
            "combat.potential": playerData.combat.potential,
            "combat.kills": playerData.combat.kills 
        });
        
    } catch (err) {
        console.error("Handle Kill Reward Error:", err);
    } finally {
        CombatSystem.stopCombat(userId);
        MapSystem.look(playerData); 
    }
}

// 戰鬥邏輯迴圈 (Recursive Async Function)
// 邏輯變更：每回合 讀取(Firebase) -> 計算 -> 寫入(Firebase) -> 等待 -> 下一回合
async function combatLoop(playerData, userId, combatState, sessionId) {
    // 0. 基本檢查
    if (!isFighting || currentCombatSessionId !== sessionId) return;
    if (playerData.location !== combatState.roomId) {
        UI.print("你已經離開了戰場。", "system");
        CombatSystem.stopCombat(userId);
        return;
    }

    const { targetId, targetIndex, uniqueId, maxNpcHp, npcName, isLethal } = combatState;
    const npc = NPCDB[targetId];

    // === Step 1: 讀取最新狀態 (從 DB 獲取上一回合結果) ===
    const npcState = await fetchNpcState(uniqueId, maxNpcHp);
    let currentNpcHp = npcState.hp;
    let npcIsUnconscious = npcState.isUnconscious;

    // 如果對手已經死亡 (hp <= 0 且 lethal) 或昏迷 (hp <= 0 且 !lethal)
    // 這裡做個前置檢查，如果是別人把怪打死/打暈了
    if (currentNpcHp <= 0) {
        if (!isLethal) {
            // 切磋模式：對方已經倒了
            UI.print(`${npcName} 已經倒在地上，勝負已分。`, "system");
            CombatSystem.stopCombat(userId);
            return;
        } else {
             // 殺戮模式：如果怪已經死了(通常會被移除 active_npcs)，這裡視為昏迷
             // 繼續下面的邏輯，讓玩家補最後一刀或處理屍體
             npcIsUnconscious = true;
        }
    }

    const playerStats = getCombatStats(playerData);
    const npcStats = getNPCCombatStats(npc);

    // === Step 2: 雙方攻防計算 ===

    // --- 2a. 玩家攻擊 NPC ---
    if (!playerData.isUnconscious) {
        // 內力計算
        const enforceLevel = playerData.combat.enforce || 0;
        let forceBonus = 0;
        let actualCost = 0;
        if (enforceLevel > 0) {
            const forceSkill = playerData.skills.force || 0;
            const maxForce = playerData.attributes.maxForce || 10;
            const consumptionRate = 0.3; 
            let idealCost = Math.floor(maxForce * (enforceLevel / 10) * consumptionRate);
            if (idealCost < 1) idealCost = 1; 
            actualCost = Math.min(playerData.attributes.force, idealCost);
            if (actualCost > 0) {
                playerData.attributes.force -= actualCost; 
                const efficiency = 1.0 + (forceSkill / 100);
                let multiplier = 0.5; 
                if (playerStats.atkType === 'unarmed') multiplier = 0.8; 
                forceBonus = Math.floor(actualCost * efficiency * multiplier);
            }
        }

        // 決定招式敘述
        let enabledType = playerData.enabled_skills && playerData.enabled_skills[playerStats.atkType];
        let activeSkillId = enabledType || playerStats.atkType;
        let skillInfo = SkillDB[activeSkillId];
        let action = { msg: "$P對$N發起攻擊。", damage: 10 };
        if (skillInfo && skillInfo.actions && skillInfo.actions.length > 0) {
            action = skillInfo.actions[Math.floor(Math.random() * skillInfo.actions.length)];
        }
        let skillBaseDmg = action.damage || 10;
        let msg = action.msg
            .replace(/\$P/g, playerData.name)
            .replace(/\$N/g, npcName)
            .replace(/\$w/g, playerStats.weaponData ? playerStats.weaponData.name : "雙手");

        // 命中判定
        const pHitChance = Math.random() * (playerStats.hit + npcStats.dodge);
        // 如果 NPC 昏迷，必定命中
        const isHit = npcIsUnconscious ? true : (pHitChance < playerStats.hit);

        const finalMsg = UI.txt(msg, "#ffff00");
        UI.print(finalMsg, "system", true);
        MessageSystem.broadcast(playerData.location, finalMsg);

        if (isHit) {
            let damage = playerStats.ap - npcStats.dp;
            damage += ((skillBaseDmg * (playerStats.atkRating || 1.0)) / 2); 
            damage += forceBonus;
            damage = damage * (0.9 + Math.random() * 0.2);
            if (damage <= 0) damage = Math.random() * 5 + 1;
            
            // 切磋模式傷害減半
            if (!isLethal) damage = damage / 2;
            damage = Math.round(damage) || 1;

            // 扣除 NPC 血量 (暫存於變數)
            currentNpcHp -= damage;

            let damageMsg = `(造成了 ${damage} 點傷害)`;
            if (forceBonus > 0) damageMsg = `(運功消耗 ${actualCost} 內力，造成了 ${damage} 點傷害)`;
            UI.print(damageMsg, "chat");

            // 顯示受傷狀態
            const statusMsg = getStatusDesc(npcName, currentNpcHp, maxNpcHp);
            if (statusMsg) {
                UI.print(statusMsg, "chat", true);
                MessageSystem.broadcast(playerData.location, statusMsg);
            }
        } else {
            const dodgeMsg = UI.txt(`${npcName} 身形一晃，閃過了你的攻擊！`, "#aaa");
            UI.print(dodgeMsg, "chat", true);
            MessageSystem.broadcast(playerData.location, dodgeMsg);
        }
    } else {
        UI.print("你現在暈頭轉向，根本無法攻擊！", "error");
    }

    // --- 2b. NPC 反擊 玩家 ---
    // 只有在 NPC 活著且清醒時才反擊
    if (!npcIsUnconscious && currentNpcHp > 0) {
        let npcMsg = UI.txt(`${npcName} 往 ${playerData.name} 撲了過來！`, "#ff5555");
        const nHitChance = Math.random() * (npcStats.hit + playerStats.dodge);
        const nIsHit = playerData.isUnconscious ? true : (nHitChance < npcStats.hit);
        
        UI.print(npcMsg, "system", true);
        MessageSystem.broadcast(playerData.location, npcMsg);

        if (nIsHit) {
            let dmg = npcStats.ap - playerStats.dp;
            if (dmg <= 0) dmg = Math.random() * 3 + 1;
            if (!isLethal) dmg = dmg / 2;
            dmg = Math.round(dmg) || 1;

            playerData.attributes.hp -= dmg;
            UI.print(`(你受到了 ${dmg} 點傷害)`, "chat");

            const statusMsg = getStatusDesc("你", playerData.attributes.hp, playerData.attributes.maxHp);
            if (statusMsg) {
                UI.print(statusMsg, "chat", true);
                MessageSystem.broadcast(playerData.location, getStatusDesc(playerData.name, playerData.attributes.hp, playerData.attributes.maxHp));
            }
        } else {
            const dodgeMsg = getDodgeMessage(playerData, npcName);
            UI.print(dodgeMsg, "chat", true);
            MessageSystem.broadcast(playerData.location, dodgeMsg);
        }
    } else if (currentNpcHp <= 0 && !npcIsUnconscious) {
        // 剛被打暈/打死，這回合無法反擊
    } else if (npcIsUnconscious) {
        if(Math.random() < 0.3) UI.print(UI.txt(`${npcName} 倒在地上，毫無反抗之力。`, "#888"), "chat", true);
    }

    // === Step 3: 立即寫入結果 (雙方) ===
    // 判斷 NPC 新狀態
    let newIsUnconscious = npcIsUnconscious;
    if (currentNpcHp <= 0) {
        currentNpcHp = 0;
        newIsUnconscious = true; // 血量歸零視為昏迷 (無論是否 lethal，先標記無法行動)
    }

    // 3a. 寫入 NPC 狀態
    await syncNpcState(uniqueId, currentNpcHp, maxNpcHp, combatState.roomId, npcName, newIsUnconscious);

    // 3b. 寫入 玩家 狀態
    // 玩家如果血量 <= 0，標記昏迷
    if (playerData.attributes.hp <= 0) {
        playerData.attributes.hp = 0;
        playerData.isUnconscious = true;
    }
    
    await updatePlayer(userId, { 
        "attributes.hp": playerData.attributes.hp,
        "attributes.force": playerData.attributes.force,
        "isUnconscious": playerData.isUnconscious
    });
    
    UI.updateHUD(playerData);

    // === Step 4: 判定戰鬥結果 ===
    
    // 4a. 判斷 NPC 結局
    if (currentNpcHp <= 0) {
        if (!isLethal) {
            // Fight 模式：勝利，NPC 昏迷
            const winMsg = UI.txt(`${npcName} 拱手說道：「佩服佩服，是在下輸了。」`, "#00ff00", true);
            UI.print(winMsg, "chat", true);
            MessageSystem.broadcast(playerData.location, winMsg);

            playerData.combat.potential = (playerData.combat.potential || 0) + 10;
            CombatSystem.stopCombat(userId);
            await updatePlayer(userId, { "combat.potential": playerData.combat.potential });
            return; // 結束戰鬥
        } else {
            // Kill 模式：繼續攻擊直到殺死
            // 這裡邏輯設定為：當 hp <= 0 後，下一次攻擊會觸發處決 (或者此回合直接處決)
            // 為了符合 "繼續攻擊" 的感覺，我們直接在這裡執行死亡結算
            const uncMsg = UI.txt(`${npcName} 搖頭晃腦，腳步踉蹌，咚的一聲倒在地上，動彈不得！`, "#888");
            UI.print(uncMsg, "system", true);
            MessageSystem.broadcast(playerData.location, uncMsg);
            
            // 執行擊殺獎勵與屍體處理
            await handleKillReward(npc, playerData, combatState, userId);
            return; // 結束戰鬥
        }
    }

    // 4b. 判斷 玩家 結局
    if (playerData.attributes.hp <= 0) {
        if (!isLethal) {
            // Fight 模式：玩家輸了，跳出戰圈
            const loseMsg = UI.txt("你眼前一黑，知道自己輸了，連忙跳出戰圈。", "#ffaa00", true);
            UI.print(loseMsg, "system", true);
            MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 敗下陣來，跳出了戰圈。`, "#ffaa00", true));
            CombatSystem.stopCombat(userId);
            return;
        } else {
            // Kill 模式：玩家昏迷或死亡
            // 這裡簡化處理：如果之前沒暈，先暈；如果已經暈了又被打，死。
            // 但因為上方已經設定 isUnconscious = true，這裡直接判死或暈
            
            // 這裡做一個簡單判定：如果已經是昏迷狀態進來又被打到 0 (其實已經是0了)，就死
            // 但為了體驗，我們先讓玩家昏迷
            const uncMsg = UI.txt("你只覺天旋地轉，站立不穩，咚的一聲倒在地上...", "#ff8800", true);
            UI.print(uncMsg, "system", true);
            MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 晃了晃，一頭栽倒在地上。`, "#ff8800", true));
            
            // 如果這是一場致命戰鬥，玩家血量歸零通常意味著被殺死 (或等待被殺)
            // 在 MUD 中通常是暈倒後，對手再補一刀才會死，或者直接死
            // 這裡採用：直接死亡
            UI.print(UI.txt("這致命的一擊奪走了你最後的生機！", "#ff0000", true), "system", true);
            await handlePlayerDeath(playerData, userId);
            return;
        }
    }

    // === Step 5: 準備下一回合 (setTimeout) ===
    // 只有在雙方都還能打 (或 Kill 模式下 NPC 還沒死透) 時繼續
    setTimeout(() => {
        combatLoop(playerData, userId, combatState, sessionId);
    }, 2000);
}

export const CombatSystem = {
    getDifficultyInfo, 

    stopCombat: (userId) => {
        isFighting = false;
        currentCombatSessionId++; // 改變 Session ID 讓舊的 Loop 停止
        if (userId) updatePlayer(userId, { state: 'normal', combatTarget: null });
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
        
        // 初始讀取 NPC 狀態
        const npcState = await fetchNpcState(uniqueId, npc.combat.maxHp);
        let realHp = npcState.hp;
        npc.combat.hp = realHp; 

        const diffInfo = getDifficultyInfo(playerData, npc.id);
        
        // 戰鬥前檢查
        if (realHp <= 0) {
            if (isLethal) {
                // 對昏迷者下殺手，直接處決
                const killMsg = UI.txt(`你對昏迷中的 ${npc.name} 下了毒手！`, "#ff0000", true);
                UI.print(killMsg, "system", true);
                
                const killState = {
                    targetId: npc.id, targetIndex: npc.index, uniqueId: uniqueId,
                    npcHp: 0, maxNpcHp: npc.combat.maxHp, npcName: npc.name, roomId: playerData.location,
                    diffRatio: diffInfo.ratio
                };
                
                await handleKillReward(npc, playerData, killState, userId);
                return;
            } else {
                UI.print(`${npc.name} 已經昏迷不醒，無法和你切磋。`, "error");
                return;
            }
        }
    
        const combatType = isLethal ? "下殺手" : "切磋";
        const color = isLethal ? "#ff0000" : "#ff8800";
        const startMsg = UI.txt(`你對 ${npc.name} ${combatType}！戰鬥開始！`, color, true);
        UI.print(startMsg, "system", true);
        
        const initStatus = getStatusDesc(npc.name, realHp, npc.combat.maxHp);
        if (initStatus) UI.print(initStatus, "chat", true);

        MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 對 ${npc.name} ${combatType}，大戰一觸即發！`, color, true));
        
        // 設定戰鬥狀態
        const combatState = {
            targetId: npc.id,
            targetIndex: npc.index,
            uniqueId: uniqueId, 
            npcHp: realHp, // 初始值，Loop 內會更新
            maxNpcHp: npc.combat.maxHp,
            npcName: npc.name,
            roomId: playerData.location, 
            npcIsUnconscious: false,
            isLethal: isLethal,
            diffRatio: diffInfo.ratio
        };
    
        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: npc.id, index: npc.index } 
        });

        // 啟動迴圈
        isFighting = true;
        currentCombatSessionId++; // 確保舊的 Loop 不會干擾
        combatLoop(playerData, userId, combatState, currentCombatSessionId);
    }
};