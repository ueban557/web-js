// ==UserScript==
// @name         机场自动注册助手 (By听风独-家提供)
// @namespace    http://tampermonkey.net/
// @version      2025-08-28.18
// @description  终极版！优化“随机生成”按钮逻辑，在脚本运行时可立即触发后续点击操作。集成启停控制、状态检测、网络监控、智能重试等高级功能。
// @author       Gemini (Ultimate Enhanced Version)
// @match        http://*/*
// @match        https://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 配置与状态管理 ---
    let config = {
        email: GM_getValue('savedEmail', 'user' + Date.now().toString().slice(-6) + '@gmail.com'),
        password: GM_getValue('savedPassword', 'pass' + Math.random().toString(36).substring(2, 10)),
        autoFillEnabled: GM_getValue('autoFillEnabled', true),
        autoRegisterEnabled: GM_getValue('autoRegisterEnabled', false),
        isMinimized: GM_getValue('isMinimized', false),
        isLocked: GM_getValue('isLocked', false)
    };
    let isScriptRunning = false;

    // --- 2. 样式定义 ---
    GM_addStyle(`
        :root {
            --helper-width: 20rem;
            --helper-ball-size: 3rem;
            --helper-primary-color: #007bff;
            --helper-success-color: #28a745;
            --helper-danger-color: #dc3545;
            --helper-warning-color: #ffc107;
        }
        #helper-container {
            position: fixed !important; top: 10rem; right: 1.5rem; width: var(--helper-width) !important; height: auto !important;
            background-color: #ffffff !important; border: 1px solid #e0e0e0 !important; border-radius: 0.5rem !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15) !important; z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            color: #333 !important; overflow: hidden !important; transition: all 0.3s ease-in-out !important;
        }
        #helper-container.minimized {
            width: var(--helper-ball-size) !important; height: var(--helper-ball-size) !important;
            border-radius: 50% !important; cursor: pointer !important; padding: 0 !important;
        }
        #helper-container.minimized .helper-content { display: none !important; }
        #helper-ball-icon { display: none; font-size: 1.5rem; color: white; width: 100%; height: 100%; background-color: var(--helper-primary-color); justify-content: center; align-items: center; }
        #helper-container.minimized #helper-ball-icon { display: flex !important; }
        .helper-content { display: flex; flex-direction: column; }
        #helper-header { padding: 0.6rem 1rem; cursor: move; background-color: var(--helper-primary-color); color: white; display: flex; justify-content: space-between; align-items: center; font-size: 1rem; }
        #minimize-btn { cursor: pointer; font-size: 1.5rem; font-weight: bold; line-height: 1; user-select: none; }
        #helper-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
        #helper-body input[type="text"] { width: calc(100% - 1.2rem); padding: 0.5rem 0.6rem; border: 1px solid #ccc; border-radius: 0.25rem; font-size: 0.9rem; }
        #helper-body button { padding: 0.6rem; border: none; border-radius: 0.25rem; cursor: pointer; font-weight: bold; transition: background-color 0.2s, color 0.2s; color: white; }
        .button-group { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
        #lock-btn { background-color: var(--helper-primary-color); }
        #random-btn { background-color: var(--helper-danger-color); }
        #unlock-message { font-weight: bold; color: black; font-size: 0.75rem; text-align: center; }
        .switch-container { display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; }
        .switch { position: relative; display: inline-block; width: 3rem; height: 1.5rem; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 1.5rem; }
        .slider:before { position: absolute; content: ""; height: 1.1rem; width: 1.1rem; left: 0.2rem; bottom: 0.2rem; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--helper-primary-color); }
        input:checked + .slider:before { transform: translateX(1.5rem); }
        #helper-log-container { border-top: 1px solid #eee; padding: 0.5rem 1rem; margin-top: 0.5rem; }
        #helper-log-container h4 { margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #555; }
        #helper-log-list { list-style: none; padding: 0; margin: 0; max-height: 100px; overflow-y: auto; font-size: 0.85rem; }
        #helper-log-list li { margin-bottom: 0.3rem; word-wrap: break-word; }
        #helper-log-list li.error { color: var(--helper-danger-color); font-weight: bold; }
    `);

    // --- 3. 创建悬浮窗 ---
    let ui = {};
    function createUI() {
        if (document.getElementById('helper-container')) return;
        const container = document.createElement('div');
        container.id = 'helper-container';
        document.body.appendChild(container);
        container.innerHTML = `
            <div id="helper-ball-icon">✈️</div>
            <div class="helper-content">
                <div id="helper-header"><span>大师级注册助手</span><span id="minimize-btn">&times;</span></div>
                <div id="helper-body">
                    <input type="text" id="email-input" placeholder="邮箱">
                    <input type="text" id="password-input" placeholder="密码">
                    <small id="unlock-message"></small>
                    <div class="button-group">
                        <button id="lock-btn"></button>
                        <button id="random-btn">随机生成</button>
                    </div>
                    <button id="start-stop-btn" style="grid-column: 1 / -1;">开始运行</button>
                    <div class="switch-container">
                        <span>自动填充</span>
                        <label class="switch"><input type="checkbox" id="autofill-toggle"><span class="slider"></span></label>
                    </div>
                    <div class="switch-container">
                        <span>自动注册/登录</span>
                        <label class="switch"><input type="checkbox" id="autoregister-toggle"><span class="slider"></span></label>
                    </div>
                </div>
                <div id="helper-log-container">
                    <h4>运行日志:</h4>
                    <ul id="helper-log-list"></ul>
                </div>
            </div>
        `;

        // --- 4. 获取UI元素 ---
        ui = {
            container,
            emailInput: document.getElementById('email-input'),
            passwordInput: document.getElementById('password-input'),
            lockBtn: document.getElementById('lock-btn'),
            unlockMsg: document.getElementById('unlock-message'),
            randomBtn: document.getElementById('random-btn'),
            startStopBtn: document.getElementById('start-stop-btn'),
            minimizeBtn: document.getElementById('minimize-btn'),
            autofillToggle: document.getElementById('autofill-toggle'),
            autoregisterToggle: document.getElementById('autoregister-toggle'),
            logList: document.getElementById('helper-log-list')
        };

        initializeUI();
        bindUIEvents();
    }

    // --- 5. 核心功能逻辑 ---
    const log = {
        add: (message, status = 'pending') => {
            if (!ui.logList) return;
            const li = document.createElement('li');
            const icon = status === 'pending' ? '⏳' : (status === 'success' ? '✅' : '❌');
            li.innerHTML = `${icon} ${message}`;
            if (status === 'error') li.classList.add('error');
            ui.logList.appendChild(li);
            ui.logList.scrollTop = ui.logList.scrollHeight;
            return li;
        },
        clear: () => { if (ui.logList) ui.logList.innerHTML = ''; }
    };

    function simulateHumanInput(element, value) {
        element.focus();
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
    }

    function updateLockUI() {
        const isLocked = config.isLocked;
        ui.lockBtn.textContent = isLocked ? '解锁' : '锁定';
        ui.emailInput.disabled = isLocked;
        ui.passwordInput.disabled = isLocked;
        ui.unlockMsg.textContent = isLocked ? `已锁定` : '';
    }

    function fillForms(forceOverwrite = false, email = config.email, password = config.password) {
        if (!isScriptRunning || (!config.autoFillEnabled && !forceOverwrite)) return;
        const logItem = log.add('正在填充表单...');
        document.querySelectorAll('input[type="email"], input[name*="email"], input[placeholder*="邮箱"]').forEach(field => {
            if (forceOverwrite || !field.value) simulateHumanInput(field, email);
        });
        document.querySelectorAll('input[type="password"], input[name*="password"], input[placeholder*="密码"]').forEach(field => {
            if (forceOverwrite || !field.value) simulateHumanInput(field, password);
        });
        document.querySelectorAll('input[name*="confirm"], input[placeholder*="确认密码"]').forEach(field => {
            if (forceOverwrite || !field.value) simulateHumanInput(field, password);
        });
        logItem.innerHTML = `✅ 表单填充完毕`;
    }

    // [核心修改] 优化随机生成函数
    function randomizeAndFill() {
        log.clear();
        const logItem = log.add('正在生成随机凭据...');
        const randomEmail = 'user' + Date.now().toString().slice(-6) + '@' + (['gmail.com', 'qq.com', 'outlook.com'][Math.floor(Math.random() * 3)]);
        const randomPassword = Math.random().toString(36).substring(2, 12);

        // 1. 更新内部状态和UI面板
        ui.emailInput.value = randomEmail;
        ui.passwordInput.value = randomPassword;
        config.email = randomEmail;
        config.password = randomPassword;
        GM_setValue('savedEmail', config.email);
        GM_setValue('savedPassword', config.password);
        logItem.innerHTML = `✅ 随机凭据已生成`;

        // 2. 无论脚本是否运行，都强制填充页面表单
        log.add('正在强制填充表单...');
        document.querySelectorAll('input[type="email"], input[name*="email"], input[placeholder*="邮箱"]').forEach(field => simulateHumanInput(field, randomEmail));
        document.querySelectorAll('input[type="password"], input[name*="password"], input[placeholder*="密码"]').forEach(field => simulateHumanInput(field, randomPassword));
        document.querySelectorAll('input[name*="confirm"], input[placeholder*="确认密码"]').forEach(field => simulateHumanInput(field, randomPassword));
        log.add('✅ 表单填充完毕');

        // 3. 如果脚本当前处于“运行”状态，则立即触发后续的点击逻辑
        if (isScriptRunning) {
            log.add('脚本运行中，继续执行点击操作...');
            setTimeout(runPageLogic, 500); // 调用主逻辑函数来确保情景判断正确
        }
    }

    function prepareNextCredentials() {
        log.add('🚀 为下次注册准备新账号...');
        const randomEmail = 'user' + Date.now().toString().slice(-6) + '@' + (['gmail.com', 'qq.com', 'outlook.com'][Math.floor(Math.random() * 3)]);
        const randomPassword = Math.random().toString(36).substring(2, 12);
        config.email = randomEmail;
        config.password = randomPassword;
        ui.emailInput.value = randomEmail;
        ui.passwordInput.value = randomPassword;
        GM_setValue('savedEmail', config.email);
        GM_setValue('savedPassword', config.password);
        log.add('✅ 新账号已生成并可用于下次任务。', 'success');
    }

    function isEmailVerificationRequired() {
        const codeInputKeywords = ['验证码', 'verification code', 'email code', '邮箱验证码'];
        const sendButtonKeywords = ['发送', '获取', 'send', 'get code'];
        const hasCodeInput = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]')).some(el => codeInputKeywords.some(k => (el.placeholder || el.name || "").toLowerCase().includes(k)));
        const hasSendButton = Array.from(document.querySelectorAll('button, a, span')).some(el => el.offsetParent !== null && sendButtonKeywords.some(k => (el.textContent || "").toLowerCase().trim().includes(k)));
        return hasCodeInput && hasSendButton;
    }

    function attemptAutoClickCaptcha() {
        if (!isScriptRunning) return;
        const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
        if (iframe) {
            log.add('✅ 检测到Cloudflare验证，尝试点击...');
            iframe.click();
        }
    }

    function findAndClickButton(keywords) {
        if (!isScriptRunning) return;
        attemptAutoClickCaptcha();
        if (isEmailVerificationRequired()) {
            log.add('检测到邮箱验证步骤，请手动操作', 'error');
            return;
        }
        const logItem = log.add(`正在查找按钮 (${keywords.join('/')})...`);
        for (const keyword of keywords) {
            const btn = Array.from(document.querySelectorAll('button, input[type="submit"], a')).find(el => (el.textContent || el.value || "").trim().toLowerCase().includes(keyword.toLowerCase()) && el.offsetParent !== null);
            if (btn) {
                logItem.innerHTML = `✅ 找到按钮: "${keyword}"，准备点击...`;
                sessionStorage.setItem('lastRegisteredEmail', config.email);
                sessionStorage.setItem('lastRegisteredPassword', config.password);
                btn.click();
                return;
            }
        }
        log.add(`未找到合适的按钮 (${keywords.join('/')})`, 'error');
    }

    // --- 6. 智能重试机制 ---
    let isRetrying = false;
    const MAX_RETRIES = 3;
    let retryCount = 0;

    function handleRegistrationErrorAndRetry() {
        if (!isScriptRunning || isRetrying || retryCount >= MAX_RETRIES) {
            if (retryCount >= MAX_RETRIES) log.add(`❌ 已达最大重试次数 (${MAX_RETRIES})，请手动操作。`, 'error');
            return;
        }
        isRetrying = true;
        retryCount++;
        log.add(`❌ 邮箱已存在，第 ${retryCount} 次自动重试...`, 'error');
        const newEmail = 'user' + Date.now().toString().slice(-6) + '@' + (['gmail.com', 'qq.com', 'outlook.com'][Math.floor(Math.random() * 3)]);
        const newPassword = Math.random().toString(36).substring(2, 12);
        config.email = newEmail;
        config.password = newPassword;
        ui.emailInput.value = newEmail;
        ui.passwordInput.value = newPassword;
        GM_setValue('savedEmail', newEmail);
        GM_setValue('savedPassword', newPassword);
        log.add('✅ 已生成新账号，准备重新提交...');
        fillForms(true, newEmail, newPassword);
        const registerKeywords = ['注册', 'Register', 'Sign Up', '创建', 'Create', '下一步', 'Submit'];
        setTimeout(() => {
            findAndClickButton(registerKeywords);
            setTimeout(() => { isRetrying = false; }, 1500);
        }, 1000);
    }

    // --- 7. 网络请求监控 ---
    function setupNetworkListener() {
        const errorKeywords = ['邮箱已被注册', '邮箱已存在', '已被使用', 'email has already been taken', 'user already exists', 'email already exists'];
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            return originalFetch.apply(this, args).then(response => {
                response.clone().text().then(text => {
                    if (errorKeywords.some(k => text.toLowerCase().includes(k))) {
                        handleRegistrationErrorAndRetry();
                    }
                }).catch(()=>{});
                return response;
            });
        };
        const originalXhrSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                if (errorKeywords.some(k => (this.responseText || "").toLowerCase().includes(k))) {
                    handleRegistrationErrorAndRetry();
                }
            }, { once: true });
            return originalXhrSend.apply(this, args);
        };
    }

    // --- 8. 事件绑定 ---
    function bindUIEvents() {
        ui.lockBtn.addEventListener('click', () => {
            config.isLocked = !config.isLocked;
            GM_setValue('isLocked', config.isLocked);
            updateLockUI();
        });
        ui.randomBtn.addEventListener('click', randomizeAndFill);
        ui.startStopBtn.addEventListener('click', () => {
            isScriptRunning = !isScriptRunning;
            updateStartStopButtonUI();
            if (isScriptRunning) {
                runPageLogic();
            } else {
                log.add('✅ 脚本已手动停止，等待指令...', 'success');
            }
        });
        ui.autofillToggle.addEventListener('change', () => { config.autoFillEnabled = ui.autofillToggle.checked; GM_setValue('autoFillEnabled', config.autoFillEnabled); });
        ui.autoregisterToggle.addEventListener('change', () => { config.autoRegisterEnabled = ui.autoregisterToggle.checked; GM_setValue('autoRegisterEnabled', config.autoRegisterEnabled); });
        ui.minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ui.container.classList.add('minimized');
            GM_setValue('isMinimized', true);
        });
        ui.container.addEventListener('click', () => {
            if (ui.container.classList.contains('minimized')) {
                ui.container.classList.remove('minimized');
                GM_setValue('isMinimized', false);
            }
        });
        let isDragging = false, offsetX, offsetY;
        const header = document.getElementById('helper-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target.id === 'minimize-btn') return;
            isDragging = true;
            offsetX = e.clientX - ui.container.offsetLeft;
            offsetY = e.clientY - ui.container.offsetTop;
            ui.container.style.transition = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            ui.container.style.left = `${e.clientX - offsetX}px`;
            ui.container.style.top = `${e.clientY - offsetY}px`;
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
            ui.container.style.transition = 'all 0.3s ease-in-out';
        });
    }

    // --- 9. 初始执行与情景感知 ---
    function isUserLoggedIn() {
        const loggedInUrlKeywords = ['dashboard', 'user', 'client', 'node'];
        const loggedInTextKeywords = ['仪表盘', '用户中心', '我的账户', 'my account', '退出', 'logout', 'sign out'];
        const currentUrl = window.location.href.toLowerCase();
        if (loggedInUrlKeywords.some(keyword => currentUrl.includes(keyword))) return true;
        const pageText = (document.body.innerText || "").toLowerCase();
        if (loggedInTextKeywords.some(keyword => pageText.includes(keyword))) return true;
        return false;
    }

    function runPageLogic() {
        if (!isScriptRunning) return;
        log.clear();
        log.add('脚本运行中，正在分析场景...');
        retryCount = 0;

        if (isUserLoggedIn()) {
            log.add('✅ 已成功登录，脚本自动暂停。', 'success');
            prepareNextCredentials();
            isScriptRunning = false;
            updateStartStopButtonUI();
            return;
        }

        const lastEmail = sessionStorage.getItem('lastRegisteredEmail');
        const lastPassword = sessionStorage.getItem('lastRegisteredPassword');
        const loginKeywords = ['登录', 'Login', 'Sign In', '登入'];
        const registerKeywords = ['注册', 'Register', 'Sign Up', '创建', 'Create', '下一步', 'Submit'];
        const isLikelyRegisterPage = window.location.href.includes('register') || window.location.href.includes('signup') || document.title.includes('注册') || document.querySelector('input[name*="confirm"], input[placeholder*="确认密码"]');
        const isLikelyLoginPage = window.location.href.includes('login') || document.title.includes('登录') || (document.querySelector('input[type="password"]') && !isLikelyRegisterPage);

        if (lastEmail && lastPassword && isLikelyLoginPage) {
            log.add('检测到注册后跳转，执行登录衔接流程...', 'success');
            fillForms(true, lastEmail, lastPassword);
            sessionStorage.removeItem('lastRegisteredEmail');
            sessionStorage.removeItem('lastRegisteredPassword');
            if (config.autoRegisterEnabled) {
                log.add('准备自动点击登录按钮...');
                setTimeout(() => findAndClickButton(loginKeywords), 500);
            }
            return;
        }

        if (config.autoRegisterEnabled) {
            log.add('自动注册/登录模式已开启');
            fillForms(true);
            if (isLikelyRegisterPage) {
                log.add('识别为注册页，准备点击注册按钮...');
                setTimeout(() => findAndClickButton(registerKeywords), 1000);
            } else if (isLikelyLoginPage) {
                log.add('识别为登录页，准备点击登录按钮...');
                setTimeout(() => findAndClickButton(loginKeywords), 1000);
            } else {
                log.add('无法明确页面类型，将尝试查找通用按钮...', 'warning');
                setTimeout(() => findAndClickButton([...registerKeywords, ...loginKeywords]), 1000);
            }
        } else if (config.autoFillEnabled) {
            log.add('自动填充模式已开启');
            fillForms(false);
        } else {
            log.add('所有自动功能已关闭', 'success');
        }
    }

    function updateStartStopButtonUI() {
        if (isScriptRunning) {
            ui.startStopBtn.textContent = '停止运行';
            ui.startStopBtn.style.backgroundColor = 'var(--helper-danger-color)';
        } else {
            ui.startStopBtn.textContent = '开始运行';
            ui.startStopBtn.style.backgroundColor = 'var(--helper-success-color)';
        }
    }

    function initializeUI() {
        ui.emailInput.value = config.email;
        ui.passwordInput.value = config.password;
        ui.autofillToggle.checked = config.autoFillEnabled;
        ui.autoregisterToggle.checked = config.autoRegisterEnabled;
        if (config.isMinimized) ui.container.classList.add('minimized');
        updateLockUI();
        updateStartStopButtonUI();
        log.add('✅ 脚本已就绪，请点击"开始运行"。', 'success');
    }

    // --- 启动器 ---
    setupNetworkListener();

    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (isScriptRunning) {
                setTimeout(runPageLogic, 500);
            }
        }
    });

    const bodyObserver = new MutationObserver((mutations, obs) => {
        if (document.body) {
            createUI();
            observer.observe(document.body, { childList: true, subtree: true });
            obs.disconnect();
        }
    });
    bodyObserver.observe(document.documentElement, { childList: true });

})();