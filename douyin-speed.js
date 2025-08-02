// ==UserScript==
// @name         抖音网页版快捷键 - 倍速切换 (Mac兼容版)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  在抖音网页版使用Shift+1(!)切换1倍速，Shift+2(@)切换2倍速，Shift+3(#)切换1.5倍速
// @author       YourName
// @match        *://*.douyin.com/*
// @icon         https://www.douyin.com/favicon.ico
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 配置 - 同时支持特殊字符和数字
    const speedSettings = {
        '1': 1.0,  // 数字1
        '!': 1.0,  // Shift+1 (Mac)
        '2': 2.0,  // 数字2
        '@': 2.0,  // Shift+2 (Mac)
        '3': 1.5,  // 数字3
        '#': 1.5   // Shift+3 (Mac)
    };

    // 显示提示信息
    function showToast(message) {
        const existingToast = document.getElementById('speed-toast');
        if (existingToast) {
            existingToast.remove();
        }
        const toast = document.createElement('div');
        toast.id = 'speed-toast';
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            top: '25px',
            right: '25px',
            padding: '10px 20px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            borderRadius: '8px',
            zIndex: '999999',
            fontSize: '16px',
            fontWeight: 'bold',
            opacity: '1',
            transition: 'opacity 0.5s ease-out'
        });
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 2000);
    }

    // 查找视频元素
    function findVideoElement() {
        const selectors = [
            '#player-container video',
            '.xgplayer-video video',
            '.xgplayer-video-container video',
            '.player-container video',
            '.swiper-slide-active video',
            '.swiper-item-active video',
            'video[data-e2e="video-player"]',
            '.xg-video video',
            '.xgplayer video',
            'video'
        ];

        // 尝试每一个选择器
        for (const selector of selectors) {
            const videos = document.querySelectorAll(selector);
            for (const video of videos) {
                // 返回第一个有效的视频
                if (video && video.offsetWidth > 0 && video.offsetHeight > 0) {
                    return video;
                }
            }
        }
        return null;
    }

    // 设置播放速度
    function setPlaybackRate(rate) {
        const videoElement = findVideoElement();
        if (videoElement) {
            videoElement.playbackRate = rate;
            showToast(`播放速度: ${rate.toFixed(1)}x`);
        } else {
            showToast('未找到视频');
        }
    }

    // 处理键盘事件
    function handleKeyDown(event) {
        // 跳过输入框
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
            return;
        }
        
        // 直接检查按键值
        const speed = speedSettings[event.key];
        if (speed !== undefined) {
            event.preventDefault();
            event.stopPropagation();
            setPlaybackRate(speed);
        }
    }

    // 添加键盘事件监听器
    document.addEventListener('keydown', handleKeyDown, true);
})();
