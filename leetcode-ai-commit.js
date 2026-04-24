// ==UserScript==
// @name         力扣 AI 求解助手（API 直连版）
// @version      3.0
// @description  直接调用 AI API 获取题目解答，无需手动复制粘贴，支持配置面板与模板发送
// @author       RrOrange
// @match        https://leetcode.cn/problems/*
// @match        https://leetcode.com/problems/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @connect      api.deepseek.com
// @connect      api.openai.com
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // ================== 配置区 ==================
    const LANGUAGES = [
        'Java', 'Python', 'Python3', 'C++', 'C', 'C#',
        'JavaScript', 'TypeScript', 'Go', 'Rust', 'Swift', 'Kotlin',
        'Ruby', 'PHP', 'Scala', 'Racket', 'Erlang', 'Dart'
    ];

    const DEFAULTS = {
        API_URL: '',
        API_KEY: '',
        MODEL: 'deepseek-chat',
        DEFAULT_LANG: 'Java',
        MAX_TOKENS: 4096,
        TIMEOUT: 60000,
        AUTO_INSERT: true,
        AUTO_SUBMIT: false,
    };

    const CONFIG = {
        API_URL:      GM_getValue('API_URL',      DEFAULTS.API_URL),
        API_KEY:      GM_getValue('API_KEY',      DEFAULTS.API_KEY),
        MODEL:        GM_getValue('MODEL',         DEFAULTS.MODEL),
        DEFAULT_LANG: GM_getValue('DEFAULT_LANG',  DEFAULTS.DEFAULT_LANG),
        MAX_TOKENS:   GM_getValue('MAX_TOKENS',    DEFAULTS.MAX_TOKENS),
        TIMEOUT:      GM_getValue('TIMEOUT',       DEFAULTS.TIMEOUT),
        AUTO_INSERT:  GM_getValue('AUTO_INSERT',    DEFAULTS.AUTO_INSERT),
        AUTO_SUBMIT:  GM_getValue('AUTO_SUBMIT',    DEFAULTS.AUTO_SUBMIT),
    };

    function saveConfig() {
        GM_setValue('API_URL',      CONFIG.API_URL);
        GM_setValue('API_KEY',      CONFIG.API_KEY);
        GM_setValue('MODEL',        CONFIG.MODEL);
        GM_setValue('DEFAULT_LANG', CONFIG.DEFAULT_LANG);
        GM_setValue('MAX_TOKENS',   CONFIG.MAX_TOKENS);
        GM_setValue('TIMEOUT',      CONFIG.TIMEOUT);
        GM_setValue('AUTO_INSERT',  CONFIG.AUTO_INSERT);
        GM_setValue('AUTO_SUBMIT',  CONFIG.AUTO_SUBMIT);
    }

    function loadConfig() {
        CONFIG.API_URL      = GM_getValue('API_URL',      DEFAULTS.API_URL);
        CONFIG.API_KEY      = GM_getValue('API_KEY',      DEFAULTS.API_KEY);
        CONFIG.MODEL        = GM_getValue('MODEL',         DEFAULTS.MODEL);
        CONFIG.DEFAULT_LANG = GM_getValue('DEFAULT_LANG',  DEFAULTS.DEFAULT_LANG);
        CONFIG.MAX_TOKENS   = GM_getValue('MAX_TOKENS',    DEFAULTS.MAX_TOKENS);
        CONFIG.TIMEOUT      = GM_getValue('TIMEOUT',       DEFAULTS.TIMEOUT);
        CONFIG.AUTO_INSERT  = GM_getValue('AUTO_INSERT',    DEFAULTS.AUTO_INSERT);
        CONFIG.AUTO_SUBMIT  = GM_getValue('AUTO_SUBMIT',    DEFAULTS.AUTO_SUBMIT);
    }

    const BRIDGE_REQUEST_SOURCE = 'leetcode-ai-commit-userscript';
    const BRIDGE_RESPONSE_SOURCE = 'leetcode-ai-commit-page';
    const BRIDGE_INSERT_REQUEST_TYPE = 'LEETCODE_AI_COMMIT_INSERT_REQUEST';
    const BRIDGE_INSERT_RESPONSE_TYPE = 'LEETCODE_AI_COMMIT_INSERT_RESPONSE';
    const BRIDGE_READ_REQUEST_TYPE = 'LEETCODE_AI_COMMIT_READ_REQUEST';
    const BRIDGE_READ_RESPONSE_TYPE = 'LEETCODE_AI_COMMIT_READ_RESPONSE';

    // ================== 油猴菜单 ==================
    GM_registerMenuCommand('⚙️ 打开设置面板', () => openSettingsPanel());

    // ================== 添加按钮 ==================
    function addButton() {
        if (document.getElementById('ai-solve-btn')) return;

        const container = document.createElement('div');
        container.id = 'ai-btn-container';
        container.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; z-index: 99999;
            display: flex; gap: 10px; align-items: center;
        `;

        const btn = document.createElement('button');
        btn.id = 'ai-solve-btn';
        btn.innerHTML = '🧠 一键AI求解';
        btn.style.cssText = `
            padding: 12px 20px; background: #00b894; color: white;
            border: none; border-radius: 50px; font-size: 16px; font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,184,148,0.4); cursor: pointer;
            transition: all 0.3s;
        `;
        btn.onmouseover = () => btn.style.transform = 'scale(1.1)';
        btn.onmouseout = () => btn.style.transform = 'scale(1)';
        btn.onclick = handleSolve;

        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'ai-settings-btn';
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = '打开设置';
        settingsBtn.style.cssText = `
            width: 44px; height: 44px; background: #636e72; color: white;
            border: none; border-radius: 50%; font-size: 20px;
            box-shadow: 0 4px 15px rgba(99,110,114,0.4); cursor: pointer;
            transition: all 0.3s; display: flex; align-items: center; justify-content: center;
        `;
        settingsBtn.onmouseover = () => settingsBtn.style.transform = 'scale(1.1)';
        settingsBtn.onmouseout = () => settingsBtn.style.transform = 'scale(1)';
        settingsBtn.onclick = openSettingsPanel;

        container.appendChild(btn);
        container.appendChild(settingsBtn);
        document.body.appendChild(container);
    }

    // ================== Toast 提示 ==================
    function showToast(message, bgColor = '#00b894', duration = 3000) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 100px; right: 30px; 
            background: ${bgColor}; color: white;
            padding: 15px 25px; border-radius: 12px; font-size: 14px; 
            z-index: 999999; max-width: 350px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            line-height: 1.5;
        `;
        toast.innerHTML = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    // ================== 创建结果面板 ==================
    function createResultPanel() {
        let panel = document.getElementById('ai-result-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ai-result-panel';
            panel.style.cssText = `
                position: fixed; top: 80px; right: 20px; 
                width: 520px; max-height: 70vh;
                background: #1e1e1e; color: #d4d4d4;
                border-radius: 12px; z-index: 99999;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                font-family: 'Consolas', 'Monaco', monospace;
                overflow: hidden;
                border: 1px solid #333;
            `;
            document.body.appendChild(panel);
        }
        return panel;
    }

    // ================== 设置面板 ==================
    function openSettingsPanel() {
        let overlay = document.getElementById('ai-settings-overlay');
        if (overlay) { overlay.remove(); return; }

        overlay = document.createElement('div');
        overlay.id = 'ai-settings-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.6);
            z-index: 999999; display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        `;

        const langOptions = LANGUAGES.map(l =>
            `<option value="${l}" ${l === CONFIG.DEFAULT_LANG ? 'selected' : ''}>${l}</option>`
        ).join('');

        overlay.innerHTML = `
            <div style="
                width: 460px; background: #1e1e1e; color: #d4d4d4;
                border-radius: 16px; overflow: hidden;
                box-shadow: 0 16px 48px rgba(0,0,0,0.6);
                border: 1px solid #333; font-family: -apple-system, 'Segoe UI', sans-serif;
            ">
                <div style="padding: 18px 24px; background: #252526; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 18px; font-weight: bold; color: #4ec9b0;">⚙️ AI 求解助手设置</span>
                    <button id="settings-close-btn" style="background: none; border: none; color: #888; font-size: 22px; cursor: pointer; padding: 0 4px; line-height: 1;">✕</button>
                </div>
                <div style="padding: 24px; display: flex; flex-direction: column; gap: 18px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; color: #aaa;">🌐 API 地址</label>
                        <input id="setting-api-url" type="text" value="${escapeAttr(CONFIG.API_URL)}" placeholder="例如: https://api.deepseek.com/v1/chat/completions" style="
                            width: 100%; padding: 10px 14px; background: #2d2d2d; color: #e0e0e0;
                            border: 1px solid #444; border-radius: 8px; font-size: 14px; outline: none;
                            box-sizing: border-box;
                        " />
                        <div style="margin-top: 4px; font-size: 11px; color: #666;">完整 URL，含 /chat/completions 路径</div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; color: #aaa;">🔑 API Key</label>
                        <div style="position: relative;">
                            <input id="setting-api-key" type="password" value="${escapeAttr(CONFIG.API_KEY)}" placeholder="sk-..." style="
                                width: 100%; padding: 10px 40px 10px 14px; background: #2d2d2d; color: #e0e0e0;
                                border: 1px solid #444; border-radius: 8px; font-size: 14px; outline: none;
                                box-sizing: border-box;
                            " />
                            <button id="toggle-key-visibility" style="
                                position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
                                background: none; border: none; color: #888; font-size: 16px; cursor: pointer;
                            ">👁️</button>
                        </div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; color: #aaa;">🤖 模型名称</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input id="setting-model" type="text" list="model-list" value="${escapeAttr(CONFIG.MODEL)}" placeholder="输入或从列表选择模型" style="
                                flex: 1; padding: 10px 14px; background: #2d2d2d; color: #e0e0e0;
                                border: 1px solid #444; border-radius: 8px; font-size: 14px; outline: none;
                                box-sizing: border-box;
                            " />
                            <datalist id="model-list"></datalist>
                            <button id="fetch-models-btn" title="从 API 获取可用模型列表" style="
                                padding: 10px 14px; background: #0e639c; color: white;
                                border: none; border-radius: 8px; font-size: 14px;
                                cursor: pointer; white-space: nowrap; transition: all 0.2s;
                            ">🔄 获取模型</button>
                        </div>
                        <div style="margin-top: 4px; font-size: 11px; color: #666;">点击「获取模型」从 API 拉取可用模型列表，也可手动输入</div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; color: #aaa;">💻 编程语言</label>
                        <select id="setting-lang" style="
                            width: 100%; padding: 10px 14px; background: #2d2d2d; color: #e0e0e0;
                            border: 1px solid #444; border-radius: 8px; font-size: 14px; outline: none;
                            box-sizing: border-box; cursor: pointer;
                        ">${langOptions}</select>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 6px; font-size: 13px; color: #aaa;">📏 最大 Token</label>
                            <input id="setting-max-tokens" type="number" value="${CONFIG.MAX_TOKENS}" min="256" max="32768" style="
                                width: 100%; padding: 10px 14px; background: #2d2d2d; color: #e0e0e0;
                                border: 1px solid #444; border-radius: 8px; font-size: 14px; outline: none;
                                box-sizing: border-box;
                            " />
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 6px; font-size: 13px; color: #aaa;">⏱️ 超时 (秒)</label>
                            <input id="setting-timeout" type="number" value="${CONFIG.TIMEOUT / 1000}" min="5" max="120" style="
                                width: 100%; padding: 10px 14px; background: #2d2d2d; color: #e0e0e0;
                                border: 1px solid #444; border-radius: 8px; font-size: 14px; outline: none;
                                box-sizing: border-box;
                            " />
                        </div>
                    </div>
                    <label id="setting-auto-insert-label" style="display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 10px 14px; background: #2d2d2d; border-radius: 8px; border: 1px solid #444;">
                        <input id="setting-auto-insert" type="checkbox" ${CONFIG.AUTO_INSERT ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #00b894; cursor: pointer;" />
                        <span style="font-size: 14px; color: #e0e0e0;">🚀 自动填充代码到编辑器</span>
                    </label>
                    <label id="setting-auto-submit-label" style="display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 10px 14px; background: #2d2d2d; border-radius: 8px; border: 1px solid #444;">
                        <input id="setting-auto-submit" type="checkbox" ${CONFIG.AUTO_SUBMIT ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #00b894; cursor: pointer;" />
                        <span style="font-size: 14px; color: #e0e0e0;">📤 自动提交代码</span>
                    </label>
                    <div style="display: flex; gap: 12px; margin-top: 4px;">
                        <button id="settings-save-btn" style="
                            flex: 1; padding: 12px; background: #00b894; color: white;
                            border: none; border-radius: 10px; font-size: 15px; font-weight: bold;
                            cursor: pointer; transition: all 0.2s;
                        ">💾 保存设置</button>
                        <button id="settings-reset-btn" style="
                            padding: 12px 18px; background: #636e72; color: white;
                            border: none; border-radius: 10px; font-size: 15px;
                            cursor: pointer; transition: all 0.2s;
                        ">🔄</button>
                    </div>
                    <div id="settings-status" style="text-align: center; font-size: 13px; min-height: 20px;"></div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 关闭
        document.getElementById('settings-close-btn').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // 密码可见性切换
        document.getElementById('toggle-key-visibility').onclick = () => {
            const input = document.getElementById('setting-api-key');
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            document.getElementById('toggle-key-visibility').textContent = isPassword ? '🙈' : '👁️';
        };

        // 获取模型列表
        document.getElementById('fetch-models-btn').onclick = () => fetchModels();

        // 从缓存加载模型列表
        const currentApiUrl = document.getElementById('setting-api-url').value.trim();
        if (currentApiUrl) {
            const cachedModels = getCachedModels(currentApiUrl);
            if (cachedModels && cachedModels.length > 0) {
                populateModelDatalist(cachedModels);
            }
        }

        // 保存
        document.getElementById('settings-save-btn').onclick = () => {
            CONFIG.API_URL      = document.getElementById('setting-api-url').value.trim();
            CONFIG.API_KEY      = document.getElementById('setting-api-key').value.trim();
            CONFIG.MODEL        = document.getElementById('setting-model').value.trim();
            CONFIG.DEFAULT_LANG = document.getElementById('setting-lang').value;
            CONFIG.MAX_TOKENS   = parseInt(document.getElementById('setting-max-tokens').value, 10) || DEFAULTS.MAX_TOKENS;
            CONFIG.TIMEOUT      = (parseInt(document.getElementById('setting-timeout').value, 10) || 60) * 1000;
            CONFIG.AUTO_INSERT  = document.getElementById('setting-auto-insert').checked;
            CONFIG.AUTO_SUBMIT  = document.getElementById('setting-auto-submit').checked;

            saveConfig();

            const status = document.getElementById('settings-status');
            status.innerHTML = '<span style="color: #00b894;">✅ 设置已保存并立即生效！</span>';
            setTimeout(() => { status.innerHTML = ''; }, 3000);
        };

        // 重置
        document.getElementById('settings-reset-btn').onclick = () => {
            document.getElementById('setting-api-url').value    = DEFAULTS.API_URL;
            document.getElementById('setting-api-key').value    = DEFAULTS.API_KEY;
            document.getElementById('setting-model').value      = DEFAULTS.MODEL;
            document.getElementById('setting-lang').value       = DEFAULTS.DEFAULT_LANG;
            document.getElementById('setting-max-tokens').value = DEFAULTS.MAX_TOKENS;
            document.getElementById('setting-timeout').value    = DEFAULTS.TIMEOUT / 1000;
            document.getElementById('setting-auto-insert').checked = DEFAULTS.AUTO_INSERT;
            document.getElementById('setting-auto-submit').checked = DEFAULTS.AUTO_SUBMIT;
            document.getElementById('settings-status').innerHTML = '<span style="color: #f39c12;">⚠️ 已恢复默认值，请点击保存</span>';
        };
    }

    function escapeAttr(text) {
        return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ================== 模型列表缓存 ==================
    function getCacheKeyForApi(apiUrl) {
        let baseUrl = apiUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/completions\/?$/, '');
        baseUrl = baseUrl.replace(/\/+$/, '');
        return 'cached_models_' + baseUrl;
    }

    function getCachedModels(apiUrl) {
        const key = getCacheKeyForApi(apiUrl);
        const cached = GM_getValue(key, null);
        if (!cached) return null;
        try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed.models) && parsed.timestamp) {
                // 缓存有效期 24 小时
                if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                    return parsed.models;
                }
            }
        } catch (e) {}
        return null;
    }

    function setCachedModels(apiUrl, modelIds) {
        const key = getCacheKeyForApi(apiUrl);
        GM_setValue(key, JSON.stringify({ models: modelIds, timestamp: Date.now() }));
    }

    function populateModelDatalist(modelIds) {
        const datalist = document.getElementById('model-list');
        if (!datalist) return;
        datalist.innerHTML = '';
        modelIds.forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            datalist.appendChild(option);
        });
    }

    // ================== 获取模型列表 ==================
    function fetchModels() {
        const apiUrlInput = document.getElementById('setting-api-url');
        const apiKeyInput = document.getElementById('setting-api-key');
        const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

        if (!apiUrl) {
            showToast('❌ 请先填写 API 地址', '#e74c3c');
            return;
        }
        if (!apiKey) {
            showToast('❌ 请先填写 API Key', '#e74c3c');
            return;
        }

        // 从 API URL 中提取 base URL（去掉 /chat/completions 等路径）
        let baseUrl = apiUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/completions\/?$/, '');
        // 去掉末尾斜杠
        baseUrl = baseUrl.replace(/\/+$/, '');
        const modelsUrl = baseUrl + '/models';

        const btn = document.getElementById('fetch-models-btn');
        const originalHTML = btn ? btn.innerHTML : '🔄';
        if (btn) {
            btn.innerHTML = '⏳';
            btn.disabled = true;
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: modelsUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            timeout: 15000,
            onload: (response) => {
                try {
                    const data = JSON.parse(response.responseText);
                    // 兼容不同 API 的返回格式
                    const models = data.data || data.models || [];

                    const modelIds = models
                        .map(m => (typeof m === 'string' ? m : (m.id || m.name || '')))
                        .filter(id => id)
                        .sort((a, b) => a.localeCompare(b));

                    populateModelDatalist(modelIds);

                    // 缓存模型列表
                    setCachedModels(apiUrl, modelIds);

                    showToast(`✅ 获取到 ${modelIds.length} 个可用模型（已缓存），点击模型输入框查看列表`, '#00b894');
                } catch (e) {
                    showToast('❌ 解析模型列表失败: ' + e.message, '#e74c3c');
                }
                if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
            },
            onerror: () => {
                showToast('❌ 获取模型列表失败，请检查 API 地址和 Key', '#e74c3c');
                if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
            },
            ontimeout: () => {
                showToast('❌ 获取模型列表超时', '#e74c3c');
                if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
            }
        });
    }

    // ================== 自动检测当前编程语言 ==================
    function detectCurrentLanguage() {
        // 策略1：查找语言选择器按钮（aria-haspopup="dialog"）
        const langButtons = document.querySelectorAll('button[aria-haspopup="dialog"]');
        for (const btn of langButtons) {
            // 语言名称在按钮的第一个文本节点中，子元素是下拉箭头图标
            const text = btn.childNodes[0]?.textContent?.trim();
            if (text && LANGUAGES.includes(text)) {
                console.log('[AI求解] 自动检测到编程语言:', text);
                return text;
            }
        }

        // 策略2：从编辑器区域的语言标签查找
        const editorArea = document.querySelector('[data-track-load="code_editor"]');
        if (editorArea) {
            const buttons = editorArea.querySelectorAll('button');
            for (const btn of buttons) {
                const text = btn.childNodes[0]?.textContent?.trim();
                if (text && LANGUAGES.includes(text)) {
                    console.log('[AI求解] 从编辑器区域检测到编程语言:', text);
                    return text;
                }
            }
        }

        // 策略3：查找顶栏/工具栏中的语言选择器
        const toolbarLang = document.querySelector(
            '#editor-layout + div button, .h-full button'
        );
        if (toolbarLang) {
            const text = toolbarLang.childNodes[0]?.textContent?.trim();
            if (text && LANGUAGES.includes(text)) {
                console.log('[AI求解] 从工具栏检测到编程语言:', text);
                return text;
            }
        }

        console.log('[AI求解] 未能自动检测语言，将使用默认语言:', CONFIG.DEFAULT_LANG);
        return null;
    }

    // ================== 提取题目信息 ==================
    async function extractProblemInfo() {
        // 切换到描述 tab
        const descTab = document.querySelector('#description_tab');
        if (descTab && !descTab.closest('.flexlayout__tab_button--selected')) {
            descTab.click();
            await new Promise(r => setTimeout(r, 800));
        }

        const titleEl = document.querySelector('.text-title-large') || document.querySelector('h1');
        const title = titleEl ? titleEl.textContent.trim() : '未知题目';

        const descEl = document.querySelector('div[data-track-load="description_content"]');
        const description = descEl ? descEl.innerText.trim() : '无法提取描述';

        return { title, description };
    }

    // ================== 读取编辑器模板 ==================
    function readEditorContent() {
        let modelContent = '';
        try {
            const editors = getMonacoEditors();
            if (editors && editors.length > 0) {
                const editor = pickPrimaryMonacoEditor(editors);
                if (editor) {
                    const model = editor.getModel?.();
                    if (model) {
                        modelContent = normalizeEditorText(model.getValue?.() || '');
                        if (modelContent.trim()) {
                            return modelContent;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('从用户脚本上下文读取编辑器失败:', e);
        }

        const domFallback = readEditorContentFromMonacoDom();
        if (domFallback) {
            console.log('[AI求解] 使用 Monaco DOM 兜底读取模板');
            return domFallback;
        }

        return modelContent;
    }

    async function readEditorContentViaBridge(timeout = 2000) {
        installPageBridge();

        return new Promise((resolve) => {
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            let settled = false;

            const cleanup = () => {
                window.removeEventListener('message', handleMessage);
                clearTimeout(timer);
            };

            const finish = (result) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(result);
            };

            const handleMessage = (event) => {
                if (event.source !== window) return;
                const data = event.data;
                if (!data || data.source !== BRIDGE_RESPONSE_SOURCE || data.type !== BRIDGE_READ_RESPONSE_TYPE || data.requestId !== requestId) {
                    return;
                }
                finish(data);
            };

            const timer = setTimeout(() => {
                finish({ ok: false, content: '' });
            }, timeout);

            window.addEventListener('message', handleMessage);
            window.postMessage({
                source: BRIDGE_REQUEST_SOURCE,
                type: BRIDGE_READ_REQUEST_TYPE,
                requestId,
            }, '*');
        });
    }

    // ================== 构建 Prompt ==================
    function buildPrompt(title, description, editorTemplate, language) {
        const lang = language || CONFIG.DEFAULT_LANG;
        let templateSection = '';
        if (editorTemplate && editorTemplate.trim()) {
            templateSection = `

**当前编辑器中的代码模板**（请在此基础上填写实现，保留类名和方法签名）：
\`\`\`
${editorTemplate.trim()}
\`\`\`
`;
        }

        return `你是一个力扣顶级专家。请用 **${lang}** 解决以下题目。

**严格要求**：
1. 只输出完整可运行的代码，不要任何解释、前言、后语
2. 代码添加简洁的中文注释
3. 类名用 Solution，方法名按题目要求
4. 考虑所有边缘情况
${editorTemplate && editorTemplate.trim() ? '5. 基于编辑器模板填写实现，保持类名和方法签名不变' : ''}

题目：${title}

${description}
${templateSection}
直接输出代码：`;
    }

    // ================== API 错误信息优化 ==================
    function parseAPIError(status, responseText) {
        let data;
        try { data = JSON.parse(responseText); } catch (e) {}

        // 优先使用 API 返回的 error.message
        const apiMsg = data?.error?.message || data?.message || '';

        // 去掉 trace_id 等前缀，保留核心错误信息
        const cleanMsg = apiMsg.replace(/^\[trace_id:\s*\S+\]\s*/i, '').trim();

        switch (status) {
            case 401:
                return 'API Key 无效或已过期，请检查设置面板中的 Key';
            case 402:
            case 403:
                return cleanMsg
                    ? `API 权限不足：${cleanMsg}`
                    : 'API 权限不足，请检查账户余额或套餐';
            case 429:
                return cleanMsg
                    ? `请求频率过高：${cleanMsg}`
                    : '请求过于频繁，请稍后重试';
            case 500:
            case 502:
            case 503:
                return 'API 服务器暂时不可用，请稍后重试';
            default:
                if (cleanMsg) return cleanMsg;
                if (apiMsg) return apiMsg;
                return `API 返回错误 (HTTP ${status})`;
        }
    }

    // ================== 调用 API ==================
    function callAPI(prompt) {
        return new Promise((resolve, reject) => {
            if (!CONFIG.API_KEY) {
                reject(new Error('请先设置 API Key（点击 ⚙️ 按钮 → 设置面板）'));
                return;
            }

            if (!CONFIG.API_URL) {
                reject(new Error('请先设置 API 地址（点击 ⚙️ 按钮 → 设置面板）'));
                return;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.API_URL,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.API_KEY}`
                },
                data: JSON.stringify({
                    model: CONFIG.MODEL,
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: CONFIG.MAX_TOKENS,
                    temperature: 0.3
                }),
                timeout: CONFIG.TIMEOUT,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.choices && data.choices[0]) {
                            resolve(data.choices[0].message.content);
                        } else if (data.error || response.status >= 400) {
                            reject(new Error(parseAPIError(response.status, response.responseText)));
                        } else {
                            reject(new Error('API 返回格式异常'));
                        }
                    } catch (e) {
                        reject(new Error('解析响应失败: ' + e.message));
                    }
                },
                onerror: (error) => {
                    reject(new Error('网络请求失败，请检查 API 地址'));
                },
                ontimeout: () => {
                    reject(new Error('请求超时，请稍后重试'));
                }
            });
        });
    }

    // ================== 主处理函数 ==================
    async function handleSolve() {
        const btn = document.getElementById('ai-solve-btn');
        const originalText = btn.innerHTML;
        
        try {
            // 状态：提取中
            btn.innerHTML = '⏳ 提取题目...';
            btn.disabled = true;
            
            const { title, description } = await extractProblemInfo();

            // 状态：检测语言
            btn.innerHTML = '⏳ 检测编程语言...';
            const detectedLang = detectCurrentLanguage() || CONFIG.DEFAULT_LANG;

            // 状态：读取模板
            btn.innerHTML = '⏳ 读取编辑器模板...';

            let editorTemplate = readEditorContent();
            if (!editorTemplate) {
                const bridgeResult = await readEditorContentViaBridge();
                if (bridgeResult?.ok && bridgeResult.content) {
                    editorTemplate = bridgeResult.content;
                }
            }
            
            // 状态：请求中
            btn.innerHTML = `🚀 AI 思考中 (${detectedLang})...`;
            
            const prompt = buildPrompt(title, description, editorTemplate, detectedLang);
            const result = await callAPI(prompt);

            // 显示结果
            displayResult(title, result);

            // 自动插入编辑器
            if (CONFIG.AUTO_INSERT) {
                btn.innerHTML = '🚀 插入编辑器...';
                let cleanCode = result;
                const codeMatch = result.match(/```[\w]*\n?([\s\S]*?)```/);
                if (codeMatch) cleanCode = codeMatch[1].trim();
                await insertCodeToEditor(cleanCode);
            }

            // 自动提交
            if (CONFIG.AUTO_SUBMIT) {
                btn.innerHTML = '📤 提交中...';
                await new Promise(r => setTimeout(r, 500));
                await autoSubmit();
            }
            showToast(`✅ AI 解答完成！（${detectedLang}）`, '#00b894');
            
        } catch (error) {
            showToast(`❌ ${error.message}`, '#e74c3c', 5000);
            console.error('AI Solve Error:', error);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // ================== 显示结果 ==================
    function displayResult(title, code) {
        const panel = createResultPanel();
        
        let cleanCode = code;
        const codeMatch = code.match(/```[\w]*\n?([\s\S]*?)```/);
        if (codeMatch) {
            cleanCode = codeMatch[1].trim();
        }
        
        panel.innerHTML = `
            <div style="padding: 15px; background: #252526; border-bottom: 1px solid #333;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: #4ec9b0;">📝 ${title}</span>
                    <div>
                        <button id="copy-code-btn" style="padding: 6px 12px; background: #0e639c; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 8px;">📋 复制代码</button>
                        <button id="insert-code-btn" style="padding: 6px 12px; background: #00b894; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 8px;">🚀 一键插入编辑器</button>
                        <button id="close-panel-btn" style="padding: 6px 12px; background: #c42b1c; color: white; border: none; border-radius: 6px; cursor: pointer;">✕ 关闭</button>
                    </div>
                </div>
            </div>
            <div style="padding: 15px; overflow: auto; max-height: calc(70vh - 60px);">
                <pre style="margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6;">${escapeHtml(cleanCode)}</pre>
            </div>
        `;
        
        // 绑定事件
        document.getElementById('copy-code-btn').onclick = async () => {
            await navigator.clipboard.writeText(cleanCode);
            showToast('✅ 代码已复制到剪贴板！', '#00b894', 2000);
        };
        
        // 新增：一键插入
        document.getElementById('insert-code-btn').onclick = () => {
            insertCodeToEditor(cleanCode);
        };
        
        document.getElementById('close-panel-btn').onclick = () => {
            panel.remove();
        };
    }

    function getMonacoEditors() {
        const editors = [];

        try {
            const all = window.monaco?.editor?._instances ||
                        window.monaco?.editor?._editors ||
                        window.monaco?.editor?.getEditors?.();

            if (all) {
                if (Array.isArray(all)) return all;
                if (typeof all.values === 'function') return Array.from(all.values());
                if (typeof all === 'object') return Object.values(all);
            }
        } catch (e) {}

        // 从 DOM 里穷举绑定对象
        try {
            const nodes = document.querySelectorAll('.monaco-editor');
            const seen = new Set();

            for (const node of nodes) {
                for (const key in node) {
                    const value = node[key];
                    if (
                        value &&
                        typeof value.getModel === 'function' &&
                        typeof value.focus === 'function' &&
                        !seen.has(value)
                    ) {
                        seen.add(value);
                        editors.push(value);
                    }
                }
            }
        } catch (e) {}

        return editors;
    }

    function normalizeEditorText(text) {
        return String(text ?? '').replace(/\r\n/g, '\n');
    }

    function parseViewLineTop(lineNode, fallbackIndex = 0) {
        const fromStyleProp = Number.parseFloat(lineNode?.style?.top ?? '');
        if (Number.isFinite(fromStyleProp)) {
            return fromStyleProp;
        }

        const inlineStyle = lineNode?.getAttribute?.('style') || '';
        const match = inlineStyle.match(/top:\s*(-?\d+(?:\.\d+)?)px/i);
        if (match) {
            const parsed = Number.parseFloat(match[1]);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return fallbackIndex;
    }

    function readMonacoViewLinesContent(container) {
        if (!container) return '';

        const viewLinesRoots = Array.from(container.querySelectorAll('.view-lines'))
            .filter(root => root.querySelector('.view-line'));

        if (viewLinesRoots.length === 0) return '';

        const bestRoot = viewLinesRoots
            .map(root => ({
                root,
                lineCount: root.querySelectorAll('.view-line').length,
                area: (() => {
                    const rect = root.getBoundingClientRect?.();
                    return rect ? rect.width * rect.height : 0;
                })()
            }))
            .sort((a, b) => {
                if (b.lineCount !== a.lineCount) return b.lineCount - a.lineCount;
                return b.area - a.area;
            })[0]?.root;

        if (!bestRoot) return '';

        const lines = Array.from(bestRoot.querySelectorAll('.view-line'))
            .map((node, index) => ({
                index,
                top: parseViewLineTop(node, index),
                text: String(node.textContent ?? '')
                    .replace(/\u00a0/g, ' ')
                    .replace(/\u200b/g, '')
            }))
            .sort((a, b) => {
                if (a.top !== b.top) return a.top - b.top;
                return a.index - b.index;
            })
            .map(item => item.text);

        const content = normalizeEditorText(lines.join('\n'));
        return content.trim() ? content : '';
    }

    function readEditorContentFromMonacoDom() {
        const containers = [];
        const seen = new Set();

        const primaryContainer = getPrimaryMonacoContainer();
        if (primaryContainer) {
            containers.push(primaryContainer);
            seen.add(primaryContainer);
        }

        Array.from(document.querySelectorAll('.monaco-editor'))
            .filter(isVisibleElement)
            .forEach(container => {
                if (!seen.has(container)) {
                    seen.add(container);
                    containers.push(container);
                }
            });

        let bestContent = '';
        for (const container of containers) {
            const content = readMonacoViewLinesContent(container);
            if (content.length > bestContent.length) {
                bestContent = content;
            }
        }

        return bestContent;
    }

    function installPageBridge() {
        const script = document.createElement('script');
        const config = {
            requestSource: BRIDGE_REQUEST_SOURCE,
            responseSource: BRIDGE_RESPONSE_SOURCE,
            insertRequestType: BRIDGE_INSERT_REQUEST_TYPE,
            insertResponseType: BRIDGE_INSERT_RESPONSE_TYPE,
            readRequestType: BRIDGE_READ_REQUEST_TYPE,
            readResponseType: BRIDGE_READ_RESPONSE_TYPE,
        };

        script.textContent = `;(${function initPageBridge(bridgeConfig) {
            if (window.__leetcodeAiCommitPageBridgeInstalled) return;
            window.__leetcodeAiCommitPageBridgeInstalled = true;

            const normalizeText = (text) => String(text ?? '').replace(/\r\n/g, '\\n');

            const isVisibleElement = (node) => {
                if (!node) return false;
                const rect = node.getBoundingClientRect?.();
                return !!(node.offsetParent !== null && rect && rect.width > 0 && rect.height > 0);
            };

            const getPrimaryMonacoContainer = () => {
                const codeEditorContainer = document.querySelector('[data-track-load="code_editor"] .monaco-editor[data-uri]');
                if (isVisibleElement(codeEditorContainer)) {
                    return codeEditorContainer;
                }

                const activeContainer = document.activeElement?.closest?.('.monaco-editor');
                if (isVisibleElement(activeContainer)) {
                    return activeContainer;
                }

                const containers = Array.from(document.querySelectorAll('.monaco-editor'))
                    .filter(isVisibleElement)
                    .sort((a, b) => {
                        const rectA = a.getBoundingClientRect();
                        const rectB = b.getBoundingClientRect();
                        return (rectB.width * rectB.height) - (rectA.width * rectA.height);
                    });

                return containers[0] || null;
            };

            const getUriString = (uriLike) => {
                if (!uriLike) return '';

                try {
                    if (typeof uriLike.toString === 'function') {
                        return uriLike.toString();
                    }
                } catch (e) {}

                return String(uriLike);
            };

            const getMonacoEditorsInPage = () => {
                try {
                    const directEditors = window.monaco?.editor?.getEditors?.();
                    if (Array.isArray(directEditors) && directEditors.length > 0) {
                        return directEditors.filter(Boolean);
                    }
                } catch (e) {}

                const editors = [];
                const seen = new Set();

                try {
                    const nodes = document.querySelectorAll('.monaco-editor');
                    for (const node of nodes) {
                        for (const key in node) {
                            const value = node[key];
                            if (
                                value &&
                                typeof value.getModel === 'function' &&
                                typeof value.focus === 'function' &&
                                !seen.has(value)
                            ) {
                                seen.add(value);
                                editors.push(value);
                            }
                        }
                    }
                } catch (e) {}

                return editors;
            };

            const didModelAcceptCode = (model, code) => {
                const current = typeof model?.getValue === 'function' ? model.getValue() : '';
                return normalizeText(current) === normalizeText(code);
            };

            const getFullRange = (model) => {
                if (!model) return null;

                if (typeof model.getFullModelRange === 'function') {
                    return model.getFullModelRange();
                }

                const lastLineNumber = Math.max(model.getLineCount?.() || 1, 1);
                const lastColumn = model.getLineMaxColumn?.(lastLineNumber) || 1;

                if (window.monaco?.Range) {
                    return new window.monaco.Range(1, 1, lastLineNumber, lastColumn);
                }

                return {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: lastLineNumber,
                    endColumn: lastColumn
                };
            };

            const replaceEditorContent = (editor, code) => {
                const model = editor?.getModel?.();
                if (!model) return false;

                const normalizedCode = normalizeText(code);
                const fullRange = getFullRange(model);

                try {
                    editor.focus?.();
                    editor.pushUndoStop?.();

                    if (fullRange && typeof editor.executeEdits === 'function') {
                        const ok = editor.executeEdits('leetcode-ai-commit', [{
                            range: fullRange,
                            text: normalizedCode,
                            forceMoveMarkers: true
                        }]);

                        editor.pushUndoStop?.();
                        if (ok !== false && didModelAcceptCode(model, normalizedCode)) {
                            return true;
                        }
                    }
                } catch (e) {}

                try {
                    if (typeof model.setValue === 'function') {
                        model.setValue(normalizedCode);
                        return didModelAcceptCode(model, normalizedCode);
                    }
                } catch (e) {}

                return false;
            };

            // Score editor for finding the primary one
            const scoreEditor = (editor) => {
                try {
                    const domNode = editor?.getDomNode?.();
                    if (!domNode) return -1;
                    const rect = domNode.getBoundingClientRect();
                    const isVisible = isVisibleElement(domNode);
                    const isReadOnly = !!editor?.getRawOptions?.()?.readOnly;
                    let score = isVisible ? 1000 : 0;
                    score += editor?.hasTextFocus?.() ? 500 : 0;
                    score += editor?.hasWidgetFocus?.() ? 200 : 0;
                    score += Math.round((rect.width * rect.height) / 1000);
                    score -= isReadOnly ? 800 : 0;
                    const model = editor?.getModel?.();
                    if (model?.getLanguageId?.() && model.getLanguageId() !== 'plaintext') score += 50;
                    return score;
                } catch (e) { return -1; }
            };

            const pickPrimaryEditor = (editors) => {
                if (!editors?.length) return null;
                const preferredContainer = getPrimaryMonacoContainer();
                if (preferredContainer) {
                    const preferredUri = preferredContainer.getAttribute('data-uri');
                    const matched = editors.filter(e => {
                        try {
                            const domNode = e?.getDomNode?.();
                            const editorUri = domNode?.getAttribute?.('data-uri');
                            if (preferredUri && editorUri && preferredUri === editorUri) return true;
                            return !!(domNode && (domNode === preferredContainer || domNode.contains(preferredContainer) || preferredContainer.contains(domNode)));
                        } catch (err) { return false; }
                    });
                    if (matched.length) return matched.sort((a, b) => scoreEditor(b) - scoreEditor(a))[0];
                }
                return editors.filter(Boolean).sort((a, b) => scoreEditor(b) - scoreEditor(a))[0] || null;
            };

            const parseViewLineTop = (lineNode, fallbackIndex = 0) => {
                const fromStyleProp = Number.parseFloat(lineNode?.style?.top ?? '');
                if (Number.isFinite(fromStyleProp)) return fromStyleProp;

                const inlineStyle = lineNode?.getAttribute?.('style') || '';
                const match = inlineStyle.match(/top:\s*(-?\d+(?:\.\d+)?)px/i);
                if (match) {
                    const parsed = Number.parseFloat(match[1]);
                    if (Number.isFinite(parsed)) return parsed;
                }

                return fallbackIndex;
            };

            const readMonacoViewLinesContent = (container) => {
                if (!container) return '';

                const viewLinesRoots = Array.from(container.querySelectorAll('.view-lines'))
                    .filter(root => root.querySelector('.view-line'));
                if (!viewLinesRoots.length) return '';

                const bestRoot = viewLinesRoots
                    .map(root => ({
                        root,
                        lineCount: root.querySelectorAll('.view-line').length,
                        area: (() => {
                            const rect = root.getBoundingClientRect?.();
                            return rect ? rect.width * rect.height : 0;
                        })()
                    }))
                    .sort((a, b) => {
                        if (b.lineCount !== a.lineCount) return b.lineCount - a.lineCount;
                        return b.area - a.area;
                    })[0]?.root;

                if (!bestRoot) return '';

                const lines = Array.from(bestRoot.querySelectorAll('.view-line'))
                    .map((node, index) => ({
                        index,
                        top: parseViewLineTop(node, index),
                        text: String(node.textContent ?? '')
                            .replace(/\u00a0/g, ' ')
                            .replace(/\u200b/g, '')
                    }))
                    .sort((a, b) => {
                        if (a.top !== b.top) return a.top - b.top;
                        return a.index - b.index;
                    })
                    .map(item => item.text);

                const content = normalizeText(lines.join('\n'));
                return content.trim() ? content : '';
            };

            const readContentFromDomFallback = () => {
                const containers = [];
                const seen = new Set();

                const primary = getPrimaryMonacoContainer();
                if (primary) {
                    containers.push(primary);
                    seen.add(primary);
                }

                Array.from(document.querySelectorAll('.monaco-editor'))
                    .filter(isVisibleElement)
                    .forEach(container => {
                        if (!seen.has(container)) {
                            seen.add(container);
                            containers.push(container);
                        }
                    });

                let bestContent = '';
                for (const container of containers) {
                    const content = readMonacoViewLinesContent(container);
                    if (content.length > bestContent.length) {
                        bestContent = content;
                    }
                }

                return bestContent;
            };

            window.addEventListener('message', (event) => {
                if (event.source !== window) return;

                const data = event.data;
                if (!data || data.source !== bridgeConfig.requestSource) return;

                // ---- INSERT request ----
                if (data.type === bridgeConfig.insertRequestType) {
                    const respond = (payload) => {
                        window.postMessage({
                            source: bridgeConfig.responseSource,
                            type: bridgeConfig.insertResponseType,
                            requestId: data.requestId,
                            ...payload
                        }, '*');
                    };

                    try {
                        const code = normalizeText(data.code);
                        if (!code.trim()) {
                            respond({ ok: false, message: '没有可插入的代码' });
                            return;
                        }

                        const container = getPrimaryMonacoContainer();
                        container?.click?.();

                        const targetUri = container?.getAttribute?.('data-uri') || '';
                        const editors = getMonacoEditorsInPage();

                        const targetEditor = editors.find(editor => {
                            return getUriString(editor?.getModel?.()?.uri) === targetUri;
                        }) || editors.find(editor => {
                            const domNode = editor?.getDomNode?.();
                            return !!(domNode && isVisibleElement(domNode) && (domNode === container || domNode.contains?.(container) || container?.contains?.(domNode)));
                        }) || editors.find(editor => {
                            const domNode = editor?.getDomNode?.();
                            return isVisibleElement(domNode) && !editor?.getRawOptions?.()?.readOnly;
                        }) || null;

                        if (targetEditor && replaceEditorContent(targetEditor, code)) {
                            respond({
                                ok: true,
                                method: 'editor',
                                targetUri: getUriString(targetEditor?.getModel?.()?.uri) || targetUri,
                                editorCount: editors.length
                            });
                            return;
                        }

                        const models = window.monaco?.editor?.getModels?.() || [];
                        const targetModel = models.find(model => {
                            return getUriString(model?.uri) === targetUri;
                        }) || (models.length === 1 ? models[0] : null);

                        if (targetModel && typeof targetModel.setValue === 'function') {
                            targetModel.setValue(code);
                            if (didModelAcceptCode(targetModel, code)) {
                                respond({
                                    ok: true,
                                    method: 'model',
                                    targetUri: getUriString(targetModel?.uri) || targetUri,
                                    editorCount: editors.length,
                                    modelCount: models.length
                                });
                                return;
                            }
                        }

                        respond({
                            ok: false,
                            message: '未找到匹配的 Monaco editor/model',
                            targetUri,
                            editorCount: editors.length,
                            modelCount: models.length,
                            modelUris: models.map(model => getUriString(model?.uri))
                        });
                    } catch (error) {
                        respond({ ok: false, message: error?.message || String(error) });
                    }
                }

                // ---- READ request ----
                if (data.type === bridgeConfig.readRequestType) {
                    const respond = (payload) => {
                        window.postMessage({
                            source: bridgeConfig.responseSource,
                            type: bridgeConfig.readResponseType,
                            requestId: data.requestId,
                            ...payload
                        }, '*');
                    };

                    try {
                        const editors = getMonacoEditorsInPage();
                        const primary = pickPrimaryEditor(editors);
                        const model = primary?.getModel?.();
                        const modelContent = normalizeText(model?.getValue?.() || '');
                        const domContent = modelContent.trim() ? '' : readContentFromDomFallback();
                        const content = modelContent.trim() ? modelContent : domContent;

                        if (content.trim()) {
                            respond({
                                ok: true,
                                content,
                                targetUri: getUriString(model?.uri),
                                editorCount: editors.length,
                                method: modelContent.trim() ? 'model' : 'dom'
                            });
                        } else {
                            respond({ ok: false, content: '', editorCount: editors.length });
                        }
                    } catch (error) {
                        respond({ ok: false, content: '', message: error?.message || String(error) });
                    }
                }
            });
        }})(${JSON.stringify(config)});`;

        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    function requestPageEditorInsert(code, timeout = 2000) {
        installPageBridge();

        return new Promise((resolve) => {
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            let settled = false;

            const cleanup = () => {
                window.removeEventListener('message', handleMessage);
                clearTimeout(timer);
            };

            const finish = (result) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(result);
            };

            const handleMessage = (event) => {
                if (event.source !== window) return;

                const data = event.data;
                if (
                    !data ||
                    data.source !== BRIDGE_RESPONSE_SOURCE ||
                    data.type !== BRIDGE_INSERT_RESPONSE_TYPE ||
                    data.requestId !== requestId
                ) {
                    return;
                }

                finish(data);
            };

            const timer = setTimeout(() => {
                finish({
                    ok: false,
                    message: '页面桥接超时'
                });
            }, timeout);

            window.addEventListener('message', handleMessage);
            window.postMessage({
                source: BRIDGE_REQUEST_SOURCE,
                type: BRIDGE_INSERT_REQUEST_TYPE,
                requestId,
                code: normalizeEditorText(code)
            }, '*');
        });
    }

    function isVisibleElement(node) {
        if (!node) return false;

        const rect = node.getBoundingClientRect?.();
        return !!(
            node.offsetParent !== null &&
            rect &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function getPrimaryMonacoContainer() {
        const codeEditorContainer = document.querySelector('[data-track-load="code_editor"] .monaco-editor[data-uri]');
        if (isVisibleElement(codeEditorContainer)) {
            return codeEditorContainer;
        }

        const activeContainer = document.activeElement?.closest?.('.monaco-editor');
        if (isVisibleElement(activeContainer)) {
            return activeContainer;
        }

        const containers = Array.from(document.querySelectorAll('.monaco-editor'))
            .filter(isVisibleElement)
            .sort((a, b) => {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();
                return (rectB.width * rectB.height) - (rectA.width * rectA.height);
            });

        return containers[0] || null;
    }

    function getMonacoUriString(uriLike) {
        if (!uriLike) return '';

        try {
            if (typeof uriLike.toString === 'function') {
                return uriLike.toString();
            }
        } catch (e) {}

        return String(uriLike);
    }

    function findMonacoModelByUri(uri) {
        const targetUri = getMonacoUriString(uri);
        if (!targetUri || !window.monaco?.editor?.getModels) return null;

        try {
            return window.monaco.editor.getModels().find(model => {
                return getMonacoUriString(model?.uri) === targetUri;
            }) || null;
        } catch (e) {
            console.warn('通过 uri 查找 Monaco model 失败:', e);
            return null;
        }
    }

    function getEditorFullRange(editor) {
        const model = editor?.getModel?.();
        if (!model) return null;

        if (typeof model.getFullModelRange === 'function') {
            return model.getFullModelRange();
        }

        const lastLineNumber = Math.max(model.getLineCount?.() || 1, 1);
        const lastColumn = model.getLineMaxColumn?.(lastLineNumber) || 1;

        if (window.monaco?.Range) {
            return new window.monaco.Range(1, 1, lastLineNumber, lastColumn);
        }

        return {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: lastLineNumber,
            endColumn: lastColumn
        };
    }

    function scoreMonacoEditor(editor) {
        try {
            const domNode = editor?.getDomNode?.();
            if (!domNode) return -1;

            const rect = domNode.getBoundingClientRect();
            const isVisible = isVisibleElement(domNode);
            const isReadOnly = !!editor?.getRawOptions?.()?.readOnly;

            let score = isVisible ? 1000 : 0;
            score += editor?.hasTextFocus?.() ? 500 : 0;
            score += editor?.hasWidgetFocus?.() ? 200 : 0;
            score += Math.round((rect.width * rect.height) / 1000);
            score -= isReadOnly ? 800 : 0;

            const model = editor?.getModel?.();
            if (model?.getLanguageId?.() && model.getLanguageId() !== 'plaintext') {
                score += 50;
            }

            return score;
        } catch (e) {
            return -1;
        }
    }

    function pickPrimaryMonacoEditor(editors) {
        if (!Array.isArray(editors) || editors.length === 0) return null;

        const preferredContainer = getPrimaryMonacoContainer();
        if (preferredContainer) {
            const preferredUri = preferredContainer.getAttribute('data-uri');
            const matchedEditors = editors.filter(editor => {
                try {
                    const domNode = editor?.getDomNode?.();
                    const editorUri = domNode?.getAttribute?.('data-uri');

                    if (preferredUri && editorUri && preferredUri === editorUri) {
                        return true;
                    }

                    return !!(
                        domNode &&
                        (domNode === preferredContainer ||
                         domNode.contains(preferredContainer) ||
                         preferredContainer.contains(domNode))
                    );
                } catch (e) {
                    return false;
                }
            });

            if (matchedEditors.length > 0) {
                return matchedEditors
                    .sort((a, b) => scoreMonacoEditor(b) - scoreMonacoEditor(a))[0] || null;
            }
        }

        return editors
            .filter(Boolean)
            .sort((a, b) => scoreMonacoEditor(b) - scoreMonacoEditor(a))[0] || null;
    }

    function didEditorAcceptCode(model, code) {
        const current = typeof model?.getValue === 'function' ? model.getValue() : '';
        return normalizeEditorText(current) === normalizeEditorText(code);
    }

    function replaceMonacoEditorContent(editor, code) {
        const model = editor?.getModel?.();
        if (!model) return false;

        const normalizedCode = normalizeEditorText(code);
        const fullRange = getEditorFullRange(editor);

        try {
            editor.focus?.();
            editor.pushUndoStop?.();

            if (fullRange && typeof editor.executeEdits === 'function') {
                const ok = editor.executeEdits('leetcode-ai-commit', [{
                    range: fullRange,
                    text: normalizedCode,
                    forceMoveMarkers: true
                }]);

                editor.pushUndoStop?.();
                if (ok !== false && didEditorAcceptCode(model, normalizedCode)) {
                    return true;
                }
            }
        } catch (e) {
            console.warn('Monaco executeEdits 覆盖失败:', e);
        }

        try {
            if (typeof model.setValue === 'function') {
                model.setValue(normalizedCode);
                return didEditorAcceptCode(model, normalizedCode);
            }
        } catch (e) {
            console.warn('Monaco model.setValue 覆盖失败:', e);
        }

        return false;
    }

    // ================== 一键插入编辑器（强制覆盖版） ==================
    async function insertCodeToEditor(code) {
        if (!code || !code.trim()) {
            showToast('❌ 没有可插入的代码', '#e74c3c');
            return;
        }

        try {
            const result = await requestPageEditorInsert(code);
            if (result?.ok) {
                showToast('🚀 已清空模板并完整写入代码！', '#00b894', 3500);
                return;
            }

            console.warn('page bridge insert failed:', result);
            await navigator.clipboard.writeText(code);
            showToast(`⚠️ ${result?.message || '未定位到当前可写编辑器'}，代码已复制到剪贴板`, '#f39c12', 5000);

        } catch (err) {
            console.error('insertCodeToEditor error:', err);

            try {
                await navigator.clipboard.writeText(code);
                showToast('❌ 自动覆盖失败，代码已复制到剪贴板', '#e74c3c', 5000);
            } catch (e) {
                showToast('❌ 插入失败，请手动清空模板后粘贴', '#e74c3c', 5000);
            }
        }
    }



    // ================== 自动提交 ==================
    async function autoSubmit(maxRetries = 10, interval = 500) {
        const submitBtn =
            document.querySelector('[data-e2e-locator="console-submit-button"]') ||
            document.querySelector('button[aria-label="提交"]');

        if (!submitBtn) {
            showToast('⚠️ 未找到提交按钮，请手动提交', '#f39c12', 4000);
            return false;
        }

        // 如果按钮当前不可用（disabled），短暂等待后重试
        for (let i = 0; i < maxRetries; i++) {
            if (!submitBtn.disabled) {
                submitBtn.click();
                showToast('📤 已自动提交代码！', '#00b894', 3000);
                return true;
            }
            await new Promise(r => setTimeout(r, interval));
        }

        showToast('⚠️ 提交按钮暂时不可用，请手动提交', '#f39c12', 4000);
        return false;
    }

    // ================== HTML 转义 ==================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ================== 自动运行 ==================
    const observer = new MutationObserver(() => {
        if (location.pathname.includes('/problems/')) {
            addButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (location.pathname.includes('/problems/')) {
        installPageBridge();
        setTimeout(addButton, 1500);
    }
})();
