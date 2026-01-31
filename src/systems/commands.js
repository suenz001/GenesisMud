// src/systems/commands.js
import { doc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db, auth } from "../firebase.js";
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 
import { MessageSystem } from "./messages.js"; 
import { SkillDB } from "../data/skills.js";

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

// --- 輔助函式 ---

// 訓練函式
async function trainStat(playerData, userId, typeName, attrCur, attrMax, costAttr, costName) {
    const attr = playerData.attributes;
    if (attr[costAttr] < 20) {
        UI.print(`你的${costName}不足，無法修練。`, "error");
        return;
    }

    const maxVal = attr[attrMax];
    const curVal = attr[attrCur];
    const limit = maxVal * 2; 

    if (curVal >= limit) {
        UI.print(`你的${typeName}修為已達瓶頸，無法再累積了。`, "system");
        return;
    }

    const cost = 10;
    const gain = 5 + Math.floor((playerData.skills?.force || 0) / 10); 
    
    let improved = false;
    
    if (curVal >= limit - 1) {
        const pot = playerData.combat?.potential || 0;
        if (pot < 1) {
            UI.print("你的潛能不足，無法突破瓶頸。", "error");
            return;
        }
        attr[costAttr] -= 1; 
        playerData.combat.potential -= 1;
        attr[attrMax] += 1;
        attr[attrCur] = attr[attrMax]; 
        
        improved = true;
        let msg = `你運轉周天，只覺體內轟的一聲... ` + UI.txt(`你的${typeName}上限提升了！`, "#ffff00", true);
        UI.print(msg, "system", true);
        UI.print(`(${typeName}: ${attr[attrCur]}/${attr[attrMax]})`, "chat");
    } else {
        attr[costAttr] -= cost;
        attr[attrCur] = Math.min(limit, curVal + gain);
        
        let msg = `你運轉周天，將${costName}轉化為${typeName} ... `;
        if (attr[attrCur] > maxVal) {
            msg += `(${attr[attrCur]}/${maxVal} <span style="color:#00ff00">+${attr[attrCur] - maxVal}</span>)`;
        } else {
            msg += `(${attr[attrCur]}/${maxVal})`;
        }
        UI.print(msg, "system", true);
    }

    if (improved) {
        await updatePlayer(userId, { 
            [`attributes.${costAttr}`]: attr[costAttr],
            [`attributes.${attrCur}`]: attr[attrCur],
            [`attributes.${attrMax}`]: attr[attrMax],
            "combat.potential": playerData.combat.potential
        });
    } else {
        await updatePlayer(userId, { 
            [`attributes.${costAttr}`]: attr[costAttr],
            [`attributes.${attrCur}`]: attr[attrCur]
        });
    }
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

// MUD 風格技能評語
function getSkillLevelDesc(level) {
    let desc = "初學乍練";
    let color = "#aaa"; // 灰色
    
    if (level >= 500) { desc = "深不可測"; color = "#ff00ff"; } // 粉紅
    else if (level >= 400) { desc = "返璞歸真"; color = "#ff0000"; } // 紅
    else if (level >= 300) { desc = "出神入化"; color = "#ff8800"; } // 橘
    else if (level >= 200) { desc = "登峰造極"; color = "#ffff00"; } // 黃
    else if (level >= 150) { desc = "出類拔萃"; color = "#00ff00"; } // 綠
    else if (level >= 100) { desc = "爐火純青"; color = "#00ffff"; } // 青
    else if (level >= 60) { desc = "融會貫通"; color = "#0088ff"; } // 藍
    else if (level >= 30) { desc = "駕輕就熟"; color = "#8888ff"; } // 淡藍
    else if (level >= 10) { desc = "略有小成"; color = "#ffffff"; } // 白

    return UI.txt(desc, color);
}

async function updatePlayer(userId, data) {
    try {
        const playerRef = doc(db, "players", userId);
        await updateDoc(playerRef, data);
        return true;
    } catch (e) { console.error("更新失敗", e); return false; }
}

async function updateInventory(playerData, userId) {
    return await updatePlayer(userId, { inventory: playerData.inventory });
}

async function consumeItem(playerData, userId, itemId, amount = 1) {
    const inventory = playerData.inventory || [];
    const itemIndex = inventory.findIndex(i => i.id === itemId || i.name === itemId);
    if (itemIndex === -1) { UI.print(`你身上沒有 ${itemId} 這樣東西。`, "error"); return false; }
    const item = inventory[itemIndex];
    if (item.count > amount) item.count -= amount; else inventory.splice(itemIndex, 1);
    return await updateInventory(playerData, userId);
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

const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = UI.titleLine("江湖指南");
            msg += UI.txt(" 基本指令：", "#00ffff") + "score, skills, inventory (i)\n";
            msg += UI.txt(" 武學指令：", "#ff5555") + "apprentice, learn, enable, unenable, practice\n";
            msg += UI.txt(" 修練指令：", "#ffff00") + "exercise (運氣), respirate (運精), meditate (運神)\n";
            msg += UI.txt(" 戰鬥指令：", "#ff0000") + "kill (下殺手), fight (切磋)\n";
            msg += UI.txt(" 生活指令：", "#00ff00") + "eat, drink, drop, get, look\n";
            msg += UI.txt(" 交易指令：", "#ffcc00") + "list, buy\n";
            msg += UI.txt(" 移動指令：", "#aaa") + "n, s, e, w, u, d\n";
            UI.print(msg, 'normal', true);
        }
    },

    // --- 吃 (Eat) ---
    'eat': {
        description: '吃食物',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("想吃什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'food') return UI.print("那個不能吃！", "error");
            
            const attr = playerData.attributes;
            // 檢查是否已滿
            if (attr.food >= attr.maxFood) {
                return UI.print("你已經吃得很飽了，再吃就要撐死了。", "system");
            }

            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                const recover = Math.min(attr.maxFood - attr.food, itemData.value);
                // 確保不超過最大值
                attr.food = Math.min(attr.maxFood, attr.food + itemData.value);
                
                UI.print(`你吃下了一份${invItem.name}，恢復了 ${recover} 點食物值。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 拿出 ${invItem.name} 吃幾口。`);
                
                await updatePlayer(userId, { "attributes.food": attr.food });
            }
        }
    },

    // --- 喝 (Drink) ---
    'drink': {
        description: '喝飲料',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) return UI.print("想喝什麼？", "system");
            const targetName = args[0];
            const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
            
            if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
            const itemData = ItemDB[invItem.id];
            if (!itemData || itemData.type !== 'drink') return UI.print("那個不能喝！", "error");
            
            const attr = playerData.attributes;
            // 檢查是否已滿
            if (attr.water >= attr.maxWater) {
                return UI.print("你一點也不渴。", "system");
            }

            const success = await consumeItem(playerData, userId, invItem.id);
            if (success) {
                const recover = Math.min(attr.maxWater - attr.water, itemData.value);
                // 確保不超過最大值
                attr.water = Math.min(attr.maxWater, attr.water + itemData.value);

                UI.print(`你喝了一口${invItem.name}，恢復了 ${recover} 點飲水值。`, "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 拿起 ${invItem.name} 喝了幾口。`);

                await updatePlayer(userId, { "attributes.water": attr.water });
            }
        }
    },

    // --- 修練指令 ---
    'exercise': { description: '運氣', execute: async (p,a,u) => trainStat(p,u,"內力","force","maxForce","hp","氣") },
    'respirate': { description: '運精', execute: async (p,a,u) => trainStat(p,u,"靈力","spiritual","maxSpiritual","sp","精") },
    'meditate': { description: '運神', execute: async (p,a,u) => trainStat(p,u,"法力","mana","maxMana","mp","神") },

    // --- 拜師 (Apprentice) ---
    'apprentice': {
        description: '拜師',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你想拜誰為師？", "error"); return; }
            
            const npc = findNPCInRoom(playerData.location, args[0]);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            if (!npc.family) {
                UI.print(`${npc.name} 說道：「我只是一介平民，不懂收徒。」`, "chat");
                return;
            }

            if (playerData.family && playerData.family.masterId) {
                UI.print(`你已經有師父了，是 ${playerData.family.masterId}。`, "error");
                return;
            }

            let msg = "";
            if (npc.id === 'gym_master') {
                msg = `${npc.name} 哈哈大笑，拍了拍你的頭說道：「好！很有精神！今日我就收你為徒，別丟我們飛龍武館的臉！」`;
            } else {
                msg = `${npc.name} 微微頷首，說道：「既然你有此誠意，我便收你為徒。」`;
            }
            UI.print(msg, "chat");
            
            MessageSystem.broadcast(playerData.location, `${playerData.name} 恭恭敬敬地向 ${npc.name} 磕了三個響頭，拜入其門下。`);

            playerData.family = {
                masterId: npc.id,
                masterName: npc.name,
                sect: npc.family
            };
            playerData.sect = npc.family === 'common_gym' ? '飛龍武館' : npc.family;

            await updatePlayer(userId, { family: playerData.family, sect: playerData.sect });
            
            commandRegistry['look'].execute(playerData, [npc.id]);
        }
    },

    // --- 激發 (Enable) ---
    'enable': {
        description: '激發進階武功',
        execute: async (playerData, args, userId) => {
            if (!playerData.enabled_skills) playerData.enabled_skills = {};
            if (args.length < 2) {
                let msg = UI.titleLine("激發狀態");
                for (const [type, skillId] of Object.entries(playerData.enabled_skills)) {
                    const sInfo = SkillDB[skillId];
                    msg += `${UI.txt(type, "#00ffff")} : ${sInfo ? sInfo.name : skillId}\n`;
                }
                if (Object.keys(playerData.enabled_skills).length === 0) msg += "無\n";
                UI.print(msg, 'system');
                return;
            }

            const type = args[0]; 
            const skillId = args[1];

            if (!playerData.skills || !playerData.skills[skillId]) { 
                UI.print("你不會這招。", "error"); return; 
            }
            const skillInfo = SkillDB[skillId];
            if (skillInfo.base !== type) { 
                UI.print("類型不符。", "error"); return; 
            }

            // 切換邏輯
            if (playerData.enabled_skills[type] === skillId) {
                delete playerData.enabled_skills[type];
                UI.print(`已解除 ${type} 的激發。`, "system");
            } else {
                playerData.enabled_skills[type] = skillId;
                UI.print(`已將 ${type} 設定為 ${skillInfo.name}。`, "system");
            }

            await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
        } 
    },

    // --- 解除激發 (Unenable) ---
    'unenable': {
        description: '解除激發 (unenable <type>)',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("指令格式：unenable <類型>", "error"); return; }
            
            const type = args[0];
            if (!playerData.enabled_skills || !playerData.enabled_skills[type]) {
                UI.print(`你目前並沒有激發 ${type} 類型的武功。`, "error");
                return;
            }

            const skillId = playerData.enabled_skills[type];
            const skillInfo = SkillDB[skillId];
            const skillName = skillInfo ? skillInfo.name : skillId;

            delete playerData.enabled_skills[type];
            
            UI.print(`你取消了 ${type} (${skillName}) 的激發狀態。`, "system");
            await updatePlayer(userId, { enabled_skills: playerData.enabled_skills });
        }
    },

    // --- 技能 (Skills) - 顯示評語 ---
    'skills': {
        description: '查看技能',
        execute: (playerData) => {
            const skills = playerData.skills || {};
            const skillList = Object.entries(skills);
            if (skillList.length === 0) { UI.print("你目前什麼都不會。", "chat"); return; }
            
            let html = UI.titleLine(`${playerData.name} 的武學`);
            // 調整 grid 以容納評語
            html += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap: 5px; align-items:center;">`;
            
            for (const [id, level] of skillList) {
                const info = SkillDB[id];
                if(id === 'parry') continue; 

                const name = info ? info.name : id;
                const desc = getSkillLevelDesc(level); // 取得評語
                let statusMark = "";
                
                if (playerData.enabled_skills) {
                    for (const [slot, equippedId] of Object.entries(playerData.enabled_skills)) {
                        if (equippedId === id) statusMark = UI.txt(`[${slot}]`, "#00ff00");
                    }
                }

                let btn = "";
                if (info && info.base) {
                    const isEnabled = playerData.enabled_skills && playerData.enabled_skills[info.base] === id;
                    btn = UI.makeCmd(isEnabled ? "[解除]" : "[激發]", isEnabled ? `unenable ${info.base}` : `enable ${info.base} ${id}`, "cmd-btn");
                }

                html += `<div style="color:#fff;">${name} <span style="color:#888; font-size:0.8em;">(${id})</span> ${statusMark}</div>`;
                // 顯示等級與評語
                html += `<div>${UI.txt(level+"級", "#00ffff")} <span style="font-size:0.8em;">${desc}</span></div>`;
                html += `<div>${btn}</div>`;
            }
            html += `</div>` + UI.titleLine("End");
            
            UI.print(html, 'chat', true);
        }
    },

    // --- 狀態 (Score) ---
    'score': {
        description: '查看屬性',
        execute: (playerData) => {
            if (!playerData) return;
            const attr = playerData.attributes;
            const skills = playerData.skills || {};
            const enabled = playerData.enabled_skills || {};
            const combat = playerData.combat || {};
            
            const getEffLvl = (type) => {
                const enabledSkill = enabled[type];
                if (enabledSkill && skills[enabledSkill]) return skills[enabledSkill];
                return skills[type] || 0;
            };

            const effUnarmed = getEffLvl('unarmed');
            const effDodge = getEffLvl('dodge');
            const effSword = getEffLvl('sword'); 

            const hasWeapon = playerData.equipment && playerData.equipment.weapon;
            let activeAtkSkill = hasWeapon ? effSword : effUnarmed;

            const atk = (attr.str * 10) + activeAtkSkill;
            const def = (attr.con * 10);
            
            // 修正：因為 dex (身法) 已被移除，改用 per (定力) 計算閃避與命中
            // 如果您希望使用其他屬性(如 kar 福緣 或 int 悟性)，可在此修改
            const dodge = (attr.per * 10) + effDodge; 
            const hitRate = (attr.per * 10) + (activeAtkSkill * 2);

            const moneyStr = UI.formatMoney(playerData.money || 0);
            const potential = combat.potential || 0;
            const kills = combat.kills || 0;

            let html = UI.titleLine(`${playerData.name} 的狀態`);
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("性別", playerData.gender)}</div><div>${UI.attrLine("門派", playerData.sect || "無")}</div>`;
            html += `<div>${UI.attrLine("財產", moneyStr)}</div>`;
            html += `<div>${UI.attrLine("潛能", UI.txt(potential, "#ffff00", true))}</div>`;
            html += `</div><br>`;

            html += UI.txt("【 天賦屬性 】", "#00ffff") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("膂力", attr.str)}</div><div>${UI.attrLine("根骨", attr.con)}</div>`;
            html += `<div>${UI.attrLine("悟性", attr.int)}</div><div>${UI.attrLine("定力", attr.per)}</div>`;
            html += `<div>${UI.attrLine("福緣", attr.kar)}</div><div>${UI.attrLine("靈性", attr.cor)}</div>`;
            html += `</div><br>`;

            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.txt("【 精 與 靈 】", "#ff5555")}</div><div>${UI.makeCmd("[運精]", "respirate", "cmd-btn")}</div>`;
            html += `<div>${UI.attrLine("精 (SP)", attr.sp+"/"+attr.maxSp)}</div>`;
            html += `<div>${UI.attrLine("靈力", attr.spiritual+"/"+attr.maxSpiritual)}</div>`;
            
            html += `<div>${UI.txt("【 氣 與 內 】", "#5555ff")}</div><div>${UI.makeCmd("[運氣]", "exercise", "cmd-btn")}</div>`;
            html += `<div>${UI.attrLine("氣 (HP)", attr.hp+"/"+attr.maxHp)}</div>`;
            html += `<div>${UI.attrLine("內力", attr.force+"/"+attr.maxForce)}</div>`;

            html += `<div>${UI.txt("【 神 與 法 】", "#ffff55")}</div><div>${UI.makeCmd("[運神]", "meditate", "cmd-btn")}</div>`;
            html += `<div>${UI.attrLine("神 (MP)", attr.mp+"/"+attr.maxMp)}</div>`;
            html += `<div>${UI.attrLine("法力", attr.mana+"/"+attr.maxMana)}</div>`;
            html += `</div><br>`;

            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("食物", attr.food + "/" + attr.maxFood)}</div>`;
            html += `<div>${UI.attrLine("飲水", attr.water + "/" + attr.maxWater)}</div>`;
            html += `</div><br>`;

            html += UI.txt("【 戰鬥 】", "#00ff00") + "<br>";
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">`;
            html += `<div>${UI.attrLine("攻擊", atk)}</div><div>${UI.attrLine("防禦", def)}</div>`;
            html += `<div>${UI.attrLine("命中", hitRate)}</div><div>${UI.attrLine("閃避", dodge)}</div>`;
            html += `<div>${UI.attrLine("殺氣", UI.txt(kills, "#ff0000"))}</div>`;
            html += `</div>` + UI.titleLine("End");
            
            UI.print(html, 'chat', true);
        }
    },

    // --- 殺敵 (Kill) ---
    'kill': {
        description: '下殺手',
        execute: async (playerData, args, userId) => {
            if (args.length === 0) { UI.print("你想殺誰？", "error"); return; }
            const room = MapSystem.getRoom(playerData.location);
            if (room.safe) { UI.print("這裡是安全區。", "error"); return; }
            
            const targetId = args[0];
            const npc = findNPCInRoom(playerData.location, targetId);
            if (!npc) { UI.print("這裡沒有這個人。", "error"); return; }

            const skills = playerData.skills || {};
            const enabled = playerData.enabled_skills || {};
            let weaponItem = playerData.equipment?.weapon ? ItemDB[playerData.equipment.weapon] : null;
            let skillType = weaponItem ? 'sword' : 'unarmed';
            let activeSkillId = enabled[skillType] || skillType;
            let skillInfo = SkillDB[activeSkillId];

            let action = { msg: "$P對$N發起攻擊。", damage: 10 };
            if (skillInfo && skillInfo.actions && skillInfo.actions.length > 0) {
                action = skillInfo.actions[Math.floor(Math.random() * skillInfo.actions.length)];
            }

            let msg = action.msg
                .replace(/\$P/g, playerData.name)
                .replace(/\$N/g, npc.name)
                .replace(/\$w/g, weaponItem ? weaponItem.name : "雙手");

            const skillLvl = skills[activeSkillId] || 0;
            const dmg = Math.floor(action.damage + (skillLvl * 0.5) + (Math.random() * 10));

            UI.print(UI.txt(msg, "#ffff00"), "system", true);
            UI.print(`(造成了 ${dmg} 點傷害)`, "chat");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 對 ${npc.name} 下了毒手！`);

            // 結算
            const playerLvl = getLevel(playerData);
            const npcLvl = getLevel(npc);
            let potGain = 100 + ((npcLvl - playerLvl) * 10);
            if (potGain < 10) potGain = 10;

            if (!playerData.combat) playerData.combat = { potential: 0, kills: 0 };
            playerData.combat.potential = (playerData.combat.potential || 0) + potGain;
            playerData.combat.kills = (playerData.combat.kills || 0) + 1;

            UI.print(`經過激戰，${npc.name} 倒地身亡。`, "system");
            UI.print(UI.txt(`戰鬥勝利！獲得 ${potGain} 點潛能。`, "#00ff00", true), "system", true);

            // 掉落與重生
            if (npc.drops) {
                for (const drop of npc.drops) {
                    if (Math.random() <= drop.rate) {
                        const itemInfo = ItemDB[drop.id];
                        if(itemInfo) {
                            await addDoc(collection(db, "room_items"), {
                                roomId: playerData.location, itemId: drop.id, name: itemInfo.name, droppedBy: "SYSTEM", timestamp: new Date().toISOString()
                            });
                            UI.print(`${npc.name} 掉出了 ${itemInfo.name}。`, "system");
                        }
                    }
                }
            }
            try { await addDoc(collection(db, "dead_npcs"), { roomId: playerData.location, npcId: npc.id, index: npc.index, respawnTime: Date.now() + 300000 }); } catch (e) {}

            await updatePlayer(userId, { 
                "combat.potential": playerData.combat.potential,
                "combat.kills": playerData.combat.kills 
            });
            MapSystem.look(playerData);
        }
    },

    // --- 查看 (Look) - 增加師父等級與評語 ---
    'look': { 
        description: '觀察', 
        execute: (p, a) => { 
            if(a.length>0) { 
                const npc = findNPCInRoom(p.location, a[0]); 
                if(npc) { 
                    let h = UI.titleLine(`${npc.name} (${npc.id})`); 
                    h+=UI.txt(npc.description+"<br>", "#ddd"); 
                    const isMaster = (p.family && p.family.masterId===npc.id); 
                    if(!isMaster && npc.family) h+=UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn"); 
                    
                    if(isMaster && npc.skills) { 
                        h+=UI.txt("<br>師父會的武功：<br>","#0ff"); 
                        for(const [sid, lvl] of Object.entries(npc.skills)) {
                            const sInfo=SkillDB[sid]; 
                            if(sInfo) {
                                // 顯示等級和評語
                                const desc = getSkillLevelDesc(lvl);
                                h+=`- ${sInfo.name}(${sid}) <span style="color:#ff0">${lvl}級 / ${desc}</span> ${UI.makeCmd("[學藝]", `learn ${sid} from ${npc.id}`, "cmd-btn")}<br>`;
                            }
                        } 
                    } 
                    UI.print(h, "system", true); 
                    return; 
                } 
                const invItem = p.inventory.find(i=>i.id===a[0]||i.name===a[0]); 
                if(invItem) { 
                    const info = ItemDB[invItem.id]; 
                    UI.print(UI.titleLine(`${info.name} (${invItem.id})`)+UI.txt(info.desc,"#ddd"),"system",true); 
                    return; 
                } 
            } 
            MapSystem.look(p); 
        } 
    },

    // --- 其他指令 ---
    'sk': { description: 'sk', execute: (p)=>commandRegistry['skills'].execute(p) },
    'l': { description: 'look', execute: (p, a) => commandRegistry['look'].execute(p, a) },
    'inventory': { description: '背包', execute: (p) => { let h=UI.titleLine("背包")+`<div>${UI.attrLine("財產", UI.formatMoney(p.money))}</div><br>`; if(!p.inventory||p.inventory.length===0)h+=UI.txt("空空如也。<br>","#888"); else p.inventory.forEach(i=>{ const dat=ItemDB[i.id]; let act=""; if(dat){ if(dat.type==='food') act+=UI.makeCmd("[吃]",`eat ${i.id}`,"cmd-btn"); if(dat.type==='drink') act+=UI.makeCmd("[喝]",`drink ${i.id}`,"cmd-btn"); } act+=UI.makeCmd("[丟]",`drop ${i.id}`,"cmd-btn"); act+=UI.makeCmd("[看]",`look ${i.id}`,"cmd-btn"); h+=`<div>${UI.txt(i.name,"#fff")} (${i.id}) x${i.count} ${act}</div>`; }); UI.print(h+UI.titleLine("End"), "chat", true); } },
    'i': { description: 'i', execute: (p)=>commandRegistry['inventory'].execute(p) },
    'fight': { description: '切磋', execute: async (p,a,u)=>{if(a.length===0)return UI.print("跟誰?","error"); const npc=findNPCInRoom(p.location,a[0]); if(!npc)return UI.print("沒人","error"); UI.print(`與 ${npc.name} 切磋。`,"chat");} },
    'learn': { description: '學藝', execute: async (p,a,u)=>{ if(a.length<3||a[1]!=='from'){UI.print("learn <skill> from <master>","error");return;} const sid=a[0], mid=a[2]; const npc=findNPCInRoom(p.location,mid); if(!npc){UI.print("沒人","error");return;} if(!p.family||p.family.masterId!==npc.id){UI.print("需拜師","error");return;} if(!npc.skills[sid]){UI.print("他不會","chat");return;} if((p.skills[sid]||0)>=npc.skills[sid]){UI.print("學滿了","chat");return;} const spC=10+Math.floor((p.skills[sid]||0)/2), potC=5+Math.floor((p.skills[sid]||0)/5); if(p.attributes.sp<=spC){UI.print("精不足","error");return;} if((p.combat.potential||0)<potC){UI.print("潛能不足","error");return;} p.attributes.sp-=spC; p.combat.potential-=potC; p.skills[sid]=(p.skills[sid]||0)+1; UI.print(`學習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); await updatePlayer(u,{"attributes.sp":p.attributes.sp,"combat.potential":p.combat.potential,"skills":p.skills}); } },
    'practice': { description: '練習', execute: async (p,a,u)=>{ if(a.length===0){UI.print("practice <skill>","error");return;} const sid=a[0]; if(!SkillDB[sid]){UI.print("沒這招","error");return;} if(!(p.skills[sid])){UI.print("不會","error");return;} if(SkillDB[sid].base && p.skills[sid]>=p.skills[SkillDB[sid].base]){UI.print("基礎不足","error");return;} const cost=10+Math.floor(p.skills[sid]/2); if(p.attributes.hp<=cost){UI.print("氣不足","error");return;} p.attributes.hp-=cost; p.skills[sid]++; UI.print(`練習了 ${SkillDB[sid].name} (${p.skills[sid]}級)`,"system"); await updatePlayer(u,{"attributes.hp":p.attributes.hp,"skills":p.skills}); } },
    'buy': { description: '買', execute: async (p,a,u) => { if(a.length<1){UI.print("買啥?","error");return;} let n=a[0],amt=1,nn=null; if(a.length>=2&&!isNaN(a[1]))amt=parseInt(a[1]); if(a.indexOf('from')!==-1)nn=a[a.indexOf('from')+1]; else {const r=MapSystem.getRoom(p.location);if(r.npcs)nn=r.npcs[0];} const npc=findNPCInRoom(p.location,nn); if(!npc){UI.print("沒人","error");return;} let tid=null,pr=0; if(npc.shop[n]){tid=n;pr=npc.shop[n];}else{for(const[k,v]of Object.entries(npc.shop)){if(ItemDB[k]&&ItemDB[k].name===n){tid=k;pr=v;break;}}} if(!tid){UI.print("沒賣","error");return;} const tot=pr*amt; if((p.money||0)<tot){UI.print("錢不夠","error");return;} p.money-=tot; if(!p.inventory)p.inventory=[]; const ex=p.inventory.find(i=>i.id===tid); if(ex)ex.count+=amt; else p.inventory.push({id:tid,name:ItemDB[tid].name,count:amt}); UI.print(`買了 ${amt} ${ItemDB[tid].name}`,"system"); await updatePlayer(u,{money:p.money,inventory:p.inventory}); } },
    'list': { description: '列表', execute: (p,a) => { const r=MapSystem.getRoom(p.location); let nn=null; if(a.length>0)nn=a[0]; else if(r.npcs)nn=r.npcs[0]; const npc=findNPCInRoom(p.location,nn); if(!npc||!npc.shop)return UI.print("沒賣東西","error"); let h=UI.titleLine(npc.name+" 商品"); for(const[k,v]of Object.entries(npc.shop)) h+=`<div>${ItemDB[k].name}: ${UI.formatMoney(v)} ${UI.makeCmd("[買1]",`buy ${k} 1 from ${npc.id}`,"cmd-btn")}</div>`; UI.print(h,"",true); } },
    'drop': { description: '丟', execute: async (p,a,u) => { if(a.length===0)return UI.print("丟啥?","error"); const idx=p.inventory.findIndex(x=>x.id===a[0]||x.name===a[0]); if(idx===-1)return UI.print("沒這個","error"); const it=p.inventory[idx]; if(it.count>1)it.count--; else p.inventory.splice(idx,1); await updatePlayer(u,{inventory:p.inventory}); await addDoc(collection(db,"room_items"),{roomId:p.location,itemId:it.id,name:it.name,droppedBy:p.name,timestamp:new Date().toISOString()}); UI.print("丟了 "+it.name,"system"); MapSystem.look(p); } },
    'get': { description: '撿', execute: async (p,a,u) => { if(a.length===0)return UI.print("撿啥?","error"); const q=query(collection(db,"room_items"),where("roomId","==",p.location),where("itemId","==",a[0])); const snap=await getDocs(q); if(snap.empty)return UI.print("沒東西","error"); const d=snap.docs[0]; await deleteDoc(doc(db,"room_items",d.id)); const dat=d.data(); if(!p.inventory)p.inventory=[]; const ex=p.inventory.find(x=>x.id===dat.itemId); if(ex)ex.count++; else p.inventory.push({id:dat.itemId,name:dat.name,count:1}); await updatePlayer(u,{inventory:p.inventory}); UI.print("撿了 "+dat.name,"system"); MapSystem.look(p); } },
    'say': { description: '說', execute: (p,a)=>{const m=a.join(" ");UI.print(`你: ${m}`,"chat");MessageSystem.broadcast(p.location,`${p.name} 說: ${m}`);} },
    'emote': { description: '演', execute: (p,a)=>{const m=a.join(" ");UI.print(`${p.name} ${m}`,"system");MessageSystem.broadcast(p.location,`${p.name} ${m}`);} },
    'save': { 
        description: '存檔 (在客棧或門派大廳可設定重生點)', 
        execute: async(p, a, u) => {
            const room = MapSystem.getRoom(p.location);
            let updateData = { lastSaved: new Date().toISOString() };
            let msg = "遊戲進度已保存。";

            if (room && room.allowSave) {
                updateData.savePoint = p.location;
                msg += " (重生點已更新至此處)";
            } else {
                msg += " (此處非安全區，重生點未變更)";
            }

            await updatePlayer(u, updateData);
            UI.print(msg, "system");
        } 
    },
    'recall': { description: '回', execute: (p,a,u)=>MapSystem.teleport(p,p.savePoint||"inn_start",u) },
    'suicide': { description: '死', execute: async(p,a,u)=>{if(a[0]==='confirm'){await deleteDoc(doc(db,"players",u));await signOut(auth);}else UI.print("confirm?","error");} }
};

Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
});
Object.values(dirMapping).forEach(fullDir => {
    if (!commandRegistry[fullDir]) {
        commandRegistry[fullDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
    }
});

export const CommandSystem = {
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        if (!playerData) { UI.print("靈魂尚未歸位...", "error"); return; }
        const args = inputStr.trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();
        const command = commandRegistry[cmdName];
        if (command) command.execute(playerData, args, userId);
        else UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error");
    }
};