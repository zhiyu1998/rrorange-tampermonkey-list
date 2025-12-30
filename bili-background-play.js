// ==UserScript==
// @name         B站后台播放 - 快速隐藏视频
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  按 ` 键快速隐藏视频画面+模糊全页面，只保留音频播放，公共场合救星
// @author       RrOrange
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let isHidden = false;
    let indicator = null;

    // 添加样式
    GM_addStyle(`
        /* 视频区域完全隐藏 */
        .bgplay-hidden .bpx-player-video-area,
        .bgplay-hidden .bilibili-player-video-wrap,
        .bgplay-hidden video {
            opacity: 0 !important;
        }

        .bgplay-hidden .bpx-player-container {
            background: #000 !important;
        }

        /* 全屏毛玻璃蒙版 */
        .bgplay-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            z-index: 9999;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .bgplay-overlay.active {
            opacity: 1;
            pointer-events: auto;
        }

        /* 蒙版上的伪装内容 */
        .bgplay-fake-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #999;
            font-size: 16px;
            user-select: none;
        }

        .bgplay-fake-content .fake-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .bgplay-fake-content .fake-text {
            color: #666;
            font-size: 14px;
            margin-top: 8px;
        }

        /* 音频控制浮窗 */
        .bgplay-control {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.75);
            color: #fff;
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 14px;
            z-index: 10001;
            display: none;
            align-items: center;
            gap: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .bgplay-control.show {
            display: flex;
        }

        .bgplay-control button {
            background: none;
            border: none;
            color: #fff;
            font-size: 20px;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: background 0.2s;
        }

        .bgplay-control button:hover {
            background: rgba(255,255,255,0.2);
        }

        /* 提示气泡 */
        .bgplay-indicator {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 20px 40px;
            border-radius: 8px;
            font-size: 18px;
            z-index: 10002;
            pointer-events: none;
            transition: opacity 0.3s;
        }

        .bgplay-indicator.fade-out {
            opacity: 0;
        }

        /* 右下角按钮 */
        .bgplay-toggle-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #00a1d6;
            color: #fff;
            padding: 10px 16px;
            border-radius: 20px;
            font-size: 14px;
            cursor: pointer;
            z-index: 99998;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            transition: transform 0.2s, background 0.2s;
            border: none;
        }

        .bgplay-toggle-btn:hover {
            transform: scale(1.05);
            background: #00b5e5;
        }

        .bgplay-toggle-btn.active {
            background: #fb7299;
        }
    `);

    // 创建毛玻璃蒙版
    const overlay = document.createElement('div');
    overlay.className = 'bgplay-overlay';
    overlay.innerHTML = `
        <div class="bgplay-fake-content">
            <div class="fake-icon">📄</div>
            <div>页面加载中...</div>
            <div class="fake-text">请稍候</div>
        </div>
    `;
    document.body.appendChild(overlay);

    // 创建音频控制条
    const control = document.createElement('div');
    control.className = 'bgplay-control';
    control.innerHTML = `
        <button id="bgplay-prev" title="后退5秒">⏪</button>
        <button id="bgplay-playpause" title="播放/暂停">⏸️</button>
        <button id="bgplay-next" title="前进5秒">⏩</button>
        <span id="bgplay-time">00:00 / 00:00</span>
        <button id="bgplay-exit" title="退出隐藏模式 (ESC)">✕</button>
    `;
    document.body.appendChild(control);

    // 创建切换按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'bgplay-toggle-btn';
    toggleBtn.innerHTML = '🎧 按 ` 隐藏';
    toggleBtn.title = '快捷键：` (反引号)\nESC 恢复显示';
    document.body.appendChild(toggleBtn);

    // 获取视频元素
    function getVideo() {
        return document.querySelector('video');
    }

    // 格式化时间
    function formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    // 更新时间显示
    function updateTime() {
        const video = getVideo();
        if (video && isHidden) {
            const timeDisplay = document.getElementById('bgplay-time');
            timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`;
        }
    }

    // 更新播放按钮状态
    function updatePlayButton() {
        const video = getVideo();
        const btn = document.getElementById('bgplay-playpause');
        if (video && btn) {
            btn.textContent = video.paused ? '▶️' : '⏸️';
        }
    }

    // 显示提示
    function showIndicator(text) {
        if (indicator) indicator.remove();

        indicator = document.createElement('div');
        indicator.className = 'bgplay-indicator';
        indicator.textContent = text;
        document.body.appendChild(indicator);

        setTimeout(() => {
            indicator.classList.add('fade-out');
            setTimeout(() => indicator.remove(), 300);
        }, 800);
    }

    // 切换隐藏状态
    function toggleHidden() {
        isHidden = !isHidden;
        const player = document.querySelector('.bpx-player-container') ||
                       document.querySelector('#bilibili-player');

        if (isHidden) {
            // 隐藏模式
            if (player) player.classList.add('bgplay-hidden');
            overlay.classList.add('active');
            control.classList.add('show');
            toggleBtn.classList.add('active');
            toggleBtn.innerHTML = '📺 按 ` 恢复';
            showIndicator('🎧 已开启隐藏模式');
            updatePlayButton();
            updateTime();
        } else {
            // 正常模式
            if (player) player.classList.remove('bgplay-hidden');
            overlay.classList.remove('active');
            control.classList.remove('show');
            toggleBtn.classList.remove('active');
            toggleBtn.innerHTML = '🎧 按 ` 隐藏';
            showIndicator('📺 已恢复显示');
        }
    }

    // 控制条事件绑定
    document.getElementById('bgplay-playpause').addEventListener('click', () => {
        const video = getVideo();
        if (video) {
            video.paused ? video.play() : video.pause();
            updatePlayButton();
        }
    });

    document.getElementById('bgplay-prev').addEventListener('click', () => {
        const video = getVideo();
        if (video) video.currentTime -= 5;
    });

    document.getElementById('bgplay-next').addEventListener('click', () => {
        const video = getVideo();
        if (video) video.currentTime += 5;
    });

    document.getElementById('bgplay-exit').addEventListener('click', () => {
        if (isHidden) toggleHidden();
    });

    toggleBtn.addEventListener('click', toggleHidden);

    // 点击蒙版任意位置也可退出
    overlay.addEventListener('dblclick', () => {
        if (isHidden) toggleHidden();
    });

    // 定时更新时间
    setInterval(updateTime, 1000);

    // 监听视频播放状态变化
    const observer = new MutationObserver(() => {
        const video = getVideo();
        if (video) {
            video.addEventListener('play', updatePlayButton);
            video.addEventListener('pause', updatePlayButton);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 监听快捷键
    document.addEventListener('keydown', (e) => {
        // 忽略输入框中的按键
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
            e.target.isContentEditable) {
            return;
        }

        // 按 ` 键切换
        if (e.key === '`' || e.code === 'Backquote') {
            e.preventDefault();
            toggleHidden();
        }

        // 按 ESC 恢复显示
        if (e.key === 'Escape' && isHidden) {
            e.preventDefault();
            toggleHidden();
        }

        // 隐藏模式下的快捷键
        if (isHidden) {
            const video = getVideo();
            if (!video) return;

            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    video.paused ? video.play() : video.pause();
                    updatePlayButton();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    video.currentTime -= 5;
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    video.currentTime += 5;
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    video.volume = Math.min(1, video.volume + 0.1);
                    showIndicator(`🔊 音量 ${Math.round(video.volume * 100)}%`);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    video.volume = Math.max(0, video.volume - 0.1);
                    showIndicator(`🔊 音量 ${Math.round(video.volume * 100)}%`);
                    break;
            }
        }
    });

    console.log('[B站后台播放 v2.0] 已加载 - 按 ` 隐藏画面，ESC 恢复');
})();