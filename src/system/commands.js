import { UI } from "../ui.js";

// 指令註冊表：定義所有指令的名稱、描述與執行邏輯
const commandRegistry = {
    'help': {
        description: '查看指令列表',
        execute: () => {
            let msg = "【江湖指南】可用指令列表：\n";
            msg += "--------------------------------\n";
            
            // 自動列出所有指令
            for (const [key, cmd] of Object.entries(commandRegistry)) {
                // padEnd 是為了排版對齊
                msg += `${key.padEnd(10, ' ')} : ${cmd.description}\n`;
            }
            
            msg += "--------------------------------\n";
            UI.print(msg, 'system');
        }
    },
    'look': {
        description: '觀察四周環境 (簡寫: l)',
        execute: () => {
            // 暫時寫死，之後會讀取地圖資料
            UI.print("【客棧大廳】", "system");
            UI.print("這裡是一間熱鬧的客棧，南來北往的俠客都在此歇腳。");
            UI.print("店小二正在忙著招呼客人。");
            UI.print("明顯的出口有：north (北), out (外)");
        }
    },
    'l': { // look 的別名
        description: '觀察四周 (同 look)',
        execute: () => commandRegistry['look'].execute()
    },
    'status': {
        description: '查看個人狀態 (簡寫: st)',
        execute: (playerData) => {
            if (!playerData) {
                UI.print("你還沒登入，沒有狀態可言。", "error");
                return;
            }
            // 這裡顯示基本屬性
            const attr = playerData.attributes;
            let msg = `【${playerData.name} 的狀態】\n`;
            msg += ` 精：${attr.hp}/100\n`;
            msg += ` 氣：${attr.mp}/100\n`;
            msg += ` 神：${attr.sp}/100\n`;
            msg += ` 門派：${playerData.sect === 'none' ? '無門無派' : playerData.sect}`;
            UI.print(msg, 'chat');
        }
    },
    'st': { 
        description: '查看狀態 (同 status)',
        execute: (playerData) => commandRegistry['status'].execute(playerData)
    }
};

// 對外公開的管理器
export const CommandSystem = {
    // 處理輸入字串
    handle: (inputStr, playerData) => {
        if (!inputStr) return;

        // 將輸入切分為：指令 + 參數 (例如 "cast fireball" -> cmd="cast", args=["fireball"])
        const args = inputStr.trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase(); // 取出第一個字並轉小寫

        const command = commandRegistry[cmdName];

        if (command) {
            // 執行指令，並把剩下的參數和玩家資料傳進去
            command.execute(playerData, args);
        } else {
            // 找不到指令時的武俠風提示
            UI.print("你胡亂比劃了一通，但什麼也沒發生。(輸入 help 查看指令)", "error");
        }
    }
};