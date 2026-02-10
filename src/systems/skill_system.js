// src/systems/skill_system.js
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; 
import { db } from "../firebase.js"; 
import { UI } from "../ui.js";
import { SkillDB, getSkillLevelDesc } from "../data/skills.js"; 
import { updatePlayer, getEffectiveSkillLevel } from "./player.js"; 
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js";
import { NPCDB } from "../data/npcs.js";
import { ItemDB } from "../data/items.js";

let autoForceInterval = null; 
let isProcessing = false; // 防止異步操作重疊的鎖

// === 升級所需經驗值公式 (極速升級版) ===
function calculateMaxExp(level) {
    if (level < 150) {
        return Math.pow(level + 1, 2) * 5;
    } else {
        return Math.pow(level + 1, 3);
    }
}

function findNPCInRoom(roomId, npcNameOrId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;
    if (room.npcs.includes(npcNameOrId)) {
        const index = room.npcs.indexOf(npcNameOrId);
        const npcData = NPCDB[npcNameOrId];
        return { ...npcData, index: index };
    }
    for (let i = 0; i < room.npcs.length; i++) {
        const nid = room.npcs[i];
        const npc = NPCDB[nid];
        if (npc && npc.name === npcNameOrId) return { ...npc, index: i };
    }
    return null;
}

