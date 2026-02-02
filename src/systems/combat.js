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
let currentCombatState = null;

function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

// === [🔧 修復] 增強同步函數，確保資料正確寫入 ===
async function syncNpcState(uniqueId, currentHp, maxHp, roomId, npcName, isUnconscious = false) {
    try {
        const ref = doc(db, "active_npcs", uniqueId);
        const data = {
            currentHp: Math.max(0, currentHp), // 確保不會是負數
            maxHp: maxHp,
            roomId: roomId,
            npcName: npcName,
            isUnconscious: isUnconscious,
            lastCombatTime: Date.now()
        };
        
        // 使用 setDoc 而非 merge，確保完整覆蓋
        await setDoc(ref, data);
        
        console.log(`[Combat] ✅ Synced NPC: ${npcName} (${uniqueId})`);
        console.log(`  └─ HP: ${data.currentHp}/${maxHp}, Unconscious: ${isUnconscious}`);
        
        // === [🔧 新增] 立即驗證寫入是否成功 ===
        const verifySnap = await getDoc(ref);
        if (verifySnap.exists()) {
            const verifyData = verifySnap.data();
            console.log(`  └─ ✓ Verified: HP=${verifyData.currentHp}, UNC=${verifyData.isUnconscious}`);
        } else {
            console.error(`  └─ ✗ Verification FAILED: Document not found!`);
        }
        
        return true;
    } catch (e) {
        console.error(`❌ 同步 NPC 狀態失敗 (${uniqueId}):`, e);
        return false;
    }
}

async function fetchNpcState(uniqueId, defaultMaxHp) {
    try {
        const ref = doc(db, "active_npcs", uniqueId);
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
            const data = snap.data();
            const now = Date.now();
            // 3分鐘沒戰鬥視為脫離/回滿 (除非昏迷)
            if (now - data.lastCombatTime > 180000 && !data.isUnconscious) {
                await deleteDoc(ref);
                return defaultMaxHp;
            } else {
                console.log(`[Fetch] NPC ${uniqueId}: HP=${data.currentHp}, UNC=${data.isUnconscious}`);
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
        deathTime: Date.now()
    });

    UI.print("你發現自己站在一個陰森的地方，四周陰風慘慘...", "system");
    MapSystem.look(playerData);
}

async function handleKillReward(npc, playerData, combatState, userId) {
    const deadRef = collection(db, "dead_npcs");
    await addDoc(deadRef, {
        npcId: npc.id,
        roomId: combatState.roomId,
        index: combatState.npcIndex,
        respawnTime: Date.now() + 60000
    });

    // === [🔧 修復] 刪除 active_npcs 記錄，避免屍體還顯示受傷狀態 ===
    try {
        const activeRef = doc(db, "active_npcs", combatState.uniqueId);
        await deleteDoc(activeRef);
        console.log(`[Combat] 🗑️ Deleted active NPC record: ${combatState.uniqueId}`);
    } catch (e) {
        console.error("刪除 active_npcs 失敗:", e);
    }

    const killMsg = UI.txt(`${npc.name} 一聲慘叫，倒在地上死了。`, "#ff0000", true);
    UI.print(killMsg, "system", true);
    MessageSystem.broadcast(playerData.location, killMsg);

    const xpGain = npc.combat.xp || 10;
    playerData.combat.xp = (playerData.combat.xp || 0) + xpGain;
    playerData.combat.kills = (playerData.combat.kills || 0) + 1;
    UI.print(`你獲得了 ${xpGain} 點經驗值。`, "chat");

    if (npc.drops) {
        for (const drop of npc.drops) {
            if (Math.random() < drop.rate) {
                const itemInfo = ItemDB[drop.id];
                if (itemInfo) {
                    if (!playerData.inventory) playerData.inventory = [];
                    const existing = playerData.inventory.find(i => i.id === drop.id);
                    if (existing) existing.count = (existing.count || 1) + 1;
                    else playerData.inventory.push({ id: drop.id, name: itemInfo.name, count: 1 });
                    UI.print(`你從 ${npc.name} 的屍體上獲得了 ${itemInfo.name}。`, "chat");
                }
            }
        }
    }

    CombatSystem.stopCombat(userId);
    await updatePlayer(userId, {
        inventory: playerData.inventory,
        "combat.xp": playerData.combat.xp,
        "combat.kills": playerData.combat.kills
    });
}

