// ==UserScript==
// @name         Linux.do 快速复制主帖Markdown
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  快速复制Linux.do主帖子内容为Markdown格式到剪切板
// @author       RrOrange
// @match        https://linux.do/t/*/*
// @grant        none
// @license      MIT
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// ==/UserScript==

(function() {
    'use strict';

    // HTML转Markdown的转换函数
    function htmlToMarkdown(html) {
        // 创建临时div来处理HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // 递归转换HTML元素为Markdown
        function convertElement(element) {
            if (element.nodeType === Node.TEXT_NODE) {
                return element.textContent;
            }

            if (element.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }

            const tagName = element.tagName.toLowerCase();
            const children = Array.from(element.childNodes).map(convertElement).join('');

            switch (tagName) {
                case 'h1':
                    return `# ${children}\n\n`;
                case 'h2':
                    return `## ${children}\n\n`;
                case 'h3':
                    return `### ${children}\n\n`;
                case 'h4':
                    return `#### ${children}\n\n`;
                case 'h5':
                    return `##### ${children}\n\n`;
                case 'h6':
                    return `###### ${children}\n\n`;
                case 'p':
                    return `${children}\n\n`;
                case 'strong':
                case 'b':
                    return `**${children}**`;
                case 'em':
                case 'i':
                    return `*${children}*`;
                case 'a':
                    const href = element.getAttribute('href');
                    if (href && href !== '#') {
                        return `[${children}](${href})`;
                    }
                    return children;
                case 'ul':
                    return `${children}\n`;
                case 'ol':
                    return `${children}\n`;
                case 'li':
                    const parent = element.parentElement;
                    if (parent && parent.tagName.toLowerCase() === 'ol') {
                        return `1. ${children}\n`;
                    } else {
                        return `- ${children}\n`;
                    }
                case 'blockquote':
                    return `> ${children.replace(/\n/g, '\n> ')}\n\n`;
                case 'code':
                    if (element.parentElement && element.parentElement.tagName.toLowerCase() === 'pre') {
                        return children;
                    }
                    return `\`${children}\``;
                case 'pre':
                    return `\`\`\`\n${children}\n\`\`\`\n\n`;
                case 'br':
                    return '\n';
                case 'hr':
                    return '---\n\n';
                case 'img':
                    const src = element.getAttribute('src');
                    const alt = element.getAttribute('alt') || '';
                    const title = element.getAttribute('title') || '';
                    if (src) {
                        // 检查是否是emoji
                        if (src.includes('emoji') || element.classList.contains('emoji')) {
                            return alt || title || '';
                        }
                        return `![${alt}](${src}${title ? ` "${title}"` : ''})`;
                    }
                    return alt;
                case 'table':
                    return convertTable(element);
                case 'div':
                case 'span':
                case 'section':
                    // 检查是否是特殊的div（如表格包装器）
                    if (element.classList.contains('md-table') || 
                        element.classList.contains('fullscreen-table-wrapper')) {
                        return children;
                    }
                    return children;
                default:
                    return children;
            }
        }

        // 处理表格转换
        function convertTable(table) {
            const rows = Array.from(table.querySelectorAll('tr'));
            if (rows.length === 0) return '';

            let markdown = '';
            const headers = Array.from(rows[0].querySelectorAll('th, td'));
            
            if (headers.length > 0) {
                // 表头
                markdown += '| ' + headers.map(th => convertElement(th).trim()).join(' | ') + ' |\n';
                // 分隔线
                markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
                
                // 数据行
                for (let i = 1; i < rows.length; i++) {
                    const cells = Array.from(rows[i].querySelectorAll('td, th'));
                    if (cells.length > 0) {
                        markdown += '| ' + cells.map(td => convertElement(td).trim()).join(' | ') + ' |\n';
                    }
                }
            }
            
            return markdown + '\n';
        }

        return convertElement(tempDiv).trim();
    }

    // 复制文本到剪切板
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const success = document.execCommand('copy');
                document.body.removeChild(textArea);
                return success;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    // 提取主帖内容
    function extractMainPostContent() {
        // 查找主帖（第一个帖子）
        const mainPost = document.querySelector('article#post_1');
        if (!mainPost) {
            return null;
        }

        // 查找帖子内容区域
        const postBody = mainPost.querySelector('.topic-body.clearfix');
        if (!postBody) {
            return null;
        }

        // 克隆内容以避免修改原DOM
        const contentClone = postBody.cloneNode(true);
        
        // 移除不需要的元素
        const elementsToRemove = [
            '.topic-meta-data',      // 用户信息
            '.post-infos',           // 发布信息
            '.post-controls',        // 控制按钮
            '.post-menu-area',       // 菜单区域
            '.post-actions',         // 操作区域
            '.small-user-list',      // 用户列表
            '.discourse-reactions',  // 反应按钮
            '.post__menu-area',      // 菜单区域
            '.topic-map',            // 主题地图
            '.cooked-selection-barrier', // 选择屏障
            'nav',                   // 导航
            '.btn',                  // 按钮
            'button'                 // 所有按钮
        ];

        elementsToRemove.forEach(selector => {
            const elements = contentClone.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });

        return contentClone.innerHTML;
    }

    // 创建原生样式的复制按钮
    function createNativeCopyButton() {
        const button = document.createElement('button');
        button.className = 'btn btn-icon-text btn-default copy-markdown-button';
        button.type = 'button';
        
        // 创建图标SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        // 对于SVG元素，使用setAttribute而不是className
        svg.setAttribute('class', 'd-icon icon icon-tabler icon-tabler-copy');
        
        // 添加路径元素
        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('stroke', 'none');
        path1.setAttribute('d', 'M0 0h24v24H0z');
        path1.setAttribute('fill', 'none');
        
        const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect1.setAttribute('x', '8');
        rect1.setAttribute('y', '8');
        rect1.setAttribute('width', '12');
        rect1.setAttribute('height', '12');
        rect1.setAttribute('rx', '2');
        
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2');
        
        svg.appendChild(path1);
        svg.appendChild(rect1);
        svg.appendChild(path2);
        
        // 创建按钮标签
        const label = document.createElement('span');
        label.className = 'd-button-label';
        label.textContent = '复制Markdown';
        
        button.appendChild(svg);
        button.appendChild(label);

        button.addEventListener('click', async () => {
            const originalContent = label.textContent;
            
            // 显示加载状态
            label.textContent = '正在复制...';
            button.disabled = true;

            try {
                const content = extractMainPostContent();
                if (!content) {
                    label.textContent = '未找到内容';
                    setTimeout(() => {
                        label.textContent = originalContent;
                        button.disabled = false;
                    }, 2000);
                    return;
                }

                const markdown = htmlToMarkdown(content);
                const success = await copyToClipboard(markdown);

                if (success) {
                    // 更换为成功图标
                    svg.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10"/>';
                    label.textContent = '复制成功';
                    
                    // 显示sweetalert2提示
                    Swal.fire({
                        icon: 'success',
                        title: '复制成功',
                        text: '主帖Markdown内容已复制到剪切板',
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 2000,
                        timerProgressBar: true
                    });
                } else {
                    // 更换为错误图标
                    svg.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12"/><path d="M6 6l12 12"/>';
                    label.textContent = '复制失败';
                    Swal.fire({
                        icon: 'error',
                        title: '复制失败',
                        text: '请重试或检查浏览器设置',
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 2000,
                        timerProgressBar: true
                    });
                }
            } catch (error) {
                // 更换为错误图标
                svg.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12"/><path d="M6 6l12 12"/>';
                label.textContent = '复制失败';
                Swal.fire({
                    icon: 'error',
                    title: '复制失败',
                    text: '请重试或检查浏览器设置',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000,
                    timerProgressBar: true
                });
            }

            // 2秒后恢复原状
            setTimeout(() => {
                // 恢复原始图标
                svg.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2"/>';
                label.textContent = originalContent;
                button.disabled = false;
            }, 2000);
        });

        return button;
    }

    // 将按钮添加到主题地图区域
    function addButtonToTopicMap() {
        const topicMap = document.querySelector('.post__topic-map.topic-map.--op');
        if (!topicMap) {
            return createFloatingButton();
        }

        // 查找或创建按钮容器
        let buttonContainer = topicMap.querySelector('.linxudoscripts-btn');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'linxudoscripts-btn';
            buttonContainer.style.cssText = `
                display: flex;
                gap: 8px;
                margin-bottom: 10px;
            `;
            
            // 在主题地图内容之前插入
            const topicMapContents = topicMap.querySelector('.topic-map__contents');
            if (topicMapContents) {
                topicMap.insertBefore(buttonContainer, topicMapContents);
            } else {
                topicMap.appendChild(buttonContainer);
            }
        }

        // 检查是否已经存在复制按钮
        if (buttonContainer.querySelector('.copy-markdown-button')) {
            return true;
        }

        const copyButton = createNativeCopyButton();
        
        // 查找收藏按钮，将复制按钮插入到它的右边
        const bookmarkButton = buttonContainer.querySelector('.linxudoscripts-bookmark');
        
        if (bookmarkButton) {
            // 在收藏按钮的父节点中，将复制按钮插入到收藏按钮之后
            const parentNode = bookmarkButton.parentNode;
            const nextSibling = bookmarkButton.nextSibling;
            
            if (nextSibling) {
                parentNode.insertBefore(copyButton, nextSibling);
            } else {
                parentNode.appendChild(copyButton);
            }
        } else {
            // 如果没有找到收藏按钮，检查是否有导出按钮
            const exportButton = buttonContainer.querySelector('.linxudoscripts-export-md');
            if (exportButton) {
                buttonContainer.insertBefore(copyButton, exportButton);
            } else {
                buttonContainer.appendChild(copyButton);
            }
        }

        return true;
    }

    // 创建悬浮按钮（备用方案）
    function createFloatingButton() {
        const button = createNativeCopyButton();
        button.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(button);
        return true;
    }

    // 添加快捷键支持 (Ctrl+Shift+C)
    function addKeyboardShortcut() {
        document.addEventListener('keydown', async (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
                e.preventDefault();
                
                const content = extractMainPostContent();
                if (content) {
                    const markdown = htmlToMarkdown(content);
                    const success = await copyToClipboard(markdown);
                    
                    if (success) {
                        Swal.fire({
                            icon: 'success',
                            title: '复制成功',
                            text: '主帖Markdown内容已复制到剪切板',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: '复制失败',
                            text: '请重试或检查浏览器设置',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                    }
                }
            }
        });
    }

    // 初始化脚本
    function init() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // 检查是否在帖子页面
        if (!document.querySelector('article#post_1')) {
            return;
        }

        // 等待主题地图和其他脚本加载完成后再添加按钮
        function waitForTopicMapAndAddButton() {
            const topicMap = document.querySelector('.post__topic-map.topic-map.--op');
            
            // 等待更长时间确保其他脚本加载完成
            setTimeout(() => {
                if (topicMap) {
                    // 创建并添加原生样式复制按钮
                    addButtonToTopicMap();
                } else {
                    createFloatingButton();
                }
            }, 2000); // 延长到2秒，确保其他脚本加载完成
        }
        
        waitForTopicMapAndAddButton();

        // 添加快捷键支持
        addKeyboardShortcut();
    }

    // 启动脚本
    init();

})();