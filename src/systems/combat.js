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

let combatInterval = null;
let combatList = []; 

function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

// [修正] 增加 npcId 參數，確保資料庫存有原始 ID，這對 AOE 鎖定目標至關重要
async function syncNpcState(uniqueId, currentHp, maxHp, roomId, npcName, targetId, isUnconscious = false, busyTime = 0, npcId = null) {
    try {
        const ref = doc(db, "active_npcs", uniqueId);
        const data = {
            currentHp: currentHp,
            maxHp: maxHp,
            roomId: roomId,
            npcName: npcName,
            targetId: targetId, 
            isUnconscious: isUnconscious,
            busy: busyTime,
            lastCombatTime: Date.now()
        };
        // 如果有傳入 npcId 就存進去，方便後續查找
        if (npcId) data.npcId = npcId;

        await setDoc(ref, data, { merge: true });
    } catch (e) {
        console.error("同步 NPC 狀態失敗", e);
    }
}

async function fetchNpcState(uniqueId, defaultMaxHp) {
    try {
        const ref = doc(db, "active_npcs", uniqueId);
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            const now = Date.now();
            // 檢查是否超時 (5分鐘無戰鬥則視為無效)
            if (now - data.lastCombatTime > 300000) {
                await deleteDoc(ref);
                return { hp: defaultMaxHp, busy: 0 };
            } else {
                return { hp: data.currentHp, busy: data.busy || 0 };
            }
        }
    } catch (e) {
        console.error("讀取 NPC 狀態失敗", e);
    }
    return { hp: defaultMaxHp, busy: 0 };
}

function getNPCCombatStats(npc) {
    let maxSkill = 0;
    let rating = 1.0; 
    let bestSkillId = 'unarmed';

    if (npc.skills) {
        for (const [sid, lvl] of Object.entries(npc.skills)) {
            const sInfo = SkillDB[sid];
            if (lvl > maxSkill) {
                maxSkill = lvl;
                bestSkillId = sid;
                if (sInfo && sInfo.rating) rating = sInfo.rating;
            }
        }
    }
    const str = npc.attributes?.str || 20;
    const con = npc.attributes?.con || 20;
    const per = npc.attributes?.per || 20;
    
    const ap = (str * 2.5) + (maxSkill * 5 * rating) + (npc.combat.attack || 0);
    const dp = (con * 2.5) + (maxSkill * 2) + (npc.combat.defense || 0);
    const hit = (per * 2.5) + (maxSkill * 3 * rating);
    const dodge = (per * 2.5) + (maxSkill * 4);

    return { ap, dp, hit, dodge, atkType: bestSkillId, effAtkSkill: maxSkill, rating };
}

function calculateCombatPower(stats) {
    return stats.ap + stats.dp + stats.hit + stats.dodge;
}

