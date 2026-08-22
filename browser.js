const BROWSER_JS_T = {
    nothingFoundForXxx: query => '未找到包含「{query}」的结果'.replace('{query}',query),
    showingFeaturedItems: '显示精选内容',
    showingXxxResultsForXxx: (count,query) => '显示 {count} 个包含「{query}」的结果'.replace('{count}',count).replace('{query}',query),
    xxxAndOthers: (xxx,othersLink) => '{xxx} 和<a href="{others_link}">别的</a>'.replace('{xxx}',xxx).replace('{others_link}',othersLink)
};
const LABEL_MODE = false;
const ARTISTS = [];
const RELEASES = [{cover:'cover_160.jpg?rNscM1tuZcw',title:'Wind\'s End',tracks:[{number:'1.',title:'Wind\'s End',url:'wind-s-end/1/'}],url:'wind-s-end/'},{cover:'cover_160.jpg?PAaCg7q9bj0',title:'Where the Wind Begins',tracks:[{number:'1.',title:'Where the Wind Begins',url:'where-the-wind-begins/1/'}],url:'where-the-wind-begins/'},{cover:'cover_160.jpg?IJMgStJQPLM',title:'The Blade of Farewell',tracks:[{number:'1.',title:'The Blade of Farewell',url:'the-blade-of-farewell/1/'}],url:'the-blade-of-farewell/'},{cover:'cover_160.jpg?UrRxHMX6yVQ',title:'School&Hope',tracks:[{number:'1.',title:'School&Hope',url:'school-hope/1/'}],url:'school-hope/'},{cover:'cover_160.jpg?fU32y6gn5GM',title:'Peaceful Day',tracks:[{number:'1.',title:'Peaceful Day',url:'peaceful-day/1/'}],url:'peaceful-day/'},{cover:'cover_160.jpg?QRepbatC9ko',title:'Night',tracks:[{number:'1.',title:'Night',url:'night/1/'}],url:'night/'},{cover:'cover_160.jpg?C_rJ__q0C9U',title:'Let\'s Fight',tracks:[{number:'1.',title:'Let\'s Fight',url:'let-s-fight/1/'}],url:'let-s-fight/'},{cover:'cover_160.jpg?PCPTA2DF5Zo',title:'Cloudbreak',tracks:[{number:'1.',title:'Cloudbreak',url:'cloudbreak/1/'}],url:'cloudbreak/'},{cover:'cover_160.jpg?P19rnKbZLx4',title:'Chaos',tracks:[{number:'1.',title:'Chaos',url:'chaos/1/'}],url:'chaos/'},{cover:'cover_160.jpg?cseu16CM0DQ',title:'As the Dust Settles',tracks:[{number:'1.',title:'As the Dust Settles',url:'as-the-dust-settles/1/'}],url:'as-the-dust-settles/'}];
const browser = document.querySelector('#browser');
const browseButtonFooter = document.querySelector('footer button.browse');
const browseButtonHeader = document.querySelector('header button.browse');

const browseResults = browser.querySelector('#results');
const closeButton = browser.querySelector('button');
const searchField = browser.querySelector('input');
const statusField = browser.querySelector('[role="status"]');

const indexSuffix = window.location.pathname.endsWith('index.html') ? 'index.html' : '';
const rootPrefix = browser.dataset.rootPrefix;

function truncateArtistList(artists, othersLink)  {
    const MAX_CHARS = 40;

    if (artists.length > 2) {
        const nameChars = artists.reduce((sum, artist) => sum + artist.name.length, 0);
        const separatorChars = (artists.length - 1) * 2; // All separating ", " between the artists

        if (nameChars + separatorChars > MAX_CHARS) {
            // Here we have more than two artists, we have a char limit,
            // and we cannot fit all artists within the limit, thus
            // we truncate the list.

            if (LABEL_MODE) {
                // In label mode we show at least one artist, then as many
                // additional ones as fit, e.g. "[artist],[artist] and
                // more"
                let charsUsed = 0;
                const truncatedArtists = artists
                    .filter(artist => {
                        if (charsUsed === 0) {
                            charsUsed += artist.name.length;
                            return true;
                        }

                        charsUsed += artist.name.length;
                        return charsUsed < MAX_CHARS;
                    });

                const rArtists = truncatedArtists
                    .map(artist => {
                        const url = artist.externalPage ?? `${rootPrefix}${artist.url}${indexSuffix}`;
                        return `<a href="${url}">${artist.name}</a>`;
                    })
                    .join(", ");

                return BROWSER_JS_T.xxxAndOthers(rArtists, othersLink);
            }

            // In artist mode we show only "[catalog artist] and others".
            // Our sorting ensures the catalog artist is the first one,
            // so we can just take that.
            const rArtists = `<a href="${rootPrefix}${artists[0].url}${indexSuffix}">${artists[0].name}</a>`;

            return BROWSER_JS_T.xxxAndOthers(rArtists, othersLink);
        }
    }

    return artists
        .map(artist => {
            const url = artist.externalPage ?? `${rootPrefix}${artist.url}${indexSuffix}`;
            return `<a href="${url}">${artist.name}</a>`;
        })
        .join(", ");
}

