// src/systems/conditions.js
import { UI } from "../ui.js";

// 支援的狀態定義
export const ConditionDefs = {
    "poison": {
        name: "中毒",
        type: "debuff", 
        tick: (entity) => {
            if (!entity.attributes) return false;
            const dmg = 10;
            // 確保有血可以扣
            if (entity.attributes.hp > 0) {
                entity.attributes.hp -= dmg;
                if (entity.attributes.hp < 0) entity.attributes.hp = 0;
                UI.print(`你感到一陣劇毒攻心，損失了 ${dmg} 點氣血。`, "error");
            }
            return true;
        }
    },
    "shield": {
        name: "金鐘罩",
        type: "buff",
        modifier: (stats) => {
            stats.dp += 50; // 防禦增加 50
        }
    }
};

export const ConditionSystem = {
    // 套用狀態
    applyCondition: (entity, condId, durationTicks) => {
        if (!entity.conditions) entity.conditions = {};
        if (entity.conditions[condId]) {
            // 覆蓋時間
            entity.conditions[condId].ticks = Math.max(entity.conditions[condId].ticks, durationTicks);
        } else {
            entity.conditions[condId] = {
                id: condId,
                ticks: durationTicks
            };
            const def = ConditionDefs[condId];
            if (def) UI.print(`你受到了【${def.name}】的影響。`, "system");
        }
    },
    
    // 移除狀態
    removeCondition: (entity, condId) => {
        if (entity.conditions && entity.conditions[condId]) {
            const def = ConditionDefs[condId];
            if (def) UI.print(`你身上的【${def.name}】狀態消失了。`, "system");
            delete entity.conditions[condId];
        }
    },

    // 心跳觸發 (回傳 true 代表屬性有變動需立刻存檔)
    tickConditions: (entity) => {
        if (!entity.conditions) return false;
        let changed = false;
        const toRemove = [];
        for (const [condId, condData] of Object.entries(entity.conditions)) {
            const def = ConditionDefs[condId];
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
    }
};