export function getDifficultyInfo(playerData, npcId) {
    const npc = NPCDB[npcId];
    if (!npc) return { color: "#fff", ratio: 1 };

    const pStats = getCombatStats(playerData);
    const nStats = getNPCCombatStats(npc);
    const pPower = calculateCombatPower(pStats);
    const nPower = calculateCombatPower(nStats);
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

function getSkillActionMsg(attacker, defenderName, isPlayer, attackerNameOverride = null) {
    let skillId = 'unarmed';
    let weaponName = '拳頭';

    if (isPlayer) {
        const weaponId = attacker.equipment?.weapon;
        if (weaponId && ItemDB[weaponId]) {
            weaponName = ItemDB[weaponId].name;
            const wType = ItemDB[weaponId].type;
            skillId = wType;
        }
        if (attacker.enabled_skills && attacker.enabled_skills[skillId]) {
            skillId = attacker.enabled_skills[skillId];
        } else if (attacker.enabled_skills && attacker.enabled_skills['unarmed'] && !weaponId) {
            skillId = attacker.enabled_skills['unarmed'];
        }
    } else {
        const stats = getNPCCombatStats(attacker);
        skillId = stats.atkType;
        weaponName = "兵刃"; 
    }

    const finalAttackerName = attackerNameOverride || attacker.name;
    const skillData = SkillDB[skillId];

    if (!skillData || !skillData.actions || skillData.actions.length === 0) {
        if (skillData && skillData.base && SkillDB[skillData.base] && SkillDB[skillData.base].actions) {
             const baseActions = SkillDB[skillData.base].actions;
             const action = baseActions[Math.floor(Math.random() * baseActions.length)];
             return parseActionMsg(action.msg, finalAttackerName, defenderName, weaponName);
        }
        return `${finalAttackerName} 對 ${defenderName} 發起了一次攻擊！`;
    }

    const action = skillData.actions[Math.floor(Math.random() * skillData.actions.length)];
    return parseActionMsg(action.msg, finalAttackerName, defenderName, weaponName);
}

function parseActionMsg(msg, attackerName, defenderName, weaponName) {
    return msg.replace(/\$P/g, attackerName).replace(/\$N/g, defenderName).replace(/\$w/g, weaponName);
}

function getDodgeMessage(entity, attackerName, entityNameOverride = null) {
    let msg = `$N身形一晃，閃過了$P的攻擊！`; 
    let activeDodge = null;
    if (entity.enabled_skills && entity.enabled_skills.dodge) {
        activeDodge = entity.enabled_skills.dodge;
    }

    if (activeDodge && SkillDB[activeDodge] && SkillDB[activeDodge].dodge_actions) {
        const actions = SkillDB[activeDodge].dodge_actions;
        msg = actions[Math.floor(Math.random() * actions.length)];
    }

    const finalName = entityNameOverride || entity.name || "你";
    return UI.txt(msg.replace(/\$N/g, finalName).replace(/\$P/g, attackerName), "#aaa");
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
    delete playerData.isUnconscious;
    playerData.isUnconscious = false;
    delete playerData.busy; // 清除 busy
    
    playerData.location = deathLocation; 

    await updatePlayer(userId, {
        location: deathLocation,
        skills: playerData.skills,
        attributes: playerData.attributes,
        state: 'normal',
        combatTarget: null,
        isUnconscious: false,
        busy: 0,
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

// [修改] 導出此函數，讓 PerformSystem 也能使用
export async function findAliveNPC(roomId, targetId, targetIndex = 1) {
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
        } else {
            deleteDoc(doc.ref);
        }
    });

    let matchCount = 0;
    for (let i = 0; i < room.npcs.length; i++) {
        if (room.npcs[i] === targetId) {
            matchCount++;
            
            if (matchCount === targetIndex) {
                if (!deadIndices.includes(i)) {
                    const npcData = NPCDB[targetId];
                    return { ...npcData, index: i, isUnconscious: false }; 
                } else {
                    return null;
                }
            }
        }
    }
    return null;
}

// [修改] 處理擊殺獎勵 (導出以供 perform 使用)
export async function handleKillReward(npc, playerData, enemyState, userId) {
    try {
        const deadMsg = UI.txt(`${npc.name} 慘叫一聲，被你結果了性命。`, "#ff0000", true);
        UI.print(deadMsg, "system", true);
        MessageSystem.broadcast(playerData.location, UI.txt(`${npc.name} 被 ${playerData.name} 殺死了。`, "#ff0000", true));
        
        const playerLvl = getLevel(playerData);
        const npcLvl = getLevel(npc); 
        let potGain = 100 + ((npcLvl - playerLvl) * 10);
        if (potGain < 10) potGain = 10;

        const ratio = enemyState.diffRatio || 1;
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
            roomId: playerData.location, 
            npcId: npc.id, 
            index: npc.index, 
            respawnTime: Date.now() + 180000 
        });
        
        try {
            await deleteDoc(doc(db, "active_npcs", enemyState.uniqueId));
        } catch (e) { /* ignore */ }

        await updatePlayer(userId, { 
            "combat.potential": playerData.combat.potential,
            "combat.kills": playerData.combat.kills 
        });
        
    } catch (err) {
        console.error("Handle Kill Reward Error:", err);
    } 
}

