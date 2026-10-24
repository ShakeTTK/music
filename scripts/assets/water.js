/* =========================================================================
   水面涟漪效果（成熟开源方案：jquery.ripples by sirxemic，MIT License）
   官网/仓库：https://github.com/sirxemic/jquery.ripples

   - 用 WebGL 对背景图做真实的水面波动与折射
   - 右侧中间提供「水波」开关，可随时开启/关闭，并记住选择
   - 关闭水波时**保留背景图静态层**，只移除 WebGL 画布，
     因此不会出现背景变黑/空白
   - 初始化失败、WebGL 不可用或用户开启"减少动态效果"时，
     自动保留 Faircamp 原本的静态背景（无副作用）
   ========================================================================= */
(function () {
    'use strict';

    try {
        var cfg = (window.__SITE_CONFIG__ || {}).water || {};
        if (String(cfg.enabled || 'true').toLowerCase() === 'false') return;
        if (window.location.pathname.indexOf('/embed') !== -1) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        var $ = window.jQuery;
        if (!$ || !$.fn || !$.fn.ripples) {
            if (window.console && console.info) console.info('[water] jquery.ripples 未加载，使用静态背景');
            return;
        }

        var meta = document.querySelector('meta[name="water-bg"]');
        var rawBackgroundUrl = meta ? meta.getAttribute('content') : '';
        if (!rawBackgroundUrl) {
            if (window.console && console.info) console.info('[water] 缺少水波背景图，使用静态背景');
            return;
        }

        // 必须转成绝对地址：站内无刷新跳转后当前页面路径会变化，
        // 相对地址会被重新解析到错误目录，导致背景图 404、背景变黑。
        var backgroundUrl = rawBackgroundUrl;
        try {
            backgroundUrl = new URL(rawBackgroundUrl, window.location.href).href;
        } catch (error) {
            backgroundUrl = rawBackgroundUrl;
        }

        var STORAGE_KEY = 'music-site-water-enabled';
        var strength = parseFloat(cfg.strength);
        if (isNaN(strength)) strength = 1.2;

        var active = false;
        var layer = null;
        var $layer = null;
        var ripplesInitialized = false;
        var ambientTimer = null;
        var lastDrop = 0;
        var button = null;
        var label = null;

        function backgroundStyle() {
            return 'url("' + backgroundUrl + '")';
        }

        function ensureLayer() {
            if (layer && layer.parentNode) {
                layer.style.backgroundImage = backgroundStyle();
                document.documentElement.classList.add('ripples-enabled');
                return true;
            }
            layer = document.createElement('div');
            layer.id = 'ripples-background';
            layer.setAttribute('aria-hidden', 'true');
            layer.style.backgroundImage = backgroundStyle();
            document.body.appendChild(layer);
            document.documentElement.classList.add('ripples-enabled');
            return true;
        }

        function initRipples() {
            if (ripplesInitialized) return true;
            if (!ensureLayer()) return false;
            try {
                $layer = $(layer);
                $layer.ripples({
                    resolution: 384,
                    dropRadius: 24,
                    perturbance: 0.03,
                    interactive: false
                });
                ripplesInitialized = true;
                return true;
            } catch (initError) {
                $layer = null;
                ripplesInitialized = false;
                if (layer) {
                    layer.querySelectorAll('canvas').forEach(function (canvas) { canvas.remove(); });
                    layer.style.backgroundImage = backgroundStyle();
                }
                return false;
            }
        }

        function destroyRipples() {
            if ($layer) {
                try { $layer.ripples('destroy'); } catch (error) { /* 忽略 */ }
            }
            $layer = null;
            ripplesInitialized = false;

            // 无论 destroy 是否成功，都确保静态背景层仍然存在并显示原图
            ensureLayer();
            if (layer) {
                layer.querySelectorAll('canvas').forEach(function (canvas) { canvas.remove(); });
                layer.style.backgroundImage = backgroundStyle();
            }
        }

        function drop(x, y, radius, amount) {
            if (!$layer) return;
            try {
                $layer.ripples('drop', x, y, radius, amount);
            } catch (error) {
                /* 单次涟漪失败忽略即可 */
            }
        }

        function onPointerMove(event) {
            var now = performance.now();
            if (now - lastDrop < 80) return;
            lastDrop = now;
            drop(event.clientX, event.clientY, 20, 0.035 * strength);
        }

        function onPointerDown(event) {
            drop(event.clientX, event.clientY, 32, 0.085 * strength);
        }

        function savePreference(value) {
            try {
                window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
            } catch (error) { /* 忽略隐私模式等限制 */ }
        }

        function updateButton() {
            if (!button) return;
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
            button.setAttribute('aria-label', active ? '关闭背景水波效果' : '开启背景水波效果');
            button.title = active ? '关闭背景水波效果' : '开启背景水波效果';
            if (label) label.textContent = active ? '水波·开' : '水波·关';
        }

        function enable(save) {
            if (active) return true;
            if (!initRipples()) return false;
            active = true;
            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerdown', onPointerDown, { passive: true });
            if (ambientTimer === null) {
                ambientTimer = window.setInterval(function () {
                    if (document.hidden) return;
                    drop(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 22, 0.02 * strength);
                }, 4200);
            }
            if (save !== false) savePreference(true);
            updateButton();
            return true;
        }

        function disable(save) {
            if (ambientTimer !== null) {
                window.clearInterval(ambientTimer);
                ambientTimer = null;
            }
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerdown', onPointerDown);
            active = false;
            destroyRipples();
            if (save !== false) savePreference(false);
            updateButton();
        }

        function buildButton() {
            button = document.createElement('button');
            button.type = 'button';
            button.id = 'water-toggle';
            button.className = 'water-toggle';
            button.setAttribute('aria-pressed', 'false');
            button.innerHTML =
                '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
                '  <path d="M3 8c2.2 0 2.2 1.6 4.4 1.6S9.6 8 11.8 8s2.2 1.6 4.4 1.6S18.4 8 20.6 8"/>' +
                '  <path d="M3 13c2.2 0 2.2 1.6 4.4 1.6S9.6 13 11.8 13s2.2 1.6 4.4 1.6S18.4 13 20.6 13" opacity=".75"/>' +
                '  <path d="M3 18c2.2 0 2.2 1.6 4.4 1.6S9.6 18 11.8 18s2.2 1.6 4.4 1.6S18.4 18 20.6 18" opacity=".45"/>' +
                '</svg>' +
                '<span class="water-toggle__label">水波</span>';
            label = button.querySelector('.water-toggle__label');
            button.addEventListener('click', function () {
                if (active) disable(true);
                else enable(true);
            });
            document.body.appendChild(button);
        }

        buildButton();
        ensureLayer();

        var saved = null;
        try { saved = window.localStorage.getItem(STORAGE_KEY); } catch (error) { saved = null; }

        if (saved === '0') {
            updateButton();
        } else if (!enable(false)) {
            // WebGL 初始化失败：保留静态背景，不显示开关
            if (button && button.parentNode) button.remove();
            button = null;
            label = null;
        }

        window.WaterEffect = {
            enable: function () { return enable(true); },
            disable: function () { disable(true); },
            toggle: function () { if (active) disable(true); else enable(true); },
            isActive: function () { return active; }
        };
    } catch (error) {
        if (window.console && console.warn) console.warn('[water] 水波效果未启用:', error);
    }
})();
