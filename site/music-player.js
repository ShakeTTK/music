/* =========================================================================
   临时歌单播放器（独立模块）
   - 从站点曲目索引里勾选歌曲，组成临时歌单
   - 支持 顺序 / 单曲循环 / 随机 三种播放模式
   - 歌单与播放模式保存在 localStorage，刷新/切换页面不丢
   - 任何异常都会安静退出，不影响站点其它功能
   ========================================================================= */
(function () {
    'use strict';

    try {
        if (window.location.pathname.indexOf('/embed') !== -1) return;

        var meta = document.querySelector('meta[name="music-index"]');
        if (!meta || !meta.getAttribute('content')) return;

        var indexUrl = new URL(meta.getAttribute('content'), window.location.href).href;
        var STORAGE_KEY = 'music-site-player-v1';
        var STORAGE_VOLUME = 'music-site-player-volume';
        var STORAGE_PANEL_OPACITY = 'music-site-player-opacity';

        var ICONS = {
            play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
            pause: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
            prev: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/></svg>',
            next: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5l11 7-11 7z" fill="currentColor"/></svg>'
        };

        var state = {
            tracks: [],
            trackMap: {},
            playlist: [],
            mode: 'order',
            current: -1,
            volume: 1,
            panelOpacity: 1
        };

        try {
            var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
            if (Array.isArray(saved.playlist)) {
                state.playlist = saved.playlist.filter(function (slug) { return typeof slug === 'string'; });
            }
            if (['order', 'single', 'shuffle'].indexOf(saved.mode) !== -1) state.mode = saved.mode;

            var savedVolume = parseFloat(window.localStorage.getItem(STORAGE_VOLUME));
            if (!isNaN(savedVolume)) state.volume = Math.min(1, Math.max(0, savedVolume));

            var savedOpacity = parseFloat(window.localStorage.getItem(STORAGE_PANEL_OPACITY));
            if (!isNaN(savedOpacity)) state.panelOpacity = Math.min(1, Math.max(0.2, savedOpacity));
        } catch (error) { /* 忽略存储异常 */ }

        var audio = new Audio();
        audio.preload = 'metadata';
        audio.volume = state.volume;

        function tr(key, fallback) {
            if (window.SiteI18n && typeof window.SiteI18n.t === 'function') {
                var value = window.SiteI18n.t(key, fallback);
                if (value !== undefined && value !== null && value !== '') return value;
            }
            return fallback;
        }

        var widget = null;
        var panel = null;
        var listEl = null;
        var toggleBtn = null;

        function saveState() {
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ playlist: state.playlist, mode: state.mode }));
            } catch (error) { /* 忽略 */ }
        }

        function formatTime(seconds) {
            if (!isFinite(seconds) || seconds < 0) return '0:00';
            var total = Math.floor(seconds);
            var minutes = Math.floor(total / 60);
            var rest = total % 60;
            return minutes + ':' + (rest < 10 ? '0' : '') + rest;
        }

        function buildUI() {
            widget = document.createElement('div');
            widget.id = 'playlist-widget';
            widget.innerHTML =
                '<button type="button" id="playlist-toggle" class="playlist-toggle" aria-expanded="false" aria-controls="playlist-panel">' +
                '  <span class="playlist-toggle__icon" aria-hidden="true">' + ICONS.play + '</span>' +
                '  <span data-i18n="player.button">歌单</span>' +
                '  <span class="playlist-toggle__count" id="playlist-count">0</span>' +
                '</button>' +
                '<section id="playlist-panel" class="playlist-panel" data-i18n-aria="player.panel_aria" aria-label="临时歌单播放器">' +
                '  <header class="playlist-panel__header">' +
                '    <h2 class="playlist-panel__title" data-i18n="player.title">临时歌单</h2>' +
                '    <label class="playlist-opacity" data-i18n-title="player.opacity_title" title="调整歌单背景不透明度">' +
                '      <span class="playlist-opacity__label" data-i18n="player.background">背景</span>' +
                '      <input type="range" id="playlist-opacity" min="20" max="100" step="2" value="100" data-i18n-aria="player.opacity_title" aria-label="临时歌单背景不透明度">' +
                '    </label>' +
                '    <button type="button" class="playlist-panel__close" data-i18n-aria="player.close" aria-label="关闭歌单">×</button>' +
                '  </header>' +
                '  <div class="playlist-now">' +
                '    <div class="playlist-now__cover"><img id="playlist-cover" alt="" width="56" height="56"></div>' +
                '    <div class="playlist-now__meta">' +
                '      <div class="playlist-now__title" id="playlist-title">未选择歌曲</div>' +
                '      <div class="playlist-now__artist" id="playlist-artist"></div>' +
                '      <div class="playlist-volume">' +
                '        <span class="playlist-volume__label" data-i18n="player.volume">音量</span>' +
                '        <input type="range" id="playlist-volume" min="0" max="100" step="1" value="100" data-i18n-aria="player.volume" aria-label="音量">' +
                '      </div>' +
                '      <div class="playlist-progress">' +
                '        <input type="range" id="playlist-seek" min="0" max="1000" step="1" value="0" data-i18n-aria="player.seek" aria-label="播放进度">' +
                '        <span class="playlist-progress__time" id="playlist-time">0:00 / 0:00</span>' +
                '      </div>' +
                '    </div>' +
                '  </div>' +
                '  <div class="playlist-controls">' +
                '    <button type="button" id="playlist-prev" class="playlist-controls__btn" data-i18n-aria="player.prev" aria-label="上一首">' + ICONS.prev + '</button>' +
                '    <button type="button" id="playlist-play" class="playlist-controls__btn playlist-controls__btn--play" data-i18n-aria="player.play" aria-label="播放">' + ICONS.play + '</button>' +
                '    <button type="button" id="playlist-next" class="playlist-controls__btn" data-i18n-aria="player.next" aria-label="下一首">' + ICONS.next + '</button>' +
                '    <button type="button" id="playlist-select-all" class="playlist-controls__selectall">全选</button>' +
                '    <div class="playlist-modes" role="group" data-i18n-aria="player.modes_aria" aria-label="播放模式">' +
                '      <button type="button" data-mode="order" data-i18n="player.mode_order">顺序</button>' +
                '      <button type="button" data-mode="single" data-i18n="player.mode_single">单曲</button>' +
                '      <button type="button" data-mode="shuffle" data-i18n="player.mode_shuffle">随机</button>' +
                '    </div>' +
                '    <button type="button" id="playlist-clear" class="playlist-controls__clear" data-i18n="player.clear">清空</button>' +
                '  </div>' +
                '  <div class="playlist-list" id="playlist-list"></div>' +
                '  <p class="playlist-hint" data-i18n="player.hint">单击勾选；双击歌名立即加入并播放；未勾选时点播放会播放全部。</p>' +
                '</section>';
            document.body.appendChild(widget);

            panel = widget.querySelector('#playlist-panel');
            listEl = widget.querySelector('#playlist-list');
            toggleBtn = widget.querySelector('#playlist-toggle');

            var closeBtn = widget.querySelector('.playlist-panel__close');
            closeBtn.addEventListener('click', closePanel);
            toggleBtn.addEventListener('click', function () {
                if (panel.classList.contains('is-open')) closePanel();
                else openPanel();
            });
            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
            });

            widget.querySelector('#playlist-play').addEventListener('click', togglePlay);
            widget.querySelector('#playlist-prev').addEventListener('click', playPrevious);
            widget.querySelector('#playlist-next').addEventListener('click', function () { playNext(false); });
            widget.querySelector('#playlist-clear').addEventListener('click', clearPlaylist);
            widget.querySelector('#playlist-select-all').addEventListener('click', toggleSelectAll);

            widget.querySelectorAll('.playlist-modes button').forEach(function (button) {
                button.addEventListener('click', function () {
                    state.mode = button.getAttribute('data-mode');
                    saveState();
                    render();
                });
            });

            var seek = widget.querySelector('#playlist-seek');
            seek.addEventListener('input', function () {
                if (audio.duration && isFinite(audio.duration)) {
                    audio.currentTime = (parseFloat(seek.value) / 1000) * audio.duration;
                }
            });

            var opacityInput = widget.querySelector('#playlist-opacity');
            opacityInput.value = String(Math.round(state.panelOpacity * 100));
            opacityInput.addEventListener('input', function () {
                setPanelOpacity(parseFloat(this.value) / 100);
            });

            var volumeInput = widget.querySelector('#playlist-volume');
            volumeInput.value = String(Math.round(state.volume * 100));
            volumeInput.addEventListener('input', function () {
                setVolume(parseFloat(this.value) / 100);
            });

            // 双击歌名：加入歌单并立即播放
            listEl.addEventListener('dblclick', function (event) {
                var name = event.target && event.target.closest ? event.target.closest('.playlist-item__name') : null;
                if (!name) return;
                event.preventDefault();
                var row = name.closest('.playlist-item');
                var slug = row ? row.getAttribute('data-slug') : '';
                if (slug) playSlugNow(slug);
            });

            // 让详情页 Faircamp 自带的音频也遵循这里的音量
            document.addEventListener('play', function (event) {
                var target = event.target;
                if (!target || target.tagName !== 'AUDIO') return;
                try { target.volume = state.volume; } catch (error) { /* 忽略 */ }
            }, true);

            listEl.addEventListener('change', function (event) {
                var input = event.target;
                if (!input || input.type !== 'checkbox') return;
                var slug = input.getAttribute('data-slug');
                if (input.checked) addToPlaylist(slug);
                else removeFromPlaylist(slug);
            });

            audio.addEventListener('timeupdate', updateProgress);
            audio.addEventListener('loadedmetadata', updateProgress);
            audio.addEventListener('play', render);
            audio.addEventListener('pause', render);
            audio.addEventListener('ended', function () { playNext(true); });

            document.addEventListener('site:languagechange', function () {
                if (!panel) return;
                render();
                updateProgress();
            });
        }

        function openPanel() {
            panel.classList.add('is-open');
            toggleBtn.setAttribute('aria-expanded', 'true');
        }

        function closePanel() {
            panel.classList.remove('is-open');
            toggleBtn.setAttribute('aria-expanded', 'false');
        }

        function addToPlaylist(slug) {
            if (!state.trackMap[slug] || state.playlist.indexOf(slug) !== -1) return;
            state.playlist.push(slug);
            if (state.current === -1) state.current = 0;
            saveState();
            render();
        }

        function removeFromPlaylist(slug) {
            var index = state.playlist.indexOf(slug);
            if (index === -1) return;
            state.playlist.splice(index, 1);
            if (state.playlist.length === 0) {
                audio.pause();
                state.current = -1;
            } else if (index < state.current) {
                state.current -= 1;
            } else if (index === state.current) {
                state.current = Math.min(state.current, state.playlist.length - 1);
                if (!audio.paused) playIndex(state.current);
            }
            saveState();
            render();
        }

        function clearPlaylist() {
            state.playlist = [];
            state.current = -1;
            audio.pause();
            audio.removeAttribute('src');
            saveState();
            render();
        }

        function toggleSelectAll() {
            if (!state.tracks.length) return;
            if (state.playlist.length === state.tracks.length) {
                clearPlaylist();
                return;
            }
            state.playlist = state.tracks.map(function (track) { return track.slug; });
            if (state.current < 0) state.current = 0;
            saveState();
            render();
        }

        function resolveUrl(relative) {
            return new URL(relative, indexUrl).href;
        }

        function currentTrack() {
            if (state.current < 0 || state.current >= state.playlist.length) return null;
            return state.trackMap[state.playlist[state.current]] || null;
        }

        function playIndex(index) {
            if (!state.playlist.length) {
                state.playlist = state.tracks.map(function (track) { return track.slug; });
                state.current = 0;
                saveState();
            }
            if (index < 0) index = state.playlist.length - 1;
            if (index >= state.playlist.length) index = 0;
            state.current = index;
            var track = currentTrack();
            if (!track) return;
            audio.src = resolveUrl(track.url);
            var promise = audio.play();
            if (promise && promise.catch) promise.catch(function () { render(); });
            render();
        }

        function togglePlay() {
            if (!state.playlist.length) {
                playIndex(0);
                return;
            }
            if (audio.paused) {
                if (!audio.src) playIndex(state.current < 0 ? 0 : state.current);
                else audio.play().catch(function () { /* 浏览器限制自动播放 */ });
            } else {
                audio.pause();
            }
            render();
        }

        function playNext(fromEnded) {
            if (!state.playlist.length) return;
            if (state.mode === 'single') {
                audio.currentTime = 0;
                audio.play().catch(function () {});
                return;
            }
            if (state.mode === 'shuffle') {
                if (state.playlist.length === 1) { playIndex(0); return; }
                var next = state.current;
                while (next === state.current) next = Math.floor(Math.random() * state.playlist.length);
                playIndex(next);
                return;
            }
            playIndex(state.current + 1);
        }

        function playPrevious() {
            if (!state.playlist.length) return;
            if (audio.currentTime > 3) {
                audio.currentTime = 0;
                return;
            }
            if (state.mode === 'shuffle') {
                playNext(false);
                return;
            }
            playIndex(state.current - 1);
        }

        function updateProgress() {
            if (!panel) return;
            var seek = panel.querySelector('#playlist-seek');
            var time = panel.querySelector('#playlist-time');
            var duration = audio.duration && isFinite(audio.duration) ? audio.duration : 0;
            if (seek) seek.value = duration ? (audio.currentTime / duration) * 1000 : 0;
            if (time) time.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(duration);
        }

        function render() {
            if (!panel) return;
            var count = widget.querySelector('#playlist-count');
            if (count) count.textContent = String(state.playlist.length);

            var playBtn = widget.querySelector('#playlist-play');
            if (playBtn) playBtn.innerHTML = audio.paused ? ICONS.play : ICONS.pause;

            var selectAllBtn = widget.querySelector('#playlist-select-all');
            if (selectAllBtn) {
                var allSelected = state.tracks.length > 0 && state.playlist.length === state.tracks.length;
                selectAllBtn.textContent = allSelected ? tr('player.unselect_all', '取消全选') : tr('player.select_all', '全选');
                selectAllBtn.classList.toggle('is-active', allSelected);
            }

            widget.querySelectorAll('.playlist-modes button').forEach(function (button) {
                button.classList.toggle('is-active', button.getAttribute('data-mode') === state.mode);
            });

            var track = currentTrack();
            var coverEl = widget.querySelector('#playlist-cover');
            var titleEl = widget.querySelector('#playlist-title');
            var artistEl = widget.querySelector('#playlist-artist');
            if (titleEl) titleEl.textContent = track ? track.title : tr('player.not_selected', '未选择歌曲');
            if (artistEl) artistEl.textContent = track ? (track.artist || '') : '';
            if (coverEl) {
                if (track && track.cover) {
                    coverEl.src = resolveUrl(track.cover);
                    coverEl.alt = track.title + ' 封面';
                    coverEl.style.visibility = 'visible';
                } else {
                    coverEl.removeAttribute('src');
                    coverEl.style.visibility = 'hidden';
                }
            }

            if (!listEl) return;
            var rows = listEl.querySelectorAll('.playlist-item');
            rows.forEach(function (row) {
                var slug = row.getAttribute('data-slug');
                var input = row.querySelector('input');
                var order = row.querySelector('.playlist-order');
                var index = state.playlist.indexOf(slug);
                if (input) input.checked = index !== -1;
                if (order) order.textContent = index !== -1 ? String(index + 1) : '';
                row.classList.toggle('is-current', track && track.slug === slug);
            });
        }

        function renderList() {
            if (!listEl) return;
            var fragment = document.createDocumentFragment();
            state.tracks.forEach(function (track) {
                var row = document.createElement('label');
                row.className = 'playlist-item';
                row.setAttribute('data-slug', track.slug);

                var input = document.createElement('input');
                input.type = 'checkbox';
                input.setAttribute('data-slug', track.slug);

                var order = document.createElement('span');
                order.className = 'playlist-order';

                var name = document.createElement('span');
                name.className = 'playlist-item__name';
                name.textContent = track.title;

                var artist = document.createElement('span');
                artist.className = 'playlist-item__artist';
                artist.textContent = track.artist || '';

                var duration = document.createElement('span');
                duration.className = 'playlist-item__duration';
                duration.textContent = track.duration ? formatTime(track.duration) : '';

                row.appendChild(input);
                row.appendChild(order);
                row.appendChild(name);
                row.appendChild(artist);
                row.appendChild(duration);
                fragment.appendChild(row);
            });
            listEl.innerHTML = '';
            listEl.appendChild(fragment);
        }

        function persistSetting(key, value) {
            try { window.localStorage.setItem(key, String(value)); } catch (error) { /* 忽略 */ }
        }

        function applyPanelOpacity(value) {
            if (!panel) return;
            var opacity = Math.min(1, Math.max(0.2, value));
            panel.style.setProperty('--playlist-bg-opacity', String(opacity));
            var input = widget ? widget.querySelector('#playlist-opacity') : null;
            if (input) input.value = String(Math.round(opacity * 100));
        }

        function setPanelOpacity(value) {
            var opacity = Math.min(1, Math.max(0.2, value));
            state.panelOpacity = opacity;
            applyPanelOpacity(opacity);
            persistSetting(STORAGE_PANEL_OPACITY, opacity);
        }

        function setVolume(value, save) {
            var volume = Math.min(1, Math.max(0, value));
            if (isNaN(volume)) return;
            state.volume = volume;
            audio.volume = volume;

            document.querySelectorAll('audio').forEach(function (element) {
                try { element.volume = volume; } catch (error) { /* 忽略 */ }
            });

            if (widget) {
                var playlistInput = widget.querySelector('#playlist-volume');
                if (playlistInput) playlistInput.value = String(Math.round(volume * 100));
            }
            var pageInput = document.querySelector('#page-volume input');
            if (pageInput) pageInput.value = String(Math.round(volume * 100));

            if (save !== false) persistSetting(STORAGE_VOLUME, volume);
        }

        function injectPageVolume() {
            var primary = document.querySelector('.actions.primary');
            if (!primary) return;

            var existing = document.getElementById('page-volume');
            if (existing) {
                if (existing.parentNode !== primary) existing.parentNode.removeChild(existing);
                else {
                    var existingInput = existing.querySelector('input');
                    if (existingInput) existingInput.value = String(Math.round(state.volume * 100));
                    return;
                }
            }

            var wrap = document.createElement('div');
            wrap.className = 'page-volume';
            wrap.id = 'page-volume';
            wrap.innerHTML =
                '<span class="page-volume__label" data-i18n="page.volume">音量</span>' +
                '<input type="range" min="0" max="100" step="1" data-i18n-aria="page.volume" aria-label="音量">';

            var listen = primary.querySelector('button.listen');
            if (listen && listen.parentNode === primary) primary.insertBefore(wrap, listen.nextSibling);
            else primary.appendChild(wrap);

            var input = wrap.querySelector('input');
            input.value = String(Math.round(state.volume * 100));
            input.addEventListener('input', function () {
                setVolume(parseFloat(this.value) / 100);
            });
            if (window.SiteI18n) window.SiteI18n.apply();
        }

        function playSlugNow(slug) {
            if (!state.trackMap[slug]) return;
            var index = state.playlist.indexOf(slug);
            if (index === -1) {
                state.playlist.push(slug);
                index = state.playlist.length - 1;
            }
            saveState();
            playIndex(index);
        }

        function init(data) {
            state.tracks = data.tracks.filter(function (track) { return track && track.slug && track.url; });
            state.trackMap = {};
            state.tracks.forEach(function (track) { state.trackMap[track.slug] = track; });
            state.playlist = state.playlist.filter(function (slug) { return state.trackMap[slug]; });
            if (state.playlist.length === 0) state.current = -1;
            else state.current = Math.min(Math.max(state.current, 0), state.playlist.length - 1);

            buildUI();
            if (window.SiteI18n) window.SiteI18n.apply();
            applyPanelOpacity(state.panelOpacity);
            setVolume(state.volume, false);
            renderList();
            render();
            updateProgress();
            injectPageVolume();
        }

        document.addEventListener('pjax:load', injectPageVolume);
        injectPageVolume();

        fetch(indexUrl)
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (data) {
                if (!data || !Array.isArray(data.tracks) || !data.tracks.length) return;
                init(data);
            })
            .catch(function (error) {
                if (window.console && console.info) console.info('[player] 歌单索引加载失败，播放器未启用', error);
            });
    } catch (error) {
        if (window.console && console.warn) console.warn('[player] 播放器未启用:', error);
    }
})();