for (const release of RELEASES) {
    let imgRelease;
    if (release.cover) {
        imgRelease = document.createElement('img');
        imgRelease.src = rootPrefix + release.url + release.cover;
    } else {
        imgRelease = document.createElement('img');
        imgRelease.classList.add('procedural');
        imgRelease.src = rootPrefix + release.url + release.coverProcedural;
    }

    const aText = document.createElement('a');
    aText.href = rootPrefix + release.url + indexSuffix;

    const aImage = aText.cloneNode(true);
    aImage.tabIndex = -1;
    aImage.appendChild(imgRelease);

    aText.dataset.searchable = 'true';
    aText.textContent = release.title;

    const details = document.createElement('div');
    details.appendChild(aText);

    if (release.artists) {
        const artists = document.createElement('div');
        artists.classList.add('artists');
        artists.innerHTML = truncateArtistList(release.artists, `${rootPrefix}${release.url}`);
        details.appendChild(artists);
    }

    const row = document.createElement('div');
    row.appendChild(aImage);
    row.appendChild(details);
    browseResults.appendChild(row);

    for (const track of release.tracks) {
        let imgTrack;
        if (track.cover) {
            imgTrack = document.createElement('img');
            imgTrack.src = rootPrefix + track.url + track.cover;
        } else {
            imgTrack = imgRelease.cloneNode(true);
        }

        const number = document.createElement('span');
        number.classList.add('number');
        number.textContent = track.number;

        const aTitle = document.createElement('a');
        aTitle.href = rootPrefix + track.url + indexSuffix;

        const aImage = aTitle.cloneNode(true);
        aImage.tabIndex = -1;
        aImage.appendChild(imgTrack);

        aTitle.dataset.searchable = 'true';
        aTitle.textContent = track.title;

        const details = document.createElement('div');
        details.appendChild(number);
        details.appendChild(aTitle);

        if (track.artists) {
            const artists = document.createElement('div');
            artists.classList.add('artists');
            artists.innerHTML = truncateArtistList(track.artists, `${rootPrefix}${track.url}`);
            details.appendChild(artists);
        }

        const row = document.createElement('div');
        row.appendChild(aImage);
        row.appendChild(details);
        row.dataset.track = '';
        row.style.setProperty('display', 'none');
        browseResults.appendChild(row);
    }
}

for (const artist of ARTISTS) {
    const aText = document.createElement('a');

    const url = artist.externalPage ?? `${rootPrefix}${artist.url}${indexSuffix}`;
    aText.href = url;

    let imageArtist;
    if (artist.image) {
        imageArtist = document.createElement('img');
        imageArtist.classList.add('crop');
        imageArtist.src = rootPrefix + artist.url + artist.image;
    } else {
        imageArtist = document.createElement('span');
        imageArtist.classList.add('placeholder');
    }

    const aImage = aText.cloneNode(true);
    aImage.tabIndex = -1;
    aImage.appendChild(imageArtist);

    aText.dataset.searchable = 'true';
    aText.textContent = artist.name;

    const details = document.createElement('div');
    details.appendChild(aText);

    const row = document.createElement('div');
    row.appendChild(aImage);
    row.appendChild(details);
    browseResults.appendChild(row);
}

function hideBrowser() {
    const browseButton = browseButtonFooter.ariaExpanded === 'true'
        ? browseButtonFooter
        : browseButtonHeader;

    browser.classList.remove('active');
    browseButton.setAttribute('aria-expanded', 'false');
    searchField.value = '';
    statusField.removeAttribute('aria-label');
    statusField.textContent = '';
    for (const result of browseResults.children) {
        const display = result.dataset.track === undefined;
        result.style.setProperty('display', display ? null : 'none');
    }
    browseButton.focus();
}

function showBrowser(browseButton) {
    browser.classList.add('active');
    browseButton.setAttribute('aria-expanded', 'true');
    searchField.focus();
    statusField.setAttribute('aria-label', BROWSER_JS_T.showingFeaturedItems);
    statusField.textContent = '';
}

// When the browse/search modal is open and focus moves outside the page
// entirely (e.g. to the addressbar) but then re-enters the page, we need
// to make sure that it returns back to the browse/search modal (instead of
// to an obscured element in the main body)
document.body.addEventListener('focusin', event => {
    if (browser.classList.contains('active') && !browser.contains(event.target)) {
        searchField.focus();
    }
});

browser.addEventListener('focusout', event => {
    if (browser.classList.contains('active') && event.relatedTarget && !browser.contains(event.relatedTarget)) {
        hideBrowser();
    }
});

browser.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        event.preventDefault();
        hideBrowser();
    }
});

browseButtonFooter.addEventListener('click', () => showBrowser(browseButtonFooter));
browseButtonHeader.addEventListener('click', () => showBrowser(browseButtonHeader));

closeButton.addEventListener('click', hideBrowser);

searchField.addEventListener('input', () => {
    const query = searchField.value.trim();

    if (query.length) {
        const regexp = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        let shown = 0;

        for (const element of browseResults.children) {
            const title = element.querySelector('[data-searchable]').textContent;
            const display = regexp.test(title);
            element.style.setProperty('display', display ? null : 'none');
            if (display) { shown += 1; }
        }

        if (shown === 0) {
            statusField.removeAttribute('aria-label');
            statusField.textContent = BROWSER_JS_T.nothingFoundForXxx(query);
        } else {
            statusField.setAttribute('aria-label', BROWSER_JS_T.showingXxxResultsForXxx(shown, query));
            statusField.textContent = '';
        }
    } else {
        for (const element of browseResults.children) {
            const display = element.dataset.track === undefined;
            element.style.setProperty('display', display ? null : 'none');
        }

        statusField.setAttribute('aria-label', BROWSER_JS_T.showingFeaturedItems);
        statusField.textContent = '';
    }
});
