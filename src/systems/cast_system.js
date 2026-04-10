// src/systems/cast_system.js
// 茅山派（及未來其他法術門派）的 cast 法術指令系統

import { UI } from "../ui.js";
import { updatePlayer } from "./player.js";
import { MessageSystem } from "./messages.js";
import { SpellDB } from "../data/spells.js";
import { NPCDB } from "../data/npcs.js";
import { CombatSystem } from "./combat.js";
import { ConditionSystem } from "./conditions.js";
import { db } from "../firebase.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 計算基礎法術傷害（以法力上限為基礎）
function calcSpellDamage(playerData, spell) {
    const spellsLvl = playerData.skills?.spells || 1;
    const mpMax = playerData.attributes.maxMana || playerData.attributes.maxMp || 100;
    const mpCur = playerData.attributes.mana || playerData.attributes.mp || 0;
    
    // 基礎傷害 = 法力上限 × 倍率 × 咒術加成
    let baseDmg = mpMax * spell.damageScale;
    
    // 茅山弟子咒術等級加成 +1.5%/level
    const sectBonus = (playerData.family?.sect === 'maoshan') ? (1 + spellsLvl * 0.015) : 1;
    baseDmg = Math.floor(baseDmg * sectBonus);
    
    // 隨機浮動
    baseDmg = Math.floor(baseDmg * (0.9 + Math.random() * 0.2));
    return baseDmg;
}

// 取得 NPC 的 monsterType
function getNpcMonsterType(npcId) {
    const npcData = NPCDB[npcId];
    return npcData?.monsterType || null;
}

// 應用傷害（含類型加成）
function applyTypeBonus(spell, monsterType, damage) {
    if (!monsterType || !spell.bonusVs || !spell.bonusVs.includes(monsterType)) return damage;
    return Math.floor(damage * spell.bonusMultiplier);
}

// 查找 NPC 的 active_npcs uniqueId
function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

async function applySpellEffect(uniqueId, npcName, spell, playerLoc) {
    if (!spell.effect) return;
    const duration = spell.duration || 3;
    const expireAt = Date.now() + duration * 1000;
    
    try {
        const npcRef = doc(db, "active_npcs", uniqueId);
        await updateDoc(npcRef, {
            busy: expireAt,
            [`conditions.${spell.effect}`]: { id: spell.effect, expireAt }
        });
    } catch(e) {}

    if (spell.effect === 'stun') {
        UI.print(UI.txt(`你的咒術鎖住了對方的魂魄，${npcName} 動彈不得！(${duration}秒)`, "#cc88ff", true), "chat", true);
        MessageSystem.broadcast(playerLoc, UI.txt(`${npcName} 被鎖魂咒困住，無法行動！`, "#cc88ff", true));
    } else if (spell.effect === 'burn') {
        UI.print(UI.txt(`陰火附著在 ${npcName} 身上燃燒！(${duration}秒)`, "#ff6600", true), "chat", true);
        MessageSystem.broadcast(playerLoc, UI.txt(`${npcName} 被陰火纏身！`, "#ff6600", true));
    }
}

