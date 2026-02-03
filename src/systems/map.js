// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { CommandSystem } from "./commands.js"; 
import { SkillDB, getSkillLevelDesc } from "../data/skills.js"; 
import { CombatSystem } from "./combat.js";
import { ItemDB } from "../data/items.js";

const DIR_OFFSET = {
    'north': { x: 0, y: 1, z: 0 }, 'south': { x: 0, y: -1, z: 0 },
    'east':  { x: 1, y: 0, z: 0 }, 'west':  { x: -1, y: 0, z: 0 },
    'up':    { x: 0, y: 0, z: 1 }, 'down':  { x: 0, y: 0, z: -1 },
    'northeast': { x: 1, y: 1, z: 0 }, 'northwest': { x: -1, y: 1, z: 0 },
    'southeast': { x: 1, y: -1, z: 0 }, 'southwest': { x: -1, y: -1, z: 0 }
};

const SLOT_NAMES = {
    'armor': '身穿', 'head': '頭戴', 'neck': '頸掛', 'cloak': '背披', 
    'wrists': '手戴', 'pants': '腿穿', 'boots': '腳踏', 'belt': '腰繫', 'weapon': '手持'
};

function getUniqueNpcId(roomId, npcId, index) { return `${roomId}_${npcId}_${index}`; }

function getNpcStatusText(currentHp, maxHp, isUnconscious) {
    if (isUnconscious || currentHp <= 0) return UI.txt(" (昏迷不醒)", "#888888");
    if (currentHp >= maxHp) return "";
    const pct = currentHp / maxHp;
    if (pct < 0.2) return UI.txt(" (重傷)", "#ff5555");
    if (pct < 0.5) return UI.txt(" (受傷)", "#ffaa00");
    if (pct < 0.8) return UI.txt(" (輕傷)", "#ffff00");
    return UI.txt(" (擦傷)", "#cccccc");
}

