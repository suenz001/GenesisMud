// src/ui.js
import { WorldMap } from "./data/world.js";
import { MapSystem } from "./systems/map.js"; 

const output = document.getElementById('output');
const input = document.getElementById('cmd-input');
const sendBtn = document.getElementById('send-btn');
const loginPanel = document.getElementById('login-panel');

const emailInput = document.getElementById('email-input');
const pwdInput = document.getElementById('pwd-input');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnGuest = document.getElementById('btn-guest');

const elRoomName = document.getElementById('current-room-name');

// 儀表板元素 - 核心
const barHp = document.getElementById('bar-hp');
const textHp = document.getElementById('text-hp');
const barForce = document.getElementById('bar-force');
const textForce = document.getElementById('text-force');

// 儀表板元素 - 精神
const barSp = document.getElementById('bar-sp');
const textSp = document.getElementById('text-sp');
const barMp = document.getElementById('bar-mp');
const textMp = document.getElementById('text-mp');

// 儀表板元素 - 生存
const barFood = document.getElementById('bar-food');
const statusFood = document.getElementById('status-food');
const btnAutoEat = document.getElementById('btn-auto-eat');

const barWater = document.getElementById('bar-water');
const statusWater = document.getElementById('status-water');
const btnAutoDrink = document.getElementById('btn-auto-drink');

// 儀表板元素 - 潛能與財產
const valPotential = document.getElementById('val-potential');
const valMoney = document.getElementById('val-money'); 

// 儀表板元素 - 內力控制
const valEnforce = document.getElementById('val-enforce');

// 面板切換元素
const panelInspection = document.getElementById('panel-inspection');
const panelStatsGroup = document.getElementById('panel-stats-group');
const miniMapBox = document.getElementById('mini-map-box');

let currentEnforceValue = 0;

// 巨集相關變數
let localMacros = {}; 
let onMacroSaveCallback = null;

