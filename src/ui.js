// src/ui.js
import { WorldMap } from "./data/world.js";

const output = document.getElementById('output');
const input = document.getElementById('cmd-input');
const sendBtn = document.getElementById('send-btn');
const loginPanel = document.getElementById('login-panel');
const loginMsg = document.getElementById('login-msg');

const emailInput = document.getElementById('email-input');
const pwdInput = document.getElementById('pwd-input');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnGuest = document.getElementById('btn-guest');

// HUD 元素 - 基礎
const elRoomName = document.getElementById('current-room-name');
const miniMapBox = document.getElementById('mini-map-box');

const barHp = document.getElementById('bar-hp');
const textHp = document.getElementById('text-hp');
const barMp = document.getElementById('bar-mp');
const textMp = document.getElementById('text-mp');
const barSp = document.getElementById('bar-sp');
const textSp = document.getElementById('text-sp');

// HUD 元素 - 進階 (新增)
const barForce = document.getElementById('bar-force');
const textForce = document.getElementById('text-force');
const barMana = document.getElementById('bar-mana');
const textMana = document.getElementById('text-mana');
const barSpiritual = document.getElementById('bar-spiritual');
const textSpiritual = document.getElementById('text-spiritual');

export const UI = {
    print: (text, type = 'normal') => {
        const div = document.createElement('div');
        div.textContent = text;
        if (type === 'system') div.classList.add('msg-system');
        if (type === 'error') div.classList.add('msg-error');
        if (type === 'chat') div.classList.add('msg-chat');
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    },

    updateHUD: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        
        // 輔助函式：計算百分比並更新 DOM
        const updateBar = (barEl, textEl, current, max) => {
            // 避免 max 為 0 或 undefined 的情況
            const safeMax = max || 1; 
            const safeCurrent = current || 0;
            const percent = Math.max(0, Math.min(100, (safeCurrent / safeMax) * 100));
            barEl.style.width = `${percent}%`;
            textEl.textContent = `${safeCurrent}/${safeMax}`;
        };

        // 1. 基礎屬性 (如果沒有 max 欄位，暫時用 100 當預設)
        updateBar(barHp, textHp, attr.hp, attr.maxHp || 100);
        updateBar(barMp, textMp, attr.mp, attr.maxMp || 100);
        updateBar(barSp, textSp, attr.sp, attr.maxSp || 100);

        // 2. 進階屬性
        updateBar(barSpiritual, textSpiritual, attr.spiritual, attr.maxSpiritual || 10);
        updateBar(barForce, textForce, attr.force, attr.maxForce || 10);
        updateBar(barMana, textMana, attr.mana, attr.maxMana || 10);

        // 3. 繪製地圖
        const currentRoom = WorldMap[playerData.location];
        if (currentRoom) {
            UI.drawRangeMap(currentRoom.x, currentRoom.y, currentRoom.z, playerData.location);
        }
    },

    // ... (drawRangeMap, updateLocationInfo, enableGameInput, showLoginPanel, showLoginError 等保持不變) ...
    // 請保留原本的 drawRangeMap 邏輯
    drawRangeMap: (px, py, pz, currentId) => {
        miniMapBox.innerHTML = ''; 
        const grid = document.createElement('div');
        grid.className = 'range-map-grid';
        const radius = 2; 

        for (let y = py + radius; y >= py - radius; y--) {
            for (let x = px - radius; x <= px + radius; x++) {
                const div = document.createElement('div');
                div.className = 'map-cell-range';
                let roomData = null;

                for (const [key, val] of Object.entries(WorldMap)) {
                    if (val.x === x && val.y === y && val.z === pz) {
                        roomData = val;
                        break;
                    }
                }

                if (x === px && y === py) {
                    div.classList.add('current-pos');
                    div.textContent = "我";
                } else if (roomData) {
                    div.classList.add('room-exists');
                    div.textContent = roomData.title.substring(0, 1);
                    div.title = roomData.title;
                } else {
                    div.classList.add('empty');
                }
                grid.appendChild(div);
            }
        }
        
        const zInfo = document.createElement('div');
        zInfo.style.position = 'absolute';
        zInfo.style.bottom = '2px';
        zInfo.style.right = '5px';
        zInfo.style.fontSize = '10px';
        zInfo.style.color = '#555';
        zInfo.textContent = `層級: ${pz}`;
        miniMapBox.appendChild(zInfo);
        miniMapBox.appendChild(grid);
    },
    
    updateLocationInfo: (roomTitle) => {
        elRoomName.textContent = roomTitle;
    },

    enableGameInput: (enabled) => {
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
        document.querySelectorAll('.btn-move, .btn-action').forEach(btn => btn.disabled = !enabled);
        if (enabled) {
            input.placeholder = "請輸入指令...";
            input.focus();
        } else {
            input.placeholder = "請先登入...";
        }
    },

    showLoginPanel: (show) => {
        loginPanel.style.display = show ? 'block' : 'none';
        if (show) emailInput.focus();
    },
    showLoginError: (msg) => { loginMsg.textContent = msg; },

    onInput: (callback) => {
        sendBtn.addEventListener('click', () => {
            const val = input.value.trim();
            if (val) {
                UI.print(`> ${val}`);
                callback(val);
                input.value = '';
            }
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendBtn.click();
        });
        document.querySelectorAll('.btn-move, .btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.dir || btn.dataset.cmd;
                if (cmd) {
                    UI.print(`> ${cmd}`);
                    callback(cmd);
                }
            });
        });
    },
    onAuthAction: (callbacks) => {
        btnLogin.addEventListener('click', () => { callbacks.onLogin(emailInput.value, pwdInput.value); });
        btnRegister.addEventListener('click', () => { callbacks.onRegister(emailInput.value, pwdInput.value); });
        btnGuest.addEventListener('click', () => { callbacks.onGuest(); });
    }
};