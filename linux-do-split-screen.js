// ==UserScript==
// @name         Linux.do 左右分栏浏览
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  No
// @author       You
// @match        https://linux.do/*
// @match        https://www.linux.do/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      linux.do
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ===========================================
    // 自定义参数设置 (User Customization Parameters)
    // ===========================================
    const RIGHT_PANEL_MAX_WIDTH = '900px';
    const GAP_WIDTH = '24px';
    const HEADER_HEIGHT = '60px';
    const HOT_TOPICS_COUNT = 10;
    const CACHE_MINUTES = 5;

    // ===========================================
    // 辅助函数与配置 (Helpers & Config)
    // ===========================================
    const ICONS = { /* ... */ };
    let formatTimeAgo = function (dateString) { /* ... */ };

    Object.assign(ICONS, {
        replies: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
        views: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
        likes: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`
    });
    formatTimeAgo = function (dateString) {
        const now = new Date(); const past = new Date(dateString);
        const diffInSeconds = Math.floor((now - past) / 1000);
        if (diffInSeconds < 60) return `${diffInSeconds}秒前`;
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}分钟前`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}小时前`;
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 30) return `${diffInDays}天前`;
        return past.toLocaleDateString();
    };

    // ===========================================
    // 脚本逻辑 (Script Logic)
    // ===========================================
    const useFixedWidth = true;
    document.documentElement.style.setProperty('--gap-width', GAP_WIDTH);
    document.documentElement.style.setProperty('--header-height', HEADER_HEIGHT);

    GM_addStyle(`
        /* --- 基础布局 --- */
        html, body { overflow: hidden !important; }
        #main-outlet { 
            height: calc(100vh - var(--header-height, 60px)); 
            overflow-y: auto; 
            padding-right: 8px; 
            width: var(--left-panel-width);
            max-width: none !important;
        }
        .wrap, .d-header .wrap { 
            max-width: none !important; 
            margin-left: 0 !important; 
            margin-right: auto !important; 
            padding-left: 20px !important; 
        }

        /* --- 右侧容器 --- */
        #topic-iframe-container {
            position: fixed; top: 0; right: 0;
            width: var(--right-panel-width);
            max-width: ${RIGHT_PANEL_MAX_WIDTH}; height: 100vh;
            background: #f4f6f8;
            box-shadow: -3px 0 15px rgba(0,0,0,0.1);
            overflow: hidden; 
            z-index: 1000;
            display: flex;
        }
        
        #resizer {
            width: 5px;
            cursor: ew-resize;
            background-color: #e1e4e8;
            height: 100%;
            position: absolute;
            left: 0;
            top: 0;
            z-index: 1002;
        }

        #resizer:hover {
            background-color: #0366d6;
        }
        #topic-iframe-container.iframe-mode { background: #ffffff; }

        /* --- Iframe & 占位视图切换 --- */
        .right-panel-main-content {
            flex-grow: 1;
            position: relative;
        }
        #topic-iframe, .iframe-loading { display: none; }
        #topic-iframe-container.iframe-mode #topic-iframe,
        #topic-iframe-container.iframe-mode .iframe-loading { display: block; }
        #topic-iframe-container.iframe-mode #placeholder-content { display: none; }
        #topic-iframe { width: 100%; height: 100%; border: none; }
        .iframe-loading { color: #666; font-size: 18px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }

        
        #placeholder-content { width: 100%; height: 100%; padding: 25px; box-sizing: border-box; overflow-y: auto; }
        .placeholder-title { font-size: 20px; font-weight: 600; color: #333; margin-bottom: 20px; text-align: center; }
        .topic-card-list { list-style: none; padding: 0; margin: 0; }
        .topic-card {
            display: flex; align-items: center; background: #ffffff; border-radius: 10px;
            margin-bottom: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            border: 1px solid #e9ecef; opacity: 0; transform: translateY(15px);
            animation: fadeIn 0.4s ease forwards; transition: all 0.2s ease-in-out;
        }
        .topic-card:hover { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-color: #007bff; }
        @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
        .card-avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 12px; flex-shrink: 0; }
        .card-main { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
        .card-title-link { text-decoration: none; color: #212529; margin-bottom: 8px; }
        .card-title-text { font-size: 16px; font-weight: 600; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-meta { display: flex; justify-content: space-between; align-items: center; color: #6c757d; font-size: 12px; }
        .card-meta-left { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
        .author-name { font-weight: 500; color: #495057; }
        .stat-item { display: flex; align-items: center; gap: 4px; }
        .card-time { flex-shrink: 0; padding-left: 10px; }
        .placeholder-status { font-size: 16px; color: #888; text-align:center; padding-top: 40vh; }

        /* --- 其他UI元素 --- */
        .topic-list-item.current-preview, tr.current-preview { background-color: #eef5ff !important; }
        .topic-list-item.current-preview { border-left: 4px solid #3498db; }

        
        #hide-button-wrapper {
            position: absolute; top: 0; left: 0; bottom: 0; width: 40px; z-index: 1001; display: none;
        }
        #topic-iframe-container.iframe-mode #hide-button-wrapper { display: block; }
        #hide-iframe-button {
            position: absolute; top: 50%; left: 0; transform: translateY(-50%);
            width: 28px; height: 70px; background-color: #007bff; color: white; border: none;
            border-radius: 0 15px 15px 0; cursor: pointer; display: flex; align-items: center; justify-content: center;
            font-size: 24px; font-weight: bold; line-height: 70px; box-shadow: 2px 2px 8px rgba(0,0,0,0.1);
            opacity: 0; pointer-events: none; transition: opacity 0.2s ease-in-out, background-color 0.2s;
        }
        #hide-button-wrapper:hover #hide-iframe-button { opacity: 0.85; pointer-events: auto; }
        #hide-iframe-button:hover { background-color: #0056b3; opacity: 1; }
    `);

    // --- JS函数部分 ---
    function renderTopicCards(data) {
        const placeholder = document.getElementById('placeholder-content');
        if (!data || !data.topic_list || !data.topic_list.topics) { placeholder.innerHTML = `<div class="placeholder-status">未能获取到帖子</div>`; return; }
        const topics = data.topic_list.topics.slice(0, HOT_TOPICS_COUNT);
        const users = new Map(data.users.map(user => [user.id, user]));
        const cardsHtml = topics.map((topic, index) => {
            const originalPoster = topic.posters.find(p => p.description.includes('Original Poster')) || topic.posters[0];
            const user = users.get(originalPoster.user_id);
            const avatarUrl = user ? `https://${window.location.hostname}${user.avatar_template.replace('{size}', '80')}` : '';
            return `
                <li class="topic-card" style="animation-delay: ${index * 0.06}s;">
                    ${user ? `<img src="${avatarUrl}" class="card-avatar" alt="${user.username}">` : '<div class="card-avatar"></div>'}
                    <div class="card-main">
                        <a href="/t/${topic.slug}/${topic.id}" class="card-title-link topic-link">
                            <h3 class="card-title-text">${topic.title}</h3>
                        </a>
                        <div class="card-meta">
                            <div class="card-meta-left">
                                <span class="author-name">${user ? user.username : '未知作者'}</span>
                                <span class="stat-item" title="回复">${ICONS.replies} ${topic.posts_count - 1}</span>
                                <span class="stat-item" title="浏览">${ICONS.views} ${topic.views}</span>
                                <span class="stat-item" title="点赞">${ICONS.likes} ${topic.like_count}</span>
                            </div>
                            <span class="card-time">${formatTimeAgo(topic.bumped_at)}</span>
                        </div>
                    </div>
                </li>`;
        }).join('');
        placeholder.innerHTML = `<h2 class="placeholder-title">🔥热门帖子</h2><ul class="topic-card-list">${cardsHtml}</ul>`;
    }


    function fixDiscourseTimeline(iframe) {
        if (!iframe || !iframe.contentWindow) return;

        try {
            const iframeWin = iframe.contentWindow;
            const iframeDoc = iframe.contentDocument || iframeWin.document;

            // 强制触发多种事件以激活Discourse的滚动监听
            setTimeout(() => {
                // 1. 触发resize事件
                iframeWin.dispatchEvent(new Event('resize'));

                // 2. 触发scroll事件
                iframeWin.dispatchEvent(new Event('scroll'));

                // 3. 手动调用Discourse的滚动处理函数
                if (iframeWin.require) {
                    try {
                        // 尝试获取Discourse的应用实例
                        const app = iframeWin.require('discourse/app').default;
                        if (app && app.__container__) {
                            // 触发路由刷新
                            const router = app.__container__.lookup('router:main');
                            if (router) {
                                router.trigger('didTransition');
                            }

                            // 查找并刷新topic-timeline组件
                            const topicController = app.__container__.lookup('controller:topic');
                            if (topicController) {
                                topicController.notifyPropertyChange('model.postStream');
                            }
                        }
                    } catch (e) {
                        console.log('Discourse API调用失败，尝试其他方法');
                    }
                }

                // 4. 监听iframe内的滚动并手动更新进度
                let scrollTimer;
                const handleScroll = () => {
                    clearTimeout(scrollTimer);
                    scrollTimer = setTimeout(() => {
                        // 查找timeline元素并强制更新
                        const timeline = iframeDoc.querySelector('.timeline-container');
                        if (timeline) {
                            // 触发鼠标移动事件以激活timeline
                            const mouseEvent = new MouseEvent('mousemove', {
                                view: iframeWin,
                                bubbles: true,
                                cancelable: true,
                                clientX: iframeWin.innerWidth - 100,
                                clientY: iframeWin.innerHeight / 2
                            });
                            timeline.dispatchEvent(mouseEvent);
                        }

                        // 手动触发Discourse的滚动同步
                        const emberView = iframeDoc.querySelector('[id^="ember"]');
                        if (emberView) {
                            emberView.dispatchEvent(new Event('scroll', { bubbles: true }));
                        }
                    }, 100);
                };

                // 添加滚动监听
                iframeWin.addEventListener('scroll', handleScroll);

                // 5. 定期检查并修复timeline状态
                const checkInterval = setInterval(() => {
                    const timeline = iframeDoc.querySelector('.timeline-container');
                    if (timeline) {
                        // 确保timeline可见
                        const styles = iframeWin.getComputedStyle(timeline);
                        if (styles.display === 'none' || styles.visibility === 'hidden') {
                            timeline.style.display = 'block';
                            timeline.style.visibility = 'visible';
                        }

                        // 触发一次滚动更新
                        handleScroll();
                    }
                }, 1000);

                // 6. 注入修复脚本到iframe
                const fixScript = iframeDoc.createElement('script');
                fixScript.textContent = `
                    (function() {
                        // 修复滚动监听
                        const originalAddEventListener = window.addEventListener;
                        window.addEventListener = function(event, handler, options) {
                            originalAddEventListener.call(this, event, handler, options);
                            if (event === 'scroll') {
                                console.log('滚动事件已绑定');
                            }
                        };

                        // 定期触发滚动事件
                        setInterval(() => {
                            window.dispatchEvent(new Event('scroll'));
                        }, 500);
                    })();
                `;
                iframeDoc.head.appendChild(fixScript);

            }, 500);

        } catch (e) {
            console.error('出错:', e);
        }
    }

    function createIframeContainer() {
        const c = document.createElement('div');
        c.id = 'topic-iframe-container';
        c.innerHTML = `
            <div id="resizer"></div>
            <div class="right-panel-main-content">
                <div id="placeholder-content"><div class="placeholder-status">正在加载...</div></div>
                <div id="hide-button-wrapper"><button id="hide-iframe-button" title="返回列表 (Esc)">‹</button></div>
                <div class="iframe-loading"></div>
                <iframe id="topic-iframe" src="about:blank"></iframe>
            </div>
        `;
        document.body.appendChild(c);

        initResizing();

        document.getElementById('hide-iframe-button')?.addEventListener('click', closeIframe);

        document.getElementById('topic-iframe')?.addEventListener('load', function () {
            const iframeContainer = document.getElementById('topic-iframe-container');
            const iframe = document.getElementById('topic-iframe');

            iframeContainer.querySelector('.iframe-loading').style.display = 'none';


            fixDiscourseTimeline(iframe);
        });
    }

    function showHotTopics() { const p = document.getElementById('placeholder-content'); if (!p) return; const c = JSON.parse(localStorage.getItem('hotTopicsCache') || '{}'); const n = new Date().getTime(); if (c.data && (n - c.timestamp < CACHE_MINUTES * 60 * 1000)) { renderTopicCards(c.data); return } GM_xmlhttpRequest({ method: 'GET', url: `https://${window.location.hostname}/hot.json`, onload: function (r) { try { const d = JSON.parse(r.responseText); renderTopicCards(d); localStorage.setItem('hotTopicsCache', JSON.stringify({ timestamp: new Date().getTime(), data: d })) } catch (e) { p.innerHTML = `<div class="placeholder-status">加载失败(数据解析错误)</div>` } }, onerror: function (e) { p.innerHTML = `<div class="placeholder-status">加载失败(网络请求错误)</div>` } }) }
    function closeIframe() { const c = document.getElementById('topic-iframe-container'); if (c && c.classList.contains('iframe-mode')) { c.classList.remove('iframe-mode'); setTimeout(() => document.getElementById('topic-iframe')?.setAttribute('src', 'about:blank'), 300); document.querySelectorAll('.current-preview').forEach(i => i.classList.remove('current-preview')); } }
    function openTopicInIframe(url) { const c = document.getElementById('topic-iframe-container'); if (c) { c.querySelector('.iframe-loading').style.display = 'block'; c.querySelector('#topic-iframe').src = url; c.classList.add('iframe-mode'); } }

    function initResizing() {
        const resizer = document.getElementById('resizer');
        const leftPanel = document.getElementById('main-outlet');
        const rightPanel = document.getElementById('topic-iframe-container');
        const gapWidth = parseInt(GAP_WIDTH, 10);

        let isResizing = false;

        const setPanelWidths = (rightPanelWidth) => {
            const viewportWidth = window.innerWidth;
            const leftPanelWidth = viewportWidth - rightPanelWidth - gapWidth;

            document.documentElement.style.setProperty('--right-panel-width', `${rightPanelWidth}px`);
            document.documentElement.style.setProperty('--left-panel-width', `${leftPanelWidth}px`);
        };


        const savedRightPanelWidth = localStorage.getItem('rightPanelWidth');
        let initialRightPanelWidth = savedRightPanelWidth ? parseInt(savedRightPanelWidth, 10) : 450;
        setPanelWidths(initialRightPanelWidth);

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            const handleMouseMove = (e) => {
                if (!isResizing) return;
                const viewportWidth = window.innerWidth;
                let newRightPanelWidth = viewportWidth - e.clientX - (gapWidth / 2);

                if (newRightPanelWidth < 300) newRightPanelWidth = 300;
                if (newRightPanelWidth > 900) newRightPanelWidth = 900;

                setPanelWidths(newRightPanelWidth);
            };

            const handleMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                const finalRightWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--right-panel-width'), 10);
                localStorage.setItem('rightPanelWidth', finalRightWidth);

                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        window.addEventListener('resize', () => {
            const currentRightWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--right-panel-width'), 10);
            setPanelWidths(currentRightWidth);
        });
    }

    function interceptTopicLinks() {
        document.addEventListener('click', function (e) {
            const l = e.target.closest('a.title, a.topic-link, .link-top-line a, a.search-link');
            if (l && l.href && l.href.includes('/t/') && !l.href.includes('#')) {
                if (window.self !== window.top || e.button === 1 || e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.current-preview').forEach(i => i.classList.remove('current-preview'));
                const p = l.closest('.topic-list-item, tr, .search-result-topic');
                if (p) p.classList.add('current-preview');
                openTopicInIframe(l.href);
            }
        }, true);
    }
    window.addEventListener('DOMContentLoaded', function () { if (window.self === window.top) { createIframeContainer(); interceptTopicLinks(); showHotTopics(); } });
    document.addEventListener('keydown', function (e) { if (window.self === window.top && e.key === 'Escape') { closeIframe(); } });
    console.log('Linux.do 左右分栏浏览脚本已加载');

})();
