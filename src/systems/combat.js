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

// === [新增] 計算戰力評分 ===
function calculateCombatPower(stats, hp) {
    // 簡易評分公式：(攻+防)*2 + 血量
    return (stats.ap + stats.dp) * 2 + hp;
}

// === [新增] 判斷強弱顏色與描述 ===
export function getDifficultyInfo(playerData, npcId) {
    const npc = NPCDB[npcId];
    if (!npc) return { color: "#fff", ratio: 1 };

    const pStats = getCombatStats(playerData);
    const nStats = getNPCCombatStats(npc);

    const pPower = calculateCombatPower(pStats, playerData.attributes.maxHp);
    const nPower = calculateCombatPower(nStats, npc.combat.maxHp);

    const ratio = nPower / (pPower || 1); 

    let color = "#ffffff"; // 白 (相當)
    
    if (ratio < 0.5) color = "#888888"; // 灰 (極弱)
    else if (ratio < 0.8) color = "#00ff00"; // 淺綠 (稍弱)
    else if (ratio < 1.2) color = "#ffffff"; // 白 (相當)
    else if (ratio < 2.0) color = "#ffff00"; // 黃 (強)
    else color = "#ff0000"; // 紅 (極強)

    return { color, ratio };
}

function getStatusDesc(name, current, max) {
    if (max <= 0) return null;
    const pct = current / max;
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
    UI.print(UI.txt("你眼前一黑，感覺靈魂脫離了軀體...", "#ff0000", true), "system", true);
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

export const CombatSystem = {
    // 匯出給 map.js 使用
    getDifficultyInfo, 

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

        // === [新增] 計算強弱以備用 (獲得潛能時使用) ===
        const diffInfo = getDifficultyInfo(playerData, npc.id);
    
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
            isLethal: isLethal,
            diffRatio: diffInfo.ratio // 存起來
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
    
            if (!playerData.isUnconscious) {
                const enforceLevel = playerData.combat.enforce || 0;
                let forceBonus = 0;
                
                if (enforceLevel > 0) {
                    const forceSkill = playerData.skills.force || 0;
                    const forceCost = Math.floor(enforceLevel * 3 + (forceSkill * 0.1));
                    
                    if (playerData.attributes.force >= forceCost) {
                        playerData.attributes.force -= forceCost;
                        const baseForceDmg = forceSkill / 2;
                        let multiplier = 0.3; 
                        if (playerStats.atkType === 'unarmed') multiplier = 1.0; 
                        else if (playerStats.weaponData && playerStats.weaponData.type === 'throwing') multiplier = 0.8; 
                        forceBonus = Math.floor(baseForceDmg * (enforceLevel / 10) * multiplier);
                    } else {
                        if(Math.random() < 0.2) UI.print("你內力不繼，無法運功加力！", "error");
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
                    .replace(/\$N/g, npc.name)
                    .replace(/\$w/g, playerStats.weaponData ? playerStats.weaponData.name : "雙手");
    
                const pHitChance = Math.random() * (playerStats.hit + npcStats.dodge);
                const isHit = currentCombatState.npcIsUnconscious ? true : (pHitChance < playerStats.hit);
    
                UI.print(UI.txt(msg, "#ffff00"), "system", true); 
    
                if (isHit) {
                    let damage = playerStats.ap - npcStats.dp;
                    damage += (skillBaseDmg / 2); 
                    damage += forceBonus;

                    damage = Math.floor(damage * (0.9 + Math.random() * 0.2));
                    if (damage <= 0) damage = Math.floor(Math.random() * 5) + 1;
                    if (isNaN(damage)) damage = 1; 
    
                    if (!isLethal) damage = Math.floor(damage / 2) || 1;
    
                    currentCombatState.npcHp -= damage;
                    
                    let damageMsg = `(造成了 ${damage} 點傷害)`;
                    if (forceBonus > 0) damageMsg = `(運功造成了 ${damage} 點傷害)`;
                    
                    UI.print(damageMsg, "chat");
    
                    const statusMsg = getStatusDesc(npc.name, currentCombatState.npcHp, currentCombatState.maxNpcHp);
                    if (statusMsg) UI.print(statusMsg, "chat", true);
                    
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

                                // === [新增] 依據強弱調整潛能 ===
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
    
            await updatePlayer(userId, { 
                "attributes.hp": playerData.attributes.hp,
                "attributes.force": playerData.attributes.force 
            });
        };
    
        combatRound();
        combatInterval = setInterval(combatRound, 2000); 
    }
};