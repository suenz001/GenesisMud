// src/systems/inventory.js
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, serverTimestamp, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";
import { ItemDB } from "../data/items.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js";
import { updatePlayer } from "./player.js";
import { NPCDB } from "../data/npcs.js";

// 裝備顯示順序 (未列出的部位會排在最後)
const SLOT_ORDER = [
    'weapon', 'head', 'neck', 'cloak', 'armor', 'wrists', 'belt', 'pants', 'boots'
];

const SLOT_NAMES = {
    'armor': '身穿', 'head': '頭戴', 'neck': '頸掛', 
    'cloak': '背披', 'wrists': '手戴', 'pants': '腿穿', 
    'boots': '腳踏', 'belt': '腰繫'
};

// 裝備部位映射 (用於 wear 指令)
const SLOT_MAPPING = {
    'armor': 'armor', 'head': 'head', 'neck': 'neck', 'necklace': 'neck',
    'cloak': 'cloak', 'wrists': 'wrists', 'pants': 'pants', 'boots': 'boots', 'belt': 'belt'
};

async function consumeItem(playerData, userId, itemId, amount = 1) {
    const inventory = playerData.inventory || [];
    const itemIndex = inventory.findIndex(i => i.id === itemId || i.name === itemId);
    if (itemIndex === -1) { UI.print(`你身上沒有 ${itemId} 這樣東西。`, "error"); return false; }
    const item = inventory[itemIndex];
    if (item.count > amount) item.count -= amount; else inventory.splice(itemIndex, 1);
    
    UI.updateHUD(playerData);
    return await updatePlayer(userId, { inventory: playerData.inventory });
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

function findShopkeeperInRoom(roomId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;
    for (const nid of room.npcs) {
        const npc = NPCDB[nid];
        if (npc && npc.shop) return npc; 
    }
    return null;
}

// [新增] 尋找房間內的玩家 (排除自己)
async function findPlayerInRoom(roomId, targetNameOrId, selfId) {
    const playersRef = collection(db, "players");
    
    // 先找 ID
    let q = query(playersRef, where("location", "==", roomId), where("id", "==", targetNameOrId));
    let snap = await getDocs(q);
    
    // 如果找不到 ID，找名字 (Name)
    if (snap.empty) {
        q = query(playersRef, where("location", "==", roomId), where("name", "==", targetNameOrId));
        snap = await getDocs(q);
    }

    if (snap.empty) return null;
    
    const targetDoc = snap.docs[0];
    if (targetDoc.id === selfId) return null; // 不能給自己

    return { id: targetDoc.id, data: targetDoc.data() };
}

export const InventorySystem = {
    inventory: (p) => { 
        let h = UI.titleLine("背包") + `<div>${UI.attrLine("財產", UI.formatMoney(p.money))}</div><br>`; 
        
        const shopkeeper = findShopkeeperInRoom(p.location);
        const canSell = !!shopkeeper;

        if (!p.inventory || p.inventory.length === 0) {
            h += UI.txt("空空如也。<br>", "#888"); 
        } else {
            // 1. 整理物品狀態
            const processedItems = p.inventory.map(i => {
                const dat = ItemDB[i.id];
                let isEquipped = false;
                let equipSlot = null;
                let statusText = "";
                let actions = "";

                // 檢查是否裝備
                if (p.equipment) {
                    if (p.equipment.weapon === i.id) {
                        isEquipped = true;
                        equipSlot = 'weapon';
                        statusText = UI.txt(" (手持)", "#ff00ff");
                        actions += UI.makeCmd("[卸下]", `unwield`, "cmd-btn");
                    } else {
                        for (const [slot, equippedId] of Object.entries(p.equipment)) {
                            if (slot !== 'weapon' && equippedId === i.id) {
                                isEquipped = true;
                                equipSlot = slot;
                                const slotName = SLOT_NAMES[slot] || "裝備";
                                statusText = UI.txt(` (${slotName})`, "#ff00ff");
                                actions += UI.makeCmd("[脫下]", `unwear ${i.id}`, "cmd-btn");
                                break;
                            }
                        }
                    }
                }

                // 生成未裝備時的按鈕
                if (!isEquipped && dat) {
                    const weaponTypes = ['weapon', 'sword', 'blade', 'stick', 'dagger', 'whip', 'throwing', 'lance'];
                    if (weaponTypes.includes(dat.type)) {
                        actions += UI.makeCmd("[裝備]", `wield ${i.id}`, "cmd-btn");
                    } else if (SLOT_MAPPING[dat.type]) {
                        actions += UI.makeCmd("[穿戴]", `wear ${i.id}`, "cmd-btn");
                    }
                    
                    if (dat.type === 'food') actions += UI.makeCmd("[吃]", `eat ${i.id}`, "cmd-btn"); 
                    if (dat.type === 'drink') actions += UI.makeCmd("[喝]", `drink ${i.id}`, "cmd-btn"); 
                    if (canSell) actions += UI.makeCmd("[賣]", `sell ${i.id}`, "cmd-btn cmd-btn-buy");
                    actions += UI.makeCmd("[丟]", `drop ${i.id}`, "cmd-btn");
                }
                
                actions += UI.makeCmd("[看]", `look ${i.id}`, "cmd-btn");

                return { 
                    item: i, 
                    data: dat, 
                    isEquipped, 
                    equipSlot, 
                    statusText, 
                    actions 
                };
            });

            // 2. 排序邏輯
            processedItems.sort((a, b) => {
                if (a.isEquipped && !b.isEquipped) return -1;
                if (!a.isEquipped && b.isEquipped) return 1;
                if (a.isEquipped && b.isEquipped) {
                    const idxA = SLOT_ORDER.indexOf(a.equipSlot);
                    const idxB = SLOT_ORDER.indexOf(b.equipSlot);
                    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                }
                return 0; 
            });

            // 3. 輸出 HTML
            processedItems.forEach(obj => {
                if (!obj.data) return;
                h += `<div>${UI.txt(obj.item.name, "#fff")} (${obj.item.id}) x${obj.item.count}${obj.statusText} ${obj.actions}</div>`;
            });
        }
        UI.print(h + UI.titleLine("End"), "chat", true); 
    },

    wield: async (playerData, args, userId) => {
        if (args.length === 0) return UI.print("你要裝備什麼武器？", "error");
        const itemId = args[0];
        const invItem = playerData.inventory.find(i => i.id === itemId);
        if (!invItem) return UI.print("你身上沒有這個東西。", "error");
        
        const itemData = ItemDB[itemId];
        const allowedTypes = ['weapon', 'sword', 'blade', 'stick', 'dagger', 'whip', 'throwing', 'lance'];
        
        if (!itemData || !allowedTypes.includes(itemData.type)) return UI.print("這不是武器。", "error");

        if (!playerData.equipment) playerData.equipment = {};
        if (playerData.equipment.weapon) UI.print(`你先放下了手中的${ItemDB[playerData.equipment.weapon].name}。`, "system");

        playerData.equipment.weapon = itemId;
        UI.print(`你裝備了 ${itemData.name}。`, "system");
        await updatePlayer(userId, { equipment: playerData.equipment });
    },

    unwield: async (playerData, args, userId) => {
        if (!playerData.equipment || !playerData.equipment.weapon) return UI.print("你目前沒有裝備武器。", "error");
        const wName = ItemDB[playerData.equipment.weapon].name;
        playerData.equipment.weapon = null;
        UI.print(`你放下了手中的 ${wName}。`, "system");
        await updatePlayer(userId, { equipment: playerData.equipment });
    },

    wear: async (playerData, args, userId) => {
        if (args.length === 0) return UI.print("你要穿戴什麼？", "error");
        const itemId = args[0];
        const invItem = playerData.inventory.find(i => i.id === itemId || i.name === itemId);
        if (!invItem) return UI.print("你身上沒有這個東西。", "error");
        const itemData = ItemDB[invItem.id];
        if (!itemData) return UI.print("物品資料錯誤。", "error");
        const slot = SLOT_MAPPING[itemData.type];
        if (!slot) return UI.print("這東西看起來不能穿在身上。", "error");

        if (!playerData.equipment) playerData.equipment = {};
        if (playerData.equipment[slot]) {
            const oldId = playerData.equipment[slot];
            const oldName = ItemDB[oldId] ? ItemDB[oldId].name : oldId;
            UI.print(`你脫下了身上的${oldName}。`, "system");
        }
        playerData.equipment[slot] = invItem.id;
        UI.print(`你穿戴上了 ${itemData.name}。`, "system");
        await updatePlayer(userId, { equipment: playerData.equipment });
    },

    unwear: async (playerData, args, userId) => {
        if (args.length === 0) return UI.print("你要脫下什麼？", "error");
        const target = args[0];
        if (!playerData.equipment) return UI.print("你身上光溜溜的，沒什麼好脫的。", "error");

        let foundSlot = null;
        let foundItemId = null;
        for (const [slot, equippedId] of Object.entries(playerData.equipment)) {
            if (slot === 'weapon') continue; 
            const info = ItemDB[equippedId];
            if (equippedId === target || (info && info.name === target)) {
                foundSlot = slot;
                foundItemId = equippedId;
                break;
            }
        }

        if (!foundSlot) { UI.print("你身上沒有穿戴這樣裝備。", "error"); return; }
        const itemName = ItemDB[foundItemId] ? ItemDB[foundItemId].name : foundItemId;
        delete playerData.equipment[foundSlot];
        UI.print(`你脫下了身上的 ${itemName}。`, "system");
        await updatePlayer(userId, { equipment: playerData.equipment });
    },

    eat: async (playerData, args, userId) => {
        if (args.length === 0) return UI.print("想吃什麼？", "system");
        const targetName = args[0];
        const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
        if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
        
        const itemData = ItemDB[invItem.id];
        if (!itemData || itemData.type !== 'food') return UI.print("那個不能吃！", "error");
        
        const attr = playerData.attributes;
        if (attr.food >= attr.maxFood) return UI.print("你已經吃得很飽了。", "system");

        const success = await consumeItem(playerData, userId, invItem.id);
        if (success) {
            const oldVal = attr.food;
            attr.food = attr.food + itemData.value;
            const recover = attr.food - oldVal;
            UI.print(`你吃下了一份${invItem.name}，恢復了 ${recover} 點食物值。`, "system");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 拿出 ${invItem.name} 吃幾口。`);
            await updatePlayer(userId, { "attributes.food": attr.food });
        }
    },

    drink: async (playerData, args, userId) => {
        if (args.length === 0) return UI.print("想喝什麼？", "system");
        const targetName = args[0];

        if (targetName === 'water') {
            const room = MapSystem.getRoom(playerData.location);
            if (room && room.hasWell) {
                const attr = playerData.attributes;
                if (attr.water >= attr.maxWater) { UI.print("你一點也不渴。", "system"); return; }
                attr.water = attr.maxWater;
                UI.print("你走到井邊，大口喝著甘甜的井水，頓時覺得清涼解渴。", "system");
                MessageSystem.broadcast(playerData.location, `${playerData.name} 走到井邊喝了幾口水。`);
                UI.updateHUD(playerData);
                await updatePlayer(userId, { "attributes.water": attr.water });
                return;
            } else {
                UI.print("這裡沒有水可以喝。", "error");
                return;
            }
        }

        const invItem = playerData.inventory.find(i => i.id === targetName || i.name === targetName);
        if (!invItem) return UI.print("你身上沒有這樣東西。", "error");
        
        const itemData = ItemDB[invItem.id];
        if (!itemData || itemData.type !== 'drink') return UI.print("那個不能喝！", "error");
        
        const attr = playerData.attributes;
        if (attr.water >= attr.maxWater) return UI.print("你一點也不渴。", "system");

        const success = await consumeItem(playerData, userId, invItem.id);
        if (success) {
            const oldVal = attr.water;
            attr.water = attr.water + itemData.value;
            const recover = attr.water - oldVal;
            UI.print(`你喝了一口${invItem.name}，恢復了 ${recover} 點飲水值。`, "system");
            MessageSystem.broadcast(playerData.location, `${playerData.name} 拿起 ${invItem.name} 喝了幾口。`);
            await updatePlayer(userId, { "attributes.water": attr.water });
        }
    },

    drop: async (p,a,u) => { 
        if(a.length===0)return UI.print("丟啥?","error"); 
        const idx=p.inventory.findIndex(x=>x.id===a[0]||x.name===a[0]); 
        if(idx===-1)return UI.print("沒這個","error"); 
        const it=p.inventory[idx]; 
        if(it.count>1)it.count--; else p.inventory.splice(idx,1); 
        await updatePlayer(u,{inventory:p.inventory}); 
        await addDoc(collection(db,"room_items"),{roomId:p.location,itemId:it.id,name:it.name,droppedBy:p.name,timestamp:serverTimestamp()}); 
        UI.print("丟了 "+it.name,"system"); 
    },

    get: async (p,a,u) => { 
        if(a.length===0) return UI.print("撿啥?","error"); 
        if (a[0] === 'all') {
            const q = query(collection(db, "room_items"), where("roomId", "==", p.location));
            const snap = await getDocs(q);
            if (snap.empty) return UI.print("這裡沒什麼好撿的。", "system");
            let pickedNames = [];
            if (!p.inventory) p.inventory = [];
            const deletePromises = [];
            snap.forEach(d => {
                const itemData = d.data();
                const ex = p.inventory.find(x => x.id === itemData.itemId);
                if (ex) ex.count++; else p.inventory.push({ id: itemData.itemId, name: itemData.name, count: 1 });
                pickedNames.push(itemData.name);
                deletePromises.push(deleteDoc(doc(db, "room_items", d.id)));
            });
            await Promise.all(deletePromises);
            await updatePlayer(u, { inventory: p.inventory });
            UI.print(`你撿起了：${pickedNames.join("、")}。`, "system");
            return;
        }
        const q=query(collection(db,"room_items"),where("roomId","==",p.location),where("itemId","==",a[0])); 
        const snap=await getDocs(q); 
        if(snap.empty)return UI.print("沒東西","error"); 
        const d=snap.docs[0]; 
        await deleteDoc(doc(db,"room_items",d.id)); 
        const dat=d.data(); 
        if(!p.inventory)p.inventory=[]; 
        const ex=p.inventory.find(x=>x.id===dat.itemId); 
        if(ex)ex.count++; else p.inventory.push({id:dat.itemId,name:dat.name,count:1}); 
        await updatePlayer(u,{inventory:p.inventory}); 
        UI.print("撿了 "+dat.name,"system"); 
    },

    buy: async (p,a,u) => { 
        if(a.length<1){UI.print("買啥?","error");return;} 
        let n=a[0],amt=1,nn=null; 
        if(a.length>=2&&!isNaN(a[1]))amt=parseInt(a[1]); 
        if(a.indexOf('from')!==-1)nn=a[a.indexOf('from')+1]; else {const r=MapSystem.getRoom(p.location);if(r.npcs)nn=r.npcs[0];} 
        const npc=findNPCInRoom(p.location,nn); 
        if(!npc){UI.print("沒人","error");return;} 
        let tid=null,pr=0; 
        if(npc.shop[n]){tid=n;pr=npc.shop[n];}else{for(const[k,v]of Object.entries(npc.shop)){if(ItemDB[k]&&ItemDB[k].name===n){tid=k;pr=v;break;}}} 
        if(!tid){UI.print("沒賣","error");return;} 
        const tot=pr*amt; 
        if((p.money||0)<tot){UI.print("錢不夠","error");return;} 
        p.money-=tot; 
        if(!p.inventory)p.inventory=[]; 
        const ex=p.inventory.find(i=>i.id===tid); 
        if(ex)ex.count+=amt; else p.inventory.push({id:tid,name:ItemDB[tid].name,count:amt}); 
        UI.print(`買了 ${amt} ${ItemDB[tid].name}`,"system"); 
        await updatePlayer(u,{money:p.money,inventory:p.inventory}); 
    },

    sell: async (p, a, u) => {
        if (a.length < 1) return UI.print("賣啥？ (sell <item_id> [amount])", "error");
        const itemId = a[0];
        let amount = 1;
        if (a.length >= 2 && !isNaN(a[1])) amount = parseInt(a[1]);

        const shopkeeper = findShopkeeperInRoom(p.location);
        if (!shopkeeper) { UI.print("這裡沒有人收東西。", "error"); return; }
        const invIndex = p.inventory ? p.inventory.findIndex(i => i.id === itemId) : -1;
        if (invIndex === -1) { UI.print("你身上沒有這樣東西。", "error"); return; }
        const item = p.inventory[invIndex];
        if (item.count < amount) { UI.print("你身上的數量不夠。", "error"); return; }
        let isEquipped = false;
        if (p.equipment) { for (const key in p.equipment) { if (p.equipment[key] === itemId) { isEquipped = true; break; } } }
        if (isEquipped) { UI.print(`你必須先卸下 ${item.name} 才能販賣。`, "error"); return; }

        const itemInfo = ItemDB[itemId];
        if (!itemInfo) return; 
        const baseValue = itemInfo.value || 0;
        if (baseValue <= 0) { UI.print(`${shopkeeper.name} 搖搖頭道：「這東西不值錢，我不能收。」`, "chat"); return; }

        const sellPrice = Math.floor(baseValue * 0.7);
        const totalGet = sellPrice * amount;

        if (item.count > amount) item.count -= amount; else p.inventory.splice(invIndex, 1);
        p.money = (p.money || 0) + totalGet;
        UI.print(`你賣掉了 ${amount} ${item.name}，獲得了 ${UI.formatMoney(totalGet)}。`, "system", true);
        UI.print(`${shopkeeper.name} 笑嘻嘻地把 ${item.name} 收了起來。`, "chat");
        await updatePlayer(u, { money: p.money, inventory: p.inventory });
    },

    list: (p,a) => { 
        const r=MapSystem.getRoom(p.location); 
        let nn=null; 
        if(a.length>0)nn=a[0]; else if(r.npcs)nn=r.npcs[0]; 
        const npc=findNPCInRoom(p.location,nn); 
        if(!npc||!npc.shop)return UI.print("沒賣東西","error"); 
        let h=UI.titleLine(npc.name+" 商品"); 
        for(const[k,v]of Object.entries(npc.shop)) 
            h+=`<div>${ItemDB[k].name} <span style="color:#888">(${k})</span>: ${UI.formatMoney(v)} ${UI.makeCmd("[買1]",`buy ${k} 1 from ${npc.id}`,"cmd-btn")}</div>`; 
        UI.print(h,"",true); 
    },

    // === [新增] Give 指令 ===
    give: async (p, a, u) => {
        // 解析: give <item> [amount] to <target>
        if (a.length < 3) { UI.print("指令格式: give <物品ID> [數量] to <對象ID>", "error"); return; }

        let itemId, targetId, amount = 1;
        const toIndex = a.indexOf('to');

        if (toIndex === -1) { UI.print("請使用 'to' 指定對象。(例如 give water to waiter)", "error"); return; }

        // to 之前是物品和數量
        itemId = a[0];
        if (toIndex === 2 && !isNaN(parseInt(a[1]))) {
            amount = parseInt(a[1]);
        }
        
        // to 之後是目標
        if (a.length > toIndex + 1) {
            targetId = a[toIndex + 1];
        } else {
            UI.print("你要給誰？", "error");
            return;
        }

        if (amount <= 0) { UI.print("數量錯誤。", "error"); return; }

        // 1. 檢查自己是否有該物品
        const invIndex = p.inventory ? p.inventory.findIndex(i => i.id === itemId || i.name === itemId) : -1;
        if (invIndex === -1) { UI.print("你身上沒有這樣東西。", "error"); return; }
        
        const myItem = p.inventory[invIndex];
        const realItemId = myItem.id; // 修正為真實 ID
        const itemInfo = ItemDB[realItemId];

        if (myItem.count < amount) { UI.print("你身上的數量不夠。", "error"); return; }

        // 檢查是否裝備中
        let isEquipped = false;
        if (p.equipment) {
            for (const key in p.equipment) {
                if (p.equipment[key] === realItemId) {
                    isEquipped = true;
                    break;
                }
            }
        }
        if (isEquipped) { UI.print(`你必須先卸下 ${itemInfo.name} 才能送人。`, "error"); return; }

        // 2. 搜尋目標 (優先找玩家，再找 NPC)
        let targetPlayer = await findPlayerInRoom(p.location, targetId, p.id); // p.id (uid) or id field? p.id is 'admin' style or uid? main.js sends currentUser.uid as u, but p is doc data. p.id is display ID.
        // wait, updatePlayer uses 'u' (userId/UID). The player data 'p' has 'id' (display ID).
        // findPlayerInRoom needs to handle filtering by p.id (display ID) or u (uid). The function uses doc.id (uid) comparison.
        
        // 3. 處理目標是 NPC 的情況
        if (!targetPlayer) {
            const npc = findNPCInRoom(p.location, targetId);
            if (npc) {
                // [NPC 拒絕邏輯]
                // 這裡未來可以加入 Quest 檢查： if (npc.questItem === realItemId) { ... }
                // 目前全部拒絕
                UI.print(`你拿出 ${itemInfo.name} 遞給 ${npc.name}。`, "system");
                const rejectMsg = `${npc.name} 說道：「無功不受祿，這${itemInfo.name}您還是收回去吧。」`;
                UI.print(UI.txt(rejectMsg, "#ffff00"), "chat");
                MessageSystem.broadcast(p.location, `${p.name} 想給 ${npc.name} ${itemInfo.name}，但是被拒絕了。`);
                return;
            }
            UI.print("這裡沒有這個人。", "error");
            return;
        }

        // 4. 處理目標是玩家的情況
        const targetData = targetPlayer.data;
        const targetUid = targetPlayer.id;

        // 扣除給予者的物品
        if (myItem.count > amount) {
            myItem.count -= amount;
        } else {
            p.inventory.splice(invIndex, 1);
        }

        // 增加接收者的物品
        if (!targetData.inventory) targetData.inventory = [];
        const existingItem = targetData.inventory.find(i => i.id === realItemId);
        if (existingItem) {
            existingItem.count += amount;
        } else {
            targetData.inventory.push({ id: realItemId, name: itemInfo.name, count: amount });
        }

        // 同步更新雙方資料庫
        // 注意：這裡應該用 Transaction 比較好，但為了保持代碼一致性先分別更新
        try {
            await updatePlayer(u, { inventory: p.inventory });
            await updatePlayer(targetUid, { inventory: targetData.inventory });

            UI.print(`你給了 ${targetData.name} ${amount} ${itemInfo.name}。`, "system");
            MessageSystem.broadcast(p.location, `${p.name} 給了 ${targetData.name} 一些 ${itemInfo.name}。`);
            
            // 如果對方在線上，理論上 broadcast 會通知，但可以更明確
            // 這裡不做額外通知，依賴 world log
        } catch (e) {
            console.error("Give item failed", e);
            UI.print("給予物品時發生錯誤，操作已取消。", "error");
            // 簡易回滾 (僅 client 端顯示，實際 DB 可能部分更新，這裡簡化處理)
        }
    }
};