// src/systems/perform_system.js
import { updatePlayer, getCombatStats, getEffectiveSkillLevel } from "./player.js";
import { UI } from "../ui.js";
import { MessageSystem } from "./messages.js";
import { PerformDB } from "../data/performs.js";
import { ItemDB } from "../data/items.js";
import { CombatSystem } from "./combat.js"; 
import { NPCDB } from "../data/npcs.js";
import { ConditionSystem } from "./conditions.js";
import { db } from "../firebase.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function calculateEnforceMultiplier(enforceLevel) {
    return 1 + (enforceLevel * 0.15);
}

function checkWeapon(playerData, requiredType) {
    if (requiredType === 'unarmed') {
        return !playerData.equipment || !playerData.equipment.weapon;
    }
    if (!playerData.equipment || !playerData.equipment.weapon) return false;
    const weaponId = playerData.equipment.weapon;
    const weaponItem = ItemDB[weaponId];
    if (!weaponItem) return false;
    return weaponItem.type === requiredType;
}

// 套用絕招的控制效果到 NPC
async function applyEffectToNpc(uniqueId, npcName, performData, playerLoc) {
    const effect = performData.effect;
    if (!effect) return;
    const duration = performData.duration || 3;
    
    // 計算 busy 時間（點穴/定身 = 無法行動）
    const busyUntil = Date.now() + duration * 1000;
    
    // 在 active_npcs 上記錄 stun 狀態
    try {
        const ref = doc(db, "active_npcs", uniqueId);
        await updateDoc(ref, {
            busy: busyUntil,
            [`conditions.${effect}`]: { id: effect, expireAt: busyUntil }
        });
    } catch(e) {
        // 若文件不存在先忽略
    }

    // 發給本人的訊息
    if (effect === 'stun') {
        UI.print(UI.txt(`${npcName} 被你點中要穴，全身動彈不得！(${duration}秒)`, "#ffdd00", true), "chat", true);
        MessageSystem.broadcast(playerLoc, UI.txt(`${npcName} 被點穴！動彈不得！`, "#ffdd00", true));
    } else if (effect === 'bleed') {
        UI.print(UI.txt(`${npcName} 的傷口正在不斷滲血！(${duration}秒)`, "#cc0000", true), "chat", true);
        MessageSystem.broadcast(playerLoc, UI.txt(`${npcName} 受到了流血傷害！`, "#cc0000", true));
    }
}

// 套用控制效果到玩家（PvP）
async function applyEffectToPlayer(targetId, targetName, performData, playerLoc) {
    const effect = performData.effect;
    if (!effect) return;
    const duration = performData.duration || 3;
    
    const expireAt = Date.now() + duration * 1000;
    try {
        await updateDoc(doc(db, "players", targetId), {
            [`conditions.${effect}`]: { id: effect, expireAt }
        });
    } catch(e) { console.error("PvP 效果套用失敗", e); }

    if (effect === 'stun') {
        UI.print(UI.txt(`${targetName} 被你點中要穴，動彈不得！(${duration}秒)`, "#ffdd00", true), "chat", true);
        MessageSystem.broadcast(playerLoc, UI.txt(`${targetName} 被點穴！`, "#ffdd00", true));
    } else if (effect === 'bleed') {
        UI.print(UI.txt(`${targetName} 的傷口正在不斷滲血！(${duration}秒)`, "#cc0000", true), "chat", true);
    }
}

