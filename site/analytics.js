/* =========================================================================
   低调访问统计（独立模块）
   - 页面不显示任何内容，只在后台记录访问
   - 支持 Cloudflare Web Analytics / GoatCounter
   - 未配置或加载失败时静默退出，不影响站点
   ========================================================================= */
(function () {
    'use strict';

    try {
        var cfg = (window.__SITE_CONFIG__ || {}).analytics || {};
        if (String(cfg.enabled || 'false').toLowerCase() !== 'true') return;

        var token = cfg.token || '';
        if (!token) {
            if (window.console && console.info) console.info('[analytics] 已启用但未配置 token，统计未开启');
            return;
        }

        var provider = String(cfg.provider || 'cloudflare').toLowerCase();

        if (provider === 'cloudflare') {
            var beacon = document.createElement('script');
            beacon.defer = true;
            beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
            beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
            document.body.appendChild(beacon);
        } else if (provider === 'goatcounter') {
            var gc = document.createElement('script');
            gc.async = true;
            gc.src = 'https://' + token + '.goatcounter.com/count';
            gc.setAttribute('data-goatcounter', 'https://' + token + '.goatcounter.com/count');
            document.body.appendChild(gc);
        } else if (window.console && console.info) {
            console.info('[analytics] 未知的统计服务:', provider);
        }
    } catch (error) {
        if (window.console && console.warn) console.warn('[analytics] 统计未启用:', error);
    }
})();
