// ==UserScript==
// @name         GitHub Trending Button
// @namespace    https://github.com/zhiyu1998/rrorange-tampermonkey-list
// @version      1.2.0
// @description  Add a button to GitHub header to quickly access trending page
// @author       rrorange
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const BUTTON_ID = 'trending-button';
    const BUTTON_LABEL = 'Trending repositories';

    function createIcon() {
        // 使用 GitHub 原生 Graph 图标
        return `
            <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-graph Button-visual">
                <path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path>
            </svg>
        `;
    }

    function applyPrcIconButtonStyle(linkEl, scopeEl) {
        const sample =
            scopeEl?.querySelector?.('a[data-component="IconButton"]') ||
            scopeEl?.querySelector?.('button[data-component="IconButton"]') ||
            document.querySelector('a[data-component="IconButton"]') ||
            document.querySelector('button[data-component="IconButton"]');

        if (!sample) return false;

        linkEl.className = sample.className || linkEl.className;
        linkEl.setAttribute('data-component', sample.getAttribute('data-component') || 'IconButton');

        for (const attr of ['data-loading', 'data-no-visuals', 'data-size', 'data-variant']) {
            const v = sample.getAttribute(attr);
            if (v != null) linkEl.setAttribute(attr, v);
        }

        const typeAttr = sample.getAttribute('type');
        if (typeAttr) linkEl.setAttribute('type', typeAttr);

        return true;
    }

    function findHeaderTarget() {
        // New "PRC" header (logged-in, 2025+)
        const topNavRight = document.querySelector('[data-testid="top-nav-right"]');
        if (topNavRight) {
            const before =
                topNavRight.querySelector('a[href^="/notifications"]') ||
                topNavRight.querySelector('[class*="GlobalUserNavDrawer-module__container"]') ||
                null;
            return { container: topNavRight, before, variant: 'prc' };
        }

        // New header (logged-in)
        const appHeaderActions = document.querySelector('.AppHeader-actions');
        if (appHeaderActions) {
            const before = appHeaderActions.querySelector('notification-indicator') || appHeaderActions.querySelector('.AppHeader-user') || null;
            return { container: appHeaderActions, before, variant: 'app' };
        }

        // Some pages/experiments use different wrappers
        const appHeaderEnd = document.querySelector('.AppHeader-globalBar-end') || document.querySelector('.AppHeader-globalBar-actions');
        if (appHeaderEnd) {
            return { container: appHeaderEnd, before: null, variant: 'app' };
        }

        // Logged-out marketing header
        const mktgHeader = document.querySelector('header.HeaderMktg') || document.querySelector('header.header-logged-out');
        if (mktgHeader) {
            const rightGroup =
                mktgHeader.querySelector('.header-search-button')?.closest('div.d-flex.flex-column.flex-lg-row') ||
                mktgHeader.querySelector('.HeaderMenu-wrapper') ||
                mktgHeader;

            const signInLink = rightGroup.querySelector('a[href^="/login"]');
            const before = signInLink?.closest('div.HeaderMenu-link-wrap') || signInLink || null;
            return { container: rightGroup, before, variant: 'mktg' };
        }

        // Fallback (older/other layouts)
        const header = document.querySelector('header');
        if (header) return { container: header, before: null, variant: 'fallback' };

        return null;
    }

    function addTrendingButton() {
        const target = findHeaderTarget();
        if (!target?.container) return false;

        // 2. 检查按钮是否已存在 (防止重复添加)
        if (document.getElementById(BUTTON_ID)) return true;

        // 3. 创建按钮
        const trendingButton = document.createElement('a');
        trendingButton.id = BUTTON_ID;
        trendingButton.href = '/trending';
        trendingButton.setAttribute('aria-label', BUTTON_LABEL);
        trendingButton.setAttribute('title', BUTTON_LABEL);
        trendingButton.setAttribute('rel', 'nofollow');
        trendingButton.innerHTML = createIcon();

        if (target.variant === 'prc') {
            if (!applyPrcIconButtonStyle(trendingButton, target.container)) {
                trendingButton.className = 'prc-Button-ButtonBase-9n-Xk prc-Button-IconButton-fyge7';
            }
        } else if (target.variant === 'app') {
            trendingButton.className = 'Button Button--iconOnly Button--secondary Button--medium AppHeader-button color-fg-muted';
        } else {
            trendingButton.className = 'HeaderMenu-link HeaderMenu-button flex-shrink-0 d-flex d-lg-inline-flex no-underline border color-border-default rounded px-2 py-1 mr-2';
            trendingButton.style.alignItems = 'center';
            trendingButton.style.justifyContent = 'center';
        }

        if (target.before) {
            target.container.insertBefore(trendingButton, target.before);
        } else {
            target.container.appendChild(trendingButton);
        }

        return true;
    }

    // 主执行逻辑
    function main() {
        if (!addTrendingButton()) {
            // 如果首次失败，启动 Observer
            const observer = new MutationObserver((mutations, obs) => {
                if (addTrendingButton()) {
                    obs.disconnect();
                }
            });

            // 限制 Observer 的范围，尽量不监听整个 body，除非迫不得已
            // 但 header 通常是 body 的直接子元素或很浅的层级
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 5秒后停止监听，节省资源
            setTimeout(() => observer.disconnect(), 5000);
        }
    }

    // 立即运行
    main();

    // 适配 GitHub Turbo (SPA 导航)
    // 每次页面软导航结束时，重新检查按钮是否存在
    document.addEventListener('turbo:load', main);
    document.addEventListener('turbo:render', main); // 处理一些局部更新
})();
