/* =========================================================================
   站内无刷新跳转（PJAX）
   - 拦截站内链接，fetch 新页面，只替换 .layout 内容
   - 常驻播放器（music-player.js）与音频对象在 body 外层，不会被打断
   - 用 History API 支持前进/后退；失败自动回退为整页跳转
   - 替换完成后重新加载 Faircamp 自带的 browser.js / clipboard.js / player.js，
     让搜索、复制、单曲页播放器继续可用
   ========================================================================= */
(function () {
    'use strict';

    try {
        if (window.location.pathname.indexOf('/embed') !== -1) return;
        if (!window.fetch || !window.DOMParser || !window.history || !window.history.pushState) return;

        var FAIRCAMP_SCRIPTS = ['browser.js', 'clipboard.js', 'player.js'];
        var switching = false;

        var progress = document.createElement('div');
        progress.id = 'pjax-progress';
        progress.setAttribute('aria-hidden', 'true');
        document.body.appendChild(progress);

        function showProgress() {
            progress.classList.add('is-loading');
        }

        function hideProgress() {
            progress.classList.remove('is-loading');
        }

        function isSamePage(url) {
            return url.pathname === window.location.pathname && url.search === window.location.search && !url.hash;
        }

        function shouldIntercept(event, link) {
            if (!link || !link.getAttribute) return false;
            if (link.target && link.target !== '_self') return false;
            if (link.hasAttribute('download')) return false;
            if (link.getAttribute('data-pjax') === 'false') return false;
            if (event.defaultPrevented || event.button !== 0) return false;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

            var href = link.getAttribute('href');
            if (!href || href.charAt(0) === '#') return false;
            if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;

            var url;
            try {
                url = new URL(href, window.location.href);
            } catch (error) {
                return false;
            }
            if (url.origin !== window.location.origin) return false;
            if (url.pathname.indexOf('/embed') !== -1) return false;
            if (isSamePage(url)) return false;
            return true;
        }

        function absoluteScriptUrl(src, base) {
            try {
                return new URL(src, base).href;
            } catch (error) {
                return '';
            }
        }

        function copyHeadMetadata(newDocument) {
            document.title = newDocument.title;
            if (newDocument.documentElement.getAttribute('lang')) {
                document.documentElement.setAttribute('lang', newDocument.documentElement.getAttribute('lang'));
            }

            var selectors = [
                'meta[name="description"]',
                'link[rel="canonical"]',
                'meta[property^="og:"]'
            ];
            selectors.forEach(function (selector) {
                document.head.querySelectorAll(selector).forEach(function (node) { node.remove(); });
            });
            selectors.forEach(function (selector) {
                newDocument.head.querySelectorAll(selector).forEach(function (node) {
                    document.head.appendChild(document.importNode(node, true));
                });
            });
        }

        function reloadFaircampScripts(newDocument, baseUrl) {
            var scripts = Array.prototype.slice.call(newDocument.querySelectorAll('script[src]'))
                .filter(function (script) {
                    var src = script.getAttribute('src') || '';
                    var filename = src.split('?')[0].split('/').pop();
                    return FAIRCAMP_SCRIPTS.indexOf(filename) !== -1;
                });

            return Promise.all(scripts.map(function (script) {
                var src = absoluteScriptUrl(script.getAttribute('src'), baseUrl);
                if (!src) return Promise.resolve();
                var busted = src + (src.indexOf('?') === -1 ? '?' : '&') + 'pjax=' + Date.now();
                return new Promise(function (resolve) {
                    var element = document.createElement('script');
                    element.src = busted;
                    element.async = false;
                    element.onload = resolve;
                    element.onerror = resolve;
                    document.body.appendChild(element);
                });
            }));
        }

        function replaceContent(newDocument) {
            var newLayout = newDocument.querySelector('.layout');
            var currentLayout = document.querySelector('.layout');
            if (!newLayout || !currentLayout) {
                throw new Error('页面结构不兼容，回退整页跳转');
            }
            currentLayout.replaceWith(document.importNode(newLayout, true));
        }

        function navigate(url, pushState, restoreScroll) {
            if (switching) {
                window.location.href = url.href;
                return;
            }
            switching = true;
            showProgress();

            fetch(url.href, { credentials: 'same-origin', headers: { 'X-PJAX': '1' } })
                .then(function (response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.text();
                })
                .then(function (html) {
                    var newDocument = new DOMParser().parseFromString(html, 'text/html');
                    copyHeadMetadata(newDocument);
                    replaceContent(newDocument);

                    if (pushState) {
                        window.history.pushState({ pjax: true, scrollY: window.scrollY }, '', url.href);
                    }
                    if (restoreScroll && window.history.state && typeof window.history.state.scrollY === 'number') {
                        window.scrollTo(0, window.history.state.scrollY);
                    } else {
                        window.scrollTo(0, 0);
                    }

                    var content = document.querySelector('#content') || document.querySelector('.layout');
                    if (content) {
                        content.setAttribute('tabindex', '-1');
                        try { content.focus({ preventScroll: true }); } catch (error) { /* 忽略 */ }
                    }

                    return reloadFaircampScripts(newDocument, url.href);
                })
                .then(function () {
                    switching = false;
                    hideProgress();
                    document.dispatchEvent(new CustomEvent('pjax:load', { detail: { url: url.href } }));
                })
                .catch(function () {
                    switching = false;
                    hideProgress();
                    window.location.href = url.href;
                });
        }

        document.addEventListener('click', function (event) {
            var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!link || !shouldIntercept(event, link)) return;
            event.preventDefault();
            navigate(new URL(link.getAttribute('href'), window.location.href), true, false);
        }, false);

        window.addEventListener('popstate', function () {
            navigate(new URL(window.location.href), false, true);
        });
    } catch (error) {
        if (window.console && console.warn) console.warn('[pjax] 无刷新跳转未启用:', error);
    }
})();
