// src/systems/combat.js
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc, 
    collection, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";
import { NPCDB } from "../data/npcs.js";
import { ItemDB } from "../data/items.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js"; 
import { updatePlayer, getCombatStats } from "./player.js";

// 用來控制戰鬥迴圈的計時器儲存物件
const combatControllers = {}; 

// 產生唯一的 ID (對應 active_npcs 集合中的文件 ID)
// 這裡的 active_npcs 僅代表「受傷狀態表」，不代表替身
function getUniqueNpcId(roomId, npcId, index) {
    return `${roomId}_${npcId}_${index}`;
}

// 取得難度顏色 (Look 用)
export function getDifficultyInfo(playerData, npcId) {
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

    // 2. 潛能與經驗 (簡易版)
    const potGain = 100; 
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

    CombatSystem.stopCombat(userId);

    const deathLocation = "ghost_gate";
    // 死亡懲罰：恢復滿狀態但送去鬼門關
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
    MapSystem.look({ ...playerData, location: deathLocation });
}

export const CombatSystem = {
    getDifficultyInfo, 

    // 停止戰鬥 (清除本地排程)
    stopCombat: (userId) => {
        if (combatControllers[userId]) {
            clearTimeout(combatControllers[userId]); 
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

    // 戰鬥初始化
    initiateCombat: async (playerData, args, userId, isLethal) => {
        if (args.length === 0) { UI.print("你想對誰動手？", "error"); return; }
        if (playerData.state === 'fighting') { UI.print("你已經在戰鬥中了！", "error"); return; }
        
        const room = MapSystem.getRoom(playerData.location);
        if (room.safe) { UI.print("這裡是安全區，禁止動武。", "error"); return; }

        const targetId = args[0];
        const roomNpcs = room.npcs || [];
        
        // 1. 尋找目標索引
        let npcIndex = roomNpcs.indexOf(targetId);
        if (npcIndex === -1) {
            const idxByName = roomNpcs.findIndex(nid => NPCDB[nid] && NPCDB[nid].name === targetId);
            if (idxByName === -1) {
                UI.print("這裡沒有這個人。", "error");
                return;
            }
            npcIndex = idxByName;
        }

        const npcId = roomNpcs[npcIndex];
        const npcProto = NPCDB[npcId];
        const uniqueId = getUniqueNpcId(playerData.location, npcId, npcIndex);

        // 2. 檢查目標是否已死 (從 dead_npcs 查)
        // 雖然 map.js 已經過濾顯示，但為了安全起見再查一次，或者在 Loop 裡查
        // 這裡為了流暢度，直接開始，Loop 裡會檢查

        // 3. 標記玩家狀態
        await updatePlayer(userId, { 
            state: 'fighting', 
            combatTarget: { id: npcId, index: npcIndex, uniqueId: uniqueId }
        });

        // 4. 顯示開場白
        const typeText = isLethal ? "下殺手" : "切磋";
        const color = isLethal ? "#ff0000" : "#ff8800";
        UI.print(UI.txt(`你對 ${npcProto.name} ${typeText}！戰鬥開始！`, color, true), "system", true);
        MessageSystem.broadcast(playerData.location, UI.txt(`${playerData.name} 對 ${npcProto.name} ${typeText}，大戰一觸即發！`, color, true));

        // 5. 直接進入迴圈，不需要先建立資料庫文件
        CombatSystem.combatLoop(userId, uniqueId, npcId, npcIndex, isLethal);
    },

    // 核心戰鬥迴圈
    combatLoop: async (userId, uniqueId, npcId, npcIndex, isLethal) => {
        // A. 讀取階段
        // ----------------------------------------------------
        // 1. 玩家資料
        const pDoc = await getDoc(doc(db, "players", userId));
        if (!pDoc.exists()) return; 
        const pData = pDoc.data();

        if (pData.state !== 'fighting' || pData.location !== uniqueId.split('_')[0]) {
            return; // 停止
        }

        // 2. NPC 資料 (關鍵修改：讀不到就當滿血)
        // active_npcs 在這裡只作為「傷勢紀錄表」使用
        const nDocRef = doc(db, "active_npcs", uniqueId);
        const nDoc = await getDoc(nDocRef);
        
        const proto = NPCDB[npcId];
        let currentNpcHp = proto.combat.maxHp;
        let maxNpcHp = proto.combat.maxHp;
        let npcIsUnconscious = false;
        let npcName = proto.name;

        // 如果資料庫有紀錄，代表受傷過，使用資料庫的數值
        if (nDoc.exists()) {
            const d = nDoc.data();
            currentNpcHp = d.currentHp;
            npcIsUnconscious = d.isUnconscious || false;
        } else {
            // 如果資料庫沒紀錄，檢查是否已經死了 (dead_npcs)
            // 這裡簡單做：假設沒 active_npcs 紀錄就是滿血活著
            // (如果剛死掉還沒重生，MapSystem 不會顯示，玩家也點不到，所以這裡假設活著是安全的)
        }

        // B. 計算階段
        // ----------------------------------------------------
        const pStats = getCombatStats(pData);
        // 簡易 NPC 數值
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

        if (!pData.isUnconscious) {
            // 如果 NPC 已經暈了且不是下殺手，停止攻擊
            if (npcIsUnconscious && !isLethal) {
                UI.print(`${npcName} 已經暈過去了，你收住了手。`, "system");
                CombatSystem.stopCombat(userId);
                return;
            }

            const hitRate = pStats.hit; 
            const dodgeRate = nStats.dodge;
            if (Math.random() * (hitRate + dodgeRate) < hitRate || npcIsUnconscious) {
                dmgToNpc = Math.max(1, Math.floor((pStats.ap - nStats.dp) * (0.9 + Math.random() * 0.2)));
                if (!isLethal) dmgToNpc = Math.ceil(dmgToNpc / 2);
                pMsg = `你對 ${npcName} 造成了 ${dmgToNpc} 點傷害！`;
            } else {
                pMsg = `${npcName} 靈巧地閃過了你的攻擊。`;
            }
        } else {
            pMsg = "你現在昏迷不醒，無法攻擊。";
        }

        // --- NPC 攻擊 玩家 ---
        let dmgToPlayer = 0;
        let nMsg = "";

        if (!npcIsUnconscious && currentNpcHp > 0) {
            const hitRate = nStats.hit;
            const dodgeRate = pStats.dodge;
            if (Math.random() * (hitRate + dodgeRate) < hitRate && !pData.isUnconscious) {
                dmgToPlayer = Math.max(1, Math.floor((nStats.ap - pStats.dp) * (0.9 + Math.random() * 0.2)));
                if (!isLethal) dmgToPlayer = Math.ceil(dmgToPlayer / 2);
                nMsg = `${npcName} 對你造成了 ${dmgToPlayer} 點傷害！`;
            } else {
                nMsg = `你閃過了 ${npcName} 的攻擊。`;
            }
        }

        // C. 寫入階段 (一定要寫入 DB 才能同步)
        // ----------------------------------------------------
        let newNpcHp = currentNpcHp - dmgToNpc;
        let newPlayerHp = pData.attributes.hp - dmgToPlayer;
        
        // 顯示訊息
        UI.print(pMsg, "chat");
        if (nMsg) UI.print(nMsg, "chat");
        UI.updateHUD({ ...pData, attributes: { ...pData.attributes, hp: newPlayerHp } });

        // 準備 NPC 狀態更新 (只有當有傷害變化，或者原本沒紀錄時才必須寫入)
        // 這裡我們每回合寫入一次，確保狀態最新
        const npcStateData = {
            currentHp: newNpcHp,
            maxHp: maxNpcHp,
            roomId: pData.location,
            npcName: npcName,
            npcId: npcId,
            index: npcIndex,
            isUnconscious: npcIsUnconscious, // 暫時維持原狀，下面判定勝負時再改
            lastCombatTime: Date.now()
        };

        try {
            // 使用 setDoc({merge: true})，這樣如果文件不存在就會自動建立 (解決初始化錯誤！)
            await Promise.all([
                setDoc(nDocRef, npcStateData, { merge: true }),
                updatePlayer(userId, { "attributes.hp": newPlayerHp })
            ]);
        } catch (e) {
            console.error("同步失敗", e);
            return; // 寫入失敗暫停
        }

        // D. 判定與結算
        // ----------------------------------------------------
        
        // 1. 玩家敗北
        if (newPlayerHp <= 0) {
            if (isLethal) {
                await handlePlayerDeath(pData, userId);
            } else {
                UI.print("你眼前一黑，敗下陣來。", "system");
                MessageSystem.broadcast(pData.location, `${pData.name} 敗給了 ${npcName}。`);
                await updatePlayer(userId, { isUnconscious: true, "attributes.hp": 0 });
                CombatSystem.stopCombat(userId);
            }
            return;
        }

        // 2. NPC 敗北 (HP <= 0)
        if (newNpcHp <= 0) {
            if (isLethal) {
                // === 殺死邏輯 ===
                UI.print(UI.txt(`${npcName} 慘叫一聲，倒地身亡！`, "#ff0000", true), "system", true);
                MessageSystem.broadcast(pData.location, UI.txt(`${npcName} 被 ${pData.name} 殺死了。`, "#ff0000", true));
                
                // 刪除傷勢紀錄 (active_npcs)
                await deleteDoc(nDocRef);
                
                // 加入死亡名單 (dead_npcs)，3分鐘重生
                await addDoc(collection(db, "dead_npcs"), { 
                    roomId: pData.location, 
                    npcId: npcId, 
                    index: npcIndex, 
                    respawnTime: Date.now() + 180000 // 3分鐘
                });

                // 發獎勵
                await handleKillRewards(pData, { npcId, npcName }, userId);
                CombatSystem.stopCombat(userId);
                
                // 刷新畫面 (讓屍體消失)
                MapSystem.look(pData);
                return;

            } else {
                // === 打暈邏輯 ===
                if (!npcIsUnconscious) {
                    UI.print(UI.txt(`${npcName} 晃了晃，咚的一聲倒在地上暈了過去。`, "#ffff00"), "system", true);
                    MessageSystem.broadcast(pData.location, `${pData.name} 打暈了 ${npcName}。`);
                    
                    // 標記昏迷，HP 設為 0
                    await updateDoc(nDocRef, { isUnconscious: true, currentHp: 0 });
                    
                    const newPot = (pData.combat.potential || 0) + 10;
                    await updatePlayer(userId, { "combat.potential": newPot });
                    UI.print("切磋獲勝！獲得 10 點潛能。", "system");
                }
                CombatSystem.stopCombat(userId);
                return;
            }
        }

        // E. 下一回合
        combatControllers[userId] = setTimeout(() => {
            CombatSystem.combatLoop(userId, uniqueId, npcId, npcIndex, isLethal);
        }, 2000);
    }
};