export const PerformSystem = {
    execute: async (playerData, args, userId) => {
        // 狀態檢查
        if (playerData.state === 'exercising') {
            UI.print("你正在修練中，無法使用絕招。", "error"); return;
        }
        if (playerData.isUnconscious) {
            UI.print("你暈倒了，什麼也做不了。", "error"); return;
        }

        // [新增] 點穴狀態檢查：被點穴者無法使出任何絕招
        if (ConditionSystem.isStunned(playerData)) {
            UI.print(UI.txt("你的穴道被封住，無法施展任何武功！", "#ffdd00"), "error"); return;
        }
        
        if (playerData.state !== 'fighting') {
            UI.print("絕招只能在戰鬥中使用！", "error"); return;
        }

        if (playerData.busy && Date.now() < playerData.busy) {
            const remaining = Math.ceil((playerData.busy - Date.now()) / 1000);
            UI.print(`你正忙著呢，還要等 ${remaining} 秒才能出招！`, "error"); return;
        }
        const now = Date.now();
        if (playerData.gcd && now < playerData.gcd) {
            UI.print("你氣息未定，無法連續施展絕招。", "error"); return;
        }

        if (args.length === 0) {
            UI.print("你要使用什麼絕招？ (perform <招式ID> [目標ID])", "error"); return;
        }

        const performId = args[0].toLowerCase();
        const performData = PerformDB[performId];

        if (!performData) {
            UI.print(`沒有「${performId}」這個招式。(輸入 help perform 查看可用絕招)`, "error"); return;
        }

        // 檢查是否已學該絕招對應的武功
        const requiredSkill = performData.skill;
        let isEnabled = false;
        if (playerData.enabled_skills) {
            for (const skillId of Object.values(playerData.enabled_skills)) {
                if (skillId === requiredSkill) { isEnabled = true; break; }
            }
        }
        if (!isEnabled) {
            UI.print(`你必須先激發【${requiredSkill}】才能施展此招。`, "error"); return;
        }

        // 武器檢查
        if (!checkWeapon(playerData, performData.weaponType)) {
            const wMap = { unarmed:'空手', blade:'刀', sword:'劍', lance:'槍', stick:'棍', dagger:'短兵', whip:'鞭', throwing:'暗器' };
            UI.print(`施展【${performData.name}】需要${wMap[performData.weaponType] || '對應兵器'}。`, "error"); return;
        }

        // 冷卻檢查
        if (!playerData.cooldowns) playerData.cooldowns = {};
        if (playerData.cooldowns[performId] && now < playerData.cooldowns[performId]) {
            const wait = Math.ceil((playerData.cooldowns[performId] - now) / 1000);
            UI.print(`【${performData.name}】還在冷卻中 (剩餘 ${wait} 秒)。`, "error"); return;
        }

        // 內力消耗檢查
        if (playerData.attributes.force < performData.forceCost) {
            UI.print(`你的內力不足，無法施展【${performData.name}】。(需要: ${performData.forceCost}，當前: ${playerData.attributes.force})`, "error"); return;
        }

        // 解析目標
        let targetId = args[1];
        let targetIndex = args[2] ? parseInt(args[2]) : 1;
        
        if (!targetId && playerData.combatTarget) {
            targetId = playerData.combatTarget.id;
            targetIndex = playerData.combatTarget.index || 1;
        }

        if (!targetId && performData.type !== 'aoe') {
            UI.print("你想對誰出招？", "error"); return;
        }

        // --- 扣除內力 & 設定冷卻 ---
        playerData.attributes.force -= performData.forceCost;
        playerData.cooldowns[performId] = now + performData.cooldown;
        playerData.gcd = now + 2000;

        await updatePlayer(userId, { 
            "attributes.force": playerData.attributes.force,
            [`cooldowns.${performId}`]: playerData.cooldowns[performId],
            gcd: playerData.gcd
        });

        // --- 計算傷害 ---
        const pStats = getCombatStats(playerData);
        const enforceLevel = playerData.combat?.enforce || 0;
        const enforceMult = calculateEnforceMultiplier(enforceLevel);

        // ================== AOE 類型 ==================
        if (performData.type === 'aoe') {
            const msg = performData.msg(playerData.name);
            UI.print(msg, "chat", true);
            MessageSystem.broadcast(playerData.location, msg);

            const activeRef = collection(db, "active_npcs");
            const q = query(activeRef, where("roomId", "==", playerData.location));
            const snapshot = await getDocs(q);
            let hitCount = 0;

            for (const docSnap of snapshot.docs) {
                const enemy = docSnap.data();
                const enemyId = docSnap.id;
                if (enemy.currentHp <= 0 || enemy.isUnconscious) continue;

                let damage = Math.floor(pStats.ap * performData.damageScale * enforceMult);
                damage = Math.floor(damage * (0.9 + Math.random() * 0.2));
                
                let realNpcId = enemy.npcId;
                let realIndex = 1;
                const suffix = enemyId.substring(playerData.location.length + 1);
                const lastUnderscore = suffix.lastIndexOf('_');
                if (lastUnderscore !== -1) {
                    const parsedIndex = parseInt(suffix.substring(lastUnderscore + 1));
                    if (!isNaN(parsedIndex)) realIndex = parsedIndex;
                    if (!realNpcId) realNpcId = suffix.substring(0, lastUnderscore);
                }
                if (!realNpcId) continue;

                const npcDbData = NPCDB[realNpcId] || { name: enemy.npcName, id: realNpcId, combat: { maxHp: enemy.maxHp }, drops: [] };
                const npcObj = { ...npcDbData, id: realNpcId, index: realIndex, combat: { ...npcDbData.combat, maxHp: enemy.maxHp } };

                const result = await CombatSystem.applyDamage(enemyId, damage, playerData, userId, npcObj);
                if (result.shouldStart) await CombatSystem.fight(playerData, [], userId, false, npcObj);

                // AOE 也可以附帶效果（如有設定）
                if (performData.effect && result && !result.killed) {
                    await applyEffectToNpc(enemyId, npcDbData.name, performData, playerData.location);
                }

                hitCount++;
            }
            if (hitCount === 0) UI.print("四周空蕩蕩的，你的絕招打了個寂寞。", "chat");
            return;
        }

        // ================== PvP 模式：目標為玩家 ==================
        const isTargetPlayer = playerData.combatTarget?.type === 'player' && playerData.combatTarget?.id === targetId;
        
        if (isTargetPlayer) {
            const targetRef = doc(db, "players", targetId);
            const targetSnap = await getDoc(targetRef);
            if (!targetSnap.exists()) { UI.print("找不到目標玩家。", "error"); return; }
            const targetData = targetSnap.data();
            
            if (targetData.attributes.hp <= 0 || targetData.isUnconscious) {
                UI.print(`${targetData.name} 已經倒下了。`, "system"); return;
            }

            const msg = performData.msg(playerData.name, targetData.name);
            UI.print(msg, "chat", true);
            MessageSystem.broadcast(playerData.location, msg);

            const hits = performData.hits || 1;
            for (let i = 0; i < hits; i++) {
                let dmg = Math.floor(pStats.ap * performData.damageScale * enforceMult);
                dmg = Math.floor(dmg * (0.9 + Math.random() * 0.2));
                await CombatSystem.applyDamageToPlayer(targetId, dmg, playerData, userId);
            }

            // 套用控制效果給玩家
            if (performData.effect) {
                await applyEffectToPlayer(targetId, targetData.name, performData, playerData.location);
            }
            return;
        }

        // ================== PvE 單體 / 連擊 / 控制 ==================
        const damageBase = pStats.ap * performData.damageScale * enforceMult;
        await CombatSystem.handlePerformHit(playerData, userId, targetId, targetIndex, performData, damageBase);
    }
};