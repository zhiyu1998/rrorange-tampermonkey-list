// ==UserScript==
// @name         Linux.do 楼主帖子快速截图 (带预览和复制)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  在 linux.do 帖子页面为楼主的帖子添加一个快速截图按钮。支持预览、复制到剪贴板和下载图片。截图字体和样式已美化。
// @author       YourName (优化 by AI)
// @match        https://linux.do/t/*
// @icon         https://linux.do/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    /* global html2canvas */

    // 常量定义
    const SCREENSHOT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px; vertical-align: -2px;"><path d="M4 4h4l2-2h4l2 2h4c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm8 3c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>';
    const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px; vertical-align: -2px;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    const SELECTORS = {
        POST: 'article#post_1',
        ACTIONS: '.actions',
        SCREENSHOT_BTN: '.ld-screenshot-btn',
        COPY_BTN: '.ld-copy-screenshot-btn'
    };
    const CANVAS_CONFIG = { padding: 20, radius: 16 }; // 增加了边距和圆角

    // 提取并美化CSS样式常量
    const BEAUTIFIED_LIGHT_MODE_CSS = `
        /* --- CSS变量定义，方便统一修改风格 --- */
        :root {
            --ld-bg-color: #ffffff;
            --ld-text-color: #1f2937;
            --ld-text-secondary-color: #4b5563;
            --ld-border-color: #e5e7eb;
            --ld-quote-bg: #f9fafb;
            --ld-code-bg: #f3f4f6;
            --ld-link-color: #2563eb;
            --ld-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
            --ld-font-mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
        }

        /* --- 基础样式重置 --- */
        article#post_1 {
            color-scheme: light !important;
            background-color: var(--ld-bg-color) !important;
            color: var(--ld-text-color) !important;
            font-family: var(--ld-font-sans) !important;
            line-height: 1.6 !important;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
            text-shadow: none !important;
        }

        /* --- 隐藏不需要的元素 --- */
        .post-menu-area, .topic-map, .actions {
            display: none !important;
        }

        /* --- 元素样式美化 --- */
        article#post_1 * {
            background-color: transparent !important;
            color: inherit !important;
            border-color: var(--ld-border-color) !important;
        }
        article#post_1 a {
            color: var(--ld-link-color) !important;
            text-decoration: none !important;
        }
        article#post_1 a:hover {
            text-decoration: underline !important;
        }
        article#post_1 h1, article#post_1 h2, article#post_1 h3 {
            font-weight: 600 !important;
            margin-bottom: 0.5em !important;
        }
        article#post_1 code, article#post_1 pre {
            font-family: var(--ld-font-mono) !important;
            background-color: var(--ld-code-bg) !important;
            border-radius: 6px !important;
            font-size: 0.9em !important;
        }
        article#post_1 pre code {
            display: block;
            padding: 1em !important;
            overflow-x: auto;
        }
        article#post_1 :not(pre) > code {
            padding: 0.2em 0.4em !important;
        }
        article#post_1 blockquote {
            background-color: var(--ld-quote-bg) !important;
            border-left: 4px solid var(--ld-border-color) !important;
            padding: 10px 15px !important;
            margin: 15px 0 !important;
            color: var(--ld-text-secondary-color) !important;
        }
        article#post_1 img, article#post_1 video {
            max-width: 100% !important;
            border-radius: 8px !important;
        }

        /* --- Onebox 卡片样式美化 --- */
        .onebox, aside.onebox {
            background-color: var(--ld-bg-color) !important;
            border: 1px solid var(--ld-border-color) !important;
            border-radius: 12px !important;
            margin: 1em 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
            display: block !important;
            clear: both !important;
        }
        .onebox header.source, .onebox .source {
            background-color: var(--ld-quote-bg) !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid var(--ld-border-color) !important;
        }
        .onebox .onebox-body {
            padding: 16px !important;
        }
        .onebox h3 a {
            color: var(--ld-text-color) !important;
            font-weight: 600 !important;
        }
        .onebox p {
            color: var(--ld-text-secondary-color) !important;
        }
        .onebox img.site-icon {
            border-radius: 4px !important;
        }
    `;

    GM_addStyle(`
        .ld-screenshot-btn {
            background-color: #3b82f6; color: white; border: none;
            padding: 6px 12px; border-radius: 5px; cursor: pointer;
            font-size: 14px; margin-left: 8px; transition: background-color 0.3s;
        }
        .ld-screenshot-btn:hover { background-color: #2563eb; }
        .ld-screenshot-btn:disabled { background-color: #9ca3af; cursor: not-allowed; }

        .ld-copy-screenshot-btn {
            background-color: #10b981; color: white; border: none;
            padding: 6px 12px; border-radius: 5px; cursor: pointer;
            font-size: 14px; margin-left: 4px; transition: background-color 0.3s;
        }
        .ld-copy-screenshot-btn:hover { background-color: #059669; }
        .ld-copy-screenshot-btn:disabled { background-color: #9ca3af; cursor: not-allowed; }

        .ld-preview-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s ease; padding: 20px;
            backdrop-filter: blur(2px);
        }
        .ld-preview-overlay.visible { opacity: 1; }

        .ld-preview-modal {
            background-color: #ffffff; padding: 30px; border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3); max-width: 90vw; max-height: 90vh;
            display: flex; flex-direction: column; position: relative;
            transform: scale(0.9); transition: all 0.3s ease;
        }
        .ld-preview-overlay.visible .ld-preview-modal { transform: scale(1); }

        .ld-preview-modal img {
            max-width: 100%; max-height: calc(90vh - 160px);
            object-fit: contain; border: 1px solid #e5e7eb; border-radius: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 8px;
            background-color: #f9fafb;
        }

        .ld-preview-title {
            color: #1f2937; font-size: 20px; text-align: center;
            margin: 0 0 25px 0; font-weight: 600; letter-spacing: -0.025em;
        }

        .ld-preview-actions {
            display: flex; justify-content: center; gap: 20px; margin-top: 25px;
        }

        .ld-preview-actions button {
            color: white; border: none; padding: 12px 24px;
            border-radius: 14px; cursor: pointer; font-size: 14px; font-weight: 500;
            transition: all 0.3s ease; position: relative; overflow: hidden;
        }
        .ld-preview-actions button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .ld-preview-actions button:disabled {
            opacity: 0.6; cursor: not-allowed; transform: none;
        }

        .ld-copy-btn {
            background-color: #10b981;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .ld-copy-btn:hover {
            background-color: #059669;
            box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
        }
        .ld-download-btn {
            background-color: #3b82f6;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .ld-download-btn:hover {
            background-color: #2563eb;
            box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
        }

        .ld-close-btn {
            position: absolute; top: 15px; right: 20px;
            background: rgba(107, 114, 128, 0.1); border: none; color: #6b7280;
            font-size: 24px; font-weight: bold; cursor: pointer;
            line-height: 1; padding: 8px; border-radius: 50%;
            width: 40px; height: 40px; display: flex; align-items: center;
            justify-content: center; transition: all 0.3s ease;
        }
        .ld-close-btn:hover {
            background: rgba(239, 68, 68, 0.1); color: #dc2626;
            transform: scale(1.1);
        }
    `);

    function resetButton(btn, text, icon = SCREENSHOT_ICON) {
        btn.innerHTML = icon + text;
        btn.disabled = false;
    }

    function showMessage(btn, msg, originalText, duration = 2000, icon = SCREENSHOT_ICON) {
        btn.innerHTML = icon + msg;
        btn.disabled = true;
        setTimeout(() => resetButton(btn, originalText, icon), duration);
    }

    function createRoundedCanvas(originalCanvas) {
        const { padding, radius } = CANVAS_CONFIG;
        const newCanvas = document.createElement('canvas');
        const ctx = newCanvas.getContext('2d');

        newCanvas.width = originalCanvas.width + padding * 2;
        newCanvas.height = originalCanvas.height + padding * 2;

        // 使用更柔和的背景色
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);

        const x = padding, y = padding, width = originalCanvas.width, height = originalCanvas.height;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(originalCanvas, padding, padding);

        return newCanvas;
    }

    function showPreviewModal(canvas, filename) {
        const overlay = document.createElement('div');
        overlay.className = 'ld-preview-overlay';

        const modal = document.createElement('div');
        modal.className = 'ld-preview-modal';
        modal.innerHTML = `
            <div class="ld-preview-title">截图预览</div>
            <button class="ld-close-btn">×</button>
            <img src="${canvas.toDataURL('image/png')}">
            <div class="ld-preview-actions">
                <button class="ld-copy-btn">复制到剪贴板</button>
                <button class="ld-download-btn">下载图片</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 10);

        const closeModal = () => {
            overlay.classList.remove('visible');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
            const screenshotBtn = document.querySelector(SELECTORS.SCREENSHOT_BTN);
            const copyBtn = document.querySelector(SELECTORS.COPY_BTN);
            if (screenshotBtn) resetButton(screenshotBtn, '截图');
            if (copyBtn) resetButton(copyBtn, '截图并复制', COPY_ICON);
        };

        modal.querySelector('.ld-close-btn').onclick = closeModal;
        overlay.onclick = (e) => e.target === overlay && closeModal();

        modal.querySelector('.ld-download-btn').onclick = (e) => {
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showMessage(e.target, '已下载!', '下载图片');
        };

        modal.querySelector('.ld-copy-btn').onclick = (e) => {
            if (!navigator.clipboard?.write) {
                alert('您的浏览器不支持剪贴板API');
                return;
            }
            e.target.textContent = '正在复制...';
            e.target.disabled = true;

            const roundedCanvas = createRoundedCanvas(canvas);
            roundedCanvas.toBlob(blob => {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    .then(() => showMessage(e.target, '已复制!', '复制到剪贴板'))
                    .catch(() => {
                        alert('复制失败');
                        showMessage(e.target, '复制失败', '复制到剪贴板');
                    });
            });
        };
    }

    // 辅助函数：处理SVG元素，确保html2canvas能正确渲染
    function fixSvgElements(element, svgInfos) {
        element.querySelectorAll('svg').forEach((svg, index) => {
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const info = svgInfos[index];
            if (info?.width && !svg.getAttribute('width')) svg.setAttribute('width', info.width);
            if (info?.height && !svg.getAttribute('height')) svg.setAttribute('height', info.height);
            if (!svg.getAttribute('viewBox') && svg.getAttribute('width') && svg.getAttribute('height')) {
                svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
            }
        });
    }

    // 核心截图函数
    function captureScreenshot(post, onSuccess, onError) {
        // 预先获取SVG尺寸信息，因为在克隆的DOM中可能无法正确获取
        const svgInfos = Array.from(post.querySelectorAll('svg')).map(svg => {
            const rect = svg.getBoundingClientRect();
            return { width: Math.round(rect.width), height: Math.round(rect.height) };
        });

        return html2canvas(post, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: null, // 背景由CSS控制
            scale: 1.5, // 提高分辨率，使字体更清晰
            logging: false,
            onclone: (doc) => {
                const element = doc.querySelector(SELECTORS.POST);
                if (!element) return;

                // 注入美化后的样式
                const style = doc.createElement('style');
                style.textContent = BEAUTIFIED_LIGHT_MODE_CSS;
                doc.head.appendChild(style);

                // 修复SVG
                fixSvgElements(element, svgInfos);

                // 插入帖子标题
                const title = document.querySelector('#topic-title');
                if (title) {
                    const clonedTitle = title.cloneNode(true);
                    Object.assign(clonedTitle.style, {
                        padding: '10px 15px',
                        marginBottom: '15px',
                        borderBottom: '2px solid var(--ld-border-color, #e5e7eb)'
                    });
                    element.insertBefore(clonedTitle, element.firstChild);
                }
            }
        }).then(onSuccess).catch(onError);
    }

    function takeScreenshot(post, btn) {
        btn.innerHTML = SCREENSHOT_ICON + '正在截图...';
        btn.disabled = true;

        captureScreenshot(post,
            (canvas) => {
                const title = document.title.replace(/ - linux.do$/, '').replace(/[\\/:*?"<>|]/g, '_');
                showPreviewModal(canvas, `linux.do-${title}-OP.png`);
            },
            (error) => {
                console.error('截图失败:', error);
                alert('截图失败，详情请查看控制台。');
                showMessage(btn, '截图失败', '截图');
            }
        );
    }

    function takeScreenshotAndCopy(post, btn) {
        if (!navigator.clipboard?.write) {
            alert('您的浏览器不支持剪贴板API');
            return;
        }

        btn.innerHTML = COPY_ICON + '正在截图并复制...';
        btn.disabled = true;

        captureScreenshot(post,
            (canvas) => {
                const roundedCanvas = createRoundedCanvas(canvas);
                roundedCanvas.toBlob(blob => {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                        .then(() => {
                            showMessage(btn, '已复制!', '截图并复制', 2000, COPY_ICON);
                        })
                        .catch((error) => {
                            console.error('复制失败:', error);
                            alert('复制失败，详情请查看控制台。');
                            showMessage(btn, '复制失败', '截图并复制', 2000, COPY_ICON);
                        });
                });
            },
            (error) => {
                console.error('截图失败:', error);
                alert('截图失败，详情请查看控制台。');
                showMessage(btn, '截图失败', '截图并复制', 2000, COPY_ICON);
            }
        );
    }

    function init() {
        const post = document.querySelector(SELECTORS.POST);
        const actions = post?.querySelector(SELECTORS.ACTIONS);

        if (!actions || actions.querySelector(SELECTORS.SCREENSHOT_BTN)) return;

        const screenshotBtn = document.createElement('button');
        screenshotBtn.innerHTML = SCREENSHOT_ICON + '截图';
        screenshotBtn.className = 'ld-screenshot-btn';
        screenshotBtn.onclick = () => takeScreenshot(post, screenshotBtn);
        actions.appendChild(screenshotBtn);

        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = COPY_ICON + '截图并复制';
        copyBtn.className = 'ld-copy-screenshot-btn';
        copyBtn.onclick = () => takeScreenshotAndCopy(post, copyBtn);
        actions.appendChild(copyBtn);
    }

    // 使用 MutationObserver 确保在页面动态加载内容后也能正确添加按钮
    const observer = new MutationObserver(() => {
        const targetExists = document.querySelector(`${SELECTORS.POST} ${SELECTORS.ACTIONS}`);
        if (targetExists && !document.querySelector(SELECTORS.SCREENSHOT_BTN)) {
            init();
            // 找到并初始化后可以停止观察，以节省资源
            // 但考虑到linux.do的SPA特性，持续观察可能更稳妥，这里保持观察
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
