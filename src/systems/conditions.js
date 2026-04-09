// src/systems/conditions.js
import { UI } from "../ui.js";
import { db } from "../firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 支援的狀態定義
export const ConditionDefs = {
    "poison": {
        name: "中毒",
        type: "debuff",
        icon: "☠",
        color: "#aa00ff",
        tick: (entity) => {
            if (!entity.attributes) return false;
            const dmg = 10;
            if (entity.attributes.hp > 0) {
                entity.attributes.hp -= dmg;
                if (entity.attributes.hp < 0) entity.attributes.hp = 0;
                UI.print(`你感到一陣劇毒攻心，損失了 ${UI.txt(dmg, '#aa00ff', true)} 點氣血。`, "error");
            }
            return true;
        }
    },
    "bleed": {
        name: "流血",
        type: "debuff",
        icon: "🩸",
        color: "#cc0000",
        tick: (entity) => {
            if (!entity.attributes) return false;
            const dmg = 15;
            if (entity.attributes.hp > 0) {
                entity.attributes.hp -= dmg;
                if (entity.attributes.hp < 0) entity.attributes.hp = 0;
                UI.print(`你的傷口不斷滲血，損失了 ${UI.txt(dmg, '#cc0000', true)} 點氣血。`, "error");
            }
            return true;
        }
    },
    "stun": {
        name: "點穴",
        type: "debuff",
        icon: "💫",
        color: "#ffdd00",
        onApply: (entity) => {
            UI.print(UI.txt("你被對方點中要穴，全身穴道封閉，動彈不得！", "#ffdd00", true), "error");
        },
        onRemove: (entity) => {
            UI.print(UI.txt("你通體一震，穴道終於解開，行動自如了！", "#aaffaa", true), "system");
        }
    },
    "shield": {
        name: "金鐘罩",
        type: "buff",
        icon: "🛡",
        color: "#ffd700",
        modifier: (stats) => {
            stats.dp += 50;
        }
    }
};

export const ConditionSystem = {
    // 套用狀態到玩家 (with Firestore sync)
    applyToPlayer: async (userId, playerData, condId, durationSec) => {
        if (!playerData.conditions) playerData.conditions = {};
        const durationMs = durationSec * 1000;
        const expireAt = Date.now() + durationMs;
        
        const def = ConditionDefs[condId];
        const isRefresh = !!playerData.conditions[condId];
        playerData.conditions[condId] = { id: condId, expireAt };
        
        if (def) {
            if (!isRefresh && def.onApply) def.onApply(playerData);
            else if (!isRefresh) UI.print(`你受到了【${UI.txt(def.name, def.color, true)}】的影響。`, "system");
        }
        
        try {
            await updateDoc(doc(db, "players", userId), {
                [`conditions.${condId}`]: { id: condId, expireAt }
            });
        } catch(e) { console.error("寫入 condition 失敗", e); }
    },

    // 套用狀態到 NPC (記錄在 active_npcs 的 stun 欄位)
    applyToNpc: async (uniqueId, condId, durationSec) => {
        const expireAt = Date.now() + durationSec * 1000;
        try {
            const { doc: fsDoc, updateDoc: fsUpdate } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const ref = fsDoc(db, "active_npcs", uniqueId);
            await fsUpdate(ref, { [`conditions.${condId}`]: { id: condId, expireAt } });
        } catch(e) { console.error("寫入 NPC condition 失敗", e); }
    },

    // 檢查玩家是否有某狀態（基於時間戳）
    hasCondition: (playerData, condId) => {
        if (!playerData.conditions || !playerData.conditions[condId]) return false;
        return Date.now() < playerData.conditions[condId].expireAt;
    },

    // 檢查玩家是否被點穴（stun = 無法任何行動）
    isStunned: (playerData) => {
        return ConditionSystem.hasCondition(playerData, 'stun');
    },

    // 套用狀態 (舊接口，用於回合制 tick，保留相容)
    applyCondition: (entity, condId, durationTicks) => {
        if (!entity.conditions) entity.conditions = {};
        if (entity.conditions[condId]) {
            entity.conditions[condId].ticks = Math.max(entity.conditions[condId].ticks, durationTicks);
        } else {
            entity.conditions[condId] = { id: condId, ticks: durationTicks };
            const def = ConditionDefs[condId];
            if (def) UI.print(`你受到了【${def.name}】的影響。`, "system");
        }
    },
    
    // 移除狀態
    removeCondition: (entity, condId) => {
        if (entity.conditions && entity.conditions[condId]) {
            const def = ConditionDefs[condId];
            if (def && def.onRemove) def.onRemove(entity);
            else if (def) UI.print(`你身上的【${def.name}】狀態消失了。`, "system");
            delete entity.conditions[condId];
        }
    },

    // 心跳觸發 (回傳 true 代表屬性有變動需立刻存檔)
    tickConditions: (entity) => {
        if (!entity.conditions) return false;
        let changed = false;
        const toRemove = [];
        const now = Date.now();
        
        for (const [condId, condData] of Object.entries(entity.conditions)) {
            const def = ConditionDefs[condId];
            
            // 新式時間戳模式
            if (condData.expireAt !== undefined) {
                if (now >= condData.expireAt) {
                    toRemove.push(condId);
                    changed = true;
                    continue;
                }
                if (def && def.tick) {
                    const tickRes = def.tick(entity);
                    if (tickRes) changed = true;
                }
            } else {
                // 舊式 ticks 模式（相容）
                if (def && def.tick) {
                    const tickRes = def.tick(entity);
                    if (tickRes) changed = true;
                }
                condData.ticks--;
                if (condData.ticks <= 0) {
                    changed = true;
                    toRemove.push(condId);
                }
            }
        }
        for (const rid of toRemove) {
            ConditionSystem.removeCondition(entity, rid);
        }
        return changed;
    },

    // 取得數值屬性修正
    applyModifiers: (entity, stats) => {
        if (!entity.conditions) return;
        for (const [condId, condData] of Object.entries(entity.conditions)) {
            const def = ConditionDefs[condId];
            if (def && def.modifier) {
                def.modifier(stats);
            }
        }
    },

    // 取得狀態列表（用於顯示）
    getActiveList: (playerData) => {
        if (!playerData.conditions) return [];
        const now = Date.now();
        const result = [];
        for (const [condId, condData] of Object.entries(playerData.conditions)) {
            const def = ConditionDefs[condId];
            if (!def) continue;
            if (condData.expireAt !== undefined && now >= condData.expireAt) continue;
            const remaining = condData.expireAt ? Math.ceil((condData.expireAt - now) / 1000) : condData.ticks;
            result.push({ id: condId, name: def.name, icon: def.icon || '', color: def.color || '#fff', remaining });
        }
        return result;
    }
};
