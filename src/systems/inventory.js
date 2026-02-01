// src/systems/inventory.js
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase.js";
import { UI } from "../ui.js";
import { ItemDB } from "../data/items.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js";
import { updatePlayer } from "./player.js";
import { NPCDB } from "../data/npcs.js";

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
        if (npc && npc.shop) {
            return npc; 
        }
    }
    return null;
}

export const InventorySystem = {
    inventory: (p) => { 
        let h = UI.titleLine("背包") + `<div>${UI.attrLine("財產", UI.formatMoney(p.money))}</div><br>`; 
        
        const shopkeeper = findShopkeeperInRoom(p.location);
        const canSell = !!shopkeeper;

        if (!p.inventory || p.inventory.length === 0) h += UI.txt("空空如也。<br>", "#888"); 
        else {
            p.inventory.forEach(i => { 
                const dat = ItemDB[i.id]; 
                if (!dat) return;
                let act = ""; 
                let status = "";

                const isWeaponEquipped = p.equipment && p.equipment.weapon === i.id;
                const isArmorEquipped = p.equipment && p.equipment.armor === i.id;

                if (isWeaponEquipped) {
                    status = UI.txt(" (已裝備)", "#ff00ff");
                    act += UI.makeCmd("[卸下]", `unwield`, "cmd-btn");
                } else if (isArmorEquipped) {
                    status = UI.txt(" (已穿戴)", "#ff00ff");
                    act += UI.makeCmd("[脫下]", `unwear`, "cmd-btn");
                } else {
                    const allowedTypes = ['weapon', 'sword', 'blade', 'stick', 'dagger', 'whip', 'throwing', 'lance'];
                    if (allowedTypes.includes(dat.type)) act += UI.makeCmd("[裝備]", `wield ${i.id}`, "cmd-btn");
                    if (dat.type === 'armor') act += UI.makeCmd("[穿戴]", `wear ${i.id}`, "cmd-btn");
                    if (dat.type === 'food') act += UI.makeCmd("[吃]", `eat ${i.id}`, "cmd-btn"); 
                    if (dat.type === 'drink') act += UI.makeCmd("[喝]", `drink ${i.id}`, "cmd-btn"); 
                    
                    if (canSell) {
                        act += UI.makeCmd("[賣]", `sell ${i.id}`, "cmd-btn cmd-btn-buy");
                    }
                    
                    act += UI.makeCmd("[丟]", `drop ${i.id}`, "cmd-btn");
                }
                
                act += UI.makeCmd("[看]", `look ${i.id}`, "cmd-btn"); 
                h += `<div>${UI.txt(i.name, "#fff")} (${i.id}) x${i.count}${status} ${act}</div>`; 
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
        if (args.length === 0) return UI.print("你要穿什麼？", "error");
        const itemId = args[0];
        const invItem = playerData.inventory.find(i => i.id === itemId);
        if (!invItem) return UI.print("你身上沒有這個東西。", "error");
        
        const itemData = ItemDB[itemId];
        if (!itemData || itemData.type !== 'armor') return UI.print("這不是防具。", "error");

        if (!playerData.equipment) playerData.equipment = {};
        if (playerData.equipment.armor) UI.print(`你脫下了身上的${ItemDB[playerData.equipment.armor].name}。`, "system");

        playerData.equipment.armor = itemId;
        UI.print(`你穿上了 ${itemData.name}。`, "system");
        await updatePlayer(userId, { equipment: playerData.equipment });
    },

    unwear: async (playerData, args, userId) => {
        if (!playerData.equipment || !playerData.equipment.armor) return UI.print("你身上沒有穿防具。", "error");
        const aName = ItemDB[playerData.equipment.armor].name;
        playerData.equipment.armor = null;
        UI.print(`你脫下了身上的 ${aName}。`, "system");
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
            const recover = Math.min(attr.maxFood - attr.food, itemData.value);
            attr.food = Math.min(attr.maxFood, attr.food + itemData.value);
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
                if (attr.water >= attr.maxWater) {
                    UI.print("你一點也不渴。", "system");
                    return;
                }
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
            const recover = Math.min(attr.maxWater - attr.water, itemData.value);
            attr.water = Math.min(attr.maxWater, attr.water + itemData.value);
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
        
        // === [新增] get all 指令 ===
        if (a[0] === 'all') {
            const q = query(collection(db, "room_items"), where("roomId", "==", p.location));
            const snap = await getDocs(q);
            if (snap.empty) return UI.print("這裡沒什麼好撿的。", "system");

            let pickedNames = [];
            if (!p.inventory) p.inventory = [];

            // 使用 Promise.all 並行刪除，提高效能
            const deletePromises = [];

            snap.forEach(d => {
                const itemData = d.data();
                // 檢查堆疊
                const ex = p.inventory.find(x => x.id === itemData.itemId);
                if (ex) ex.count++; 
                else p.inventory.push({ id: itemData.itemId, name: itemData.name, count: 1 });

                pickedNames.push(itemData.name);
                deletePromises.push(deleteDoc(doc(db, "room_items", d.id)));
            });

            await Promise.all(deletePromises);
            await updatePlayer(u, { inventory: p.inventory });
            
            // 整理顯示訊息，避免洗頻
            UI.print(`你撿起了：${pickedNames.join("、")}。`, "system");
            return;
        }

        // 單一撿取邏輯
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
        if (!shopkeeper) {
            UI.print("這裡沒有人收東西。", "error");
            return;
        }

        const invIndex = p.inventory ? p.inventory.findIndex(i => i.id === itemId) : -1;
        if (invIndex === -1) {
            UI.print("你身上沒有這樣東西。", "error");
            return;
        }
        const item = p.inventory[invIndex];
        if (item.count < amount) {
            UI.print("你身上的數量不夠。", "error");
            return;
        }

        if ((p.equipment && p.equipment.weapon === itemId) || (p.equipment && p.equipment.armor === itemId)) {
            UI.print(`你必須先卸下 ${item.name} 才能販賣。`, "error");
            return;
        }

        const itemInfo = ItemDB[itemId];
        if (!itemInfo) return; 
        
        const baseValue = itemInfo.value || 0;
        if (baseValue <= 0) {
            UI.print(`${shopkeeper.name} 搖搖頭道：「這東西不值錢，我不能收。」`, "chat");
            return;
        }

        const sellPrice = Math.floor(baseValue * 0.7);
        const totalGet = sellPrice * amount;

        if (item.count > amount) {
            item.count -= amount;
        } else {
            p.inventory.splice(invIndex, 1);
        }

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
    }
};