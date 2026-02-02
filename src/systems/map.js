// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { CommandSystem } from "./commands.js"; 
import { SkillDB } from "../data/skills.js"; 
import { CombatSystem } from "./combat.js";
import { ItemDB } from "../data/items.js";

const DIR_OFFSET = {
    'north': { x: 0, y: 1, z: 0 }, 'south': { x: 0, y: -1, z: 0 },
    'east':  { x: 1, y: 0, z: 0 }, 'west':  { x: -1, y: 0, z: 0 },
    'up':    { x: 0, y: 0, z: 1 }, 'down':  { x: 0, y: 0, z: -1 },
    'northeast': { x: 1, y: 1, z: 0 }, 'northwest': { x: -1, y: 1, z: 0 },
    'southeast': { x: 1, y: -1, z: 0 }, 'southwest': { x: -1, y: -1, z: 0 }
};

function getSkillDesc(level) {
    if (level >= 500) return UI.txt("深不可測", "#ff00ff");
    if (level >= 400) return UI.txt("返璞歸真", "#ff0000");
    if (level >= 300) return UI.txt("出神入化", "#ff8800");
    if (level >= 200) return UI.txt("登峰造極", "#ffff00");
    if (level >= 150) return UI.txt("出類拔萃", "#00ff00");
    if (level >= 100) return UI.txt("爐火純青", "#00ffff");
    if (level >= 60) return UI.txt("融會貫通", "#0088ff");
    if (level >= 30) return UI.txt("駕輕就熟", "#8888ff");
    return UI.txt("略有小成", "#ffffff");
}

function getNpcStatusText(currentHp, maxHp, isUnconscious) {
    // 強制轉換數值以防萬一
    const cur = parseInt(currentHp);
    const max = parseInt(maxHp);
    
    if (isUnconscious || cur <= 0) return UI.txt(" (昏迷不醒)", "#888888");
    if (cur >= max) return "";
    
    const pct = cur / max;
    if (pct < 0.2) return UI.txt(" (重傷)", "#ff5555");
    if (pct < 0.5) return UI.txt(" (受傷)", "#ffaa00");
    if (pct < 0.8) return UI.txt(" (輕傷)", "#ffff00");
    return UI.txt(" (擦傷)", "#cccccc");
}

