// ==UserScript==
// @name         GitHub 资源全能加速下载 (防套娃稳定版)
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  修复了在 Code 下拉菜单中无限嵌套按钮的 Bug
// @author       YourName
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const mirrors = [
        { name: 'abskoop', prefix: 'https://github.abskoop.workers.dev/', color: '#2da44e', desc: 'abskoop 镜像' },
        { name: 'seaya', prefix: 'https://mirrors.seaya.link/', color: '#0969da', desc: 'seaya 镜像' },
        { name: 'CF全球', prefix: 'https://gh-proxy.org/', color: '#f38020', desc: 'Cloudflare 主站' },
        { name: '香港优化', prefix: 'https://hk.gh-proxy.org/', color: '#d53f8c', desc: '香港线路优化' },
        { name: 'Fastly', prefix: 'https://cdn.gh-proxy.org/', color: '#6a40ed', desc: 'Fastly CDN' },
        { name: 'EdgeOne', prefix: 'https://edgeone.gh-proxy.org/', color: '#0052d9', desc: 'EdgeOne 加速' },
        { name: 'LLKK', prefix: 'https://gh.llkk.cc/', color: '#0891b2', desc: 'LLKK 加速源' },
        { name: '皮皮加速', prefix: 'https://proxyd.picpi.top/', color: '#e11d48', desc: '皮皮加速站' }
    ];

    function addAccelerateButtons() {
        // 更加严谨的选择器
        const selectors = [
            'a[href*="/releases/download/"]',
            'a[href*="/archive/refs/"]',
            'a[href*="/zipball/"]',
            'a[href*="/tarball/"]'
        ];
        
        const links = document.querySelectorAll(selectors.join(','));

        links.forEach(link => {
            // --- 核心修复逻辑：多重过滤 ---
            
            // 1. 如果已经处理过，跳过
            if (link.hasAttribute('data-accel-processed')) return;

            // 2. 如果是脚本自己创建的按钮，跳过（通过类名判断）
            if (link.classList.contains('custom-accel-btn')) return;

            // 3. 关键：如果链接不是以 github.com 开头，说明已经是加速链接了，跳过！
            // 这一步彻底解决了“套娃”问题
            const href = link.getAttribute('href') || "";
            const absoluteHref = link.href;
            if (!absoluteHref.startsWith('https://github.com')) return;

            // 4. 检查父元素是否已经有了加速容器，防止重复插入
            if (link.parentElement.querySelector('.custom-accel-group')) {
                 link.setAttribute('data-accel-processed', 'true');
                 return;
            }

            // --- 开始创建按钮 ---
            link.setAttribute('data-accel-processed', 'true');

            const isDropdownItem = link.closest('.prc-ActionList-ActionListItem-So4vC') || link.closest('[role="menuitem"]');
            
            const container = document.createElement('div');
            container.className = 'custom-accel-group';
            container.style.display = 'flex';
            container.style.flexWrap = 'wrap';
            container.style.gap = '4px';
            container.style.marginTop = isDropdownItem ? '4px' : '2px';
            container.style.marginBottom = isDropdownItem ? '8px' : '0';
            container.style.marginLeft = isDropdownItem ? '30px' : '0';
            container.style.verticalAlign = 'middle';

            mirrors.forEach(mirror => {
                const accelUrl = mirror.prefix + absoluteHref;
                const btn = document.createElement('a');
                btn.innerHTML = mirror.name;
                btn.href = accelUrl;
                btn.target = '_blank';
                btn.title = mirror.desc;
                // 必须加上这个类名，用于上面的过滤逻辑
                btn.className = 'btn btn-sm custom-accel-btn';
                
                btn.style.backgroundColor = mirror.color;
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.style.borderRadius = '4px';
                btn.style.padding = '1px 6px';
                btn.style.fontSize = '11px';
                btn.style.lineHeight = '18px';
                btn.style.textDecoration = 'none';
                btn.style.fontWeight = '500';
                
                container.appendChild(btn);
            });

            // 针对 Assets 列表，使用 Flex Column 布局让按钮换行显示
            if (isDropdownItem) {
                link.after(container);
            } else {
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'flex-start';
                
                link.parentNode.insertBefore(wrapper, link);
                wrapper.appendChild(link);
                wrapper.appendChild(container);
            }
        });
    }

    // 防抖
    function debounce(func, wait) {
        let timeout;
        return function() {
            clearTimeout(timeout);
            timeout = setTimeout(func, wait);
        };
    }

    const process = debounce(addAccelerateButtons, 200);

    // 基础监听
    process();
    document.addEventListener('turbo:load', process);
    document.addEventListener('turbo:render', process);

    // 针对 Code 下拉菜单的动态监听
    document.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('summary')) {
            setTimeout(process, 150);
        }
    }, true);

    // DOM 变动监听
    const observer = new MutationObserver((mutations) => {
        const hasNewRelevantNodes = mutations.some(m => 
            Array.from(m.addedNodes).some(node => 
                node.nodeType === 1 && 
                !node.classList.contains('custom-accel-group') &&
                !node.classList.contains('custom-accel-btn')
            )
        );
        if (hasNewRelevantNodes) process();
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();