function getDodgeMessage(playerData, attackerName) {
    const skills = playerData.skills || {};
    const enabled = playerData.enabled_skills || {};
    const dodgeSkillId = enabled['dodge'];

    if (dodgeSkillId && SkillDB[dodgeSkillId]) {
        const skillInfo = SkillDB[dodgeSkillId];
        if (skillInfo.dodge_actions && skillInfo.dodge_actions.length > 0) {
            const msg = skillInfo.dodge_actions[Math.floor(Math.random() * skillInfo.dodge_actions.length)];
            return UI.txt(msg.replace(/\$N/g, attackerName), "#00ff00", true);
        }
    }

    const defaultMsgs = [
        `你身形一閃，輕巧地避開了${attackerName}的攻擊！`,
        `你向旁邊一躍，躲過了${attackerName}的這一擊。`,
        `你腳步虛浮，${attackerName}撲了個空。`
    ];
    return UI.txt(defaultMsgs[Math.floor(Math.random() * defaultMsgs.length)], "#00ff00");
}

export const CombatSystem = {
    stopCombat: (userId) => {
        if (combatInterval) {
            clearInterval(combatInterval);
            combatInterval = null;
        }
        currentCombatState = null;
        
        if (userId) {
            updatePlayer(userId, { state: 'normal', combatTarget: null });
        }
    },

    kill: async (playerData, args, userId) => {
        if (!args[0]) { UI.print("你想殺誰？", "error"); return; }
        await startCombat(playerData, args[0], userId, true);
    },

    fight: async (playerData, args, userId) => {
        if (!args[0]) { UI.print("你想和誰切磋？", "error"); return; }
        await startCombat(playerData, args[0], userId, false);
    }
};

