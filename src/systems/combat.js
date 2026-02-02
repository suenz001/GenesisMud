// src/systems/combat.js
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc, 
    collection, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";
import { NPCDB } from "../data/npcs.js";
import { ItemDB } from "../data/items.js";
import { SkillDB } from "../data/skills.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js"; 
import { updatePlayer, getCombatStats } from "./player.js";

// 用來控制遞迴迴圈的旗標
const combatControllers = {}; 

// 產生唯一的 NPC 實體 ID (Room + NPC ID + Index)
function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

// 獲取或初始化 NPC 的實體狀態
// 如果 active_npcs 裡沒有這隻怪的資料，就從 NPCDB 複製一份新的上去
async function getOrInitActiveNpc(roomId, npcId, index) {
    const uniqueId = getUniqueNpcId(roomId, npcId, index);
    const docRef = doc(db, "active_npcs", uniqueId);
    
    try {
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            // 資料庫已有此 NPC 的受傷/戰鬥狀態，直接回傳
            return { uniqueId, ...docSnap.data() };
        } else {
            // 資料庫沒有，代表它是滿血狀態，初始化它
            const proto = NPCDB[npcId];
            if (!proto) return null;

            const maxHp = proto.combat.maxHp;
            const initialState = {
                currentHp: maxHp,
                maxHp: maxHp,
                roomId: roomId,
                npcName: proto.name,
                npcId: npcId,
                index: index,
                isUnconscious: false,
                lastCombatTime: Date.now()
            };

            // 寫入資料庫
            await setDoc(docRef, initialState);
            return { uniqueId, ...initialState };
        }
    } catch (e) {
        console.error("NPC 初始化失敗", e);
        return null;
    }
}

// 取得難度顏色 (Look 用)
export function getDifficultyInfo(playerData, npcId) {
    const npc = NPCDB[npcId];
    if (!npc) return { color: "#fff", ratio: 1 };
    // 這裡僅做簡易評估，不涉及即時血量
    return { color: "#ffffff", ratio: 1.0 }; 
}

// 處理掉落物與獎勵
async function handleKillRewards(playerData, npcData, userId) {
    const proto = NPCDB[npcData.npcId];
    
    // 1. 掉落物
    if (proto && proto.drops) {
        for (const drop of proto.drops) {
            if (Math.random() <= drop.rate) {
                const itemInfo = ItemDB[drop.id];
                if(itemInfo) {
                    await addDoc(collection(db, "room_items"), {
                        roomId: playerData.location, 
                        itemId: drop.id, 
                        name: itemInfo.name, 
                        droppedBy: "SYSTEM", 
                        timestamp: serverTimestamp()
                    });
                    UI.print(`${npcData.npcName} 掉出了 ${itemInfo.name}。`, "system");
                }
            }
        }
    }

    // 2. 潛能與經驗
    const potGain = 100; // 簡化計算
    const newPot = (playerData.combat.potential || 0) + potGain;
    const newKills = (playerData.combat.kills || 0) + 1;

    UI.print(UI.txt(`獲得了 ${potGain} 點潛能。`, "#00ff00"), "system");

    await updatePlayer(userId, {
        "combat.potential": newPot,
        "combat.kills": newKills
    });
}

