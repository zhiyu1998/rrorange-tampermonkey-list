// ==UserScript==
// @name         B站倍速记忆
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  记住B站视频播放倍速，自动应用到新视频。点击按钮弹出倍速选择菜单（1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0）
// @author       RrOrange
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置常量
    const PRESET_SPEEDS = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    const STORAGE_KEY = 'BILI_PLAYBACK_SPEED';
    const DEFAULT_SPEED = 1.0;
    const SPEED_EPSILON = 0.01;
    const BILI_BLUE = '#00a1d6';
    const BILI_BLUE_HOVER = '#00b5e5';

    // 状态管理
    let savedSpeed = DEFAULT_SPEED;
    let currentSpeed = DEFAULT_SPEED;
    let suppressRatechangeUntil = 0;

    let uiRoot = null;
    let speedButton = null;
    let speedMenu = null;
    let isMenuVisible = false;

    let activeVideo = null;
    let detachVideoListeners = null;
    let refreshTimer = null;

    // 添加样式
    GM_addStyle(`
        /* 倍速按钮 */
        .bili-speed-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: ${BILI_BLUE};
            color: #fff;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            z-index: 9999;
            transition: all 0.2s ease;
            border: none;
            outline: none;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .bili-speed-btn:hover {
            background: ${BILI_BLUE_HOVER};
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .bili-speed-btn:active {
            transform: scale(0.98);
        }

        /* 倍速菜单 */
        .bili-speed-menu {
            position: absolute;
            top: 35px;
            right: 0;
            background: #fff;
            border: 1px solid #e7e7e7;
            border-radius: 6px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            padding: 6px 0;
            z-index: 10000;
            min-width: 80px;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }

        .bili-speed-menu.show {
            display: block;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .bili-speed-item {
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.2s;
            color: #333;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .bili-speed-item:hover {
            background: #f6f7f8;
        }

        .bili-speed-item.active {
            color: ${BILI_BLUE};
            font-weight: 600;
            background: #f0f9ff;
        }

        .bili-speed-item.active::after {
            content: '✓';
            font-weight: 600;
        }

        /* 按钮容器，用于定位 */
        .bili-speed-btn-container {
            position: absolute;
            top: 0;
            right: 0;
            z-index: 9999;
        }
    `);

    function getPlayerContainer() {
        return document.querySelector('.bpx-player-container') ||
            document.querySelector('#bilibili-player') ||
            document.querySelector('.bilibili-player') ||
            document.querySelector('.bpx-player-video-area') ||
            null;
    }

    // 获取视频元素
    function getVideo() {
        const playerContainer = getPlayerContainer();
        const inPlayer = playerContainer ? playerContainer.querySelector('video') : null;
        return inPlayer || document.querySelector('video');
    }

    function parseNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return null;
    }

    // 从存储获取保存的倍速
    function getSavedSpeed() {
        const saved = GM_getValue(STORAGE_KEY, null);
        const savedNumber = parseNumber(saved);
        if (savedNumber !== null) {
            const matched = PRESET_SPEEDS.find(preset => Math.abs(preset - savedNumber) < 0.001);
            if (matched !== undefined) return matched;
        }
        return DEFAULT_SPEED;
    }

    // 保存倍速到存储
    function saveSpeed(speed) {
        GM_setValue(STORAGE_KEY, speed);
    }

    // 应用倍速到视频
    function applySpeedToVideo(speed, video = getVideo()) {
        if (video) {
            if (Number.isFinite(video.playbackRate) && Math.abs(video.playbackRate - speed) < SPEED_EPSILON) {
                currentSpeed = speed;
                updateButtonDisplay();
                updateMenuSelection();
                return;
            }
            suppressRatechangeUntil = Date.now() + 250;
            video.playbackRate = speed;
            currentSpeed = speed;
            updateButtonDisplay();
            updateMenuSelection();
        }
    }

    // 更新按钮显示
    function updateButtonDisplay() {
        if (speedButton) {
            speedButton.textContent = `${currentSpeed}x`;
        }
    }

    // 更新菜单选中状态
    function updateMenuSelection() {
        if (!speedMenu) return;

        const items = speedMenu.querySelectorAll('.bili-speed-item');
        items.forEach(item => {
            const itemSpeed = parseFloat(item.dataset.speed);
            if (Math.abs(itemSpeed - currentSpeed) < 0.001) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // 显示倍速菜单
    function showSpeedMenu() {
        if (!speedMenu) {
            createSpeedMenu();
        }
        updateMenuSelection();
        speedMenu.classList.add('show');
        isMenuVisible = true;
    }

    // 隐藏倍速菜单
    function hideSpeedMenu() {
        if (speedMenu) {
            speedMenu.classList.remove('show');
        }
        isMenuVisible = false;
    }

    // 切换菜单显示状态
    function toggleSpeedMenu() {
        if (isMenuVisible) {
            hideSpeedMenu();
        } else {
            showSpeedMenu();
        }
    }

    // 创建倍速菜单
    function createSpeedMenu() {
        if (speedMenu) return;

        speedMenu = document.createElement('div');
        speedMenu.className = 'bili-speed-menu';

        PRESET_SPEEDS.forEach(speed => {
            const item = document.createElement('div');
            item.className = 'bili-speed-item';
            item.dataset.speed = speed;
            item.textContent = `${speed}x`;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                savedSpeed = speed;
                applySpeedToVideo(speed);
                saveSpeed(speed);
                hideSpeedMenu();
            });

            speedMenu.appendChild(item);
        });

        // 将菜单添加到按钮容器中
        if (uiRoot) {
            uiRoot.appendChild(speedMenu);
        }
    }

    function ensureUI() {
        const playerContainer = getPlayerContainer();
        if (!playerContainer) return false;

        if (!uiRoot) {
            uiRoot = document.createElement('div');
            uiRoot.className = 'bili-speed-btn-container';

            speedButton = document.createElement('button');
            speedButton.type = 'button';
            speedButton.className = 'bili-speed-btn';
            speedButton.title = '点击选择播放倍速';
            speedButton.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSpeedMenu();
            });

            uiRoot.appendChild(speedButton);
            createSpeedMenu();
        }

        if (uiRoot.parentElement !== playerContainer) {
            playerContainer.appendChild(uiRoot);
        }

        updateButtonDisplay();
        return true;
    }

    // 初始化倍速
    function initializeSpeed() {
        // 加载保存的倍速
        savedSpeed = getSavedSpeed();
        currentSpeed = savedSpeed;
        updateButtonDisplay();

        // 应用到当前视频
        const video = getVideo();
        if (video) {
            // 等待视频元数据加载完成
            if (video.readyState >= 1) {
                applySpeedToVideo(savedSpeed, video);
            } else {
                video.addEventListener('loadedmetadata', () => {
                    applySpeedToVideo(savedSpeed, video);
                }, { once: true });
            }
        }
    }

    function attachVideoListeners(video) {
        if (!video) return () => {};

        const onLoadedmetadata = () => {
            applySpeedToVideo(savedSpeed, video);
        };

        const onRatechange = () => {
            if (Date.now() < suppressRatechangeUntil) return;
            const rate = video.playbackRate;
            if (!Number.isFinite(rate)) return;
            if (Math.abs(rate - currentSpeed) < SPEED_EPSILON) return;

            // 外部修改倍速时，只更新当前值，不写入存储
            currentSpeed = rate;
            updateButtonDisplay();
            updateMenuSelection();

            // 分P切换/换源时播放器可能先重置到 1x：此时自动恢复到保存的倍速
            if (
                Math.abs(rate - DEFAULT_SPEED) < SPEED_EPSILON &&
                Math.abs(savedSpeed - DEFAULT_SPEED) > SPEED_EPSILON &&
                video.readyState < 2 &&
                video.currentTime < 1
            ) {
                setTimeout(() => applySpeedToVideo(savedSpeed, video), 120);
            }
        };

        video.addEventListener('loadedmetadata', onLoadedmetadata);
        video.addEventListener('ratechange', onRatechange);

        if (video.readyState >= 1) {
            applySpeedToVideo(savedSpeed, video);
        }

        return () => {
            video.removeEventListener('loadedmetadata', onLoadedmetadata);
            video.removeEventListener('ratechange', onRatechange);
        };
    }

    function refresh() {
        ensureUI();

        const video = getVideo();
        if (!video) return;

        if (activeVideo !== video) {
            if (detachVideoListeners) detachVideoListeners();
            activeVideo = video;
            detachVideoListeners = attachVideoListeners(video);
        }
    }

    function scheduleRefresh() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            refresh();
        }, 120);
    }

    function patchHistoryEvents() {
        if (patchHistoryEvents._patched) return;
        patchHistoryEvents._patched = true;

        try {
            const rawPushState = history.pushState;
            const rawReplaceState = history.replaceState;

            history.pushState = function(...args) {
                const result = rawPushState.apply(this, args);
                scheduleRefresh();
                return result;
            };

            history.replaceState = function(...args) {
                const result = rawReplaceState.apply(this, args);
                scheduleRefresh();
                return result;
            };
        } catch (_) {
            // ignore
        }
    }

    function observePageChanges() {
        const observer = new MutationObserver(() => {
            scheduleRefresh();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        window.addEventListener('popstate', scheduleRefresh);
        window.addEventListener('hashchange', scheduleRefresh);
    }

    // 点击页面其他地方关闭菜单
    function setupMenuCloseHandler() {
        document.addEventListener('click', (e) => {
            if (isMenuVisible && speedMenu) {
                const btnContainer = document.querySelector('.bili-speed-btn-container');
                if (btnContainer && !btnContainer.contains(e.target)) {
                    hideSpeedMenu();
                }
            }
        });

        document.addEventListener('scroll', () => {
            if (isMenuVisible) {
                hideSpeedMenu();
            }
        });

        window.addEventListener('resize', () => {
            if (isMenuVisible) {
                hideSpeedMenu();
            }
        });
    }

    // 初始化函数
    function initialize() {
        initializeSpeed();
        setupMenuCloseHandler();
        patchHistoryEvents();
        observePageChanges();
        refresh();

        setTimeout(refresh, 800);
        setTimeout(refresh, 2500);
    }

    // 页面加载完成后初始化
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initialize();
    } else {
        window.addEventListener('DOMContentLoaded', initialize, { once: true });
    }

})();