export const CastSystem = {
    execute: async (playerData, args, userId) => {
        // 狀態檢查
        if (playerData.state === 'exercising') {
            UI.print("你正在修練中，無法施放法術。", "error"); return;
        }
        if (playerData.isUnconscious) {
            UI.print("你已昏迷，無法施法。", "error"); return;
        }
        if (ConditionSystem.isStunned(playerData)) {
            UI.print(UI.txt("你的魂魄被鎖住，無法施展任何法術！", "#cc88ff"), "error"); return;
        }
        if (playerData.state !== 'fighting') {
            UI.print("法術只能在戰鬥中使用！先對敵人發動攻擊（fight）再施法。", "error"); return;
        }

        // 冷卻 GCD 檢查
        const now = Date.now();
        if (playerData.gcd && now < playerData.gcd) {
            UI.print("你氣息未定，無法連續施法。", "error"); return;
        }

        if (args.length === 0) {
            UI.print("你要施放哪個法術？(cast <法術ID> [目標]) — 輸入 help cast 查詢", "error"); return;
        }

        const spellId = args[0].toLowerCase();
        const spell = SpellDB[spellId];

        if (!spell) {
            UI.print(`不存在「${spellId}」這個法術。(輸入 help cast 查詢)`, "error"); return;
        }

        // 門派限制
        if (spell.sect && playerData.family?.sect !== spell.sect) {
            UI.print(`你尚未加入【${spell.sect}】門派，無法施展此法術。`, "error"); return;
        }

        // 法術技能確認
        const spellsLvl = playerData.skills?.spells || 0;
        if (spellsLvl <= 0) {
            UI.print("你對咒術一竅不通，無法施法。先向茅山師父學習基本咒術(spells)。", "error"); return;
        }

        const enabledSpell = playerData.enabled_skills?.spells;
        if (!enabledSpell) {
            UI.print("你尚未激發任何進階道術，無法施展法術！(請先 enable spells <進階武學ID>)", "error"); return;
        }

        // MP 消耗檢查
        const curMp = playerData.attributes.mp || playerData.attributes.mana || 0;
        if (curMp < spell.mpCost) {
            UI.print(`你的法力不足以施展【${spell.name}】。(需要: ${spell.mpCost}，當前: ${curMp})`, "error"); return;
        }

        // 冷卻檢查
        if (!playerData.cooldowns) playerData.cooldowns = {};
        if (playerData.cooldowns[spellId] && now < playerData.cooldowns[spellId]) {
            const wait = Math.ceil((playerData.cooldowns[spellId] - now) / 1000);
            UI.print(`【${spell.name}】還在冷卻中（剩餘 ${wait} 秒）。`, "error"); return;
        }

        // 解析目標
        let targetId = args[1];
        let targetIndex = args[2] ? parseInt(args[2]) : 1;
        if (!targetId && playerData.combatTarget) {
            targetId = playerData.combatTarget.id;
            targetIndex = playerData.combatTarget.index || 1;
        }
        if (!targetId && spell.type !== 'aoe') {
            UI.print("你要對誰施法？", "error"); return;
        }

        // 扣除 MP + 設定冷卻
        playerData.attributes.mp = (playerData.attributes.mp || 0) - spell.mpCost;
        playerData.cooldowns[spellId] = now + spell.cooldown;
        playerData.gcd = now + 2500;

        await updatePlayer(userId, {
            "attributes.mp": playerData.attributes.mp,
            [`cooldowns.${spellId}`]: playerData.cooldowns[spellId],
            gcd: playerData.gcd
        });

        // ================== AOE ==================
        if (spell.type === 'aoe') {
            const msg = spell.msg(playerData.name);
            UI.print(msg, "chat", true);
            MessageSystem.broadcast(playerData.location, msg);

            const q = query(collection(db, "active_npcs"), where("roomId", "==", playerData.location));
            const snapshot = await getDocs(q);
            let hitCount = 0;

            for (const docSnap of snapshot.docs) {
                const enemy = docSnap.data();
                const enemyId = docSnap.id;
                if (enemy.currentHp <= 0 || enemy.isUnconscious) continue;

                let damage = calcSpellDamage(playerData, spell);
                const monsterType = getNpcMonsterType(enemy.npcId);
                damage = applyTypeBonus(spell, monsterType, damage);

                const npcData = NPCDB[enemy.npcId] || { name: enemy.npcName, id: enemy.npcId, combat: { maxHp: enemy.maxHp }, drops: [] };
                const npcObj = { ...npcData, id: enemy.npcId, index: 1, combat: npcData.combat };

                // 顯示加成訊息
                if (monsterType && spell.bonusVs?.includes(monsterType)) {
                    UI.print(UI.txt(`【法術剋制！】對 ${enemy.npcName} 造成 ${damage} 點傷害！`, "#ffdd00", true), "system", true);
                }

                await CombatSystem.applyDamage(enemyId, damage, playerData, userId, npcObj);
                hitCount++;
            }

            if (hitCount === 0) UI.print("這裡空無一物，你的法術打了個空。", "chat");
            return;
        }

        // 找目標 NPC
        const room = { location: playerData.location };
        let npcMatchCount = 0;
        let foundNpc = null;
        let foundUniqueId = null;

        // 在 active_npcs 找符合的目標
        const npcQ = query(collection(db, "active_npcs"), where("roomId", "==", playerData.location));
        const npcSnap = await getDocs(npcQ);
        for (const ds of npcSnap.docs) {
            const data = ds.data();
            if (data.npcId !== targetId && ds.id.includes(`_${targetId}_`)) {
                // 嘗試從 uniqueId 匹配
            }
            if (data.npcId === targetId) {
                npcMatchCount++;
                if (npcMatchCount === targetIndex) {
                    foundNpc = NPCDB[targetId];
                    foundNpc = { ...foundNpc, id: targetId, index: targetIndex };
                    foundUniqueId = ds.id;
                    if (data.currentHp <= 0) {
                        UI.print(`${foundNpc.name} 已經倒下了。`, "system"); return;
                    }
                    break;
                }
            }
        }

        if (!foundNpc) {
            UI.print("找不到那個目標，請確認目標 ID 是否正確。", "error"); return;
        }

        // 計算傷害＋類型加成
        let damage = calcSpellDamage(playerData, spell);
        const monsterType = getNpcMonsterType(foundNpc.id);
        const wasBonus = (monsterType && spell.bonusVs?.includes(monsterType));
        if (wasBonus) damage = applyTypeBonus(spell, monsterType, damage);

        // 顯示施法訊息
        const msg = spell.msg(playerData.name, foundNpc.name);
        UI.print(msg, "chat", true);
        MessageSystem.broadcast(playerData.location, msg);

        if (wasBonus) {
            UI.print(UI.txt(`【天克！】你的法術對 ${foundNpc.name}（${monsterType}）有特效！傷害 ×${spell.bonusMultiplier}！`, "#ffdd00", true), "system", true);
        }

        // DoT 法術（陰火符）
        if (spell.type === 'dot') {
            // 先造成初始傷害
            await CombatSystem.applyDamage(foundUniqueId, damage, playerData, userId, foundNpc);
            // 再套用燃燒狀態（由 combat loop 處理 tick 傷害，重用 bleed 邏輯）
            if (spell.effect) {
                await applySpellEffect(foundUniqueId, foundNpc.name, spell, playerData.location);
            }
            return;
        }

        // 單體 or 控制
        await CombatSystem.applyDamage(foundUniqueId, damage, playerData, userId, foundNpc);

        // 套用控制效果
        if (spell.effect) {
            const freshSnap = await getDoc(doc(db, "active_npcs", foundUniqueId));
            if (freshSnap.exists() && freshSnap.data().currentHp > 0) {
                await applySpellEffect(foundUniqueId, foundNpc.name, spell, playerData.location);
            }
        }
    }
};
