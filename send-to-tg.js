// ==UserScript==
// @name         网页地址发送到Telegram - 快捷键版
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  使用快捷键(Alt + T)或菜单按钮将当前网页地址通过Telegram机器人发送给自己
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// ==/UserScript==

(function () {
    'use strict';

    // 配置区域 - 使用前请修改以下信息
    const BOT_TOKEN = ''; // 替换为你的Telegram机器人Token
    const CHAT_ID = '';     // 替换为你的Chat ID

    let isSending = false; // 防止重复发送

    // 发送URL到Telegram的函数
    function sendUrlToTelegram() {
        if (isSending) {
            console.log('正在发送中，请勿重复操作...');
            return;
        }
        isSending = true;
        console.log('准备发送链接到Telegram...');

        const currentUrl = window.location.href;
        const pageTitle = document.title;
        const message = `【网页分享】\n标题：${pageTitle}\n链接：${currentUrl}`;

        const apiUrl = `https://api-proxy.me/telegram/bot${BOT_TOKEN}/sendMessage`;

        GM_xmlhttpRequest({
            method: 'POST',
            url: apiUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                disable_web_page_preview: false
            }),
            onload: function (response) {
                isSending = false;
                try {
                    const result = JSON.parse(response.responseText);
                    if (result.ok) {
                        GM_notification({
                            title: '发送成功',
                            text: '链接已成功发送到Telegram！',
                            timeout: 3000
                        });
                    } else {
                        GM_notification({
                            title: '发送失败',
                            text: result.description,
                            timeout: 5000
                        });
                    }
                } catch (e) {
                    GM_notification({
                        title: '发送错误',
                        text: '解析响应时发生错误。',
                        timeout: 5000
                    });
                }
            },
            onerror: function (error) {
                isSending = false;
                GM_notification({
                    title: '网络错误',
                    text: '无法连接到Telegram API。',
                    timeout: 5000
                });
            }
        });
    }

    // 监听键盘事件
    document.addEventListener('keydown', function (e) {
        // 检查是否按下了 't' 或 'T' 键，并且Alt键被按下
        if (e.key.toLowerCase() === 't' && e.altKey) {
            // 阻止默认行为
            e.preventDefault();
            sendUrlToTelegram();
        }
    });

    // 添加一个菜单命令，用于手动发送
    GM_registerMenuCommand('手动发送到Telegram', sendUrlToTelegram, 's');

})();
