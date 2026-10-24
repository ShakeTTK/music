/* =========================================================================
   多语言文案模块（界面文字）
   - 文案来源：content/i18n/<语言代码>.json（构建时由 scripts/generate.py 打包成 i18n.js）
   - 首次访问按浏览器语言自动选择，之后记住手动选择（localStorage）
   - 只翻译界面文字，歌曲名 / 歌词 / 简介等内容保持原文
   - 新增语言：在 content/i18n/ 下新增 <code>.json，无需改代码
   ========================================================================= */
(function () {
    'use strict';

    try {
        var data = window.__SITE_I18N__;
        if (!data || !Array.isArray(data.languages) || !data.languages.length) return;

        var STORAGE_KEY = 'music-site-lang';
        var languages = data.languages.filter(function (lang) {
            return lang && lang.code && lang.strings && typeof lang.strings === 'object';
        });
        if (!languages.length) return;

        var defaultLanguage = null;
        languages.forEach(function (lang) {
            if (!defaultLanguage && lang.code === data.default) defaultLanguage = lang;
        });
        if (!defaultLanguage) defaultLanguage = languages[0];

        var valueToKey = {};
        languages.forEach(function (lang) {
            Object.keys(lang.strings).forEach(function (key) {
                var value = lang.strings[key];
                if (typeof value === 'string' && value) valueToKey[value.trim()] = key;
            });
        });

        function languageByCode(code) {
            if (!code) return null;
            var target = String(code).toLowerCase();
            for (var i = 0; i < languages.length; i += 1) {
                var lang = languages[i];
                if (lang.code.toLowerCase() === target) return lang;
            }
            for (var j = 0; j < languages.length; j += 1) {
                var candidate = languages[j];
                if (target.indexOf(candidate.code.toLowerCase()) === 0) return candidate;
            }
            return null;
        }

        function detectLanguage() {
            var stored = null;
            try { stored = window.localStorage.getItem(STORAGE_KEY); } catch (error) { stored = null; }
            var storedLanguage = languageByCode(stored);
            if (storedLanguage) return storedLanguage;

            var preferences = navigator.languages && navigator.languages.length
                ? navigator.languages
                : [navigator.language || ''];
            for (var i = 0; i < preferences.length; i += 1) {
                var language = languageByCode(preferences[i]);
                if (language) return language;
            }
            return defaultLanguage;
        }

        var currentLanguage = detectLanguage();

        function t(key, fallback) {
            if (!key) return fallback || '';
            var value = currentLanguage.strings[key];
            if (value === undefined || value === null || value === '') {
                value = defaultLanguage.strings[key];
            }
            if (value === undefined || value === null || value === '') {
                value = fallback;
            }
            return value === undefined || value === null ? '' : value;
        }

        function translateTextNodes(root) {
            if (!root) return;
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            var node;
            while ((node = walker.nextNode())) {
                var parent = node.parentElement;
                if (!parent || parent.closest('svg') || parent.closest('.site-lang')) continue;
                var raw = node.nodeValue;
                if (!raw) continue;
                var trimmed = raw.trim();
                if (!trimmed) continue;
                var key = valueToKey[trimmed];
                if (!key) continue;
                var translated = t(key, trimmed);
                if (translated && translated !== trimmed) {
                    node.nodeValue = raw.replace(trimmed, translated);
                }
            }
        }

        function hasFeedCopyButtons() {
            return Array.prototype.some.call(document.querySelectorAll('button[data-copy]'), function (button) {
                var content = button.getAttribute('data-content') || '';
                return /(?:feed\.atom|feed\.rss)(?:$|[?#])/.test(content);
            });
        }

        function ensureSubscribeBack() {
            if (!hasFeedCopyButtons()) return;
            if (document.querySelector('.subscribe-back')) return;

            var heading = document.querySelector('main h1') || document.querySelector('h1');
            if (!heading) return;

            var row = heading.parentElement;
            if (!row || !row.classList.contains('subscribe-heading')) {
                row = document.createElement('div');
                row.className = 'subscribe-heading';
                heading.parentNode.insertBefore(row, heading);
                row.appendChild(heading);
            }

            var link = document.createElement('a');
            link.className = 'subscribe-back';
            link.setAttribute('href', '../../');
            link.setAttribute('aria-label', '返回主页');
            link.setAttribute('title', '返回主页');
            link.setAttribute('data-i18n-aria', 'subscribe.back_home');
            link.setAttribute('data-i18n-title', 'subscribe.back_home');
            link.innerHTML =
                '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>' +
                '</svg>';

            var logo = document.querySelector('header #logo');
            if (logo && logo.getAttribute('href')) link.setAttribute('href', logo.getAttribute('href'));
            row.appendChild(link);
        }

        function ensureSubscribeNote() {
            var feedButtons = Array.prototype.slice.call(document.querySelectorAll('button[data-copy]'))
                .filter(function (button) {
                    var content = button.getAttribute('data-content') || '';
                    return /(?:feed\.atom|feed\.rss)(?:$|[?#])/.test(content);
                });
            if (!feedButtons.length) return;
            if (document.querySelector('.subscribe-note')) return;

            var lastButton = feedButtons[feedButtons.length - 1];
            var split = lastButton.closest ? lastButton.closest('.embed_split') : null;
            var entry = split ? split.parentElement : lastButton.parentElement;
            if (!entry || !entry.parentNode) return;

            var note = document.createElement('p');
            note.className = 'subscribe-note';
            note.setAttribute('data-i18n', 'subscribe.copy_hint');
            note.textContent = t('subscribe.copy_hint', '点击「复制链接」，粘贴到任意 RSS / Atom 阅读器即可订阅。');
            entry.parentNode.insertBefore(note, entry.nextSibling);
        }

        function applyTranslations() {
            document.querySelectorAll('[data-i18n]').forEach(function (element) {
                var key = element.getAttribute('data-i18n');
                if (!key) return;
                element.textContent = t(key, element.textContent);
            });
            document.querySelectorAll('[data-i18n-aria]').forEach(function (element) {
                var key = element.getAttribute('data-i18n-aria');
                if (key) element.setAttribute('aria-label', t(key, element.getAttribute('aria-label') || ''));
            });
            document.querySelectorAll('[data-i18n-title]').forEach(function (element) {
                var key = element.getAttribute('data-i18n-title');
                if (key) element.title = t(key, element.title || '');
            });

            // Faircamp 自带的界面文字（浏览 / 收听 / 复制链接 / 嵌入 / 播放器等）
            document.querySelectorAll('header, footer, .actions, .docked_player, #browser').forEach(function (root) {
                translateTextNodes(root);
            });

            document.querySelectorAll('.site-lang').forEach(function (group) {
                group.setAttribute('aria-label', t('site.language', '语言'));
            });
        }

        function updateSwitcher() {
            var group = document.getElementById('site-lang');
            if (!group) return;
            group.setAttribute('aria-label', t('site.language', '语言'));
            group.querySelectorAll('button[data-lang]').forEach(function (button) {
                var active = button.getAttribute('data-lang') === currentLanguage.code;
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }

        function buildSwitcher() {
            var host = document.querySelector('header > div') || document.querySelector('header');
            if (!host) return;
            var existing = document.getElementById('site-lang');
            if (existing) {
                if (existing.parentNode !== host) host.appendChild(existing);
                updateSwitcher();
                return;
            }

            var group = document.createElement('div');
            group.id = 'site-lang';
            group.className = 'site-lang';
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', t('site.language', '语言'));

            languages.forEach(function (language) {
                var button = document.createElement('button');
                button.type = 'button';
                button.setAttribute('data-lang', language.code);
                button.textContent = language.short || language.code.toUpperCase();
                button.title = language.name || language.code;
                button.setAttribute('aria-label', language.name || language.code);
                button.addEventListener('click', function () {
                    setLanguage(language.code);
                });
                group.appendChild(button);
            });

            host.appendChild(group);
            updateSwitcher();
        }

        function setLanguage(code, save) {
            var language = languageByCode(code);
            if (!language) return;
            currentLanguage = language;
            document.documentElement.setAttribute('lang', language.html_lang || language.code);
            if (save !== false) {
                try { window.localStorage.setItem(STORAGE_KEY, language.code); } catch (error) { /* 忽略 */ }
            }
            updateSwitcher();
            applyTranslations();
            document.dispatchEvent(new CustomEvent('site:languagechange', {
                detail: { code: language.code, language: language }
            }));
        }

        function apply() {
            applyTranslations();
        }

        document.documentElement.setAttribute('lang', currentLanguage.html_lang || currentLanguage.code);
        buildSwitcher();
        ensureSubscribeBack();
        ensureSubscribeNote();
        applyTranslations();

        // 无刷新跳转后重新插入切换器并翻译新内容
        document.addEventListener('pjax:load', function () {
            document.documentElement.setAttribute('lang', currentLanguage.html_lang || currentLanguage.code);
            buildSwitcher();
            ensureSubscribeBack();
            ensureSubscribeNote();
            applyTranslations();
        });

        // Faircamp 播放条等动态出现的界面文字，出现后补翻译
        var scheduled = false;
        function scheduleApply() {
            if (scheduled) return;
            scheduled = true;
            window.setTimeout(function () {
                scheduled = false;
                applyTranslations();
            }, 60);
        }
        if (window.MutationObserver && document.body) {
            new MutationObserver(scheduleApply).observe(document.body, { childList: true, subtree: true });
        }

        window.SiteI18n = {
            t: t,
            apply: apply,
            setLanguage: function (code) { setLanguage(code, true); },
            get current() { return currentLanguage.code; },
            languages: languages.map(function (language) {
                return { code: language.code, name: language.name, short: language.short };
            })
        };
    } catch (error) {
        if (window.console && console.warn) console.warn('[i18n] 多语言模块未启用:', error);
    }
})();
