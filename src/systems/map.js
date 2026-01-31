// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; 
import { NPCDB } from "../data/npcs.js";
import { MessageSystem } from "./messages.js";
import { ItemDB } from "../data/items.js"; // 引入 ItemDB 以顯示掉落物名稱

const DIR_OFFSET = {
    'north': { x: 0, y: 1, z: 0 },
    'south': { x: 0, y: -1, z: 0 },
    'east':  { x: 1, y: 0, z: 0 },
    'west':  { x: -1, y: 0, z: 0 },
    'up':    { x: 0, y: 0, z: 1 },
    'down':  { x: 0, y: 0, z: -1 },
    'northeast': { x: 1, y: 1, z: 0 },
    'northwest': { x: -1, y: 1, z: 0 },
    'southeast': { x: 1, y: -1, z: 0 },
    'southwest': { x: -1, y: -1, z: 0 }
};

export const MapSystem = {
    getRoom: (roomId) => WorldMap[roomId],

    // 取得有效出口 (含座標計算、牆壁檢查、區域檢查)
    getAvailableExits: (currentRoomId) => {
        const room = WorldMap[currentRoomId];
        if (!room) return {};
        const exits = {};
        if (room.exits) Object.assign(exits, room.exits);

        // 取得當前房間區域 (預設為 world)
        const currentRegions = room.region || ["world"];

        for (const [dir, offset] of Object.entries(DIR_OFFSET)) {
            if (room.walls && room.walls.includes(dir)) continue;
            const targetX = room.x + offset.x;
            const targetY = room.y + offset.y;
            const targetZ = room.z + offset.z;

            for (const [targetId, targetRoom] of Object.entries(WorldMap)) {
                if (targetRoom.x === targetX && targetRoom.y === targetY && targetRoom.z === targetZ) {
                    
                    // --- 檢查區域相容性 (Region Check) ---
                    // 只有當目標房間與當前房間有「共同的區域標籤」時，才算連通
                    const targetRegions = targetRoom.region || ["world"];
                    const hasCommonRegion = currentRegions.some(r => targetRegions.includes(r));

                    if (hasCommonRegion) {
                        if (!exits[dir]) exits[dir] = targetId;
                    }
                }
            }
        }
        return exits;
    },

    // 執行 Look (顯示房間資訊、人物、物品、出口)
    look: async (playerData) => {
        if (!playerData || !playerData.location) return;
        const room = WorldMap[playerData.location];
        if (!room) {
            UI.print("你陷入虛空...", "error");
            return;
        }

        // 1. 切換廣播監聽頻道
        MessageSystem.listenToRoom(playerData.location);

        // 2. 更新介面
        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData);
        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);

        let chars = [];
        
        // 3. 顯示 NPC (來自本地資料庫)
        if (room.npcs && room.npcs.length > 0) {
            room.npcs.forEach(npcId => {
                const npc = NPCDB[npcId];
                if (npc) {
                    // 顯示格式：店小二(waiter) [看] [商品]
                    let links = `${npc.name}(${npc.id})`;
                    links += UI.makeCmd("[看]", `look ${npc.id}`, "cmd-btn");
                    if (npc.shop) {
                        links += UI.makeCmd("[商品]", `list ${npc.id}`, "cmd-btn");
                    }
                    chars.push(links);
                }
            });
        }

        // 4. 顯示其他玩家 (從 Firestore 讀取)
        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("location", "==", playerData.location));
            const querySnapshot = await getDocs(q);

            querySnapshot.forEach((doc) => {
                // 排除自己
                if (auth.currentUser && doc.id !== auth.currentUser.uid) {
                    const p = doc.data();
                    const pName = p.name || "無名氏";
                    const pId = p.id || "unknown"; 
                    chars.push(`[ 玩家 ] : ${pName}(${pId})`);
                }
            });
        } catch (e) {
            console.error("讀取玩家列表失敗", e);
        }

        if (chars.length > 0) {
            UI.print(`這裡明顯的人物有：${chars.join("、")}`, "chat", true);
        }

        // 5. 顯示掉落物 (從 room_items 集合讀取)
        try {
            const itemsRef = collection(db, "room_items");
            const qItems = query(itemsRef, where("roomId", "==", playerData.location));
            const itemSnapshot = await getDocs(qItems);
            let droppedItems = [];
            
            itemSnapshot.forEach((doc) => {
                const item = doc.data();
                // 顯示格式：白米飯(rice) [撿取]
                // 這裡我們需要顯示 item.itemId (原型ID)，但 get 指令需要傳入這個物品的 itemId
                // 為了方便辨識，我們可以顯示 名稱(ID)
                let link = `${item.name}(${item.itemId})`;
                link += UI.makeCmd("[撿取]", `get ${item.itemId}`, "cmd-btn");
                droppedItems.push(link);
            });

            if (droppedItems.length > 0) {
                UI.print(`地上的物品：${droppedItems.join("、")}`, "chat", true);
            }

        } catch (e) {
            console.error("讀取地面物品失敗", e);
        }

        // 6. 顯示出口 (互動按鈕)
        const validExits = MapSystem.getAvailableExits(playerData.location);
        const exitKeys = Object.keys(validExits);
        
        if (exitKeys.length === 0) {
            UI.print(`明顯的出口：無`, "chat");
        } else {
            const exitLinks = exitKeys.map(dir => {
                return UI.makeCmd(dir, dir, "cmd-link");
            }).join(", ");
            UI.print(`明顯的出口：${exitLinks}`, "chat", true);
        }
    },

    // 移動邏輯
    move: async (playerData, direction, userId) => {
        if (!playerData) return;
        const validExits = MapSystem.getAvailableExits(playerData.location);

        // 檢查方向是否有效
        if (!validExits[direction]) {
            const room = WorldMap[playerData.location];
            if (room.walls && room.walls.includes(direction)) {
                UI.print("那邊是一面牆，過不去。", "error");
            } else {
                UI.print("那個方向沒有路。", "error");
            }
            return;
        }

        // 檢查體力
        const attr = playerData.attributes;
        if (attr.food <= 0 || attr.water <= 0) {
            UI.print("你餓得頭昏眼花，一步也走不動了...", "error");
            return;
        }

        // 扣除消耗
        attr.food = Math.max(0, attr.food - 1);
        attr.water = Math.max(0, attr.water - 1);
        
        if (attr.food < 10) UI.print("你的肚子咕嚕咕嚕叫了起來。", "system");
        if (attr.water < 10) UI.print("你口乾舌燥，急需喝水。", "system");

        // 廣播離開訊息 (在舊房間)
        await MessageSystem.broadcast(playerData.location, `${playerData.name} 往 ${direction} 離開了。`);
        
        const nextRoomId = validExits[direction];
        playerData.location = nextRoomId;
        
        UI.print(`你往 ${direction} 走去...`);
        
        // 更新資料庫
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: nextRoomId,
                "attributes.food": attr.food,
                "attributes.water": attr.water
            });
        } catch (e) {
            console.error(e);
        }

        // 執行 Look (這會切換監聽頻道到新房間)
        await MapSystem.look(playerData);

        // 廣播進入訊息 (在新房間)
        await MessageSystem.broadcast(nextRoomId, `${playerData.name} 走了過來。`);
    },

    // 傳送邏輯 (用於 Recall)
    teleport: async (playerData, targetRoomId, userId) => {
        if (!WorldMap[targetRoomId]) {
            UI.print("目標地點不存在。", "error");
            return;
        }
        
        // 廣播消失
        await MessageSystem.broadcast(playerData.location, `${playerData.name} 化作一道白光消失了。`);
        
        playerData.location = targetRoomId;
        UI.print("白光一閃...", "system");
        
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { location: targetRoomId });
        } catch (e) { console.error(e); }

        await MapSystem.look(playerData);
        
        // 廣播出現
        await MessageSystem.broadcast(targetRoomId, `${playerData.name} 在一陣白光中出現了。`);
    }
};