// src/systems/perform_system.js
import { updatePlayer, getCombatStats, getEffectiveSkillLevel } from "./player.js";
import { UI } from "../ui.js";
import { MessageSystem } from "./messages.js";
import { PerformDB } from "../data/performs.js";
import { ItemDB } from "../data/items.js";
import { CombatSystem } from "./combat.js"; 
import { NPCDB } from "../data/npcs.js";
import { db, auth } from "../firebase.js";
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

export const PerformSystem = {
    execute: async (playerData, args, userId) => {
        if (playerData.state === 'exercising') {
            UI.print("你正在修練中，無法使用絕招。", "error");
            return;
        }
        if (playerData.isUnconscious) {
            UI.print("你暈倒了，什麼也做不了。", "error");
            return;
        }
        
        if (playerData.state !== 'fighting') {
            UI.print("絕招只能在戰鬥中使用！", "error");
            return;
        }

        if (playerData.busy && Date.now() < playerData.busy) {
            const remaining = Math.ceil((playerData.busy - Date.now()) / 1000);
            UI.print(`你正忙著呢，還要等 ${remaining} 秒才能出招！`, "error");
            return;
        }
        const now = Date.now();
        if (playerData.gcd && now < playerData.gcd) {
            UI.print("你氣息未定，無法連續施展絕招。", "error");
            return;
        }

        if (args.length === 0) {
            UI.print("你要使用什麼絕招？ (perform <招式ID> [目標])", "error");
            return;
        }

        const performId = args[0].toLowerCase();
        const performData = PerformDB[performId];

        if (!performData) {
            UI.print("沒這招。", "error");
            return;
        }

        const requiredSkill = performData.skill;
        let isEnabled = false;
        
        if (playerData.enabled_skills) {
            for (const [type, skillId] of Object.entries(playerData.enabled_skills)) {
                if (skillId === requiredSkill) {
                    isEnabled = true;
                    break;
                }
            }
        }
        
        if (!isEnabled && playerData.skills && playerData.skills[requiredSkill]) {
            // 寬鬆檢查
        }

        if (!isEnabled) {
            UI.print(`你必須先激發 ${requiredSkill} 才能施展此招。`, "error");
            return;
        }

        if (!checkWeapon(playerData, performData.weaponType)) {
            let wName = "兵器";
            if(performData.weaponType === 'unarmed') wName = "空手";
            else if(performData.weaponType === 'blade') wName = "刀";
            else if(performData.weaponType === 'sword') wName = "劍";
            else if(performData.weaponType === 'lance') wName = "槍";
            
            UI.print(`施展 ${performData.name} 需要${wName}。`, "error");
            return;
        }

        if (!playerData.cooldowns) playerData.cooldowns = {};
        if (playerData.cooldowns[performId] && now < playerData.cooldowns[performId]) {
            const wait = Math.ceil((playerData.cooldowns[performId] - now) / 1000);
            UI.print(`${performData.name} 還在冷卻中 (剩餘 ${wait} 秒)。`, "error");
            return;
        }

        if (playerData.attributes.force < performData.forceCost) {
            UI.print(`你的內力不足，無法施展 ${performData.name}。(需要: ${performData.forceCost})`, "error");
            return;
        }

        let targetId = args[1];
        let targetIndex = args[2] ? parseInt(args[2]) : 1;
        
        if (!targetId && playerData.state === 'fighting' && playerData.combatTarget) {
            targetId = playerData.combatTarget.id;
            targetIndex = playerData.combatTarget.index || 1; 
        }

        if (!targetId && performData.type !== 'aoe') {
            UI.print("你想對誰出招？", "error");
            return;
        }

        playerData.attributes.force -= performData.forceCost;
        playerData.cooldowns[performId] = now + performData.cooldown;
        playerData.gcd = now + 2000;

        await updatePlayer(userId, { 
            "attributes.force": playerData.attributes.force,
            [`cooldowns.${performId}`]: playerData.cooldowns[performId],
            gcd: playerData.gcd
        });

        const pStats = getCombatStats(playerData);
        const enforceLevel = playerData.combat?.enforce || 0;
        const enforceMult = calculateEnforceMultiplier(enforceLevel);

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
                
                // 構造 NPC 物件，以便 CombatSystem 正確識別
                let realNpcId = enemy.npcId;
                let realIndex = 1;

                if (!realNpcId) {
                     // 嘗試從 ID 解析: roomId_npcId_index
                     // 移除 roomId 前綴 (roomId 加上一個底線的長度)
                     const suffix = enemyId.substring(playerData.location.length + 1); 
                     const lastUnderscore = suffix.lastIndexOf('_');
                     if (lastUnderscore !== -1) {
                         realNpcId = suffix.substring(0, lastUnderscore);
                         // 解析出來的是 0-based array index，戰鬥系統通常吃 1-based index 參數
                         // 但如果是直接傳 object 給 applyDamage/fight，index 用 0-based 即可 (因為是內部的 list index)
                         realIndex = parseInt(suffix.substring(lastUnderscore + 1));
                     }
                }
                
                // 從 DB 獲取完整數據
                const npcDbData = NPCDB[realNpcId] || { name: enemy.npcName, id: realNpcId, combat: { maxHp: enemy.maxHp }, drops: [] };
                const npcObj = {
                    ...npcDbData,
                    id: realNpcId,
                    index: realIndex, 
                    combat: { ...npcDbData.combat, maxHp: enemy.maxHp } // 確保 maxHp 正確
                };

                // 呼叫 applyDamage
                const result = await CombatSystem.applyDamage(enemyId, damage, playerData, userId, npcObj);
                
                // 如果 applyDamage 說需要啟動戰鬥 (shouldStart)，則呼叫 fight
                if (result.shouldStart) {
                     // 這裡直接傳入具備正確 index 的 npcObj，fight 就不需要再呼叫 findAliveNPC 去猜了
                     await CombatSystem.fight(playerData, [], userId, false, npcObj);
                }

                hitCount++;
            }

            if (hitCount === 0) {
                UI.print("四周空蕩蕩的，你的絕招打了個寂寞。", "chat");
            }
            
        } 
        else {
            const damageBase = pStats.ap * performData.damageScale * enforceMult;
            await CombatSystem.handlePerformHit(playerData, userId, targetId, targetIndex, performData, damageBase);
        }
    }
};