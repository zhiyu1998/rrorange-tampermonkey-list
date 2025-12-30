// ==UserScript==
// @name         Linux.do 快速收藏/标签
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  为Linux.do帖子页面添加快速收藏按钮，支持自定义提醒和自动删除设置
// @author       RrOrange
// @match        https://linux.do/t/*/*
// @grant        none
// @license      MIT
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// ==/UserScript==

(function() {
    'use strict';

    // 获取CSRF token
    function getCSRFToken() {
        const token = document.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : null;
    }

    // 获取当前帖子的ID（主帖的实际帖子ID）
    function getPostId() {
        // 方案1：从主帖元素获取data-post-id
        const mainPost = document.querySelector('article#post_1');
        if (mainPost) {
            const postId = mainPost.getAttribute('data-post-id');
            if (postId) {
                return postId;
            }
        }

        // 方案2：从任何article元素获取
        const postElement = document.querySelector('article[data-post-id]');
        if (postElement) {
            return postElement.getAttribute('data-post-id');
        }

        // 方案3：从页面的JSON数据中获取
        try {
            const pageData = document.querySelector('script[data-discourse-entrypoint="discourse/app"]');
            if (pageData) {
                const content = pageData.textContent;
                const postIdMatch = content.match(/"id":(\d+),"name"/);
                if (postIdMatch) {
                    return postIdMatch[1];
                }
            }
        } catch (e) {
            console.log('无法从页面数据获取帖子ID');
        }

        // 方案4：从收藏按钮的data属性获取
        const bookmarkBtn = document.querySelector('[data-post-id]');
        if (bookmarkBtn) {
            return bookmarkBtn.getAttribute('data-post-id');
        }

        return null;
    }

    // 检查是否已经收藏并获取收藏ID
    function getBookmarkStatus() {
        // 查找收藏按钮
        const bookmarkButton = document.querySelector('.bookmark-button, [data-action="bookmark"], .toggle-bookmark');
        
        if (bookmarkButton) {
            const isBookmarked = bookmarkButton.classList.contains('bookmarked') || 
                                bookmarkButton.classList.contains('is-bookmarked') ||
                                bookmarkButton.getAttribute('aria-pressed') === 'true';
            
            // 尝试获取bookmark ID - 多种方案
            let bookmarkId = bookmarkButton.getAttribute('data-bookmark-id') ||
                            bookmarkButton.getAttribute('data-id');
            
            // 如果还是没找到，尝试从其他地方获取
            if (!bookmarkId && isBookmarked) {
                // 从页面的JSON数据中尝试获取
                try {
                    const scripts = document.querySelectorAll('script');
                    for (const script of scripts) {
                        if (script.textContent.includes('bookmark')) {
                            const bookmarkMatch = script.textContent.match(/bookmarked.*?id['":\s]*(\d+)/);
                            if (bookmarkMatch) {
                                bookmarkId = bookmarkMatch[1];
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.log('无法从脚本中获取bookmark ID');
                }
            }
            
            return {
                isBookmarked: isBookmarked,
                bookmarkId: bookmarkId
            };
        }
        
        return {
            isBookmarked: false,
            bookmarkId: null
        };
    }

    // 获取当前用户名
    function getCurrentUsername() {
        // 方案1：从用户下拉菜单获取
        const userMenu = document.querySelector('.header-dropdown-toggle.current-user');
        if (userMenu) {
            const usernameElement = userMenu.querySelector('.username');
            if (usernameElement) {
                return usernameElement.textContent.trim();
            }
        }
        
        // 方案2：从页面数据中获取
        try {
            // 查找包含当前用户信息的script标签
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const content = script.textContent;
                if (content.includes('"currentUser"')) {
                    // 尝试匹配用户名
                    const userMatch = content.match(/"currentUser":\{[^}]*"username":"([^"]+)"/);
                    if (userMatch) {
                        return userMatch[1];
                    }
                    // 备用匹配方案
                    const userMatch2 = content.match(/"username":"([^"]+)"[^}]*"id":\d+[^}]*"name"/);
                    if (userMatch2) {
                        return userMatch2[1];
                    }
                }
            }
        } catch (e) {
            console.log('无法从脚本中获取用户名:', e);
        }
        
        // 方案3：从页面元素中获取
        const currentUserLink = document.querySelector('a[href^="/u/"]');
        if (currentUserLink) {
            const href = currentUserLink.getAttribute('href');
            const usernameMatch = href.match(/^\/u\/([^\/]+)/);
            if (usernameMatch) {
                return usernameMatch[1];
            }
        }
        
        // 方案4：从页面头部用户信息获取
        const userAvatar = document.querySelector('.current-user .avatar');
        if (userAvatar) {
            const title = userAvatar.getAttribute('title');
            if (title) {
                return title;
            }
        }
        
        // 方案5：从meta标签获取
        const userMeta = document.querySelector('meta[name="discourse-username"]');
        if (userMeta) {
            return userMeta.getAttribute('content');
        }
        
        console.log('无法获取当前用户名');
        return null;
    }

    // 通过用户收藏列表API检查帖子收藏状态
    async function checkBookmarkStatusByAPI(postId) {
        try {
            const username = getCurrentUsername();
            if (!username) {
                console.log('无法获取当前用户名，跳过API检查');
                return null;
            }

            const csrfToken = getCSRFToken();
            if (!csrfToken) {
                console.log('无法获取CSRF token，跳过API检查');
                return null;
            }

            console.log('通过API检查收藏状态:', { username, postId });

            const response = await fetch(`https://linux.do/u/${username}/bookmarks.json?q=&acting_username=`, {
                headers: {
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-CSRF-Token': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Discourse-Logged-In': 'true',
                    'Discourse-Present': 'true'
                },
                mode: 'cors',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                const bookmarks = data.user_bookmark_list.bookmarks;
                
                // 查找当前帖子是否在收藏列表中
                for (const bookmark of bookmarks) {
                    if (bookmark.bookmarkable_id.toString() === postId.toString()) {
                        console.log('找到收藏记录:', bookmark);
                        return {
                            isBookmarked: true,
                            bookmarkId: bookmark.id.toString()
                        };
                    }
                }
                
                console.log('帖子未在收藏列表中');
                return {
                    isBookmarked: false,
                    bookmarkId: null
                };
            } else {
                console.error('获取收藏列表失败:', response.status, response.statusText);
                if (response.status === 403) {
                    console.log('API访问被拒绝，可能是权限问题或用户名不正确');
                }
                return null;
            }
        } catch (e) {
            console.error('检查收藏状态失败:', e);
            return null;
        }
    }

    // 发送收藏请求
    async function toggleBookmark(postId, reminderAt = '', autoDeletePreference = 3) {
        const csrfToken = getCSRFToken();
        if (!csrfToken) {
            throw new Error('无法获取CSRF token');
        }

        // 构建URL编码的请求体
        const params = new URLSearchParams();
        params.append('reminder_at', reminderAt);
        params.append('auto_delete_preference', autoDeletePreference.toString());
        params.append('bookmarkable_id', postId);
        params.append('bookmarkable_type', 'Post');

        const response = await fetch('https://linux.do/bookmarks.json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': '*/*',
                'Discourse-Logged-In': 'true',
                'Discourse-Present': 'true'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`收藏请求失败: ${response.status} - ${errorData.errors?.join(', ') || '未知错误'}`);
        }

        return await response.json();
    }

    // 发送取消收藏请求
    async function removeBookmark(bookmarkId) {
        const csrfToken = getCSRFToken();
        if (!csrfToken) {
            throw new Error('无法获取CSRF token');
        }

        console.log('准备删除收藏:', bookmarkId);

        const response = await fetch(`https://linux.do/bookmarks/${bookmarkId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': '*/*',
                'Discourse-Logged-In': 'true',
                'Discourse-Present': 'true'
            },
            mode: 'cors',
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`取消收藏失败: ${response.status} - ${errorData.errors?.join(', ') || '未知错误'}`);
        }

        const result = await response.json();
        console.log('删除收藏结果:', result);
        return result.success === 'OK';
    }

    // 调试用户名获取
    function debugCurrentUsername() {
        console.log('=== 调试用户名获取 ===');
        
        // 方案1测试
        const userMenu = document.querySelector('.header-dropdown-toggle.current-user');
        console.log('方案1 - 用户菜单:', userMenu);
        if (userMenu) {
            const usernameElement = userMenu.querySelector('.username');
            console.log('用户名元素:', usernameElement);
            if (usernameElement) {
                console.log('方案1结果:', usernameElement.textContent.trim());
            }
        }
        
        // 方案2测试 - 简化版本
        try {
            const scripts = document.querySelectorAll('script');
            for (let i = 0; i < scripts.length; i++) {
                const content = scripts[i].textContent;
                if (content.includes('"currentUser"') && content.includes('"username"')) {
                    console.log('找到包含用户信息的script标签:', i);
                    // 尝试多种匹配模式
                    const patterns = [
                        /"currentUser":\{[^}]*"username":"([^"]+)"/,
                        /"username":"([^"]+)"[^}]*"current_user"/,
                        /current_user[^}]*username[^}]*?["']([^"']+)["']/,
                        /"username":"([^"]+)"/g
                    ];
                    
                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) {
                            console.log('匹配模式成功:', pattern, '结果:', match[1]);
                            break;
                        }
                    }
                    break;
                }
            }
        } catch (e) {
            console.log('方案2出错:', e);
        }
        
        // 方案3测试
        const userLinks = document.querySelectorAll('a[href^="/u/"]');
        console.log('方案3 - 用户链接:', userLinks);
        userLinks.forEach((link, index) => {
            console.log(`链接${index}:`, link.href, link.textContent);
        });
        
        // 检查当前页面所有可能的用户信息
        console.log('页面标题:', document.title);
        console.log('所有meta标签:');
        document.querySelectorAll('meta').forEach(meta => {
            const name = meta.getAttribute('name');
            const content = meta.getAttribute('content');
            if (name && (name.includes('user') || name.includes('discourse'))) {
                console.log(`${name}: ${content}`);
            }
        });
        
        console.log('=== 调试结束 ===');
    }
    async function getBookmarkIdForPost(postId) {
        console.log('尝试获取帖子的收藏ID:', postId);
        
        // 首先尝试通过API获取
        const apiStatus = await checkBookmarkStatusByAPI(postId);
        if (apiStatus && apiStatus.bookmarkId) {
            console.log('通过API获取到收藏ID:', apiStatus.bookmarkId);
            return apiStatus.bookmarkId;
        }
        
        // 如果API失败，尝试从页面元素获取
        const bookmarkStatus = getBookmarkStatus();
        if (bookmarkStatus.bookmarkId) {
            console.log('从页面元素获取到收藏ID:', bookmarkStatus.bookmarkId);
            return bookmarkStatus.bookmarkId;
        }
        
        console.log('无法获取收藏ID');
        return null;
    }

    // 创建快速收藏按钮
    function createQuickBookmarkButton() {
        const button = document.createElement('button');
        button.className = 'btn btn-icon-text btn-default quick-bookmark-button';
        button.type = 'button';
        
        // 创建图标SVG (书签图标)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'd-icon icon icon-tabler icon-tabler-bookmark');
        
        // 添加路径元素
        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('stroke', 'none');
        path1.setAttribute('d', 'M0 0h24v24H0z');
        path1.setAttribute('fill', 'none');
        
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M9 4h6a2 2 0 0 1 2 2v14l-5-3l-5 3v-14a2 2 0 0 1 2 -2');
        
        svg.appendChild(path1);
        svg.appendChild(path2);
        
        // 创建按钮标签
        const label = document.createElement('span');
        label.className = 'd-button-label';
        label.textContent = '快速收藏';
        
        button.appendChild(svg);
        button.appendChild(label);

        // 状态变量
        let isCurrentlyBookmarked = false;
        let currentBookmarkId = null;

        // 更新按钮样式
        function updateButtonState(bookmarked, bookmarkId = null) {
            isCurrentlyBookmarked = bookmarked;
            currentBookmarkId = bookmarkId;
            
            console.log('更新按钮状态:', { bookmarked, bookmarkId });
            
            if (bookmarked) {
                button.classList.add('bookmarked');
                label.textContent = '已收藏';
                button.style.backgroundColor = '#ffd700';
                button.style.color = '#333';
                // 更换为已收藏图标
                svg.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3l-5 3v-14a2 2 0 0 1 2 -2" fill="currentColor"/>';
            } else {
                button.classList.remove('bookmarked');
                label.textContent = '快速收藏';
                button.style.backgroundColor = '';
                button.style.color = '';
                // 更换为未收藏图标
                svg.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3l-5 3v-14a2 2 0 0 1 2 -2"/>';
            }
        }

        // 异步初始化收藏状态
        async function initBookmarkStatus() {
            console.log('开始初始化收藏状态...');
            
            // 首先检查页面DOM状态
            const domStatus = getBookmarkStatus();
            console.log('DOM检测结果:', domStatus);
            
            // 获取帖子ID
            const postId = getPostId();
            if (!postId) {
                console.log('无法获取帖子ID，跳过API检查');
                updateButtonState(domStatus.isBookmarked, domStatus.bookmarkId);
                return;
            }
            
            // 尝试通过API获取准确状态
            try {
                const apiStatus = await checkBookmarkStatusByAPI(postId);
                if (apiStatus !== null) {
                    console.log('API检测结果:', apiStatus);
                    updateButtonState(apiStatus.isBookmarked, apiStatus.bookmarkId);
                } else {
                    console.log('API检测失败，使用DOM状态');
                    updateButtonState(domStatus.isBookmarked, domStatus.bookmarkId);
                }
            } catch (error) {
                console.error('API检测出错，使用DOM状态:', error);
                updateButtonState(domStatus.isBookmarked, domStatus.bookmarkId);
            }
        }

        // 初始化收藏状态
        initBookmarkStatus();

        button.addEventListener('click', async () => {
            const originalContent = label.textContent;
            
            // 显示加载状态
            label.textContent = '处理中...';
            button.disabled = true;

            try {
                const postId = getPostId();
                if (!postId) {
                    throw new Error('无法获取帖子ID');
                }

                console.log('准备操作收藏:', { postId, isCurrentlyBookmarked, currentBookmarkId });

                if (isCurrentlyBookmarked) {
                    // 取消收藏 - 如果没有bookmark ID，先尝试获取
                    let bookmarkIdToUse = currentBookmarkId;
                    
                    if (!bookmarkIdToUse) {
                        console.log('没有bookmark ID，尝试获取...');
                        bookmarkIdToUse = await getBookmarkIdForPost(postId);
                        if (!bookmarkIdToUse) {
                            throw new Error('无法获取收藏ID，无法删除收藏');
                        }
                    }
                    
                    const success = await removeBookmark(bookmarkIdToUse);
                    if (success) {
                        updateButtonState(false);
                        Swal.fire({
                            icon: 'success',
                            title: '取消收藏',
                            text: '已从收藏夹中移除',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                    }
                } else {
                    // 添加收藏
                    const result = await toggleBookmark(postId);
                    console.log('收藏结果:', result);
                    if (result.success === 'OK' && result.id) {
                        updateButtonState(true, result.id);
                        Swal.fire({
                            icon: 'success',
                            title: '收藏成功',
                            text: '已添加到收藏夹',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                    }
                }
            } catch (error) {
                console.error('收藏操作失败:', error);
                label.textContent = '操作失败';
                Swal.fire({
                    icon: 'error',
                    title: '操作失败',
                    text: error.message || '请重试或检查网络连接',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true
                });
                
                // 2秒后恢复原状
                setTimeout(() => {
                    label.textContent = originalContent;
                    button.disabled = false;
                }, 2000);
                return;
            }

            button.disabled = false;
        });

        return button;
    }

    // 创建高级收藏按钮（带选项）
    function createAdvancedBookmarkButton() {
        const button = document.createElement('button');
        button.className = 'btn btn-icon-text btn-default advanced-bookmark-button';
        button.type = 'button';
        
        // 创建图标SVG (设置图标)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'd-icon icon icon-tabler icon-tabler-bookmark-plus');
        
        // 添加路径元素
        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('stroke', 'none');
        path1.setAttribute('d', 'M0 0h24v24H0z');
        path1.setAttribute('fill', 'none');
        
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M12 17l-5 3v-14a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v5');
        
        const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path3.setAttribute('d', 'M16 19h6m-3 -3v6');
        
        svg.appendChild(path1);
        svg.appendChild(path2);
        svg.appendChild(path3);
        
        // 创建按钮标签
        const label = document.createElement('span');
        label.className = 'd-button-label';
        label.textContent = '高级收藏';
        
        button.appendChild(svg);
        button.appendChild(label);

        button.addEventListener('click', async () => {
            const postId = getPostId();
            if (!postId) {
                Swal.fire({
                    icon: 'error',
                    title: '错误',
                    text: '无法获取帖子ID'
                });
                return;
            }

            // 显示高级选项对话框
            const { value: formValues } = await Swal.fire({
                title: '收藏设置',
                html: `
                    <div style="text-align: left;">
                        <label for="reminder" style="display: block; margin-bottom: 5px;">提醒时间 (可选):</label>
                        <input id="reminder" class="swal2-input" type="datetime-local" placeholder="选择提醒时间">
                        
                        <label for="autoDelete" style="display: block; margin-top: 15px; margin-bottom: 5px;">自动删除:</label>
                        <select id="autoDelete" class="swal2-select">
                            <option value="0">从不</option>
                            <option value="1">1天后</option>
                            <option value="2">1周后</option>
                            <option value="3" selected>1个月后</option>
                            <option value="4">3个月后</option>
                            <option value="5">1年后</option>
                        </select>
                    </div>
                `,
                focusConfirm: false,
                preConfirm: () => {
                    const reminder = document.getElementById('reminder').value;
                    const autoDelete = document.getElementById('autoDelete').value;
                    return {
                        reminder: reminder,
                        autoDelete: parseInt(autoDelete)
                    };
                },
                showCancelButton: true,
                confirmButtonText: '收藏',
                cancelButtonText: '取消'
            });

            if (formValues) {
                try {
                    const result = await toggleBookmark(
                        postId, 
                        formValues.reminder,
                        formValues.autoDelete
                    );
                    
                    if (result.success === 'OK') {
                        Swal.fire({
                            icon: 'success',
                            title: '收藏成功',
                            text: '已添加到收藏夹',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                    }
                } catch (error) {
                    console.error('收藏失败:', error);
                    Swal.fire({
                        icon: 'error',
                        title: '收藏失败',
                        text: error.message || '请重试或检查网络连接'
                    });
                }
            }
        });

        return button;
    }

    // 将按钮添加到主题地图区域
    function addButtonsToTopicMap() {
        const topicMap = document.querySelector('.post__topic-map.topic-map.--op');
        if (!topicMap) {
            return createFloatingButtons();
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

        // 检查是否已经存在快速收藏按钮
        if (buttonContainer.querySelector('.quick-bookmark-button')) {
            return true;
        }

        const quickBookmarkButton = createQuickBookmarkButton();
        const advancedBookmarkButton = createAdvancedBookmarkButton();
        
        // 添加到容器
        buttonContainer.appendChild(quickBookmarkButton);
        buttonContainer.appendChild(advancedBookmarkButton);

        return true;
    }

    // 创建悬浮按钮（备用方案）
    function createFloatingButtons() {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            display: flex;
            gap: 8px;
            flex-direction: column;
        `;

        const quickButton = createQuickBookmarkButton();
        quickButton.style.cssText += `
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        
        const advancedButton = createAdvancedBookmarkButton();
        advancedButton.style.cssText += `
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;

        container.appendChild(quickButton);
        container.appendChild(advancedButton);
        document.body.appendChild(container);
        return true;
    }

    // 添加快捷键支持 (Ctrl+Shift+B)
    function addKeyboardShortcut() {
        document.addEventListener('keydown', async (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyB') {
                e.preventDefault();
                
                const postId = getPostId();
                if (!postId) {
                    Swal.fire({
                        icon: 'error',
                        title: '错误',
                        text: '无法获取帖子ID',
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 2000
                    });
                    return;
                }

                try {
                    // 检查当前收藏状态
                    const apiStatus = await checkBookmarkStatusByAPI(postId);
                    
                    if (apiStatus && apiStatus.isBookmarked) {
                        // 取消收藏
                        const bookmarkId = apiStatus.bookmarkId;
                        if (bookmarkId) {
                            const success = await removeBookmark(bookmarkId);
                            if (success) {
                                Swal.fire({
                                    icon: 'success',
                                    title: '取消收藏',
                                    text: '已从收藏夹中移除 (快捷键)',
                                    toast: true,
                                    position: 'top-end',
                                    showConfirmButton: false,
                                    timer: 2000,
                                    timerProgressBar: true
                                });
                            }
                        }
                    } else {
                        // 添加收藏
                        const result = await toggleBookmark(postId);
                        if (result.success === 'OK') {
                            Swal.fire({
                                icon: 'success',
                                title: '收藏成功',
                                text: '已添加到收藏夹 (快捷键)',
                                toast: true,
                                position: 'top-end',
                                showConfirmButton: false,
                                timer: 2000,
                                timerProgressBar: true
                            });
                        }
                    }
                } catch (error) {
                    console.error('快捷键收藏操作失败:', error);
                    Swal.fire({
                        icon: 'error',
                        title: '操作失败',
                        text: error.message || '请重试',
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 2000
                    });
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

        // 调试用户名获取（开发阶段使用）
        console.log('Linux.do 快速收藏脚本启动');
        const currentUsername = getCurrentUsername();
        console.log('当前用户名:', currentUsername);
        
        if (!currentUsername) {
            console.log('启动详细调试...');
            debugCurrentUsername();
        }

        // 等待页面元素加载完成后再添加按钮
        function waitAndAddButtons() {
            setTimeout(() => {
                const topicMap = document.querySelector('.post__topic-map.topic-map.--op');
                
                if (topicMap) {
                    addButtonsToTopicMap();
                } else {
                    createFloatingButtons();
                }
            }, 2000); // 延迟2秒确保页面加载完成
        }
        
        waitAndAddButtons();

        // 添加快捷键支持
        addKeyboardShortcut();
    }

    // 启动脚本
    init();

})();