export const MapSystem = {
    getRoom: (roomId) => WorldMap[roomId],

    getAvailableExits: (currentRoomId) => {
        const room = WorldMap[currentRoomId];
        if (!room) return {};
        const exits = {};
        if (room.exits) Object.assign(exits, room.exits);
        const currentRegions = room.region || ["world"];

        for (const [dir, offset] of Object.entries(DIR_OFFSET)) {
            if (room.walls && room.walls.includes(dir)) continue;
            const targetX = room.x + offset.x;
            const targetY = room.y + offset.y;
            const targetZ = room.z + offset.z;
            for (const [targetId, targetRoom] of Object.entries(WorldMap)) {
                if (targetRoom.x === targetX && targetRoom.y === targetY && targetRoom.z === targetZ) {
                    const targetRegions = targetRoom.region || ["world"];
                    const hasCommonRegion = currentRegions.some(r => targetRegions.includes(r));
                    if (hasCommonRegion && !exits[dir]) exits[dir] = targetId;
                }
            }
        }
        return exits;
    },

    // === 核心功能：觀察房間 (Look) ===
    look: async (playerData) => {
        if (!playerData || !playerData.location) return;
        
        UI.hideInspection();
        
        const room = WorldMap[playerData.location];
        if (!room) { UI.print("你陷入虛空...", "error"); return; }

        MessageSystem.listenToRoom(playerData.location);
        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData);
        UI.print(`【${room.title}】`, "system");
        if (room.safe) UI.print(UI.txt("【 安全區 】", "#00ff00"), "system", true);
        UI.print(room.description);

        // 1. 取得並顯示房間內的其他玩家
        let playersInRoom = [];
        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("location", "==", playerData.location));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach(doc => {
                const p = doc.data();
                playersInRoom.push(p); 
            });
        } catch (e) { console.error(e); }

        if (playersInRoom.length > 0) {
            let playerHtml = "";
            playersInRoom.forEach((p) => {
                if (auth.currentUser && p.id === playerData.id) return; 

                let status = "";
                if (p.state === 'fighting') status = UI.txt(" 【戰鬥中】", "#ff0000", true);
                else if (p.state === 'exercising') status = UI.txt(" (正在運功修練)", "#ffff00"); 
                if (p.isUnconscious) status += UI.txt(" (昏迷)", "#888");

                const lookLink = UI.makeCmd(p.name, `look ${p.id}`, "cmd-link");
                const fightBtn = UI.makeCmd("[切磋]", `fight ${p.id}`, "cmd-btn");
                
                playerHtml += `<div style="margin-top:2px;">[ 玩家 ] ${lookLink} <span style="color:#aaa">(${p.id})</span>${status} ${fightBtn}</div>`;
            });
            if (playerHtml) UI.print(playerHtml, "chat", true);
        }

        // 2. 讀取受傷與死亡 NPC
        const fightingNpcKeys = new Set();
        playersInRoom.forEach(p => {
            if (p.state === 'fighting' && p.combatTarget) {
                fightingNpcKeys.add(`${p.combatTarget.id}_${p.combatTarget.index}`);
            }
        });

        const activeNpcMap = new Map();
        try {
            const activeRef = collection(db, "active_npcs");
            const qActive = query(activeRef, where("roomId", "==", playerData.location));
            const activeSnaps = await getDocs(qActive);
            activeSnaps.forEach(doc => { activeNpcMap.set(doc.id, doc.data()); });
        } catch(e) {}

        if (room.npcs && room.npcs.length > 0) {
            let deadIndices = [];
            try {
                const deadRef = collection(db, "dead_npcs");
                const q = query(deadRef, where("roomId", "==", playerData.location));
                const snapshot = await getDocs(q);
                const now = Date.now();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (now >= data.respawnTime) deleteDoc(doc.ref); 
                    else if (room.npcs[data.index] === data.npcId) deadIndices.push(data.index);
                });
            } catch (e) {}

            // [新增] 紀錄 NPC 出現次數，用於生成 fight rabbit 2 等指令
            const npcCounts = {};

            let npcListHtml = "";
            room.npcs.forEach((npcId, index) => {
                if (deadIndices.includes(index)) return;
                const npc = NPCDB[npcId];
                if (npc) {
                    // 計算這是第幾隻同名 NPC
                    if (!npcCounts[npcId]) npcCounts[npcId] = 0;
                    npcCounts[npcId]++;
                    const npcOrder = npcCounts[npcId];

                    const uniqueId = getUniqueNpcId(playerData.location, npcId, index);
                    let statusTag = "";
                    let isUnconscious = false;
                    if (activeNpcMap.has(uniqueId)) {
                        const activeData = activeNpcMap.get(uniqueId);
                        isUnconscious = activeData.isUnconscious || activeData.currentHp <= 0;
                        statusTag += getNpcStatusText(activeData.currentHp, activeData.maxHp, isUnconscious);
                    }
                    if (fightingNpcKeys.has(`${npcId}_${index}`) && !isUnconscious) statusTag += UI.txt(" 【戰鬥中】", "#ff0000", true);

                    const diff = CombatSystem.getDifficultyInfo(playerData, npcId);
                    const coloredName = UI.txt(npc.name, diff.color);
                    
                    // [修改] 按鈕指令加入序號 (例如 fight rabbit 2)
                    let links = `${coloredName} <span style="color:#aaa">(${npc.id})</span>${statusTag} `;
                    links += UI.makeCmd("[看]", `look ${npc.id} ${npcOrder}`, "cmd-btn");
                    
                    if (isUnconscious) {
                        links += UI.makeCmd("[殺]", `kill ${npc.id} ${npcOrder}`, "cmd-btn cmd-btn-buy");
                    } else {
                        const isMyMaster = (playerData.family && playerData.family.masterId === npc.id);
                        if (!isMyMaster && npc.family) links += UI.makeCmd("[拜師]", `apprentice ${npc.id} ${npcOrder}`, "cmd-btn");
                        if (npc.shop) links += UI.makeCmd("[商品]", `list ${npc.id} ${npcOrder}`, "cmd-btn");
                        if (playerData.state !== 'fighting') {
                            links += UI.makeCmd("[戰鬥]", `fight ${npc.id} ${npcOrder}`, "cmd-btn") + UI.makeCmd("[殺]", `kill ${npc.id} ${npcOrder}`, "cmd-btn cmd-btn-buy");
                        }
                    }
                    npcListHtml += `<div style="margin-top:4px;">${links}</div>`;
                }
            });
            if (npcListHtml) UI.print(npcListHtml, "chat", true);
        }

        // 3. 顯示地板物品
        try {
            const itemsRef = collection(db, "room_items");
            const qItems = query(itemsRef, where("roomId", "==", playerData.location));
            const itemSnapshot = await getDocs(qItems);
            let itemHtml = "";
            itemSnapshot.forEach((doc) => {
                const item = doc.data();
                let link = `${UI.txt(item.name, "#ddd")} <span style="color:#666">(${item.itemId})</span> `;
                link += UI.makeCmd("[撿取]", `get ${item.itemId}`, "cmd-btn");
                itemHtml += `<div style="margin-top:2px;">${link}</div>`;
            });
            if (itemHtml) UI.print(itemHtml, "chat", true);
        } catch (e) {}

        if (room.hasWell) UI.print(`這裡有一口清澈的${UI.txt("水井", "#00ffff")}。 ${UI.makeCmd("[喝水]", "drink water", "cmd-btn")}`, "chat", true);

        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitKeys = Object.keys(validExits);
        if (exitKeys.length === 0) UI.print(`明顯的出口：無`, "chat");
        else {
            const exitLinks = exitKeys.map(dir => UI.makeCmd(dir, dir, "cmd-link")).join(", ");
            UI.print(`明顯的出口：${exitLinks}`, "chat", true);
        }
    },

    // === 核心功能：觀察特定目標 (Look Target) ===
    // [修改] 增加 targetOrder 參數 (預設 1)
    lookTarget: async (playerData, targetIdOrName, targetOrder = 1) => {
        UI.hideInspection();
        
        // 轉型確保是數字
        if (typeof targetOrder === 'string') targetOrder = parseInt(targetOrder) || 1;

        // 1. 檢查背包 (暫不支援重名物品索引，通常物品操作用 ID)
        if (playerData.inventory) {
            const item = playerData.inventory.find(i => i.id === targetIdOrName || i.name === targetIdOrName);
            if (item) {
                const info = ItemDB[item.id];
                if (info) {
                    UI.showInspection(info.id || targetIdOrName, info.name, 'item');
                    UI.print(UI.titleLine(info.name), "chat", true);
                    UI.print(info.desc || "看起來平平無奇。");
                    UI.print(UI.attrLine("價值", UI.formatMoney(info.value)), "chat", true);
                    if (info.damage) UI.print(UI.attrLine("殺傷力", info.damage), "chat", true);
                    if (info.defense) UI.print(UI.attrLine("防禦力", info.defense), "chat", true);
                    UI.print(UI.titleLine("End"), "chat", true);
                    return; 
                }
            }
        }

        // 2. 檢查房間內的 NPC
        const room = WorldMap[playerData.location];
        if (room.npcs) {
            let targetNpcId = null;
            let realIndex = -1;
            
            // 確認目標 ID
            if (room.npcs.includes(targetIdOrName)) {
                targetNpcId = targetIdOrName;
            } else {
                for (const nid of room.npcs) {
                    if (NPCDB[nid] && NPCDB[nid].name === targetIdOrName) {
                        targetNpcId = nid;
                        break;
                    }
                }
            }

            if (targetNpcId) {
                const npc = NPCDB[targetNpcId];
                
                // 取得已死亡清單
                let deadIndices = [];
                try {
                    const deadRef = collection(db, "dead_npcs");
                    const q = query(deadRef, where("roomId", "==", playerData.location));
                    const snapshot = await getDocs(q);
                    const now = Date.now();
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        if (now < data.respawnTime && data.npcId === targetNpcId) {
                            deadIndices.push(data.index);
                        }
                    });
                } catch(e) { console.error(e); }

                // [修改] 尋找第 N 隻匹配的 NPC
                let matchCount = 0;
                for(let i=0; i<room.npcs.length; i++) {
                    if (room.npcs[i] === targetNpcId) {
                        // 即使是屍體也要算在次數裡，確保索引位置正確 (例如 rabbit 2 死了，rabbit 3 不應該變成 2)
                        // 但如果是要"觀察"，通常只能觀察活著或昏迷的
                        // 這裡為了簡單，我們跳過"完全消失"的屍體 (但 dead_npcs 其實還沒消失)
                        if (!deadIndices.includes(i)) {
                            matchCount++;
                            if (matchCount === targetOrder) {
                                realIndex = i;
                                break;
                            }
                        }
                    }
                }

                if (realIndex !== -1) {
                    const uniqueId = getUniqueNpcId(playerData.location, targetNpcId, realIndex);
                    let displayHp = npc.combat.hp; 
                    let isUnconscious = false;
                    try {
                        const activeRef = doc(db, "active_npcs", uniqueId);
                        const activeSnap = await getDoc(activeRef);
                        if (activeSnap.exists()) {
                            const activeData = activeSnap.data();
                            displayHp = activeData.currentHp;
                            if (activeData.isUnconscious === true || displayHp <= 0) isUnconscious = true;
                        }
                    } catch (e) {
                        console.error("Fetch NPC state error:", e);
                    }
                    displayHp = Math.max(0, displayHp);

                    UI.showInspection(npc.id, npc.name, 'npc');
                    UI.print(UI.titleLine(npc.name), "chat", true); 
                    UI.print(npc.description);
                    if (isUnconscious) {
                        UI.print(UI.txt("【 狀態：昏迷不醒 】", "#888888", true), "chat", true);
                        UI.print(UI.attrLine("體力", `${displayHp}/${npc.combat.maxHp}`), "chat", true);
                    } else {
                        const hpPct = displayHp / npc.combat.maxHp;
                        let hpColor = "#00ff00";
                        if(hpPct < 0.5) hpColor = "#ffff00";
                        if(hpPct < 0.2) hpColor = "#ff0000";
                        UI.print(UI.attrLine("體力", `${UI.txt(displayHp, hpColor)}/${npc.combat.maxHp}`), "chat", true);
                    }

                    if (playerData.family && playerData.family.masterId === npc.id && npc.skills) {
                        let skillHtml = `<br>${UI.txt("【 師傳武學 】", "#ffff00")}<br>`;
                        skillHtml += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap:5px;">`;
                        for (const [sid, lvl] of Object.entries(npc.skills)) {
                            const sInfo = SkillDB[sid];
                            if (sInfo) {
                                skillHtml += `<div>${sInfo.name} <span style="color:#aaa">(${sid})</span></div>`;
                                skillHtml += `<div>${UI.txt(lvl+"級", "#00ffff")}</div>`;
                                skillHtml += `<div>${getSkillLevelDesc(lvl)} ${UI.makeCmd("[學習]", `learn ${sid} from ${npc.id}`, "cmd-btn")}</div>`;
                            }
                        }
                        skillHtml += `</div>`;
                        UI.print(skillHtml, "chat", true);
                    }
                    
                    UI.print(UI.titleLine("End"), "chat", true);
                    return;
                }
            }
        }

        // 3. 檢查房間內的其他玩家
        try {
            const playersRef = collection(db, "players");
            let q = query(playersRef, where("id", "==", targetIdOrName), where("location", "==", playerData.location));
            let pSnap = await getDocs(q);
            
            if (pSnap.empty) {
                q = query(playersRef, where("name", "==", targetIdOrName), where("location", "==", playerData.location));
                pSnap = await getDocs(q);
            }

            if (!pSnap.empty) {
                const targetP = pSnap.docs[0].data();
                UI.showInspection('player', targetP.name, 'item'); 
                UI.print(UI.titleLine(targetP.name), "chat", true);
                
                UI.print(`一位${targetP.gender || "神秘"}的俠客。`);
                UI.print(UI.attrLine("門派", targetP.sect || "無門無派"), "chat", true);
                
                let hpPct = targetP.attributes.hp / targetP.attributes.maxHp;
                let hpColor = "#00ff00";
                if(hpPct < 0.5) hpColor = "#ffff00";
                if(hpPct < 0.2) hpColor = "#ff0000";
                
                UI.print(UI.attrLine("狀態", targetP.isUnconscious ? UI.txt("昏迷不醒", "#888") : UI.txt("健康", hpColor)), "chat", true);

                if (targetP.equipment) {
                    UI.print("<br>" + UI.txt("【 裝備 】", "#00ffff"), "chat", true);
                    let equipList = "";
                    for (const [slot, itemId] of Object.entries(targetP.equipment)) {
                        const itemInfo = ItemDB[itemId];
                        const slotName = SLOT_NAMES[slot] || slot;
                        if (itemInfo) {
                            equipList += `<div>${slotName}：${itemInfo.name}</div>`;
                        }
                    }
                    if (!equipList) equipList = "<div>全身光溜溜的。</div>";
                    UI.print(equipList, "chat", true);
                }
                
                const actHtml = `<br><div>${UI.makeCmd("[切磋武藝]", `fight ${targetP.id}`, "cmd-btn")}</div>`;
                UI.print(actHtml, "chat", true);

                UI.print(UI.titleLine("End"), "chat", true);
                return;
            }
        } catch(e) {
            console.error("Look player error", e);
        }
        
        UI.print("你看不到 " + targetIdOrName + "。", "error");
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;
        
        if (playerData.state === 'exercising') {
            UI.print("你正在專心修練，無法移動。(輸入 autoforce 解除)", "error");
            return;
        }

        if (playerData.state === 'fighting') {
            if (Math.random() < 0.5) {
                 UI.print("你被敵人纏住了，無法脫身！", "error");
                 return;
            } else {
                 UI.print("你狼狽地逃出了戰圈...", "system");
                 if(CommandSystem.stopCombat) CommandSystem.stopCombat(userId);
            }
        }

        const validExits = MapSystem.getAvailableExits(playerData.location);
        if (!validExits[direction]) {
            const room = WorldMap[playerData.location];
            if (room.walls && room.walls.includes(direction)) UI.print("那邊是一面牆，過不去。", "error");
            else UI.print("那個方向沒有路。", "error");
            return;
        }
        const attr = playerData.attributes;
        if (attr.food <= 0 || attr.water <= 0) { UI.print("你餓得頭昏眼花...", "error"); return; }
        attr.food = Math.max(0, attr.food - 1);
        attr.water = Math.max(0, attr.water - 1);
        
        await MessageSystem.broadcast(playerData.location, `${playerData.name} 往 ${direction} 離開了。`);
        
        const nextRoomId = validExits[direction];
        playerData.location = nextRoomId;
        
        playerData.state = 'normal'; 
        playerData.combatTarget = null;

        UI.print(`你往 ${direction} 走去...`);
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: nextRoomId, 
                "attributes.food": attr.food, 
                "attributes.water": attr.water,
                state: 'normal',
                combatTarget: null
            });
        } catch (e) { console.error(e); }
        await MapSystem.look(playerData);
        await MessageSystem.broadcast(nextRoomId, `${playerData.name} 走了過來。`);

        setTimeout(() => {
            CombatSystem.checkAggro(playerData, nextRoomId, userId);
        }, 800);
    },

    teleport: async (playerData, targetRoomId, userId) => {
        if (playerData.state === 'exercising') {
            UI.print("你正在專心修練，無法傳送。(輸入 autoforce 解除)", "error");
            return;
        }

        if (!WorldMap[targetRoomId]) return UI.print("目標地點不存在。", "error");
        
        if (playerData.state === 'fighting' && CommandSystem.stopCombat) {
            CommandSystem.stopCombat(userId);
        }

        await MessageSystem.broadcast(playerData.location, `${playerData.name} 消失了。`);
        playerData.location = targetRoomId;
        playerData.state = 'normal'; 
        playerData.combatTarget = null;

        UI.print("白光一閃...", "system");
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: targetRoomId, 
                state: 'normal',
                combatTarget: null
            });
        } catch (e) { console.error(e); }
        await MapSystem.look(playerData);
        await MessageSystem.broadcast(targetRoomId, `${playerData.name} 出現了。`);

        setTimeout(() => {
            CombatSystem.checkAggro(playerData, targetRoomId, userId);
        }, 800);
    }
};