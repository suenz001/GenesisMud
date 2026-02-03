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
let combatList = []; // [修改] 改為陣列，存放多個 enemyState

function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

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
            if (now - data.lastCombatTime > 300000) {
                await deleteDoc(ref);
                return defaultMaxHp;
            } else {
                return data.currentHp;
            }
        }
    } catch (e) {
        console.error("讀取 NPC 狀態失敗", e);
    }
    return defaultMaxHp;
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
        } else {
            deleteDoc(doc.ref);
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
    }

    if (activeDodge && SkillDB[activeDodge] && SkillDB[activeDodge].dodge_actions) {
        const actions = SkillDB[activeDodge].dodge_actions;
        msg = actions[Math.floor(Math.random() * actions.length)];
    }

    return UI.txt(msg.replace(/\$N/g, entity.name || "你").replace(/\$P/g, attackerName), "#aaa");
}

async function handleKillReward(npc, playerData, enemyState, userId) {
    try {
        const deadMsg = UI.txt(`${npc.name} 慘叫一聲，被你結果了性命。`, "#ff0000", true);
        UI.print(deadMsg, "system", true);
        MessageSystem.broadcast(playerData.location, UI.txt(`${npc.name} 被 ${playerData.name} 殺死了。`, "#ff0000", true));
        
        const playerLvl = getLevel(playerData);
        const npcLvl = getLevel(npc); 
        let potGain = 100 + ((npcLvl - playerLvl) * 10);
        if (potGain < 10) potGain = 10;

        const ratio = enemyState.diffRatio;
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
    // [注意] 這裡不再呼叫 stopCombat，改由上層循環控制
}

export const CombatSystem = {
    getDifficultyInfo, 

    stopCombat: (userId) => {
        if (combatInterval) {
            clearInterval(combatInterval);
            combatInterval = null;
        }
        combatList = []; // [修改] 清空列表
        if (userId) updatePlayer(userId, { state: 'normal', combatTarget: null });
    },

    kill: async (playerData, args, userId) => {
        CombatSystem.startCombat(playerData, args, userId, true);
    },

    fight: async (playerData, args, userId) => {
        CombatSystem.startCombat(playerData, args, userId, false);
    },

    // === [新增] 檢查並觸發主動怪 ===
    checkAggro: async (playerData, roomId, userId) => {
        const room = MapSystem.getRoom(roomId);
        if (!room || !room.npcs || room.safe) return;
        
        // 先讀取已死亡名單，避免死怪攻擊
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
            if (deadIndices.has(i)) continue; // 跳過死人
            const npcId = room.npcs[i];
            const npcData = NPCDB[npcId];
            if (npcData && npcData.aggro) {
                // 必須保存 index，確保是特定那隻怪
                aggroTargets.push({ ...npcData, index: i });
            }
        }

        if (aggroTargets.length > 0) {
            UI.print(UI.txt("你感覺到一股殺氣！周圍的野獸盯上了你！", "#ff0000", true), "system", true);
            
            // 觸發多重戰鬥，將所有主動怪加入
            for (const t of aggroTargets) {
                // 主動怪都是下殺手 (isLethal = true)
                await CombatSystem.startCombat(playerData, [t.id], userId, true, t); 
            }
        }
    },

    // [修改] 支援加入多重戰鬥
    startCombat: async (playerData, args, userId, isLethal, specificNpc = null) => {
        if (args.length === 0 && !specificNpc) { UI.print("你想對誰動手？", "error"); return; }
        
        const room = MapSystem.getRoom(playerData.location);
        if (room.safe) { UI.print("這裡是安全區，禁止動武。", "error"); return; }
        
        let npc = specificNpc;
        if (!npc) {
            const targetId = args[0];
            npc = await findAliveNPC(playerData.location, targetId);
        }
    
        if (!npc) { UI.print("這裡沒有這個人，或者他已經倒下了。", "error"); return; }

        const uniqueId = getUniqueNpcId(playerData.location, npc.id, npc.index);
        
        // 檢查是否已經在戰鬥列表中
        const alreadyFighting = combatList.find(c => c.uniqueId === uniqueId);
        if (alreadyFighting) {
            // 如果已經在打，把它移到第一位 (切換目標)
            const idx = combatList.indexOf(alreadyFighting);
            if (idx > 0) {
                combatList.splice(idx, 1);
                combatList.unshift(alreadyFighting);
                UI.print(`你將目標轉向了 ${npc.name}！`, "system");
            }
            return;
        }

        const realHp = await fetchNpcState(uniqueId, npc.combat.maxHp);
        npc.combat.hp = realHp; 

        const diffInfo = getDifficultyInfo(playerData, npc.id);
        
        if (realHp <= 0) {
            if (isLethal) {
                const killMsg = UI.txt(`你對昏迷中的 ${npc.name} 下了毒手！`, "#ff0000", true);
                UI.print(killMsg, "system", true);
                
                // 暫時構建一個 state 傳給 handleKillReward
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
             // === [修正]：這裡補上了 true，確保 HTML 顏色代碼正確顯示 ===
             UI.print(UI.txt(`${npc.name} 加入了戰團！`, "#ff5555", true), "system", true); 
             MessageSystem.broadcast(playerData.location, UI.txt(`${npc.name} 對 ${playerData.name} 發起了攻擊！`, "#ff5555", true));
        }
        
        const initStatus = getStatusDesc(npc.name, realHp, npc.combat.maxHp);
        if (initStatus) UI.print(initStatus, "chat", true);

        const enemyState = {
            targetId: npc.id,
            targetIndex: npc.index,
            uniqueId: uniqueId, 
            npcHp: npc.combat.hp,
            maxNpcHp: npc.combat.maxHp,
            npcName: npc.name,
            roomId: playerData.location, 
            npcIsUnconscious: false,
            isLethal: isLethal,
            diffRatio: diffInfo.ratio,
            npcObj: npc // 保存原始數據
        };
        
        // 加入列表
        combatList.push(enemyState);
    
        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: npc.id, index: npc.index } 
        });
    
        if (combatInterval) clearInterval(combatInterval);
        
        // === 戰鬥迴圈 (Combat Loop) ===
        const combatRound = async () => {
            if (combatList.length === 0) { CombatSystem.stopCombat(userId); return; }
            
            // 1. 玩家攻擊回合 (攻擊列表第一個敵人)
            const currentTarget = combatList[0];
            
            if (playerData.location !== currentTarget.roomId) { CombatSystem.stopCombat(userId); return; }
    
            const playerStats = getCombatStats(playerData);
            const npc = currentTarget.npcObj;
            const npcStats = getNPCCombatStats(npc); 
    
            if (!playerData.isUnconscious) {
                // --- 玩家攻擊邏輯 (保持原樣) ---
                const enforceLevel = playerData.combat.enforce || 0;
                let forceBonus = 0;
                let actualCost = 0; 
                
                if (enforceLevel > 0) {
                    const forceSkill = playerData.skills.force || 0;
                    const maxForce = playerData.attributes.maxForce || 10;
                    const consumptionRate = 0.05; 
                    let idealCost = Math.floor(maxForce * (enforceLevel / 10) * consumptionRate);
                    if (idealCost < 1) idealCost = 1; 
                    actualCost = Math.min(playerData.attributes.force, idealCost);
                    if (actualCost > 0) {
                        playerData.attributes.force -= actualCost; 
                        const efficiency = 1.0 + (forceSkill / 100);
                        let multiplier = 0.5; 
                        if (playerStats.atkType === 'unarmed') multiplier = 0.8; 
                        forceBonus = Math.floor(actualCost * efficiency * multiplier);
                    } else {
                         if(Math.random() < 0.2) UI.print("你內力枯竭，無法運功加力！", "error");
                    }
                }

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
                    .replace(/\$N/g, currentTarget.npcName)
                    .replace(/\$w/g, playerStats.weaponData ? playerStats.weaponData.name : "雙手");
    
                const pHitChance = Math.random() * (playerStats.hit + npcStats.dodge);
                const isHit = currentTarget.npcIsUnconscious ? true : (pHitChance < playerStats.hit);
                
                const finalMsg = UI.txt(msg, "#ffff00");
                UI.print(finalMsg, "system", true); 
                MessageSystem.broadcast(playerData.location, finalMsg);
    
                if (isHit) {
                    let damage = playerStats.ap - npcStats.dp;
                    damage += ((skillBaseDmg * (playerStats.atkRating || 1.0)) / 2); 
                    damage += forceBonus;
                    damage = damage * (0.9 + Math.random() * 0.2);
                    if (damage <= 0) damage = Math.random() * 5 + 1;
                    if (!isLethal) damage = damage / 2;
                    damage = Math.round(damage) || 1;
    
                    currentTarget.npcHp -= damage;
                    
                    if (currentTarget.npcHp > 0) {
                        await syncNpcState(
                            currentTarget.uniqueId, 
                            currentTarget.npcHp, 
                            currentTarget.maxNpcHp, 
                            currentTarget.roomId,
                            currentTarget.npcName,
                            false 
                        );
                    }

                    let damageMsg = `(造成了 ${damage} 點傷害)`;
                    if (forceBonus > 0) damageMsg = `(運功消耗 ${actualCost} 內力，造成了 ${damage} 點傷害)`;
                    UI.print(damageMsg, "chat");
    
                    const statusMsg = getStatusDesc(currentTarget.npcName, currentTarget.npcHp, currentTarget.maxNpcHp);
                    if (statusMsg) {
                        UI.print(statusMsg, "chat", true);
                        MessageSystem.broadcast(playerData.location, statusMsg);
                    }
                    
                    // 檢查目標死亡
                    if (currentTarget.npcHp <= 0) {
                        currentTarget.npcHp = 0;
                        currentTarget.npcIsUnconscious = true;

                        await syncNpcState(
                             currentTarget.uniqueId, 0, currentTarget.maxNpcHp, currentTarget.roomId, currentTarget.npcName, true 
                         );

                        if (!isLethal) {
                            const winMsg = UI.txt(`${currentTarget.npcName} 拱手說道：「佩服佩服，是在下輸了。」`, "#00ff00", true);
                            UI.print(winMsg, "chat", true);
                            MessageSystem.broadcast(playerData.location, winMsg);
                            playerData.combat.potential = (playerData.combat.potential || 0) + 10;
                            // 移除該敵人
                            combatList.shift();
                        } else {
                             const uncMsg = UI.txt(`${currentTarget.npcName} 搖頭晃腦，咚的一聲倒在地上！`, "#888");
                             UI.print(uncMsg, "system", true);
                             await handleKillReward(npc, playerData, currentTarget, userId);
                             // 移除該敵人
                             combatList.shift();
                        }
                        
                        // 自動切換下一個目標
                        if (combatList.length > 0) {
                            UI.print(UI.txt(`你的目標轉向了 ${combatList[0].npcName}！`, "#ffff00"), "system");
                            await updatePlayer(userId, { combatTarget: { id: combatList[0].targetId, index: combatList[0].targetIndex } });
                        }
                    }
                } else {
                    const dodgeMsg = UI.txt(`${currentTarget.npcName} 身形一晃，閃過了你的攻擊！`, "#aaa");
                    UI.print(dodgeMsg, "chat", true);
                    MessageSystem.broadcast(playerData.location, dodgeMsg);
                }
            } else {
                UI.print("你現在暈頭轉向，根本無法攻擊！", "error");
            }
            
            // 2. 怪物回合 (所有活著的怪輪流打)
            // 使用 for 迴圈避免 async/await 問題，並檢查玩家死活
            for (const enemyState of combatList) {
                if (playerData.attributes.hp <= 0) break; // 玩家已死，不用再打了
                if (enemyState.npcIsUnconscious || enemyState.npcHp <= 0) continue; // 怪暈了

                const eNpc = enemyState.npcObj;
                const eStats = getNPCCombatStats(eNpc);

                let npcMsg = UI.txt(`${enemyState.npcName} 往 ${playerData.name} 撲了過來！`, "#ff5555");
                const nHitChance = Math.random() * (eStats.hit + playerStats.dodge);
                const nIsHit = playerData.isUnconscious ? true : (nHitChance < eStats.hit);
                
                UI.print(npcMsg, "system", true);
                MessageSystem.broadcast(playerData.location, npcMsg);
    
                if (nIsHit) {
                    let dmg = eStats.ap - playerStats.dp;
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
    
                    if (playerData.attributes.hp <= 0) {
                        playerData.attributes.hp = 0;
                        if (!isLethal) {
                            const loseMsg = UI.txt("你眼前一黑，知道自己輸了，連忙跳出戰圈。", "#ffaa00", true);
                            UI.print(loseMsg, "system", true);
                            MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 敗下陣來，跳出了戰圈。`, "#ffaa00", true));
                            playerData.isUnconscious = true; 
                            CombatSystem.stopCombat(userId);
                            await updatePlayer(userId, { "attributes.hp": 0, isUnconscious: true });
                            return;
                        } else {
                            if (!playerData.isUnconscious) {
                                playerData.isUnconscious = true;
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
                    const dodgeMsg = getDodgeMessage(playerData, enemyState.npcName);
                    UI.print(dodgeMsg, "chat", true);
                    MessageSystem.broadcast(playerData.location, dodgeMsg);
                }
            } // end for loop (enemies)
    
            UI.updateHUD(playerData);
            if (combatList.length === 0) CombatSystem.stopCombat(userId);

            await updatePlayer(userId, { 
                "attributes.hp": playerData.attributes.hp,
                "attributes.force": playerData.attributes.force 
            });
        };
    
        // 啟動第一回合
        combatRound();
        combatInterval = setInterval(combatRound, 2000); 
    }
};