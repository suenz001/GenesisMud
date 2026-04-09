// src/systems/dialogue.js
import { UI } from "../ui.js";
import { MessageSystem } from "./messages.js";
import { MapSystem } from "./map.js";
import { updatePlayer } from "./player.js";
import { NPCDB } from "../data/npcs.js";

export const DialogueSystem = {
    ask: async (playerData, args, userId) => {
        // syntax: ask <npcid> about <topic>
        // example: ask waiter about rumor
        if (args.length < 3 || args[1].toLowerCase() !== 'about') {
            UI.print("指令格式錯誤。請使用: ask <npc> about <話題>", "error");
            return;
        }

        const targetId = args[0].toLowerCase();
        const topic = args.slice(2).join(' ').toLowerCase();
        
        // 確保玩家與該 NPC 在同一房間
        const room = MapSystem.getRoom(playerData.location);
        if (!room || !room.npcs || !room.npcs.includes(targetId)) {
            UI.print("這裡沒有這個人可以對話。", "error");
            return;
        }

        const npc = NPCDB[targetId];
        if (!npc) {
            UI.print("那個人不理你。", "error");
            return;
        }

        // 基本對話表現
        UI.print(`你向 ${npc.name} 打聽有關『${topic}』的消息。`, "chat");
        MessageSystem.broadcast(playerData.location, `${playerData.name} 向 ${npc.name} 打聽有關『${topic}』的消息。`);

        // 查找 inquiries 資料
        if (npc.inquiries) {
            const inquiry = npc.inquiries[topic];
            if (inquiry) {
                // 如果回應是一個純字串
                if (typeof inquiry === 'string') {
                    UI.print(`${npc.name} 說道：「${inquiry}」`, "chat", true);
                } 
                // 如果回應是一個函式(供進階任務觸發使用)
                else if (typeof inquiry === 'function') {
                    // await inquiry(playerData, userId);
                    await inquiry(playerData, userId, UI, MessageSystem, updatePlayer);
                }
                return;
            }
        }

        // 預設回應 (找不到對應話題)
        const defaultResponses = [
            "我不知道你在說什麼。",
            "這個嘛...我也不太清楚。",
            "你問錯人了吧？",
            "那是什麼？能吃嗎？"
        ];
        const defaultMsg = npc.default_inquiry || defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
        
        UI.print(`${npc.name} 搖搖頭說道：「${defaultMsg}」`, "chat", true);
    }
};
