// ==UserScript==
// @name         机场自动注册助手 (By听风独-家提供)
// @namespace    http://tampermonkey.net/
// @version      2025-08-28.102 (V7.4 健壮性增强版)
// @description  【V7.4 里程碑版】革命性健壮性增强！1. 新增验证码处理备用方案：当无法找到输入框时，自动将验证码复制到剪贴板，并弹出toast提示，引导用户手动粘贴！2. 新增5秒等待期，在处理完验证码后，脚本会暂停等待用户操作，然后再继续点击注册，实现完美人机协作！
// @author       Gemini (Hybrid Intelligence Version 7.4 - Robustness Enhanced)
// @match        http://*/*
// @match        https://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      accounts.google.com
// @connect      ip-api.com
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
        isLocked: GM_getValue('isLocked', false),
        appsScriptUrl: GM_getValue('appsScriptUrl', '')
    };
    let isScriptRunning = false;
    let taskStartTime = 0;
    let progressLogContent = '';
    let postClickObserver = null;
    let isSelecting = false;
    let selectingFor = null;
    let selectingForCustomIndex = -1;
    let customProfiles = GM_getValue('customProfiles', {});
    let currentProfile = {};
    let policy;
    let verificationCodeResolver = null;
    let toastTimer = null;

    const setHTML = (element, html) => {
        if (policy) {
            element.innerHTML = policy.createHTML(html);
        } else {
            element.innerHTML = html;
        }
    };

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
            cursor: move;
        }
        #helper-container.dragging { transition: none !important; }
        #helper-container.minimized { width: var(--helper-ball-size) !important; height: var(--helper-ball-size) !important; border-radius: 50% !important; padding: 0 !important; }
        #helper-container.minimized .helper-content { display: none !important; }
        #helper-ball-icon { display: none; font-size: 1.5rem; color: white; width: 100%; height: 100%; background-color: var(--helper-primary-color); justify-content: center; align-items: center; }
        #helper-container.minimized #helper-ball-icon { display: flex !important; }
        .helper-content { display: flex; flex-direction: column; cursor: default; }
        #helper-header { padding: 0.6rem 1rem; background-color: var(--helper-primary-color); color: white; display: flex; justify-content: space-between; align-items: center; font-size: 1rem; }
        #minimize-btn { cursor: pointer; font-size: 1.5rem; font-weight: bold; line-height: 1; user-select: none; }
        #helper-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
        #helper-body input[type="text"], #helper-body input[type="password"] { width: calc(100% - 1.2rem); padding: 0.5rem 0.6rem; border: 1px solid #ccc; border-radius: 0.25rem; font-size: 0.9rem; }
        #helper-body button, .helper-full-width-btn { padding: 0.6rem; border: none; border-radius: 0.25rem; cursor: pointer; font-weight: bold; transition: background-color 0.2s, color 0.2s; color: white; width: 100%; }
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
        #progress-modal-overlay, #custom-field-modal-overlay, #tutorial-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 2147483646; display: none; justify-content: center; align-items: center; }
        #progress-modal-container, #tutorial-modal-container { width: 45rem; max-width: 90vw; background-color: #fff; border-radius: 0.5rem; box-shadow: 0 5px 20px rgba(0,0,0,0.25); display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        #progress-modal-header, #tutorial-modal-header { padding: 0.8rem 1.2rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        #progress-modal-header h3, #tutorial-modal-header h3 { margin: 0; font-size: 1.1rem; }
        #progress-modal-close-btn, #tutorial-modal-close-btn { font-size: 1.5rem; cursor: pointer; color: #888; border: none; background: none; padding: 0; line-height: 1; }
        #progress-modal-body, #tutorial-modal-body { padding: 1.2rem; max-height: 80vh; overflow-y: auto; }
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
        #progress-log-list .log-mail { color: #e83e8c; font-weight: bold; }
        #progress-modal-footer { padding: 0.8rem 1.2rem; border-top: 1px solid #eee; text-align: right; }
        #copy-log-btn { padding: 0.5rem 1rem; background-color: var(--helper-primary-color); color: white; border: none; border-radius: 0.25rem; cursor: pointer; }
        #helper-main-view, #helper-custom-view, #helper-settings-view, #helper-mailbox-view { display: flex; flex-direction: column; }
        #helper-custom-view, #helper-settings-view, #helper-mailbox-view { display: none; }
        .custom-mapping-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
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
        #mailbox-list { list-style: none; padding: 0; margin: 0; max-height: 300px; overflow-y: auto; border: 1px solid #eee; border-radius: 0.25rem; }
        #mailbox-list li { padding: 0.6rem; border-bottom: 1px solid #eee; font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.2rem; transition: background-color 0.3s; }
        #mailbox-list li:last-child { border-bottom: none; }
        #mailbox-list li.new-email { background-color: #e8f5e9; border-left: 4px solid var(--helper-success-color); }
        #mailbox-list li.seen-email { background-color: #f5f5f5; }
        #mailbox-list li.seen-email .mail-sender, #mailbox-list li.seen-email .mail-subject, #mailbox-list li.seen-email .mail-date { color: #888; }
        #mailbox-list .mail-sender { font-weight: bold; }
        #mailbox-list .mail-subject { color: #555; }
        #mailbox-list .mail-date { font-size: 0.7rem; color: #888; }
        #mailbox-list .use-email-btn { font-size: 0.75rem; padding: 0.3rem 0.6rem; width: auto; background-color: var(--helper-success-color); margin-top: 0.4rem; align-self: flex-start; }
        .tutorial-content { line-height: 1.6; font-size: 0.9rem; }
        .tutorial-content h4 { font-size: 1.1rem; color: var(--helper-primary-color); border-bottom: 2px solid var(--helper-primary-color); padding-bottom: 0.3rem; margin-top: 1.2rem; }
        .tutorial-content p, .tutorial-content ul { margin: 0.5rem 0; }
        .tutorial-content ul { padding-left: 1.5rem; }
        .tutorial-content li { margin-bottom: 0.5rem; }
        .tutorial-content code { background-color: #e9ecef; padding: 0.1rem 0.4rem; border-radius: 0.2rem; font-family: "Courier New", monospace; }
        .tutorial-content .code-block { background-color: #282c34; color: #abb2bf; padding: 1rem; border-radius: 0.3rem; margin: 1rem 0; position: relative; }
        .tutorial-content .code-block pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
        .tutorial-content .important-note { background-color: #fff3cd; border-left: 4px solid #ffeeba; padding: 0.8rem; margin: 1rem 0; }
        #copy-apps-script-code-btn { position: absolute; top: 0.5rem; right: 0.5rem; background-color: #61afef; color: white; border: none; padding: 0.3rem 0.6rem; border-radius: 0.2rem; cursor: pointer; }
        #helper-toast-notification {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.75); color: white; padding: 1rem 1.5rem;
            border-radius: 0.5rem; z-index: 2147483647; font-size: 1rem;
            display: none; opacity: 0; transition: opacity 0.3s ease-in-out;
            display: flex; align-items: center; gap: 1rem;
        }
        #helper-toast-notification.show { display: flex; opacity: 1; }
        #helper-toast-close-btn { background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;}
    `);

    // --- 3. 创建UI ---
    let ui = {};
    const APPS_SCRIPT_CODE = `
function doGet(e) {
  try {
    const action = e.parameter.action;
    let data;

    if (action === 'fetchEmails') {
      const query = e.parameter.query || 'in:inbox newer_than:1d';
      data = fetchEmails(query);
    } else if (action === 'getEmailContent') {
      const messageId = e.parameter.messageId;
      if (!messageId) {
        throw new Error("缺少 messageId 参数");
      }
      data = getEmailContent(messageId);
    } else {
      throw new Error("无效的 action");
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: data
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function fetchEmails(query) {
  const threads = GmailApp.search(query, 0, 10);
  const emails = [];

  threads.forEach(thread => {
    const messages = thread.getMessages();
    const latestMessage = messages[messages.length - 1];

    if (latestMessage) {
      emails.push({
        id: latestMessage.getId(),
        subject: latestMessage.getSubject(),
        from: latestMessage.getFrom(),
        date: latestMessage.getDate().toISOString()
      });
    }
  });

  emails.sort((a, b) => new Date(b.date) - new Date(a.date));
  return emails;
}

function getEmailContent(messageId) {
  const message = GmailApp.getMessageById(messageId);
  if (!message) {
    throw new Error("找不到指定ID的邮件");
  }
  return message.getPlainBody();
}
`.trim();

    const TUTORIAL_CONTENT_HTML = `
        <div class="tutorial-content">
            <h4>前言：为什么要进行这项设置？</h4>
            <p><strong>原理说明：</strong>很多网站注册时需要邮箱验证码。为了实现自动化，脚本需要一种方法来读取您邮箱里的新邮件。直接让脚本登录您的邮箱既不安全也不现实。因此，我们采用Google官方提供的 <strong>Apps Script</strong> 服务，创建一个安全的“小程序”。</p>
            <p>这个小程序就像是您授权的一个私人秘书，它运行在Google的服务器上，可以按照我们的指令（我们提供的代码）安全地读取您的Gmail邮件。脚本通过一个专属的URL链接与这个“秘书”通信，从而获取验证码，全程无需暴露您的账号密码，安全可靠。</p>

            <h4>第一步：创建 Google Apps Script 项目</h4>
            <p>1. 首先，请确保您已登录需要用来接收验证码的Google账户。</p>
            <p>2. 打开 <a href="https://script.google.com/home/my" target="_blank">Google Apps Script 官网</a>。</p>
            <p>3. 点击页面左上角的 <strong>+ 新建项目</strong> 按钮，进入代码编辑器界面。</p>

            <h4>第二步：粘贴并保存代码</h4>
            <p>1. 进入编辑器后，您会看到一些默认代码，类似 <code>function myFunction() { ... }</code>。请将这些代码 <strong>全部删除</strong>，确保编辑器是空白的。</p>
            <p>2. 点击下方的“一键复制代码”按钮，然后将代码粘贴到空白的编辑器中。</p>
            <div class="code-block">
                <button id="copy-apps-script-code-btn">一键复制代码</button>
                <pre><code>${APPS_SCRIPT_CODE.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
            </div>
            <p><strong>原理说明：</strong>这段代码定义了两个功能：一个是<code>fetchEmails</code>（获取邮件列表），另一个是<code>getEmailContent</code>（读取单封邮件内容）。它只会在收到脚本的请求时执行这些操作。</p>
            <p>3. 点击顶部工具栏的 <strong>💾 保存项目</strong> 图标，给您的项目起一个容易识别的名字，例如“我的收信助手”。</p>

            <h4>第三步：部署为 Web 应用 (最关键的一步)</h4>
            <p>1. 点击编辑器右上角的蓝色 <strong>部署</strong> 按钮，在下拉菜单中选择 <strong>新建部署</strong>。</p>
            <p>2. 在弹出的窗口中，点击“选择类型”旁边的齿轮图标 ⚙️，然后选择 <strong>Web 应用</strong>。</p>
            <p>3. 接下来，进行部署配置，请严格按照以下说明操作：</p>
            <ul>
                <li><strong>说明:</strong> 可以随便填写，例如“首次部署”。</li>
                <li><strong>执行者:</strong> 选择 <code>我 (您的邮箱地址)</code>。<strong>(原理：这代表脚本将以您的身份去执行，从而能访问您的Gmail。)</strong></li>
                <li><strong>谁可以访问:</strong> 选择 <code>任何拥有 Google 帐号的用户</code>。<strong>(原理：这设定了谁能通过URL触发这个程序。这个选项兼顾了安全和便利。)</strong></li>
            </ul>
            <p>4. 点击 <strong>部署</strong> 按钮。</p>
            <div class="important-note">
                <strong>⚠️ 注意：首次部署会弹出授权请求窗口！</strong>
                <p>这是正常且必须的步骤。Google需要确认您是否允许这个您自己创建的程序访问您的Gmail数据。</p>
                <p>1. 在弹出的窗口中，点击 <strong>授权访问</strong>。</p>
                <p>2. 选择您的Google账户。</p>
                <p>3. Google可能会显示一个“Google 未验证此应用”的警告。这是因为这个应用是您个人创建的，并非来自应用商店。请不要担心，点击左下角的 <strong>“高级”</strong>，然后点击页面最下方的 <strong>“转至 [您的项目名称] (不安全)”</strong>。</p>
                <p>4. 在最后的确认页面，点击 <strong>允许</strong>，授予权限。</p>
            </div>

            <h4>第四步：复制URL并配置到脚本中</h4>
            <p>1. 授权成功并完成部署后，您会看到一个“部署已更新”的窗口，里面有一个 <strong>Web 应用网址</strong>。这就是我们最终需要的URL！请点击它旁边的 <strong>复制</strong> 按钮。</p>
            <p>2. 回到本脚本的“邮件设置”界面，将刚刚复制的URL完整地粘贴到输入框中。</p>
            <p>3. 点击 <strong>保存设置</strong>。</p>
            <p><strong>🎉 恭喜您，所有配置已完成！</strong> 现在脚本已经拥有了读取您邮箱验证码的能力。</p>
        </div>
    `;

    function createUI() {
        if (document.getElementById('helper-container')) return;

        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            try {
                policy = window.trustedTypes.createPolicy('script-ui-policy', { createHTML: input => input });
            } catch (e) { /* Policy may already exist */ }
        }

        const container = document.createElement('div');
        container.id = 'helper-container';
        container.classList.add('tf-helper-ignore');
        const containerHTML = `
            <div id="helper-ball-icon" class="tf-helper-ignore">✈️</div>
            <div class="helper-content tf-helper-ignore">
                <div id="helper-header" class="tf-helper-ignore"><span class="tf-helper-ignore">注册助手 V7.4 (健壮版)</span><span id="minimize-btn" class="tf-helper-ignore">&times;</span></div>
                <div id="helper-ip-info" class="tf-helper-ignore" style="padding: 0.3rem 1rem; background-color: #f8f9fa; font-size: 0.75rem; text-align: center; border-bottom: 1px solid #e0e0e0;">正在获取IP信息...</div>
                <div id="helper-main-view">
                    <div id="helper-body" class="tf-helper-ignore">
                        <input type="text" id="email-input" class="tf-helper-ignore" placeholder="邮箱 (必须是Google邮箱)">
                        <input type="text" id="password-input" class="tf-helper-ignore" placeholder="密码">
                        <small id="unlock-message" class="tf-helper-ignore"></small>
                        <div class="button-group tf-helper-ignore">
                            <button id="lock-btn" class="tf-helper-ignore">锁定</button>
                            <button id="random-btn" class="tf-helper-ignore">随机生成</button>
                        </div>
                        <button id="start-stop-btn" class="helper-full-width-btn tf-helper-ignore">开始运行</button>
                        <div class="switch-container tf-helper-ignore"><span class="tf-helper-ignore">自动填充</span><label class="switch tf-helper-ignore"><input type="checkbox" id="autofill-toggle" class="tf-helper-ignore"><span class="slider tf-helper-ignore"></span></label></div>
                        <div class="switch-container tf-helper-ignore"><span class="tf-helper-ignore">自动注册/登录</span><label class="switch tf-helper-ignore"><input type="checkbox" id="autoregister-toggle" class="tf-helper-ignore"><span class="slider tf-helper-ignore"></span></label></div>
                        <div class="switch-container tf-helper-ignore"><span class="tf-helper-ignore">显示详细过程</span><label class="switch tf-helper-ignore"><input type="checkbox" id="show-detailed-toggle" class="tf-helper-ignore"><span class="slider tf-helper-ignore"></span></label></div>
                        <div class="button-group tf-helper-ignore" style="margin-top: 0.5rem;">
                            <button id="goto-mailbox-btn" style="background-color: var(--helper-success-color);">手动收信</button>
                            <button id="goto-custom-btn" style="background-color: var(--helper-warning-color); color: black;">自定义</button>
                            <button id="goto-settings-btn" style="background-color: #6c757d; grid-column: 1 / -1;">邮件设置</button>
                        </div>
                    </div>
                    <div id="helper-log-container" class="tf-helper-ignore"><h4 class="tf-helper-ignore">运行日志:</h4><ul id="helper-log-list" class="tf-helper-ignore"></ul></div>
                </div>
                <div id="helper-custom-view" class="tf-helper-ignore">
                    <div style="padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; max-height: 400px; overflow-y: auto;">
                        <h4>为 ${window.location.hostname} 自定义规则</h4>
                        <div class="custom-mapping-row"><label>邮箱</label><span id="map-email-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="email" title="定位"></button><button class="reset-btn" data-type="email">⟲</button></div>
                        <div class="custom-mapping-row"><label>用户名</label><span id="map-username-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="username" title="定位"></button><button class="reset-btn" data-type="username">⟲</button></div>
                        <div class="custom-mapping-row"><label>密码</label><span id="map-password-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="password" title="定位"></button><button class="reset-btn" data-type="password">⟲</button></div>
                        <div class="custom-mapping-row"><label>确认密码</label><span id="map-passwordConfirm-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="passwordConfirm" title="定位"></button><button class="reset-btn" data-type="passwordConfirm">⟲</button></div>
                        <div class="custom-mapping-row"><label>服务条款</label><span id="map-termsCheckbox-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="termsCheckbox" title="定位"></button><button class="reset-btn" data-type="termsCheckbox">⟲</button></div>
                        <div class="custom-mapping-row"><label>注册按钮</label><span id="map-submitBtn-selector" class="selector-display">未指定</span><button class="locator-btn unmapped" data-type="submitBtn" title="定位"></button><button class="reset-btn" data-type="submitBtn">⟲</button></div>
                        <div id="custom-fields-container"></div>
                        <button id="add-custom-field-btn" class="helper-full-width-btn">+ 添加新字段</button>
                        <div class="button-group" style="margin-top: 0.5rem;"><button id="save-profile-btn">保存</button><button id="import-profile-btn" style="background-color: #17a2b8;">导入</button></div>
                        <button id="export-profile-btn" class="helper-full-width-btn" style="background-color: #6c757d; margin-top: 0.5rem;">导出配置</button>
                        <button id="return-main-btn" class="helper-full-width-btn" style="background-color: #ccc; color: black; margin-top: 0.5rem;">返回</button>
                    </div>
                </div>
                <div id="helper-settings-view" class="tf-helper-ignore">
                    <div style="padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem;">
                        <h4>Google邮件读取设置</h4>
                        <p style="font-size: 0.8rem; color: #666; margin: 0;">请将您创建的Google Apps Script Web应用URL粘贴到下方。</p>
                        <input type="password" id="apps-script-url-input" placeholder="粘贴您的 https://script.google.com/... 链接">
                        <button id="show-tutorial-btn" class="helper-full-width-btn" style="background-color: var(--helper-primary-color); margin-top: 0.5rem;">查看设置教程</button>
                        <button id="force-auth-btn" class="helper-full-width-btn" style="background-color: #fd7e14;">强制授权 (解决网络错误)</button>
                        <button id="save-settings-btn" class="helper-full-width-btn" style="background-color: var(--helper-success-color);">保存设置</button>
                        <button id="return-main-from-settings-btn" class="helper-full-width-btn" style="background-color: #ccc; color: black;">返回</button>
                    </div>
                </div>
                <div id="helper-mailbox-view" class="tf-helper-ignore">
                    <div style="padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem;">
                        <h4>手动收信 (最近10分钟)</h4>
                        <ul id="mailbox-list"><li>请点击刷新按钮获取邮件...</li></ul>
                        <button id="refresh-mailbox-btn" class="helper-full-width-btn" style="background-color: var(--helper-primary-color);">刷新</button>
                        <button id="return-main-from-mailbox-btn" class="helper-full-width-btn" style="background-color: #ccc; color: black;">返回</button>
                    </div>
                </div>
            </div>
        `;
        setHTML(container, containerHTML);
        document.body.appendChild(container);

        const progressModal = document.createElement('div');
        progressModal.id = 'progress-modal-overlay';
        progressModal.classList.add('tf-helper-ignore');
        setHTML(progressModal, `
            <div id="progress-modal-container" class="tf-helper-ignore">
                <div id="progress-modal-header" class="tf-helper-ignore"><h3 id="progress-modal-title" class="tf-helper-ignore">任务执行中...</h3><button id="progress-modal-close-btn" class="tf-helper-ignore">&times;</button></div>
                <div id="progress-modal-body" class="tf-helper-ignore">
                    <div class="progress-status tf-helper-ignore"><div class="progress-bar-container tf-helper-ignore"><div id="progress-bar-fill" class="progress-bar-fill tf-helper-ignore"></div></div><span id="progress-percentage" class="progress-percentage tf-helper-ignore">0%</span></div>
                    <div id="progress-time" class="progress-time tf-helper-ignore">已用时: 0.00s</div><h4 class="tf-helper-ignore">详细日志:</h4>
                    <div id="progress-log-container" class="tf-helper-ignore"><ul id="progress-log-list" class="tf-helper-ignore"></ul></div>
                </div>
                <div id="progress-modal-footer" class="tf-helper-ignore"><button id="copy-log-btn" class="tf-helper-ignore">复制日志</button></div>
            </div>`);
        document.body.appendChild(progressModal);

        const customFieldModal = document.createElement('div');
        customFieldModal.id = 'custom-field-modal-overlay';
        customFieldModal.classList.add('tf-helper-ignore');
        setHTML(customFieldModal, `
            <div id="custom-field-modal-container" class="tf-helper-ignore">
                <h3>添加自定义字段</h3>
                <input type="text" id="custom-field-name" placeholder="字段名称 (例如: 邀请码)">
                <select id="custom-field-action">
                    <option value="inputText">输入文本</option>
                    <option value="click">点击元素</option>
                </select>
                <input type="text" id="custom-field-value" placeholder="要输入的值 (仅“输入文本”时需要)">
                <div class="button-group">
                    <button id="save-custom-field-btn">保存</button>
                    <button id="cancel-custom-field-btn" style="background-color: #6c757d;">取消</button>
                </div>
            </div>
        `);
        document.body.appendChild(customFieldModal);

        const tutorialModal = document.createElement('div');
        tutorialModal.id = 'tutorial-modal-overlay';
        tutorialModal.classList.add('tf-helper-ignore');
        setHTML(tutorialModal, `
            <div id="tutorial-modal-container" class="tf-helper-ignore">
                <div id="tutorial-modal-header" class="tf-helper-ignore">
                    <h3 class="tf-helper-ignore">邮件读取设置教程 (小白专版)</h3>
                    <button id="tutorial-modal-close-btn" class="tf-helper-ignore">&times;</button>
                </div>
                <div id="tutorial-modal-body" class="tf-helper-ignore">
                    ${TUTORIAL_CONTENT_HTML}
                </div>
            </div>
        `);
        document.body.appendChild(tutorialModal);

        const selectorOverlay = document.createElement('div');
        selectorOverlay.id = 'selector-mode-overlay';
        selectorOverlay.classList.add('tf-helper-ignore');
        document.body.appendChild(selectorOverlay);

        const toast = document.createElement('div');
        toast.id = 'helper-toast-notification';
        toast.classList.add('tf-helper-ignore');
        setHTML(toast, `<span id="helper-toast-message"></span><button id="helper-toast-close-btn">&times;</button>`);
        document.body.appendChild(toast);

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
            settingsView: document.getElementById('helper-settings-view'),
            mailboxView: document.getElementById('helper-mailbox-view'),
            gotoCustomBtn: document.getElementById('goto-custom-btn'),
            returnMainBtn: document.getElementById('return-main-btn'),
            gotoSettingsBtn: document.getElementById('goto-settings-btn'),
            returnMainFromSettingsBtn: document.getElementById('return-main-from-settings-btn'),
            gotoMailboxBtn: document.getElementById('goto-mailbox-btn'),
            returnMainFromMailboxBtn: document.getElementById('return-main-from-mailbox-btn'),
            refreshMailboxBtn: document.getElementById('refresh-mailbox-btn'),
            mailboxList: document.getElementById('mailbox-list'),
            saveProfileBtn: document.getElementById('save-profile-btn'),
            exportProfileBtn: document.getElementById('export-profile-btn'),
            importProfileBtn: document.getElementById('import-profile-btn'),
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
            appsScriptUrlInput: document.getElementById('apps-script-url-input'),
            saveSettingsBtn: document.getElementById('save-settings-btn'),
            forceAuthBtn: document.getElementById('force-auth-btn'),
            showTutorialBtn: document.getElementById('show-tutorial-btn'),
            tutorialModal: document.getElementById('tutorial-modal-overlay'),
            tutorialCloseBtn: document.getElementById('tutorial-modal-close-btn'),
            copyAppsScriptCodeBtn: document.getElementById('copy-apps-script-code-btn'),
            toast: document.getElementById('helper-toast-notification'),
            toastMessage: document.getElementById('helper-toast-message'),
            toastCloseBtn: document.getElementById('helper-toast-close-btn'),
        };

        initializeUI();
        bindUIEvents();
        loadCustomProfile();
    }

    // --- 4. 核心功能逻辑 ---
    const log = {
        add: (message, status = 'pending') => {
            if (!ui.logList) return;
            const li = document.createElement('li');
            const icon = status === 'pending' ? '⏳' : (status === 'success' ? '✅' : '❌');
            const html = `${icon} ${message}`;
            setHTML(li, html);
            if (status === 'error') li.classList.add('error');
            while (ui.logList.children.length > 10) { ui.logList.removeChild(ui.logList.firstChild); }
            ui.logList.appendChild(li);
            ui.logList.scrollTop = ui.logList.scrollHeight;
            return li;
        },
        clear: () => { if (ui.logList) setHTML(ui.logList, ''); }
    };

    function showToastNotification(message) {
        if (toastTimer) clearTimeout(toastTimer);
        ui.toastMessage.textContent = message;
        ui.toast.classList.add('show');
        toastTimer = setTimeout(() => {
            ui.toast.classList.remove('show');
        }, 2000);
    }

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
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(res => setTimeout(res, 50));
            for (const char of value) {
                element.value += char;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(res => setTimeout(res, Math.random() * 60 + 30));
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
    function updateLockUI() { const isLocked = config.isLocked; ui.lockBtn.textContent = isLocked ? '解锁' : '锁定'; ui.emailInput.disabled = isLocked; ui.passwordInput.disabled = isLocked; ui.unlockMsg.textContent = isLocked ? `已锁定` : ''; }
    function showProgressModal(title = "任务执行中...") { if (!ui.progressOverlay) return; progressLogContent = ''; setHTML(ui.progressLogList, ''); ui.progressModalTitle.textContent = title; ui.progressOverlay.style.display = 'flex'; }
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
    const Engine = {
        keywords: {
            email: ['email', 'e-mail', 'mail', '邮箱', '帐号', '账户', '账号', '電子郵件'],
            username: ['user', 'name', 'nick', '昵称', '用户名', '网站名称', '使用者名稱'],
            password: ['password', 'passwd', 'pass', '密码', '密碼'],
            passwordConfirm: ['confirm', 'again', 'repeat', '确认', '重複', '再次', 're-enter', 'repasswd', '确认密码', '確認密碼'],
            verificationCode: ['verification', 'captcha', 'code', '验证码', '驗證碼', '校驗碼']
        },
        getAssociatedText(element) { let text = (element.placeholder || element.name || element.id || element.ariaLabel || '').toLowerCase(); let label = element.closest('label') || (element.id && document.querySelector(`label[for="${element.id}"]`)); if (label) { text += ' ' + (label.textContent || '').toLowerCase(); } else { const parent = element.closest('div, p, li'); if (parent) text += ' ' + (parent.innerText || '').split('\n')[0].toLowerCase(); } return text.trim().replace(/\s+/g, ' '); },
        isOfType(element, type) {
            const text = this.getAssociatedText(element);
            if (type === 'username') {
                return this.keywords.username.some(k => text.includes(k)) && !this.keywords.email.some(k => text.includes(k));
            }
            return this.keywords[type].some(k => text.includes(k));
        },
        async fillForms(forceOverwrite = false, email = config.email, password = config.password) {
            updateProgress(35, "扫描页面上的所有输入框...", "log-scan");
            const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not(.tf-helper-ignore)'));
            for (const input of inputs) {
                if (!forceOverwrite && input.value) continue;
                if (this.isOfType(input, 'email')) await simulateHumanTyping(input, email);
                else if (this.isOfType(input, 'username')) await simulateHumanTyping(input, email.split('@')[0]);
                else if (this.isOfType(input, 'passwordConfirm')) await simulateHumanTyping(input, password);
                else if (this.isOfType(input, 'password')) await simulateHumanTyping(input, password);
            }
            updateProgress(65, `✅ 智能填充完成。`, 'log-match');
        },
        async findAndClickButton(keywords) {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]'));
            const target = buttons.find(b => keywords.some(k => ((b.textContent || b.value) || '').toLowerCase().includes(k.toLowerCase())));
            if (target) {
                updateProgress(95, `✅ 智能决策: 点击按钮 "${(target.textContent || target.value || '').trim()}"`, 'log-match');
                target.click();
                monitorForPostClickFeedback(target);
                return true;
            }
            return false;
        },
    };

    // --- 5. 邮件逻辑 ---
    const MailHelper = {
        async _request(action, params = {}) {
            if (!config.appsScriptUrl) {
                throw new Error("请先在“邮件设置”中配置您的 Google Apps Script URL。");
            }
            const url = new URL(config.appsScriptUrl);
            url.searchParams.append('action', action);
            for (const key in params) {
                url.searchParams.append(key, params[key]);
            }
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url.href,
                    onload: function(response) {
                        try {
                            if (response.status === 200) {
                                const result = JSON.parse(response.responseText);
                                if (result.success) {
                                    resolve(result.data);
                                } else {
                                    reject(new Error(`Apps Script 报告错误: ${result.error || "未知错误"}.`));
                                }
                            } else {
                                reject(new Error(`请求失败，状态码: ${response.status}.`));
                            }
                        } catch (e) {
                            reject(new Error(`解析响应失败: ${e.message}.`));
                        }
                    },
                    onerror: function(response) {
                        console.error("GM_xmlhttpRequest 错误详情:", response);
                        reject(new Error(`网络错误: ${response.statusText || '无法连接'}. 请确保 @connect 权限包含了 'accounts.google.com'。`));
                    }
                });
            });
        },
        async fetchEmails(query) {
            try {
                return await this._request('fetchEmails', { query });
            } catch (err) {
                log.add(`❌ 获取邮件列表失败: ${err.message}`, 'error');
                return [];
            }
        },
        async getEmailContent(messageId) {
            try {
                return await this._request('getEmailContent', { messageId });
            } catch (err) {
                log.add(`❌ 获取邮件内容失败: ${err.message}`, 'error');
                return null;
            }
        },
        extractVerificationCode(text) {
            if (!text) return null;
            const patterns = [
                /(?:验证码|verification code|código de verificación|code de vérification|verifizierungscode|код подтверждения|認証コード|인증 코드)\s*[:：\s]*\s*([a-zA-Z0-9]{4,8})/i,
                /your code is\s*[:\s]*\s*([a-zA-Z0-9]{4,8})/i,
                /(?:\D|^)(\d{4,8})(?:\D|$)/,
            ];
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) return match[1];
            }
            return null;
        }
    };

    // --- 6. 增强功能模块 (等待引擎 & 反馈监控) ---
    async function intelligentWaitEngine(timeout = 25000) {
        updateProgress(null, `[WAIT] 启动智能等待引擎，检测加载遮罩/CF验证...`, 'log-monitor');
        const overlaySelectors = [
            'div[class*="cloudflare"]', 'iframe[src*="challenges.cloudflare.com"]', 'div#cf-challenge-running',
            'div#turnstile-widget', 'div.cf-turnstile', 'div.cf-chl-widget', 'div[aria-label*="Cloudflare"]',
            'div[class*="loading"]', 'div[class*="spinner"]',
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

            const isCF = overlay.matches('div[class*="cloudflare"], iframe[src*="challenges.cloudflare.com"], div.cf-turnstile, div.cf-chl-widget');
            if (isCF && !isWaitingForCF) {
                updateProgress(null, `[WAIT] ⏸️ 检测到Cloudflare人机验证，进入智能等待模式...请手动完成验证。`, 'log-pause');
                isWaitingForCF = true;
            }

            await new Promise(res => setTimeout(res, 1000));
        }
        updateProgress(null, `[WAIT] ⚠️ 等待遮罩超时 (${timeout/1000}s)，将尝试继续...`, 'log-warning');
        return false;
    }

    function monitorForPostClickFeedback(clickedButton) {
        updateProgress(99, `[MONITOR] 启动增强版反馈监控 (15s)...`, 'log-monitor');
        const initialUrl = window.location.href;
        const errorKeywords = ['错误', 'error', '失败', 'taken', '已存在', '格式不正确', '不正确', '频繁', '无效', '不合法', '提示'];
        const successKeywords = ['成功', 'success', 'welcome', '欢迎', '已发送', '验证邮件', 'dashboard', 'user'];
        const modalSelectors = '[role="dialog"], .modal, .dialog, .popup, .toast, .sweet-alert, .el-dialog, .ant-modal';
        let taskResult = 'unknown';

        const stopMonitoring = (finalStatus) => {
            if (postClickObserver) {
                postClickObserver.disconnect();
                postClickObserver = null;
            }
            if (taskResult !== 'unknown') return;

            taskResult = finalStatus;
            if (taskResult === 'success') {
                updateProgress(100, `[MONITOR] ✅ 监测到成功迹象，任务完成！`, 'log-match');
                // 检查是否需要自动登录
                if (window.location.href.includes('login')) {
                    handleLogin();
                }
            } else if (taskResult === 'error') {
                // 错误信息已在 checkForFeedback 中记录
            } else { // timeout
                updateProgress(100, `[MONITOR] 未监测到明确反馈，任务结束。`, 'log-match');
            }
        };

        const checkForFeedback = () => {
            if (taskResult !== 'unknown') return;
            if (window.location.href !== initialUrl && successKeywords.some(k => window.location.href.includes(k))) {
                updateProgress(100, `[MONITOR] 监测到成功跳转: ${window.location.href}`, 'log-match');
                stopMonitoring('success');
                return;
            }
            let feedbackText = '';
            document.querySelectorAll(modalSelectors).forEach(modal => {
                const style = window.getComputedStyle(modal);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    feedbackText += modal.textContent + ' ';
                }
            });
            const combinedText = feedbackText || document.body.innerText;

            // 新增：动态计时器检测
            const timerMatch = combinedText.match(/(?:请等待|please wait for)\s*(\d+)\s*(?:秒|s)/i);
            if (timerMatch && timerMatch[1]) {
                const waitSeconds = parseInt(timerMatch[1], 10);
                updateProgress(100, `[MONITOR] ⏸️ 检测到等待计时器...将在 ${waitSeconds} 秒后重试。`, 'log-pause');
                setTimeout(() => {
                    updateProgress(null, `[ACTION] 计时结束，重试点击...`, 'log-action');
                    clickedButton.click();
                    monitorForPostClickFeedback(clickedButton); // 再次启动监控
                }, (waitSeconds + 1) * 1000); // 增加1秒缓冲
                stopMonitoring('pause'); // 暂停当前监控
                return;
            }

            if (errorKeywords.some(k => combinedText.toLowerCase().includes(k))) {
                updateProgress(100, `[MONITOR] 监测到错误反馈: "${combinedText.substring(0, 100).trim()}"`, 'log-error');
                stopMonitoring('error');
            } else if (successKeywords.some(k => combinedText.toLowerCase().includes(k))) {
                updateProgress(100, `[MONITOR] 监测到成功反馈: "${combinedText.substring(0, 100).trim()}"`, 'log-match');
                stopMonitoring('success');
            }
        };

        if (postClickObserver) postClickObserver.disconnect();
        postClickObserver = new MutationObserver(() => {
            if (taskResult === 'unknown') checkForFeedback();
        });
        postClickObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        setTimeout(checkForFeedback, 500);
        setTimeout(() => stopMonitoring('timeout'), 15000);
    }


    // --- 7. 辅助功能与事件绑定 ---
    function findEmailVerificationElements() {
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
        const buttons = Array.from(document.querySelectorAll('button, a, span, input[type="button"]'));
        const sendButtonKeywords = ['发送', '获取', 'send', 'get', '获取验证码'];
        const codeInput = inputs.find(el => Engine.isOfType(el, 'verificationCode'));
        const sendButton = buttons.find(el => sendButtonKeywords.some(k => (el.textContent || el.value || "").toLowerCase().includes(k)));
        if (codeInput && sendButton) return { codeInput, sendButton };
        return null;
    }
    function bindUIEvents() {
        ui.lockBtn.addEventListener('click', () => { config.isLocked = !config.isLocked; GM_setValue('isLocked', config.isLocked); updateLockUI(); });
        ui.randomBtn.addEventListener('click', () => {
            config.email = 'user' + Date.now().toString().slice(-6) + '@gmail.com';
            config.password = 'pass' + Math.random().toString(36).substring(2, 10);
            GM_setValue('savedEmail', config.email);
            GM_setValue('savedPassword', config.password);
            ui.emailInput.value = config.email;
            ui.passwordInput.value = config.password;
            log.add('✅ 已生成新的随机凭据。', 'success');
        });
        ui.startStopBtn.addEventListener('click', () => {
            if (!config.isLocked) {
                config.email = ui.emailInput.value;
                config.password = ui.passwordInput.value;
            }
            isScriptRunning = !isScriptRunning;
            updateStartStopButtonUI();
            if (isScriptRunning) runPageLogic();
        });
        ui.autofillToggle.addEventListener('change', () => { config.autoFillEnabled = ui.autofillToggle.checked; GM_setValue('autoFillEnabled', config.autoFillEnabled); });
        ui.autoregisterToggle.addEventListener('change', () => { config.autoRegisterEnabled = ui.autoregisterToggle.checked; GM_setValue('autoRegisterEnabled', config.autoRegisterEnabled); });
        ui.showDetailedToggle.addEventListener('change', () => { config.showDetailedProcess = ui.showDetailedToggle.checked; GM_setValue('showDetailedProcess', config.showDetailedProcess); });
        ui.minimizeBtn.addEventListener('click', (e) => { e.stopPropagation(); ui.container.classList.add('minimized'); GM_setValue('isMinimized', true); });
        ui.container.addEventListener('click', () => { if (ui.container.classList.contains('minimized')) { ui.container.classList.remove('minimized'); GM_setValue('isMinimized', false); } });
        ui.progressCloseBtn.addEventListener('click', hideProgressModal);
        ui.copyLogBtn.addEventListener('click', () => { navigator.clipboard.writeText(progressLogContent).then(() => { ui.copyLogBtn.textContent = '已复制!'; setTimeout(() => { ui.copyLogBtn.textContent = '复制日志'; }, 2000); }).catch(err => { alert('复制失败: ' + err); }); });
        let isDragging = false, offsetX, offsetY;
        ui.container.addEventListener('mousedown', (e) => {
            const isHeader = e.target.closest('#helper-header');
            const isMinimized = ui.container.classList.contains('minimized');
            if (!isHeader && !isMinimized) return;
            if (e.target.id === 'minimize-btn') return;
            isDragging = true;
            ui.container.classList.add('dragging');
            offsetX = e.clientX - ui.container.offsetLeft;
            offsetY = e.clientY - ui.container.offsetTop;
        });
        document.addEventListener('mousemove', (e) => { if (!isDragging) return; ui.container.style.left = `${e.clientX - offsetX}px`; ui.container.style.top = `${e.clientY - offsetY}px`; });
        document.addEventListener('mouseup', () => { if (!isDragging) return; isDragging = false; ui.container.classList.remove('dragging'); });

        const showView = (viewToShow) => {
            [ui.mainView, ui.customView, ui.settingsView, ui.mailboxView].forEach(view => {
                if(view) view.style.display = view === viewToShow ? 'flex' : 'none';
            });
        };
        ui.gotoCustomBtn.addEventListener('click', () => showView(ui.customView));
        ui.returnMainBtn.addEventListener('click', () => showView(ui.mainView));
        ui.gotoSettingsBtn.addEventListener('click', () => showView(ui.settingsView));
        ui.returnMainFromSettingsBtn.addEventListener('click', () => showView(ui.mainView));
        ui.gotoMailboxBtn.addEventListener('click', () => { showView(ui.mailboxView); fetchAndDisplayEmails(); });
        ui.returnMainFromMailboxBtn.addEventListener('click', () => showView(ui.mainView));
        ui.refreshMailboxBtn.addEventListener('click', fetchAndDisplayEmails);

        ui.saveSettingsBtn.addEventListener('click', () => {
            const url = ui.appsScriptUrlInput.value.trim();
            if (url && url.startsWith("https://script.google.com/")) {
                config.appsScriptUrl = url;
                GM_setValue('appsScriptUrl', url);
                log.add('✅ 设置已保存！', 'success');
                showView(ui.mainView);
            } else {
                log.add('❌ 无效的URL，请检查！', 'error');
            }
        });

        ui.forceAuthBtn.addEventListener('click', () => {
            log.add('正在尝试强制触发授权...', 'pending');
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://accounts.google.com/",
                onload: function(response) {
                    log.add('✅ 强制连接成功！', 'success');
                    alert("连接成功！如果刚才弹出了授权窗口并已允许，那么问题应该已解决。请再次尝试运行脚本。");
                },
                onerror: function(response) {
                    log.add('❌ 强制连接失败。', 'error');
                    alert("连接失败。这不影响脚本使用，但表明授权可能仍有问题。");
                }
            });
        });

        ui.showTutorialBtn.addEventListener('click', () => { ui.tutorialModal.style.display = 'flex'; });
        ui.tutorialCloseBtn.addEventListener('click', () => { ui.tutorialModal.style.display = 'none'; });
        ui.copyAppsScriptCodeBtn.addEventListener('click', (e) => {
            navigator.clipboard.writeText(APPS_SCRIPT_CODE).then(() => {
                const btn = e.target;
                btn.textContent = '已复制!';
                setTimeout(() => { btn.textContent = '一键复制代码'; }, 2000);
            }).catch(err => { alert('复制失败: ' + err); });
        });

        ui.customView.querySelectorAll('.locator-btn').forEach(btn => { btn.addEventListener('click', (e) => startSelectorMode(e.target.dataset.type)); });
        ui.customView.querySelectorAll('.reset-btn').forEach(btn => { btn.addEventListener('click', (e) => resetCustomMapping(e.target.dataset.type)); });
        ui.saveProfileBtn.addEventListener('click', saveCustomProfile);
        ui.exportProfileBtn.addEventListener('click', exportProfile);
        ui.importProfileBtn.addEventListener('click', importProfile);
        ui.addCustomFieldBtn.addEventListener('click', () => { ui.customFieldModal.style.display = 'flex'; });
        ui.cancelCustomFieldBtn.addEventListener('click', () => { ui.customFieldModal.style.display = 'none'; });
        ui.saveCustomFieldBtn.addEventListener('click', addCustomField);
        ui.customFieldAction.addEventListener('change', (e) => { ui.customFieldValue.style.display = e.target.value === 'inputText' ? 'block' : 'none'; });
        ui.toastCloseBtn.addEventListener('click', () => {
            if (toastTimer) clearTimeout(toastTimer);
            ui.toast.classList.remove('show');
        });
    }

    // --- 8. 自定义映射与手动收信逻辑 ---
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
        const html = `
            <label>${field.name} (${actionText})</label>
            <span class="selector-display">${field.selector || '未指定'}</span>
            <button class="locator-btn ${field.selector ? 'mapped' : 'unmapped'}" data-type="custom" data-custom-index="${index}" title="定位"></button>
            <button class="remove-btn" data-index="${index}" title="移除">×</button>
        `;
        setHTML(row, html);
        ui.customFieldsContainer.appendChild(row);
        row.querySelector('.locator-btn').addEventListener('click', (e) => startSelectorMode('custom', parseInt(e.target.dataset.customIndex)));
        row.querySelector('.remove-btn').addEventListener('click', (e) => removeCustomField(parseInt(e.target.dataset.index)));
    }
    function removeCustomField(index) {
        currentProfile.customFields.splice(index, 1);
        setHTML(ui.customFieldsContainer, '');
        currentProfile.customFields.forEach((field, i) => createCustomFieldRow(field, i));
        log.add(`已移除一个自定义字段。`, 'success');
    }
    function saveCustomProfile() { const host = window.location.hostname; customProfiles[host] = currentProfile; GM_setValue('customProfiles', customProfiles); log.add(`✅ 已为 ${host} 保存规则。`, 'success'); }
    function loadCustomProfile() {
        const host = window.location.hostname;
        if (customProfiles[host]) {
            currentProfile = JSON.parse(JSON.stringify(customProfiles[host]));
            Object.keys(currentProfile).forEach(type => {
                if (type !== 'customFields') updateCustomUIMapping(type, currentProfile[type]);
            });
            setHTML(ui.customFieldsContainer, '');
            if (currentProfile.customFields) {
                currentProfile.customFields.forEach((field, index) => createCustomFieldRow(field, index));
            }
            log.add(`已加载 ${host} 的自定义规则。`, 'success');
        } else {
            currentProfile = {};
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
    async function fetchAndDisplayEmails() {
        setHTML(ui.mailboxList, '<li>正在加载邮件...</li>');
        const query = 'newer_than:10m in:anywhere';
        const messages = await MailHelper.fetchEmails(query);
        let seenIds = GM_getValue('seenEmailIds', []);

        setHTML(ui.mailboxList, '');
        if (messages.length === 0) {
            setHTML(ui.mailboxList, '<li>未找到最近的邮件。</li>');
            return;
        }

        messages.forEach(msg => {
            const li = document.createElement('li');
            const isNew = !seenIds.includes(msg.id);
            li.className = isNew ? 'new-email' : 'seen-email';

            const date = new Date(msg.date).toLocaleString();
            const html = `
                <span class="mail-sender">${msg.from}</span>
                <span class="mail-subject">${msg.subject}</span>
                <span class="mail-date">${date}</span>
                <button class="use-email-btn" data-message-id="${msg.id}">使用此邮件</button>
            `;
            setHTML(li, html);
            li.querySelector('.use-email-btn').addEventListener('click', async (e) => {
                const btn = e.target;
                const messageId = btn.dataset.messageId;
                btn.textContent = '处理中...';
                btn.disabled = true;

                if (!seenIds.includes(messageId)) {
                    seenIds.push(messageId);
                    if (seenIds.length > 50) seenIds = seenIds.slice(-50);
                    GM_setValue('seenEmailIds', seenIds);
                    btn.closest('li').className = 'seen-email';
                }

                await processSelectedEmail(messageId);
                btn.textContent = '使用此邮件';
                btn.disabled = false;
            });
            ui.mailboxList.appendChild(li);
        });
    }
    async function processSelectedEmail(messageId) {
        log.add('正在从选定邮件中提取验证码...', 'pending');
        const content = await MailHelper.getEmailContent(messageId);
        if (!content) {
            log.add('❌ 无法获取邮件内容。', 'error');
            return;
        }
        const code = MailHelper.extractVerificationCode(content);
        if (code) {
            log.add(`✅ 成功提取验证码: ${code}`, 'success');
            const verificationElements = findEmailVerificationElements();
            if (verificationElements && verificationElements.codeInput) {
                await simulateHumanTyping(verificationElements.codeInput, code);
                log.add('✅ 验证码已自动填入！', 'success');
            } else {
                log.add('⚠️ 未找到输入框，已将验证码复制到剪贴板。', 'log-warning');
                try {
                    await navigator.clipboard.writeText(code);
                    showToastNotification(`验证码 ${code} 已复制，请手动粘贴。`);
                } catch (err) {
                    console.error('复制到剪贴板失败:', err);
                    showToastNotification(`提取到验证码: ${code} (自动复制失败)`);
                }
            }
            // 无论是否找到输入框，都通知主流程验证码已处理
            if (verificationCodeResolver) {
                verificationCodeResolver(code);
                verificationCodeResolver = null; // 防止重复调用
            }
        } else {
            log.add('❌ 未能在邮件中找到验证码。', 'error');
        }
    }

    // --- 9. 主逻辑 ---
    async function handleLogin() {
        updateProgress(null, `[ACTION] 检测到登录页面，开始自动登录...`, 'log-action');
        await new Promise(res => setTimeout(res, 1000)); // 等待页面加载
        await Engine.fillForms(true, config.email, config.password);
        await Engine.findAndClickButton(['登录', 'Login', 'Sign In']);
    }

    async function runPageLogic() {
        log.clear();
        taskStartTime = Date.now();
        if (config.showDetailedProcess) showProgressModal();

        try {
            updateProgress(10, "启动智能等待引擎...", "log-monitor");
            await intelligentWaitEngine();

            updateProgress(20, "分析页面类型...", "log-analyze");
            const isLikelyRegisterPage = document.querySelectorAll('input[type="password"]').length > 1 || window.location.href.includes('register');

            if (config.autoFillEnabled) {
                await Engine.fillForms(true, config.email, config.password);
            }

            if (config.autoRegisterEnabled) {
                const verificationElements = findEmailVerificationElements();
                if (verificationElements) {
                    if (!config.appsScriptUrl) {
                        updateProgress(100, "❌ 检测到邮箱验证，但未配置邮件读取链接！请在“邮件设置”中配置。", 'log-error');
                        return;
                    }
                    updateProgress(70, `[MAIL] 发现验证码流程，点击发送按钮...`, 'log-action');
                    verificationElements.sendButton.click();

                    const verificationCodePromise = new Promise((resolve, reject) => {
                        verificationCodeResolver = resolve;
                        setTimeout(() => {
                            if (verificationCodeResolver) {
                                verificationCodeResolver = null;
                                reject(new Error("手动收信超时 (5分钟)"));
                            }
                        }, 300000);
                    });

                    let code = null;
                    try {
                        updateProgress(75, `[MAIL] ⏸️ 任务暂停，等待用户操作... 请点击“手动收信”按钮，找到验证码邮件后点击“使用此邮件”。`, 'log-pause');
                        code = await verificationCodePromise;
                    } catch (e) {
                        updateProgress(100, `[MAIL] ❌ ${e.message}。任务中止。`, 'log-error');
                        return;
                    }

                    if (code) {
                        updateProgress(90, `[ACTION] 验证码已处理。等待5秒，以便您手动粘贴或检查...`, 'log-pause');
                        await new Promise(res => setTimeout(res, 5000));
                        updateProgress(92, `[ACTION] 等待结束，尝试继续流程...`, 'log-action');
                    } else {
                        updateProgress(100, `[MAIL] ❌ 未能获取到验证码，任务中止。`, 'log-error');
                        return;
                    }
                }

                const keywords = isLikelyRegisterPage ? ['注册', 'Register', 'Sign Up', '创建'] : ['登录', 'Login', 'Sign In'];
                await Engine.findAndClickButton(keywords);
            } else {
                 updateProgress(100, "自动注册已关闭，任务结束。", "log-match");
            }

        } catch (error) {
            updateProgress(100, `❌ 发生意外错误: ${error.message}`, "log-error");
            log.add(`❌ 发生意外错误: ${error.message}`, 'error');
        }
    }

    function updateStartStopButtonUI() { if (isScriptRunning) { ui.startStopBtn.textContent = '停止运行'; ui.startStopBtn.style.backgroundColor = 'var(--helper-danger-color)'; } else { ui.startStopBtn.textContent = '开始运行'; ui.startStopBtn.style.backgroundColor = 'var(--helper-success-color)'; } }
    function fetchIpInfo() {
        const ipInfoElement = document.getElementById('helper-ip-info');
        if (!ipInfoElement) return;
        GM_xmlhttpRequest({
            method: "GET",
            url: "http://ip-api.com/json/",
            onload: function(response) {
                try {
                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);
                        if (data.status === 'success') {
                            setHTML(ipInfoElement, `当前IP: ${data.query} (${data.country}, ${data.city})`);
                            ipInfoElement.style.color = '#28a745';
                        } else {
                            setHTML(ipInfoElement, '无法获取IP地理位置');
                            ipInfoElement.style.color = '#ffc107';
                        }
                    } else {
                        setHTML(ipInfoElement, `IP查询失败 (状态: ${response.status})`);
                        ipInfoElement.style.color = '#dc3545';
                    }
                } catch (e) {
                    setHTML(ipInfoElement, '解析IP信息失败');
                    ipInfoElement.style.color = '#dc3545';
                }
            },
            onerror: function(response) {
                setHTML(ipInfoElement, '网络错误，无法查询IP');
                ipInfoElement.style.color = '#dc3545';
            }
        });
    }
    function initializeUI() {
        ui.emailInput.value = config.email;
        ui.passwordInput.value = config.password;
        ui.autofillToggle.checked = config.autoFillEnabled;
        ui.autoregisterToggle.checked = config.autoRegisterEnabled;
        ui.showDetailedToggle.checked = config.showDetailedProcess;
        ui.appsScriptUrlInput.value = config.appsScriptUrl;
        if (config.isMinimized) ui.container.classList.add('minimized');
        updateLockUI();
        updateStartStopButtonUI();
        fetchIpInfo();
        if (!config.appsScriptUrl) {
            log.add('请先配置邮件读取链接', 'error');
        } else {
            log.add('✅ 脚本已就绪。', 'success');
        }
    }

    // --- 启动器 ---
    const bodyObserver = new MutationObserver((mutations, obs) => { if (document.body) { createUI(); obs.disconnect(); } });
    bodyObserver.observe(document.documentElement, { childList: true });

})();
