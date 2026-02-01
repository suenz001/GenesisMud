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

// 儀表板元素 - 內力控制
const valEnforce = document.getElementById('val-enforce');
// 注意：在現代 UI 中，步進按鈕是透過 document.body 的委派事件處理的，這裡不需要直接選取 .btn-step

// 暫存目前的內力值 (因為 UI 沒有 slider 了，需要變數暫存)
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
        
        // Helper: 更新進度條寬度與文字
        const updateBar = (barEl, textEl, current, max) => {
            if (!barEl) return;
            const safeMax = max || 1;
            const safeCurrent = Math.max(0, current || 0);
            const percent = Math.min(100, (safeCurrent / safeMax) * 100);
            
            barEl.style.width = `${percent}%`;
            
            if (textEl) {
                // 如果是生存條，顯示狀態文字而非數字
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

        // 1. 核心條
        updateBar(barHp, textHp, attr.hp, attr.maxHp);
        updateBar(barForce, textForce, attr.force, attr.maxForce);

        // 2. 精神條
        updateBar(barSp, textSp, attr.sp, attr.maxSp);
        updateBar(barMp, textMp, attr.mp, attr.maxMp);

        // 3. 生存條
        updateBar(barFood, statusFood, attr.food, attr.maxFood);
        updateBar(barWater, statusWater, attr.water, attr.maxWater);

        // 4. 更新內力顯示
        const serverEnforce = (playerData.combat && playerData.combat.enforce) ? playerData.combat.enforce : 0;
        currentEnforceValue = serverEnforce; // 同步本地變數
        if(valEnforce) {
            valEnforce.textContent = currentEnforceValue;
            valEnforce.style.color = currentEnforceValue > 0 ? "#ff9800" : "#444";
        }

        // 5. 更新地圖
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
        const radius = 2; // 5x5 的半徑是 2
        
        // 取得當前房間的區域，用於地圖過濾
        const currentRoomData = WorldMap[currentId];
        const currentRegions = currentRoomData ? (currentRoomData.region || ["world"]) : ["world"];

        for (let y = py + radius; y >= py - radius; y--) {
            for (let x = px - radius; x <= px + radius; x++) {
                const div = document.createElement('div');
                div.className = 'map-cell-range';
                
                let roomData = null;
                // 搜尋該座標的房間
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
                    div.title = roomData.title; // Tooltip
                    
                    // 我
                    if (x === px && y === py) {
                        div.classList.add('current-pos');
                        div.innerHTML = '<i class="fas fa-user"></i>';
                    } else {
                        // 其他房間，依據出口畫牆壁
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
        
        // 顯示樓層 Z 軸
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
        
        // 禁用/啟用所有按鈕
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
    
    // === 自動按鈕改為圖示點擊事件 ===
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
        const sendHandler = () => {
            const val = input.value.trim();
            if (val) {
                UI.print(`> ${val}`);
                callback(val);
                input.value = ''; // 清空
            }
        };

        sendBtn.addEventListener('click', sendHandler);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendHandler(); });

        // 綁定所有帶有 data-cmd 或 data-dir 的實體 BUTTON 按鈕 (右側面板)
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            // 處理通用指令按鈕
            const cmd = btn.dataset.cmd || btn.dataset.dir;
            if (cmd) {
                UI.print(`> ${cmd}`);
                callback(cmd);
                return;
            }

            // === 內力控制按鈕邏輯 ===
            if (btn.classList.contains('btn-step') || btn.classList.contains('btn-step-set')) {
                let newVal = currentEnforceValue;

                if (btn.dataset.enforceSet !== undefined) {
                    newVal = parseInt(btn.dataset.enforceSet);
                } else if (btn.dataset.enforceMod !== undefined) {
                    newVal += parseInt(btn.dataset.enforceMod);
                }

                // 限制範圍 0-10
                newVal = Math.max(0, Math.min(10, newVal));

                if (newVal !== currentEnforceValue) {
                    currentEnforceValue = newVal;
                    valEnforce.textContent = currentEnforceValue;
                    valEnforce.style.color = currentEnforceValue > 0 ? "#ff9800" : "#444";
                    
                    const cmdStr = `enforce ${currentEnforceValue}`;
                    UI.print(`> ${cmdStr}`);
                    callback(cmdStr);
                }
            }
        });

        // === [修正關鍵] 處理主畫面 (output) 內動態生成的按鈕與連結 ===
        // 使用 closest 查找最近的帶有 data-cmd 的元素，確保點擊內部圖示或 span 時也能觸發
        output.addEventListener('click', (e) => {
            const target = e.target.closest('[data-cmd]');
            
            // 確保找到的元素確實在 output 內 (安全性檢查)
            if (target && output.contains(target)) {
                const cmd = target.dataset.cmd;
                if (cmd) {
                    UI.print(`> ${cmd}`);
                    callback(cmd);
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