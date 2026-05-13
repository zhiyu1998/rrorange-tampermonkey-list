// ==UserScript==
// @name         软考达人题目快速复制
// @namespace    https://ruankaodaren.com/
// @version      1.3.0
// @description  一键复制当前题目、选项和答案解析，支持图片转 Markdown
// @author       ChatGPT
// @match        https://ruankaodaren.com/exam/*
// @match        https://www.ruankaodaren.com/exam/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BTN_ID = 'rk-copy-question-btn';
    const ANSWER_BTN_ID = 'rk-copy-answer-btn';
    const TOAST_ID = 'rk-copy-toast';

    function cleanText(text) {
        return (text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function normalizeMarkdownLines(text) {
        return (text || '')
            .replace(/\u00a0/g, ' ')
            .split('\n')
            .map(line => line.replace(/[ \t]+/g, ' ').trim())
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    function toBlockquote(text) {
        const normalized = normalizeMarkdownLines(text);
        if (!normalized) return '';
        return normalized.split('\n').map(line => `> ${line}`).join('\n');
    }

    /**
     * 把元素中的 img 转成 Markdown 图片格式
     * 然后再提取文本
     */
    function getMarkdownTextFromElement(el) {
        if (!el) return '';

        const clone = el.cloneNode(true);

        // 把图片替换成 markdown 文本
        clone.querySelectorAll('img').forEach((img, index) => {
            const src = img.getAttribute('src') || '';
            const alt = cleanText(img.getAttribute('alt') || `图片${index + 1}`) || `图片${index + 1}`;
            const markdown = src ? `![${alt}](${src})` : '';
            const span = document.createElement('span');
            span.textContent = markdown;
            img.replaceWith(span);
        });

        return cleanText(clone.innerText || clone.textContent || '');
    }

    function getQuestionTitle() {
        const titleBox = document.querySelector('#answerInfotitle');
        if (!titleBox) return '';
        const titleClone = titleBox.cloneNode(true);
        titleClone.querySelectorAll('.secondChapterName').forEach(node => node.remove());
        return getMarkdownTextFromElement(titleClone);
    }

    /**
     * 把所有选项都抓出来，包括：
     * .options / .aWtrue / .aWFalse
     */
    function getOptions() {
        const optionContainers = Array.from(document.querySelectorAll(
            '.questionaw .options, .questionaw .aWtrue, .questionaw .aWFalse'
        ));

        return optionContainers.map(container => {
            const labelEl = container.querySelector('.awoption');
            const contentEl = container.querySelector('.content, .ql-editor');

            const label = cleanText(labelEl ? labelEl.innerText : '');
            const content = getMarkdownTextFromElement(contentEl || container);

            if (!label || !content) return '';
            return `${label}、${content}`;
        }).filter(Boolean);
    }

    function getCorrectAnswerText() {
        const answerBox = Array.from(document.querySelectorAll('.answer-to-the-question')).find(el => {
            return cleanText(el.innerText).includes('正确答案');
        });
        if (!answerBox) return '';

        const rightKey = Array.from(answerBox.querySelectorAll('.right-key')).find(el => {
            return cleanText(el.innerText).includes('正确答案');
        });

        return rightKey ? cleanText(rightKey.innerText) : '';
    }

    function getAnalysisText() {
        const analysisBox = Array.from(document.querySelectorAll('.answer-to-the-question')).find(el => {
            return cleanText(el.innerText).includes('解析');
        });
        if (!analysisBox) return '';
        const contentEl = analysisBox.querySelector('.right-key');
        const text = contentEl ? getMarkdownTextFromElement(contentEl) : '';
        return text ? `解析：${text.replace(/^解析[:：]\s*/, '')}` : '';
    }

    function buildMarkdown(config = {}) {
        const { includeAnswer = false } = config;
        const title = getQuestionTitle();
        const optionLines = getOptions();

        if (!title) {
            throw new Error('没有找到题干，请确认当前页面是否为题目页。');
        }

        const lines = [];
        lines.push(`## ${title}`);
        lines.push('');

        if (optionLines.length) {
            lines.push(...optionLines);
            lines.push('');
        }

        if (includeAnswer) {
            const answer = getCorrectAnswerText();
            const analysis = getAnalysisText();
            const quotedAnswer = toBlockquote([answer, analysis].filter(Boolean).join('\n'));

            if (!quotedAnswer) {
                throw new Error('没有找到答案或解析，请确认答案区域是否已展开。');
            }

            lines.push(quotedAnswer);
            lines.push('');
        }

        return lines.join('\n').trim();
    }

    async function copyText(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            return;
        }

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    function showToast(message, success = true) {
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            right: 24px;
            top: 136px;
            z-index: 999999;
            padding: 10px 14px;
            border-radius: 6px;
            color: #fff;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,.18);
            background: ${success ? '#67C23A' : '#F56C6C'};
            opacity: 1;
            transition: opacity .3s;
        `;

        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => {
            toast.style.opacity = '0';
        }, 1800);
    }

    function createFixedButton(id, text, title, top, background) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.textContent = text;
        btn.title = title;

        btn.style.cssText = `
            position: fixed;
            right: 24px;
            top: ${top}px;
            z-index: 999999;
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            background: ${background};
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,.2);
        `;

        return btn;
    }

    function addCopyButton() {
        if (document.getElementById(BTN_ID)) return;

        const btn = createFixedButton(
            BTN_ID,
            '复制题目',
            '复制当前题目，快捷键：Ctrl + Shift + C',
            36,
            '#409EFF'
        );

        btn.addEventListener('click', async () => {
            try {
                const markdown = buildMarkdown();
                await copyText(markdown);
                showToast('题目已复制');
                console.log('[软考达人题目复制]\n' + markdown);
            } catch (err) {
                console.error(err);
                showToast(err.message || '复制失败', false);
            }
        });

        document.body.appendChild(btn);
    }

    function addCopyAnswerButton() {
        if (document.getElementById(ANSWER_BTN_ID)) return;

        const btn = createFixedButton(
            ANSWER_BTN_ID,
            '复制答案',
            '复制当前题目、选项和答案解析，快捷键：Ctrl + Shift + A',
            84,
            '#E6A23C'
        );

        btn.addEventListener('click', async () => {
            try {
                const markdown = buildMarkdown({ includeAnswer: true });
                await copyText(markdown);
                showToast('答案已复制');
                console.log('[软考达人答案复制]\n' + markdown);
            } catch (err) {
                console.error(err);
                showToast(err.message || '复制失败', false);
            }
        });

        document.body.appendChild(btn);
    }

    document.addEventListener('keydown', async event => {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
            event.preventDefault();
            try {
                const markdown = buildMarkdown();
                await copyText(markdown);
                showToast('题目已复制');
                console.log('[软考达人题目复制]\n' + markdown);
            } catch (err) {
                console.error(err);
                showToast(err.message || '复制失败', false);
            }
        }
    });

    document.addEventListener('keydown', async event => {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyA') {
            event.preventDefault();
            try {
                const markdown = buildMarkdown({ includeAnswer: true });
                await copyText(markdown);
                showToast('答案已复制');
                console.log('[软考达人答案复制]\n' + markdown);
            } catch (err) {
                console.error(err);
                showToast(err.message || '复制失败', false);
            }
        }
    });

    function init() {
        addCopyButton();
        addCopyAnswerButton();
    }

    init();

    const observer = new MutationObserver(() => {
        addCopyButton();
        addCopyAnswerButton();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
