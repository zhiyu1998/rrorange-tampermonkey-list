// ==UserScript==
// @name         Bilibili批量取消关注脚本（精简版）
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  一键批量取消哔哩哔哩关注
// @author       RrOrange
// @homepage     https://github.com/zhiyu1998/rrorange-tampermonkey-list
// @match        *://space.bilibili.com/*/relation/follow*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建控制面板
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.top = '100px';
        panel.style.right = '20px';
        panel.style.backgroundColor = '#fff';
        panel.style.border = '1px solid #ccc';
        panel.style.borderRadius = '5px';
        panel.style.padding = '10px';
        panel.style.zIndex = '9999';
        panel.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';

        const title = document.createElement('h3');
        title.textContent = '批量取消关注';
        title.style.margin = '0 0 10px 0';
        title.style.color = '#FB7299'; // B站粉色

        const countInput = document.createElement('input');
        countInput.type = 'number';
        countInput.min = '1';
        countInput.max = '100';
        countInput.value = '20';
        countInput.placeholder = '数量';
        countInput.style.width = '80px';
        countInput.style.marginRight = '10px';
        countInput.style.padding = '5px';
        countInput.style.border = '1px solid #ddd';
        countInput.style.borderRadius = '3px';

        const delayInput = document.createElement('input');
        delayInput.type = 'number';
        delayInput.min = '500';
        delayInput.max = '5000';
        delayInput.value = '1000';
        delayInput.placeholder = '延迟(ms)';
        delayInput.style.width = '80px';
        delayInput.style.padding = '5px';
        delayInput.style.border = '1px solid #ddd';
        delayInput.style.borderRadius = '3px';

        const startButton = document.createElement('button');
        startButton.textContent = '开始取关';
        startButton.style.backgroundColor = '#FB7299'; // B站粉色
        startButton.style.color = 'white';
        startButton.style.border = 'none';
        startButton.style.borderRadius = '3px';
        startButton.style.padding = '5px 10px';
        startButton.style.marginTop = '10px';
        startButton.style.cursor = 'pointer';
        startButton.style.width = '100%';

        const statusDiv = document.createElement('div');
        statusDiv.style.marginTop = '10px';
        statusDiv.style.fontSize = '12px';
        statusDiv.style.color = '#666';

        // 添加事件监听
        startButton.addEventListener('click', function() {
            const maxUnfollows = parseInt(countInput.value, 10);
            const delay = parseInt(delayInput.value, 10);

            if (isNaN(maxUnfollows) || isNaN(delay)) {
                statusDiv.textContent = '请输入有效的数字';
                return;
            }

            unfollowAccounts(maxUnfollows, delay, statusDiv);
        });

        // 组装面板
        panel.appendChild(title);
        panel.appendChild(document.createTextNode('取关数量: '));
        panel.appendChild(countInput);
        panel.appendChild(document.createElement('br'));
        panel.appendChild(document.createTextNode('延迟(毫秒): '));
        panel.appendChild(delayInput);
        panel.appendChild(document.createElement('br'));
        panel.appendChild(startButton);
        panel.appendChild(statusDiv);

        document.body.appendChild(panel);
    }

    // 取消关注主函数
    async function unfollowAccounts(maxUnfollows, delay, statusElement) {
        // 获取所有关注按钮
        const followButtons = document.querySelectorAll('.follow-btn__trigger.gray');

        if (followButtons.length === 0) {
            statusElement.textContent = '没有找到关注按钮，请确认在正确的页面';
            return;
        }

        const actualCount = Math.min(maxUnfollows, followButtons.length);
        const confirmed = confirm(`将取消关注 ${actualCount} 个账号，是否继续？`);

        if (!confirmed) {
            statusElement.textContent = '操作已取消';
            return;
        }

        statusElement.textContent = `准备取消 ${actualCount} 个关注...`;

        let count = 0;
        let success = 0;

        for (let i = 0; i < followButtons.length && i < maxUnfollows; i++) {
            const button = followButtons[i];

            try {
                // 点击关注按钮打开菜单
                button.click();

                // 等待菜单出现
                await new Promise(resolve => setTimeout(resolve, 300));

                // 查找取消关注选项
                const menuItems = document.querySelectorAll('.popover-menu-item');
                const unfollowOption = Array.from(menuItems).find(item =>
                    item.textContent.includes('取消关注'));

                if (unfollowOption) {
                    unfollowOption.click();
                    success++;
                    statusElement.textContent = `进度: ${++count}/${actualCount}, 成功: ${success}`;

                    // 添加延迟
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    statusElement.textContent = `进度: ${++count}/${actualCount}, 成功: ${success}, 当前项未找到取消关注选项`;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                statusElement.textContent = `进度: ${++count}/${actualCount}, 成功: ${success}, 错误: ${error.message}`;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        statusElement.textContent = `完成! 成功取消 ${success} 个关注。`;

        if (success < followButtons.length) {
            statusElement.innerHTML = `${statusElement.textContent}<br>还有 ${followButtons.length - success} 个账号可以取消关注。刷新页面并再次运行脚本继续。`;
        }
    }

    // 添加一个小延迟，确保页面完全加载
    setTimeout(createControlPanel, 2000);
})();
