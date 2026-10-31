// ═══════════════════════════════════════════════════════════════════════════
// CREDO — Bible reader (bible.html)
// ═══════════════════════════════════════════════════════════════════════════
// Reads the whole BSB from data/bsb-full/ (one JSON per book, see
// scripts/build-bible-data.py for the data format and provenance).
//
// ONLINE-ONLY BY DESIGN: data/bsb-full/ is NEVER cached by the service
// worker (see sw.js fetch handler — bsb-full requests bypass the cache and
// go straight to the network). When a fetch fails (offline), this reader
// shows the #bible-offline screen. The daily passage, favorites and notes
// keep working offline.
//
// VERSE SELECTION UX (per user request):
//   • Tapping a verse toggles a persistent light-green highlight — it STAYS
//     selected after the tap is released; tapping it again deselects it.
//   • Any number of verses can be selected at once (adjacent or not).
//   • A floating bar above the bottom nav offers favorite / note / COPY for
//     the selection (copy replaces the old wallpaper/image action).
//   • Verses with a saved note (from ANY page, any time) carry a barely
//     visible light-green left edge — switched off while the verse is
//     selected, so selected verses always look identical.
//   • The "Read full chapter" button on Home opens the chapter and
//     pre-selects the daily verse(s) with the SAME green highlight.
//
// Copy format (exact layout the user asked for):
//   “[5] first verse text
//    [7] second verse text” - Luke 14:5,7 (BSB)
//
//   https://credo.labram.workers.dev/bible?ref=LUK.14.5,7
//   — the whole selection inside quotation marks, every line starting with
//   the verse number in square brackets, then the source (book C:V, ranges
//   compressed like 5-7, non-adjacent joined with commas) and the
//   translation abbreviation OUTSIDE the quotation marks. After ONE blank
//   line comes the CREDO deep link, which opens this exact selection with
//   the same green highlight as the "Read full chapter" button on Home.
//
// Deep links: bible?ref=LUK.2.16 (canonical verse key) or bible?ref=Luke+2:16
// (human label, ranges like Luke+2:16-18 work too). The "Read full chapter"
// button on Home produces these.
//
// LIBRARY LAYOUT (per user request): books are rows; tapping a book row
// expands its chapter grid INLINE right below that row (accordion) — there
// is NO separate chapter-picker screen. The small round ‹ arrow at the top
// left of the reading view (same look as the wallpaper editor's back button)
// returns to the book list.
//
// Shared helpers (BIBLE_BOOKS, parseRefLabel, refLabelFromKey, splitVerseKey,
// isFavoriteRef, getFavorites, openNotesModalForVerse, ensureMigrated,
// t, showToast, escapeHtml, openModalA11y/closeModalA11y) come from app.js
// which MUST be loaded before this file.

'use strict';

const BIBLE_DATA_DIR = 'data/bsb-full/';   // per-translation folder (add e.g. kjv-full/ later)

