// src/systems/commands.js
import { UI } from "../ui.js";
import { MapSystem } from "./map.js";
import { MessageSystem } from "./messages.js"; 
import { ItemDB } from "../data/items.js"; 
import { NPCDB } from "../data/npcs.js"; 

import { CombatSystem } from "./combat.js";
import { PlayerSystem, updatePlayer } from "./player.js";
import { InventorySystem } from "./inventory.js";
import { SkillSystem } from "./skill_system.js";
import { PerformSystem } from "./perform_system.js";
import { DialogueSystem } from "./dialogue.js";
import { BankSystem } from "./bank.js";

let lastCommandTime = 0;
const COMMAND_COOLDOWN = 400; // 安全冷卻時間 400ms

const dirMapping = {
    'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
    'u': 'up', 'd': 'down', 
    'nw': 'northwest', 'ne': 'northeast', 'sw': 'southwest', 'se': 'southeast'
};

const commandRegistry = {
    // === 基礎與玩家指令 ===
    'help': { description: '查看指令列表', execute: PlayerSystem.help },
    'score': { description: '查看屬性', execute: PlayerSystem.score },
    'save': { description: '存檔', execute: PlayerSystem.save },
    'quit': { description: '離開遊戲', execute: PlayerSystem.quit }, 
    'suicide': { description: '自殺刪檔', execute: PlayerSystem.suicide },
    'hp': { description: '狀態', execute: (p) => UI.updateHUD(p) },
    
    // === 戰鬥與切磋指令 ===
    'kill': { description: '下殺手', execute: CombatSystem.kill },
    'fight': { description: '切磋', execute: CombatSystem.fight },
    'perform': { description: '施展絕招', execute: PerformSystem.execute }, 
    'y': { description: '接受', execute: CombatSystem.acceptDuel },
    'yes': { description: '接受', execute: CombatSystem.acceptDuel },
    'n': { description: '拒絕', execute: CombatSystem.rejectDuel },
    'no': { description: '拒絕', execute: CombatSystem.rejectDuel },

    // === 物品與交易指令 ===
    'wield': { description: '裝備武器', execute: InventorySystem.wield },
    'unwield': { description: '卸下武器', execute: InventorySystem.unwield },
    'wear': { description: '穿戴防具', execute: InventorySystem.wear },
    'unwear': { description: '脫下防具', execute: InventorySystem.unwear },
    'eat': { description: '吃', execute: InventorySystem.eat },
    'drink': { description: '喝', execute: InventorySystem.drink },
    'buy': { description: '買', execute: InventorySystem.buy },
    'sell': { description: '賣', execute: InventorySystem.sell },
    'list': { description: '列表', execute: InventorySystem.list },
    'drop': { description: '丟', execute: InventorySystem.drop },
    'get': { description: '撿', execute: InventorySystem.get },
    'inventory': { description: '背包', execute: InventorySystem.inventory },
    'i': { description: '背包 (縮寫)', execute: InventorySystem.inventory },
    'give': { description: '給予', execute: InventorySystem.give },
    'balance': { description: '查帳', execute: BankSystem.balance },
    'deposit': { description: '存款(deposit <數值>)', execute: BankSystem.deposit },
    'withdraw': { description: '提款(withdraw <數值>)', execute: BankSystem.withdraw },

    // === 技能與修練指令 ===
    'skills': { description: '查看技能', execute: SkillSystem.skills },
    'sk': { description: '查看技能 (縮寫)', execute: SkillSystem.skills },
    'learn': { description: '學藝', execute: SkillSystem.learn },
    'practice': { description: '練習', execute: SkillSystem.practice },
    'study': { description: '研讀書籍', execute: SkillSystem.study }, // [新增] 讀書指令
    'apprentice': { description: '拜師', execute: SkillSystem.apprentice },
    'betray': { description: '叛出師門', execute: SkillSystem.betray },
    'enable': { description: '激發', execute: SkillSystem.enable },
    'unenable': { description: '解除激發', execute: SkillSystem.unenable },
    'abandon': { description: '放棄技能', execute: SkillSystem.abandon },
    
    // === 屬性修練指令 ===
    'exercise': { description: '運氣 (氣->內力)', execute: (p,a,u) => SkillSystem.trainStat(p,u,"內力","force","maxForce","hp","氣",a) },
    'respirate': { description: '運精 (精->靈力)', execute: (p,a,u) => SkillSystem.trainStat(p,u,"靈力","spiritual","maxSpiritual","sp","精",a) },
    'meditate': { description: '運神 (神->法力)', execute: (p,a,u) => SkillSystem.trainStat(p,u,"法力","mana","maxMana","mp","神",a) },
    
    // === 內力運用與自動修練指令 ===
    'autoforce': { description: '自動運氣', execute: SkillSystem.autoForce },
    'autorespirate': { description: '自動運精', execute: SkillSystem.autoRespirate },
    'automeditate': { description: '自動運神', execute: SkillSystem.autoMeditate },
    'exert': { description: '運功', execute: SkillSystem.exert },
    'enforce': { description: '加力', execute: PlayerSystem.enforce },

    // === 地圖與社交指令 ===
    'look': { 
        description: '觀察', 
        execute: (p, a) => { 
            if (a.length > 0) {
                import("./map.js").then(m => m.MapSystem.lookTarget(p, a[0], a[1]));
            } else {
                import("./map.js").then(m => m.MapSystem.look(p));
            }
        } 
    },
    'say': { description: '說', execute: (p,a)=>{const m=a.join(" ");UI.print(`你: ${m}`,"chat");MessageSystem.broadcast(p.location,`${p.name} 說: ${m}`);} },
    'chat': { 
        description: '公共頻道', 
        execute: (p, a) => processChatCommand(p, a, "[公共]", "global_chat", false)
    },
    'class': { 
        description: '門派頻道', 
        execute: (p, a) => {
            if(!p.sect) return UI.print("你尚未加入任何門派。", "error");
            processChatCommand(p, a, `[${p.sect}]`, `sect_${p.sect}`, true);
        } 
    },
    'ask': { description: '打聽', execute: DialogueSystem.ask },
    'emote': { description: '演', execute: (p,a)=>{const m=a.join(" ");UI.print(`${p.name} ${m}`,"system");MessageSystem.broadcast(p.location,`${p.name} ${m}`);} },
    'recall': { 
        description: '回', 
        execute: (p,a,u) => {
            if (p.location === "ghost_gate") { UI.print("鬼門關豈是你想來就來，想走就走的？", "error"); return; }
            MapSystem.teleport(p, p.savePoint||"inn_start", u);
        } 
    }
};

