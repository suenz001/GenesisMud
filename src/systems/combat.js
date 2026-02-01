// src/systems/combat.js
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { NPCDB } from "../data/npcs.js";
import { ItemDB } from "../data/items.js";
import { SkillDB } from "../data/skills.js";
import { MapSystem } from "./map.js";
import { PlayerSystem, updatePlayer, getCombatStats, getEffectiveSkillLevel } from "./player.js";

let combatInterval = null;
let currentCombatState = null;

// --- 內部輔助：取得 NPC 戰鬥數據 ---
function getNPCCombatStats(npc) {
    const atkType = 'unarmed'; 
    let maxSkill = 0;
    if (npc.skills) {
        for (const [sid, lvl] of Object.entries(npc.skills)) {
            const sInfo = SkillDB[sid];
            if (lvl > maxSkill) maxSkill = lvl;
        }
    }
    const effAtkSkill = maxSkill;

    const str = npc.attributes?.str || 20;
    const con = npc.attributes?.con || 20;
    const per = npc.attributes?.per || 20;
    
    const ap = (str * 2.5) + (effAtkSkill * 5) + (npc.combat.attack || 0);
    const dp = (con * 2.5) + (effAtkSkill * 2) + (npc.combat.defense || 0);
    const hit = (per * 2.5) + (effAtkSkill * 3);
    const dodge = (per * 2.5) + (effAtkSkill * 4);

    return { ap, dp, hit, dodge, atkType, effAtkSkill };
}

// --- 狀態描述 ---
function getStatusDesc(name, current, max) {
    if (max <= 0) return null;
    const pct = current / max;
    if (pct <= 0.1 && pct > 0) return UI.txt(`${name} 搖頭晃腦，眼看就要倒在地上了！`, "#ff5555");
    if (pct <= 0.4 && pct > 0.1) return UI.txt(`${name} 氣喘呼呼，看起來狀況不太好。`, "#ffaa00");
    return null;
}

// --- 計算等級總和 (用於經驗值/潛能計算) ---
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

// --- 尋找活著的 NPC (過濾屍體) ---
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

// --- 處理玩家死亡 ---
async function handlePlayerDeath(playerData, userId) {
    UI.print(UI.txt("你眼前一黑，感覺靈魂脫離了軀體...", "#ff0000", true), "system", true);
    CombatSystem.stopCombat(userId);

    // 1. 技能懲罰
    if (playerData.skills) {
        for (let skillId in playerData.skills) {
            if (playerData.skills[skillId] > 0) playerData.skills[skillId] -= 1;
        }
    }

    // 2. 設定鬼門關位置與狀態
    const deathLocation = "ghost_gate";
    
    // 補滿狀態 (變成鬼是滿血狀態)
    playerData.attributes.hp = playerData.attributes.maxHp;
    playerData.attributes.sp = playerData.attributes.maxSp;
    playerData.attributes.mp = playerData.attributes.maxMp;
    
    // 清除暈倒狀態
    delete playerData.isUnconscious;
    playerData.isUnconscious = false;

    // === [修正] 立即更新本地端的座標，讓畫面正確跳轉 ===
    playerData.location = deathLocation; 

    // 3. 更新到資料庫 (包含死亡時間 deathTime)
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
    
    // 執行 look，這時會正確看到鬼門關
    MapSystem.look(playerData);

    // 4. 設定 3 分鐘後重生 (前端計時，作為即時反饋，主要依賴 main.js 的斷線重連檢查)
    setTimeout(async () => {
        const pRef = doc(db, "players", userId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
            const currentP = pSnap.data();
            // 只有當玩家還在鬼門關時才傳送
            if (currentP.location === "ghost_gate") {
                const respawnPoint = currentP.savePoint || "inn_start";
                
                // 更新本地與資料庫
                playerData.location = respawnPoint;
                await updatePlayer(userId, { location: respawnPoint });
                
                if (auth.currentUser && auth.currentUser.uid === userId) {
                    UI.print("一道金光閃過，你還陽了！", "system");
                    MapSystem.look(playerData);
                }
            }
        }
    }, 180000); // 3分鐘
}