// 處理玩家死亡
async function handlePlayerDeath(playerData, userId) {
    UI.print(UI.txt("你眼前一黑，感覺靈魂脫離了軀體...", "#ff0000", true), "system", true);
    MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 慘叫一聲，倒在地上死了。`, "#ff0000", true));

    // 停止戰鬥
    CombatSystem.stopCombat(userId);

    // 設定死亡狀態
    const deathLocation = "ghost_gate";
    const resetAttr = {
        hp: playerData.attributes.maxHp,
        sp: playerData.attributes.maxSp,
        mp: playerData.attributes.maxMp
    };

    await updatePlayer(userId, {
        location: deathLocation,
        attributes: { ...playerData.attributes, ...resetAttr },
        state: 'normal',
        combatTarget: null,
        isUnconscious: false,
        deathTime: Date.now()
    });

    UI.print("你悠悠醒來，發現自己身處【鬼門關】。", "system");
    
    // 強制重整畫面
    MapSystem.look({ ...playerData, location: deathLocation });
}

export const CombatSystem = {
    getDifficultyInfo, // 匯出供 MapSystem 使用

    // 停止戰鬥 (清除本地狀態)
    stopCombat: (userId) => {
        if (combatControllers[userId]) {
            clearTimeout(combatControllers[userId]); // 清除下一回合的排程
            delete combatControllers[userId];
        }
        updatePlayer(userId, { state: 'normal', combatTarget: null });
    },

    kill: async (playerData, args, userId) => {
        CombatSystem.initiateCombat(playerData, args, userId, true);
    },

    fight: async (playerData, args, userId) => {
        CombatSystem.initiateCombat(playerData, args, userId, false);
    },

    // 戰鬥初始化入口
    initiateCombat: async (playerData, args, userId, isLethal) => {
        if (args.length === 0) { UI.print("你想對誰動手？", "error"); return; }
        if (playerData.state === 'fighting') { UI.print("你已經在戰鬥中了！", "error"); return; }
        
        const room = MapSystem.getRoom(playerData.location);
        if (room.safe) { UI.print("這裡是安全區，禁止動武。", "error"); return; }

        const targetId = args[0];
        // 簡單查找 NPC 索引 (MapSystem 有更複雜的邏輯，這裡簡化處理)
        const roomNpcs = room.npcs || [];
        const npcIndex = roomNpcs.indexOf(targetId);
        
        if (npcIndex === -1) {
            // 嘗試用名稱查找
            const idxByName = roomNpcs.findIndex(nid => NPCDB[nid] && NPCDB[nid].name === targetId);
            if (idxByName === -1) {
                UI.print("這裡沒有這個人。", "error");
                return;
            }
            // 遞迴呼叫使用正確的 ID
            return CombatSystem.initiateCombat(playerData, [roomNpcs[idxByName]], userId, isLethal);
        }

        const npcId = roomNpcs[npcIndex];
        const npcProto = NPCDB[npcId];

        UI.print("正在準備戰鬥數據...", "system");

        // 1. 取得或建立雲端實體 NPC (關鍵步驟：確保打的是實體)
        const activeNpc = await getOrInitActiveNpc(playerData.location, npcId, npcIndex);
        
        if (!activeNpc) {
            UI.print("錯誤：無法初始化目標狀態。", "error");
            return;
        }

        if (activeNpc.isUnconscious && !isLethal) {
            UI.print(`${activeNpc.npcName} 已經昏迷不醒，不需要再切磋了。`, "error");
            return;
        }

        // 2. 標記玩家狀態
        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: npcId, index: npcIndex, uniqueId: activeNpc.uniqueId }
        });

        // 3. 顯示開場白
        const typeText = isLethal ? "下殺手" : "切磋";
        const color = isLethal ? "#ff0000" : "#ff8800";
        UI.print(UI.txt(`你對 ${activeNpc.npcName} ${typeText}！戰鬥開始！`, color, true), "system", true);
        MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 對 ${activeNpc.npcName} ${typeText}，大戰一觸即發！`, color, true));

        // 4. 啟動非同步戰鬥迴圈
        CombatSystem.combatLoop(userId, activeNpc.uniqueId, isLethal);
    },

    // 核心戰鬥迴圈 (Async/Await 遞迴結構)
    combatLoop: async (userId, uniqueId, isLethal) => {
        // A. 讀取階段：確保拿到雙方最新資料
        // ----------------------------------------------------
        // 1. 讀取玩家資料
        const pDoc = await getDoc(doc(db, "players", userId));
        if (!pDoc.exists()) return; // 玩家資料遺失
        const pData = pDoc.data();

        // 檢查戰鬥是否應繼續
        if (pData.state !== 'fighting' || pData.location !== pData.combatTarget?.uniqueId.split('_')[0]) {
            // 玩家已移動或停止戰鬥
            return; 
        }

        // 2. 讀取 NPC 資料 (從 active_npcs)
        const nDocRef = doc(db, "active_npcs", uniqueId);
        const nDoc = await getDoc(nDocRef);

        if (!nDoc.exists()) {
            UI.print("對手已經不在了。", "system");
            CombatSystem.stopCombat(userId);
            return;
        }
        const nData = nDoc.data();

        // B. 計算階段：執行攻防邏輯
        // ----------------------------------------------------
        const pStats = getCombatStats(pData);
        // 簡易模擬 NPC 數值 (從 NPCDB 拿基礎值，這裡未來可擴充為從 nData 拿 buff 狀態)
        const proto = NPCDB[nData.npcId];
        const nStats = {
            ap: (proto.attributes?.str || 20) * 3 + (proto.combat?.attack || 10),
            dp: (proto.attributes?.con || 20) * 3 + (proto.combat?.defense || 10),
            hit: (proto.attributes?.per || 20) * 3,
            dodge: (proto.attributes?.per || 20) * 3,
            atkType: 'unarmed'
        };

        // --- 玩家攻擊 NPC ---
        let dmgToNpc = 0;
        let pMsg = "";
        
        // 昏迷的玩家不能攻擊
        if (!pData.isUnconscious) {
            const hitRate = pStats.hit; 
            const dodgeRate = nStats.dodge;
            // 簡單命中公式
            if (Math.random() * (hitRate + dodgeRate) < hitRate || nData.isUnconscious) {
                dmgToNpc = Math.max(1, Math.floor((pStats.ap - nStats.dp) * (0.9 + Math.random() * 0.2)));
                if (!isLethal) dmgToNpc = Math.ceil(dmgToNpc / 2);
                pMsg = `你對 ${nData.npcName} 造成了 ${dmgToNpc} 點傷害！`;
            } else {
                pMsg = `${nData.npcName} 靈巧地閃過了你的攻擊。`;
            }
        } else {
            pMsg = "你現在昏迷不醒，無法攻擊。";
        }

        // --- NPC 攻擊 玩家 (若 NPC 沒暈) ---
        let dmgToPlayer = 0;
        let nMsg = "";

        if (!nData.isUnconscious && nData.currentHp > 0) {
            const hitRate = nStats.hit;
            const dodgeRate = pStats.dodge;
            if (Math.random() * (hitRate + dodgeRate) < hitRate && !pData.isUnconscious) {
                dmgToPlayer = Math.max(1, Math.floor((nStats.ap - pStats.dp) * (0.9 + Math.random() * 0.2)));
                if (!isLethal) dmgToPlayer = Math.ceil(dmgToPlayer / 2);
                nMsg = `${nData.npcName} 對你造成了 ${dmgToPlayer} 點傷害！`;
            } else {
                nMsg = `你閃過了 ${nData.npcName} 的攻擊。`;
            }
        } else {
            // NPC 昏迷中，不攻擊
        }

        // C. 寫入階段：同步更新資料庫 (關鍵！必須 Await)
        // ----------------------------------------------------
        
        // 更新本地數值以供顯示
        let newNpcHp = nData.currentHp - dmgToNpc;
        let newPlayerHp = pData.attributes.hp - dmgToPlayer;
        let npcUnconscious = nData.isUnconscious;
        let playerUnconscious = pData.isUnconscious;

        // 1. 輸出訊息 (在寫入前或後皆可，這裡選擇寫入前顯示，讓玩家感覺流暢)
        UI.print(pMsg, "chat");
        if (nMsg) UI.print(nMsg, "chat");
        UI.updateHUD({ ...pData, attributes: { ...pData.attributes, hp: newPlayerHp } });

        // 2. 準備 NPC 更新資料
        const npcUpdatePayload = {
            currentHp: newNpcHp,
            lastCombatTime: Date.now()
        };

        // 3. 準備 玩家 更新資料
        const playerUpdatePayload = {
            "attributes.hp": newPlayerHp
        };

        // 4. 執行寫入 (同步等待)
        try {
            await Promise.all([
                updateDoc(nDocRef, npcUpdatePayload),
                updatePlayer(userId, playerUpdatePayload)
            ]);
        } catch (e) {
            console.error("戰鬥資料同步失敗", e);
            // 發生錯誤時暫停一會再重試，或直接中斷
            return; 
        }

        // D. 判定階段：檢查勝負
        // ----------------------------------------------------
        let battleEnded = false;

        // 檢查玩家狀態
        if (newPlayerHp <= 0) {
            if (isLethal) {
                // 被 NPC 殺死
                await handlePlayerDeath(pData, userId);
                return; // 結束
            } else {
                // 被打暈 (切磋輸了)
                UI.print("你眼前一黑，敗下陣來。", "system");
                MessageSystem.broadcast(pData.location, `${pData.name} 敗給了 ${nData.npcName}。`);
                await updatePlayer(userId, { isUnconscious: true, "attributes.hp": 0 });
                CombatSystem.stopCombat(userId);
                return; // 結束
            }
        }

        // 檢查 NPC 狀態
        if (newNpcHp <= 0) {
            if (isLethal) {
                // 殺死 NPC
                UI.print(UI.txt(`${nData.npcName} 慘叫一聲，倒地身亡！`, "#ff0000", true), "system", true);
                MessageSystem.broadcast(pData.location, UI.txt(`${nData.npcName} 被 ${pData.name} 殺死了。`, "#ff0000", true));
                
                // 1. 刪除 active_npc (因為死了)
                await deleteDoc(nDocRef);
                
                // 2. 加入 dead_npcs (計算重生)
                await addDoc(collection(db, "dead_npcs"), { 
                    roomId: pData.location, 
                    npcId: nData.npcId, 
                    index: nData.index, 
                    respawnTime: Date.now() + 300000 // 5分鐘重生
                });

                // 3. 發獎勵
                await handleKillRewards(pData, nData, userId);
                
                CombatSystem.stopCombat(userId);
                
                // 4. 刷新房間視覺
                MapSystem.look(pData);
                return; // 結束

            } else {
                // 打暈 NPC (Fight 勝利)
                if (!npcUnconscious) {
                    UI.print(UI.txt(`${nData.npcName} 晃了晃，咚的一聲倒在地上暈了過去。`, "#ffff00"), "system", true);
                    MessageSystem.broadcast(pData.location, `${pData.name} 打暈了 ${nData.npcName}。`);
                    
                    // 標記為昏迷，但不刪除，讓它留在 active_npcs 裡保持昏迷狀態
                    await updateDoc(nDocRef, { isUnconscious: true, currentHp: 0 });
                    
                    // 給一點獎勵
                    const newPot = (pData.combat.potential || 0) + 10;
                    await updatePlayer(userId, { "combat.potential": newPot });
                    UI.print("切磋獲勝！獲得 10 點潛能。", "system");
                } else {
                    UI.print(`你看著暈倒的 ${nData.npcName}，收住了手。`, "system");
                }
                
                CombatSystem.stopCombat(userId);
                return; // 結束
            }
        }

        // E. 排程階段：等待下一回合
        // ----------------------------------------------------
        // 只有在資料寫入完成、且戰鬥未結束時，才會排程下一次
        combatControllers[userId] = setTimeout(() => {
            CombatSystem.combatLoop(userId, uniqueId, isLethal);
        }, 2000);
    }
};