// 縮寫處理
function handleLook(p, a) {
    if (a.length > 0) {
        import("./map.js").then(m => m.MapSystem.lookTarget(p, a[0], a[1]));
    } else {
        MapSystem.look(p);
    }
}
commandRegistry['look'].execute = handleLook;
commandRegistry['l'] = { description: 'look', execute: handleLook };

Object.keys(dirMapping).forEach(shortDir => {
    const fullDir = dirMapping[shortDir];
    commandRegistry[shortDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
    commandRegistry[fullDir] = { description: `往 ${fullDir} 移動`, execute: (p, a, u) => MapSystem.move(p, fullDir, u) };
});

const EMOTES = {
    'smile': { 
        self: '你微微一笑。', 
        other: '微微一笑。',
        self_target: (n) => `你對著${n}微微一笑。`,
        other_target: (n) => `對著${n}微微一笑。`
    },
    'laugh': { 
        self: '你哈哈大笑。', 
        other: '哈哈大笑。',
        self_target: (n) => `你對著${n}哈哈大笑。`,
        other_target: (n) => `對著${n}哈哈大笑。`
    },
    'hi': { 
        self: '你向大家熱情地打招呼。', 
        other: '向大家熱情地打招呼。',
        self_target: (n) => `你熱情地向${n}打招呼。`,
        other_target: (n) => `熱情地向${n}打招呼。`
    },
    'tsk': { 
        self: '你嘖嘖搖頭，似乎很不以為然。', 
        other: '嘖嘖搖頭，似乎很不以為然。',
        self_target: (n) => `你對著${n}嘖嘖搖頭，似乎很不以為然。`,
        other_target: (n) => `對著${n}嘖嘖搖頭，似乎很不以為然。`
    },
    'flop': { 
        self: '你雙腿一軟，吧嗒一聲跌坐在地上。', 
        other: '雙腿一軟，吧嗒一聲跌坐在地上。',
        self_target: (n) => `你在${n}面前雙腿一軟，吧嗒一聲跌坐在地上。`,
        other_target: (n) => `在${n}面前雙腿一軟，吧嗒一聲跌坐在地上。`
    },
    'nod': { 
        self: '你點了點頭。', 
        other: '點了點頭。',
        self_target: (n) => `你對著${n}點了點頭。`,
        other_target: (n) => `對著${n}點了點頭。`
    },
    'shake': { 
        self: '你搖了搖頭。', 
        other: '搖了搖頭。',
        self_target: (n) => `你對著${n}搖了搖頭。`,
        other_target: (n) => `對著${n}搖了搖頭。`
    },
    'sigh': { 
        self: '你深深地嘆了一口氣。', 
        other: '深深地嘆了一口氣。',
        self_target: (n) => `你對著${n}深深地嘆了一口氣。`,
        other_target: (n) => `對著${n}深深地嘆了一口氣。`
    },
    'bow': { 
        self: '你恭敬地鞠了一躬。', 
        other: '恭敬地鞠了一躬。',
        self_target: (n) => `你恭敬地向${n}鞠了一躬。`,
        other_target: (n) => `恭敬地向${n}鞠了一躬。`
    },
    'cry': { 
        self: '你忍不住放聲大哭。', 
        other: '忍不住放聲大哭。',
        self_target: (n) => `你抱著${n}忍不住放聲大哭。`,
        other_target: (n) => `抱著${n}忍不住放聲大哭。`
    },
    'hug': { 
        self: '你張開雙臂，想要擁抱大家。', 
        other: '張開雙臂，想要擁抱大家。',
        self_target: (n) => `你緊緊地擁抱了${n}。`,
        other_target: (n) => `緊緊地擁抱了${n}。`
    },
    'shrug': { 
        self: '你聳了聳肩，表示無能為力。', 
        other: '聳了聳肩，表示無能為力。',
        self_target: (n) => `你對著${n}聳了聳肩，表示無能為力。`,
        other_target: (n) => `對著${n}聳了聳肩，表示無能為力。`
    },
    'kick': {
        self: '你飛起一腳，踢在半空中。',
        other: '飛起一腳，踢在半空中。',
        self_target: (n) => `你飛起一腳，狠狠踢在${n}的屁股上！`,
        other_target: (n) => `飛起一腳，狠狠踢在${n}的屁股上！`
    },
    'sob': {
        self: '你抽咽著，眼淚流了下來。',
        other: '抽咽著，眼淚流了下來。',
        self_target: (n) => `你靠著${n}的肩膀，傷心地抽咽著。`,
        other_target: (n) => `靠著${n}的肩膀，傷心地抽咽著。`
    },
    'giggle': {
        self: '你忍不住噗哧一聲笑了出來。',
        other: '忍不住噗哧一聲笑了出來。',
        self_target: (n) => `你看著${n}，忍不住噗哧一聲笑了出來。`,
        other_target: (n) => `看著${n}，忍不住噗哧一聲笑了出來。`
    },
    'lick': {
        self: '你舔了舔嘴唇。',
        other: '舔了舔嘴唇。',
        self_target: (n) => `你伸出舌頭，舔了${n}一下。`,
        other_target: (n) => `伸出舌頭，舔了${n}一下。`
    },
    'frown': {
        self: '你皺了皺眉頭。',
        other: '皺了皺眉頭。',
        self_target: (n) => `你對著${n}皺了皺眉頭。`,
        other_target: (n) => `對著${n}皺了皺眉頭。`
    },
    'wave': {
        self: '你用力揮了揮手。',
        other: '用力揮了揮手。',
        self_target: (n) => `你向${n}用力揮了揮手。`,
        other_target: (n) => `向${n}用力揮了揮手。`
    },
    'poke': {
        self: '你覺得有些無聊，隨手戳了戳空氣。',
        other: '覺得有些無聊，隨手戳了戳空氣。',
        self_target: (n) => `你伸出手指，調皮地戳了戳${n}。`,
        other_target: (n) => `伸出手指，調皮地戳了戳${n}。`
    },
    'slap': {
        self: '你用力拍了一下大腿。',
        other: '用力拍了一下大腿。',
        self_target: (n) => `你掄起巴掌，狠狠地給了${n}一個清脆的耳光！`,
        other_target: (n) => `掄起巴掌，狠狠地給了${n}一個清脆的耳光！`
    },
    'kiss': {
        self: '你送出一個飛吻。',
        other: '送出一個飛吻。',
        self_target: (n) => `你深情地吻了${n}一下。`,
        other_target: (n) => `深情地吻了${n}一下。`
    },
    'pat': {
        self: '你輕輕拍了拍手。',
        other: '輕輕拍了拍手。',
        self_target: (n) => `你輕輕拍了拍${n}的頭。`,
        other_target: (n) => `輕輕拍了拍${n}的頭。`
    },
    'glare': {
        self: '你怒目圓睜。',
        other: '怒目圓睜。',
        self_target: (n) => `你狠狠地瞪了${n}一眼。`,
        other_target: (n) => `狠狠地瞪了${n}一眼。`
    },
    'stare': {
        self: '你睜大眼睛盯著前方。',
        other: '睜大眼睛盯著前方。',
        self_target: (n) => `你目不轉睛地盯著${n}看。`,
        other_target: (n) => `目不轉睛地盯著${n}看。`
    },
    'wink': {
        self: '你頑皮地眨了眨眼。',
        other: '頑皮地眨了眨眼。',
        self_target: (n) => `你對著${n}頑皮地眨了眨眼。`,
        other_target: (n) => `對著${n}頑皮地眨了眨眼。`
    },
    'cheer': {
        self: '你興奮地大聲歡呼！',
        other: '興奮地大聲歡呼！',
        self_target: (n) => `你為${n}大聲歡呼叫好！`,
        other_target: (n) => `為${n}大聲歡呼叫好！`
    },
    'clap': {
        self: '你開心地鼓起掌來。',
        other: '開心地鼓起掌來。',
        self_target: (n) => `你對著${n}開心地鼓掌。`,
        other_target: (n) => `對著${n}開心地鼓掌。`
    },
    'faint': {
        self: '你兩眼一黑，暈了過去。',
        other: '兩眼一黑，暈了過去。',
        self_target: (n) => `你看到${n}，嚇得兩眼一黑暈了過去。`,
        other_target: (n) => `看到${n}，嚇得兩眼一黑暈了過去。`
    },
    'yawn': {
        self: '你大大地打了一個哈欠，看起來很睏。',
        other: '大大地打了一個哈欠，看起來很睏。',
        self_target: (n) => `你看著${n}，忍不住打了一個大哈欠。`,
        other_target: (n) => `看著${n}，忍不住打了一個大哈欠。`
    }
};

function resolveTarget(raw) {
    if (!raw) return null;
    return NPCDB[raw] ? NPCDB[raw].name : raw;
}

function processChatCommand(p, a, prefixText, channelId, isGreen = false) {
    if(a.length === 0) return UI.print(`你要說什麼？`, "error");
    
    const firstWord = a[0].toLowerCase();
    if (EMOTES[firstWord]) {
        const targetRaw = a[1];
        const targetName = resolveTarget(targetRaw);
        
        let selfMsg, otherMsg;
        if (targetName) {
            selfMsg = EMOTES[firstWord].self_target(targetName);
            otherMsg = EMOTES[firstWord].other_target(targetName);
        } else {
            selfMsg = EMOTES[firstWord].self;
            otherMsg = EMOTES[firstWord].other;
        }

        let outputSelf = `${prefixText} ${selfMsg}`;
        let outputOther = `${prefixText} ${p.name}${otherMsg}`;
        if (isGreen) {
            outputSelf = UI.txt(outputSelf, "#00ff00");
            outputOther = UI.txt(outputOther, "#00ff00");
        }
        
        UI.print(outputSelf, "chat", isGreen);
        MessageSystem.broadcast(channelId, outputOther, "chat");
        return;
    }

    const msg = a.join(" ");
    let outputSelf = `${prefixText} ${p.name}: ${msg}`;
    if (isGreen) outputSelf = UI.txt(outputSelf, "#00ff00");
    
    UI.print(outputSelf, "chat", isGreen);
    MessageSystem.broadcast(channelId, outputSelf, "chat");
}

Object.keys(EMOTES).forEach(cmd => {
    commandRegistry[cmd] = {
        description: '動作表情',
        execute: (p, a) => {
            const targetRaw = a[0];
            const targetName = resolveTarget(targetRaw);
            
            let selfMsg, otherMsg;
            if (targetName) {
                selfMsg = EMOTES[cmd].self_target(targetName);
                otherMsg = EMOTES[cmd].other_target(targetName);
            } else {
                selfMsg = EMOTES[cmd].self;
                otherMsg = EMOTES[cmd].other;
            }

            UI.print(selfMsg, "system");
            MessageSystem.broadcast(p.location, `${p.name}${otherMsg}`, "system");
        }
    }
});

export const CommandSystem = {
    handle: (inputStr, playerData, userId) => {
        if (!inputStr) return;
        
        // [新增] 指令冷卻機制 (防連點與腳本洗頻)
        const now = Date.now();
        if (now - lastCommandTime < COMMAND_COOLDOWN) {
            UI.print("你的動作太快了，先喘口氣吧！", "error");
            return;
        }
        lastCommandTime = now;

        const args = inputStr.trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();
        
        // 暈倒檢測
        if (playerData.isUnconscious && playerData.attributes.hp > 50) {
            playerData.isUnconscious = false;
            UI.print("你慢慢清醒了過來。", "system");
            updatePlayer(userId, { isUnconscious: false });
        }

        if (playerData.isUnconscious) {
             UI.print("你現在暈過去了，動彈不得！", "error");
             return;
        }

        // 修練狀態過濾
        if (playerData.state === 'exercising') {
            const allowedExercisingCmds = [
                'autoforce', 'autorespirate', 'automeditate', 
                'look', 'l', 'score', 'hp', 'skills', 'sk', 'help', 'inventory', 'i', 
                'say', 'chat', 'class', 'emote', ...Object.keys(EMOTES)
            ];
            if (!allowedExercisingCmds.includes(cmdName)) {
                UI.print("你正在專心修練，無法分心做這件事！(輸入 autoforce/autorespirate/automeditate 解除)", "error");
                return;
            }
        }
        
        // 戰鬥狀態指令過濾
        if (playerData.state === 'fighting') {
             if (['n','s','e','w','u','d','north','south','east','west','up','down'].includes(cmdName)) {
                 // 允許戰鬥中嘗試移動 (逃跑)
             } else if (![
                 'kill', 'fight', 'perform', 
                 'look', 'score', 'hp', 'help', 'skills', 'l',
                 'enforce', 'exert', 'inventory', 'i', 'eat', 'drink', 'wield', 'unwield' 
             ].includes(cmdName)) {
                 UI.print("戰鬥中無法分心做這件事！", "error");
                 return;
             }
        }
        
        // 忙碌狀態 (Busy) 過濾
        if (playerData.busy && Date.now() < playerData.busy) {
            const allowedBusyCmds = ['look', 'l', 'score', 'hp', 'inventory', 'i', 'help'];
            if (!allowedBusyCmds.includes(cmdName)) {
                const remaining = Math.ceil((playerData.busy - Date.now()) / 1000);
                UI.print(`你現在動彈不得！(剩餘 ${remaining} 秒)`, "error");
                return;
            }
        }
        
        if (!playerData) { UI.print("靈魂尚未歸位...", "error"); return; }
        
        const command = commandRegistry[cmdName];
        if (command) command.execute(playerData, args, userId);
        else UI.print("你胡亂比劃了一通。(輸入 help 查看指令)", "error");
    },
    stopCombat: CombatSystem.stopCombat
};