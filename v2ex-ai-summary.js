// ==UserScript==
// @name         V2EX帖子总结
// @version      1.0.0
// @description  为V2EX帖子添加AI总结功能
// @author       rrorange
// @match        *://*.v2ex.com/t/*
// @icon         https://www.v2ex.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.min.js
// @require      https://cdn.jsdelivr.net/npm/element-ui@2.15.13/lib/index.js
// @require      https://cdn.jsdelivr.net/npm/marked@4.0.18/marked.min.js
// @resource     elementCSS https://cdn.jsdelivr.net/npm/element-ui@2.15.13/lib/theme-chalk/index.css
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @license AGPL-3.0
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_CONFIG = {
        BASE_URL: 'https://api.openai.com/v1',
        API_KEY: '',
        MODEL: 'gpt-4o-mini'
    };

    const CONFIG = {
        BASE_URL: normalizeBaseUrl(GM_getValue('V2EX_SUMM_BASE_URL', DEFAULT_CONFIG.BASE_URL)),
        API_KEY: GM_getValue('V2EX_SUMM_API_KEY', DEFAULT_CONFIG.API_KEY),
        MODEL: GM_getValue('V2EX_SUMM_MODEL', DEFAULT_CONFIG.MODEL)
    };

    // 添加Element UI和自定义CSS
    const elementCSS = GM_getResourceText('elementCSS');
    GM_addStyle(elementCSS);
    GM_addStyle(`
    .cell.buttons, .inner.buttons, .topic_buttons{
border-radius:0px;
        }
        .linksumm-container {
            border-radius: 4px;
            padding: 15px;
            background: #f2f3f5;
            border: 1px solid #e3e8ef;
        }

        .linksumm-btn {
            margin: 10px 0;
        }

        .linksumm-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
            justify-content: center;
        }

        #linksumm-app .linksumm-btn.el-button--primary {
            background: #1e293b;
            border-color: #1e293b;
            color: #ffffff;
        }

        #linksumm-app .linksumm-btn.el-button--primary:hover,
        #linksumm-app .linksumm-btn.el-button--primary:focus {
            background: #24354c;
            border-color: #24354c;
            color: #ffffff;
        }

        #linksumm-app .linksumm-btn.el-button--default {
            background: #ffffff;
            border-color: #d3dce8;
            color: #1e293b;
        }

        #linksumm-app .linksumm-btn.el-button--default:hover,
        #linksumm-app .linksumm-btn.el-button--default:focus {
            background: #f8fafc;
            border-color: #1e293b;
            color: #1e293b;
        }

        .linksumm-loading {
            color: #334155;
            margin: 10px 0;
            text-align: center;
        }

        /* 优化结果区域样式 */
        .linksumm-result {
        font-size:14px;
            margin-top: 15px;
            text-align: left; /* 确保左对齐 */
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
        }

        .linksumm-result p {
            margin: 0.8em 0;
        }

        .linksumm-result h1,
        .linksumm-result h2,
        .linksumm-result h3,
        .linksumm-result h4 {
            margin: 1.2em 0 0.8em;
            color: #0f172a;
        }

        .linksumm-result ul,
        .linksumm-result ol {
            padding-left: 2em;
            margin: 0.8em 0;
        }

        .linksumm-result blockquote {
            border-left: 3px solid #cbd5e1;
            padding-left: 1em;
            margin: 1em 0;
            color: #475569;
        }

        .linksumm-result pre {
            background: #eef2f7;
            padding: 1em;
            border-radius: 3px;
            overflow: auto;
        }

        .linksumm-result code {
            font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
            background: rgba(30, 41, 59, 0.08);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-size: 85%;
        }

        .linksumm-footer {
            margin-top: 1.5em;
            padding-top: 1em;
            border-top: 1px solid #eee;
            font-size: 0.9em;
            color: #999;
            text-align: center;
        }

        .linksumm-footer a {
            color: #409EFF;
            text-decoration: none;
        }

        .linksumm-footer a:hover {
            text-decoration: underline;
        }

        /* 适配V2EX深色模式 */
        .night-mode .linksumm-container {
            background: #2a2a2a;
            border-color: #333;
        }

        .night-mode .linksumm-result {
            color: #ddd;
        }

        .night-mode .linksumm-result h1,
        .night-mode .linksumm-result h2,
        .night-mode .linksumm-result h3,
        .night-mode .linksumm-result h4 {
            color: #eee;
        }

        .night-mode .linksumm-result blockquote {
            border-left-color: #444;
            color: #bbb;
        }

        .night-mode .linksumm-result pre {
            background: #1e1e1e;
        }

        .night-mode .linksumm-result code {
            background: rgba(0, 0, 0, 0.3);
        }

        .night-mode .linksumm-footer {
            border-top-color: #444;
            color: #aaa;
        }
    `);

    // 设备检测函数
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function normalizeBaseUrl(url) {
        const trimmed = (url || '').trim();
        if (!trimmed) return '';

        return trimmed
            .replace(/\/chat\/completions\/?$/i, '')
            .replace(/\/completions\/?$/i, '')
            .replace(/\/+$/, '');
    }

    function escapeAttr(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function requestChatCompletion(options) {
        return new Promise((resolve, reject) => {
            const endpoint = `${options.baseUrl}/chat/completions`;
            const payload = {
                model: options.model,
                temperature: options.temperature !== undefined ? options.temperature : 0.3,
                stream: false,
                max_tokens: options.maxTokens,
                messages: options.messages
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${options.apiKey}`
                },
                data: JSON.stringify(payload),
                onload: (response) => {
                    if (response.status < 200 || response.status >= 300) {
                        let message = `请求失败，状态码: ${response.status}`;
                        try {
                            const err = JSON.parse(response.responseText || '{}');
                            message = err?.error?.message || err?.message || message;
                        } catch (e) {
                            // ignore parse error
                        }
                        reject(new Error(message));
                        return;
                    }

                    try {
                        const data = JSON.parse(response.responseText || '{}');
                        const content = data?.choices?.[0]?.message?.content;

                        if (!content) {
                            reject(new Error('API 返回为空，未获取到内容'));
                            return;
                        }

                        resolve(content);
                    } catch (e) {
                        reject(new Error('解析 API 响应失败'));
                    }
                },
                onerror: () => {
                    reject(new Error('网络错误，请检查 Base URL 是否可访问'));
                },
                ontimeout: () => {
                    reject(new Error('请求超时，请稍后重试'));
                },
                timeout: options.timeout || 90000
            });
        });
    }

    function showSettingsPanel() {
        const existed = document.getElementById('linksumm-settings-overlay');
        if (existed) {
            existed.remove();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'linksumm-settings-overlay';
        overlay.style.cssText = [
            'position: fixed',
            'inset: 0',
            'z-index: 999999',
            'background: rgba(0,0,0,0.55)',
            'display: flex',
            'align-items: center',
            'justify-content: center'
        ].join(';');

        overlay.innerHTML = `
            <div style="
                width: min(92vw, 480px);
                background: #ffffff;
                color: #1e293b;
                border-radius: 12px;
                box-shadow: 0 18px 48px rgba(0,0,0,0.28);
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            ">
                <div style="
                    padding: 14px 16px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-size: 16px;
                    font-weight: 600;
                ">
                    <span>V2EX AI 总结设置</span>
                    <button id="linksumm-settings-close" style="
                        border: none;
                        background: transparent;
                        font-size: 20px;
                        line-height: 1;
                        cursor: pointer;
                        color: #64748b;
                    ">×</button>
                </div>
                <div style="padding: 16px; display: grid; gap: 12px; background: #f2f3f5;">
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 13px; color: #475569;">Base URL</span>
                        <input id="linksumm-setting-base-url" type="text" value="${escapeAttr(CONFIG.BASE_URL || DEFAULT_CONFIG.BASE_URL)}" placeholder="https://api.openai.com/v1" style="
                            width: 100%;
                            padding: 10px 12px;
                            border: 1px solid #d3dce8;
                            border-radius: 8px;
                            font-size: 14px;
                            background: #ffffff;
                            color: #1e293b;
                            box-sizing: border-box;
                        " />
                    </label>
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 13px; color: #475569;">API Key</span>
                        <div style="position: relative;">
                            <input id="linksumm-setting-api-key" type="password" value="${escapeAttr(CONFIG.API_KEY)}" placeholder="sk-..." style="
                                width: 100%;
                                padding: 10px 40px 10px 12px;
                                border: 1px solid #d3dce8;
                                border-radius: 8px;
                                font-size: 14px;
                                background: #ffffff;
                                color: #1e293b;
                                box-sizing: border-box;
                            " />
                            <button id="linksumm-toggle-api-key" type="button" style="
                                position: absolute;
                                top: 50%;
                                right: 8px;
                                transform: translateY(-50%);
                                border: none;
                                background: transparent;
                                font-size: 14px;
                                cursor: pointer;
                                color: #1e293b;
                            ">显示</button>
                        </div>
                    </label>
                    <label style="display: grid; gap: 6px;">
                        <span style="font-size: 13px; color: #475569;">模型</span>
                        <input id="linksumm-setting-model" type="text" value="${escapeAttr(CONFIG.MODEL || DEFAULT_CONFIG.MODEL)}" placeholder="gpt-4o-mini" style="
                            width: 100%;
                            padding: 10px 12px;
                            border: 1px solid #d3dce8;
                            border-radius: 8px;
                            font-size: 14px;
                            background: #ffffff;
                            color: #1e293b;
                            box-sizing: border-box;
                        " />
                    </label>
                </div>
                <div style="
                    border-top: 1px solid #e2e8f0;
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                ">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button id="linksumm-settings-test" type="button" style="
                            padding: 8px 14px;
                            border: 1px solid #1e293b;
                            border-radius: 8px;
                            background: #ffffff;
                            color: #1e293b;
                            cursor: pointer;
                        ">测试连接</button>
                        <span id="linksumm-settings-test-result" style="font-size: 12px; color: #475569;"></span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="linksumm-settings-cancel" type="button" style="
                            padding: 8px 14px;
                            border: 1px solid #d3dce8;
                            border-radius: 8px;
                            background: #ffffff;
                            color: #1e293b;
                            cursor: pointer;
                        ">取消</button>
                        <button id="linksumm-settings-save" type="button" style="
                            padding: 8px 14px;
                            border: none;
                            border-radius: 8px;
                            background: #1e293b;
                            color: #ffffff;
                            cursor: pointer;
                        ">保存</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closePanel = () => overlay.remove();
        const closeBtn = overlay.querySelector('#linksumm-settings-close');
        const cancelBtn = overlay.querySelector('#linksumm-settings-cancel');
        const saveBtn = overlay.querySelector('#linksumm-settings-save');
        const testBtn = overlay.querySelector('#linksumm-settings-test');
        const baseInput = overlay.querySelector('#linksumm-setting-base-url');
        const apiKeyInput = overlay.querySelector('#linksumm-setting-api-key');
        const modelInput = overlay.querySelector('#linksumm-setting-model');
        const toggleBtn = overlay.querySelector('#linksumm-toggle-api-key');
        const testResult = overlay.querySelector('#linksumm-settings-test-result');

        if (!closeBtn || !cancelBtn || !saveBtn || !testBtn || !baseInput || !apiKeyInput || !modelInput || !toggleBtn || !testResult) {
            return;
        }

        const onEscClose = (event) => {
            if (event.key === 'Escape') {
                document.removeEventListener('keydown', onEscClose);
                closePanel();
            }
        };
        document.addEventListener('keydown', onEscClose);

        const wrappedClose = () => {
            document.removeEventListener('keydown', onEscClose);
            closePanel();
        };

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) wrappedClose();
        });
        closeBtn.addEventListener('click', wrappedClose);
        cancelBtn.addEventListener('click', wrappedClose);

        toggleBtn.addEventListener('click', () => {
            const show = apiKeyInput.type === 'password';
            apiKeyInput.type = show ? 'text' : 'password';
            toggleBtn.textContent = show ? '隐藏' : '显示';
        });

        testBtn.addEventListener('click', async () => {
            const testBaseUrl = normalizeBaseUrl(baseInput.value);
            const testApiKey = apiKeyInput.value.trim();
            const testModel = modelInput.value.trim() || DEFAULT_CONFIG.MODEL;

            if (!testBaseUrl) {
                testResult.textContent = 'Base URL 不能为空';
                testResult.style.color = '#d93025';
                baseInput.focus();
                return;
            }

            if (!testApiKey) {
                testResult.textContent = 'API Key 不能为空';
                testResult.style.color = '#d93025';
                apiKeyInput.focus();
                return;
            }

            testBtn.disabled = true;
            testBtn.textContent = '测试中...';
            testResult.textContent = '';

            try {
                await requestChatCompletion({
                    baseUrl: testBaseUrl,
                    apiKey: testApiKey,
                    model: testModel,
                    temperature: 0,
                    maxTokens: 8,
                    timeout: 30000,
                    messages: [
                        { role: 'system', content: 'You are a connectivity test assistant.' },
                        { role: 'user', content: 'Reply with OK.' }
                    ]
                });

                testResult.textContent = '连接成功';
                testResult.style.color = '#2e7d32';
            } catch (error) {
                testResult.textContent = `连接失败: ${error.message || '未知错误'}`;
                testResult.style.color = '#d93025';
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = '测试连接';
            }
        });

        saveBtn.addEventListener('click', () => {
            const nextBaseUrl = normalizeBaseUrl(baseInput.value);
            const nextApiKey = apiKeyInput.value.trim();
            const nextModel = modelInput.value.trim() || DEFAULT_CONFIG.MODEL;

            if (!nextBaseUrl) {
                alert('Base URL 不能为空');
                baseInput.focus();
                return;
            }

            CONFIG.BASE_URL = nextBaseUrl;
            CONFIG.API_KEY = nextApiKey;
            CONFIG.MODEL = nextModel;

            GM_setValue('V2EX_SUMM_BASE_URL', nextBaseUrl);
            GM_setValue('V2EX_SUMM_API_KEY', nextApiKey);
            GM_setValue('V2EX_SUMM_MODEL', nextModel);

            alert('设置已保存');
            wrappedClose();
        });
    }

    function collectReplyEntries() {
        const entries = [];
        const replyCells = Array.from(document.querySelectorAll('.cell[id^="r_"]'));

        replyCells.forEach((cell, index) => {
            const contentEl = cell.querySelector('.reply_content');
            const content = contentEl ? contentEl.textContent.replace(/\s+/g, ' ').trim() : '';
            if (!content) return;

            const floorText = (cell.querySelector('.fr .no')?.textContent || '').trim();
            const hasExactFloor = /^\d+$/.test(floorText);
            const floor = hasExactFloor ? floorText : String(index + 1);
            const username = (cell.querySelector('strong a[href^="/member/"]')?.textContent || 'unknown').trim();
            const agoEl = cell.querySelector('.ago');
            const timeText = (agoEl?.getAttribute('title') || agoEl?.textContent || '').trim();

            entries.push({
                floor,
                hasExactFloor,
                username,
                timeText,
                content
            });
        });

        if (entries.length > 0) return entries;

        // 兼容其他页面结构，至少保留顺序楼层
        const fallbackReplies = Array.from(document.querySelectorAll('.reply_content'));
        fallbackReplies.forEach((reply, index) => {
            const content = (reply.textContent || '').replace(/\s+/g, ' ').trim();
            if (!content) return;

            const cell = reply.closest('.cell');
            const username = (cell?.querySelector('strong a[href^="/member/"]')?.textContent || 'unknown').trim();
            entries.push({
                floor: String(index + 1),
                hasExactFloor: false,
                username,
                timeText: '',
                content
            });
        });

        return entries;
    }

    function buildReplySection(entries) {
        const lines = [];
        let totalLength = 0;
        const maxLength = 22000;

        for (const item of entries) {
            const timeText = item.timeText ? ` [${item.timeText}]` : '';
            const line = `${item.floor}楼 @${item.username}${timeText}: ${item.content}`;
            const nextLength = totalLength + line.length + 1;

            if (nextLength > maxLength) {
                lines.push('... [回复内容过长，已截断]');
                break;
            }

            lines.push(line);
            totalLength = nextLength;
        }

        return lines.join('\n');
    }

    function buildSummaryPrompt(pageTitle, pageUrl, topicText, replyEntries) {
        const clippedTopic = topicText.length > 8000
            ? `${topicText.slice(0, 8000)}\n\n[主帖内容过长，已截断]`
            : topicText;
        const replySection = buildReplySection(replyEntries);
        const exactFloorCount = replyEntries.filter(item => item.hasExactFloor).length;

        return [
            `标题: ${pageTitle}`,
            `链接: ${pageUrl}`,
            `回复数: ${replyEntries.length}（含明确楼层号 ${exactFloorCount} 条）`,
            '',
            '请基于以下 V2EX 帖子内容输出中文总结，要求：',
            '1. 先给出 3-5 条关键结论。',
            '2. 再给出主要争议点与不同观点。',
            '3. 引用回复观点时尽量带上楼层号（例如“5楼认为...”）。',
            '4. 最后给出对读者有帮助的建议或行动项。',
            '',
            '主帖内容：',
            clippedTopic || '[无主帖正文]',
            '',
            '回复内容（按楼层）：',
            replySection || '[无回复]'
        ].join('\n');
    }

    function requestSummaryFromApi(promptContent) {
        return new Promise((resolve, reject) => {
            const baseUrl = normalizeBaseUrl(CONFIG.BASE_URL);
            const apiKey = (CONFIG.API_KEY || '').trim();

            if (!baseUrl) {
                reject(new Error('未配置 Base URL，请点击“设置”按钮配置'));
                return;
            }

            if (!apiKey) {
                reject(new Error('未配置 API Key，请点击“设置”按钮配置'));
                return;
            }

            requestChatCompletion({
                baseUrl,
                apiKey,
                model: CONFIG.MODEL || DEFAULT_CONFIG.MODEL,
                temperature: 0.3,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个擅长提炼社区讨论内容的助手。请输出结构化、客观、简洁的中文 Markdown 总结。'
                    },
                    {
                        role: 'user',
                        content: promptContent
                    }
                ]
            }).then(resolve).catch(reject);
        });
    }

    // 等待页面加载完成
    window.addEventListener('load', function() {
        // 检查是否在帖子页面
        if (!document.querySelector('.content')) return;

        // 创建总结按钮容器
        // 根据设备类型选择不同的选择器
        const headerSelector = isMobileDevice() ? '.content .box' : '.topic_buttons';
        const header = document.querySelector(headerSelector);
        if (!header) return;

        const container = document.createElement('div');
        container.className = 'linksumm-container';
        header.parentNode.insertBefore(container, header.nextSibling);

        // 初始化Vue应用
        const appHTML = `
            <div id="linksumm-app">
                <div class="linksumm-actions">
                    <el-button
                        v-if="showButton"
                        round
                        class="linksumm-btn"
                        type="primary"
                        @click="startSummarization">
                        AI总结
                    </el-button>
                    <el-button
                        round
                        class="linksumm-btn"
                        @click="openSettings">
                        设置
                    </el-button>
                </div>

                <div v-if="isLoading" class="linksumm-loading">
                    正在总结中，请稍候...
                </div>

                <div v-if="errorMessage" class="linksumm-result">
                    <el-alert
                        :title="errorMessage"
                        type="error"
                        show-icon
                        :closable="false">
                    </el-alert>
                </div>

                <div v-if="outputContent" class="linksumm-result" v-html="outputContent"></div>
            </div>
        `;

        container.innerHTML = appHTML;

        // 配置marked
        marked.setOptions({
            gfm: true,
            breaks: false,
            pedantic: false,
            smartLists: true,
            smartypants: false
        });

        // 初始化Vue
        new Vue({
            el: '#linksumm-app',
            data() {
                return {
                    isLoading: false,
                    errorMessage: '',
                    outputContent: '',
                    summaryContent: '',
                    showButton:true,
                }
            },
            methods: {
                async startSummarization() {
                    if (this.isLoading) return;

                    this.isLoading = true;
                    this.errorMessage = '';
                    this.outputContent = '';
                    this.summaryContent = '';

                    try {
                        // 1. 获取当前页面内容
                        const pageUrl = window.location.href;
                        const pageTitle = document.title;
                        const topicContent = document.querySelector('.topic_content');
                        const topicText = topicContent ? topicContent.textContent.trim() : '';
                        const replyEntries = collectReplyEntries();

                        if (!topicText && replyEntries.length === 0) {
                            throw new Error('无法获取帖子内容');
                        }

                        // 2. 调用自定义 OpenAI 兼容接口获取总结
                        const promptContent = buildSummaryPrompt(pageTitle, pageUrl, topicText, replyEntries);
                        const summary = await requestSummaryFromApi(promptContent);

                        this.summaryContent = summary;
                        this.outputContent = marked.parse(summary);
                        this.showButton = false;

                    } catch (error) {
                        this.errorMessage = `错误: ${error.message || '发生未知错误'}`;
                        console.error('总结出错:', error);
                    } finally {
                        this.isLoading = false;
                    }
                },
                openSettings() {
                    showSettingsPanel();
                }
            }
        });
    });
})();
