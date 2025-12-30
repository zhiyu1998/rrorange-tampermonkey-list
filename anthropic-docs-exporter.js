// ==UserScript==
// @name         Anthropic Docs Exporter (Robust)
// @name:zh-CN   Anthropic文档一键导出Markdown (健壮版)
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Crawls all tabs and sidebar links in Anthropic docs, clicks "Copy page" on each page, and combines the resulting markdown into a single file for download. Fast and reliable with smart retry logic.
// @description:zh-CN  遍历Anthropic文档的所有标签页和侧边栏链接，在每个页面上点击"Copy page"，并将所有Markdown内容合并成一个文件下载。快速可靠，使用智能重试机制。
// @author       Your Name
// @match        https://code.claude.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// ==/UserScript==

(function() {
    'use strict';

    console.log('Anthropic Docs Exporter (v2.5) script loaded.');

    // --- 样式定义 ---
    GM_addStyle(`
        .export-all-md-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.375rem 0.75rem;
            font-size: 0.875rem;
            font-weight: 500;
            color: white;
            background-color: #10a37f;
            border: 1px solid rgba(16, 163, 127, 0.2);
            border-radius: 0.75rem;
            cursor: pointer;
            transition: background-color 0.2s, border-color 0.2s;
            margin-left: 0.5rem;
        }
        .export-all-md-btn:hover {
            background-color: #0d8c6a;
            border-color: rgba(16, 163, 127, 0.4);
        }
        .export-all-md-btn:disabled {
            background-color: #cccccc;
            border-color: rgba(0, 0, 0, 0.1);
            cursor: not-allowed;
        }
        .export-all-md-btn svg {
            width: 1rem;
            height: 1rem;
        }
    `);

    const SCRIPT_STATE_KEY = 'anthropicDocExporterState';

    // --- 核心功能函数 ---

    /**
     * 更健壮的文件下载函数
     * @param {string} content - 文件内容
     * @param {string} fileName - 文件名
     */
    function downloadMarkdownFile(content, fileName) {
        console.log(`Preparing to download file: ${fileName}, Size: ${content.length} characters.`);
        try {
            // 创建一个 Blob 对象
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });

            // 创建一个隐藏的 a 标签用于下载
            const link = document.createElement("a");

            // 使用 URL.createObjectURL 创建一个指向 Blob 的 URL
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);

            // 模拟点击
            link.click();

            // 清理
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log("Download triggered successfully.");
        } catch (error) {
            console.error("Download failed:", error);
            Swal.fire('下载失败', `创建下载文件时发生错误: ${error.message}。请检查浏览器控制台。`, 'error');
        }
    }


    /**
     * 等待指定元素加载完成
     * @param {string} selector - CSS选择器
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<Element>}
     */
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const intervalTime = 100;
            let elapsedTime = 0;
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
                elapsedTime += intervalTime;
                if (elapsedTime >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`Element "${selector}" not found within ${timeout}ms.`));
                }
            }, intervalTime);
        });
    }

    /**
     * 读取剪贴板内容，带重试机制
     * @param {number} maxRetries - 最大重试次数
     * @returns {Promise<string>}
     */
    async function readClipboardWithRetry(maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                // 等待一小段时间让复制操作完成
                await new Promise(resolve => setTimeout(resolve, 800));

                const content = await navigator.clipboard.readText();

                // 验证内容是否有效（不是脚本代码，长度足够）
                const isValid = content.length > 100 &&
                               !content.includes('// ==UserScript==') &&
                               !content.includes('@name         Anthropic Docs Exporter');

                if (isValid) {
                    console.log(`Successfully read clipboard. Length: ${content.length}`);
                    return content;
                } else {
                    console.warn(`Clipboard content appears invalid (retry ${i + 1}/${maxRetries}). Length: ${content.length}`);
                    if (i < maxRetries - 1) {
                        // 如果不是最后一次重试，等待后继续
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        // 最后一次重试失败，仍然返回内容
                        console.warn('Max retries reached. Using current clipboard content.');
                        return content;
                    }
                }
            } catch (error) {
                console.error(`Error reading clipboard (attempt ${i + 1}/${maxRetries}):`, error);
                if (i === maxRetries - 1) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    /**
     * 收集当前标签页的所有文档链接
     * @returns {Array} 文档链接数组
     */
    function collectCurrentTabLinks() {
        console.log('Collecting links from current tab sidebar...');
        const links = [];
        const sections = document.querySelectorAll('#sidebar #navigation-items > div');

        sections.forEach(section => {
            const titleElement = section.querySelector('h5#sidebar-title');
            const sectionTitle = titleElement ? titleElement.innerText.trim() : '未分类';

            const linkElements = section.querySelectorAll('ul#sidebar-group li a');
            linkElements.forEach(a => {
                links.push({
                    section: sectionTitle,
                    text: a.innerText.trim(),
                    href: a.href
                });
            });
        });

        console.log(`Found ${links.length} links in current tab.`);
        return links;
    }

    /**
     * 收集所有标签页信息
     * @returns {Array} 标签页数组
     */
    function collectAllTabs() {
        console.log('Collecting all tabs...');
        const tabs = [];
        const tabElements = document.querySelectorAll('.nav-tabs a.nav-tabs-item');

        tabElements.forEach(tab => {
            tabs.push({
                name: tab.innerText.trim(),
                href: tab.href
            });
        });

        console.log(`Found ${tabs.length} tabs:`, tabs.map(t => t.name));
        return tabs;
    }

    /**
     * 开始导出流程
     */
    async function startExport() {
        console.log('Start export process initiated by user.');
        if (await GM_getValue(SCRIPT_STATE_KEY)) {
            const result = await Swal.fire({
                title: '检测到未完成的任务',
                text: "你想继续上次的导出吗？选择'取消'将开始一个新任务。",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: '继续',
                cancelButtonText: '重新开始'
            });

            if (result.isConfirmed) {
                const state = await GM_getValue(SCRIPT_STATE_KEY);
                console.log('Continuing previous export task.', state);
                Swal.fire('任务继续', '将跳转到下一个文档页面...', 'info');
                setTimeout(() => window.location.href = state.links[state.currentLinkIndex].href, 1000);
                return;
            } else {
                console.log('User chose to restart. Deleting old state.');
                await GM_deleteValue(SCRIPT_STATE_KEY);
            }
        }

        Swal.fire({
            title: '准备开始导出',
            html: '即将开始收集所有标签页和文档链接...<br><small>新版本支持多标签页布局</small>',
            icon: 'info',
            showLoaderOnConfirm: true,
            preConfirm: () => {
                try {
                    const tabs = collectAllTabs();
                    if (tabs.length === 0) {
                        throw new Error("没有找到任何标签页，请确认页面结构是否正确。");
                    }

                    const currentTabLinks = collectCurrentTabLinks();
                    if (currentTabLinks.length === 0) {
                        throw new Error("在当前标签页的侧边栏没有找到任何文档链接。");
                    }

                    return { tabs, currentTabLinks };
                } catch (error) {
                    console.error("Error collecting tabs/links:", error);
                    Swal.showValidationMessage(`错误: ${error.message}`);
                }
            },
            allowOutsideClick: () => !Swal.isLoading()
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { tabs, currentTabLinks } = result.value;
                const state = {
                    tabs: tabs,
                    currentTabIndex: 0,
                    links: currentTabLinks,
                    currentLinkIndex: 0,
                    markdowns: [],
                    totalPagesProcessed: 0,
                    startTime: Date.now()
                };
                await GM_setValue(SCRIPT_STATE_KEY, state);
                console.log('Export state initialized and saved.', state);

                const totalEstimate = tabs.length * currentTabLinks.length; // 粗略估计
                Swal.fire('开始导出！', `共找到 ${tabs.length} 个标签页，当前标签页有 ${currentTabLinks.length} 个页面。即将开始导出...`, 'success');
                setTimeout(() => window.location.href = state.links[state.currentLinkIndex].href, 1000);
            }
        });
    }

    /**
     * 检查是否需要收集新标签页的链接
     */
    async function checkAndCollectTabLinks() {
        const state = await GM_getValue(SCRIPT_STATE_KEY);
        if (!state || !state.needsTabLinkCollection) return false;

        console.log(`Collecting links for tab ${state.currentTabIndex + 1}/${state.tabs.length}: ${state.tabs[state.currentTabIndex].name}`);

        const progressDiv = document.createElement('div');
        progressDiv.id = 'export-progress-div';
        progressDiv.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; background-color: #17a2b8; color: white; padding: 15px; border-radius: 10px; z-index: 9999; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                <h4>收集标签页链接...</h4>
                <p>标签页: ${state.currentTabIndex + 1} / ${state.tabs.length}</p>
                <p>当前标签: <strong>${state.tabs[state.currentTabIndex].name}</strong></p>
            </div>
        `;
        document.body.appendChild(progressDiv);

        try {
            await waitForElement('#sidebar #navigation-items', 5000);
            const newLinks = collectCurrentTabLinks();

            if (newLinks.length === 0) {
                console.warn('No links found in this tab, skipping...');
            }

            state.links = newLinks;
            state.currentLinkIndex = 0;
            state.needsTabLinkCollection = false;
            await GM_setValue(SCRIPT_STATE_KEY, state);

            document.querySelector('#export-progress-div')?.remove();

            if (newLinks.length > 0) {
                console.log(`Collected ${newLinks.length} links. Starting export for this tab...`);
                setTimeout(() => {
                    window.location.href = state.links[0].href;
                }, 500);
            } else {
                // 如果当前标签页没有链接，跳到下一个标签页
                await moveToNextTab();
            }
            return true;
        } catch (error) {
            console.error('Error collecting tab links:', error);
            document.querySelector('#export-progress-div')?.remove();
            await GM_deleteValue(SCRIPT_STATE_KEY);
            Swal.fire('收集链接失败', `无法收集标签页 "${state.tabs[state.currentTabIndex].name}" 的链接: ${error.message}`, 'error');
            return true;
        }
    }

    /**
     * 移动到下一个标签页
     */
    async function moveToNextTab() {
        const state = await GM_getValue(SCRIPT_STATE_KEY);
        if (!state) return;

        state.currentTabIndex++;

        if (state.currentTabIndex >= state.tabs.length) {
            // 所有标签页都处理完了
            console.log('All tabs processed. Finalizing...');
            const finalMarkdown = state.markdowns.join('\n\n---\n\n');
            const totalTime = ((Date.now() - state.startTime) / 1000).toFixed(2);
            const skippedCount = state.skippedPages ? state.skippedPages.length : 0;

            GM_notification({
                title: '导出完成！',
                text: `所有 ${state.totalPagesProcessed} 个页面已成功导出，耗时 ${totalTime} 秒。${skippedCount > 0 ? `跳过了 ${skippedCount} 个404页面。` : ''}`,
                timeout: 5000
            });

            // 在控制台输出跳过的页面列表
            if (skippedCount > 0) {
                console.warn(`Skipped ${skippedCount} pages due to 404 errors:`);
                state.skippedPages.forEach((page, index) => {
                    console.warn(`  ${index + 1}. [${page.tab}] ${page.text}: ${page.href}`);
                });
            }

            const skippedPagesHtml = skippedCount > 0
                ? `<br><br><details><summary style="cursor:pointer;color:#dc3545;">跳过了 ${skippedCount} 个404页面 (点击查看)</summary><ul style="text-align:left;font-size:12px;max-height:150px;overflow-y:auto;">${state.skippedPages.map(p => `<li><strong>[${p.tab}]</strong> ${p.text}</li>`).join('')}</ul></details>`
                : '';

            await GM_deleteValue(SCRIPT_STATE_KEY);
            console.log('Script state cleaned up.');

            Swal.fire({
                title: '导出完成！',
                html: `所有 ${state.tabs.length} 个标签页，共 ${state.totalPagesProcessed} 个页面已成功导出为 Markdown 文件，共计 ${finalMarkdown.length} 个字符。${skippedPagesHtml}<br><br>你的下载即将开始...`,
                icon: 'success',
                timer: skippedCount > 0 ? 10000 : 5000,
                timerProgressBar: true
            }).then(() => {
                downloadMarkdownFile(finalMarkdown, 'Anthropic-Claude-Code-Docs.md');
            });
        } else {
            // 还有更多标签页要处理
            state.needsTabLinkCollection = true;
            await GM_setValue(SCRIPT_STATE_KEY, state);
            console.log(`Moving to next tab: ${state.tabs[state.currentTabIndex].name}`);

            Swal.fire({
                title: '切换标签页',
                html: `当前标签页处理完成！<br>即将切换到: <strong>${state.tabs[state.currentTabIndex].name}</strong>`,
                icon: 'info',
                timer: 2000,
                timerProgressBar: true
            }).then(() => {
                window.location.href = state.tabs[state.currentTabIndex].href;
            });
        }
    }

    /**
     * 检测是否为404页面
     * @returns {boolean}
     */
    function is404Page() {
        const errorBadge = document.querySelector('#error-badge, .not-found-status-code');
        const errorTitle = document.querySelector('#error-title, .not-found-title');
        return (errorBadge && errorBadge.textContent.includes('404')) ||
               (errorTitle && errorTitle.textContent.includes('Not Found'));
    }

    /**
     * 跳过当前页面并继续下一个
     */
    async function skipCurrentPageAndContinue() {
        const state = await GM_getValue(SCRIPT_STATE_KEY);
        if (!state) return;

        const currentLink = state.links[state.currentLinkIndex];
        console.warn(`Skipping 404 page: ${currentLink.text} (${currentLink.href})`);

        // 记录跳过的页面
        if (!state.skippedPages) {
            state.skippedPages = [];
        }
        state.skippedPages.push({
            tab: state.tabs[state.currentTabIndex].name,
            text: currentLink.text,
            href: currentLink.href,
            reason: '404 Not Found'
        });

        state.currentLinkIndex++;

        if (state.currentLinkIndex >= state.links.length) {
            // 当前标签页的所有页面都处理完了
            console.log(`Tab completed (with skips). Moving to next tab...`);
            await GM_setValue(SCRIPT_STATE_KEY, state);
            await moveToNextTab();
        } else {
            // 继续当前标签页的下一个页面
            await GM_setValue(SCRIPT_STATE_KEY, state);
            console.log('Skipped 404 page. Navigating to next page...');
            setTimeout(() => {
                window.location.href = state.links[state.currentLinkIndex].href;
            }, 500);
        }
    }

    /**
     * 在每个页面上执行的导出操作
     */
    async function executePageExport() {
        const state = await GM_getValue(SCRIPT_STATE_KEY);
        if (!state) return;

        // 如果需要收集新标签页的链接，先处理这个
        if (state.needsTabLinkCollection) {
            await checkAndCollectTabLinks();
            return;
        }

        const currentTab = state.tabs[state.currentTabIndex];
        const currentLink = state.links[state.currentLinkIndex];

        // 检测404页面
        if (is404Page()) {
            console.warn(`Detected 404 page: ${currentLink.text}`);
            const progressDiv = document.createElement('div');
            progressDiv.id = 'export-progress-div';
            progressDiv.innerHTML = `
                <div style="position: fixed; bottom: 20px; right: 20px; background-color: #ffc107; color: black; padding: 15px; border-radius: 10px; z-index: 9999; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                    <h4>检测到404页面</h4>
                    <p>跳过: <strong>${currentLink.text}</strong></p>
                    <p>正在继续下一个页面...</p>
                </div>
            `;
            document.body.appendChild(progressDiv);

            setTimeout(() => {
                document.querySelector('#export-progress-div')?.remove();
                skipCurrentPageAndContinue();
            }, 1500);
            return;
        }

        console.log(`Executing export for tab ${state.currentTabIndex + 1}/${state.tabs.length} (${currentTab.name}), page ${state.currentLinkIndex + 1}/${state.links.length}: ${currentLink.text}`);

        const progressDiv = document.createElement('div');
        progressDiv.id = 'export-progress-div';
        progressDiv.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; background-color: #28a745; color: white; padding: 15px; border-radius: 10px; z-index: 9999; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                <h4>文档导出中...</h4>
                <p>标签页: ${state.currentTabIndex + 1} / ${state.tabs.length} (${currentTab.name})</p>
                <p>页面进度: ${state.currentLinkIndex + 1} / ${state.links.length}</p>
                <p>总进度: ${state.totalPagesProcessed + 1} 个页面</p>
                <p>当前页面: <strong>${currentLink.text}</strong></p>
            </div>
        `;
        document.body.appendChild(progressDiv);

        try {
            // 等待"Copy page"按钮出现
            const copyButton = await waitForElement('#page-context-menu-button', 5000);

            // 点击复制按钮
            copyButton.click();
            console.log('Clicked "Copy page" button.');

            // 读取剪贴板内容（带重试机制）
            const markdown = await readClipboardWithRetry(3);
            console.log(`Successfully copied markdown from clipboard. Length: ${markdown.length}`);

            // 添加标签页标题（如果是该标签页的第一个页面）
            const tabHeader = state.currentLinkIndex === 0
                ? `# ${currentTab.name}\n\n`
                : '';

            // 添加章节标题（如果章节改变了）
            const sectionTitle = state.currentLinkIndex === 0 || state.links[state.currentLinkIndex - 1].section !== currentLink.section
                ? `## ${currentLink.section}\n\n`
                : '';

            state.markdowns.push(`${tabHeader}${sectionTitle}<!-- Page: ${currentLink.text} -->\n${markdown}`);
            state.currentLinkIndex++;
            state.totalPagesProcessed++;

            if (state.currentLinkIndex >= state.links.length) {
                // 当前标签页的所有页面都处理完了
                console.log(`Tab "${currentTab.name}" completed. Moving to next tab...`);
                document.querySelector('#export-progress-div')?.remove();
                await GM_setValue(SCRIPT_STATE_KEY, state);
                await moveToNextTab();
            } else {
                // 继续当前标签页的下一个页面
                await GM_setValue(SCRIPT_STATE_KEY, state);
                console.log('State updated. Navigating to next page...');
                document.querySelector('#export-progress-div')?.remove();
                setTimeout(() => {
                    window.location.href = state.links[state.currentLinkIndex].href;
                }, 500);
            }

        } catch (error) {
            console.error('An error occurred during page export:', error);
            await GM_deleteValue(SCRIPT_STATE_KEY);
            document.querySelector('#export-progress-div')?.remove();
            Swal.fire('导出失败', `在处理页面 "${currentLink.text}" 时发生错误: ${error.message}。导出已中止。`, 'error');
            GM_notification({
                title: '导出失败',
                text: `处理页面时发生错误，请检查控制台。`,
                timeout: 5000
            });
        }
    }


    /**
     * 注入导出按钮到所有 page-context-menu 容器
     */
    function injectExportButton() {
        // 获取所有的 page-context-menu 容器（桌面端和移动端）
        const targetContainers = document.querySelectorAll('#page-context-menu');

        if (targetContainers.length === 0) {
            console.log('No page-context-menu containers found yet.');
            return false;
        }

        console.log(`Found ${targetContainers.length} page-context-menu containers.`);

        let injectedCount = 0;

        // 在每个容器中注入导出按钮
        targetContainers.forEach((container, index) => {
            // 检查是否已经注入过按钮
            if (container.querySelector('.export-all-md-btn')) {
                console.log(`Button already exists in container ${index}, skipping.`);
                return;
            }

            const exportButton = document.createElement('button');
            exportButton.className = 'export-all-md-btn';
            exportButton.setAttribute('aria-label', 'Export all docs');
            exportButton.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 11V14.25C16 14.8467 15.7629 15.419 15.341 15.841C14.919 16.2629 14.3467 16.5 13.75 16.5H4.25C3.65326 16.5 3.08097 16.2629 2.65901 15.841C2.23705 15.419 2 14.8467 2 14.25V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12.5 6.5L9 2L5.5 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 2V12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>导出全部文档</span>
            `;
            exportButton.onclick = startExport;
            container.appendChild(exportButton);
            console.log(`Export button injected into container ${index}.`);
            injectedCount++;
        });

        return injectedCount > 0;
    }

    /**
     * 使用 MutationObserver 监听 DOM 变化并重新注入按钮
     */
    function setupButtonInjectionObserver() {
        console.log('Setting up MutationObserver to watch for DOM changes...');

        // 首次尝试注入
        injectExportButton();

        // 创建 MutationObserver 监听 DOM 变化
        const observer = new MutationObserver((mutations) => {
            // 检查是否有 page-context-menu 容器被添加或修改
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // 检查是否有新的 page-context-menu 容器
                    const hasPageContextMenu = Array.from(mutation.addedNodes).some(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            return node.id === 'page-context-menu' ||
                                   node.querySelector('#page-context-menu');
                        }
                        return false;
                    });

                    if (hasPageContextMenu) {
                        console.log('Detected page-context-menu changes, re-injecting button...');
                        setTimeout(() => injectExportButton(), 100);
                    }
                }
            }
        });

        // 开始观察整个 document.body 的变化
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('MutationObserver started.');
    }

    // --- 脚本主入口 ---
    async function main() {
        const state = await GM_getValue(SCRIPT_STATE_KEY);
        if (state) {
            // 有正在进行的导出任务 -> 直接执行导出，不启动 MutationObserver
            console.log('Detected an ongoing export task. Executing page export...');

            // 使用 DOMContentLoaded 而不是 load，加快执行速度
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    // 延迟一小段时间确保页面内容加载完成
                    setTimeout(() => executePageExport(), 200);
                });
            } else {
                // 页面已经加载完成，直接执行
                setTimeout(() => executePageExport(), 200);
            }
        } else {
            // 没有导出任务 -> 只在特定页面（如 overview）启动按钮注入
            console.log('No active export task.');

            // 检查是否在文档页面（包含 /docs/ 或 /overview）
            const isDocPage = window.location.pathname.includes('/docs/') ||
                             window.location.pathname.includes('/overview') ||
                             window.location.pathname.endsWith('/en/');

            if (isDocPage) {
                console.log('On documentation page. Setting up button injection.');
                // 等待页面基本加载完成
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', setupButtonInjectionObserver);
                } else {
                    setupButtonInjectionObserver();
                }
            } else {
                console.log('Not on documentation page. Button injection skipped.');
            }
        }
    }

    // 运行主函数
    main();

})();