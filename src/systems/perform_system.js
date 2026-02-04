// src/systems/perform_system.js
import { updatePlayer, getCombatStats, getEffectiveSkillLevel } from "./player.js";
import { UI } from "../ui.js";
import { MessageSystem } from "./messages.js";
import { PerformDB } from "../data/performs.js";
import { ItemDB } from "../data/items.js";
import { CombatSystem } from "./combat.js";
import { NPCDB } from "../data/npcs.js";
import { db, auth } from "../firebase.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
            // 這裡假設絕招通常綁定在「激發」的進階武功上，
            // 如果你希望沒激發也能用，可以改寬鬆一點。
            // 但依照你的需求，應該是要裝備(激發)才能用。
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
            targetIndex = playerData.combatTarget.index || 1; // 修正：確保有 index
        }

        if (!targetId && performData.type !== 'aoe') {
            UI.print("你想對誰出招？", "error");
            return;
        }

        // 8. 執行絕招
        // 扣除內力
        playerData.attributes.force -= performData.forceCost;
        
        // 設定冷卻
        playerData.cooldowns[performId] = now + performData.cooldown;
        playerData.gcd = now + 2000; // 2秒公共冷卻

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

            // 取得房間內所有敵人 (這部分需要從 active_npcs 撈取)
            const activeRef = collection(db, "active_npcs");
            const q = query(activeRef, where("roomId", "==", playerData.location));
            const snapshot = await getDocs(q);
            
            let hitCount = 0;
            snapshot.forEach(async (doc) => {
                const enemy = doc.data();
                // 排除已昏迷或死掉的
                if (enemy.currentHp <= 0 || enemy.isUnconscious) return;

                // 執行傷害計算
                // AOE 傷害公式：(攻擊力 * 技能倍率 * Enforce倍率) - 防禦力 (簡化版)
                let damage = Math.floor(pStats.ap * performData.damageScale * enforceMult);
                // 扣一點隨機波動
                damage = Math.floor(damage * (0.9 + Math.random() * 0.2));
                
                // 簡單防禦扣減 (AOE 通常無視部分防禦或傷害較高，這裡簡單處理)
                // 實際應該讀取怪物防禦，但在這個系統層級可能要讀取 NPCDB，為效能先做簡易版
                // 這裡假設 AOE 威力巨大，直接造成大傷
                
                enemy.currentHp -= damage;
                hitCount++;

                // 更新怪物狀態
                // 注意：這裡直接寫入資料庫，CombatSystem 會監聽到變化
                await updatePlayer(userId, { 
                    "attributes.force": playerData.attributes.force,
                    [`cooldowns.${performId}`]: playerData.cooldowns[performId],
                    gcd: playerData.gcd
                });

                // 使用 CombatSystem 的介面更新怪物 (模擬)
                // 理想情況是調用 CombatSystem 的共用函式，這裡我們先直接更新 DB
                // 但要觸發擊殺獎勵比較麻煩，這裡建議在 Step 2 的 combat.js 暴露 helper
                // 目前先做簡單扣血
                const enemyRef = doc(db, "active_npcs", doc.id);
                if (enemy.currentHp <= 0) {
                     enemy.currentHp = 0;
                     enemy.isUnconscious = true;
                     UI.print(UI.txt(`${enemy.npcName} 被刀氣掃中，慘叫一聲倒地！`, "#ff5555"), "system", true);
                     // 這裡暫時無法觸發擊殺獎勵，Step 2 會補強
                } else {
                     UI.print(UI.txt(`(刀氣對 ${enemy.npcName} 造成 ${damage} 點傷害)`, "#ffff00"), "system", true);
                }
                
                await updatePlayer(userId, {}); // Dummy update to allow local refresh
                
                // 更新 NPC
                // 這裡需要像 combat.js 那樣 syncNpcState，Step 2 整合時會更順
                // 現在先用簡易寫入
                import("./combat.js").then(mod => {
                    // 嘗試觸發戰鬥狀態 (如果還沒戰鬥)
                    mod.CombatSystem.fight(playerData, [enemy.npcName], userId); 
                });
            });

            if (hitCount === 0) {
                UI.print("四周空蕩蕩的，你的絕招打了個寂寞。", "chat");
            }
            
        } 
        // === 執行：單體攻擊 / 連擊 / Debuff ===
        else {
            // 為了簡化，Step 1 我們先處理 "找目標" 的邏輯
            // 這裡我們需要一個方式取得 NPC 物件，類似 combat.js 的 findAliveNPC
            // 由於邏輯重複，我們暫時先用簡易版，Step 2 會將 findAliveNPC 導出
            
            // 假設已經鎖定目標，且目標在 active_npcs (若是戰鬥中)
            // 這裡我們發送一個特殊的 combat event 給 CombatSystem 處理可能更好
            // 但為了獨立性，我們先寫邏輯
            
            // **重要**：為了避免重複代碼，真正的「造成傷害」與「狀態應用」
            // 我們會在 Step 2 修改 combat.js 時，提供一個 `CombatSystem.applyDamage` 
            // 供這裡呼叫。
            
            // 現在我們先做 "確認目標存在" 與 "計算傷害數值"
            
            const damageBase = pStats.ap * performData.damageScale * enforceMult;
            
            // 呼叫 CombatSystem 處理實際打擊 (這是 Step 2 的預告)
            // 為了讓這段代碼現在能跑，我們先用簡單的 console log 或 UI print 模擬
            // 實際上，這需要引入 combat.js 的功能。
            
            // 暫時解決方案：把指令轉發給 CombatSystem 的新函數 (Step 2 實作)
            // 或者，我們在這裡引用 combat.js
            
            import("./combat.js").then(async (mod) => {
                // 呼叫我們將在 Step 2 實作的函數
                await mod.CombatSystem.handlePerformHit(playerData, userId, targetId, targetIndex, performData, damageBase);
            });
        }
        
        // 更新玩家狀態 (內力扣除、CD 更新)
        await updatePlayer(userId, { 
            "attributes.force": playerData.attributes.force,
            [`cooldowns.${performId}`]: playerData.cooldowns[performId],
            gcd: playerData.gcd
        });
    }
};