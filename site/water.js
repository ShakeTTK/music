/* =========================================================================
   水面涟漪效果（独立模块）
   鼠标滑动 → 细小涟漪；点击 / 触摸 → 明显波纹；无操作时偶尔自动起波。
   实现方式：Canvas 2D 高度场模拟 + 柔光叠加，无外部依赖。
   如果浏览器不支持、用户开启"减少动态效果"、或配置关闭，则自动不运行。
   ========================================================================= */
(function () {
    'use strict';

    try {
        var cfg = (window.__SITE_CONFIG__ || {}).water || {};
        if (String(cfg.enabled || 'true').toLowerCase() === 'false') return;
        // 嵌入播放器页面保持轻量，不加载水波效果
        if (window.location.pathname.indexOf('/embed') !== -1) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        var COLS = 280;
        var ROWS = 170;
        var W = COLS + 2;
        var H = ROWS + 2;

        var height = new Float32Array(W * H);
        var velocity = new Float32Array(W * H);

        var canvas = document.createElement('canvas');
        canvas.id = 'water-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);

        var ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) { canvas.remove(); return; }

        var off = document.createElement('canvas');
        off.width = COLS;
        off.height = ROWS;
        var offCtx = off.getContext('2d');
        if (!offCtx) { canvas.remove(); return; }
        var imageData = offCtx.createImageData(COLS, ROWS);
        var pixels = imageData.data;

        var strength = clampNumber(parseFloat(cfg.strength), 0.05, 3, 1.2);
        var opacity = clampNumber(parseFloat(cfg.opacity), 0.05, 1, 0.55);

        function clampNumber(value, min, max, fallback) {
            if (typeof value !== 'number' || isNaN(value)) return fallback;
            return Math.max(min, Math.min(max, value));
        }

        function resize() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
            canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
        }
        resize();
        window.addEventListener('resize', resize, { passive: true });

        function drop(nx, ny, amplitude) {
            var x = 1 + Math.floor(Math.max(0, Math.min(1, nx)) * (COLS - 1));
            var y = 1 + Math.floor(Math.max(0, Math.min(1, ny)) * (ROWS - 1));
            var i = y * W + x;
            velocity[i] += amplitude;
            velocity[i - 1] += amplitude * 0.6;
            velocity[i + 1] += amplitude * 0.6;
            velocity[i - W] += amplitude * 0.6;
            velocity[i + W] += amplitude * 0.6;
        }

        function step() {
            for (var y = 1; y <= ROWS; y++) {
                var row = y * W;
                for (var x = 1; x <= COLS; x++) {
                    var i = row + x;
                    velocity[i] += (height[i - 1] + height[i + 1] + height[i - W] + height[i + W]) * 0.5 - height[i] * 2;
                    velocity[i] *= 0.965;
                    height[i] += velocity[i];
                    height[i] *= 0.996;
                }
            }
        }

        function render() {
            for (var y = 0; y < ROWS; y++) {
                var row = (y + 1) * W;
                for (var x = 0; x < COLS; x++) {
                    var i = row + x + 1;
                    var dx = height[i + 1] - height[i - 1];
                    var dy = height[i + W] - height[i - W];
                    var shimmer = (dx + dy) * 22 * strength;
                    var edge = Math.min(1, Math.abs(shimmer));
                    var alpha = Math.pow(edge, 1.25) * opacity;

                    var p = (y * COLS + x) * 4;
                    pixels[p] = 168;      // R
                    pixels[p + 1] = 208;  // G
                    pixels[p + 2] = 255;  // B
                    pixels[p + 3] = Math.round(alpha * 255);
                }
            }
            offCtx.putImageData(imageData, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
        }

        var frameLast = 0;
        function loop(timestamp) {
            if (!document.hidden && timestamp - frameLast > 32) {
                step();
                render();
                frameLast = timestamp;
            }
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);

        /* ---- 鼠标 / 触摸交互 ---- */
        var lastX = null;
        var lastY = null;
        var lastDropAt = 0;

        window.addEventListener('pointermove', function (event) {
            var nx = event.clientX / Math.max(1, window.innerWidth);
            var ny = event.clientY / Math.max(1, window.innerHeight);
            var now = performance.now();
            if (now - lastDropAt < 40) {
                lastX = nx;
                lastY = ny;
                return;
            }
            if (lastX !== null) {
                var distance = Math.hypot(nx - lastX, ny - lastY);
                if (distance > 0.004) {
                    drop(nx, ny, 0.05 + Math.min(distance, 0.25) * 0.5);
                }
            }
            lastX = nx;
            lastY = ny;
            lastDropAt = now;
        }, { passive: true });

        window.addEventListener('pointerdown', function (event) {
            drop(event.clientX / Math.max(1, window.innerWidth), event.clientY / Math.max(1, window.innerHeight), 0.6);
        }, { passive: true });

        /* ---- 无人操作时的轻微水面呼吸 ---- */
        setInterval(function () {
            if (document.hidden) return;
            drop(0.15 + Math.random() * 0.7, 0.2 + Math.random() * 0.6, 0.04);
        }, 1800);

        /* 不再主动添加初始波纹：让画面在无操作时保持干净，
           只有鼠标移动、点击和偶发的轻微水波才会出现涟漪。 */

        document.documentElement.classList.add('water-enabled');
    } catch (error) {
        /* 水波效果失败时安静退出，不影响站点其它部分 */
        if (window.console && console.warn) console.warn('[water] 效果未启用:', error);
    }
})();
