// ==UserScript==
// @name         Anthropic Docs Exporter (Robust)
// @name:zh-CN   Anthropic文档一键导出Markdown (健壮版)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Crawls the Anthropic docs sidebar, clicks "Copy page" on each page, and combines the resulting markdown into a single file for download. Uses a robust download method.
// @description:zh-CN  遍历Anthropic文档的侧边栏，在每个页面上点击“Copy page”，并将所有Markdown内容合并成一个文件下载。使用更健壮的下载方法。
// @author       Your Name
// @match        https://docs.anthropic.com/zh-CN/docs/claude-code/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// ==/UserScript==

(function() {
    'use strict';

    console.log('Anthropic Docs Exporter (v1.3) script loaded.');

    // --- 样式定义 ---
    GM_addStyle(`
        #export-all-md-btn {
            background-color: #4CAF50; /* Green */
            border: none;
            color: white;
            padding: 8px 16px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 14px;
            margin-left: 10px;
            cursor: pointer;
            border-radius: 8px;
            transition: background-color 0.3s;
        }
        #export-all-md-btn:hover {
            background-color: #45a049;
        }
        #export-all-md-btn:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
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
                setTimeout(() => window.location.href = state.links[state.currentIndex].href, 1500);
                return;
            } else {
                console.log('User chose to restart. Deleting old state.');
                await GM_deleteValue(SCRIPT_STATE_KEY);
            }
        }

        Swal.fire({
            title: '准备开始导出',
            text: '即将开始收集所有文档链接...',
            icon: 'info',
            showLoaderOnConfirm: true,
            preConfirm: () => {
                try {
                    console.log('Collecting links from sidebar...');
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

                    if (links.length === 0) {
                        throw new Error("在侧边栏没有找到任何文档链接，请确认页面结构是否正确。");
                    }
                    console.log(`Found ${links.length} links to process.`);
                    return links;
                } catch (error) {
                    console.error("Error collecting links:", error);
                    Swal.showValidationMessage(`错误: ${error.message}`);
                }
            },
            allowOutsideClick: () => !Swal.isLoading()
        }).then(async (result) => {
            if (result.isConfirmed) {
                const links = result.value;
                const state = {
                    links: links,
                    currentIndex: 0,
                    markdowns: [],
                    startTime: Date.now()
                };
                await GM_setValue(SCRIPT_STATE_KEY, state);
                console.log('Export state initialized and saved.', state);
                Swal.fire('开始导出！', `共找到 ${links.length} 个页面。即将跳转到第一个页面。`, 'success');
                setTimeout(() => window.location.href = state.links[state.currentIndex].href, 2000);
            }
        });
    }

    /**
     * 在每个页面上执行的导出操作
     */
    async function executePageExport() {
        const state = await GM_getValue(SCRIPT_STATE_KEY);
        if (!state) return;

        console.log(`Executing export for page ${state.currentIndex + 1}/${state.links.length}: ${state.links[state.currentIndex].text}`);

        const progressDiv = document.createElement('div');
        progressDiv.id = 'export-progress-div';
        progressDiv.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; background-color: #28a745; color: white; padding: 15px; border-radius: 10px; z-index: 9999; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                <h4>文档导出中...</h4>
                <p>进度: ${state.currentIndex + 1} / ${state.links.length}</p>
                <p>当前页面: <strong>${state.links[state.currentIndex].text}</strong></p>
            </div>
        `;
        document.body.appendChild(progressDiv);

        try {
            const copyButton = await waitForElement('#page-context-menu-button', 5000);
            copyButton.click();
            console.log('Clicked "Copy page" button.');
            await new Promise(resolve => setTimeout(resolve, 300)); // 增加延迟以确保剪贴板操作完成

            const markdown = await navigator.clipboard.readText();
            console.log(`Copied markdown from clipboard. Length: ${markdown.length}`);

            const currentLink = state.links[state.currentIndex];
            const sectionTitle = state.currentIndex === 0 || state.links[state.currentIndex - 1].section !== currentLink.section
                ? `# ${currentLink.section}\n\n`
                : '';

            state.markdowns.push(`${sectionTitle}<!-- Page: ${currentLink.text} -->\n${markdown}`);
            state.currentIndex++;

            if (state.currentIndex >= state.links.length) {
                // 全部完成
                console.log('All pages processed. Finalizing...');
                const finalMarkdown = state.markdowns.join('\n\n---\n\n');
                const totalTime = ((Date.now() - state.startTime) / 1000).toFixed(2);

                GM_notification({
                    title: '导出完成！',
                    text: `所有 ${state.links.length} 个页面已成功导出，耗时 ${totalTime} 秒。`,
                    timeout: 5000
                });

                await GM_deleteValue(SCRIPT_STATE_KEY);
                console.log('Script state cleaned up.');
                document.querySelector('#export-progress-div')?.remove();

                // 弹出最终确认框，然后触发下载
                Swal.fire({
                    title: '导出完成！',
                    html: `所有 ${state.links.length} 个页面已成功导出为 Markdown 文件，共计 ${finalMarkdown.length} 个字符。<br>你的下载即将开始...`,
                    icon: 'success',
                    timer: 5000,
                    timerProgressBar: true
                }).then(() => {
                     downloadMarkdownFile(finalMarkdown, 'Anthropic-Claude-Code-Docs.md');
                });


            } else {
                // 继续下一个
                await GM_setValue(SCRIPT_STATE_KEY, state);
                console.log('State updated. Navigating to next page...');
                setTimeout(() => {
                    window.location.href = state.links[state.currentIndex].href;
                }, 500);
            }

        } catch (error) {
            console.error('An error occurred during page export:', error);
            await GM_deleteValue(SCRIPT_STATE_KEY);
            document.querySelector('#export-progress-div')?.remove();
            Swal.fire('导出失败', `在处理页面 "${state.links[state.currentIndex].text}" 时发生错误: ${error.message}。导出已中止。`, 'error');
             GM_notification({
                title: '导出失败',
                text: `处理页面时发生错误，请检查控制台。`,
                timeout: 5000
            });
        }
    }


    // --- 脚本主入口 ---
    async function main() {
        const state = await GM_getValue(SCRIPT_STATE_KEY);
        if (state) {
            console.log('Detected an ongoing export task. Waiting for page to load.');
            window.addEventListener('load', () => {
                 executePageExport();
            });
        } else {
            console.log('No active export task. Injecting button.');
            try {
                const targetContainer = await waitForElement('#page-context-menu', 10000);
                if (document.getElementById('export-all-md-btn')) return; // 防止重复注入
                const exportButton = document.createElement('button');
                exportButton.id = 'export-all-md-btn';
                exportButton.innerText = '一键导出所有文档';
                exportButton.onclick = startExport;
                targetContainer.appendChild(exportButton);
            } catch (error) {
                console.error("Failed to inject the export button:", error);
            }
        }
    }

    // 运行主函数
    main();

})();