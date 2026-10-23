/* =========================================================================
   折叠评论窗口（独立模块）
   - 右下角「留言」按钮，点击展开一个浮动窗口
   - 使用 giscus（GitHub Discussions）承载评论：可发送、可查看、有时间显示
   - 未配置 repo_id / category_id 时自动不显示，不影响站点
   ========================================================================= */
(function () {
    'use strict';

    try {
        var cfg = (window.__SITE_CONFIG__ || {}).comments || {};
        if (String(cfg.enabled || 'true').toLowerCase() === 'false') return;
        // 嵌入播放器页面不显示评论入口
        if (window.location.pathname.indexOf('/embed') !== -1) return;
        if (!cfg.repo || !cfg.repo_id || !cfg.category_id) {
            if (window.console && console.info) {
                console.info('[comments] 尚未配置 repo_id / category_id，评论窗口未启用（参考 docs/02-部署与更新说明.md）');
            }
            return;
        }

        var loaded = false;
        var lastFocused = null;

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'comments-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'comments-panel');
        toggle.innerHTML = '<span class="comments-toggle__dot" aria-hidden="true"></span><span>留言</span>';

        var panel = document.createElement('section');
        panel.id = 'comments-panel';
        panel.className = 'comments-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '留言');
        panel.innerHTML =
            '<div class="comments-panel__header">' +
            '  <h2 class="comments-panel__title">留言</h2>' +
            '  <button type="button" class="comments-panel__close" aria-label="关闭留言窗口">×</button>' +
            '</div>' +
            '<div class="comments-panel__body"><div id="comments-embed"></div></div>';

        document.body.appendChild(toggle);
        document.body.appendChild(panel);

        function openPanel() {
            lastFocused = document.activeElement;
            panel.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
            var closeBtn = panel.querySelector('.comments-panel__close');
            if (closeBtn) closeBtn.focus();
            if (!loaded) {
                loaded = true;
                loadGiscus();
            }
        }

        function closePanel() {
            panel.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            if (lastFocused && lastFocused.focus) lastFocused.focus();
            else toggle.focus();
        }

        function loadGiscus() {
            var container = panel.querySelector('#comments-embed');
            if (!container) return;

            var script = document.createElement('script');
            script.src = 'https://giscus.app/client.js';
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.setAttribute('data-repo', cfg.repo);
            script.setAttribute('data-repo-id', cfg.repo_id);
            script.setAttribute('data-category', cfg.category || 'Comments');
            script.setAttribute('data-category-id', cfg.category_id);
            script.setAttribute('data-mapping', 'pathname');
            script.setAttribute('data-strict', '0');
            script.setAttribute('data-reactions-enabled', '1');
            script.setAttribute('data-emit-metadata', '0');
            script.setAttribute('data-input-position', 'top');
            script.setAttribute('data-theme', 'preferred_color_scheme');
            script.setAttribute('data-lang', 'zh-CN');
            script.setAttribute('data-loading', 'lazy');

            script.onerror = function () {
                container.innerHTML =
                    '<p class="comments-panel__hint">评论加载失败（可能被网络拦截）。' +
                    '你也可以直接到 <a href="https://github.com/' + cfg.repo + '/discussions" target="_blank" rel="noopener">GitHub Discussions</a> 留言。</p>';
            };

            container.appendChild(script);
        }

        toggle.addEventListener('click', function () {
            if (panel.classList.contains('is-open')) closePanel();
            else openPanel();
        });

        panel.addEventListener('click', function (event) {
            if (event.target && event.target.classList && event.target.classList.contains('comments-panel__close')) {
                closePanel();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
        });
    } catch (error) {
        if (window.console && console.warn) console.warn('[comments] 评论窗口未启用:', error);
    }
})();
