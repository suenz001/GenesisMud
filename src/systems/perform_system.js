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

// 用於計算 Enforce 對絕招的加成倍率
function calculateEnforceMultiplier(enforceLevel) {
    // 每 1 級 Enforce 增加 15% 絕招傷害
    // Enforce 0 = 1.0x
    // Enforce 10 = 2.5x (傷害爆炸)
    return 1 + (enforceLevel * 0.15);
}

// 檢查武器類型是否符合
function checkWeapon(playerData, requiredType) {
    // 如果絕招要求空手
    if (requiredType === 'unarmed') {
        return !playerData.equipment || !playerData.equipment.weapon;
    }

    // 如果絕招要求特定兵器
    if (!playerData.equipment || !playerData.equipment.weapon) return false;
    
    const weaponId = playerData.equipment.weapon;
    const weaponItem = ItemDB[weaponId];
    
    if (!weaponItem) return false;
    return weaponItem.type === requiredType;
}

export const PerformSystem = {
    execute: async (playerData, args, userId) => {
        // 1. 基本狀態檢查
        if (playerData.state === 'exercising') {
            UI.print("你正在修練中，無法使用絕招。", "error");
            return;
        }
        if (playerData.isUnconscious) {
            UI.print("你暈倒了，什麼也做不了。", "error");
            return;
        }
        
        // 限制必須在戰鬥中才能使用
        if (playerData.state !== 'fighting') {
            UI.print("絕招只能在戰鬥中使用！", "error");
            return;
        }

        // 檢查被定身狀態 (busy)
        if (playerData.busy && Date.now() < playerData.busy) {
            const remaining = Math.ceil((playerData.busy - Date.now()) / 1000);
            UI.print(`你正忙著呢，還要等 ${remaining} 秒才能出招！`, "error");
            return;
        }
        // 檢查公共冷卻 (Global Cooldown)
        const now = Date.now();
        if (playerData.gcd && now < playerData.gcd) {
            UI.print("你氣息未定，無法連續施展絕招。", "error");
            return;
        }

        // 2. 解析指令
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

        // 3. 檢查前置條件：是否激發對應武功
        const requiredSkill = performData.skill;
        let isEnabled = false;
        
        // 檢查激發 (Enabled Skills)
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

        // 4. 檢查武器
        if (!checkWeapon(playerData, performData.weaponType)) {
            let wName = "兵器";
            if(performData.weaponType === 'unarmed') wName = "空手";
            else if(performData.weaponType === 'blade') wName = "刀";
            else if(performData.weaponType === 'sword') wName = "劍";
            else if(performData.weaponType === 'lance') wName = "槍";
            
            UI.print(`施展 ${performData.name} 需要${wName}。`, "error");
            return;
        }

        // 5. 檢查個別絕招冷卻
        if (!playerData.cooldowns) playerData.cooldowns = {};
        if (playerData.cooldowns[performId] && now < playerData.cooldowns[performId]) {
            const wait = Math.ceil((playerData.cooldowns[performId] - now) / 1000);
            UI.print(`${performData.name} 還在冷卻中 (剩餘 ${wait} 秒)。`, "error");
            return;
        }

        // 6. 檢查內力
        if (playerData.attributes.force < performData.forceCost) {
            UI.print(`你的內力不足，無法施展 ${performData.name}。(需要: ${performData.forceCost})`, "error");
            return;
        }

        // 7. 尋找目標
        let targetId = args[1];
        let targetIndex = args[2] ? parseInt(args[2]) : 1;
        
        // 如果沒指定目標，且正在戰鬥中，自動取當前敵人
        if (!targetId && playerData.state === 'fighting' && playerData.combatTarget) {
            targetId = playerData.combatTarget.id;
            targetIndex = playerData.combatTarget.index || 1; 
        }

        if (!targetId && performData.type !== 'aoe') {
            UI.print("你想對誰出招？", "error");
            return;
        }

        // 8. 執行絕招 (先扣內力與設CD)
        playerData.attributes.force -= performData.forceCost;
        playerData.cooldowns[performId] = now + performData.cooldown;
        playerData.gcd = now + 2000; // 2秒公共冷卻

        // 更新玩家狀態
        await updatePlayer(userId, { 
            "attributes.force": playerData.attributes.force,
            [`cooldowns.${performId}`]: playerData.cooldowns[performId],
            gcd: playerData.gcd
        });

        // 計算基礎戰鬥數據
        const pStats = getCombatStats(playerData);
        const enforceLevel = playerData.combat?.enforce || 0;
        const enforceMult = calculateEnforceMultiplier(enforceLevel);

        // === 執行：AOE 全體攻擊 ===
        if (performData.type === 'aoe') {
            // 顯示出招訊息
            const msg = performData.msg(playerData.name);
            UI.print(msg, "chat", true);
            MessageSystem.broadcast(playerData.location, msg);

            // 取得房間內所有敵人
            const activeRef = collection(db, "active_npcs");
            const q = query(activeRef, where("roomId", "==", playerData.location));
            const snapshot = await getDocs(q);
            
            let hitCount = 0;
            
            // [修正] 使用 for...of 迴圈以支援 await，確保順序執行
            for (const docSnap of snapshot.docs) {
                const enemy = docSnap.data();
                const enemyId = docSnap.id;

                // 排除已昏迷或死掉的
                if (enemy.currentHp <= 0 || enemy.isUnconscious) continue;

                // 執行傷害計算
                let damage = Math.floor(pStats.ap * performData.damageScale * enforceMult);
                damage = Math.floor(damage * (0.9 + Math.random() * 0.2)); 
                
                // 扣血
                enemy.currentHp -= damage;
                hitCount++;

                const enemyRef = doc(db, "active_npcs", enemyId);
                
                if (enemy.currentHp <= 0) {
                     // 擊殺邏輯
                     enemy.currentHp = 0;
                     enemy.isUnconscious = true;
                     UI.print(UI.txt(`${enemy.npcName} 被刀氣掃中，慘叫一聲倒地！`, "#ff5555"), "system", true);
                     
                     // 處理擊殺獎勵
                     const diffInfo = CombatSystem.getDifficultyInfo(playerData, enemy.npcId || enemy.targetId || enemy.npcName); 
                     const enemyState = { 
                         uniqueId: enemyId, 
                         diffRatio: diffInfo.ratio,
                         npcHp: 0, 
                         maxNpcHp: enemy.maxHp 
                     };
                     
                     // 嘗試還原 NPC 資料
                     const npcData = NPCDB[enemy.npcId || enemy.targetId] || { name: enemy.npcName, id: enemy.targetId, combat: { maxHp: enemy.maxHp }, drops: [] }; 
                     
                     // [修正] 確保擊殺處理完成
                     await CombatSystem.handleKillReward(npcData, playerData, enemyState, userId);
                     
                     // 雙重保險更新狀態
                     await updateDoc(enemyRef, { currentHp: 0, isUnconscious: true });

                } else {
                     // 存活邏輯
                     UI.print(UI.txt(`(刀氣對 ${enemy.npcName} 造成 ${damage} 點傷害)`, "#ffff00"), "system", true);
                     
                     // [關鍵修正] 
                     // 1. 先等待資料庫更新完成 (解決 Race Condition 問題)
                     await updateDoc(enemyRef, { 
                         currentHp: enemy.currentHp,
                         targetId: userId // 強制設定目標為玩家
                     });
                     
                     // 2. 解析出正確的 npcId 和 index (解決 "這裡沒有這個人" 問題)
                     // 假設 ID 格式為: roomId_npcId_index
                     // 因為 roomId 可能包含底線 (例如 inn_start)，我們需要從後面解析
                     let realNpcId = enemy.npcId; // 如果 combat.js 更新後有存 npcId 最好
                     let realIndex = 1;

                     if (!realNpcId) {
                         // Fallback 解析邏輯
                         // 移除 roomId 前綴 (加1是因為還有一個底線)
                         const suffix = enemyId.substring(playerData.location.length + 1); 
                         const lastUnderscore = suffix.lastIndexOf('_');
                         if (lastUnderscore !== -1) {
                             realNpcId = suffix.substring(0, lastUnderscore);
                             realIndex = parseInt(suffix.substring(lastUnderscore + 1));
                         }
                     }

                     if (realNpcId) {
                         // 3. 最後才呼叫 fight，此時資料庫已更新，且 ID 正確
                         CombatSystem.fight(playerData, [realNpcId, realIndex], userId);
                     }
                }
            }

            if (hitCount === 0) {
                UI.print("四周空蕩蕩的，你的絕招打了個寂寞。", "chat");
            }
            
        } 
        // === 執行：單體攻擊 / 連擊 / Debuff ===
        else {
            const damageBase = pStats.ap * performData.damageScale * enforceMult;
            await CombatSystem.handlePerformHit(playerData, userId, targetId, targetIndex, performData, damageBase);
        }
    }
};