let bibleBooksIndex = null;        // parsed index.json
let bibleBookCache = {};           // code → parsed book JSON (per session)
let currentBookCode = null;        // e.g. 'JHN'
let currentChapterNum = null;      // e.g. 2
let selectedVerses = new Set();    // verse numbers selected in the CURRENT chapter
let currentVerseTexts = {};        // verse number → text of the current chapter
let expandedBookCode = null;       // accordion: which book row is open in the library
let bibleOfflineShown = false;

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
async function initBible() {
    // Favorites/notes on any verse need the storage v2 migration to have run.
    await ensureMigrated();

    // Fast offline path: navigator says we're offline before even trying.
    if (navigator.onLine === false) {
        showBibleOffline();
        return;
    }

    try {
        const resp = await fetch(BIBLE_DATA_DIR + 'index.json', { cache: 'no-cache' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        bibleBooksIndex = await resp.json();
    } catch (err) {
        console.error('[bible] index.json fetch failed (offline?):', err);
        showBibleOffline();
        return;
    }

    showBibleLibrary();
    handleBibleUrlRef();
}

function showBibleOffline() {
    bibleOfflineShown = true;
    clearVerseSelection();
    setBibleBackVisible(false);
    document.getElementById('bible-offline').style.display = 'block';
    document.getElementById('bible-library').style.display = 'none';
    document.getElementById('bible-chapter').style.display = 'none';
    document.getElementById('bible-loading').style.display = 'none';
}

function showBibleLibrary() {
    document.getElementById('bible-offline').style.display = 'none';
    document.getElementById('bible-chapter').style.display = 'none';
    document.getElementById('bible-loading').style.display = 'none';
    clearVerseSelection();
    setBibleBackVisible(false);
    renderBooks();
    renderContinueChip();
    const lib = document.getElementById('bible-library');
    lib.style.display = 'block';
}

// The header back arrow (same line as the Credo title) is only meaningful
// while a chapter is open — toggled by the reading/library/offline switches.
function setBibleBackVisible(visible) {
    const btn = document.getElementById('bible-back');
    if (btn) btn.classList.toggle('show', !!visible);
}

function showBibleLoading() {
    document.getElementById('bible-library').style.display = 'none';
    document.getElementById('bible-chapter').style.display = 'none';
    document.getElementById('bible-loading').style.display = 'block';
}

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY (book rows with inline chapter accordion)
// ─────────────────────────────────────────────────────────────────────────────
function renderBooks() {
    if (!bibleBooksIndex || !bibleBooksIndex.books) return;
    const ot = document.getElementById('books-ot');
    const nt = document.getElementById('books-nt');
    ot.innerHTML = '';
    nt.innerHTML = '';
    // The DOM is rebuilt with every accordion collapsed — the state variable
    // MUST follow, otherwise backToLibrary()'s "is it open already?" guard
    // would skip expanding the current book.
    expandedBookCode = null;
    bibleBooksIndex.books.forEach(book => {
        const item = document.createElement('div');
        item.className = 'book-item';
        item.id = 'book-item-' + book.code;

        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'book-row';
        row.setAttribute('aria-expanded', 'false');
        row.setAttribute('aria-controls', 'chapters-of-' + book.code);

        const name = document.createElement('span');
        name.className = 'book-row-name';
        name.textContent = book.name;

        const meta = document.createElement('span');
        meta.className = 'book-row-meta';
        meta.textContent = book.chapters + (book.chapters === 1 ? ' chapter' : ' chapters');

        const arrow = document.createElement('span');
        arrow.className = 'material-icons-round book-row-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = 'chevron_right';

        row.appendChild(name);
        row.appendChild(meta);
        row.appendChild(arrow);
        row.onclick = () => toggleBookChapters(book.code);

        // Chapters are drawn INLINE below the row (accordion), lazily filled
        // on first expansion — 1,189 grids are never built up front.
        const wrap = document.createElement('div');
        wrap.className = 'book-chapters';
        wrap.id = 'chapters-of-' + book.code;
        wrap.style.display = 'none';
        const grid = document.createElement('div');
        grid.className = 'chapter-grid';
        wrap.appendChild(grid);

        item.appendChild(row);
        item.appendChild(wrap);
        (book.testament === 'OT' ? ot : nt).appendChild(item);
    });
}

// Toggle the chapter accordion of one book row. Only ONE book is open at a
// time; tapping the open row collapses it.
function toggleBookChapters(code) {
    const book = bibleBooksIndex.books.find(b => b.code === code);
    if (!book) return;
    const item = document.getElementById('book-item-' + code);
    const wrap = document.getElementById('chapters-of-' + code);
    if (!item || !wrap) return;
    const wasOpen = (expandedBookCode === code);

    // Collapse everything first (accordion behaviour).
    document.querySelectorAll('.book-chapters').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.book-row.open').forEach(el => {
        el.classList.remove('open');
        el.setAttribute('aria-expanded', 'false');
    });
    expandedBookCode = null;

    if (!wasOpen) {
        const grid = wrap.querySelector('.chapter-grid');
        if (grid && !grid.childElementCount) {
            for (let ch = 1; ch <= book.chapters; ch++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'chapter-num';
                btn.textContent = ch;
                btn.setAttribute('aria-label', book.name + ' chapter ' + ch);
                btn.onclick = () => openChapter(code, ch, null);
                grid.appendChild(btn);
            }
        }
        wrap.style.display = 'block';
        const row = item.querySelector('.book-row');
        if (row) {
            row.classList.add('open');
            row.setAttribute('aria-expanded', 'true');
        }
        expandedBookCode = code;
        // Keep the freshly opened chapters in view. Deliberately INSTANT
        // (no smooth glide): a lingering smooth animation would fight the
        // instant "scroll to top" that openChapter() performs when the user
        // quickly taps a chapter while the glide is still running.
        setTimeout(() => wrap.scrollIntoView({ block: 'nearest' }), 40);
    }
}