export const CombatSystem = {
    getDifficultyInfo, 
    handleKillReward, // 導出

    // [新增] 絕招打擊處理核心
    handlePerformHit: async (playerData, userId, targetId, targetIndex, performData, damageBase) => {
        // 1. 確認目標是 NPC 還是玩家 (暫時只支援打 NPC)
        let npc = await findAliveNPC(playerData.location, targetId, targetIndex);
        if (!npc) {
            UI.print("你的目標已經不在那裡了。", "error");
            return;
        }

        const uniqueId = getUniqueNpcId(playerData.location, npc.id, npc.index);
        const npcState = await fetchNpcState(uniqueId, npc.combat.maxHp);
        npc.combat.hp = npcState.hp;
        
        if (npc.combat.hp <= 0) {
            UI.print(`${npc.name} 已經倒下了。`, "system");
            return;
        }

        // 顯示絕招描述
        const msg = performData.msg(playerData.name, npc.name);
        UI.print(msg, "chat", true);
        MessageSystem.broadcast(playerData.location, msg);

        // 準備多重打擊
        let hits = performData.hits || 1;
        
        // 準備狀態效果 (Debuff)
        let applyDebuff = false;
        if (performData.type === 'buff_debuff' && performData.effect === 'busy') {
            applyDebuff = true;
        }

        // 開始打擊循環
        for (let i = 0; i < hits; i++) {
            let dmg = Math.floor(damageBase);
            dmg = Math.floor(dmg * (0.9 + Math.random() * 0.2)); // 浮動

            // 扣除 NPC 血量
            npc.combat.hp -= dmg;
            
            // 顯示單次傷害訊息
            if (hits > 1) {
                UI.print(UI.txt(`(第 ${i+1} 擊造成的傷害: ${dmg})`, "#ffff00"), "system", true);
            } else {
                UI.print(UI.txt(`(造成了 ${dmg} 點傷害)`, "#ffff00"), "system", true);
            }

            // 死亡判定
            if (npc.combat.hp <= 0) {
                npc.combat.hp = 0;
                // [修正] 擊殺時同時寫入 npcId
                await syncNpcState(uniqueId, 0, npc.combat.maxHp, playerData.location, npc.name, null, true, 0, npc.id);
                
                // 觸發獎勵
                const diffInfo = getDifficultyInfo(playerData, npc.id);
                const enemyState = { uniqueId: uniqueId, diffRatio: diffInfo.ratio };
                
                await handleKillReward(npc, playerData, enemyState, userId);
                return; // 目標已死，停止後續連擊
            }
        }

        // 應用狀態效果
        let busyTime = npcState.busy || 0;
        if (applyDebuff) {
            const duration = (performData.duration || 3) * 1000;
            busyTime = Date.now() + duration;
            UI.print(UI.txt(`${npc.name} 被你的招式驚得手足無措！`, "#ff5555"), "chat", true);
            MessageSystem.broadcast(playerData.location, UI.txt(`${npc.name} 陷入了混亂！`, "#ff5555", true));
        }

        // 更新 NPC 最終狀態 (血量 + Busy)
        // [修正] 確保寫入 npcId
        await syncNpcState(uniqueId, npc.combat.hp, npc.combat.maxHp, playerData.location, npc.name, userId, false, busyTime, npc.id);

        // 自動觸發戰鬥狀態 (如果還沒開始)
        CombatSystem.fight(playerData, [npc.id, targetIndex], userId);
    },

    stopCombat: async (userId) => {
        if (combatInterval) {
            clearInterval(combatInterval);
            combatInterval = null;
        }

        // 遍歷當前戰鬥列表，解除所有 NPC 的鎖定狀態
        if (combatList.length > 0) {
            const cleanupPromises = combatList.map(async (enemy) => {
                if (enemy.type === 'pve' && enemy.uniqueId) {
                    // [修正] 清除目標時保留 npcId
                    await syncNpcState(enemy.uniqueId, enemy.npcHp, enemy.maxNpcHp, enemy.roomId, enemy.npcName, null, enemy.npcIsUnconscious, 0, enemy.targetId);
                }
            });
            try { await Promise.all(cleanupPromises); } catch(e) {}
        }

        combatList = []; 
        if (userId) updatePlayer(userId, { state: 'normal', combatTarget: null });
    },

    kill: async (playerData, args, userId) => {
        CombatSystem.startCombat(playerData, args, userId, true);
    },

    fight: async (playerData, args, userId) => {
        CombatSystem.startCombat(playerData, args, userId, false);
    },

    acceptDuel: async (playerData, args, userId) => {
        const playerRef = doc(db, "players", userId);
        const playerSnap = await getDoc(playerRef);
        if (!playerSnap.exists()) return;
        const freshData = playerSnap.data();

        if (!freshData.duelRequest) { 
            UI.print("目前沒有人想跟你切磋。", "error"); 
            return; 
        }
        
        const requesterId = freshData.duelRequest.from;
        const requesterName = freshData.duelRequest.name;
        
        await updatePlayer(userId, { duelRequest: null });
        UI.print(`你接受了 ${requesterName} 的切磋請求！`, "system");
        
        const reqDoc = await getDoc(doc(db, "players", requesterId));
        if(!reqDoc.exists()) { UI.print("對方似乎離開了江湖。", "error"); return; }
        const reqData = reqDoc.data();

        if (reqData.location !== playerData.location) { UI.print("對方已經不在這裡了。", "error"); return; }

        CombatSystem.startPvPCombat(playerData, userId, reqData, requesterId);
    },

    rejectDuel: async (playerData, args, userId) => {
        const playerRef = doc(db, "players", userId);
        const playerSnap = await getDoc(playerRef);
        if (!playerSnap.exists()) return;
        const freshData = playerSnap.data();

        if (!freshData.duelRequest) { UI.print("目前沒有人想跟你切磋。", "error"); return; }
        
        const name = freshData.duelRequest.name;
        await updatePlayer(userId, { duelRequest: null });
        UI.print(`你拒絕了 ${name} 的切磋請求。`, "system");
        MessageSystem.broadcast(playerData.location, `${playerData.name} 拒絕了 ${name} 的切磋請求。`);
    },

    checkAggro: async (playerData, roomId, userId) => {
        const room = MapSystem.getRoom(roomId);
        if (!room || !room.npcs || room.safe) return;
        
        const deadRef = collection(db, "dead_npcs");
        const q = query(deadRef, where("roomId", "==", roomId));
        const deadSnaps = await getDocs(q);
        const deadIndices = new Set();
        const now = Date.now();
        deadSnaps.forEach(d => {
            if (now < d.data().respawnTime) deadIndices.add(d.data().index);
        });

        const aggroTargets = [];
        for (let i = 0; i < room.npcs.length; i++) {
            if (deadIndices.has(i)) continue; 
            const npcId = room.npcs[i];
            const npcData = NPCDB[npcId];
            if (npcData && npcData.aggro) {
                aggroTargets.push({ ...npcData, index: i });
            }
        }

        if (aggroTargets.length > 0) {
            UI.print(UI.txt("你感覺到一股殺氣！周圍的野獸盯上了你！", "#ff0000", true), "system", true);
            for (const target of aggroTargets) {
                 await CombatSystem.startCombat(playerData, [target.id], userId, true, target); 
            }
        }
    },

    startCombat: async (playerData, args, userId, isLethal, specificNpc = null) => {
        if (playerData.state === 'exercising') {
            UI.print("你正在專心修練，無法戰鬥！(輸入 autoforce 解除)", "error");
            return;
        }

        if (args.length === 0 && !specificNpc) { UI.print("你想對誰動手？", "error"); return; }
        
        const room = MapSystem.getRoom(playerData.location);
        if (room.safe) { UI.print("這裡是安全區，禁止動武。", "error"); return; }
        
        const targetId = args[0];
        const targetIndex = args.length > 1 ? parseInt(args[1]) : 1;

        if (!specificNpc) {
             const playersRef = collection(db, "players");
             const q = query(playersRef, where("id", "==", targetId), where("location", "==", playerData.location));
             const pSnap = await getDocs(q);
             
             if (!pSnap.empty) {
                 const targetDoc = pSnap.docs[0];
                 const targetData = targetDoc.data();
                 if (targetData.id === playerData.id) { UI.print("你不能攻擊自己！", "error"); return; }
                 if (isLethal) { UI.print("上天有好生之德，目前系統禁止對玩家下殺手 (Kill)。請使用 Fight 切磋。", "error"); return; }
 
                 UI.print(`你向 ${targetData.name} 發出了切磋請求...`, "system");
                 MessageSystem.broadcast(playerData.location, `${playerData.name} 想找 ${targetData.name} 切磋武藝。${UI.txt(" (請輸入 y 接受)", "#00ff00")}`);
                 await updatePlayer(targetDoc.id, { 
                     duelRequest: { from: userId, name: playerData.name, timestamp: Date.now() } 
                 });
                 return;
             }
        }

        let npc = specificNpc;
        if (!npc) npc = await findAliveNPC(playerData.location, targetId, targetIndex);
        if (!npc) { UI.print("這裡沒有這個人，或者他已經倒下了。", "error"); return; }

        const uniqueId = getUniqueNpcId(playerData.location, npc.id, npc.index);
        
        const alreadyFighting = combatList.find(c => c.uniqueId === uniqueId);
        if (alreadyFighting) {
            UI.print(`你已經在和 ${npc.name} 戰鬥了！`, "system");
            await updatePlayer(userId, { combatTarget: { id: npc.id, index: npc.index } });
            return;
        }

        const npcState = await fetchNpcState(uniqueId, npc.combat.maxHp);
        const realHp = npcState.hp;
        npc.combat.hp = realHp; 

        const diffInfo = getDifficultyInfo(playerData, npc.id);
        
        if (realHp <= 0) {
            if (isLethal) {
                const killMsg = UI.txt(`你對昏迷中的 ${npc.name} 下了毒手！`, "#ff0000", true);
                UI.print(killMsg, "system", true);
                const tempState = {
                    targetId: npc.id, targetIndex: npc.index, uniqueId: uniqueId,
                    npcHp: 0, maxNpcHp: npc.combat.maxHp, npcName: npc.name, roomId: playerData.location,
                    diffRatio: diffInfo.ratio
                };
                await handleKillReward(npc, playerData, tempState, userId);
                return;
            } else {
                UI.print(`${npc.name} 已經昏迷不醒，無法和你切磋。`, "error");
                return;
            }
        }
    
        const combatType = isLethal ? "下殺手" : "切磋";
        const color = isLethal ? "#ff0000" : "#ff8800";
        
        if (combatList.length === 0) {
             const startMsg = UI.txt(`你對 ${npc.name} ${combatType}！戰鬥開始！`, color, true);
             UI.print(startMsg, "system", true);
             MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 對 ${npc.name} ${combatType}，大戰一觸即發！`, color, true));
        } else {
             UI.print(UI.txt(`${npc.name} 加入了戰團！`, "#ff5555", true), "system", true); 
             MessageSystem.broadcast(playerData.location, UI.txt(`${npc.name} 對 ${playerData.name} 發起了攻擊！`, "#ff5555", true));
        }
        
        const initStatus = getStatusDesc(npc.name, realHp, npc.combat.maxHp);
        if (initStatus) UI.print(initStatus, "chat", true);

        const enemyState = {
            type: 'pve', targetId: npc.id, targetIndex: npc.index, uniqueId: uniqueId, 
            npcHp: npc.combat.hp, maxNpcHp: npc.combat.maxHp, npcName: npc.name,
            roomId: playerData.location, npcIsUnconscious: false,
            isLethal: isLethal, diffRatio: diffInfo.ratio, npcObj: npc,
            busy: npcState.busy // [新增]
        };
        
        combatList.push(enemyState);
    
        // [修正] 傳入 npc.id
        await syncNpcState(uniqueId, realHp, npc.combat.maxHp, playerData.location, npc.name, userId, false, npcState.busy, npc.id);

        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: npc.id, index: npc.index } 
        });
    
        if (!combatInterval) {
            CombatSystem.runCombatLoop(playerData, userId);
        }
    },

    startPvPCombat: async (playerData, userId, targetData, targetId) => {
        MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 與 ${targetData.name} 接受了切磋，兩人拉開架式！`, "#ff8800", true));
        
        combatList = [{
            type: 'pvp', targetId: targetId, targetName: targetData.name,
            targetHp: targetData.attributes.hp, targetMaxHp: targetData.attributes.maxHp, targetData: targetData 
        }];

        await updatePlayer(userId, { state: 'fighting', combatTarget: { id: targetData.id, type: 'player' } });
        await updatePlayer(targetId, { state: 'fighting', combatTarget: { id: playerData.id, type: 'player' } });

        if (combatInterval) clearInterval(combatInterval);
        CombatSystem.runCombatLoop(playerData, userId);
    },

    runCombatLoop: (playerData, userId) => {
        const combatRound = async () => {
            if (combatList.length === 0) { CombatSystem.stopCombat(userId); return; }
            
            try {
                const playerRef = doc(db, "players", userId);
                const playerSnap = await getDoc(playerRef);
                if (playerSnap.exists()) {
                    const freshData = playerSnap.data();
                    if (!playerData.combat) playerData.combat = {};
                    playerData.combat.enforce = freshData.combat?.enforce || 0; 
                    
                    if (freshData.attributes) playerData.attributes = freshData.attributes;
                    
                    // [新增] 同步 busy 狀態
                    playerData.busy = freshData.busy || 0;

                    if (freshData.equipment) playerData.equipment = freshData.equipment;
                    if (freshData.skills) playerData.skills = freshData.skills;
                    if (freshData.enabled_skills) playerData.enabled_skills = freshData.enabled_skills;
                    if (freshData.inventory) playerData.inventory = freshData.inventory;
                }
            } catch (e) {
                console.error("Sync player state error:", e);
            }

            const playerStats = getCombatStats(playerData);
            const now = Date.now();

            // --- 階段 1：玩家攻擊回合 ---
            
            // [新增] 玩家 Busy 檢查
            if (playerData.busy && now < playerData.busy) {
                // 如果被定身，跳過攻擊回合
                // 可以選擇是否印訊息，避免洗頻
            } else {
                const validTargets = combatList.filter(e => {
                    if (e.type === 'pve') return e.npcHp > 0 && !e.npcIsUnconscious;
                    if (e.type === 'pvp') return e.targetData.attributes.hp > 0 && !e.targetData.isUnconscious;
                    return false;
                });

                let currentTarget = null;
                if (validTargets.length > 0) {
                    const rndIndex = Math.floor(Math.random() * validTargets.length);
                    currentTarget = validTargets[rndIndex];
                }

                // 只有在有目標且沒被定身時才攻擊
                if (currentTarget) {
                    const applyEnforce = (baseDmg, pStats, pData) => {
                        const enforceLvl = pData.combat?.enforce || 0;
                        if (enforceLvl <= 0) return baseDmg;

                        const maxForce = pData.attributes.maxForce || 10;
                        const currentForce = pData.attributes.force || 0;
                        
                        const costPerLvl = maxForce * 0.02; 
                        let requiredForce = Math.floor(costPerLvl * enforceLvl);
                        
                        if (currentForce < requiredForce) {
                            return baseDmg;
                        }

                        pData.attributes.force -= requiredForce;

                        let coeff = 0.04; 
                        if (pStats.atkType === 'unarmed') coeff = 0.12; 
                        else if (pStats.atkType === 'throwing') coeff = 0.08; 
                        
                        const multiplier = 1 + (enforceLvl * coeff);
                        const rawBonus = requiredForce * 0.5; 

                        return Math.floor((baseDmg * multiplier) + rawBonus);
                    };

                    if (currentTarget.type === 'pve') {
                        if (playerData.location !== currentTarget.roomId) { CombatSystem.stopCombat(userId); return; }
                        const npc = currentTarget.npcObj;
                        const npcStats = getNPCCombatStats(npc); 
                
                        if (!playerData.isUnconscious) {
                            let dmg = Math.max(1, playerStats.ap - npcStats.dp);
                            dmg = Math.floor(dmg * (0.9 + Math.random() * 0.2));
                            
                            dmg = applyEnforce(dmg, playerStats, playerData);

                            const hitRate = playerStats.hit / (playerStats.hit + npcStats.dodge);
                            if (Math.random() < hitRate) {
                                const localMsg = getSkillActionMsg(playerData, currentTarget.npcName, true, "你");
                                const publicMsg = getSkillActionMsg(playerData, currentTarget.npcName, true, playerData.name);
                                
                                UI.print(localMsg, "chat", true);
                                MessageSystem.broadcast(playerData.location, publicMsg);

                                currentTarget.npcHp -= dmg;
                                // [修正] 傳入 npcId
                                await syncNpcState(currentTarget.uniqueId, currentTarget.npcHp, currentTarget.maxNpcHp, currentTarget.roomId, currentTarget.npcName, userId, false, currentTarget.busy, currentTarget.targetId);
                                
                                UI.print(UI.txt(`(你對 ${currentTarget.npcName} 造成 ${dmg} 點傷害)`, "#ffff00"), "chat", true);
                                
                                const statusMsg = getStatusDesc(currentTarget.npcName, currentTarget.npcHp, currentTarget.maxNpcHp);
                                if (statusMsg) {
                                    UI.print(statusMsg, "chat", true);
                                    MessageSystem.broadcast(playerData.location, statusMsg);
                                }
                                
                                if (currentTarget.npcHp <= 0) {
                                    currentTarget.npcHp = 0;
                                    currentTarget.npcIsUnconscious = true;
                                    // [修正] 擊殺時也傳入 npcId
                                    await syncNpcState(currentTarget.uniqueId, 0, currentTarget.maxNpcHp, currentTarget.roomId, currentTarget.npcName, null, true, 0, currentTarget.targetId);

                                    const removeIndex = combatList.indexOf(currentTarget);

                                    if (!currentTarget.isLethal) {
                                        const winMsg = UI.txt(`${currentTarget.npcName} 拱手說道：「佩服佩服，是在下輸了。」`, "#00ff00", true);
                                        UI.print(winMsg, "chat", true);
                                        MessageSystem.broadcast(playerData.location, winMsg);
                                        playerData.combat.potential = (playerData.combat.potential || 0) + 20;
                                        
                                        if (removeIndex > -1) combatList.splice(removeIndex, 1);
                                    } else {
                                         const uncMsg = UI.txt(`${currentTarget.npcName} 搖頭晃腦，咚的一聲倒在地上！`, "#888");
                                         UI.print(uncMsg, "system", true);
                                         await handleKillReward(npc, playerData, currentTarget, userId);
                                         
                                         if (removeIndex > -1) combatList.splice(removeIndex, 1);
                                    }
                                }
                            } else {
                                const localMsg = getSkillActionMsg(playerData, currentTarget.npcName, true, "你");
                                const publicMsg = getSkillActionMsg(playerData, currentTarget.npcName, true, playerData.name);
                                UI.print(localMsg, "chat", true);
                                MessageSystem.broadcast(playerData.location, publicMsg);

                                const localDodge = UI.txt(`${currentTarget.npcName} 身形一晃，閃過了你的攻擊！`, "#aaa");
                                const publicDodge = UI.txt(`${currentTarget.npcName} 身形一晃，閃過了${playerData.name}的攻擊！`, "#aaa");
                                UI.print(localDodge, "chat", true);
                                MessageSystem.broadcast(playerData.location, publicDodge);
                            }
                        }
                    } else if (currentTarget.type === 'pvp') {
                        // PvP 邏輯保持不變
                        const targetId = currentTarget.targetId;
                        const tDoc = await getDoc(doc(db, "players", targetId));
                        if (!tDoc.exists()) { CombatSystem.stopCombat(userId); return; }
                        const tData = tDoc.data();
                        currentTarget.targetData = tData;
                        const tStats = getCombatStats(tData);

                        if (!playerData.isUnconscious && tData.attributes.hp > 0) {
                            let dmg = Math.max(1, playerStats.ap - tStats.dp);
                            dmg = Math.floor(dmg * (0.8 + Math.random() * 0.4)); 
                            
                            dmg = applyEnforce(dmg, playerStats, playerData);
                            
                            const hitProb = playerStats.hit / (playerStats.hit + tStats.dodge);
                            if (Math.random() < hitProb) {
                                UI.print(getSkillActionMsg(playerData, tData.name, true, "你"), "chat", true);
                                tData.attributes.hp -= dmg;
                                
                                UI.print(UI.txt(`(你擊中了 ${tData.name}，造成 ${dmg} 點傷害)`, "#ffff00"), "chat", true);
                                
                                await updatePlayer(targetId, { "attributes.hp": tData.attributes.hp });
                                if (tData.attributes.hp <= 0) {
                                    UI.print(UI.txt(`戰鬥結束！${tData.name} 被你打暈了！`, "#00ff00", true), "system", true);
                                    MessageSystem.broadcast(playerData.location, UI.txt(`${tData.name} 在切磋中被 ${playerData.name} 打暈了！`, "#ffff00", true));
                                    await updatePlayer(targetId, { "attributes.hp": 0, isUnconscious: true, state: 'normal', combatTarget: null });
                                    CombatSystem.stopCombat(userId);
                                    return;
                                }
                            } else {
                                UI.print(getSkillActionMsg(playerData, tData.name, true, "你"), "chat", true);
                                UI.print(UI.txt(`${tData.name} 靈巧地閃過了你的攻擊！`, "#aaa"), "chat", true);
                            }
                        }
                    }
                }
            }

            // --- 階段 2：怪物反擊回合 ---
            for (const enemy of [...combatList]) {
                if (enemy.type === 'pve' && enemy.npcHp > 0) {
                     // [新增] 檢查怪物是否 Busy
                     if (enemy.busy && now < enemy.busy) {
                         // 怪物被定身，無法攻擊
                         continue;
                     }

                     const npc = enemy.npcObj;
                     const eStats = getNPCCombatStats(npc);
                     
                     const nHitChance = Math.random() * (eStats.hit + playerStats.dodge);
                     const nIsHit = playerData.isUnconscious ? true : (nHitChance < eStats.hit);
         
                     if (nIsHit) {
                         const localMsg = getSkillActionMsg(npc, "你", false);
                         const publicMsg = getSkillActionMsg(npc, playerData.name, false);
                         UI.print(localMsg, "chat", true);
                         MessageSystem.broadcast(playerData.location, publicMsg);
 
                         let dmg = eStats.ap - playerStats.dp;
                         if (dmg <= 0) dmg = Math.random() * 3 + 1;
                         
                         dmg = Math.round(dmg) || 1;
         
                         playerData.attributes.hp -= dmg;
                         
                         UI.print(UI.txt(`(你受到了 ${dmg} 點傷害)`, "#ff0000"), "chat", true);
                         
                         UI.updateHUD(playerData);
         
                         const statusMsg = getStatusDesc("你", playerData.attributes.hp, playerData.attributes.maxHp);
                         const publicStatusMsg = getStatusDesc(playerData.name, playerData.attributes.hp, playerData.attributes.maxHp);
                         if (statusMsg) {
                             UI.print(statusMsg, "chat", true);
                             MessageSystem.broadcast(playerData.location, publicStatusMsg);
                         }
         
                         if (playerData.attributes.hp <= 0) {
                             playerData.attributes.hp = 0;
                             playerData.isUnconscious = true;
                             UI.updateHUD(playerData); 
 
                             if (!enemy.isLethal) {
                                 const loseMsg = UI.txt("你眼前一黑，知道自己輸了，連忙跳出戰圈。", "#ffaa00", true);
                                 UI.print(loseMsg, "system", true);
                                 MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 敗下陣來，跳出了戰圈。`, "#ffaa00", true));
                                 CombatSystem.stopCombat(userId);
                                 await updatePlayer(userId, { "attributes.hp": 0, isUnconscious: true });
                                 return;
                             } else {
                                 if (!playerData.isUnconscious) {
                                     const uncMsg = UI.txt("你只覺天旋地轉，站立不穩，咚的一聲倒在地上...", "#ff8800", true);
                                     UI.print(uncMsg, "system", true);
                                     MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 晃了晃，一頭栽倒在地上。`, "#ff8800", true));
                                     await updatePlayer(userId, { "attributes.hp": 0, isUnconscious: true });
                                 } else {
                                     UI.print(UI.txt("這致命的一擊奪走了你最後的生機！", "#ff0000", true), "system", true);
                                     await handlePlayerDeath(playerData, userId);
                                     return; 
                                 }
                             }
                         }
                     } else {
                         const localMsg = getSkillActionMsg(npc, "你", false);
                         const publicMsg = getSkillActionMsg(npc, playerData.name, false);
                         UI.print(localMsg, "chat", true);
                         MessageSystem.broadcast(playerData.location, publicMsg);
 
                         const localDodge = getDodgeMessage(playerData, enemy.npcName, "你");
                         const publicDodge = getDodgeMessage(playerData, enemy.npcName, playerData.name);
                         UI.print(localDodge, "chat", true);
                         MessageSystem.broadcast(playerData.location, publicDodge);
                     }
                }
                // PVP 邏輯省略修改，原理相同
            }
    
            UI.updateHUD(playerData);
            if (combatList.length === 0) CombatSystem.stopCombat(userId);
            await updatePlayer(userId, { 
                "attributes.hp": playerData.attributes.hp, 
                "attributes.force": playerData.attributes.force 
            });
        };
    
        combatRound();
        combatInterval = setInterval(combatRound, 2500); 
    }
};