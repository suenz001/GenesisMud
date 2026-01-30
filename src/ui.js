// src/ui.js
const output = document.getElementById('output');
const input = document.getElementById('cmd-input');
const sendBtn = document.getElementById('send-btn');
const loginPanel = document.getElementById('login-panel');
const loginMsg = document.getElementById('login-msg');

// 登入面板的輸入框與按鈕
const emailInput = document.getElementById('email-input');
const pwdInput = document.getElementById('pwd-input');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnGuest = document.getElementById('btn-guest');

export const UI = {
    // 輸出訊息
    print: (text, type = 'normal') => {
        const div = document.createElement('div');
        div.textContent = text;
        if (type === 'system') div.classList.add('msg-system');
        if (type === 'error') div.classList.add('msg-error');
        if (type === 'chat') div.classList.add('msg-chat');
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    },

    // 控制遊戲輸入框
    enableGameInput: (enabled) => {
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
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
        if (show) {
            emailInput.focus();
        }
    },

    // 顯示登入錯誤訊息
    showLoginError: (msg) => {
        loginMsg.textContent = msg;
    },

    // 綁定遊戲指令事件
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
    },

    // 綁定登入相關按鈕事件
    onAuthAction: (callbacks) => {
        // 登入
        btnLogin.addEventListener('click', () => {
            callbacks.onLogin(emailInput.value, pwdInput.value);
        });
        // 註冊
        btnRegister.addEventListener('click', () => {
            callbacks.onRegister(emailInput.value, pwdInput.value);
        });
        // 匿名
        btnGuest.addEventListener('click', () => {
            callbacks.onGuest();
        });
    }
};