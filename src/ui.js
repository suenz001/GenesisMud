// src/ui.js - 請完全覆蓋
import { WorldMap } from "./data/world.js"; // <--- 這裡需要直接引用 WorldMap 來查座標

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

// HUD 元素
const elRoomName = document.getElementById('current-room-name');
const miniMapBox = document.getElementById('mini-map-box');

const barHp = document.getElementById('bar-hp');
const textHp = document.getElementById('text-hp');
const barMp = document.getElementById('bar-mp');
const textMp = document.getElementById('text-mp');
const barSp = document.getElementById('bar-sp');
const textSp = document.getElementById('text-sp');

// 改回中文標籤
document.querySelector('#panel-status .status-row:nth-child(2) .label').textContent = "精";
document.querySelector('#panel-status .status-row:nth-child(3) .label').textContent = "氣";
document.querySelector('#panel-status .status-row:nth-child(4) .label').textContent = "神";

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
        const max = 100; 

        // 1. 精 (HP)
        const hpPercent = Math.max(0, Math.min(100, (attr.hp / max) * 100));
        barHp.style.width = `${hpPercent}%`;
        textHp.textContent = `${attr.hp}/${max}`;

        // 2. 氣 (MP)
        const mpPercent = Math.max(0, Math.min(100, (attr.mp / max) * 100));
        barMp.style.width = `${mpPercent}%`;
        textMp.textContent = `${attr.mp}/${max}`;

        // 3. 神 (SP)
        const spPercent = Math.max(0, Math.min(100, (attr.sp / max) * 100));
        barSp.style.width = `${spPercent}%`;
        textSp.textContent = `${attr.sp}/${max}`;

        // 4. 繪製 5x5 範圍地圖
        // 為了取得座標，我們需要從 WorldMap 裡查當前玩家所在的房間
        const currentRoom = WorldMap[playerData.location];
        if (currentRoom) {
            UI.drawRangeMap(currentRoom.x, currentRoom.y, currentRoom.z, playerData.location);
        }
    },

    // --- 新增：繪製範圍地圖 (Range Map) ---
    drawRangeMap: (px, py, pz, currentId) => {
        miniMapBox.innerHTML = ''; 
        
        const grid = document.createElement('div');
        grid.className = 'range-map-grid'; // 使用新的 class

        // 定義視野半徑 (半徑2 = 5x5)
        const radius = 2; 

        // 掃描 Y 軸 (從北到南：py + radius -> py - radius)
        for (let y = py + radius; y >= py - radius; y--) {
            // 掃描 X 軸 (從西到東：px - radius -> px + radius)
            for (let x = px - radius; x <= px + radius; x++) {
                
                const div = document.createElement('div');
                div.className = 'map-cell-range';

                // 搜尋這個座標有沒有房間 (且高度 z 相同)
                // 這裡簡單用遍歷搜尋，資料量大時可優化為 Map lookup
                let roomKey = null;
                let roomData = null;

                for (const [key, val] of Object.entries(WorldMap)) {
                    // 必須 x, y, z 都吻合
                    if (val.x === x && val.y === y && val.z === pz) {
                        roomKey = key;
                        roomData = val;
                        break;
                    }
                }

                if (x === px && y === py) {
                    // 玩家中心點
                    div.classList.add('current-pos');
                    div.textContent = "我"; // 縮小的標記
                } else if (roomData) {
                    // 這裡有房間
                    div.classList.add('room-exists');
                    // 取地圖名稱的第一個字當縮寫 (例如 "悅來客棧" -> "悅")
                    div.textContent = roomData.title.substring(0, 1);
                    div.title = roomData.title; // 滑鼠移上去顯示全名
                } else {
                    // 空地
                    div.classList.add('empty');
                }

                grid.appendChild(div);
            }
        }
        
        // 顯示樓層提示
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