export const CombatSystem = {
    stopCombat: (userId) => {
        if (combatInterval) {
            clearInterval(combatInterval);
            combatInterval = null;
        }
        currentCombatState = null;
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
    
        const combatType = isLethal ? "下殺手" : "切磋";
        const color = isLethal ? "#ff0000" : "#ff8800";
        UI.print(UI.txt(`你對 ${npc.name} ${combatType}！戰鬥開始！`, color, true), "system", true);
        
        currentCombatState = {
            targetId: npc.id,
            targetIndex: npc.index, 
            npcHp: npc.combat.hp,
            maxNpcHp: npc.combat.maxHp,
            npcName: npc.name,
            roomId: playerData.location, 
            npcIsUnconscious: false,
            isLethal: isLethal
        };
    
        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: npc.id, index: npc.index } 
        });
    
        if (combatInterval) clearInterval(combatInterval);
        
        const combatRound = async () => {
            if (!currentCombatState) { if (combatInterval) clearInterval(combatInterval); return; }
            if (playerData.location !== currentCombatState.roomId) { CombatSystem.stopCombat(userId); return; }
    
            const playerStats = getCombatStats(playerData);
            const npcStats = getNPCCombatStats(npc); 
    
            // === 玩家 攻擊 NPC ===
            if (!playerData.isUnconscious) {
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
                    .replace(/\$N/g, npc.name)
                    .replace(/\$w/g, playerStats.weaponData ? playerStats.weaponData.name : "雙手");
    
                const pHitChance = Math.random() * (playerStats.hit + npcStats.dodge);
                const isHit = currentCombatState.npcIsUnconscious ? true : (pHitChance < playerStats.hit);
    
                UI.print(UI.txt(msg, "#ffff00"), "system", true); 
    
                if (isHit) {
                    let damage = playerStats.ap - npcStats.dp;
                    damage += (skillBaseDmg / 2); 
                    damage = Math.floor(damage * (0.9 + Math.random() * 0.2));
                    if (damage <= 0) damage = Math.floor(Math.random() * 5) + 1;
                    if (isNaN(damage)) damage = 1; 
    
                    if (!isLethal) damage = Math.floor(damage / 2) || 1;
    
                    currentCombatState.npcHp -= damage;
                    UI.print(`(造成了 ${damage} 點傷害)`, "chat");
    
                    const statusMsg = getStatusDesc(npc.name, currentCombatState.npcHp, currentCombatState.maxNpcHp);
                    if (statusMsg) UI.print(statusMsg, "chat", true);
                    
                    // --- NPC 死亡判定 ---
                    if (currentCombatState.npcHp <= 0) {
                        currentCombatState.npcHp = 0;
                        if (!isLethal) {
                            UI.print(UI.txt(`${npc.name} 拱手說道：「佩服佩服，是在下輸了。」`, "#00ff00", true), "chat", true);
                            playerData.combat.potential = (playerData.combat.potential || 0) + 10;
                            CombatSystem.stopCombat(userId);
                            await updatePlayer(userId, { "combat.potential": playerData.combat.potential });
                            return;
                        } else {
                            if (!currentCombatState.npcIsUnconscious) {
                                currentCombatState.npcIsUnconscious = true;
                                UI.print(UI.txt(`${npc.name} 搖頭晃腦，腳步踉蹌，咚的一聲倒在地上，動彈不得！`, "#888"), "system", true);
                            } else {
                                UI.print(UI.txt(`${npc.name} 慘叫一聲，被你結果了性命。`, "#ff0000", true), "system", true);
                                
                                const playerLvl = getLevel(playerData);
                                const npcLvl = getLevel(npc); 
                                let potGain = 100 + ((npcLvl - playerLvl) * 10);
                                if (potGain < 10) potGain = 10;
                                
                                playerData.combat.potential = (playerData.combat.potential || 0) + potGain;
                                playerData.combat.kills = (playerData.combat.kills || 0) + 1;
                                UI.print(UI.txt(`戰鬥勝利！獲得 ${potGain} 點潛能。`, "#00ff00", true), "system", true);
    
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
    
                                CombatSystem.stopCombat(userId);
                                await updatePlayer(userId, { 
                                    "combat.potential": playerData.combat.potential,
                                    "combat.kills": playerData.combat.kills 
                                });
                                MapSystem.look(playerData); 
                                return; 
                            }
                        }
                    }
                } else {
                    UI.print(UI.txt(`${npc.name} 身形一晃，閃過了你的攻擊！`, "#aaa"), "chat", true);
                }
            } else {
                UI.print("你現在暈頭轉向，根本無法攻擊！", "error");
            }
    
            // --- NPC 反擊 玩家 ---
            if (!currentCombatState.npcIsUnconscious && playerData.location === currentCombatState.roomId) {
                let npcMsg = `${npc.name} 往 ${playerData.name} 撲了過來！`;
                const nHitChance = Math.random() * (npcStats.hit + playerStats.dodge);
                const nIsHit = playerData.isUnconscious ? true : (nHitChance < npcStats.hit);
                
                UI.print(UI.txt(npcMsg, "#ff5555"), "system", true);
    
                if (nIsHit) {
                    let dmg = npcStats.ap - playerStats.dp;
                    if (dmg <= 0) dmg = Math.floor(Math.random() * 3) + 1;
                    if (isNaN(dmg)) dmg = 1;
                    
                    if (!isLethal) dmg = Math.floor(dmg / 2) || 1;
    
                    playerData.attributes.hp -= dmg;
                    UI.updateHUD(playerData);
                    UI.print(`(你受到了 ${dmg} 點傷害)`, "chat");
    
                    const statusMsg = getStatusDesc("你", playerData.attributes.hp, playerData.attributes.maxHp);
                    if (statusMsg) UI.print(statusMsg, "chat", true);
    
                    // --- 玩家 死亡/昏迷判定 ---
                    if (playerData.attributes.hp <= 0) {
                        playerData.attributes.hp = 0;
                        if (!isLethal) {
                            UI.print(UI.txt("你眼前一黑，知道自己輸了，連忙跳出戰圈。", "#ffaa00", true), "system", true);
                            playerData.isUnconscious = true; 
                            CombatSystem.stopCombat(userId);
                            await updatePlayer(userId, { "attributes.hp": 0, isUnconscious: true });
                            return;
                        } else {
                            if (!playerData.isUnconscious) {
                                playerData.isUnconscious = true;
                                UI.print(UI.txt("你只覺天旋地轉，站立不穩，咚的一聲倒在地上...", "#ff8800", true), "system", true);
                                await updatePlayer(userId, { "attributes.hp": 0, isUnconscious: true });
                            } else {
                                UI.print(UI.txt("這致命的一擊奪走了你最後的生機！", "#ff0000", true), "system", true);
                                await handlePlayerDeath(playerData, userId);
                                return; 
                            }
                        }
                    }
                } else {
                    UI.print(UI.txt(`你側身避開了 ${npc.name} 的攻擊。`, "#aaa"), "chat", true);
                }
            } else if (currentCombatState.npcIsUnconscious) {
                UI.print(UI.txt(`${npc.name} 倒在地上，毫無反抗之力。`, "#888"), "chat", true);
            }
    
            await updatePlayer(userId, { "attributes.hp": playerData.attributes.hp });
        };
    
        combatRound();
        combatInterval = setInterval(combatRound, 2000); 
    }
};