// 輔助：產生與 combat.js 完全一致的 ID
function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
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

        // 1. 顯示房間內的玩家
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

        const fightingNpcKeys = new Set();
        playersInRoom.forEach(p => {
            if (p.state === 'fighting' && p.combatTarget) {
                fightingNpcKeys.add(`${p.combatTarget.id}_${p.combatTarget.index}`);
            }
        });

        // 2. 顯示房間內的 NPC (關鍵修正：改用 Promise.all 並行讀取 ID，確保強一致性)
        if (room.npcs && room.npcs.length > 0) {
            // 先讀取屍體資料 (屍體不是即時戰鬥數據，Query 沒問題)
            let deadIndices = [];
            try {
                const deadRef = collection(db, "dead_npcs");
                const q = query(deadRef, where("roomId", "==", playerData.location));
                const snapshot = await getDocs(q);
                const now = Date.now();
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (now >= data.respawnTime) {
                         deleteDoc(doc.ref); // 清理過期屍體
                    } else {
                         if(data.npcId && data.index !== undefined) {
                             deadIndices.push(`${data.npcId}_${data.index}`);
                         }
                    }
                });
            } catch (e) { console.error(e); }

            // 準備讀取所有活體 NPC 的即時狀態
            // 我們不使用 Query (搜尋)，而是直接用 ID 去 getDoc，這樣速度最快且最準確
            const fetchPromises = room.npcs.map((npcId, index) => {
                // 如果是屍體就跳過讀取
                if (deadIndices.includes(`${npcId}_${index}`)) return Promise.resolve(null);
                
                const uniqueId = getUniqueNpcId(playerData.location, npcId, index);
                return getDoc(doc(db, "active_npcs", uniqueId))
                    .then(snap => {
                        if (snap.exists()) return { id: uniqueId, ...snap.data() };
                        return null; // 沒受傷的 NPC
                    })
                    .catch(e => null);
            });

            const activeNpcResults = await Promise.all(fetchPromises);
            
            // 將結果轉為 Map 方便查找
            const activeNpcMap = new Map();
            activeNpcResults.forEach(data => {
                if (data) activeNpcMap.set(data.id, data);
            });

            let npcListHtml = "";
            room.npcs.forEach((npcId, index) => {
                const isDead = deadIndices.includes(`${npcId}_${index}`);
                
                if (!isDead) {
                    const npc = NPCDB[npcId];
                    if (npc) {
                        const uniqueId = getUniqueNpcId(playerData.location, npcId, index);
                        let statusTag = "";
                        let isUnconscious = false;
                        
                        // 檢查是否有受傷紀錄
                        if (activeNpcMap.has(uniqueId)) {
                            const activeData = activeNpcMap.get(uniqueId);
                            // console.log(`[Map Debug] Found ${uniqueId}: HP=${activeData.currentHp}`); // 除錯用
                            
                            isUnconscious = activeData.isUnconscious;
                            statusTag += getNpcStatusText(activeData.currentHp, activeData.maxHp, isUnconscious);
                        }

                        if (fightingNpcKeys.has(`${npcId}_${index}`) && !isUnconscious) {
                            statusTag += UI.txt(" 【戰鬥中】", "#ff0000", true);
                        }

                        // 顏色處理
                        const diff = CombatSystem.getDifficultyInfo(playerData, npcId);
                        const coloredName = UI.txt(npc.name, diff.color);

                        let links = `${coloredName} <span style="color:#aaa">(${npc.id})</span>${statusTag} `;
                        links += UI.makeCmd("[看]", `look ${npc.id}`, "cmd-btn");
                        
                        if (isUnconscious) {
                            links += UI.makeCmd("[殺]", `kill ${npc.id}`, "cmd-btn cmd-btn-buy");
                        } else {
                            const isMyMaster = (playerData.family && playerData.family.masterId === npc.id);
                            if (!isMyMaster && npc.family) {
                                links += UI.makeCmd("[拜師]", `apprentice ${npc.id}`, "cmd-btn");
                            }
                            
                            if (npc.shop) links += UI.makeCmd("[商品]", `list ${npc.id}`, "cmd-btn");
                            
                            if (playerData.state !== 'fighting') {
                                links += UI.makeCmd("[戰鬥]", `fight ${npc.id}`, "cmd-btn");
                                links += UI.makeCmd("[殺]", `kill ${npc.id}`, "cmd-btn cmd-btn-buy");
                            }
                        }

                        npcListHtml += `<div style="margin-top:4px;">${links}</div>`;
                    }
                }
            });
            if (npcListHtml) UI.print(npcListHtml, "chat", true);
        }

        // 3. 顯示其他玩家
        if (playersInRoom.length > 0) {
            let playerHtml = "";
            playersInRoom.forEach((p) => {
                if (auth.currentUser && p.id === playerData.id) return; 

                let status = "";
                if (p.state === 'fighting') status = UI.txt(" 【戰鬥中】", "#ff0000", true);
                if (p.isUnconscious) status += UI.txt(" (昏迷)", "#888");

                playerHtml += `<div style="margin-top:2px;">[ 玩家 ] ${p.name} <span style="color:#aaa">(${p.id || 'unknown'})</span>${status}</div>`;
            });
            if (playerHtml) UI.print(playerHtml, "chat", true);
        }

        // 4. 顯示掉落物
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
        } catch (e) { console.error(e); }

        if (room.hasWell) {
            UI.print(`這裡有一口清澈的${UI.txt("水井", "#00ffff")}。 ${UI.makeCmd("[喝水]", "drink water", "cmd-btn")}`, "chat", true);
        }

        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitKeys = Object.keys(validExits);
        
        if (exitKeys.length === 0) UI.print(`明顯的出口：無`, "chat");
        else {
            const exitLinks = exitKeys.map(dir => UI.makeCmd(dir, dir, "cmd-link")).join(", ");
            UI.print(`明顯的出口：${exitLinks}`, "chat", true);
        }
    },

    lookTarget: async (playerData, targetIdOrName) => {
        UI.hideInspection();

        // 1. 檢查背包
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
            
            // 先嘗試 ID 匹配，再嘗試名稱匹配
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
                
                // 找出該 NPC 在房間的「活體」索引
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

                // 找到第一個活著的實體
                for(let i=0; i<room.npcs.length; i++) {
                    if (room.npcs[i] === targetNpcId) {
                        if (!deadIndices.includes(i)) {
                            realIndex = i;
                            break; 
                        }
                    }
                }

                if (realIndex === -1) {
                    UI.print("你看不到 " + targetIdOrName + " (可能已經死了)。", "error");
                    return;
                }

                const uniqueId = getUniqueNpcId(playerData.location, targetNpcId, realIndex);
                
                let displayHp = npc.combat.hp;
                let isUnconscious = false;
                
                // === 關鍵修正：直接 getDoc 讀取 ID，確保不因 Query 延遲而讀不到 ===
                try {
                    const activeRef = doc(db, "active_npcs", uniqueId);
                    const activeSnap = await getDoc(activeRef);
                    
                    if (activeSnap.exists()) {
                        const activeData = activeSnap.data();
                        displayHp = activeData.currentHp;
                        // 明確判定
                        if (activeData.isUnconscious === true || displayHp <= 0) {
                            isUnconscious = true;
                            displayHp = 0; // 顯示為 0
                        }
                        // console.log(`[LookTarget Debug] ${uniqueId} HP: ${displayHp}`);
                    }
                } catch (e) {
                    console.error("Fetch NPC state error:", e);
                }

                UI.showInspection(npc.id, npc.name, 'npc');
                UI.print(UI.titleLine(npc.name), "chat", true); 
                UI.print(npc.description);
                
                if (isUnconscious) {
                    UI.print(UI.txt("【 狀態：昏迷不醒 】", "#888888", true), "chat", true);
                    UI.print(UI.attrLine("體力", `0/${npc.combat.maxHp}`), "chat", true);
                } else {
                    UI.print(UI.attrLine("體力", `${displayHp}/${npc.combat.maxHp}`), "chat", true);
                }

                if (playerData.family && playerData.family.masterId === npc.id && npc.skills) {
                    let skillHtml = `<br>${UI.txt("【 師傳武學 】", "#ffff00")}<br>`;
                    skillHtml += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap:5px;">`;
                    for (const [sid, lvl] of Object.entries(npc.skills)) {
                        const sInfo = SkillDB[sid];
                        if (sInfo) {
                            skillHtml += `<div>${sInfo.name} <span style="color:#aaa">(${sid})</span></div>`;
                            skillHtml += `<div>${UI.txt(lvl+"級", "#00ffff")}</div>`;
                            skillHtml += `<div>${getSkillDesc(lvl)} ${UI.makeCmd("[學習]", `learn ${sid} from ${npc.id}`, "cmd-btn")}</div>`;
                        }
                    }
                    skillHtml += `</div>`;
                    UI.print(skillHtml, "chat", true);
                }
                
                UI.print(UI.titleLine("End"), "chat", true);
                return;
            }
        }
        
        UI.print("你看不到 " + targetIdOrName + "。", "error");
    },

    move: async (playerData, direction, userId) => {
        if (!playerData) return;
        
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
    },

    teleport: async (playerData, targetRoomId, userId) => {
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
    }
};