export const UI = {
    txt: (text, color = '#ccc', bold = false) => {
        const style = `color:${color};${bold ? 'font-weight:bold;' : ''}`;
        return `<span style="${style}">${text}</span>`;
    },
    titleLine: (title) => {
        return `<div style="color:#00ffff; border-bottom: 1px dashed #008888; margin: 5px 0; padding-bottom:2px;">≡ ${title} ≡</div>`;
    },
    attrLine: (label, value, unit = '') => {
        return `<span style="color:#88bbcc;">${label}：</span><span style="color:#fff; font-weight:bold;">${value}</span> <span style="color:#888;">${unit}</span>`;
    },
    formatMoney: (coins) => {
        if (!coins) return UI.txt("0", "#ccc") + UI.txt(" 文", "#888");
        const gold = Math.floor(coins / 1000000);
        const silver = Math.floor((coins % 1000000) / 1000);
        const copper = coins % 1000;
        let str = "";
        if (gold > 0) str += UI.txt(gold, "#ffd700", true) + UI.txt("兩金 ", "#aa8800"); 
        if (silver > 0) str += UI.txt(silver, "#e0e0e0", true) + UI.txt("兩銀 ", "#888");
        if (copper > 0) str += UI.txt(copper, "#cd7f32", true) + UI.txt("文", "#885522");
        return str.trim() || UI.txt("0 文", "#888");
    },
    makeCmd: (text, cmd, styleClass = 'cmd-link') => {
        return `<span class="${styleClass}" data-cmd="${cmd}">${text}</span>`;
    },
    print: (content, type = 'normal', isHtml = false) => {
        const div = document.createElement('div');
        if (isHtml) div.innerHTML = content;
        else div.textContent = content;
        if (type === 'system') div.classList.add('msg-system');
        if (type === 'error') div.classList.add('msg-error');
        if (type === 'chat') div.classList.add('msg-chat');
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    },
    
    updateMacroButtons: (macros) => {
        localMacros = macros || {};
        for (let i = 1; i <= 4; i++) {
            const btn = document.getElementById(`btn-macro-${i}`);
            if (btn) {
                const setting = localMacros[i];
                if (setting && setting.name && setting.cmd) {
                    btn.textContent = setting.name;
                    btn.title = `指令: ${setting.cmd} (右鍵點擊修改)`;
                    btn.classList.add('set');
                } else {
                    btn.textContent = "自定義";
                    btn.title = "點擊設定快捷鍵";
                    btn.classList.remove('set');
                }
            }
        }
    },

    onMacroUpdate: (callback) => {
        onMacroSaveCallback = callback;
    },

    updateHUD: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        
        const updateBar = (barEl, textEl, current, max) => {
            if (!barEl) return;
            const safeMax = max || 1;
            const safeCurrent = Math.max(0, current || 0);
            const percent = Math.min(100, (safeCurrent / safeMax) * 100);
            barEl.style.width = `${percent}%`;
            
            if (textEl) {
                if (textEl.id.includes('status')) {
                    if (percent < 20) textEl.textContent = "飢渴";
                    else if (percent < 50) textEl.textContent = "普通";
                    else textEl.textContent = "充盈";
                    if (percent < 20) textEl.style.color = "#ff5555";
                    else textEl.style.color = "#888";
                } else {
                    textEl.textContent = `${safeCurrent}/${safeMax}`;
                }
            }
        };

        updateBar(barHp, textHp, attr.hp, attr.maxHp);
        updateBar(barForce, textForce, attr.force, attr.maxForce);
        updateBar(barSp, textSp, attr.sp, attr.maxSp);
        updateBar(barMp, textMp, attr.mp, attr.maxMp);
        updateBar(barFood, statusFood, attr.food, attr.maxFood);
        updateBar(barWater, statusWater, attr.water, attr.maxWater);

        const serverEnforce = (playerData.combat && playerData.combat.enforce) ? playerData.combat.enforce : 0;
        currentEnforceValue = serverEnforce;
        if(valEnforce) {
            valEnforce.textContent = currentEnforceValue;
            valEnforce.style.color = currentEnforceValue > 0 ? "#ff9800" : "#444";
        }

        if (valPotential) {
            const pot = (playerData.combat && playerData.combat.potential) ? playerData.combat.potential : 0;
            valPotential.textContent = pot;
        }

        if (valMoney) {
            valMoney.innerHTML = UI.formatMoney(playerData.money || 0);
        }

        UI.drawRangeMap(playerData);
    },

    // [修改] 地圖繪製邏輯：增加 Wall (紅線) 檢測
    drawRangeMap: (playerData) => {
        if (!miniMapBox) return;
        if (!playerData || !playerData.location) return;

        const currentRoom = MapSystem.getRoom(playerData.location);
        if (!currentRoom) return;

        // 取得當前房間的所有可用出口，用於繪製紅線
        const currentExits = MapSystem.getAvailableExits(playerData.location);

        const range = 2; // 顯示半徑
        const cx = currentRoom.x;
        const cy = currentRoom.y;
        const cz = currentRoom.z;

        let html = '<div class="map-grid">';

        for (let y = cy + range; y >= cy - range; y--) {
            for (let x = cx - range; x <= cx + range; x++) {
                let cellClass = "map-cell";
                let symbol = "&nbsp;";
                let tooltip = "";

                const room = MapSystem.getRoomAt(x, y, cz);

                if (room) {
                    if (x === cx && y === cy) {
                        cellClass += " map-center";
                        symbol = '<i class="fas fa-user"></i>';
                        tooltip = "你";

                        // [核心修改] 檢查中心點四周是否有路，若無則加紅線
                        // 檢查北方 (y+1)
                        if (MapSystem.getRoomAt(x, y + 1, cz) && !currentExits['north']) cellClass += " wall-top";
                        // 檢查南方 (y-1)
                        if (MapSystem.getRoomAt(x, y - 1, cz) && !currentExits['south']) cellClass += " wall-bottom";
                        // 檢查東方 (x+1)
                        if (MapSystem.getRoomAt(x + 1, y, cz) && !currentExits['east']) cellClass += " wall-right";
                        // 檢查西方 (x-1)
                        if (MapSystem.getRoomAt(x - 1, y, cz) && !currentExits['west']) cellClass += " wall-left";

                    } else {
                        if (room.safe) cellClass += " map-safe";
                        else if (room.isDynamic) cellClass += " map-road"; 
                        else if (room.region && room.region.includes("forest")) cellClass += " map-danger";
                        else cellClass += " map-normal";
                        
                        if (room.title.includes("森林")) symbol = "林";
                        else if (room.title.includes("客棧")) symbol = "店";
                        else if (room.title.includes("武館")) symbol = "武";
                        else if (room.title.includes("門")) symbol = "門";
                        else if (room.isDynamic) symbol = "‧"; 
                        else symbol = "□";
                        
                        tooltip = room.title;
                    }
                } else {
                    cellClass += " map-empty";
                }

                html += `<div class="${cellClass}" title="${tooltip}">${symbol}</div>`;
            }
        }
        html += '</div>';
        
        const zInfo = `<div style="position:absolute; bottom:5px; right:5px; font-size:10px; color:#555; background:rgba(0,0,0,0.5); padding:2px 4px;">層: ${cz}</div>`;
        miniMapBox.innerHTML = html + zInfo;
    },

    updateLocationInfo: (roomTitle) => { 
        if(elRoomName) elRoomName.textContent = roomTitle; 
    },

    enableGameInput: (enabled) => {
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
        const allBtns = document.querySelectorAll('button:not(#btn-login):not(#btn-register):not(#btn-guest)');
        allBtns.forEach(btn => btn.disabled = !enabled);

        if (enabled) { input.placeholder = "請輸入指令..."; input.focus(); } 
        else { input.placeholder = "請先登入..."; }
    },

    showLoginPanel: (show) => {
        loginPanel.style.display = show ? 'block' : 'none';
        if (show) emailInput.focus();
    },

    showLoginError: (msg) => { document.getElementById('login-msg').textContent = msg; },
    
    showInspection: (id, name, type) => {
        const img = document.getElementById('inspect-img');
        const nameLabel = document.getElementById('inspect-name');
        
        if (!panelInspection || !img || !panelStatsGroup) return;

        panelStatsGroup.style.display = 'none';
        panelInspection.style.display = 'flex'; 
        
        if (nameLabel) nameLabel.textContent = name;
        
        img.classList.remove('loaded');
        const folder = type === 'npc' ? 'npcs' : 'items'; 
        const targetSrc = `assets/images/${folder}/${id}.webp`;
        
        img.onload = () => { img.classList.add('loaded'); };
        img.onerror = () => {
            if (img.src.includes('placeholder.webp')) return; 
            img.src = 'assets/images/ui/placeholder.webp';
        };
        img.src = targetSrc;
    },

    hideInspection: () => {
        if (panelInspection) panelInspection.style.display = 'none';
        if (panelStatsGroup) panelStatsGroup.style.display = 'flex'; 
    },

    onAutoToggle: (callbacks) => {
        btnAutoEat.addEventListener('click', () => {
            const isActive = callbacks.toggleEat();
            btnAutoEat.classList.toggle('active', isActive);
            const icon = btnAutoEat.querySelector('i');
            if(isActive) icon.classList.add('fa-beat-fade'); 
            else icon.classList.remove('fa-beat-fade');
            UI.print(`[系統] 自動進食已${isActive ? '開啟' : '關閉'}。`, "system");
        });

        btnAutoDrink.addEventListener('click', () => {
            const isActive = callbacks.toggleDrink();
            btnAutoDrink.classList.toggle('active', isActive);
            const icon = btnAutoDrink.querySelector('i');
            if(isActive) icon.classList.add('fa-beat-fade');
            else icon.classList.remove('fa-beat-fade');
            UI.print(`[系統] 自動飲水已${isActive ? '開啟' : '關閉'}。`, "system");
        });
    },

    onInput: (callback) => {
        const updateInputState = (text) => {
            input.value = text;
            input.focus();
            input.select(); 
        };

        const sendHandler = () => {
            const val = input.value.trim();
            if (val) {
                UI.print(`> ${val}`);
                callback(val);
                updateInputState(val);
            }
        };

        const handleMacroConfig = (id) => {
            const currentName = (localMacros[id] && localMacros[id].name) || "";
            const currentCmd = (localMacros[id] && localMacros[id].cmd) || "";
            
            const newName = prompt(`請輸入按鈕 ${id} 的名稱 (最多4字):`, currentName);
            if (newName === null) return; 
            
            const newCmd = prompt(`請輸入對應的指令 (例如 eat dumpling):`, currentCmd);
            if (newCmd === null) return;

            const finalName = newName.substring(0, 4) || "自定義";
            const finalCmd = newCmd.trim();

            if (onMacroSaveCallback) {
                onMacroSaveCallback(id, { name: finalName, cmd: finalCmd });
            }
        };

        sendBtn.addEventListener('click', sendHandler);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendHandler(); });

        document.body.addEventListener('contextmenu', (e) => {
            const btn = e.target.closest('.btn-macro');
            if (btn) {
                e.preventDefault(); 
                const id = btn.dataset.macroId;
                handleMacroConfig(id);
            }
        });

        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            if (btn.classList.contains('btn-macro')) {
                const id = btn.dataset.macroId;
                const setting = localMacros[id];
                if (setting && setting.cmd) {
                    UI.print(`> ${setting.cmd}`);
                    callback(setting.cmd); 
                } else {
                    handleMacroConfig(id); 
                }
                return;
            }

            const cmd = btn.dataset.cmd || btn.dataset.dir;
            if (cmd) {
                UI.print(`> ${cmd}`);
                callback(cmd);
                updateInputState(cmd);
                return;
            }

            if (btn.classList.contains('btn-step') || btn.classList.contains('btn-step-set')) {
                let newVal = currentEnforceValue;
                if (btn.dataset.enforceSet !== undefined) {
                    newVal = parseInt(btn.dataset.enforceSet);
                } else if (btn.dataset.enforceMod !== undefined) {
                    newVal += parseInt(btn.dataset.enforceMod);
                }
                newVal = Math.max(0, Math.min(10, newVal));
                if (newVal !== currentEnforceValue) {
                    currentEnforceValue = newVal;
                    valEnforce.textContent = currentEnforceValue;
                    valEnforce.style.color = currentEnforceValue > 0 ? "#ff9800" : "#444";
                    
                    const cmdStr = `enforce ${currentEnforceValue}`;
                    UI.print(`> ${cmdStr}`);
                    callback(cmdStr);
                    updateInputState(cmdStr);
                }
            }
        });

        output.addEventListener('click', (e) => {
            const target = e.target.closest('[data-cmd]');
            if (target && output.contains(target)) {
                const cmd = target.dataset.cmd;
                if (cmd) {
                    UI.print(`> ${cmd}`);
                    callback(cmd);
                    updateInputState(cmd);
                }
            }
        });
    },

    onAuthAction: (callbacks) => {
        btnLogin.addEventListener('click', () => { callbacks.onLogin(emailInput.value, pwdInput.value); });
        btnRegister.addEventListener('click', () => { callbacks.onRegister(emailInput.value, pwdInput.value); });
        btnGuest.addEventListener('click', () => { callbacks.onGuest(); });
    }
};

if (panelInspection) {
    panelInspection.addEventListener('click', (e) => {
        UI.hideInspection();
    });
}