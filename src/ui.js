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

// HUD 元素
const elRoomName = document.getElementById('current-room-name');
const miniMapBox = document.getElementById('mini-map-box');

export const UI = {
    // 輸出訊息到左側視窗
    print: (text, type = 'normal') => {
        const div = document.createElement('div');
        div.textContent = text;
        if (type === 'system') div.classList.add('msg-system');
        if (type === 'error') div.classList.add('msg-error');
        if (type === 'chat') div.classList.add('msg-chat');
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    },

    // 更新右側面板 (狀態 + 地圖)
    updateHUD: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        
        // 輔助函式：更新單一血條
        const updateBar = (barId, textId, current, max) => {
            const barEl = document.getElementById(barId);
            const textEl = document.getElementById(textId);
            if (!barEl || !textEl) return;

            const safeMax = max || 1; 
            const safeCurrent = current || 0;
            const percent = Math.max(0, Math.min(100, (safeCurrent / safeMax) * 100));
            
            barEl.style.width = `${percent}%`;
            textEl.textContent = `${safeCurrent}/${safeMax}`;
        };

        // 1. 更新 6 條屬性
        updateBar('bar-hp', 'text-hp', attr.hp, attr.maxHp);           // 精
        updateBar('bar-spiritual', 'text-spiritual', attr.spiritual, attr.maxSpiritual); // 靈力
        
        updateBar('bar-mp', 'text-mp', attr.mp, attr.maxMp);           // 氣
        updateBar('bar-force', 'text-force', attr.force, attr.maxForce); // 內力
        
        updateBar('bar-sp', 'text-sp', attr.sp, attr.maxSp);           // 神
        updateBar('bar-mana', 'text-mana', attr.mana, attr.maxMana);     // 法力

        // 2. 繪製地圖 (傳入當前座標)
        const currentRoom = WorldMap[playerData.location];
        if (currentRoom) {
            UI.drawRangeMap(currentRoom.x, currentRoom.y, currentRoom.z, playerData.location);
        }
    },

    // 繪製 5x5 範圍地圖 (含牆壁判定)
    drawRangeMap: (px, py, pz, currentId) => {
        miniMapBox.innerHTML = ''; 
        const grid = document.createElement('div');
        grid.className = 'range-map-grid';
        const radius = 2; // 半徑 2 = 5x5

        // 從上到下 (Y遞減)，從左到右 (X遞增) 掃描
        for (let y = py + radius; y >= py - radius; y--) {
            for (let x = px - radius; x <= px + radius; x++) {
                const div = document.createElement('div');
                div.className = 'map-cell-range';
                let roomData = null;

                // 搜尋該座標的房間
                for (const [key, val] of Object.entries(WorldMap)) {
                    if (val.x === x && val.y === y && val.z === pz) {
                        roomData = val;
                        break;
                    }
                }

                if (roomData) {
                    div.classList.add('room-exists');
                    div.title = roomData.title; // 滑鼠懸停顯示全名

                    // 繪製中心點 (玩家) 或 其他房間
                    if (x === px && y === py) {
                        div.classList.add('current-pos');
                        div.textContent = "我";
                    } else {
                        // 顯示首字
                        div.textContent = roomData.title.substring(0, 1);
                    }

                    // --- 繪製牆壁 (紅線) ---
                    if (roomData.walls) {
                        if (roomData.walls.includes('north')) div.classList.add('wall-north');
                        if (roomData.walls.includes('south')) div.classList.add('wall-south');
                        if (roomData.walls.includes('east'))  div.classList.add('wall-east');
                        if (roomData.walls.includes('west'))  div.classList.add('wall-west');
                    }

                } else {
                    div.classList.add('empty');
                }
                grid.appendChild(div);
            }
        }
        
        // 右下角顯示樓層
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

    // 更新地點名稱文字
    updateLocationInfo: (roomTitle) => {
        elRoomName.textContent = roomTitle;
    },

    // 啟用/禁用 遊戲控制項
    enableGameInput: (enabled) => {
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
        // 抓取所有遊戲按鈕
        document.querySelectorAll('.btn-move, .btn-action').forEach(btn => btn.disabled = !enabled);
        
        if (enabled) {
            input.placeholder = "請輸入指令...";
            input.focus();
        } else {
            input.placeholder = "請先登入...";
        }
    },

    // 顯示/隱藏 登入面板
    showLoginPanel: (show) => {
        loginPanel.style.display = show ? 'block' : 'none';
        if (show) emailInput.focus();
    },

    // 顯示登入錯誤
    showLoginError: (msg) => {
        document.getElementById('login-msg').textContent = msg;
    },

    // 綁定輸入與按鈕事件
    onInput: (callback) => {
        // 1. 文字框輸入
        const sendHandler = () => {
            const val = input.value.trim();
            if (val) {
                UI.print(`> ${val}`);
                callback(val);
                input.value = '';
            }
        };

        sendBtn.addEventListener('click', sendHandler);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendHandler();
        });

        // 2. 按鈕點擊 (移動與指令)
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

    // 綁定登入相關按鈕
    onAuthAction: (callbacks) => {
        btnLogin.addEventListener('click', () => { 
            callbacks.onLogin(emailInput.value, pwdInput.value); 
        });
        btnRegister.addEventListener('click', () => { 
            callbacks.onRegister(emailInput.value, pwdInput.value); 
        });
        btnGuest.addEventListener('click', () => { 
            callbacks.onGuest(); 
        });
    }
};