export const SkillSystem = {
    // === 讀書 (Study) ===
    study: async (p, args, userId) => {
        if (p.state === 'fighting') return UI.print("戰鬥中無法讀書！", "error");
        if (p.state === 'busy') return UI.print("你現在正忙著。", "error");

        const bookId = args[0];
        let count = parseInt(args[1]) || 1;
        if (count < 1) count = 1;
        if (count > 50) count = 50; 

        if (!bookId) return UI.print("指令格式：study <物品id> [次數]", "system");

        // 檢查背包是否有這本書
        const bookItem = p.inventory ? p.inventory.find(i => i.id === bookId) : null;
        if (!bookItem) return UI.print("你身上沒有這本書。", "error");

        const itemInfo = ItemDB[bookId];
        if (!itemInfo || itemInfo.type !== 'book') return UI.print("這不是書。", "error");

        const targetSkillId = itemInfo.skill; // 例如 'literate', 'buddhism', 'spells'
        const maxBookLevel = itemInfo.maxLevel || 60; // 書籍等級上限，預設 60

        if (!targetSkillId) return UI.print("這本書似乎太深奧了，你看不出個所以然。", "error");

        // 檢查當前技能等級
        const currentLvl = p.skills[targetSkillId] || 0;
        
        // 硬上限檢查：書籍最高只能讀到 60 (高級需拜師)
        if (currentLvl >= 60 && maxBookLevel >= 60) {
            UI.print(`你覺得《${itemInfo.name}》上的知識你已經完全掌握了，再讀也沒用。(上限 60 級)`, "system");
            return;
        }

        // 書籍上限檢查
        if (currentLvl >= maxBookLevel) {
            UI.print(`你已經完全讀通了《${itemInfo.name}》，這本書對你已無幫助。`, "system");
            return;
        }

        UI.print(`你翻開《${itemInfo.name}》，開始研讀...`, "system");

        let actualCount = 0;
        let totalGain = 0;
        let isLevelUp = false;

        const mpCost = 20; // 每次讀書消耗 20 點神 (MP)
        const int = p.attributes.int || 20; // 悟性
        const literateLvl = p.skills['literate'] || 0; // 讀書識字等級

        for (let i = 0; i < count; i++) {
            if (p.attributes.mp < mpCost) {
                UI.print(actualCount > 0 ? `你讀了 ${actualCount} 次，覺得腦袋發脹，需要休息。(需要神: ${mpCost})` : `你現在精神不濟，無法讀書。(需要神: ${mpCost})`, "error");
                break;
            }

            p.attributes.mp -= mpCost;

            // === 經驗值公式 ===
            // 獲得經驗 = (悟性 * 2) + (讀書識字等級 * 1) + 隨機浮動
            let gain = (int * 2) + (literateLvl * 1) + Math.floor(Math.random() * 10);
            if (gain < 1) gain = 1;

            if (!p.skill_exp) p.skill_exp = {};
            if (!p.skill_exp[targetSkillId]) p.skill_exp[targetSkillId] = 0;

            p.skill_exp[targetSkillId] += gain;
            totalGain += gain;
            actualCount++;

            const maxExp = calculateMaxExp(currentLvl);

            if (p.skill_exp[targetSkillId] >= maxExp) {
                p.skills[targetSkillId] = currentLvl + 1;
                p.skill_exp[targetSkillId] -= maxExp;
                
                const skillName = SkillDB[targetSkillId] ? SkillDB[targetSkillId].name : targetSkillId;
                UI.print(UI.txt(`在第 ${actualCount} 次研讀中，你豁然開朗！${skillName} 提升到了 ${p.skills[targetSkillId]} 級！`, "#00ff00", true), "system", true);
                isLevelUp = true;
                break;
            }
        }

        if (actualCount > 0 && !isLevelUp) {
            UI.print(`你研讀了 ${actualCount} 次《${itemInfo.name}》，獲得了 ${totalGain} 點經驗。`, "system");
        }

        await updatePlayer(userId, { 
            "attributes.mp": p.attributes.mp,
            "skills": p.skills,
            "skill_exp": p.skill_exp
        });
    },

    // === 自動修練內力 (Auto Force) - 蓄力爆發版 ===
    autoForce: async (p, a, u) => {
        // 如果已經在修練，則停止
        if (autoForceInterval || p.state === 'exercising') {
            if (autoForceInterval) clearInterval(autoForceInterval);
            autoForceInterval = null;
            isProcessing = false;
            p.state = 'normal';
            await updatePlayer(u, { state: 'normal' });
            UI.print("你停止了自動修練內力。", "system");
            return;
        }

        if (p.state === 'fighting') {
            UI.print("戰鬥中無法修練！", "error");
            return;
        }

        p.state = 'exercising';
        await updatePlayer(u, { state: 'exercising' });
        UI.print("你盤膝而坐，閉目凝神，準備衝擊內力瓶頸...", "system");
        UI.print(UI.txt("【系統】自動循環：積蓄氣血 -> 一次性補滿內力 -> 突破上限", "#00ffff"), "system", true);
        
        // 重置鎖定狀態
        isProcessing = false;
        let isWaitingForRegen = false;

        autoForceInterval = setInterval(async () => {
            if (isProcessing) return;
            isProcessing = true;

            try {
                // 每次循環都從資料庫抓取「最新」的玩家狀態
                const playerRef = doc(db, "players", u);
                const playerSnap = await getDoc(playerRef);

                if (!playerSnap.exists()) {
                    clearInterval(autoForceInterval);
                    autoForceInterval = null;
                    return;
                }

                const freshP = playerSnap.data();

                // 安全檢查
                if (freshP.state !== 'exercising') {
                    clearInterval(autoForceInterval);
                    autoForceInterval = null;
                    return;
                }

                const attr = freshP.attributes;
                const maxForce = attr.maxForce;
                const curForce = attr.force;
                const curHp = attr.hp;
                const limit = maxForce * 2;
                
                // 1. 如果內力還沒滿 2 倍 -> 計算需要多少氣血才能「一次補滿」
                if (curForce < limit) {
                    const neededForce = limit - curForce;
                    const hpCostNeeded = neededForce; 
                    
                    // 檢查當前氣血是否足夠「一次性」補滿，並保留 10 點
                    if (curHp > hpCostNeeded + 10) {
                        if (isWaitingForRegen) {
                            isWaitingForRegen = false;
                            UI.print(UI.txt("氣血充盈，開始衝擊氣脈！", "#00ff00"), "system", true);
                        }
                        // 執行大額修練
                        await SkillSystem.trainStat(freshP, u, "內力", "force", "maxForce", "hp", "氣", [neededForce.toString()]);
                    } else {
                        // 氣血不足，進入等待模式
                        if (!isWaitingForRegen) {
                            isWaitingForRegen = true;
                            const missingHp = hpCostNeeded + 10 - curHp;
                            UI.print(UI.txt(`氣血不足以一次貫通 (缺 ${missingHp} 氣)，暫停運功積蓄氣血...`, "#888888"), "system", true);
                            UI.updateHUD(freshP);
                        }
                    }
                } 
                // 2. 內力已達 2 倍 -> 執行突破
                else {
                    if (curHp <= 20) {
                         if (!isWaitingForRegen) {
                            isWaitingForRegen = true;
                            UI.print(UI.txt("氣血虛弱，暫停運功調理...", "#888888"), "system", true);
                            UI.updateHUD(freshP);
                        }
                    } else {
                        if (isWaitingForRegen) isWaitingForRegen = false;
                        await SkillSystem.trainStat(freshP, u, "內力", "force", "maxForce", "hp", "氣", ["1"]);
                    }
                }

            } catch (error) {
                console.error("AutoForce Error:", error);
                UI.print("修練過程發生未知錯誤，系統嘗試恢復...", "error");
            } finally {
                isProcessing = false;
            }

        }, 2000); // 2 秒一次循環
    },

    // === 屬性修練 (Exercise/Respirate/Meditate) - 整合版 ===
    trainStat: async (playerData, userId, typeName, attrCur, attrMax, costAttr, costName, args) => {
        if (playerData.state === 'fighting') {
            UI.print("戰鬥中無法修練！", "error");
            return;
        }

        const attr = playerData.attributes;
        let cost = 10;

        const maxVal = attr[attrMax];
        const curVal = attr[attrCur];
        const limit = maxVal * 2; 
        
        const isDoubleMode = (args && args[0] === 'double');

        if (isDoubleMode) {
            if (curVal >= limit) {
                UI.print(UI.txt(`你的${typeName}已經運轉至極限(${limit})，無法再容納更多了。`, "#ffff00"), "system", true);
                if (autoForceInterval) {
                    clearInterval(autoForceInterval);
                    autoForceInterval = null;
                    isProcessing = false;
                    playerData.state = 'normal';
                    await updatePlayer(userId, { state: 'normal' });
                    UI.print("內力已蓄滿，自動修練停止。", "system");
                }
                return;
            }

            const needed = limit - curVal;
            const safeAvailable = Math.max(0, attr[costAttr] - 10);

            if (safeAvailable <= 0) {
                 UI.print(`你的${costName}不足，無法運氣。`, "error");
                 return;
            }

            cost = Math.min(needed, safeAvailable);
            if (cost < 1) cost = 10;

        } else if (args && args.length > 0) {
            const parsed = parseInt(args[0]);
            if (!isNaN(parsed) && parsed > 0) cost = parsed;
        }

        // 檢查消耗是否足夠
        if (attr[costAttr] < cost) { 
            if (!autoForceInterval) {
                UI.print(`你的${costName}不足，無法修練。(需要 ${cost})`, "error"); 
            }
            return; 
        }

        // === 瓶頸與上限檢查邏輯 ===
        let isCapReached = false;
        let maxCap = 999999;
        let skillReqName = "";
    
        if (typeName === "內力") {
            const forceSkillLvl = playerData.skills.force || 0;
            const conBonus = playerData.attributes.con || 20;
            maxCap = (forceSkillLvl + conBonus) * 10;
            skillReqName = "基本內功";
        } 
        else if (typeName === "靈力") {
            // 靈力瓶頸：佛學淵源等級 * 10
            const buddhismLvl = playerData.skills.buddhism || 0;
            maxCap = buddhismLvl * 10;
            skillReqName = "佛學淵源";
            
            if (buddhismLvl < 10 && maxVal >= 100) { // 基礎門檻
                 UI.print("你對佛學的領悟不夠，無法凝聚更高深的靈力。", "error");
                 return;
            }
        }
        else if (typeName === "法力") {
            // 法力瓶頸：基本咒術等級 * 10
            const spellsLvl = playerData.skills.spells || 0;
            maxCap = spellsLvl * 10;
            skillReqName = "基本咒術";

            if (spellsLvl < 10 && maxVal >= 100) { // 基礎門檻
                 UI.print("你對咒術的理解不夠，無法凝聚更高深的法力。", "error");
                 return;
            }
        }

        if (maxVal >= maxCap) {
            isCapReached = true;
        }

        // 計算獲得量 (可根據悟性或技能微調，這裡暫定為 1:1 + 技能加成)
        let skillBonus = 0;
        if(typeName === "內力") skillBonus = Math.floor((playerData.skills?.force || 0) / 10);
        
        const gain = cost + skillBonus; 
        let improved = false;
        let autoStopped = false; 
        
        // 判斷是否超過當前上限 (limit)
        if (curVal + gain >= limit) {
            if (isDoubleMode) {
                // 只是填滿，不突破
                attr[costAttr] -= cost;
                attr[attrCur] = limit;
                let msg = `你運轉周天，消耗 ${cost} 點${costName}，將${typeName}積蓄到了極限 (${limit})。`;
                UI.print(msg, "system", true);
            } else {
                // === 嘗試突破上限 (已修改：移除潛能消耗) ===
                attr[costAttr] -= cost; 

                if (isCapReached) {
                    attr[attrCur] = limit;
                    
                    const capMsg = `你的${skillReqName}修為受限(${maxCap})，只能積蓄${typeName}至 ${limit}，無法提升上限。`;
                    UI.print(UI.txt(capMsg, "#ffaa00"), "system", true);

                    if (autoForceInterval) {
                        clearInterval(autoForceInterval);
                        autoForceInterval = null;
                        isProcessing = false;
                        playerData.state = 'normal';
                        autoStopped = true;
                        UI.print("由於達到瓶頸，自動修練已停止。", "system");
                    }

                } else {
                    // === 突破成功，提升上限 ===
                    attr[attrMax] += 1; 
                    attr[attrCur] = attr[attrMax]; 
                    
                    improved = true;
                    let msg = `你運轉周天，只覺體內轟的一聲... ` + UI.txt(`你的${typeName}上限提升了！`, "#ffff00", true);
                    UI.print(msg, "system", true);

                    // [連動屬性提升]
                    if (typeName === "內力") {
                        attr.maxHp = (attr.maxHp || 100) + 2;
                        attr.hp += 2;
                        UI.print(UI.txt(`受到真氣滋養，你的氣血上限也隨之提升了！`, "#00ff00"), "system", true);
                    }
                    else if (typeName === "靈力") {
                        attr.maxSp = (attr.maxSp || 100) + 1; // 提升靈力同時提升 精
                        attr.sp += 1;
                        UI.print(UI.txt(`隨著靈力增長，你的精神上限也提升了！`, "#00ff00"), "system", true);
                    }
                    else if (typeName === "法力") {
                        attr.maxMp = (attr.maxMp || 100) + 1; // 提升法力同時提升 神
                        attr.mp += 1;
                        UI.print(UI.txt(`隨著法力精進，你的心神上限也提升了！`, "#00ff00"), "system", true);
                    }
                }
            }

        } else {
            // 一般積蓄 (未達上限)
            attr[costAttr] -= cost;
            const newVal = curVal + gain;
            attr[attrCur] = Math.min(limit, newVal);
            
            let msg = "";
            if (cost > 100) {
                 msg = `你深吸一口氣，將全身 ${cost} 點${costName}盡數化為${typeName}，修為大增！`;
            } else {
                 msg = `你運轉周天，消耗 ${cost} 點${costName}，將其轉化為${typeName} ... `;
            }

            if (attr[attrCur] > maxVal) {
                msg += `(${attr[attrCur]}/${maxVal} <span style="color:#00ff00">+${attr[attrCur] - maxVal}</span>)`;
                if (cost > 100) msg += " 真氣在體內奔騰，勢不可擋！";
                else msg += " 真氣在丹田內鼓盪，隨時可能突破。";
                UI.print(msg, "system", true);
            } else {
                msg += `(${attr[attrCur]}/${maxVal})`;
                UI.print(msg, "system");
            }
        }
    
        UI.updateHUD(playerData);
    
        let updateData = { 
            [`attributes.${costAttr}`]: attr[costAttr],
            [`attributes.${attrCur}`]: attr[attrCur]
        };

        if (improved) {
            updateData[`attributes.${attrMax}`] = attr[attrMax];
            
            if (typeName === "內力") {
                updateData["attributes.maxHp"] = attr.maxHp;
                updateData["attributes.hp"] = attr.hp;
            }
            else if (typeName === "靈力") {
                updateData["attributes.maxSp"] = attr.maxSp;
                updateData["attributes.sp"] = attr.sp;
            }
            else if (typeName === "法力") {
                updateData["attributes.maxMp"] = attr.maxMp;
                updateData["attributes.mp"] = attr.mp;
            }
        }

        if (autoStopped) {
             updateData["state"] = "normal";
        }

        await updatePlayer(userId, updateData);
    },

    exert: async (playerData, args, userId) => {
        if (playerData.state === 'exercising') {
            UI.print("你正在專心修練，無法分心運功。(輸入 autoforce 解除)", "error");
            return;
        }

        if (args.length === 0) {
            UI.print("指令格式: exert <regenerate|recover|refresh>", "error");
            return;
        }
        const type = args[0].toLowerCase();
        let targetCur, targetMax, name;

        if (type === 'recover') { targetCur = 'hp'; targetMax = 'maxHp'; name = '氣'; }
        else if (type === 'regenerate') { targetCur = 'sp'; targetMax = 'maxSp'; name = '精'; }
        else if (type === 'refresh') { targetCur = 'mp'; targetMax = 'maxMp'; name = '神'; }
        else { UI.print("未知的功能。請使用 recover(氣), regenerate(精), refresh(神)。", "error"); return; }

        const attr = playerData.attributes;
        if (attr[targetCur] >= attr[targetMax]) {
            UI.print(`你的${name}現在很充沛，不需要運功。`, "system");
            return;
        }

        const currentForce = attr.force;
        if (currentForce <= 0) {
            UI.print("你現在一點內力也沒有。", "error");
            return;
        }

        const forceLvl = getEffectiveSkillLevel(playerData, 'force');
        const factor = 0.5 + (forceLvl / 100);

        const missing = attr[targetMax] - attr[targetCur];
        let cost = Math.ceil(missing / factor);

        let actualRecover = 0;
        let actualCost = 0;

        if (currentForce >= cost) {
            actualCost = cost;
            actualRecover = missing;
            attr.force -= actualCost;
            attr[targetCur] = attr[targetMax];
        } else {
            actualCost = currentForce;
            actualRecover = Math.floor(actualCost * factor);
            attr.force = 0;
            attr[targetCur] += actualRecover;
        }

        UI.print(`你運功${name === '氣' ? '療傷' : '提氣'}，消耗 ${actualCost} 點內力，恢復了 ${actualRecover} 點${name}。`, "system");
        
        UI.updateHUD(playerData);
        
        const updateData = {
            "attributes.force": attr.force,
            [`attributes.${targetCur}`]: attr[targetCur]
        };
        await updatePlayer(userId, updateData);
    },

    skills: (playerData) => {
        const skills = playerData.skills || {};
        const skillExps = playerData.skill_exp || {}; 
        
        const skillList = Object.entries(skills);
        if (skillList.length === 0) { UI.print("你目前什麼都不會。", "chat"); return; }
        
        let html = UI.titleLine(`${playerData.name} 的武學`);
        
        html += `<div style="display:grid; grid-template-columns: 2fr 0.5fr 1.2fr 0.8fr auto; gap: 5px; align-items:center; font-size: 14px;">`;
        
        for (const [id, level] of skillList) {
            const info = SkillDB[id];
            if(id === 'parry') continue; 
            const name = info ? info.name : id;
            const desc = getSkillLevelDesc(level);
            let statusMark = "";
            let practiceBtn = "";

            if (info && !info.base) {
                if (info.type === 'martial' || info.type === 'dodge') {
                    if (info.type !== 'force') {
                        practiceBtn = UI.makeCmd("【練10】", `practice ${id} 10`, "cmd-btn");
                    }
                }
            }
            
            if (playerData.enabled_skills) {
                for (const [slot, equippedId] of Object.entries(playerData.enabled_skills)) {
                    if (equippedId === id) statusMark = UI.txt(`[${slot}]`, "#00ff00");
                }
            }

            let enableBtn = "";
            if (info && info.base) {
                const isEnabled = playerData.enabled_skills && playerData.enabled_skills[info.base] === id;
                enableBtn = UI.makeCmd(isEnabled ? "【解除】" : "【激發】", isEnabled ? `unenable ${info.base}` : `enable ${info.base} ${id}`, "cmd-btn");
            }

            const curExp = skillExps[id] || 0;
            const maxExp = calculateMaxExp(level);
            const expText = `<span style="font-size:0.9em; color:#888;">(${curExp}/${maxExp})</span>`;

            const rowStyle = "padding: 4px 0; border-bottom: 1px dashed #333;";
            
            html += `<div style="${rowStyle} color:#fff;">${name} <span style="color:#aaa; font-size:0.9em;">(${id})</span> ${statusMark}</div>`;
            html += `<div style="${rowStyle}">${UI.txt(level+"級", "#00ffff")}</div>`;
            html += `<div style="${rowStyle}">${expText}</div>`;
            html += `<div style="${rowStyle} font-size:0.9em;">${desc}</div>`;
            html += `<div style="${rowStyle} text-align:right;">${practiceBtn}${enableBtn}</div>`;
        }
        html += `</div>` + UI.titleLine("End");
        UI.print(html, 'chat', true);
    },

    apprentice: async (playerData, args, userId) => {
        if (args.length === 0) { UI.print("你想拜誰為師？", "error"); return; }
        const npc = findNPCInRoom(playerData.location, args[0]);
        if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }
        if (!npc.family) { UI.print(`${npc.name} 說道：「我只是一介平民，不懂收徒。」`, "chat"); return; }
        
        if (playerData.family) {
            if (playerData.family.masterId === npc.id) { 
                UI.print(`你已經是 ${npc.name} 的徒弟了。`, "error"); 
                return; 
            }
            if (playerData.family.sect === npc.family) {
                UI.print(`${npc.name} 點點頭道：「既然是同門師兄弟，那我就指點你一二吧。」`, "chat");
                UI.print(UI.txt(`你獲得了 ${npc.name} 的指導。`, "#00ff00"), "system", true);
                return;
            }
            
            UI.print(`你已經有師父了，是 ${playerData.family.masterId}。`, "error"); 
            return; 
        }

        let msg = "";
        if (npc.id === 'gym_master') msg = `${npc.name} 哈哈大笑，拍了拍你的頭說道：「好！很有精神！今日我就收你為徒！」`;
        else msg = `${npc.name} 微微頷首，說道：「既然你有此誠意，我便收你為徒。」`;
        UI.print(msg, "chat");
        
        MessageSystem.broadcast(playerData.location, `${playerData.name} 恭恭敬敬地向 ${npc.name} 磕了三個響頭，拜入其門下。`);

        playerData.family = { masterId: npc.id, masterName: npc.name, sect: npc.family };
        playerData.sect = npc.family === 'common_gym' ? '飛龍武館' : npc.family;
        await updatePlayer(userId, { family: playerData.family, sect: playerData.sect });
    },

    betray: async (p, a, u) => {
        if (!p.family) {
            UI.print("你現在無門無派，何來叛師之說？", "error");
            return;
        }

        const familyName = p.sect || p.family.sect;
        
        if (p.family.sect === 'common_gym') {
            UI.print(`你決定離開${familyName}，去外面的世界闖一闖。`, "system");
            UI.print("因為飛龍武館只是基礎武館，並沒有人阻攔你。", "chat");
            
            p.family = null;
            p.sect = "none";
            
            await updatePlayer(u, { family: null, sect: "none" });
            MessageSystem.broadcast(p.location, `${p.name} 決定離開飛龍武館，自立門戶。`);
            return;
        }

        UI.print(`${p.family.masterName} 怒喝道：「欺師滅祖之徒，今日我便清理門戶！」`, "error");
        UI.print(UI.txt("（系統提示：目前版本尚未實裝其他門派的叛師懲罰，但未來可能會導致嚴重後果。）", "#ffff00"), "system", true);
        
        if (a[0] === 'confirm') {
             await updatePlayer(u, { family: null, sect: "none" });
             UI.print(`你咬牙背叛了 ${familyName}，從此成為江湖浪人。`, "system");
        } else {
             UI.print("請輸入 betray confirm 以確認叛師 (後果自負)。", "system");
        }
    },

    enable: async (playerData, args, userId) => {
        if (!playerData.enabled_skills) playerData.enabled_skills = {};
        if (args.length < 2) {
            let msg = UI.titleLine("激發狀態");
            for (const [type, skillId] of Object.entries(playerData.enabled_skills)) {
                const sInfo = SkillDB[skillId];
                msg += `${UI.txt(type, "#00ffff")} : ${sInfo ? sInfo.name : skillId}\n`;
            }
            if (Object.keys(playerData.enabled_skills).length === 0) msg += "無\n";
            UI.print(msg, 'system', true); 
            return;
        }

        const type = args[0]; 
        const skillId = args[1];

        if (!playerData.skills || !playerData.skills[skillId]) { UI.print("你不會這招。", "error"); return; }
        const skillInfo = SkillDB[skillId];
        
        if (skillInfo.base) {
             const baseLvl = playerData.skills[skillInfo.base] || 0;
             if (baseLvl <= 0) {
                 const baseName = SkillDB[skillInfo.base] ? SkillDB[skillInfo.base].name : skillInfo.base;
                 UI.print(`你的${baseName}火候不足，無法激發${skillInfo.name}。`, "error");
                 return;
             }
        }

        if (skillInfo.base !== type) { UI.print("類型不符。", "error"); return; }

        if (playerData.enabled_skills[type] === skillId) {
            delete playerData.enabled_skills[type];
            UI.print(`已解除 ${type} 的激發。`, "system");
        } else {
            playerData.enabled_skills[type] = skillId;
            UI.print(`已將 ${type} 設定為 ${skillInfo.name}。`, "system");
        }

        await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
    },

    unenable: async (playerData, args, userId) => {
        if (args.length === 0) { UI.print("指令格式：unenable <類型>", "error"); return; }
        const type = args[0];
        if (!playerData.enabled_skills || !playerData.enabled_skills[type]) {
            UI.print(`你目前並沒有激發 ${type} 類型的武功。`, "error");
            return;
        }
        delete playerData.enabled_skills[type];
        UI.print(`你取消了 ${type} 的激發狀態。`, "system");
        await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
    },

    abandon: async (p, a, u) => {
        if (a.length === 0) { UI.print("放棄什麼? (abandon <skill_id>)", "error"); return; }
        const skillId = a[0];
        
        if (!p.skills || !p.skills[skillId]) { UI.print("你並沒有學會這項技能。", "error"); return; }
        
        if (p.tempAbandon !== skillId) {
            p.tempAbandon = skillId;
            const sName = SkillDB[skillId] ? SkillDB[skillId].name : skillId;
            UI.print(UI.txt(`警告！你確定要廢除 ${sName} (${skillId}) 嗎？`, "#ff5555"), "system", true);
            UI.print(UI.txt("這將會完全清除該技能的等級，且不可恢復！", "#ff5555"), "system", true);
            UI.print("請再次輸入相同的指令以確認。", "system");
            return;
        }
        
        const sName = SkillDB[skillId] ? SkillDB[skillId].name : skillId;
        delete p.skills[skillId];
        
        if (p.skill_exp && p.skill_exp[skillId]) delete p.skill_exp[skillId];
        
        if (p.enabled_skills) {
            for (const [type, id] of Object.entries(p.enabled_skills)) {
                if (id === skillId) {
                    delete p.enabled_skills[type];
                    UI.print(`由於技能消失，${type} 的激發狀態已解除。`, "system");
                }
            }
        }

        p.tempAbandon = null;

        await updatePlayer(u, { 
            skills: p.skills, 
            skill_exp: p.skill_exp, 
            enabled_skills: p.enabled_skills 
        });
        
        UI.print(UI.txt(`你自廢武功，徹底忘記了 ${sName} 的所有法門。`, "#ffff00"), "system", true);
    },

    learn: async (p,a,u) => { 
        if (p.state === 'exercising') {
            UI.print("你正在專心修練內力，無法分心學習。(輸入 autoforce 解除)", "error");
            return;
        }

        let sid, mid, count = 1;

        if (a.length >= 4 && !isNaN(parseInt(a[1])) && a[2] === 'from') {
            sid = a[0];
            count = parseInt(a[1]);
            mid = a[3];
        } else if (a.length >= 3 && a[1] === 'from') {
            sid = a[0];
            count = 1;
            mid = a[2];
        } else {
            UI.print("指令格式：learn <技能ID> [次數] from <師父ID>", "error");
            return;
        }
        
        if (count < 1) count = 1;
        if (count > 50) count = 50;

        const npc = findNPCInRoom(p.location, mid); 
        if(!npc){UI.print("這裡沒有這個人。","error");return;} 
        
        const isMaster = p.family && p.family.masterId === npc.id;
        const isSameSect = p.family && p.family.sect === npc.family;

        if (!isMaster && !isSameSect) {
            UI.print("你必須先拜師才能向他請教。", "error");
            return;
        }

        if(!npc.skills[sid]){UI.print("師父並不會這招。","chat");return;} 
        
        const currentLvlStart = p.skills[sid] || 0;
        
        if (currentLvlStart <= 0) {
            const currentSkillCount = Object.keys(p.skills || {}).length;
            const cor = p.attributes.cor || 20; 
            const maxSkills = Math.floor(cor / 2); 
            
            if (currentSkillCount >= maxSkills) {
                UI.print(UI.txt(`你的靈性(${cor})不足以容納更多的武學常識。(上限: ${maxSkills}種)`, "#ff5555"), "error", true);
                UI.print("請先嘗試放棄(abandon)一些不常用的技能。", "system");
                return;
            }
        }

        let actualCount = 0;
        let totalGain = 0;
        let totalSp = 0;
        let totalPot = 0;
        let isLevelUp = false;
        
        const int = p.attributes.int || 20;

        for (let i = 0; i < count; i++) {
            const currentLvl = p.skills[sid] || 0;
            
            if (currentLvl >= npc.skills[sid]) {
                UI.print(actualCount > 0 ? `你學了 ${actualCount} 次，師父的本事已被你學全了。` : "這招你已經學滿了，師父沒什麼好教你的了。", "chat");
                break;
            }
            
            const skillInfo = SkillDB[sid];
            if (skillInfo && skillInfo.base) {
                const baseLvl = p.skills[skillInfo.base] || 0;
                const baseName = SkillDB[skillInfo.base] ? SkillDB[skillInfo.base].name : skillInfo.base;
                if (baseLvl <= 0) {
                    UI.print(`你的${baseName}毫無根基，怎麼學得會這高深招式？`, "error");
                    break;
                }
                if (currentLvl >= baseLvl) {
                    UI.print(`你的${baseName}火候不足，無法領悟更高深的${skillInfo.name}。`, "error");
                    break;
                }
            }

            const spC = 3 + Math.floor(currentLvl / 20); 
            const potC = 1; 
            
            if(p.attributes.sp <= spC){
                UI.print(actualCount > 0 ? `你學了 ${actualCount} 次，現在精神不濟，無法繼續。` : `你現在精神不濟，無法專心聽講。(需要精: ${spC})`,"error");
                break;
            } 
            if((p.combat.potential||0) < potC){
                UI.print(actualCount > 0 ? `你學了 ${actualCount} 次，潛能耗盡了。` : `你的潛能不足，無法領悟其中的奧妙。(需要潛能: ${potC})`,"error");
                break;
            } 
            
            p.attributes.sp -= spC; 
            p.combat.potential -= potC; 
            totalSp += spC;
            totalPot += potC;
            
            const rndMult = 5 + Math.random() * 5; 
            let gain = Math.floor((int * rndMult) + (currentLvl * 2));
            if (gain < 1) gain = 1;

            if (!p.skill_exp) p.skill_exp = {};
            if (!p.skill_exp[sid]) p.skill_exp[sid] = 0;

            p.skill_exp[sid] += gain;
            totalGain += gain;
            actualCount++;

            const maxExp = calculateMaxExp(currentLvl);
            if (p.skill_exp[sid] >= maxExp) {
                p.skills[sid] = currentLvl + 1;
                p.skill_exp[sid] -= maxExp; 
                
                const sName = SkillDB[sid] ? SkillDB[sid].name : sid;
                UI.print(UI.txt(`在第 ${actualCount} 次學習中，你頓悟了！${sName} 提升到了 ${p.skills[sid]} 級！`, "#00ff00", true), "system", true);
                isLevelUp = true;
                break;
            }
        }
        
        if (actualCount > 0 && !isLevelUp) {
            const sName = SkillDB[sid] ? SkillDB[sid].name : sid;
            UI.print(`你向${npc.name}請教了 ${actualCount} 次 ${sName}，消耗 ${totalPot} 點潛能、${totalSp} 點精神，獲得 ${totalGain} 點經驗。`, "system");
        }
        
        await updatePlayer(u, {
            "attributes.sp": p.attributes.sp,
            "combat.potential": p.combat.potential,
            "skills": p.skills,
            "skill_exp": p.skill_exp 
        }); 
    },
    
    practice: async (p, a, u) => { 
        if (p.state === 'exercising') {
            UI.print("你正在專心修練內力，無法分心練習。(輸入 autoforce 解除)", "error");
            return;
        }

        if (a.length === 0) { UI.print("指令格式：practice <基本武功> [次數]", "error"); return; }
        
        const baseSkillId = a[0]; 
        let count = 1;
        if (a.length > 1 && !isNaN(parseInt(a[1]))) {
            count = parseInt(a[1]);
        }
        
        if (count < 1) count = 1;
        if (count > 50) count = 50;

        if (baseSkillId === 'force') {
            UI.print("內功修為需靠打坐(meditate)或呼吸吐納(exercise/respirate)，無法通過練習提升。", "error");
            return;
        }

        if(!p.skills[baseSkillId]){ UI.print("你不會這項基本武功。", "error"); return; }
        
        let targetSkillId = baseSkillId;
        let isAdvanced = false;

        if (p.enabled_skills && p.enabled_skills[baseSkillId]) {
            targetSkillId = p.enabled_skills[baseSkillId];
            isAdvanced = true;
        }

        if (!p.skills[targetSkillId]) {
            if (isAdvanced) {
                UI.print(`你雖然激發了${targetSkillId}，但還沒學會，無法練習。`, "error");
                return;
            }
        }

        let actualCount = 0;
        let totalGain = 0;
        let isLevelUp = false;
        const int = p.attributes.int || 20;

        for (let i = 0; i < count; i++) {
            const currentLvl = p.skills[targetSkillId] || 0;
            const baseLvl = p.skills[baseSkillId] || 0;
            const skillName = SkillDB[targetSkillId] ? SkillDB[targetSkillId].name : targetSkillId;

            if (isAdvanced && currentLvl >= baseLvl) {
                const baseName = SkillDB[baseSkillId].name;
                UI.print(actualCount > 0 ? `練習了 ${actualCount} 次後，你的${baseName}火候已不足以支持更高的${skillName}。` : `你的${baseName}火候不足，無法繼續提升${skillName}。`, "error");
                break;
            }

            const cost = 20; 
            if (p.attributes.hp <= cost) { 
                UI.print(actualCount > 0 ? `你練習了 ${actualCount} 次，氣息不順，需要休息。` : `你氣息不順，需要休息一下。(需要氣: ${cost})`, "error"); 
                break; 
            }
            
            p.attributes.hp -= cost; 

            let gain = Math.floor((int * 2) + (baseLvl * 2.5));
            if (gain < 1) gain = 1;

            if (!p.skill_exp) p.skill_exp = {};
            if (!p.skill_exp[targetSkillId]) p.skill_exp[targetSkillId] = 0;

            p.skill_exp[targetSkillId] += gain;
            totalGain += gain;
            actualCount++;

            const maxExp = calculateMaxExp(currentLvl);

            if (p.skill_exp[targetSkillId] >= maxExp) {
                p.skills[targetSkillId] = currentLvl + 1;
                p.skill_exp[targetSkillId] -= maxExp; 
                
                UI.print(UI.txt(`在第 ${actualCount} 次練習中，你終於融會貫通！${skillName} 提升到了 ${p.skills[targetSkillId]} 級！`, "#00ff00", true), "system", true);
                isLevelUp = true;
                break;
            }
        }

        if (actualCount > 0 && !isLevelUp) {
            const skillName = SkillDB[targetSkillId] ? SkillDB[targetSkillId].name : targetSkillId;
            UI.print(`你練習了 ${actualCount} 次 ${skillName}，消耗了 ${actualCount * 20} 點氣，獲得 ${totalGain} 點經驗。`, "system");
        }
        
        await updatePlayer(u, {
            "attributes.hp": p.attributes.hp,
            "skills": p.skills,
            "skill_exp": p.skill_exp
        }); 
    }
};