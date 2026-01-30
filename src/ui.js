// src/ui.js
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
const miniMapBox = document.getElementById('mini-map-box'); // 小地圖容器

const barHp = document.getElementById('bar-hp');
const textHp = document.getElementById('text-hp');
const barMp = document.getElementById('bar-mp');
const textMp = document.getElementById('text-mp');
const barSp = document.getElementById('bar-sp');
const textSp = document.getElementById('text-sp');

// 修改 HTML 中的標籤文字 (在這裡用 JS 改，或者你可以直接去 HTML 改)
// 為了方便，我們直接操作 DOM 改掉中文
document.querySelector('#panel-status .status-row:nth-child(2) .label').textContent = "Essence"; // 精
document.querySelector('#panel-status .status-row:nth-child(3) .label').textContent = "Breath";  // 氣
document.querySelector('#panel-status .status-row:nth-child(4) .label').textContent = "Spirit";  // 神

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

    updateHUD: (playerData, currentRoomExits) => {
        if (!playerData) return;
        const attr = playerData.attributes;
        const max = 100; 

        // 1. Essence (HP)
        const hpPercent = Math.max(0, Math.min(100, (attr.hp / max) * 100));
        barHp.style.width = `${hpPercent}%`;
        textHp.textContent = `${attr.hp}/${max}`;

        // 2. Breath (MP)
        const mpPercent = Math.max(0, Math.min(100, (attr.mp / max) * 100));
        barMp.style.width = `${mpPercent}%`;
        textMp.textContent = `${attr.mp}/${max}`;

        // 3. Spirit (SP)
        const spPercent = Math.max(0, Math.min(100, (attr.sp / max) * 100));
        barSp.style.width = `${spPercent}%`;
        textSp.textContent = `${attr.sp}/${max}`;

        // 4. 繪製小地圖
        UI.drawMiniMap(currentRoomExits);
    },

    // --- 新增：繪製九宮格地圖 ---
    drawMiniMap: (exits) => {
        if (!exits) exits = {};
        miniMapBox.innerHTML = ''; // 清空
        
        const grid = document.createElement('div');
        grid.className = 'mini-map-grid';

        // 定義九宮格順序：NW, N, NE, W, Center, E, SW, S, SE
        const cells = [
            { dir: 'northwest', label: '↖' }, { dir: 'north', label: 'N' }, { dir: 'northeast', label: '↗' },
            { dir: 'west', label: 'W' },      { dir: 'center', label: '我' }, { dir: 'east', label: 'E' },
            { dir: 'southwest', label: '↙' }, { dir: 'south', label: 'S' }, { dir: 'southeast', label: '↘' }
        ];

        cells.forEach(cell => {
            const div = document.createElement('div');
            div.className = 'map-cell';

            if (cell.dir === 'center') {
                div.classList.add('current');
                div.textContent = 'YOU';
            } else if (exits[cell.dir]) {
                div.classList.add('exit');
                div.textContent = cell.label;
                div.title = `往 ${cell.dir} 移動`;
                // 讓小地圖也能點擊移動
                div.onclick = () => {
                    // 模擬點擊按鈕
                    const btn = document.querySelector(`.btn-move[data-dir="${cell.dir}"]`);
                    if (btn) btn.click();
                };
            } else {
                // 沒有路的地方留空或顯示牆壁
                div.style.opacity = '0.1';
            }
            grid.appendChild(div);
        });

        // 處理特殊出口 (Up/Down/Out/Enter) 顯示在下方文字
        const specialExits = Object.keys(exits).filter(k => !['north','south','east','west','northwest','northeast','southwest','southeast'].includes(k));
        if (specialExits.length > 0) {
            const extra = document.createElement('div');
            extra.style.position = 'absolute';
            extra.style.bottom = '5px';
            extra.style.color = '#ffff00';
            extra.style.fontSize = '12px';
            extra.textContent = '其他: ' + specialExits.join(', ');
            miniMapBox.appendChild(extra);
        }

        miniMapBox.appendChild(grid);
    },

    updateLocationInfo: (roomTitle) => {
        elRoomName.textContent = roomTitle;
    },

    enableGameInput: (enabled) => {
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
        const allBtns = document.querySelectorAll('.btn-move, .btn-action');
        allBtns.forEach(btn => btn.disabled = !enabled);

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
        loginMsg.textContent = msg;
    },

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