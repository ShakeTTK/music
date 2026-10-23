/* =========================================================================
   水面涟漪效果（成熟开源方案：jquery.ripples by sirxemic，MIT License）
   官网/仓库：https://github.com/sirxemic/jquery.ripples
   - 用 WebGL 对背景图做真实的水面波动与折射
   - 鼠标滑动产生细小涟漪，点击/触摸产生明显波纹
   - 初始化失败、WebGL 不可用或用户开启"减少动态效果"时，
     自动保留 Faircamp 原本的静态背景（无副作用）
   ========================================================================= */
(function () {
    'use strict';

    try {
        var cfg = (window.__SITE_CONFIG__ || {}).water || {};
        if (String(cfg.enabled || 'true').toLowerCase() === 'false') return;
        // 嵌入播放器页面保持轻量，不加载水波
        if (window.location.pathname.indexOf('/embed') !== -1) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        var $ = window.jQuery;
        if (!$ || !$.fn || !$.fn.ripples) {
            if (window.console && console.info) console.info('[water] jquery.ripples 未加载，使用静态背景');
            return;
        }

        var meta = document.querySelector('meta[name="water-bg"]');
        var backgroundUrl = meta ? meta.getAttribute('content') : '';
        if (!backgroundUrl) {
            if (window.console && console.info) console.info('[water] 缺少水波背景图，使用静态背景');
            return;
        }

        var layer = document.createElement('div');
        layer.id = 'ripples-background';
        layer.setAttribute('aria-hidden', 'true');
        layer.style.backgroundImage = 'url("' + backgroundUrl + '")';
        document.body.appendChild(layer);

        try {
            $(layer).ripples({
                resolution: 384,
                dropRadius: 24,
                perturbance: 0.03,
                interactive: false
            });
        } catch (initError) {
            layer.remove();
            throw initError;
        }

        document.documentElement.classList.add('ripples-enabled');

        var $layer = $(layer);
        var strength = parseFloat(cfg.strength);
        if (isNaN(strength)) strength = 1.2;

        function drop(x, y, radius, amount) {
            try {
                $layer.ripples('drop', x, y, radius, amount);
            } catch (error) {
                /* 单次涟漪失败忽略即可 */
            }
        }

        var lastDrop = 0;
        window.addEventListener('pointermove', function (event) {
            var now = performance.now();
            if (now - lastDrop < 80) return;
            lastDrop = now;
            drop(event.clientX, event.clientY, 20, 0.035 * strength);
        }, { passive: true });

        window.addEventListener('pointerdown', function (event) {
            drop(event.clientX, event.clientY, 32, 0.085 * strength);
        }, { passive: true });

        /* 无人操作时的轻微水面呼吸 */
        setInterval(function () {
            if (document.hidden) return;
            drop(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 22, 0.02 * strength);
        }, 4200);
    } catch (error) {
        /* 水波失败时安静退出，站点背景保持原样 */
        if (window.console && console.warn) console.warn('[water] 水波效果未启用:', error);
    }
})();