async function startCombat(playerData, targetId, userId, isLethal) {
    const room = MapSystem.getRoom(playerData.location);
    if (!room) return;

    if (room.safe) {
        UI.print("這裡是安全區域，不能動武！", "error");
        return;
    }

    if (playerData.state === 'fighting') {
        UI.print("你正在戰鬥中！", "error");
        return;
    }

    const npc = await findAliveNPC(playerData.location, targetId);
    if (!npc) {
        UI.print(`你看不到 ${targetId}。`, "error");
        return;
    }

    const uniqueId = getUniqueNpcId(playerData.location, targetId, npc.index);
    console.log(`\n[Combat] 🎯 Starting combat with ${npc.name}`);
    console.log(`  └─ UniqueID: ${uniqueId}`);
    console.log(`  └─ Room: ${playerData.location}, Index: ${npc.index}`);

    const npcHp = await fetchNpcState(uniqueId, npc.combat.maxHp);
    
    // === [🔧 新增] 檢查是否已經昏迷 ===
    let initialIsUnconscious = false;
    try {
        const activeRef = doc(db, "active_npcs", uniqueId);
        const activeSnap = await getDoc(activeRef);
        if (activeSnap.exists()) {
            const activeData = activeSnap.data();
            initialIsUnconscious = activeData.isUnconscious || activeData.currentHp <= 0;
        }
    } catch (e) {
        console.error("檢查初始昏迷狀態失敗:", e);
    }

    if (initialIsUnconscious) {
        if (isLethal) {
            UI.print(`${npc.name} 已經昏迷不醒了，你無法對一個毫無反抗能力的對手下殺手！`, "error");
            UI.print("也許你可以試試 fight 來切磋。", "system");
        } else {
            UI.print(`${npc.name} 已經倒在地上不省人事了，你總不能對著一個昏迷的人切磋吧？`, "error");
        }
        return;
    }

    currentCombatState = {
        npcId: targetId,
        npcIndex: npc.index,
        npcHp: npcHp,
        maxNpcHp: npc.combat.maxHp,
        roomId: playerData.location,
        uniqueId: uniqueId,
        npcName: npc.name,
        npcIsUnconscious: false
    };

    playerData.state = 'fighting';
    playerData.combatTarget = { id: targetId, index: npc.index };
    
    await updatePlayer(userId, { 
        state: 'fighting', 
        combatTarget: playerData.combatTarget 
    });

    const startMsg = isLethal 
        ? UI.txt(`你對著 ${npc.name} 大喝一聲：「納命來！」`, "#ff0000", true)
        : UI.txt(`你對著 ${npc.name} 抱拳說道：「請賜教！」`, "#00ff00", true);
    
    UI.print(startMsg, "system", true);
    MessageSystem.broadcast(playerData.location, startMsg);

    const playerStats = getCombatStats(playerData);
    const npcStats = getNPCCombatStats(npc);

    const combatRound = async () => {
        if (!currentCombatState || playerData.location !== currentCombatState.roomId) {
            CombatSystem.stopCombat(userId);
            return;
        }

        // --- 玩家 攻擊 NPC ---
        if (playerData.attributes.hp > 0 && !playerData.isUnconscious) {
            const enforce = playerData.combat.enforce || 0;
            let forceBonus = 0;
            let actualCost = 0;

            if (enforce > 0) {
                const maxCost = Math.floor(playerData.attributes.maxForce * (enforce / 10));
                actualCost = Math.min(maxCost, playerData.attributes.force);
                forceBonus = actualCost * 0.5;
                playerData.attributes.force -= actualCost;
                if (playerData.attributes.force < 0) playerData.attributes.force = 0;
            }

            const atkType = playerStats.atkType;
            let activeSkillId = atkType;
            if (playerData.enabled_skills && playerData.enabled_skills[atkType]) {
                activeSkillId = playerData.enabled_skills[atkType];
            }

            let skillInfo = SkillDB[activeSkillId];

            let action = { msg: "$P對$N發起攻擊。", damage: 10 };
            if (skillInfo && skillInfo.actions && skillInfo.actions.length > 0) {
                action = skillInfo.actions[Math.floor(Math.random() * skillInfo.actions.length)];
            }

            let skillBaseDmg = action.damage || 10;
            
            let msg = action.msg
                .replace(/\$P/g, playerData.name)
                .replace(/\$N/g, npc.name)
                .replace(/\$w/g, playerStats.weaponData ? playerStats.weaponData.name : "雙手");

            const pHitChance = Math.random() * (playerStats.hit + npcStats.dodge);
            const isHit = currentCombatState.npcIsUnconscious ? true : (pHitChance < playerStats.hit);
            
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

                currentCombatState.npcHp -= damage;
                
                // === [🔧 修復] 無論如何都同步狀態，並等待完成 ===
                if (currentCombatState.npcHp > 0) {
                    await syncNpcState(
                        currentCombatState.uniqueId, 
                        currentCombatState.npcHp, 
                        currentCombatState.maxNpcHp, 
                        currentCombatState.roomId,
                        currentCombatState.npcName,
                        false
                    );
                }

                let damageMsg = `(造成了 ${damage} 點傷害)`;
                if (forceBonus > 0) {
                    damageMsg = `(運功消耗 ${actualCost} 內力，造成了 ${damage} 點傷害)`;
                }
                
                UI.print(damageMsg, "chat");

                const statusMsg = getStatusDesc(npc.name, currentCombatState.npcHp, currentCombatState.maxNpcHp);
                if (statusMsg) {
                    UI.print(statusMsg, "chat", true);
                    MessageSystem.broadcast(playerData.location, statusMsg);
                }
                
                // === NPC 被擊敗/昏迷邏輯 ===
                if (currentCombatState.npcHp <= 0) {
                    currentCombatState.npcHp = 0;
                    currentCombatState.npcIsUnconscious = true;

                    // === [🔧 超級修復] 立即寫入昏迷狀態，並等待確認 ===
                    console.log(`\n[Combat] 💀 ${npc.name} HP dropped to 0!`);
                    const syncSuccess = await syncNpcState(
                        currentCombatState.uniqueId, 
                        0, 
                        currentCombatState.maxNpcHp, 
                        currentCombatState.roomId,
                        currentCombatState.npcName,
                        true // isUnconscious = true
                    );

                    if (!syncSuccess) {
                        console.error("❌ 昏迷狀態寫入失敗！");
                    }

                    // === [🔧 新增] 額外等待 500ms 確保 Firestore 寫入完成 ===
                    await new Promise(resolve => setTimeout(resolve, 500));

                    if (!isLethal) {
                        // 切磋勝利
                        const winMsg = UI.txt(`${npc.name} 拱手說道：「佩服佩服，是在下輸了。」`, "#00ff00", true);
                        UI.print(winMsg, "chat", true);
                        MessageSystem.broadcast(playerData.location, winMsg);

                        playerData.combat.potential = (playerData.combat.potential || 0) + 10;
                        
                        clearInterval(combatInterval);
                        combatInterval = null;
                        
                        CombatSystem.stopCombat(userId);
                        await updatePlayer(userId, { "combat.potential": playerData.combat.potential });
                        return;
                    } else {
                        // 下殺手 - 先顯示昏迷訊息
                        const uncMsg = UI.txt(`${npc.name} 搖頭晃腦，腳步踉蹌，咚的一聲倒在地上，動彈不得！`, "#888");
                        UI.print(uncMsg, "system", true);
                        MessageSystem.broadcast(playerData.location, uncMsg);
                        
                        // === [🔧 新增] 再等待 500ms 讓玩家看到昏迷訊息 ===
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        clearInterval(combatInterval);
                        combatInterval = null;
                        
                        await handleKillReward(npc, playerData, currentCombatState, userId);
                        return; 
                    }
                }
            } else {
                const dodgeMsg = UI.txt(`${npc.name} 身形一晃，閃過了你的攻擊！`, "#aaa");
                UI.print(dodgeMsg, "chat", true);
                MessageSystem.broadcast(playerData.location, dodgeMsg);
            }
        } else {
            UI.print("你現在暈頭轉向，根本無法攻擊！", "error");
        }

        // --- NPC 反擊 玩家 ---
        if (!currentCombatState.npcIsUnconscious && currentCombatState.npcHp > 0 && playerData.location === currentCombatState.roomId) {
            let npcMsg = UI.txt(`${npc.name} 往 ${playerData.name} 撲了過來！`, "#ff5555");
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

                if (playerData.attributes.hp <= 0) {
                    playerData.attributes.hp = 0;
                    if (!isLethal) {
                        const loseMsg = UI.txt("你眼前一黑，知道自己輸了，連忙跳出戰圈。", "#ffaa00", true);
                        UI.print(loseMsg, "system", true);
                        MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 敗下陣來,跳出了戰圈。`, "#ffaa00", true));

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
                const dodgeMsg = getDodgeMessage(playerData, npc.name);
                UI.print(dodgeMsg, "chat", true);
                MessageSystem.broadcast(playerData.location, dodgeMsg);
            }
        } else if (currentCombatState.npcHp <= 0) {
            if(Math.random() < 0.3) UI.print(UI.txt(`${npc.name} 倒在地上，毫無反抗之力。`, "#888"), "chat", true);
        }

        UI.updateHUD(playerData);

        await updatePlayer(userId, { 
            "attributes.hp": playerData.attributes.hp,
            "attributes.force": playerData.attributes.force 
        });
    };

    combatRound();
    combatInterval = setInterval(combatRound, 2000); 
}