function renderContinueChip() {
    const last = readBibleLast();
    const wrap = document.getElementById('bible-continue');
    if (!last || !bibleBooksIndex) { wrap.style.display = 'none'; return; }
    const book = bibleBooksIndex.books.find(b => b.code === last.code);
    if (!book) { wrap.style.display = 'none'; return; }
    document.getElementById('bible-continue-label').textContent =
        t('continue_reading') + ': ' + book.name + ' ' + last.chapter;
    wrap.style.display = 'block';
}

function continueReading() {
    const last = readBibleLast();
    if (last) openChapter(last.code, last.chapter, null);
}

function readBibleLast() {
    try {
        const v = JSON.parse(localStorage.getItem('bible_last') || 'null');
        if (v && typeof v.code === 'string' && Number.isFinite(v.chapter)) return v;
    } catch (e) { /* ignore */ }
    return null;
}

function writeBibleLast(code, chapter) {
    localStorage.setItem('bible_last', JSON.stringify({ code, chapter }));
}

// Reading view ‹ arrow → back to the book list, with the current book's
// chapters already expanded and scrolled into view.
function backToLibrary() {
    const code = currentBookCode;
    history.pushState({}, '', 'bible');
    showBibleLibrary();
    if (code && bibleBooksIndex) {
        setTimeout(() => {
            if (expandedBookCode !== code) toggleBookChapters(code);
            const item = document.getElementById('book-item-' + code);
            if (item) item.scrollIntoView({ block: 'start' });
        }, 60);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTER READING
// ─────────────────────────────────────────────────────────────────────────────
// highlightVerses: array of verse numbers to pre-select (persistent green
// highlight + scroll to the first one), used by the "Read full chapter"
// deep link and by the share links copied from this reader. It supports ANY
// selection — a single verse, a contiguous range, or scattered verses —
// because the copy/share link carries the full list (e.g. LUK.14.9,12).
// null → plain open, no selection.
async function openChapter(code, chapter, highlightVerses) {
    const book = bibleBooksIndex.books.find(b => b.code === code);
    if (!book) return;
    if (chapter < 1 || chapter > book.chapters) return;

    currentBookCode = code;
    currentChapterNum = chapter;
    clearVerseSelection();
    currentVerseTexts = {};
    setBibleBackVisible(true);   // reading view → header arrow visible

    document.getElementById('bible-library').style.display = 'none';
    document.getElementById('bible-loading').style.display = 'block';

    document.getElementById('chapter-view-title').textContent = book.name + ' ' + chapter;

    let bookData = bibleBookCache[code];
    if (!bookData) {
        try {
            // NOTE: bsb-full requests bypass the service worker cache
            // (online-only by design). A failure here = offline screen.
            const resp = await fetch(BIBLE_DATA_DIR + book.file, { cache: 'no-cache' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            bookData = await resp.json();
            bibleBookCache[code] = bookData;
        } catch (err) {
            console.error('[bible] book fetch failed (offline?):', err);
            showBibleOffline();
            scrollToBibleTop();
            return;
        }
    }

    const verses = bookData.chapters[String(chapter)] || [];
    const container = document.getElementById('chapter-verses');
    container.innerHTML = '';

    for (let i = 0; i < verses.length; i++) {
        const text = verses[i];
        if (text === null || text === undefined) continue;   // BSB omits some verse numbers
        const verseNum = i + 1;
        currentVerseTexts[verseNum] = text;
        const p = document.createElement('p');
        p.className = 'verse';
        p.id = 'verse-' + verseNum;
        p.setAttribute('data-ref', code + '.' + chapter + '.' + verseNum);

        const num = document.createElement('span');
        num.className = 'verse-num';
        num.textContent = verseNum;
        num.setAttribute('aria-hidden', 'true');
        p.appendChild(num);

        p.appendChild(document.createTextNode(' ' + text));

        // Tap a verse → toggle the persistent green selection (see the UX
        // comment at the top of this file).
        p.onclick = () => toggleVerseSelected(verseNum);

        container.appendChild(p);
    }

    // Mark verses that carry a saved note with the barely-visible green edge
    // (see SAVED-NOTE MARKERS below).
    applyNoteMarkers(code, chapter);

    document.getElementById('btn-prev-chapter').disabled = (chapter === 1 && BOOK_INDEX(code) === 0);
    document.getElementById('btn-next-chapter').disabled = (chapter === book.chapters && BOOK_INDEX(code) === 65);

    document.getElementById('bible-loading').style.display = 'none';
    document.getElementById('bible-chapter').style.display = 'block';

    writeBibleLast(code, chapter);

    // Deep link / daily-quote jump / copied share link: pre-select the given
    // verses (green) and scroll to the first one.
    if (Array.isArray(highlightVerses) && highlightVerses.length) {
        const maxVerse = verses.length;
        const nums = [...new Set(highlightVerses)]
            .filter(n => Number.isFinite(n))
            .map(n => Math.max(1, Math.min(n, maxVerse)))
            .sort((a, b) => a - b);
        let firstEl = null;
        nums.forEach(v => {
            const el = document.getElementById('verse-' + v);
            if (!el) return;                             // verse number omitted by BSB
            el.classList.add('selected', 'pop');
            selectedVerses.add(v);
            if (!firstEl) firstEl = el;
        });
        updateSelectionBar();
        if (firstEl) {
            setTimeout(() => firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
        }
    } else {
        scrollToBibleTop();
    }
}

// The app shell scrolls inside <main> (body never scrolls), so "back to the
// top" must scroll main — window.scrollTo alone is a no-op there.
function scrollToBibleTop() {
    const m = document.querySelector('main');
    if (m) m.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });   // harmless fallback
}

function BOOK_INDEX(code) {
    return bibleBooksIndex.books.findIndex(b => b.code === code);
}

// Previous / next chapter across book boundaries (Genesis 1 ← Revelation 22)
function gotoChapterRelative(delta) {
    if (!currentBookCode || !currentChapterNum) return;
    const idx = BOOK_INDEX(currentBookCode);
    if (idx < 0) return;
    let bookIdx = idx, ch = currentChapterNum + delta;

    while (ch < 1 || ch > bibleBooksIndex.books[bookIdx].chapters) {
        bookIdx += delta;
        if (bookIdx < 0 || bookIdx > 65) return;      // beyond the canon
        ch = delta > 0 ? 1 : bibleBooksIndex.books[bookIdx].chapters;
    }
    openChapter(bibleBooksIndex.books[bookIdx].code, ch, null);
}

// ─────────────────────────────────────────────────────────────────────────────
// VERSE SELECTION — persistent green highlight, multi-select
// ─────────────────────────────────────────────────────────────────────────────
function toggleVerseSelected(verseNum) {
    const p = document.getElementById('verse-' + verseNum);
    if (!p) return;
    if (selectedVerses.has(verseNum)) {
        selectedVerses.delete(verseNum);
        p.classList.remove('selected');
    } else {
        selectedVerses.add(verseNum);
        p.classList.add('selected');
    }
    updateSelectionBar();
}

// Verse keys (BOOK.CHAPTER.VERSE) of the current selection, ascending.
function selectedVerseRefs() {
    return [...selectedVerses]
        .sort((a, b) => a - b)
        .map(n => currentBookCode + '.' + currentChapterNum + '.' + n);
}

function clearVerseSelection() {
    selectedVerses.clear();
    const bar = document.getElementById('selection-bar');
    if (bar) bar.style.display = 'none';
}

function updateSelectionBar() {
    const bar = document.getElementById('selection-bar');
    if (!bar) return;
    if (!selectedVerses.size) { bar.style.display = 'none'; return; }

    const favBtn = document.getElementById('sel-fav');
    const allFav = selectedVerseRefs().every(isFavoriteRef);
    favBtn.classList.toggle('is-fav', allFav);
    favBtn.querySelector('.material-icons-round').textContent = allFav ? 'favorite' : 'favorite_border';

    // Notes are stored per selection (see openNoteForSelection): one verse →
    // note_LUK.2.16, several verses → note_LUK.14.9-12 / note_LUK.14.9,12.
    // Enabled for ANY selection size since the multi-verse note support.

    bar.style.display = 'flex';
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVED-NOTE MARKERS — every verse the user has EVER commented on carries a
// barely visible, very light green left edge: the exact spot that turns dark
// green when a verse is selected. While a verse is selected the marker is
// switched OFF (CSS :not(.selected)) so a selected verse looks EXACTLY like
// any other selected verse.
// ─────────────────────────────────────────────────────────────────────────────
// All verse numbers of CODE.CHAPTER covered by any saved note key. Note keys
// use the compressed verse list (note_LUK.14.9-12 / note_LUK.14.9,12 /
// note_LUK.14.9-11,14) — the same format the note storage and the share
// links use, and the same one the Saved page and deep-link parser read.
function notedVerseNumsForChapter(code, chapter) {
    const nums = new Set();
    const prefix = 'note_' + code + '.' + chapter + '.';
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(prefix)) continue;
            key.slice(prefix.length).split(',').forEach(part => {
                expandVerseParts(part).forEach(v => nums.add(v));
            });
        }
    } catch (e) { /* storage unavailable — no markers */ }
    return nums;
}

// Stamp .has-note onto the rendered verses of the given chapter.
function applyNoteMarkers(code, chapter) {
    const noted = notedVerseNumsForChapter(code, chapter);
    document.querySelectorAll('#chapter-verses .verse').forEach(p => {
        const n = parseInt(p.id.replace('verse-', ''), 10);
        p.classList.toggle('has-note', noted.has(n));
    });
}

// Re-derive markers for the CURRENTLY open chapter — called right after the
// notes modal closes, so a freshly written note marks its verse at once and
// an emptied one (empty = deleted, see saveNoteFromModal) unmarks it.
function refreshNoteMarkers() {
    if (currentBookCode && currentChapterNum) {
        applyNoteMarkers(currentBookCode, currentChapterNum);
    }
}

// The notes modal is shared markup driven by app.js. Wrap its global close
// handler (app.js is loaded first) so marker updates happen only here, on
// the page that shows the markers — closing the modal anywhere else is
// untouched.
const _credoCloseNotesModal = closeNotesModal;
closeNotesModal = function () {
    _credoCloseNotesModal();
    refreshNoteMarkers();
};

// ─────────────────────────────────────────────────────────────────────────────
// SELECTION ACTIONS — favorite / note / copy
// ─────────────────────────────────────────────────────────────────────────────
// Heart on the selection bar: if EVERY selected verse is already a favorite,
// remove them all; otherwise add the missing ones. Writes the same schema v2
// favorite entries as toggleFavoriteRef() in app.js:
//   { ref:'LUK.2.16', label:'Luke 2:16', text:'<verse text>' }
function toggleFavoritesForSelection() {
    if (!selectedVerses.size || !currentBookCode || !currentChapterNum) return;
    const nums = [...selectedVerses].sort((a, b) => a - b);
    const keys = nums.map(n => currentBookCode + '.' + currentChapterNum + '.' + n);
    const allFav = keys.every(isFavoriteRef);

    const favorites = getFavorites();
    let changed = 0;
    keys.forEach((key, i) => {
        const idx = favorites.findIndex(f => f.ref === key);
        if (allFav) {
            if (idx !== -1) { favorites.splice(idx, 1); changed++; }
        } else if (idx === -1) {
            favorites.push({
                ref: key,
                label: refLabelFromKey(key) || key,
                text: currentVerseTexts[nums[i]] || ''
            });
            changed++;
        }
    });
    if (!changed) return;
    localStorage.setItem('favorites', JSON.stringify(favorites));
    showToast(allFav ? t('removed_fav') : t('added_fav'));
    if (typeof renderSaved === 'function') renderSaved();
    updateSelectionBar();
}

// Note on the selection bar — works for ONE verse and for MULTI-verse
// selections alike (user request: "omogoči zapis opomb tudi pri izbiri večih
// vrstic naenkrat"). The storage key covers the whole selection:
//   1 verse          → LUK.2.16
//   contiguous       → LUK.14.9-12
//   scattered        → LUK.14.9,12      (mixed: LUK.14.9-11,14)
// The same composite format is understood by refLabelFromKey(), the Saved
// page (note_ key regexes) and the deep-link parser — one format everywhere.
function openNoteForSelection() {
    if (!selectedVerses.size || !currentBookCode || !currentChapterNum) return;
    const nums = [...selectedVerses].sort((a, b) => a - b);
    const versePart = nums.length === 1 ? String(nums[0]) : compressVerseNums(nums);
    const key = currentBookCode + '.' + currentChapterNum + '.' + versePart;
    const verseText = nums
        .map(n => '[' + n + '] ' + String(currentVerseTexts[n] || '').trim())
        .join('\n');
    openNotesModalForVerse(key, refLabelFromKey(key) || key, verseText);
}

// "5-7,9" compression of a sorted, unique verse-number list.
function compressVerseNums(nums) {
    const out = [];
    let i = 0;
    while (i < nums.length) {
        let j = i;
        while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
        out.push(i === j ? String(nums[i]) : nums[i] + '-' + nums[j]);
        i = j + 1;
    }
    return out.join(',');
}

// Canonical key of the current selection: CODE.CHAPTER.verses, with the verse
// part compressed (9-12, 9,12, 9-11,14). Used by the note storage AND the
// share link, so a saved note and a copied quote always point at the exact
// same selection.
function selectionRefKey() {
    const nums = [...selectedVerses].sort((a, b) => a - b);
    const versePart = nums.length === 1 ? String(nums[0]) : compressVerseNums(nums);
    return currentBookCode + '.' + currentChapterNum + '.' + versePart;
}

// Pure text builder (kept separate from the clipboard call so tests can
// verify the exact copy format).
function buildSelectionText() {
    const nums = [...selectedVerses].sort((a, b) => a - b);
    const book = bibleBooksIndex.books.find(b => b.code === currentBookCode);
    const ref = book.name + ' ' + currentChapterNum + ':' + compressVerseNums(nums);
    const body = nums
        .map(n => '[' + n + '] ' + String(currentVerseTexts[n] || '').trim())
        .join('\n');
    // Deep link back into CREDO: opens this chapter and pre-selects exactly
    // these verses in the same green as the "Read full chapter" jump — one
    // blank line between the quote and the link, per the requested format.
    const link = location.origin + location.pathname.replace(/index\.html$/, '')
        + '?ref=' + encodeURIComponent(selectionRefKey());
    return '\u201C' + body + '\u201D - ' + ref + ' (BSB)\n\n' + link;
}

async function copySelectedVerses() {
    if (!selectedVerses.size || !currentBookCode || !currentChapterNum) return;
    const ok = await copyTextToClipboard(buildSelectionText());
    showToast(ok ? t('copied') : t('image_failed'));
}

// Clipboard API first, hidden-textarea fallback for older/denied contexts.
async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            return true;
        } catch (err2) {
            console.error('[bible] clipboard failed:', err, err2);
            return false;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEEP LINKS (?ref=LUK.2.16 / LUK.14.9-12 / LUK.14.9,12 / Luke+2:16-18)
// ─────────────────────────────────────────────────────────────────────────────
// The verse part of a canonical key is the same compressed list used by the
// note storage and the copied share links: "16", "9-12", "9,12", "9-11,14".
// (MIGRATION/COMPAT NOTE: single-verse keys keep their exact old shape
// CODE.CHAPTER.VERSE — links shared before this change keep working.)
function expandVerseParts(part) {
    const m = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(String(part).trim());
    if (!m) return [];
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a > 200) return [];
    const out = [];
    for (let v = a; v <= b; v++) out.push(v);
    return out;
}

