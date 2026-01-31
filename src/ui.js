// src/ui.js (請保留原有的 import)
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

const elRoomName = document.getElementById('current-room-name');
const miniMapBox = document.getElementById('mini-map-box');

export const UI = {
    // --- 新增：貨幣格式化 ---
    // 1000文 = 1兩銀, 1000兩銀 = 1兩金
    formatMoney: (coins) => {
        if (!coins) return "0 文銅錢";
        const gold = Math.floor(coins / 1000000);
        const silver = Math.floor((coins % 1000000) / 1000);
        const copper = coins % 1000;

        let str = "";
        if (gold > 0) str += `<span style="color:#ffd700">${gold}兩黃金</span> `;
        if (silver > 0) str += `<span style="color:#c0c0c0">${silver}兩白銀</span> `;
        if (copper > 0) str += `<span style="color:#cd7f32">${copper}文銅錢</span>`;
        
        return str.trim() || "0 文銅錢";
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

    makeCmd: (text, cmd, styleClass = 'cmd-link') => {
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
                        if (hasCommonRegion) roomData = val;
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

    updateLocationInfo: (roomTitle) => { elRoomName.textContent = roomTitle; },
    enableGameInput: (enabled) => {
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
        document.querySelectorAll('.btn-move, .btn-action').forEach(btn => btn.disabled = !enabled);
        if (enabled) { input.placeholder = "請輸入指令..."; input.focus(); } 
        else { input.placeholder = "請先登入..."; }
    },
    showLoginPanel: (show) => {
        loginPanel.style.display = show ? 'block' : 'none';
        if (show) emailInput.focus();
    },
    showLoginError: (msg) => { document.getElementById('login-msg').textContent = msg; },
    
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
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendHandler(); });
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
        output.addEventListener('click', (e) => {
            if (e.target && e.target.dataset.cmd) {
                const cmd = e.target.dataset.cmd;
                UI.print(`> ${cmd}`);
                callback(cmd);
                input.value = cmd;
                input.select();
            }
        });
    },
    onAuthAction: (callbacks) => {
        btnLogin.addEventListener('click', () => { callbacks.onLogin(emailInput.value, pwdInput.value); });
        btnRegister.addEventListener('click', () => { callbacks.onRegister(emailInput.value, pwdInput.value); });
        btnGuest.addEventListener('click', () => { callbacks.onGuest(); });
    }
};