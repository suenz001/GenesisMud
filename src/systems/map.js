// src/systems/map.js
import { doc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { WorldMap } from "../data/world.js";
import { UI } from "../ui.js";
import { db, auth } from "../firebase.js"; // 引入 auth 以便排除自己
import { NPCDB } from "../data/npcs.js";

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

    getAvailableExits: (currentRoomId) => {
        const room = WorldMap[currentRoomId];
        if (!room) return {};
        const exits = {};
        if (room.exits) Object.assign(exits, room.exits);

        for (const [dir, offset] of Object.entries(DIR_OFFSET)) {
            if (room.walls && room.walls.includes(dir)) continue;
            const targetX = room.x + offset.x;
            const targetY = room.y + offset.y;
            const targetZ = room.z + offset.z;

            for (const [targetId, targetRoom] of Object.entries(WorldMap)) {
                if (targetRoom.x === targetX && targetRoom.y === targetY && targetRoom.z === targetZ) {
                    if (!exits[dir]) exits[dir] = targetId;
                    break;
                }
            }
        }
        return exits;
    },

    // 修改為 async，因為要讀取資料庫找其他玩家
    look: async (playerData) => {
        if (!playerData || !playerData.location) return;
        const room = WorldMap[playerData.location];
        if (!room) {
            UI.print("你陷入虛空...", "error");
            return;
        }

        UI.updateLocationInfo(room.title);
        UI.updateHUD(playerData);
        UI.print(`【${room.title}】`, "system");
        UI.print(room.description);

        let chars = [];
        
        // 1. 顯示 NPC (來自本地資料)
        if (room.npcs && room.npcs.length > 0) {
            room.npcs.forEach(npcId => {
                const npc = NPCDB[npcId];
                if (npc) {
                    let links = `${npc.name}(${npc.id})`;
                    links += UI.makeCmd("[看]", `look ${npc.id}`, "cmd-btn");
                    if (npc.shop) {
                        links += UI.makeCmd("[商品]", `list ${npc.id}`, "cmd-btn");
                    }
                    chars.push(links);
                }
            });
        }

        // 2. --- 顯示其他玩家 (來自資料庫) ---
        // 查詢： location 等於 當前房間
        try {
            const playersRef = collection(db, "players");
            const q = query(playersRef, where("location", "==", playerData.location));
            const querySnapshot = await getDocs(q);

            querySnapshot.forEach((doc) => {
                // 排除自己 (auth.currentUser.uid 是目前登入者的 ID)
                if (auth.currentUser && doc.id !== auth.currentUser.uid) {
                    const otherPlayer = doc.data();
                    const name = otherPlayer.name || "無名氏";
                    
                    // 這裡可以加入互動按鈕，例如 [看]
                    // 但因為目前 commands.js 的 look 還不支援看玩家資料庫，我們先只顯示名字
                    // 未來可以擴充: look <player_name>
                    let pStr = `[ 玩家 ] : ${name}`;
                    // pStr += UI.makeCmd("[看]", `look ${name}`, "cmd-btn"); // 預留
                    chars.push(pStr);
                }
            });
        } catch (e) {
            console.error("讀取玩家列表失敗", e);
        }

        if (chars.length > 0) {
            // 使用 HTML 渲染
            UI.print(`這裡明顯的人物有：${chars.join("、")}`, "chat", true);
        } else {
            // 如果沒人也沒 NPC，可以顯示這行 (選用)
            // UI.print("這裡目前空無一人。", "chat");
        }

        // 3. 顯示出口
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

    move: async (playerData, direction, userId) => {
        if (!playerData) return;
        const validExits = MapSystem.getAvailableExits(playerData.location);

        if (!validExits[direction]) {
            const room = WorldMap[playerData.location];
            if (room.walls && room.walls.includes(direction)) {
                UI.print("那邊是一面牆，過不去。", "error");
            } else {
                UI.print("那個方向沒有路。", "error");
            }
            return;
        }

        const attr = playerData.attributes;
        // 簡單的體力檢查
        if (attr.food <= 0 || attr.water <= 0) {
            UI.print("你餓得頭昏眼花，一步也走不動了...", "error");
            return;
        }

        attr.food = Math.max(0, attr.food - 1);
        attr.water = Math.max(0, attr.water - 1);
        
        if (attr.food < 10) UI.print("你的肚子咕嚕咕嚕叫了起來。", "system");
        if (attr.water < 10) UI.print("你口乾舌燥，急需喝水。", "system");

        const nextRoomId = validExits[direction];
        playerData.location = nextRoomId;
        
        UI.print(`你往 ${direction} 走去...`);
        
        // 1. 先更新資料庫 (讓別人能看到我移動過來了)
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { 
                location: nextRoomId,
                "attributes.food": attr.food,
                "attributes.water": attr.water
            });
        } catch (e) { console.error(e); }

        // 2. 再執行 Look (這樣 Look 抓到的資料才是最新的，且位置正確)
        await MapSystem.look(playerData);
    },

    teleport: async (playerData, targetRoomId, userId) => {
        if (!WorldMap[targetRoomId]) {
            UI.print("目標地點不存在。", "error");
            return;
        }
        playerData.location = targetRoomId;
        UI.print("白光一閃...", "system");
        
        try {
            const playerRef = doc(db, "players", userId);
            await updateDoc(playerRef, { location: targetRoomId });
        } catch (e) { console.error(e); }

        await MapSystem.look(playerData);
    }
};