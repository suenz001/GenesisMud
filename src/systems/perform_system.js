// src/systems/perform_system.js
import { updatePlayer, getCombatStats, getEffectiveSkillLevel } from "./player.js";
import { UI } from "../ui.js";
import { MessageSystem } from "./messages.js";
import { PerformDB } from "../data/performs.js";
import { ItemDB } from "../data/items.js";
import { CombatSystem } from "./combat.js"; // [修正] 靜態引入 CombatSystem
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
        
        // [新增] 限制必須在戰鬥中才能使用
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
        // 特例：如果是基礎武功 (通常絕招綁進階，但以防萬一)
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

        // 8. 執行絕招 (先扣內力與設CD，防止出錯後沒扣)
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
            const updatePromises = [];

            snapshot.forEach((docSnap) => {
                const enemy = docSnap.data();
                const enemyId = docSnap.id;

                // 排除已昏迷或死掉的
                if (enemy.currentHp <= 0 || enemy.isUnconscious) return;

                // 執行傷害計算
                // AOE 傷害公式：(攻擊力 * 技能倍率 * Enforce倍率)
                // 這裡做些微浮動
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
                     
                     // 構造 enemyState 供 handleKillReward 使用
                     const diffInfo = CombatSystem.getDifficultyInfo(playerData, enemy.targetId || enemy.npcName); 
                     const enemyState = { 
                         uniqueId: enemyId, 
                         diffRatio: diffInfo.ratio,
                         npcHp: 0, 
                         maxNpcHp: enemy.maxHp 
                     };
                     
                     // 嘗試從 NPCDB 還原資料，若無則用現有資料填充
                     const npcData = NPCDB[enemy.targetId] || { name: enemy.npcName, id: enemy.targetId, combat: { maxHp: enemy.maxHp }, drops: [] }; 
                     
                     // 呼叫 combat.js 的擊殺處理 (包含掉寶、潛能、刪除active_npc)
                     updatePromises.push(CombatSystem.handleKillReward(npcData, playerData, enemyState, userId));
                     
                     // 標記狀態 (雖然 handleKillReward 會刪除它，但為防萬一先更新)
                     updatePromises.push(updateDoc(enemyRef, { currentHp: 0, isUnconscious: true }));

                } else {
                     // 存活邏輯
                     UI.print(UI.txt(`(刀氣對 ${enemy.npcName} 造成 ${damage} 點傷害)`, "#ffff00"), "system", true);
                     
                     // [修正] 寫回資料庫，並強制設定目標為玩家 (反擊)
                     updatePromises.push(updateDoc(enemyRef, { 
                         currentHp: enemy.currentHp,
                         targetId: userId 
                     }));
                     
                     // 確保本地也進入戰鬥狀態
                     CombatSystem.fight(playerData, [enemy.targetId], userId);
                }
            });

            await Promise.all(updatePromises);

            if (hitCount === 0) {
                UI.print("四周空蕩蕩的，你的絕招打了個寂寞。", "chat");
            }
            
        } 
        // === 執行：單體攻擊 / 連擊 / Debuff ===
        else {
            // 計算傷害基數
            const damageBase = pStats.ap * performData.damageScale * enforceMult;
            
            // 呼叫 CombatSystem 處理實際打擊 (包含找目標、扣血、擊殺)
            await CombatSystem.handlePerformHit(playerData, userId, targetId, targetIndex, performData, damageBase);
        }
    }
};