function handleBibleUrlRef() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;

    let code = null;
    let chapter = null;
    let verseList = [];

    const upper = ref.trim().toUpperCase();
    if (/^[A-Z0-9]{2,4}\.\d+\.[\d,\-]+$/.test(upper)) {
        // Canonical key: CODE.CHAPTER.<verse list>
        const m = /^([A-Z0-9]{2,4})\.(\d+)\.([\d,\-]+)$/.exec(upper);
        code = m[1];
        chapter = parseInt(m[2], 10);
        verseList = m[3].split(',').flatMap(expandVerseParts);
    } else {
        // Human label from the Home page, e.g. "Luke 2:16" or "John 9:35-38"
        const pr = parseRefLabel(ref);
        if (pr) {
            code = pr.code;
            chapter = pr.chapter;
            const end = pr.endVerse || pr.verse;
            for (let v = pr.verse; v <= end; v++) verseList.push(v);
        }
    }
    if (!code || !chapter || !verseList.length) return;

    const book = bibleBooksIndex.books.find(b => b.code === code);
    if (!book) return;
    chapter = Math.min(Math.max(chapter, 1), book.chapters);
    // Clean the URL (replaceState) so refresh/back behave naturally — keep the
    // canonical compressed form so a re-open reproduces the same highlight.
    history.replaceState({}, '', 'bible?ref=' + encodeURIComponent(selectionKeyFromList(code, chapter, verseList)));
    openChapter(code, chapter, verseList);
}

// CODE.CHAPTER.<compressed verse list> for an arbitrary verse array — the
// URL-safe form of selectionRefKey() (which reads the live selection).
function selectionKeyFromList(code, chapter, verseList) {
    const uniq = [...new Set(verseList)].filter(Number.isFinite).sort((a, b) => a - b);
    if (!uniq.length) return code + '.' + chapter;
    const part = uniq.length === 1 ? String(uniq[0]) : compressVerseNums(uniq);
    return code + '.' + chapter + '.' + part;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIVITY listeners: if we drop offline mid-reading, tell the user.
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('offline', () => {
    if (typeof showToast === 'function' && !bibleOfflineShown) {
        showToast(t('bible_online_only'));
    }
});
