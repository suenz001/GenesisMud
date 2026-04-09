// src/systems/bank.js
import { UI } from "../ui.js";
import { updatePlayer } from "./player.js";
import { MapSystem } from "./map.js";
import { NPCDB } from "../data/npcs.js";

function getBanker(roomId) {
    const room = MapSystem.getRoom(roomId);
    if (!room || !room.npcs) return null;
    const bankerId = room.npcs.find(id => NPCDB[id] && NPCDB[id].isBanker);
    if (bankerId) return NPCDB[bankerId];
    return null;
}

export const BankSystem = {
    balance: (playerData) => {
        const banker = getBanker(playerData.location);
        if (!banker) {
            UI.print("這裡沒有錢莊老闆可以幫你查帳。", "error");
            return;
        }

        const bankBal = playerData.bankBalance || 0;
        const msg = `${banker.name} 翻了翻帳本，笑眯眯地對你說：「客官，您目前在小號的存款共有 ${UI.formatMoney(bankBal)}。」`;
        UI.print(msg, "chat", true);
    },

    deposit: async (playerData, args, userId) => {
        const banker = getBanker(playerData.location);
        if (!banker) {
            UI.print("你要把錢存給誰？", "error");
            return;
        }

        if (args.length === 0) {
            UI.print("指令格式：deposit <數值>", "error");
            return;
        }

        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            UI.print("請輸入大於零的正確數字。", "error");
            return;
        }

        if ((playerData.money || 0) < amount) {
            UI.print("你身上沒有那麼多錢。", "error");
            return;
        }

        playerData.money -= amount;
        playerData.bankBalance = (playerData.bankBalance || 0) + amount;

        UI.print(`你將 ${UI.formatMoney(amount)} 存入了錢莊。`, "system", true);
        UI.updateHUD(playerData);

        await updatePlayer(userId, { 
            money: playerData.money, 
            bankBalance: playerData.bankBalance 
        });
    },

    withdraw: async (playerData, args, userId) => {
        const banker = getBanker(playerData.location);
        if (!banker) {
            UI.print("你要向誰提款？", "error");
            return;
        }

        if (args.length === 0) {
            UI.print("指令格式：withdraw <數值>", "error");
            return;
        }

        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            UI.print("請輸入大於零的正確數字。", "error");
            return;
        }

        const bankBal = playerData.bankBalance || 0;
        if (bankBal < amount) {
            UI.print(`${banker.name} 看了看帳本，皺眉道：「客官，您帳戶裡沒有這麼多錢啊。」`, "chat");
            return;
        }

        playerData.bankBalance -= amount;
        playerData.money = (playerData.money || 0) + amount;

        UI.print(`你從錢莊提取了 ${UI.formatMoney(amount)}。`, "system", true);
        UI.updateHUD(playerData);

        await updatePlayer(userId, { 
            money: playerData.money, 
            bankBalance: playerData.bankBalance 
        });
    }
};
