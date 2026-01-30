// src/ui.js
const output = document.getElementById('output');
const input = document.getElementById('cmd-input');
const sendBtn = document.getElementById('send-btn');
const loginPanel = document.getElementById('login-panel');
const loginMsg = document.getElementById('login-msg');

// 登入面板輸入框
const emailInput = document.getElementById('email-input');
const pwdInput = document.getElementById('pwd-input');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnGuest = document.getElementById('btn-guest');

// --- 新增：HUD 元素 ---
const elRoomName = document.getElementById('current-room-name');
const barHp = document.getElementById('bar-hp');
const textHp = document.getElementById('text-hp');
const barMp = document.getElementById('bar-mp');
const textMp = document.getElementById('text-mp');
const barSp = document.getElementById('bar-sp');
const textSp = document.getElementById('text-sp');

export const UI = {
    // 輸出訊息 (保持原樣)
    print: (text, type = 'normal') => {
        const div = document.createElement('div');
        div.textContent = text;
        if (type === 'system') div.classList.add('msg-system');
        if (type === 'error') div.classList.add('msg-error');
        if (type === 'chat') div.classList.add('msg-chat');
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    },

    // --- 新增：更新側邊欄狀態 (HUD) ---
    updateHUD: (playerData) => {
        if (!playerData) return;
        const attr = playerData.attributes;

        // 更新房間名稱 (如果有的話)
        // 這裡我們暫時只更新屬性，地圖名稱由 MapSystem 呼叫 updateLocation 處理
        
        // 1. 更新精 (HP)
        // 假設最大值暫時都是 100，之後可從屬性計算
        const maxHp = 100; 
        const hpPercent = Math.max(0, Math.min(100, (attr.hp / maxHp) * 100));
        barHp.style.width = `${hpPercent}%`;
        textHp.textContent = `${attr.hp}/${maxHp}`;

        // 2. 更新氣 (MP)
        const maxMp = 100;
        const mpPercent = Math.max(0, Math.min(100, (attr.mp / maxMp) * 100));
        barMp.style.width = `${mpPercent}%`;
        textMp.textContent = `${attr.mp}/${maxMp}`;

        // 3. 更新神 (SP)
        const maxSp = 100;
        const spPercent = Math.max(0, Math.min(100, (attr.sp / maxSp) * 100));
        barSp.style.width = `${spPercent}%`;
        textSp.textContent = `${attr.sp}/${maxSp}`;
    },

    // --- 新增：更新地點名稱顯示 ---
    updateLocationInfo: (roomTitle) => {
        elRoomName.textContent = roomTitle;
    },

    // 控制遊戲輸入框
    enableGameInput: (enabled) => {
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
        // 同時啟用/禁用按鈕
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

    // 綁定輸入與按鈕事件 (合併處理)
    onInput: (callback) => {
        // 1. 文字輸入框
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

        // 2. --- 新增：畫面上的按鈕點擊事件 ---
        // 選取所有移動按鈕和動作按鈕
        document.querySelectorAll('.btn-move, .btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                // 從 data-dir 或 data-cmd 屬性取得指令
                const cmd = btn.dataset.dir || btn.dataset.cmd;
                if (cmd) {
                    UI.print(`> ${cmd}`); // 模擬玩家輸入
                    callback(cmd); // 直接呼叫指令處理
                }
            });
        });
    },

    // 綁定登入相關按鈕事件
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