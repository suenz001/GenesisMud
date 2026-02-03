// src/ui.js
import { WorldMap } from "./data/world.js";

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

// [新增] 儀表板元素 - 潛能
const valPotential = document.getElementById('val-potential');

// 儀表板元素 - 內力控制
const valEnforce = document.getElementById('val-enforce');

// 新增：面板切換元素 (移除 btnCloseInspect)
const panelInspection = document.getElementById('panel-inspection');
const panelStatsGroup = document.getElementById('panel-stats-group');

// 暫存目前的內力值
let currentEnforceValue = 0;

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
        if (!coins) return UI.txt("0", "#ccc") + UI.txt(" 文銅錢", "#888");
        const gold = Math.floor(coins / 1000000);
        const silver = Math.floor((coins % 1000000) / 1000);
        const copper = coins % 1000;
        let str = "";
        if (gold > 0) str += UI.txt(gold, "#ffd700", true) + UI.txt("兩黃金 ", "#aa8800");
        if (silver > 0) str += UI.txt(silver, "#e0e0e0", true) + UI.txt("兩白銀 ", "#888");
        if (copper > 0) str += UI.txt(copper, "#cd7f32", true) + UI.txt("文銅錢", "#885522");
        return str.trim() || UI.txt("0 文銅錢", "#888");
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

        // [新增] 更新潛能顯示
        if (valPotential) {
            const pot = (playerData.combat && playerData.combat.potential) ? playerData.combat.potential : 0;
            valPotential.textContent = pot;
        }

        const currentRoom = WorldMap[playerData.location];
        if (currentRoom) {
            UI.drawRangeMap(currentRoom.x, currentRoom.y, currentRoom.z, playerData.location);
        }
    },

    drawRangeMap: (px, py, pz, currentId) => {
        const miniMapBox = document.getElementById('mini-map-box');
        if(!miniMapBox) return;
        miniMapBox.innerHTML = ''; 
        
        const grid = document.createElement('div');
        grid.className = 'range-map-grid';
        const radius = 2;
        
        const currentRoomData = WorldMap[currentId];
        const currentRegions = currentRoomData ? (currentRoomData.region || ["world"]) : ["world"];

        for (let y = py + radius; y >= py - radius; y--) {
            for (let x = px - radius; x <= px + radius; x++) {
                const div = document.createElement('div');
                div.className = 'map-cell-range';
                
                let roomData = null;
                for (const [key, val] of Object.entries(WorldMap)) {
                    if (val.x === x && val.y === y && val.z === pz) {
                        const targetRegions = val.region || ["world"];
                        const hasCommonRegion = currentRegions.some(r => targetRegions.includes(r));
                        if (hasCommonRegion) {
                            roomData = val;
                            break;
                        }
                    }
                }

                if (roomData) {
                    div.classList.add('room-exists');
                    div.title = roomData.title;
                    
                    if (x === px && y === py) {
                        div.classList.add('current-pos');
                        div.innerHTML = '<i class="fas fa-user"></i>';
                    } else {
                        if (roomData.walls) {
                            if (roomData.walls.includes('north')) div.classList.add('wall-north');
                            if (roomData.walls.includes('south')) div.classList.add('wall-south');
                            if (roomData.walls.includes('east'))  div.classList.add('wall-east');
                            if (roomData.walls.includes('west'))  div.classList.add('wall-west');
                        }
                    }
                } 
                grid.appendChild(div);
            }
        }
        
        const zInfo = document.createElement('div');
        zInfo.style.position = 'absolute';
        zInfo.style.bottom = '5px';
        zInfo.style.right = '5px';
        zInfo.style.fontSize = '10px';
        zInfo.style.color = '#555';
        zInfo.style.background = 'rgba(0,0,0,0.5)';
        zInfo.style.padding = '2px 4px';
        zInfo.style.borderRadius = '3px';
        zInfo.textContent = `層: ${pz}`;
        miniMapBox.appendChild(zInfo);
        miniMapBox.appendChild(grid);
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
    
    // 顯示觀察面板
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

        sendBtn.addEventListener('click', sendHandler);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendHandler(); });

        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
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