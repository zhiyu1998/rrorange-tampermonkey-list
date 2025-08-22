// ==UserScript==
// @name         Linux.do 稍后阅读
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  为Linux.do论坛添加稍后阅读功能
// @author       rrorange
// @match        https://linux.do/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 样式
    const styles = `
        .read-later-btn {
            margin-left: 8px;
            padding: 4px 8px;
            font-size: 12px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .read-later-btn:hover {
            opacity: 0.8;
        }
        .read-later-btn.saved {
            background-color: #32c3c3;
            color: white;
        }
        .read-later-btn.unsave {
            background-color: #ff6b6b;
            color: white;
        }
        .read-later-panel {
            position: fixed;
            top: 60px;
            right: 20px;
            width: 350px;
            max-height: 70vh;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            display: none;
            flex-direction: column;
        }
        .read-later-panel.show {
            display: flex;
        }
        .read-later-header {
            padding: 15px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .read-later-header h3 {
            margin: 0;
            font-size: 16px;
        }
        .read-later-close {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #666;
        }
        .read-later-list {
            overflow-y: auto;
            flex: 1;
        }
        .read-later-item {
            padding: 12px 15px;
            border-bottom: 1px solid #f0f0f0;
            position: relative;
        }
        .read-later-item:hover {
            background-color: #f8f9fa;
        }
        .read-later-item:last-child {
            border-bottom: none;
        }
        .read-later-item-title {
            font-size: 14px;
            margin-bottom: 4px;
            color: #333;
            display: block;
            text-decoration: none;
        }
        .read-later-item-title:hover {
            text-decoration: underline;
        }
        .read-later-item-meta {
            font-size: 12px;
            color: #666;
        }
        .read-later-item-remove {
            position: absolute;
            right: 15px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #999;
            cursor: pointer;
            font-size: 16px;
        }
        .read-later-item-remove:hover {
            color: #ff6b6b;
        }
        .read-later-empty {
            padding: 40px 15px;
            text-align: center;
            color: #999;
        }
        .read-later-toggle {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #32c3c3;
            color: white;
            border: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            cursor: pointer;
            z-index: 9998;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }
        .read-later-toggle:hover {
            background: #2aafaf;
        }
        .read-later-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background: #ff6b6b;
            color: white;
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 11px;
            min-width: 18px;
            text-align: center;
        }
    `;

    // 添加样式
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    // 创建面板
    function createPanel() {
        const panel = document.createElement('div');
        panel.className = 'read-later-panel';
        panel.innerHTML = `
            <div class="read-later-header">
                <h3>稍后阅读</h3>
                <button class="read-later-close">&times;</button>
            </div>
            <div class="read-later-list"></div>
        `;
        document.body.appendChild(panel);

        // 关闭按钮
        panel.querySelector('.read-later-close').addEventListener('click', () => {
            panel.classList.remove('show');
        });

        return panel;
    }

    // 创建浮动按钮
    function createToggleButton() {
        const button = document.createElement('button');
        button.className = 'read-later-toggle';
        button.innerHTML = '📚';
        document.body.appendChild(button);

        // 点击显示/隐藏面板
        button.addEventListener('click', () => {
            const panel = document.querySelector('.read-later-panel');
            panel.classList.toggle('show');
            if (panel.classList.contains('show')) {
                updatePanel();
            }
        });

        return button;
    }

    // 获取保存的文章
    function getSavedArticles() {
        return GM_getValue('savedArticles', []);
    }

    // 保存文章
    function saveArticle(article) {
        const saved = getSavedArticles();
        const exists = saved.find(a => a.url === article.url);
        
        if (!exists) {
            article.savedAt = new Date().toISOString();
            saved.unshift(article);
            GM_setValue('savedArticles', saved);
            updateBadges();
            
            // 使用 SweetAlert2 显示美观的通知
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: '已保存到稍后阅读',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true,
                didOpen: (toast) => {
                    toast.addEventListener('mouseenter', Swal.stopTimer)
                    toast.addEventListener('mouseleave', Swal.resumeTimer)
                }
            });
            
            return true;
        } else {
            // 如果已经保存，显示提示
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: '该文章已在稍后阅读列表中',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true
            });
        }
        return false;
    }

    // 删除文章
    function removeArticle(url) {
        const saved = getSavedArticles();
        const filtered = saved.filter(a => a.url !== url);
        GM_setValue('savedArticles', filtered);
        updateBadges();
        updatePanel();
        
        // 显示删除成功提示
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: '已从稍后阅读中移除',
            showConfirmButton: false,
            timer: 1500,
            timerProgressBar: true
        });
    }

    // 更新面板内容
    function updatePanel() {
        const panel = document.querySelector('.read-later-panel');
        const list = panel.querySelector('.read-later-list');
        const saved = getSavedArticles();

        if (saved.length === 0) {
            list.innerHTML = '<div class="read-later-empty">暂无保存的文章</div>';
            return;
        }

        list.innerHTML = saved.map(article => `
            <div class="read-later-item">
                <a href="${article.url}" class="read-later-item-title" target="_blank">${article.title}</a>
                <div class="read-later-item-meta">
                    ${article.category} · ${formatTime(article.savedAt)}
                </div>
                <button class="read-later-item-remove" data-url="${article.url}">&times;</button>
            </div>
        `).join('');

        // 删除按钮事件
        list.querySelectorAll('.read-later-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeArticle(btn.dataset.url);
            });
        });
    }

    // 更新徽章数量
    function updateBadges() {
        const count = getSavedArticles().length;
        const badge = document.querySelector('.read-later-badge');
        
        if (count > 0) {
            if (!badge) {
                const toggleBtn = document.querySelector('.read-later-toggle');
                const badgeEl = document.createElement('span');
                badgeEl.className = 'read-later-badge';
                badgeEl.textContent = count > 99 ? '99+' : count;
                toggleBtn.appendChild(badgeEl);
            } else {
                badge.textContent = count > 99 ? '99+' : count;
            }
        } else if (badge) {
            badge.remove();
        }
    }

    // 格式化时间
    function formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
        
        return date.toLocaleDateString();
    }

    // 添加稍后阅读按钮
    function addReadLaterButtons() {
        // 话题列表页
        document.querySelectorAll('.topic-list-item').forEach(item => {
            if (item.querySelector('.read-later-btn')) return;
            
            const titleLink = item.querySelector('.main-link > a.title');
            const category = item.querySelector('.category-name')?.textContent || '';
            
            if (titleLink) {
                const btn = document.createElement('button');
                btn.className = 'read-later-btn';
                btn.textContent = '稍后阅读';
                btn.dataset.url = titleLink.href;
                btn.dataset.title = titleLink.textContent.trim();
                btn.dataset.category = category;
                
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const article = {
                        url: btn.dataset.url,
                        title: btn.dataset.title,
                        category: btn.dataset.category
                    };
                    
                    if (saveArticle(article)) {
                        btn.classList.add('saved');
                        btn.textContent = '已保存';
                    }
                });
                
                // 检查是否已保存
                const saved = getSavedArticles();
                if (saved.find(a => a.url === titleLink.href)) {
                    btn.classList.add('saved');
                    btn.textContent = '已保存';
                }
                
                titleLink.parentNode.appendChild(btn);
            }
        });

        // 话题详情页
        const topicTitle = document.querySelector('#topic-title .fancy-title');
        if (topicTitle && !topicTitle.querySelector('.read-later-btn')) {
            const category = document.querySelector('.badge-category__name')?.textContent || '';
            const btn = document.createElement('button');
            btn.className = 'read-later-btn saved';
            btn.textContent = '取消保存';
            btn.dataset.url = window.location.href;
            btn.dataset.title = topicTitle.textContent.trim();
            btn.dataset.category = category;
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                
                const article = {
                    url: btn.dataset.url,
                    title: btn.dataset.title,
                    category: btn.dataset.category
                };
                
                if (btn.classList.contains('saved')) {
                    removeArticle(btn.dataset.url);
                    btn.classList.remove('saved');
                    btn.classList.add('unsave');
                    btn.textContent = '稍后阅读';
                } else {
                    if (saveArticle(article)) {
                        btn.classList.remove('unsave');
                        btn.classList.add('saved');
                        btn.textContent = '取消保存';
                    }
                }
            });
            
            // 检查是否已保存
            const saved = getSavedArticles();
            if (!saved.find(a => a.url === window.location.href)) {
                btn.classList.remove('saved');
                btn.classList.add('unsave');
                btn.textContent = '稍后阅读';
            }
            
            topicTitle.appendChild(btn);
        }
    }

    // 注册菜单命令
    let clearCommand;
    function registerMenuCommands() {
        clearCommand = GM_registerMenuCommand('清空稍后阅读', () => {
            Swal.fire({
                title: '清空稍后阅读',
                text: '确定要清空所有稍后阅读的文章吗？此操作不可恢复！',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#32c3c3',
                cancelButtonColor: '#d33',
                confirmButtonText: '确定清空',
                cancelButtonText: '取消',
                reverseButtons: true
            }).then((result) => {
                if (result.isConfirmed) {
                    GM_deleteValue('savedArticles');
                    updateBadges();
                    updatePanel();
                    
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: '已清空所有稍后阅读的文章',
                        showConfirmButton: false,
                        timer: 2000,
                        timerProgressBar: true
                    });
                }
            });
        });
    }

    // 初始化
    function init() {
        createPanel();
        createToggleButton();
        updateBadges();
        registerMenuCommands();
        
        // 初始添加按钮
        addReadLaterButtons();
        
        // 监听页面变化（Discourse是单页应用）
        const observer = new MutationObserver(() => {
            addReadLaterButtons();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 启动
    init();
})();