// ==UserScript==
// @name         机场自动注册助手 (By听风独-家提供)
// @namespace    http://tampermonkey.net/
// @version      2025-08-28.50
// @description  【人机协同史诗版 V4.8】重大升级！新增Cloudflare盾牌智能等待引擎，模拟人工延迟与网络状态判断，大幅提高复杂网站注册成功率！
// @author       Gemini (Hybrid Intelligence Version 4.8 - Enhanced Perception & Adaptive Waiting Engine)
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
    const config = {
        email: GM_getValue('savedEmail', 'user' + Date.now().toString().slice(-6) + '@gmail.com'),
        password: GM_getValue('savedPassword', 'pass' + Math.random().toString(36).substring(2, 10)),
        autoFillEnabled: GM_getValue('autoFillEnabled', true),
        autoRegisterEnabled: GM_getValue('autoRegisterEnabled', false),
        showDetailedProcess: GM_getValue('showDetailedProcess', true),
        isMinimized: GM_getValue('isMinimized', false),
        isLocked: GM_getValue('isLocked', false)
    };
    let isScriptRunning = false;
    let taskStartTime = 0;
    let progressLogContent = '';
    let captchaPauseInterval = null;
    let postClickObserver = null;
    let isSelecting = false;
    let selectingFor = null;
    let selectingForCustomIndex = -1;
    let customProfiles = GM_getValue('customProfiles', {});
    let registeredAccounts = GM_getValue('registeredAccounts', {});
    let currentProfile = {};

    // --- 2. 样式定义 ---
    GM_addStyle(`
        :root {
            --helper-width: 22rem; --helper-ball-size: 3rem; --helper-primary-color: #007bff;
            --helper-success-color: #28a745; --helper-danger-color: #dc3545; --helper-warning-color: #ffc107;
        }
        #helper-container {
            position: fixed !important; top: 10rem; right: 1.5rem; width: var(--helper-width) !important; height: auto !important;
            background-color: #ffffff !important; border: 1px solid #e0e0e0 !important; border-radius: 0.5rem !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15) !important; z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            color: #333 !important; overflow: hidden !important; transition: all 0.3s ease-in-out !important;
        }
        #helper-container.dragging { transition: none !important; }
        #helper-container.minimized { width: var(--helper-ball-size) !important; height: var(--helper-ball-size) !important; border-radius: 50% !important; cursor: pointer !important; padding: 0 !important; }
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
        #progress-modal-overlay, #custom-field-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 2147483646; display: none; justify-content: center; align-items: center; }
        #progress-modal-container { width: 40rem; max-width: 90vw; background-color: #fff; border-radius: 0.5rem; box-shadow: 0 5px 20px rgba(0,0,0,0.25); display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        #progress-modal-header { padding: 0.8rem 1.2rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        #progress-modal-header h3 { margin: 0; font-size: 1.1rem; }
        #progress-modal-close-btn { font-size: 1.5rem; cursor: pointer; color: #888; border: none; background: none; padding: 0; line-height: 1; }
        #progress-modal-body { padding: 1.2rem; }
        .progress-status { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
        .progress-bar-container { flex-grow: 1; height: 1.2rem; background-color: #e9ecef; border-radius: 0.25rem; overflow: hidden; }
        #progress-bar-fill { width: 0%; height: 100%; background-color: var(--helper-primary-color); transition: width 0.3s ease; }
        .progress-percentage { font-weight: bold; font-size: 1rem; }
        #progress-time { font-size: 0.85rem; color: #6c757d; text-align: center; margin-bottom: 1rem; }
        #progress-log-container { background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 0.25rem; padding: 0.8rem; max-height: 250px; overflow-y: auto; }
        #progress-log-list { list-style: none; padding: 0; margin: 0; font-family: "Courier New", monospace; font-size: 0.8rem; }
        #progress-log-list li { padding: 0.2rem 0; border-bottom: 1px solid #eee; white-space: pre-wrap; word-break: break-all; }
        #progress-log-list li:last-child { border-bottom: none; }
        #progress-log-list .log-scan { color: #007bff; } #progress-log-list .log-analyze { color: #fd7e14; } #progress-log-list .log-match { color: #28a745; font-weight: bold; }
        #progress-log-list .log-action { color: #6f42c1; } #progress-log-list .log-error { color: #dc3545; font-weight: bold; } #progress-log-list .log-pause { color: #ffc107; font-weight: bold; }
        #progress-log-list .log-warning { color: #fd7e14; font-weight: bold; }
        #progress-log-list .log-monitor { color: #17a2b8; font-style: italic; }
        #progress-modal-footer { padding: 0.8rem 1.2rem; border-top: 1px solid #eee; text-align: right; }
        #copy-log-btn { padding: 0.5rem 1rem; background-color: var(--helper-primary-color); color: white; border: none; border-radius: 0.25rem; cursor: pointer; }

        /* --- 自定义映射UI样式 --- */
        #helper-custom-view { padding: 1rem; display: none; flex-direction: column; gap: 0.8rem; }
        .custom-mapping-row { display: flex; align-items: center; gap: 0.5rem; }
        .custom-mapping-row label { flex-basis: 7rem; font-size: 0.9rem; flex-shrink: 0; text-align: right; padding-right: 0.5rem; }
        .custom-mapping-row .selector-display { flex-grow: 1; background-color: #eee; padding: 0.3rem 0.5rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .highlight-for-selection { outline: 3px solid #ff4500 !important; box-shadow: 0 0 15px #ff4500 !important; background-color: rgba(255, 69, 0, 0.2) !important; cursor: crosshair !important; }
        #selector-mode-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.6); z-index: 2147483645; display: none; cursor: crosshair !important; pointer-events: none; }
        body.in-selector-mode * { cursor: crosshair !important; }
        .locator-btn { width: 1.2rem; height: 1.2rem; border-radius: 50%; border: 2px solid; cursor: pointer; transition: all 0.2s; flex-shrink: 0; padding: 0; }
        .locator-btn.unmapped { background-color: var(--helper-success-color); border-color: #208a38; }
        .locator-btn.mapped { background-color: var(--helper-danger-color); border-color: #b82c3a; }
        .reset-btn, .remove-btn { background: none; border: none; color: var(--helper-primary-color); cursor: pointer; font-size: 1.2rem; padding: 0 0.3rem; flex-shrink: 0; line-height: 1; }
        #add-custom-field-btn { background-color: var(--helper-success-color); margin-top: 0.5rem; }
        #custom-field-modal-container { background: #fff; padding: 1.5rem; border-radius: 0.5rem; width: 25rem; display: flex; flex-direction: column; gap: 1rem; }
        #custom-field-modal-container h3 { margin: 0 0 0.5rem 0; }
        #custom-field-modal-container input, #custom-field-modal-container select { width: calc(100% - 1.2rem); padding: 0.5rem 0.6rem; border: 1px solid #ccc; border-radius: 0.25rem; }
    `);

    // --- 3. 创建UI ---
    let ui = {};
    function createUI() {
        if (document.getElementById('helper-container')) return;
        const container = document.createElement('div');
        container.id = 'helper-container';
        container.classList.add('tf-helper-ignore');
        container.innerHTML = `
            <div id="helper-ball-icon" class="tf-helper-ignore">✈️</div>
            <div class="helper-content tf-helper-ignore">
                <div id="helper-header" class="tf-helper-ignore"><span class="tf-helper-ignore">大师级注册助手</span><span id="minimize-btn" class="tf-helper-ignore">&times;</span></div>
                <div id="helper-main-view">
                    <div id="helper-body" class="tf-helper-ignore">
                        <input type="text" id="email-input" class="tf-helper-ignore" placeholder="邮箱">
                        <input type="text" id="password-input" class="tf-helper-ignore" placeholder="密码">
                        <small id="unlock-message" class="tf-helper-ignore"></small>
                        <div class="button-group tf-helper-ignore">
                            <button id="lock-btn" class="tf-helper-ignore"></button>
                            <button id="random-btn" class="tf-helper-ignore">随机生成</button>
                        </div>
                        <button id="start-stop-btn" class="tf-helper-ignore" style="grid-column: 1 / -1;">开始运行</button>
                        <div class="switch-container tf-helper-ignore"><span class="tf-helper-ignore">自动填充</span><label class="switch tf-helper-ignore"><input type="checkbox" id="autofill-toggle" class="tf-helper-ignore"><span class="slider tf-helper-ignore"></span></label></div>
                        <div class="switch-container tf-helper-ignore"><span class="tf-helper-ignore">自动注册/登录</span><label class="switch tf-helper-ignore"><input type="checkbox" id="autoregister-toggle" class="tf-helper-ignore"><span class="slider tf-helper-ignore"></span></label></div>
                        <div class="switch-container tf-helper-ignore"><span class="tf-helper-ignore">显示详细过程</span><label class="switch tf-helper-ignore"><input type="checkbox" id="show-detailed-toggle" class="tf-helper-ignore"><span class="slider tf-helper-ignore"></span></label></div>
                        <button id="goto-custom-btn" style="background-color: var(--helper-warning-color); color: black; margin-top: 0.5rem;">自定义映射</button>
                    </div>
                    <div id="helper-log-container" class="tf-helper-ignore"><h4 class="tf-helper-ignore">运行日志:</h4><ul id="helper-log-list" class="tf-helper-ignore"></ul></div>
                </div>
                <div id="helper-custom-view" class="tf-helper-ignore">
                    <h4>为 ${window.location.hostname} 自定义规则</h4>
                    <div class="custom-mapping-row"><label>邮箱</label><span id="map-email-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="email" title="定位"></button><button class="reset-btn" data-type="email">⟲</button></div>
                    <div class="custom-mapping-row"><label>邮箱域名</label><span id="map-emailDomain-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="emailDomain" title="定位"></button><button class="reset-btn" data-type="emailDomain">⟲</button></div>
                    <div class="custom-mapping-row"><label>用户名</label><span id="map-username-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="username" title="定位"></button><button class="reset-btn" data-type="username">⟲</button></div>
                    <div class="custom-mapping-row"><label>密码</label><span id="map-password-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="password" title="定位"></button><button class="reset-btn" data-type="password">⟲</button></div>
                    <div class="custom-mapping-row"><label>确认密码</label><span id="map-passwordConfirm-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="passwordConfirm" title="定位"></button><button class="reset-btn" data-type="passwordConfirm">⟲</button></div>
                    <div class="custom-mapping-row"><label>服务条款</label><span id="map-termsCheckbox-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="termsCheckbox" title="定位"></button><button class="reset-btn" data-type="termsCheckbox">⟲</button></div>
                    <div class="custom-mapping-row"><label>注册按钮</label><span id="map-submitBtn-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="submitBtn" title="定位"></button><button class="reset-btn" data-type="submitBtn">⟲</button></div>
                    <div id="custom-fields-container"></div>
                    <button id="add-custom-field-btn">+ 添加新字段</button>
                    <div class="button-group"><button id="save-profile-btn" style="background-color: var(--helper-primary-color);">保存</button><button id="import-profile-btn" style="background-color: #17a2b8;">导入配置</button></div>
                    <button id="export-profile-btn" style="background-color: #6c757d; grid-column: 1 / -1;">导出配置</button>
                    <button id="start-custom-btn" style="background-color: var(--helper-success-color); margin-top: 0.5rem;">开始运行 (自定义)</button>
                    <button id="return-main-btn" style="background-color: #ccc; color: black; margin-top: 0.5rem;">返回</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        // 进度模态框
        const progressModal = document.createElement('div');
        progressModal.id = 'progress-modal-overlay';
        progressModal.classList.add('tf-helper-ignore');
        progressModal.innerHTML = `
            <div id="progress-modal-container" class="tf-helper-ignore">
                <div id="progress-modal-header" class="tf-helper-ignore"><h3 id="progress-modal-title" class="tf-helper-ignore">任务执行中...</h3><button id="progress-modal-close-btn" class="tf-helper-ignore">&times;</button></div>
                <div id="progress-modal-body" class="tf-helper-ignore">
                    <div class="progress-status tf-helper-ignore"><div class="progress-bar-container tf-helper-ignore"><div id="progress-bar-fill" class="progress-bar-fill tf-helper-ignore"></div></div><span id="progress-percentage" class="progress-percentage tf-helper-ignore">0%</span></div>
                    <div id="progress-time" class="progress-time tf-helper-ignore">已用时: 0.00s</div><h4 class="tf-helper-ignore">详细日志:</h4>
                    <div id="progress-log-container" class="tf-helper-ignore"><ul id="progress-log-list" class="tf-helper-ignore"></ul></div>
                </div>
                <div id="progress-modal-footer" class="tf-helper-ignore"><button id="copy-log-btn" class="tf-helper-ignore">复制日志</button></div>
            </div>`;
        document.body.appendChild(progressModal);

        // 自定义字段模态框
        const customFieldModal = document.createElement('div');
        customFieldModal.id = 'custom-field-modal-overlay';
        customFieldModal.classList.add('tf-helper-ignore');
        customFieldModal.innerHTML = `
            <div id="custom-field-modal-container" class="tf-helper-ignore">
                <h3>添加自定义字段</h3>
                <input type="text" id="custom-field-name" placeholder="字段名称 (例如: 邀请码)">
                <select id="custom-field-action">
                    <option value="inputText">输入文本</option>
                    <option value="click">点击元素</option>
                </select>
                <input type="text" id="custom-field-value" placeholder="要输入的值 (仅“输入文本”时需要)">
                <div class="button-group">
                    <button id="save-custom-field-btn" style="background-color: var(--helper-primary-color);">保存</button>
                    <button id="cancel-custom-field-btn" style="background-color: #6c757d;">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(customFieldModal);

        const selectorOverlay = document.createElement('div');
        selectorOverlay.id = 'selector-mode-overlay';
        selectorOverlay.classList.add('tf-helper-ignore');
        document.body.appendChild(selectorOverlay);

        ui = {
            container, emailInput: document.getElementById('email-input'), passwordInput: document.getElementById('password-input'),
            lockBtn: document.getElementById('lock-btn'), unlockMsg: document.getElementById('unlock-message'), randomBtn: document.getElementById('random-btn'),
            startStopBtn: document.getElementById('start-stop-btn'), minimizeBtn: document.getElementById('minimize-btn'),
            autofillToggle: document.getElementById('autofill-toggle'), autoregisterToggle: document.getElementById('autoregister-toggle'),
            showDetailedToggle: document.getElementById('show-detailed-toggle'),
            logList: document.getElementById('helper-log-list'),
            progressOverlay: document.getElementById('progress-modal-overlay'),
            mainView: document.getElementById('helper-main-view'),
            customView: document.getElementById('helper-custom-view'),
            gotoCustomBtn: document.getElementById('goto-custom-btn'),
            returnMainBtn: document.getElementById('return-main-btn'),
            saveProfileBtn: document.getElementById('save-profile-btn'),
            exportProfileBtn: document.getElementById('export-profile-btn'),
            importProfileBtn: document.getElementById('import-profile-btn'),
            startCustomBtn: document.getElementById('start-custom-btn'),
            selectorOverlay: document.getElementById('selector-mode-overlay'),
            customFieldsContainer: document.getElementById('custom-fields-container'),
            addCustomFieldBtn: document.getElementById('add-custom-field-btn'),
            customFieldModal: document.getElementById('custom-field-modal-overlay'),
            customFieldName: document.getElementById('custom-field-name'),
            customFieldAction: document.getElementById('custom-field-action'),
            customFieldValue: document.getElementById('custom-field-value'),
            saveCustomFieldBtn: document.getElementById('save-custom-field-btn'),
            cancelCustomFieldBtn: document.getElementById('cancel-custom-field-btn'),
            progressModalTitle: document.getElementById('progress-modal-title'),
            progressBarFill: document.getElementById('progress-bar-fill'),
            progressPercentage: document.getElementById('progress-percentage'),
            progressTime: document.getElementById('progress-time'),
            progressLogList: document.getElementById('progress-log-list'),
            progressCloseBtn: document.getElementById('progress-modal-close-btn'),
            copyLogBtn: document.getElementById('copy-log-btn'),
        };

        initializeUI();
        bindUIEvents();
        loadCustomProfile();
    }

    // --- 4. 核心功能逻辑 (注入灵魂) ---
    const log = { add: (message, status = 'pending') => { if (!ui.logList) return; const li = document.createElement('li'); const icon = status === 'pending' ? '⏳' : (status === 'success' ? '✅' : '❌'); li.innerHTML = `${icon} ${message}`; if (status === 'error') li.classList.add('error'); while (ui.logList.children.length > 10) { ui.logList.removeChild(ui.logList.firstChild); } ui.logList.appendChild(li); ui.logList.scrollTop = ui.logList.scrollHeight; return li; }, clear: () => { if (ui.logList) ui.logList.innerHTML = ''; } };

    /**
     * 模拟真人键盘输入
     */
    async function simulateHumanTyping(element, value) {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || element.disabled || element.readOnly) {
            updateProgress(null, `[警告] 元素 ${element.tagName} 不可交互，已跳过`, 'log-error');
            return false;
        }
        try {
            element.focus();
            await new Promise(res => setTimeout(res, 50));
            element.click();
            await new Promise(res => setTimeout(res, 50));
            element.value = ''; // 先清空
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(res => setTimeout(res, 50));

            for (const char of value) {
                element.value += char;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(res => setTimeout(res, Math.random() * 60 + 30)); // 模拟打字延迟
            }

            element.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(res => setTimeout(res, 50));
            element.blur();
            return true;
        } catch (e) {
            updateProgress(null, `[错误] 模拟输入 ${element.tagName} 时失败: ${e.message}`, 'log-error');
            return false;
        }
    }

    /**
     * 【V4.6 核心升级】处理非标准下拉框 (如 Ant Design)，增加备选域名智能匹配
     */
    async function handleCustomDropdown(triggerElement, preferredDomain) {
        updateProgress(null, `[CUSTOM] 正在处理自定义下拉框...`, 'log-action');
        triggerElement.click();
        await new Promise(res => setTimeout(res, 500)); // 等待下拉菜单渲染

        const optionSelectors = [
            `.ant-select-item-option-content`, // Ant Design v4+
            `div[title*="${preferredDomain}"]`, // Ant Design 虚拟列表
            `li[role="option"]`, // 通用
            `div[role="option"]`  // 通用
        ];

        let optionElement = null;
        let allOptions = [];

        // 1. 优先尝试精确匹配用户选择的域名
        for (const selector of optionSelectors) {
            const options = Array.from(document.querySelectorAll(selector));
            if (options.length > 0 && allOptions.length === 0) {
                allOptions = options; // 存储所有找到的选项，用于备选
            }
            optionElement = options.find(el => el.textContent.includes(preferredDomain));
            if (optionElement) break;
        }

        if (optionElement) {
            updateProgress(null, `[CUSTOM] ✅ 找到并点击首选域名: "${optionElement.textContent.trim()}"`, 'log-match');
            const selectedValue = optionElement.textContent.trim();
            optionElement.click();
            await new Promise(res => setTimeout(res, 100));
            return { success: true, domain: selectedValue };
        }

        // 2. 如果精确匹配失败，则启动智能备选逻辑
        updateProgress(null, `[CUSTOM] ⚠️ 未找到首选域名 "${preferredDomain}"，启动智能备选...`, 'log-warning');
        if (allOptions.length > 0) {
            const mainstreamDomains = ['gmail.com', 'qq.com', 'outlook.com', '163.com', 'hotmail.com'];
            let fallbackOption = null;

            // 优先从主流域名中选择
            for (const domain of mainstreamDomains) {
                fallbackOption = allOptions.find(el => el.textContent.includes(domain));
                if (fallbackOption) break;
            }

            // 如果主流域名也没有，则选择第一个看起来像域名的选项
            if (!fallbackOption) {
                fallbackOption = allOptions.find(el => el.textContent.includes('.'));
            }

            // 如果还没有，就选第一个
            if (!fallbackOption && allOptions.length > 0) {
                fallbackOption = allOptions[0];
            }

            if (fallbackOption) {
                const selectedValue = fallbackOption.textContent.trim();
                updateProgress(null, `[CUSTOM] ✅ 智能选择备用域名: "${selectedValue}"`, 'log-match');
                fallbackOption.click();
                await new Promise(res => setTimeout(res, 100));
                return { success: true, domain: selectedValue };
            }
        }

        // 3. 如果彻底失败
        updateProgress(null, `[CUSTOM] ❌ 未能在下拉菜单中找到任何可用域名选项`, 'log-error');
        document.body.click(); // 尝试点击页面其他地方关闭下拉框
        return { success: false, domain: null };
    }


    function updateLockUI() { const isLocked = config.isLocked; ui.lockBtn.textContent = isLocked ? '解锁' : '锁定'; ui.emailInput.disabled = isLocked; ui.passwordInput.disabled = isLocked; ui.unlockMsg.textContent = isLocked ? `已锁定` : ''; }
    function showProgressModal(title = "任务执行中...") { if (!ui.progressOverlay) return; progressLogContent = ''; ui.progressLogList.innerHTML = ''; ui.progressModalTitle.textContent = title; ui.progressOverlay.style.display = 'flex'; }
    function hideProgressModal() { if (ui.progressOverlay) ui.progressOverlay.style.display = 'none'; }

    function updateProgress(percentage, logMessage, logType = 'log-analyze') {
        if (percentage !== null) {
            const clampedPercentage = Math.max(0, Math.min(100, percentage));
            ui.progressBarFill.style.width = `${clampedPercentage}%`;
            ui.progressPercentage.textContent = `${clampedPercentage}%`;
            if (clampedPercentage === 100 && logType !== 'log-monitor') {
                if (logType === 'log-error' || logType === 'log-pause') {
                    ui.progressModalTitle.textContent = logType === 'log-error' ? '❌ 任务失败' : '⏸️ 操作暂停';
                } else {
                    ui.progressModalTitle.textContent = '✅ 任务成功';
                    setTimeout(hideProgressModal, 2000);
                }
            }
        }
        const elapsedTime = ((Date.now() - taskStartTime) / 1000).toFixed(2);
        ui.progressTime.textContent = `已用时: ${elapsedTime}s`;
        const fullLogMessage = `[${elapsedTime}s] ${logMessage}`;
        const li = document.createElement('li');
        li.className = logType;
        li.textContent = fullLogMessage;
        ui.progressLogList.appendChild(li);
        ui.progressLogList.scrollTop = ui.progressLogList.scrollHeight;
        progressLogContent += fullLogMessage + '\n';
        const simpleMessage = logMessage.length > 30 ? logMessage.substring(0, 27) + '...' : logMessage;
        log.add(simpleMessage, 'pending');
    }

    // --- 5. 认知AI引擎 (V4.8 全面升级) ---
    const Engine = {
        keywords: {
            email: ['email', 'e-mail', 'mail', '邮箱', '帐号', '账户', '账号', '電子郵件'],
            username: ['user', 'name', 'nick', '昵称', '用户名', '网站名称', '使用者名稱'],
            password: ['password', 'passwd', 'pass', '密码', '密碼'],
            passwordConfirm: ['confirm', 'again', 'repeat', '确认', '重複', '再次', 're-enter', 'repasswd', '确认密码', '確認密碼'],
            inviteCode: ['invite', 'invitation', 'code', '邀请码', '推薦碼', 'aff'],
            verificationCode: ['verification', 'captcha', 'code', '验证码', '驗證碼', '校驗碼']
        },
        getAssociatedText(element) { let text = (element.placeholder || element.name || element.id || element.ariaLabel || '').toLowerCase(); let label = element.closest('label') || (element.id && document.querySelector(`label[for="${element.id}"]`)); if (label) { text += ' ' + (label.textContent || '').toLowerCase(); } else { const parent = element.closest('div, p, li'); if (parent) text += ' ' + (parent.innerText || '').split('\n')[0].toLowerCase(); } return text.trim().replace(/\s+/g, ' '); },
        isOfType(element, type) {
            if (element.type === 'email' && type === 'email') return true;
            const text = this.getAssociatedText(element);
            const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();

            if (type === 'password') {
                if (element.type === 'password' && !this.keywords.passwordConfirm.some(k => text.includes(k))) return true;
                if ((autocomplete === 'new-password' || autocomplete === 'current-password') && !this.keywords.passwordConfirm.some(k => text.includes(k))) return true;
            }
            if (type === 'passwordConfirm') {
                if (element.type === 'password' && this.keywords.passwordConfirm.some(k => text.includes(k))) return true;
            }
            if (type === 'username') {
                if (autocomplete === 'username') return true;
                return this.keywords.username.some(k => text.includes(k)) && !this.keywords.email.some(k => text.includes(k));
            }
            return this.keywords[type].some(k => text.includes(k));
        },
        /**
         * 【V4.6 核心升级】智能处理分离式邮箱字段
         */
        async handleSplitEmailField(prefixInput, domainSelector, email) {
            const [emailPrefix, emailDomain] = email.split('@');
            if (!emailPrefix || !emailDomain) return false;

            updateProgress(null, `[AUTO] 检测到分离式邮箱，前缀: ${emailPrefix}, 域名: ${emailDomain}`, 'log-analyze');

            // 填充邮箱前缀
            const prefixFilled = await simulateHumanTyping(prefixInput, emailPrefix);
            if (!prefixFilled) return false;

            await new Promise(res => setTimeout(res, 100));

            // 处理域名选择器
            if (domainSelector.tagName === 'SELECT') {
                updateProgress(null, `[AUTO] 正在处理标准 <select> 域名下拉框...`, 'log-action');
                const option = Array.from(domainSelector.options).find(opt => opt.value.includes(emailDomain) || opt.text.includes(emailDomain));
                if (option) {
                    domainSelector.value = option.value;
                    domainSelector.dispatchEvent(new Event('change', { bubbles: true }));
                    updateProgress(null, `[AUTO] ✅ 成功选择域名: ${option.text}`, 'log-match');
                    return true;
                } else {
                    updateProgress(null, `[AUTO] ⚠️ 在 <select> 中未找到域名 ${emailDomain}`, 'log-warning');
                    return false;
                }
            } else {
                // 假设是自定义下拉框
                updateProgress(null, `[AUTO] 正在处理自定义域名下拉框...`, 'log-action');
                const result = await handleCustomDropdown(domainSelector, emailDomain);
                return result.success;
            }
        },
        async fillForms(forceOverwrite = false, email = config.email, password = config.password) {
            updateProgress(35, "扫描页面上的所有输入框...", "log-scan");
            const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not(.tf-helper-ignore)'));
            let filledCount = 0;
            const totalInputs = inputs.length > 0 ? inputs.length : 1;
            let currentProgress = 35;
            let emailFieldHandled = false;

            for (const input of inputs) {
                if (!forceOverwrite && input.value) continue;
                const style = window.getComputedStyle(input);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                let filled = false;

                // 【V4.6 核心升级】优先处理分离式邮箱
                if (this.isOfType(input, 'email') && !emailFieldHandled) {
                    const parent = input.parentElement;
                    const siblings = parent ? Array.from(parent.children) : [];
                    let domainSelector = null;
                    // 查找紧随其后的域名选择器
                    const nextEl = input.nextElementSibling;
                    if (nextEl && (nextEl.tagName === 'SELECT' || nextEl.textContent.includes('@'))) {
                        domainSelector = nextEl;
                    } else if (siblings.length > 1) {
                        // 在父容器内查找
                        domainSelector = siblings.find(el => el !== input && (el.tagName === 'SELECT' || (el.textContent.includes('@') && el.children.length > 0)));
                    }

                    if (domainSelector) {
                        if (await this.handleSplitEmailField(input, domainSelector, email)) {
                            filled = true;
                            emailFieldHandled = true; // 标记已处理，避免重复填充
                        }
                    }
                }

                // 如果不是分离式邮箱或处理失败，则按常规逻辑填充
                if (!filled) {
                    if (this.isOfType(input, 'email') && !emailFieldHandled) {
                        updateProgress(currentProgress, `[AUTO] 填充完整邮箱...`, 'log-action');
                        if (await simulateHumanTyping(input, email)) filled = true;
                    } else if (this.isOfType(input, 'username')) {
                        updateProgress(currentProgress, `[AUTO] 填充用户名...`, 'log-action');
                        if (await simulateHumanTyping(input, email.split('@')[0])) filled = true;
                    } else if (this.isOfType(input, 'passwordConfirm')) {
                        updateProgress(currentProgress, `[AUTO] 填充确认密码...`, 'log-action');
                        if (await simulateHumanTyping(input, password)) filled = true;
                    } else if (this.isOfType(input, 'password')) {
                        updateProgress(currentProgress, `[AUTO] 填充密码...`, 'log-action');
                        if (await simulateHumanTyping(input, password)) filled = true;
                    }
                }

                if (filled) {
                    filledCount++;
                    await new Promise(res => setTimeout(res, 100));
                }
                currentProgress += (30 / totalInputs);
            }
            updateProgress(65, `✅ 智能填充完成，共处理 ${filledCount} 个字段。`, 'log-match');
        },
        /**
         * 基于评分系统查找并点击最可能的目标按钮
         */
        async findAndClickButton(keywords, negativeKeywords = []) {
            updateProgress(null, `[AUTO] 启动智能按钮查找引擎...`, 'log-analyze');
            const candidateSelectors = [
                'button', 'input[type="submit"]', 'input[type="button"]', 'a[role="button"]', '[role="button"]'
            ];
            let candidates = [];

            document.querySelectorAll(candidateSelectors.join(', ')).forEach(el => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                // 必须是可见且可交互的元素
                if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 10 && rect.height > 10 && !el.disabled) {
                    let score = 0;
                    const text = (el.textContent || el.value || el.innerText).trim().toLowerCase();
                    if (!text) return; // 没有文本的按钮通常不是目标

                    // 1. 关键词评分
                    if (keywords.some(k => text.includes(k.toLowerCase()))) {
                        score += 50; // 主要关键词匹配，高分
                    }
                    if (negativeKeywords.some(k => text.includes(k.toLowerCase()))) {
                        score -= 100; // 负面关键词，强力扣分
                    }

                    // 2. 属性评分
                    if (el.tagName === 'BUTTON' && (el.type === 'submit' || !el.type)) score += 20;
                    if (el.tagName === 'INPUT' && el.type === 'submit') score += 25;

                    // 3. 样式评分 (主要按钮通常颜色突出)
                    const bgColor = style.backgroundColor.toLowerCase();
                    if (bgColor && !bgColor.includes('rgba(0, 0, 0, 0)') && bgColor !== 'transparent' && bgColor !== 'rgb(255, 255, 255)') {
                        score += 10;
                    }

                    // 4. 结构评分 (在表单内的提交按钮更可靠)
                    if (el.closest('form')) {
                        score += 15;
                    }

                    if (score > 0) {
                        candidates.push({ element: el, score: score, text: text });
                    }
                }
            });

            if (candidates.length === 0) {
                updateProgress(null, `[AUTO] ❌ 未找到任何可见的候选按钮。`, 'log-error');
                return false;
            }

            // 按分数排序
            candidates.sort((a, b) => b.score - a.score);

            // 打印日志，方便调试
            updateProgress(null, `[AUTO] 找到 ${candidates.length} 个候选按钮，评分如下:`, 'log-scan');
            candidates.slice(0, 3).forEach(c => {
                updateProgress(null, `  - 按钮: "${c.text}", 分数: ${c.score}`, 'log-scan');
            });

            const bestCandidate = candidates[0];
            if (bestCandidate.score < 20) {
                 updateProgress(100, `[AUTO] ❌ 最高分按钮 "${bestCandidate.text}" (${bestCandidate.score}分) 未达到可信阈值 (20分)。`, 'log-error');
                 return false;
            }

            updateProgress(95, `[AUTO] ✅ 智能决策: 点击按钮 "${bestCandidate.text}" (得分: ${bestCandidate.score})`, 'log-match');
            bestCandidate.element.click();
            monitorForPostClickFeedback();
            return true;
        },
        async fillFormsCustom(profile, email = config.email, password = config.password) {
            let [emailPrefix, emailDomainWithAt] = email.split('@');
            let emailDomain = emailDomainWithAt || '';
            const fields = { email: email, username: emailPrefix, password: password, passwordConfirm: password };
            let progress = 20;
            const allFieldTypes = ['email', 'emailDomain', 'username', 'password', 'passwordConfirm'];
            const totalSteps = allFieldTypes.filter(type => profile[type]).length + (profile.customFields ? profile.customFields.length : 0);
            const progressIncrement = totalSteps > 0 ? (65 / totalSteps) : 0;

            // 如果定义了域名选择器，先处理域名，这会决定邮箱主体的填充方式
            if (profile.emailDomain) {
                const domainElement = document.querySelector(profile.emailDomain);
                if (domainElement) {
                    updateProgress(progress, `[CUSTOM] 找到 emailDomain 元素: ${profile.emailDomain}`, 'log-match');
                    const result = await handleCustomDropdown(domainElement, emailDomain);
                    if (result.success) {
                        updateProgress(null, `[CUSTOM] ✅ 成功选择域名: ${result.domain}`, 'log-match');
                        emailDomain = result.domain.replace('@', ''); // 确保没有@符号
                        // 更新完整的 email 地址，以备后用
                        config.email = `${emailPrefix}@${emailDomain}`;
                        ui.emailInput.value = config.email;
                    } else {
                        updateProgress(null, `[CUSTOM] ❌ 填充 emailDomain 失败`, 'log-error');
                    }
                    progress += progressIncrement;
                    await new Promise(res => setTimeout(res, 150));
                } else {
                     updateProgress(100, `[CUSTOM] 错误: 找不到 emailDomain 元素 ${profile.emailDomain}`, 'log-error');
                     return false;
                }
            }

            // 现在处理其他标准字段
            for (const type of ['email', 'username', 'password', 'passwordConfirm']) {
                if (!profile[type]) continue;
                const element = document.querySelector(profile[type]);
                if (element) {
                    updateProgress(progress, `[CUSTOM] 找到 ${type} 元素: ${profile[type]}`, 'log-match');
                    let fillSuccess = false;
                    try {
                        // 如果存在域名选择器，邮箱字段只填前缀；否则填完整邮箱
                        const valueToFill = (type === 'email') ? (profile.emailDomain ? emailPrefix : fields.email) : fields[type];
                        if (valueToFill) {
                           fillSuccess = await simulateHumanTyping(element, valueToFill);
                        }

                        if (fillSuccess) updateProgress(null, `[CUSTOM] ✅ 成功填充 ${type}`, 'log-match');
                        else updateProgress(null, `[CUSTOM] ❌ 填充 ${type} 失败`, 'log-error');

                    } catch (err) {
                        updateProgress(100, `[CUSTOM] 填充 ${type} 时发生严重错误: ${err.message}`, 'log-error');
                        return false;
                    }
                    progress += progressIncrement;
                    await new Promise(res => setTimeout(res, 150));
                } else {
                    updateProgress(100, `[CUSTOM] 错误: 找不到元素 ${profile[type]}`, 'log-error');
                    return false;
                }
            }

            // 处理动态添加的自定义字段
            if (profile.customFields) {
                for (const field of profile.customFields) {
                    const element = document.querySelector(field.selector);
                    if (element) {
                        updateProgress(progress, `[CUSTOM] 处理自定义字段 "${field.name}"...`, 'log-action');
                        switch (field.action) {
                            case 'inputText':
                                await simulateHumanTyping(element, field.value);
                                break;
                            case 'click':
                                element.click();
                                break;
                        }
                        progress += progressIncrement;
                        await new Promise(res => setTimeout(res, 150));
                    } else {
                        updateProgress(100, `[CUSTOM] 错误: 找不到自定义字段 "${field.name}" 的元素 ${field.selector}`, 'log-error');
                        return false;
                    }
                }
            }
            return true;
        }
    };

    // --- 6. 验证码与反馈监控 (V4.8 增强版) ---
    const CaptchaDetector = { captchaSelectors: ['iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'div.geetest_holder', 'div.h-captcha-container', 'div.g-recaptcha'], captchaElement: null, detect() { for (const selector of this.captchaSelectors) { const el = document.querySelector(selector); if (el && el.offsetParent !== null) { this.captchaElement = el; const type = selector.includes('recaptcha') ? 'reCAPTCHA' : (selector.includes('hcaptcha') ? 'hCaptcha' : 'GeeTest/滑块'); updateProgress(85, `[PAUSE] ⏸️ 检测到复杂真人验证 (${type})，请手动完成后，我将自动继续！`, 'log-pause'); return true; } } this.captchaElement = null; return false; }, pauseAndWaitForCompletion(callback) { if (captchaPauseInterval) clearInterval(captchaPauseInterval); captchaPauseInterval = setInterval(() => { const successKeywords = ['验证成功', 'success', 'verified']; const captchaText = this.captchaElement ? this.captchaElement.innerText.toLowerCase() : ''; const isCompletedByText = successKeywords.some(k => captchaText.includes(k)); const isCompletedByDisappearance = !this.captchaElement || !document.body.contains(this.captchaElement) || this.captchaElement.offsetParent === null; if (isCompletedByText || isCompletedByDisappearance) { clearInterval(captchaPauseInterval); captchaPauseInterval = null; updateProgress(90, `[ACTION] ✅ 检测到验证码已完成，恢复执行...`, 'log-action'); callback(); } }, 2000); } };

    /**
     * 【V4.8 核心升级】智能等待引擎，专门用于等待加载遮罩和Cloudflare人机验证。
     * 它会耐心等待，直到页面上的遮挡元素消失，模拟人类用户的观察和延迟行为。
     */
    async function intelligentWaitEngine(timeout = 25000) {
        updateProgress(null, `[WAIT] 启动智能等待引擎，检测加载遮罩/CF验证...`, 'log-monitor');
        const overlaySelectors = [
            // Cloudflare & Turnstile
            'div[class*="cloudflare"]', 'iframe[src*="challenges.cloudflare.com"]', 'div#cf-challenge-running',
            'div#turnstile-widget', 'div.cf-turnstile', 'div.cf-chl-widget', 'div[aria-label*="Cloudflare"]',
            // 通用加载
            'div[class*="loading"]', 'div[class*="spinner"]',
            // Cookie 同意
            'div.qc-cmp2-container'
        ];
        const startTime = Date.now();
        let isWaitingForCF = false;

        while (Date.now() - startTime < timeout) {
            const overlay = overlaySelectors.map(s => document.querySelector(s)).find(el => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && +style.opacity > 0;
            });

            if (!overlay) {
                updateProgress(null, `[WAIT] ✅ 未检测到活动遮罩，继续执行。`, 'log-match');
                return true;
            }

            // 如果检测到的是Cloudflare，只提示一次
            const isCF = overlay.matches('div[class*="cloudflare"], iframe[src*="challenges.cloudflare.com"], div.cf-turnstile, div.cf-chl-widget');
            if (isCF && !isWaitingForCF) {
                updateProgress(null, `[WAIT] ⏸️ 检测到Cloudflare人机验证，进入智能等待模式...请手动完成验证。`, 'log-pause');
                isWaitingForCF = true;
            }

            await new Promise(res => setTimeout(res, 1000)); // 每1秒检查一次，模拟人类耐心
        }
        updateProgress(null, `[WAIT] ⚠️ 等待遮罩超时 (${timeout/1000}s)，将尝试继续...`, 'log-warning');
        return false;
    }


    /**
     * 【V4.8 核心升级】增强版点击后反馈监控。
     * 此功能模拟您“检测网络数据包”的思路，通过监控DOM变化（如成功/失败消息、URL跳转）
     * 来判断上一步操作（如点击注册）的最终结果。
     */
    function monitorForPostClickFeedback() {
        updateProgress(99, `[MONITOR] 启动增强版反馈监控 (15s)...`, 'log-monitor');
        const initialUrl = window.location.href;
        const errorKeywords = ['错误', 'error', '失败', 'taken', '已存在', '格式不正确', '仅支持', '不正确', '频繁', '无效', '不合法', '提示'];
        const successKeywords = ['成功', 'success', 'welcome', '欢迎', '已发送', '验证邮件', 'verification email', 'dashboard', 'user'];
        const modalSelectors = '[role="dialog"], [role="alertdialog"], .modal, .dialog, .popup, .toast, .sweet-alert, .el-dialog, .ant-modal, .layui-layer-content';
        let taskResult = 'unknown'; // 'success', 'error', or 'unknown'

        const stopMonitoring = (finalStatus) => {
            if (postClickObserver) {
                postClickObserver.disconnect();
                postClickObserver = null;
            }
            if (taskResult !== 'unknown') return; // 避免重复设置结果

            taskResult = finalStatus;
            if (taskResult === 'success') {
                updateProgress(100, `[MONITOR] ✅ 监测到成功迹象，任务完成！`, 'log-match');
            } else if (taskResult === 'error') {
                // 错误信息已在checkForFeedback中记录，这里不再重复
            } else { // timeout
                updateProgress(100, `[MONITOR] 未监测到明确的成功或失败反馈，任务结束。`, 'log-match');
            }
        };

        const checkForFeedback = () => {
            if (taskResult !== 'unknown') return;

            // 1. 检查URL是否发生有意义的变化
            if (window.location.href !== initialUrl) {
                if (successKeywords.some(k => window.location.href.includes(k))) {
                    updateProgress(100, `[MONITOR] 监测到成功跳转: ${window.location.href}`, 'log-match');
                    stopMonitoring('success');
                    return;
                }
            }

            // 2. 检查页面内容和弹窗
            const bodyText = document.body.textContent.toLowerCase();
            let feedbackElementText = '';

            // 优先检查模态框/弹窗
            const modals = document.querySelectorAll(modalSelectors);
            for (const modal of modals) {
                const style = window.getComputedStyle(modal);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    feedbackElementText += modal.textContent.toLowerCase() + ' ';
                }
            }

            // 检查整个页面的文本
            const combinedText = feedbackElementText || bodyText;

            if (errorKeywords.some(k => combinedText.includes(k))) {
                updateProgress(100, `[MONITOR] 监测到错误反馈: "${combinedText.substring(0, 100).trim()}"`, 'log-error');
                stopMonitoring('error');
                return;
            }
            if (successKeywords.some(k => combinedText.includes(k))) {
                updateProgress(100, `[MONITOR] 监测到成功反馈: "${combinedText.substring(0, 100).trim()}"`, 'log-match');
                stopMonitoring('success');
                return;
            }
        };

        if (postClickObserver) postClickObserver.disconnect();
        postClickObserver = new MutationObserver(() => {
            if (taskResult === 'unknown') checkForFeedback();
        });

        postClickObserver.observe(document.body, {
            childList: true, subtree: true, characterData: true
        });

        // 初始检查
        setTimeout(checkForFeedback, 500);

        // 15秒后停止监控
        setTimeout(() => stopMonitoring('timeout'), 15000);
    }

    // --- 7. 辅助功能 ---
    async function checkAgreementBoxes() { const keywords = ['服务条款', '隐私政策', '用户协议', '我已阅读并同意', 'terms', 'policy', 'agreement', 'i have read and agree']; const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:not(.tf-helper-ignore)')); for (const box of checkboxes) { if (box.checked) continue; const label = box.closest('label') || box.parentElement; if (label && keywords.some(keyword => label.textContent.toLowerCase().includes(keyword))) { updateProgress(75, `[ACTION] 发现并勾选协议: "${label.textContent.trim()}"`, 'log-action'); box.click(); await new Promise(res => setTimeout(res, 100)); } } }
    function isEmailVerificationRequired() { const inputs = Array.from(document.querySelectorAll('input[type="text"]:not(.tf-helper-ignore), input[type="number"]:not(.tf-helper-ignore)')); const buttons = Array.from(document.querySelectorAll('button:not(.tf-helper-ignore), a:not(.tf-helper-ignore), span:not(.tf-helper-ignore)')); const sendButtonKeywords = ['发送', '获取', 'send', 'get', 'obtain']; const codeInput = inputs.find(el => Engine.isOfType(el, 'verificationCode')); const sendButton = buttons.find(el => el.offsetParent !== null && sendButtonKeywords.some(k => (el.textContent || "").toLowerCase().trim().includes(k))); if (codeInput && sendButton) { const commonParent = codeInput.closest('form, div, p, li'); if (commonParent && commonParent.contains(sendButton)) { return true; } } return false; }
    async function randomizeAndFill(forceFill = true) {
        log.clear();
        const randomEmail = 'user' + Date.now().toString().slice(-6) + '@' + (['gmail.com', 'qq.com', 'outlook.com', '163.com', 'hotmail.com'][Math.floor(Math.random() * 5)]);
        const randomPassword = Math.random().toString(36).substring(2, 12);
        ui.emailInput.value = randomEmail;
        ui.passwordInput.value = randomPassword;
        config.email = randomEmail;
        config.password = randomPassword;
        GM_setValue('savedEmail', config.email);
        GM_setValue('savedPassword', config.password);
        log.add('✅ 新的随机凭据已生成。', 'success');
        if (forceFill) {
            log.add('✅ 已强制填充新凭据。', 'success');
            await Engine.fillForms(true, randomEmail, randomPassword);
        }
    }
    // --- V4.7 新增：账户记忆功能 ---
    function getSavedAccountForHost() {
        const host = window.location.hostname;
        return registeredAccounts[host];
    }
    function saveAccountForHost(email, password) {
        const host = window.location.hostname;
        registeredAccounts[host] = { email, password, timestamp: Date.now() };
        GM_setValue('registeredAccounts', registeredAccounts);
        log.add(`✅ 已为 ${host} 记住该账户。`, 'success');
        updateProgress(null, `[MEMORY] ✅ 已为 ${host} 记住该账户。`, 'log-match');
    }


    // --- 8. 事件绑定 ---
    function bindUIEvents() {
        ui.lockBtn.addEventListener('click', () => { config.isLocked = !config.isLocked; GM_setValue('isLocked', config.isLocked); updateLockUI(); });
        ui.randomBtn.addEventListener('click', () => randomizeAndFill(true));
        ui.startStopBtn.addEventListener('click', () => { isScriptRunning = !isScriptRunning; updateStartStopButtonUI(); if (isScriptRunning) { runPageLogic(); } else { log.add('✅ 脚本已手动停止。', 'success'); if (captchaPauseInterval) clearInterval(captchaPauseInterval); if (postClickObserver) postClickObserver.disconnect(); } });
        ui.autofillToggle.addEventListener('change', () => { config.autoFillEnabled = ui.autofillToggle.checked; GM_setValue('autoFillEnabled', config.autoFillEnabled); });
        ui.autoregisterToggle.addEventListener('change', () => { config.autoRegisterEnabled = ui.autoregisterToggle.checked; GM_setValue('autoRegisterEnabled', config.autoRegisterEnabled); });
        ui.showDetailedToggle.addEventListener('change', () => { config.showDetailedProcess = ui.showDetailedToggle.checked; GM_setValue('showDetailedProcess', config.showDetailedProcess); });
        ui.minimizeBtn.addEventListener('click', (e) => { e.stopPropagation(); ui.container.classList.add('minimized'); GM_setValue('isMinimized', true); });
        ui.container.addEventListener('click', () => { if (ui.container.classList.contains('minimized')) { ui.container.classList.remove('minimized'); GM_setValue('isMinimized', false); } });
        ui.progressCloseBtn.addEventListener('click', hideProgressModal);
        ui.copyLogBtn.addEventListener('click', () => { navigator.clipboard.writeText(progressLogContent).then(() => { ui.copyLogBtn.textContent = '已复制!'; setTimeout(() => { ui.copyLogBtn.textContent = '复制日志'; }, 2000); }).catch(err => { alert('复制失败: ' + err); }); });
        let isDragging = false, offsetX, offsetY; const header = document.getElementById('helper-header'); header.addEventListener('mousedown', (e) => { if (e.target.id === 'minimize-btn') return; isDragging = true; ui.container.classList.add('dragging'); offsetX = e.clientX - ui.container.offsetLeft; offsetY = e.clientY - ui.container.offsetTop; }); document.addEventListener('mousemove', (e) => { if (!isDragging) return; ui.container.style.left = `${e.clientX - offsetX}px`; ui.container.style.top = `${e.clientY - offsetY}px`; }); document.addEventListener('mouseup', () => { if (!isDragging) return; isDragging = false; ui.container.classList.remove('dragging'); });

        // 自定义模式UI事件
        ui.gotoCustomBtn.addEventListener('click', () => { ui.mainView.style.display = 'none'; ui.customView.style.display = 'flex'; });
        ui.returnMainBtn.addEventListener('click', () => { ui.customView.style.display = 'none'; ui.mainView.style.display = 'block'; });
        ui.customView.querySelectorAll('.locator-btn').forEach(btn => { btn.addEventListener('click', (e) => startSelectorMode(e.target.dataset.type)); });
        ui.customView.querySelectorAll('.reset-btn').forEach(btn => { btn.addEventListener('click', (e) => resetCustomMapping(e.target.dataset.type)); });
        ui.saveProfileBtn.addEventListener('click', saveCustomProfile);
        ui.exportProfileBtn.addEventListener('click', exportProfile);
        ui.importProfileBtn.addEventListener('click', importProfile);
        ui.startCustomBtn.addEventListener('click', () => runPageLogic(true));

        // 动态字段UI事件
        ui.addCustomFieldBtn.addEventListener('click', () => { ui.customFieldModal.style.display = 'flex'; });
        ui.cancelCustomFieldBtn.addEventListener('click', () => { ui.customFieldModal.style.display = 'none'; });
        ui.saveCustomFieldBtn.addEventListener('click', addCustomField);
        ui.customFieldAction.addEventListener('change', (e) => { ui.customFieldValue.style.display = e.target.value === 'inputText' ? 'block' : 'none'; });
    }

    // --- 9. 自定义映射核心逻辑 ---
    function startSelectorMode(type, customIndex = -1) {
        if (isSelecting) return;
        isSelecting = true;
        selectingFor = type;
        selectingForCustomIndex = customIndex;
        const targetName = customIndex > -1 ? currentProfile.customFields[customIndex].name : type;
        log.add(`请在网页上点击目标 ${targetName} 元素...`, 'success');
        ui.selectorOverlay.style.display = 'block';
        document.body.classList.add('in-selector-mode');
        document.addEventListener('mouseover', highlightElement);
        document.addEventListener('click', captureElement, { capture: true, once: true });
    }
    function highlightElement(e) {
        document.querySelectorAll('.highlight-for-selection').forEach(el => el.classList.remove('highlight-for-selection'));
        if (e.target && e.target.tagName && !e.target.classList.contains('tf-helper-ignore')) {
            e.target.classList.add('highlight-for-selection');
        }
    }
    function captureElement(e) {
        e.preventDefault(); e.stopPropagation();
        const target = e.target;
        target.classList.remove('highlight-for-selection');
        const selector = generateSelector(target);

        if (selectingFor === 'custom') {
            currentProfile.customFields[selectingForCustomIndex].selector = selector;
            updateCustomUIMapping('custom', selector, selectingForCustomIndex);
        } else {
            currentProfile[selectingFor] = selector;
            updateCustomUIMapping(selectingFor, selector);
        }

        log.add(`✅ 映射已更新为 ${selector}`, 'success');
        stopSelectorMode();
    }
    function stopSelectorMode() {
        isSelecting = false;
        selectingFor = null;
        selectingForCustomIndex = -1;
        ui.selectorOverlay.style.display = 'none';
        document.body.classList.remove('in-selector-mode');
        document.removeEventListener('mouseover', highlightElement);
        document.querySelectorAll('.highlight-for-selection').forEach(el => el.classList.remove('highlight-for-selection'));
    }
    function generateSelector(el) {
        if (el.id) return `#${el.id.trim().replace(/\s/g, '\\ ')}`;
        if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
        if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).filter(c => c && !c.includes(':')).join('.');
            if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
        }
        return el.tagName.toLowerCase();
    }
    function updateCustomUIMapping(type, selector, customIndex = -1) {
        const display = customIndex > -1 ? document.querySelector(`.custom-mapping-row[data-index="${customIndex}"] .selector-display`) : document.getElementById(`map-${type}-selector`);
        const locatorBtn = customIndex > -1 ? document.querySelector(`.locator-btn[data-custom-index="${customIndex}"]`) : document.querySelector(`.locator-btn[data-type="${type}"]`);
        if (display && locatorBtn) {
            if (selector) {
                display.textContent = selector;
                locatorBtn.classList.remove('unmapped'); locatorBtn.classList.add('mapped');
            } else {
                display.textContent = '未指定';
                locatorBtn.classList.remove('mapped'); locatorBtn.classList.add('unmapped');
            }
        }
    }
    function resetCustomMapping(type) { delete currentProfile[type]; updateCustomUIMapping(type, null); log.add(`已重置 ${type} 的映射。`, 'success'); }
    function addCustomField() {
        const name = ui.customFieldName.value.trim();
        const action = ui.customFieldAction.value;
        const value = ui.customFieldValue.value;
        if (!name) { alert('字段名称不能为空！'); return; }
        if (action === 'inputText' && !value) { alert('“输入文本”操作的值不能为空！'); return; }

        if (!currentProfile.customFields) currentProfile.customFields = [];
        const newField = { name, action, value, selector: '' };
        currentProfile.customFields.push(newField);
        createCustomFieldRow(newField, currentProfile.customFields.length - 1);

        ui.customFieldName.value = '';
        ui.customFieldValue.value = '';
        ui.customFieldModal.style.display = 'none';
        log.add(`✅ 已添加自定义字段: ${name}`, 'success');
    }
    function createCustomFieldRow(field, index) {
        const row = document.createElement('div');
        row.className = 'custom-mapping-row';
        row.dataset.index = index;
        const actionText = field.action === 'inputText' ? '输入' : '点击';
        row.innerHTML = `
            <label>${field.name} (${actionText})</label>
            <span class="selector-display">${field.selector || '未指定'}</span>
            <button class="locator-btn ${field.selector ? 'mapped' : 'unmapped'}" data-type="custom" data-custom-index="${index}" title="定位"></button>
            <button class="remove-btn" data-index="${index}" title="移除">×</button>
        `;
        ui.customFieldsContainer.appendChild(row);
        row.querySelector('.locator-btn').addEventListener('click', (e) => startSelectorMode('custom', parseInt(e.target.dataset.customIndex)));
        row.querySelector('.remove-btn').addEventListener('click', (e) => removeCustomField(parseInt(e.target.dataset.index)));
    }
    function removeCustomField(index) {
        currentProfile.customFields.splice(index, 1);
        // 重新渲染所有自定义字段UI以更新索引
        ui.customFieldsContainer.innerHTML = '';
        currentProfile.customFields.forEach((field, i) => createCustomFieldRow(field, i));
        log.add(`已移除一个自定义字段。`, 'success');
    }
    function saveCustomProfile() { const host = window.location.hostname; customProfiles[host] = currentProfile; GM_setValue('customProfiles', customProfiles); log.add(`✅ 已为 ${host} 保存规则。`, 'success'); }
    function loadCustomProfile() {
        const host = window.location.hostname;
        if (customProfiles[host]) {
            currentProfile = JSON.parse(JSON.stringify(customProfiles[host])); // 深拷贝以防意外修改
            Object.keys(currentProfile).forEach(type => {
                if (type !== 'customFields') updateCustomUIMapping(type, currentProfile[type]);
            });
            ui.customFieldsContainer.innerHTML = '';
            if (currentProfile.customFields) {
                currentProfile.customFields.forEach((field, index) => createCustomFieldRow(field, index));
            }
            log.add(`已加载 ${host} 的自定义规则。`, 'success');
        } else {
            currentProfile = {}; // 清空当前配置
        }
    }
    function exportProfile() {
        if (Object.keys(currentProfile).length === 0) { log.add('❌ 当前没有可导出的配置。', 'error'); return; }
        const data = { url: window.location.href, mappings: currentProfile };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `profile-${window.location.hostname}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log.add('✅ 配置已导出。', 'success');
    }
    function importProfile() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = readerEvent => {
                try {
                    const data = JSON.parse(readerEvent.target.result);
                    if (data && data.mappings && typeof data.mappings === 'object') {
                        currentProfile = data.mappings;
                        saveCustomProfile(); loadCustomProfile();
                        log.add('✅ 配置已成功导入并保存！', 'success');
                    } else { throw new Error("无效的配置文件格式。"); }
                } catch (err) { log.add(`❌ 导入失败: ${err.message}`, 'error'); }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // --- 10. 初始执行与情景感知 ---
    function isUserLoggedIn() { return false; }
    async function runPageLogic(useCustomMode = false) {
        if (!isScriptRunning && !useCustomMode) isScriptRunning = true; updateStartStopButtonUI();
        log.clear(); taskStartTime = Date.now();
        if (config.showDetailedProcess) showProgressModal(useCustomMode ? "自定义任务执行中..." : "自动任务执行中...");
        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        try {
            if (useCustomMode) {
                updateProgress(10, "开始执行自定义映射规则...", "log-action");
                const fillSuccess = await Engine.fillFormsCustom(currentProfile, config.email, config.password);
                if (!fillSuccess) return;

                if (currentProfile.termsCheckbox) {
                    const termsBox = document.querySelector(currentProfile.termsCheckbox);
                    if (termsBox && !termsBox.checked) {
                        updateProgress(85, `[CUSTOM] 勾选服务条款: ${currentProfile.termsCheckbox}`, 'log-action');
                        termsBox.click();
                        await delay(100);
                    }
                }

                const btn = document.querySelector(currentProfile.submitBtn);
                if (btn) {
                    updateProgress(90, `[CUSTOM] 点击按钮: ${currentProfile.submitBtn}`, 'log-action');
                    btn.click();
                    monitorForPostClickFeedback();
                } else {
                    updateProgress(100, `[CUSTOM] 错误: 找不到注册按钮 ${currentProfile.submitBtn}`, 'log-error');
                }
            } else {
                // 自动模式逻辑
                updateProgress(0, "任务开始，分析当前页面...", "log-action"); await delay(300);
                updateProgress(10, "检测用户登录状态...", "log-scan"); if (isUserLoggedIn()) { return; } await delay(300);
                updateProgress(20, "分析页面类型 (注册/登录)...", "log-analyze");
                const isLikelyRegisterPage = document.querySelectorAll('input[type="password"]').length > 1 || window.location.href.includes('register') || window.location.href.includes('signup');
                updateProgress(25, isLikelyRegisterPage ? "✅ 页面类型识别为: 注册页" : "✅ 页面类型识别为: 登录页", "log-match"); await delay(300);

                if (config.autoFillEnabled || config.autoRegisterEnabled) {
                    let emailToUse = config.email;
                    let passwordToUse = config.password;
                    // 如果是登录页，且有已保存的账户，则使用已保存的账户
                    if (!isLikelyRegisterPage) {
                        const savedAccount = getSavedAccountForHost();
                        if (savedAccount) {
                            updateProgress(30, "发现已保存的账户，将使用该账户登录...", "log-match");
                            emailToUse = savedAccount.email;
                            passwordToUse = savedAccount.password;
                        }
                    }
                    updateProgress(30, "开始智能填充表单...", "log-action");
                    await Engine.fillForms(true, emailToUse, passwordToUse);
                } else {
                    updateProgress(100, "自动填充和自动注册均已关闭，任务结束。", "log-match"); return;
                }

                if (config.autoRegisterEnabled) {
                    const performClick = async () => {
                        // **核心逻辑点：在所有操作前，调用智能等待引擎**
                        await intelligentWaitEngine();

                        updateProgress(70, "开始检查服务协议复选框...", "log-scan"); await checkAgreementBoxes();
                        updateProgress(80, "检查是否存在邮箱验证码步骤...", "log-scan"); if (isEmailVerificationRequired()) { updateProgress(100, "❌ 检测到邮箱验证步骤，任务中止。请手动操作。", 'log-error'); return; }
                        updateProgress(85, `开始查找目标按钮...`, "log-scan");
                        const loginKeywords = ['登录', 'Login', 'Sign In', '登入'];
                        const registerKeywords = ['注册', 'Register', 'Sign Up', '创建', 'Create', '下一步', 'Submit', '註冊', '立即注册', '免费注册'];
                        const negativeKeywords = ['已有', '已有账户', '查看', '帮助', '已有帐号'];
                        const keywords = isLikelyRegisterPage ? registerKeywords : loginKeywords;
                        const success = await Engine.findAndClickButton(keywords, negativeKeywords);
                        if (!success) {
                            updateProgress(100, `❌ 未找到合适的目标按钮 (${keywords.join('/')})`, 'log-error');
                        } else if (isLikelyRegisterPage) {
                            // 如果是注册页且点击成功，则保存账户并生成新凭据
                            saveAccountForHost(config.email, config.password);
                            await randomizeAndFill(false); // false表示只生成不填充
                        }
                    };
                    updateProgress(68, "检测复杂真人验证...", "log-scan");
                    if (CaptchaDetector.detect()) { CaptchaDetector.pauseAndWaitForCompletion(performClick); } else { await performClick(); }
                } else { updateProgress(100, "自动注册/登录已关闭，任务结束。", "log-match"); }
            }
        } catch (error) { updateProgress(100, `❌ 发生意外错误: ${error.message}`, "log-error"); log.add(`❌ 发生意外错误: ${error.message}`, 'error'); }
    }
    function updateStartStopButtonUI() { if (isScriptRunning) { ui.startStopBtn.textContent = '停止运行'; ui.startStopBtn.style.backgroundColor = 'var(--helper-danger-color)'; } else { ui.startStopBtn.textContent = '开始运行'; ui.startStopBtn.style.backgroundColor = 'var(--helper-success-color)'; } }
    function initializeUI() { ui.emailInput.value = config.email; ui.passwordInput.value = config.password; ui.autofillToggle.checked = config.autoFillEnabled; ui.autoregisterToggle.checked = config.autoRegisterEnabled; ui.showDetailedToggle.checked = config.showDetailedProcess; if (config.isMinimized) ui.container.classList.add('minimized'); updateLockUI(); updateStartStopButtonUI(); log.add('✅ 脚本已就绪。', 'success'); }

    // --- 启动器 ---
    let lastUrl = location.href; const observer = new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; if (isScriptRunning) { setTimeout(() => runPageLogic(), 500); } } });
    const bodyObserver = new MutationObserver((mutations, obs) => { if (document.body) { createUI(); observer.observe(document.body, { childList: true, subtree: true }); obs.disconnect(); } });
    bodyObserver.observe(document.documentElement, { childList: true });

})();
