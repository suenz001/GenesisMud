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
    // 輸出訊息 (支援純文字與 HTML)
    // isHtml: 如果為 true，則使用 innerHTML
    print: (content, type = 'normal', isHtml = false) => {
        const div = document.createElement('div');
        
        if (isHtml) {
            div.innerHTML = content;
        } else {
            div.textContent = content;
        }

        if (type === 'system') div.classList.add('msg-system');
        if (type === 'error') div.classList.add('msg-error');
        if (type === 'chat') div.classList.add('msg-chat');
        
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    },

    // --- 新增：產生可點擊指令的 HTML 輔助函式 ---
    // text: 顯示的文字 (如 "[吃]")
    // cmd: 實際執行的指令 (如 "eat rice")
    // styleClass: 額外的 CSS 類別
    makeCmd: (text, cmd, styleClass = 'cmd-link') => {
        // 我們將指令存在 data-cmd 屬性中
        return `<span class="${styleClass}" data-cmd="${cmd}">${text}</span>`;
    },

    updateHUD: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        
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

        updateBar('bar-hp', 'text-hp', attr.hp, attr.maxHp);
        updateBar('bar-spiritual', 'text-spiritual', attr.spiritual, attr.maxSpiritual);
        updateBar('bar-mp', 'text-mp', attr.mp, attr.maxMp);
        updateBar('bar-force', 'text-force', attr.force, attr.maxForce);
        updateBar('bar-sp', 'text-sp', attr.sp, attr.maxSp);
        updateBar('bar-mana', 'text-mana', attr.mana, attr.maxMana);

        const currentRoom = WorldMap[playerData.location];
        if (currentRoom) {
            UI.drawRangeMap(currentRoom.x, currentRoom.y, currentRoom.z, playerData.location);
        }
    },

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

                if (roomData) {
                    div.classList.add('room-exists');
                    div.title = roomData.title;
                    if (x === px && y === py) {
                        div.classList.add('current-pos');
                        div.textContent = "我";
                    } else {
                        div.textContent = roomData.title.substring(0, 1);
                    }
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

    showLoginError: (msg) => {
        document.getElementById('login-msg').textContent = msg;
    },

    onInput: (callback) => {
        const sendHandler = () => {
            const val = input.value.trim();
            if (val) {
                UI.print(`> ${val}`);
                callback(val);
                input.select();
            }
        };

        sendBtn.addEventListener('click', sendHandler);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendHandler();
        });

        document.querySelectorAll('.btn-move, .btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.dir || btn.dataset.cmd;
                if (cmd) {
                    UI.print(`> ${cmd}`);
                    callback(cmd);
                    input.value = cmd;
                    input.select();
                }
            });
        });

        // --- 新增：事件委派 (Event Delegation) 處理動態生成的按鈕 ---
        output.addEventListener('click', (e) => {
            // 檢查點擊的元素是否有 data-cmd 屬性
            if (e.target && e.target.dataset.cmd) {
                const cmd = e.target.dataset.cmd;
                UI.print(`> ${cmd}`); // 模擬輸入
                callback(cmd);        // 執行指令
                input.value = cmd;    // 填入輸入框方便重複執行
                input.select();
            }
        });
    }
    // ... 其他函式 ...
    ,onAuthAction: (callbacks) => {
        btnLogin.addEventListener('click', () => { callbacks.onLogin(emailInput.value, pwdInput.value); });
        btnRegister.addEventListener('click', () => { callbacks.onRegister(emailInput.value, pwdInput.value); });
        btnGuest.addEventListener('click', () => { callbacks.onGuest(); });
    }
};