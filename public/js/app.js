// === DATA ===
// Bible passages (Gospel verses) in the Berean Standard Bible (BSB), a
// public-domain English translation. Passage ids are shared with
// data/bsb.bible.json and data/calendar.json.
let currentQuotes = [];
// Offline fallback: real BSB passages (same ids), so even without the JSON
// files the app shows Scripture, never invented text.
let fallbackQuotes = [
    {"id": 162, "text": "“Do not judge, or you will be judged.", "author": "Matthew 7:1", "source": "Berean Standard Bible"},
    {"id": 258, "text": "For many are called, but few are chosen.”", "author": "Matthew 22:14", "source": "Berean Standard Bible"},
    {"id": 60, "text": "The greatest among you shall be your servant.", "author": "Matthew 23:11", "source": "Berean Standard Bible"},
    {"id": 1, "text": "So they hurried off and found Mary and Joseph and the Baby, who was lying in the manger.", "author": "Luke 2:16", "source": "Berean Standard Bible"},
    {"id": 79, "text": "Jesus said to her, “I am the resurrection and the life. Whoever believes in Me will live, even though he dies.", "author": "John 11:25", "source": "Berean Standard Bible"}
];

// === STATE ===
let currentQuote = {};
let itemToDelete = null;
let currentSavedTab = 'fav';
let searchQuery = "";

// ═══════════════════════════════════════════════════════════════════════════
// BIBLE BOOKS (canonical order) + verse-reference utilities
// ═══════════════════════════════════════════════════════════════════════════
// Shared by: the "Read full chapter" button on Home, the Bible reader
// (bible.html + js/bible.js) and the storage migration below.
// `code` is the canonical storage key prefix — verse keys look like
// "LUK.2.16" (BOOKCODE.CHAPTER.VERSE) and are STABLE FOREVER: they are used
// as localStorage keys for favorites and notes. Never rename a code.
const BIBLE_BOOKS = [
    {code:'GEN', name:'Genesis', chapters:50}, {code:'EXO', name:'Exodus', chapters:40},
    {code:'LEV', name:'Leviticus', chapters:27}, {code:'NUM', name:'Numbers', chapters:36},
    {code:'DEU', name:'Deuteronomy', chapters:34}, {code:'JOS', name:'Joshua', chapters:24},
    {code:'JDG', name:'Judges', chapters:21}, {code:'RUT', name:'Ruth', chapters:4},
    {code:'1SA', name:'1 Samuel', chapters:31}, {code:'2SA', name:'2 Samuel', chapters:24},
    {code:'1KI', name:'1 Kings', chapters:22}, {code:'2KI', name:'2 Kings', chapters:25},
    {code:'1CH', name:'1 Chronicles', chapters:29}, {code:'2CH', name:'2 Chronicles', chapters:36},
    {code:'EZR', name:'Ezra', chapters:10}, {code:'NEH', name:'Nehemiah', chapters:13},
    {code:'EST', name:'Esther', chapters:10}, {code:'JOB', name:'Job', chapters:42},
    {code:'PSA', name:'Psalm', chapters:150}, {code:'PRO', name:'Proverbs', chapters:31},
    {code:'ECC', name:'Ecclesiastes', chapters:12}, {code:'SNG', name:'Song of Solomon', chapters:8},
    {code:'ISA', name:'Isaiah', chapters:66}, {code:'JER', name:'Jeremiah', chapters:52},
    {code:'LAM', name:'Lamentations', chapters:5}, {code:'EZK', name:'Ezekiel', chapters:48},
    {code:'DAN', name:'Daniel', chapters:12}, {code:'HOS', name:'Hosea', chapters:14},
    {code:'JOL', name:'Joel', chapters:3}, {code:'AMO', name:'Amos', chapters:9},
    {code:'OBA', name:'Obadiah', chapters:1}, {code:'JON', name:'Jonah', chapters:4},
    {code:'MIC', name:'Micah', chapters:7}, {code:'NAM', name:'Nahum', chapters:3},
    {code:'HAB', name:'Habakkuk', chapters:3}, {code:'ZEP', name:'Zephaniah', chapters:3},
    {code:'HAG', name:'Haggai', chapters:2}, {code:'ZEC', name:'Zechariah', chapters:14},
    {code:'MAL', name:'Malachi', chapters:4},
    {code:'MAT', name:'Matthew', chapters:28}, {code:'MRK', name:'Mark', chapters:16},
    {code:'LUK', name:'Luke', chapters:24}, {code:'JHN', name:'John', chapters:21},
    {code:'ACT', name:'Acts', chapters:28}, {code:'ROM', name:'Romans', chapters:16},
    {code:'1CO', name:'1 Corinthians', chapters:16}, {code:'2CO', name:'2 Corinthians', chapters:13},
    {code:'GAL', name:'Galatians', chapters:6}, {code:'EPH', name:'Ephesians', chapters:6},
    {code:'PHP', name:'Philippians', chapters:4}, {code:'COL', name:'Colossians', chapters:4},
    {code:'1TH', name:'1 Thessalonians', chapters:5}, {code:'2TH', name:'2 Thessalonians', chapters:3},
    {code:'1TI', name:'1 Timothy', chapters:6}, {code:'2TI', name:'2 Timothy', chapters:4},
    {code:'TIT', name:'Titus', chapters:3}, {code:'PHM', name:'Philemon', chapters:1},
    {code:'HEB', name:'Hebrews', chapters:13}, {code:'JAS', name:'James', chapters:5},
    {code:'1PE', name:'1 Peter', chapters:5}, {code:'2PE', name:'2 Peter', chapters:3},
    {code:'1JN', name:'1 John', chapters:5}, {code:'2JN', name:'2 John', chapters:1},
    {code:'3JN', name:'3 John', chapters:1}, {code:'JUD', name:'Jude', chapters:1},
    {code:'REV', name:'Revelation', chapters:22}
];

// "Luke 2:16" / "John 9:35-38" / "1 Samuel 2:3" →
//   { code:'LUK', chapter:2, verse:16, endVerse:null, key:'LUK.2.16', label:'Luke 2:16' }
// Range refs anchor to their FIRST verse (key uses verse, label keeps the range).
// Returns null when the label cannot be parsed.
function parseRefLabel(label) {
    if (!label || typeof label !== 'string') return null;
    const m = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(label.trim());
    if (!m) return null;
    const name = m[1].trim();
    const book = BIBLE_BOOKS.find(b => b.name.toLowerCase() === name.toLowerCase());
    if (!book) return null;
    const chapter = parseInt(m[2], 10), verse = parseInt(m[3], 10);
    const endVerse = m[4] ? parseInt(m[4], 10) : null;
    if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
    return {
        code: book.code, chapter, verse, endVerse,
        key: book.code + '.' + chapter + '.' + verse,
        label: label.trim()
    };
}

// "LUK.2.16" → "Luke 2:16" (or null for unknown codes).
// The verse part may also be a COMPRESSED LIST of the current selection —
// "LUK.14.9-12" → "Luke 14:9-12", "LUK.14.9,12" → "Luke 14:9,12",
// "LUK.14.9-11,14" → "Luke 14:9-11,14" (multi-verse notes & share links).
// Single-verse keys keep their original shape, so pre-existing labels and
// links are unaffected (user-data compatibility).
function refLabelFromKey(key) {
    const m = /^([A-Z0-9]{2,4})\.(\d+)\.([\d,\-]+)$/.exec(key || '');
    if (!m) return null;
    const book = BIBLE_BOOKS.find(b => b.code === m[1]);
    if (!book) return null;
    return book.name + ' ' + m[2] + ':' + m[3];
}

function splitVerseKey(key) {
    const m = /^([A-Z0-9]{2,4})\.(\d+)\.(\d+)$/.exec(key || '');
    if (!m) return null;
    return { code: m[1], chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE SCHEMA v2 — favorites & notes are keyed to Bible VERSE REFERENCES
// ═══════════════════════════════════════════════════════════════════════════
// HISTORY OF THE FORMAT (KEEP THIS COMMENT — it documents user-data
// compatibility for anyone touching localStorage in the future):
//
//   v1 (original release):
//     favorites        = JSON array of NUMERIC passage ids (ids of the 331
//                        curated passages in data/bsb.bible.json, shared with
//                        data/calendar.json)
//     note_<id>        = plain string (the user's thought)
//
//   v2 (Bible reader release, since the full-Bible tab):
//     favorites        = JSON array of objects
//                        { ref:'LUK.2.16', label:'Luke 2:16', text:'<verse text>' }
//                        — can point at ANY verse of the 66 books
//     note_LUK.2.16    = JSON { note:'<user thought>', verse:'<verse text>', label:'Luke 2:16' }
//                        — since the multi-verse note support the note key can
//                        also cover a whole SELECTION, using the same compressed
//                        verse list as the share links:
//                        note_LUK.14.9-12 (contiguous) / note_LUK.14.9,12
//                        (scattered) / note_LUK.14.9-11,14 (mixed).
//                        COMPATIBILITY: single-verse keys keep their exact
//                        old shape — old notes migrate and render unchanged,
//                        and refLabelFromKey() understands both forms.
//                        (the verse text is stored together with the note so
//                        the Saved page works fully OFFLINE)
//
// MIGRATION v1 → v2 (automatic, one-shot, on the user's next visit):
//   1. Requires the curated pool (data/bsb.bible.json) — it is the ONLY
//      id→ref map that exists. If that fetch fails (e.g. offline), migration
//      is SKIPPED and v1 data is left untouched; the app keeps working in
//      legacy mode and migration is retried on a later visit.
//   2. BEFORE converting, the raw v1 values are copied to:
//        localStorage['favorites_legacy_backup']  (raw JSON array of ids)
//        localStorage['notes_legacy_backup']      (object {id: noteText})
//      These backups are tiny and are kept FOREVER as a rollback safety net.
//      DO NOT DELETE the backup logic or the backup keys.
//   3. Every numeric id is resolved to its passage ref ("Luke 2:16") → verse
//      key ("LUK.2.16"). Range refs ("John 9:35-38") anchor to the FIRST
//      verse. Unresolvable ids are dropped from favorites but stay in the
//      legacy backup (should never happen — ids come from the same pool).
//   4. Only after a fully successful conversion is
//        localStorage['schema_version'] = '2'
//      written — migration then never runs again.
//   5. Backup import (.credo) accepts BOTH formats and normalizes to v2
//      (see importBackup below).
//
// REMINDER FOR FUTURE CHANGES: if you ever introduce schema v3, you must
// migrate v2 the same way (one-shot, backup first, marker key last).
let storageV2 = false;
let _migratePromise = null;

function ensureMigrated() {
    if (localStorage.getItem('schema_version') === '2') {
        storageV2 = true;
        return Promise.resolve();
    }
    if (_migratePromise) return _migratePromise;
    _migratePromise = (async () => {
        try {
            await loadQuotes();
            if (!poolLoadedOk) {
                // Pool unavailable (offline?) — skip, retry on a later visit.
                console.warn('[storage-migration] passage pool unavailable — keeping v1 data, will retry next visit.');
                return;
            }

            // --- 1. Snapshot the raw v1 state (rollback safety net) ---
            const rawFav = localStorage.getItem('favorites');
            const rawNotes = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = String(localStorage.key(i));
                const m = /^note_(\d+)$/.exec(k);
                if (m) rawNotes[m[1]] = localStorage.getItem(k);
            }
            try {
                localStorage.setItem('favorites_legacy_backup', rawFav || '[]');
                localStorage.setItem('notes_legacy_backup', JSON.stringify(rawNotes));
            } catch (e) {
                console.error('[storage-migration] could not write legacy backups — aborting migration (v1 data untouched).', e);
                return;
            }

            // --- 2. Convert favorites: id → {ref, label, text} ---
            // (also tolerates v2-shaped entries if any are already present)
            const seen = new Set();
            const favs = [];
            (JSON.parse(rawFav || '[]') || []).forEach(item => {
                let entry = null;
                if (item && typeof item === 'object' && item.ref) {
                    entry = item;                                   // already v2
                } else {
                    const id = parseInt(item, 10);
                    if (!Number.isFinite(id)) return;
                    entry = favEntryFromId(id);
                    if (!entry) {
                        console.warn('[storage-migration] favorite id ' + id + ' could not be resolved — kept in favorites_legacy_backup only.');
                        return;
                    }
                }
                if (!seen.has(entry.ref)) { seen.add(entry.ref); favs.push(entry); }
            });
            localStorage.setItem('favorites', JSON.stringify(favs));

            // --- 3. Convert notes: note_<id> (plain string) → note_<REF> (JSON) ---
            Object.keys(rawNotes).forEach(id => {
                const q = currentQuotes.find(p => p.id === parseInt(id, 10));
                const noteText = rawNotes[id];
                if (!q || !noteText || !noteText.trim()) return;   // leave old key in place
                const pr = parseRefLabel(q.author);
                if (!pr) return;
                localStorage.setItem('note_' + pr.key, JSON.stringify({
                    note: noteText,
                    verse: q.text,
                    label: pr.label
                }));
                localStorage.removeItem('note_' + id);             // converted → remove legacy key
            });

            // --- 4. Mark done (always LAST) ---
            localStorage.setItem('schema_version', '2');
            storageV2 = true;
            console.log('[storage-migration] v1 → v2 complete:', favs.length, 'favorites converted.');
        } catch (err) {
            console.error('[storage-migration] failed — v1 data kept, will retry next visit.', err);
            // _migratePromise is reset so a later call can retry within this visit too
            _migratePromise = null;
        }
    })();
    return _migratePromise;
}

// Numeric passage id → v2 favorite entry (needs the loaded pool)
function favEntryFromId(id) {
    const q = currentQuotes.find(p => p.id === id);
    if (!q) return null;
    const pr = parseRefLabel(q.author);
    if (!pr) return null;
    return { ref: pr.key, label: pr.label, text: q.text };
}

// READ favorites — always returns v2-shaped entries regardless of what is on
// disk (legacy ids are converted on the fly when the pool is available).
function getFavorites() {
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem('favorites') || '[]') || []; } catch (e) { raw = []; }
    const seen = new Set();
    const out = [];
    raw.forEach(item => {
        let entry = null;
        if (item && typeof item === 'object' && item.ref) {
            entry = item;
        } else {
            const id = parseInt(item, 10);
            if (Number.isFinite(id)) entry = favEntryFromId(id);
        }
        if (entry && entry.ref && !seen.has(entry.ref)) { seen.add(entry.ref); out.push(entry); }
    });
    return out;
}

function isFavoriteRef(key) {
    return getFavorites().some(f => f.ref === key);
}

// ═══════════════════════════════════════════════════════════════════════
// === LONG PRESS ===
let longPressTimer;
let isLongPress = false;
const LONG_PRESS_DURATION = 500;

// === TRANSLATIONS ===
const translations = {
    en: {
        nav_today: "Home", nav_bible: "Bible", nav_saved: "Saved", nav_settings: "Settings",
        favorites: "Favorites", notes: "Notes",
        no_fav: "No saved passages.", no_notes: "No thoughts written.",
        settings: "Settings", font_size: "Font Size", language: "Language",
        small: "Small", medium: "Medium", large: "Large",
        backup: "Backup Data", download_backup: "Download Backup", restore: "Restore Backup",
        today: "Today", quote_on_day: "Passage on this day",
        my_thoughts: "My Thoughts", save_close: "Save & Close",
        delete_confirm_title: "Remove Favorite?", delete_confirm_text: "Are you sure you want to remove this passage from your favorites?",
        delete_note_title: "Delete Note?", delete_note_text: "Are you sure you want to delete this thought?",
        cancel: "Cancel", delete_yes: "Yes, Delete",
        share_quote: "Share Passage",
        share_download: "Download image", share_copy_text: "Copy passage",
        share_hint_download: "9:16 image", share_hint_text: "text + link",
        share_note: "The image is 9:16 — perfect for an Instagram story or wallpaper. On phones, the Share button opens the system share sheet right away, with the image and the passage.",
        copied: "Copied", added_fav: "Added to favorites", removed_fav: "Removed from favorites", removed_note: "Note deleted.",
        toast_backup_success: "Backup downloaded successfully.", toast_restore_success: "Data restored successfully.",
        wallpaper_editor: "Wallpaper Editor", open_wallpaper: "Open Editor",
        pwa_install_title: "Download App", pwa_install_desc: "Use Credo anywhere, even offline.", pwa_install_btn: "Install",
        empty_fav_title: "Nothing saved yet", no_results_sub: "No matches for your search. Try a different term.",
        empty_notes_title: "No thoughts yet",
        empty_cta: "See today's passage",
        image_creating: "Creating image...", image_saved: "Image saved (9:16)", image_failed: "Could not create the image.",
        quote_data_error: "Passage file could not be read – showing built-in passages only. Please check the JSON file.",
        invalid_backup: "Invalid backup file.",
        aria_search: "Search passages and notes", aria_note: "Your thoughts about the passage",
        read_full_chapter: "Read full chapter",
        bible_title: "The Bible",
        bible_offline_title: "You're offline",
        bible_offline_text: "Reading the whole Bible needs an internet connection. Your daily passage, favorites and notes still work offline.",
        bible_retry: "Try again",
        bible_online_only: "Bible reading works online only",
        old_testament: "Old Testament", new_testament: "New Testament",
        all_books: "All books", select_chapter: "Select a chapter",
        prev_chapter: "Previous", next_chapter: "Next",
        continue_reading: "Continue reading",
        loading_chapter: "Loading chapter...",
        saved_link: "Saved Passages", saved_link_desc: "Your favorites and notes"
    }
};

// === LITURGICAL CALENDAR ===
// data/calendar.json: { from, to, wrapYear, days: { 'YYYY-MM-DD': passageId } }
// — the daily Gospel passage of the general Slovenian lectionary (source:
// hozana.si), covering 2026-01-01 .. 2027-01-31. Dates outside the range use
// the same month/day of wrapYear (2026); days without an entry fall back to
// the deterministic date-hash selection below.
let liturgicalDays = null;
let calendarWrapYear = 2026;
// True only when the curated pool (data/bsb.bible.json) loaded from the
// network/file successfully. The v1→v2 storage migration REQUIRES it (it is
// the only id→ref map) — see the STORAGE SCHEMA v2 comment block above.
let poolLoadedOk = false;
async function loadCalendar() {
    if (liturgicalDays) return;
    try {
        const response = await fetch('data/calendar.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Could not load data/calendar.json`);
        const data = await response.json();
        liturgicalDays = (data && data.days) ? data.days : {};
        calendarWrapYear = (data && data.wrapYear) || 2026;
    } catch (error) {
        console.warn('calendar.json could not be loaded — all dates will use the date-hash selection.', error);
        liturgicalDays = {};
    }
}

async function loadQuotes() {
    // Declared outside try so the catch block can reference fileName in its error message
    const fileName = 'data/bsb.bible.json';
    try {
        // cache: 'no-cache' => the browser always revalidates with the server,
        // so data updates appear after a simple reload (no hard-refresh needed)
        const response = await fetch(fileName, { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`Could not load ${fileName}`);
        }
        
        const data = await response.json();
        const translationName = (data && data.translationName) || 'Berean Standard Bible';
        currentQuotes = data.passages || [];
        poolLoadedOk = currentQuotes.length > 0;

        // Basic migration if needed (ensuring all have 'text' and 'author');
        // preserves enrichment fields: category, tags, source, source_type, year
        currentQuotes = currentQuotes.map(p => {
            return {
                id: p.id,
                text: p.text || "",
                author: p.ref || "",
                category: 'gospel',
                tags: p.book ? [p.book] : [],
                source: translationName,
                source_type: null,
                year: null
            };
        });

        return currentQuotes;
    } catch (error) {
        console.error(`Could not load ${fileName}. If the error is a SyntaxError, the JSON file itself is invalid ` +
            `(usually a missing comma or an unescaped " inside a value). The app is now showing built-in fallback quotes:`, error);
        // Fallback to hardcoded quotes
        currentQuotes = fallbackQuotes.slice();
        poolLoadedOk = false;
        showToast(t('quote_data_error'));
        return currentQuotes;
    }
}

// === LONG PRESS HANDLERS ===
function handleTouchStart(e, id, type) {
    // Capture the element NOW: e.currentTarget is only valid during event
    // dispatch — 500 ms later (inside the timeout) it is already null, and
    // showActionMenu(null, …) would throw and silently kill the menu.
    const target = e.currentTarget;
    if (target.classList.contains('editing-mode')) return;
    isLongPress = false;

    longPressTimer = setTimeout(() => {
        isLongPress = true;
        showActionMenu(target, id, type);
    }, LONG_PRESS_DURATION);
}

function handleTouchEnd(e, id, type) {
    clearTimeout(longPressTimer);
    
    if (!isLongPress && type === 'note') {
        document.querySelectorAll('.long-press-active').forEach(el => el.classList.remove('long-press-active'));
        const target = e.currentTarget; 
        if (!target.classList.contains('editing-mode')) {
            openNotesModalForEdit(id);
        }
    }
}

function handleTouchMove() {
    clearTimeout(longPressTimer);
}

function showActionMenu(itemElement, refKey, type) {
    // refKey is a verse reference key ("LUK.2.16") — or a compressed
    // multi-verse selection ("LUK.14.9-12" / "LUK.14.9,12") — since the
    // storage v2 refactor; favorites and notes are keyed to verses.
    if (!refKey || typeof refKey !== 'string' || !/^[A-Z0-9]{2,4}\.\d+\.[\d,\-]+$/.test(refKey)) return;
    itemElement.classList.add('long-press-active');
    
    const actionRow = document.createElement('div');
    actionRow.className = 'action-row';
    
    if (type === 'fav') {
        actionRow.innerHTML = `
            <button class="btn btn-danger" style="padding: 8px 16px; font-size: 0.8rem;" onclick="confirmDeleteDirect('fav', '${refKey}', this)">
                ${t('delete_yes')}
            </button>
        `;
    } else {
        actionRow.innerHTML = `
            <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.8rem;" onclick="editNoteDirect('${refKey}', this)">
                ${t('my_thoughts')}
            </button>
            <button class="btn btn-danger" style="padding: 8px 16px; font-size: 0.8rem;" onclick="confirmDeleteDirect('note', '${refKey}', this)">
                ${t('delete_yes')}
            </button>
        `;
    }
    
    itemElement.appendChild(actionRow);
    itemElement.classList.add('editing-mode');
}

function confirmDeleteDirect(type, refKey, btnElement) {
    const actionRow = btnElement.parentElement;
    const itemElement = actionRow.parentElement;
    
    itemElement.classList.remove('long-press-active', 'editing-mode');
    actionRow.remove();

    if (type === 'fav') {
        toggleFavoriteRef(refKey);
    } else if (type === 'note') {
        localStorage.removeItem('note_' + refKey);
        showToast(t('removed_note'));
        renderSaved();
    }
}

function editNoteDirect(refKey, btnElement) {
    const actionRow = btnElement.parentElement;
    const itemElement = actionRow.parentElement;
    
    itemElement.classList.remove('long-press-active', 'editing-mode');
    actionRow.remove();
    
    openNotesModalForEdit(refKey);
}

// === SETTINGS ===
function loadSettings() {
    const font = localStorage.getItem('fontSize') || 'medium';
    applyFontSize(font);
}

function updateControlUI(controlId, activeValue) {
    const container = document.getElementById(controlId);
    if (!container) return;
    
    const options = container.querySelectorAll('.segment-opt');
    const pill = container.querySelector('.segment-pill');
    const activeOpt = container.querySelector(`.segment-opt[data-value="${activeValue}"]`);

    if (activeOpt && pill) {
        pill.style.width = `${activeOpt.offsetWidth}px`;
        pill.style.transform = `translateX(${activeOpt.offsetLeft}px)`;

        options.forEach(opt => {
            const isActive = opt.getAttribute('data-value') === activeValue;
            opt.style.color = isActive ? 'var(--ink)' : 'var(--ink-soft)';
            opt.setAttribute('aria-checked', isActive ? 'true' : 'false');
        });
    }
}

function changeFontSize(val) {
    localStorage.setItem('fontSize', val);
    applyFontSize(val);
    updateControlUI('font-control', val);
}

function applyFontSize(val) {
    const root = document.documentElement;
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    
    if (val === 'small') {
        root.style.setProperty('--base-font-size', '14px');
        root.style.setProperty('--quote-font-size', '1.4rem');
    } else if (val === 'large') {
        root.style.setProperty('--base-font-size', '18px');
        root.style.setProperty('--quote-font-size', '1.8rem');
    } else {
        root.style.setProperty('--base-font-size', '16px');
        root.style.setProperty('--quote-font-size', '1.6rem');
    }
}

function updateTexts() {
    const t = translations.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.placeholder = "Search...";
        searchInput.setAttribute('aria-label', t.aria_search);
    }
    const noteArea = document.getElementById('modal-note-input');
    if (noteArea) noteArea.setAttribute('aria-label', t.aria_note);

    document.documentElement.lang = 'en';
    
    // Tab title per page
    const page = document.body.getAttribute('data-page');
    const titles = {
        home:    'Credo – Daily Gospel Verse',
        bible:   'Bible – Credo',
        saved:   'Saved Passages – Credo',
        settings:'Settings – Credo'
    };
    if (page && titles[page]) {
        document.title = titles[page];
    }
}

function t(key) {
    return translations.en[key] || key;
}

// === ATTRIBUTION HELPERS ===
// Every passage shows its Bible reference ("- Luke 2:16"); the translation
// name ("Berean Standard Bible") is rendered below it via getSourceNote().
function isAnonymousAuthor(q) {
    return !q || !q.author || q.author === 'Anonymous';
}

function getAttribution(q, withDash) {
    if (!q) return '';
    const prefix = withDash ? '- ' : '';
    if (!isAnonymousAuthor(q)) return prefix + q.author;
    return prefix + 'Anonymous';
}

// Small print under the author: the translation name, shown for every passage
// whose reference is displayed (i.e. always).
function getSourceNote(q) {
    if (!q || !q.source || isAnonymousAuthor(q)) return '';
    return q.source + (q.year ? `, ${q.year}` : '');
}

// Word-wrap helper for canvas text
function wrapCanvasText(ctx, text, maxW) {
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > maxW && n > 0) {
            lines.push(line.trim());
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line.trim());
    return lines;
}

// === BACKUP ===
// Backup format v2 (Bible reader release): favorites/notes are keyed to verse
// refs, not passage ids — see the STORAGE SCHEMA v2 block near the top.
//   version 2: { favorites: [{ref,label,text}], notes: [{ref,label,verse,note}] }
//   version 1 (legacy, still importable): ids / {id,text,author} / {quote:{...},note}
// Imports of BOTH versions are normalized to v2 before anything is written.
async function exportBackup() {
    await ensureMigrated();
    // Load the passage pool (no-op if already loaded) so legacy v1 notes can
    // embed their passage text; on fetch failure loadQuotes() falls back to
    // the built-in passages.
    if (!currentQuotes.length) {
        try { await loadQuotes(); } catch (e) { /* proceed — legacy notes export without text */ }
    }
    const pool = currentQuotes.length ? currentQuotes : fallbackQuotes;

    // Favorites (v2 entries; legacy ids are converted on the fly by getFavorites)
    const favorites = getFavorites().map(f => ({ ref: f.ref, label: f.label, text: f.text || '' }));

    // Notes: v2 keys note_<REF> (single verse or compressed multi-verse
    // selection, e.g. note_LUK.14.9-12 / note_LUK.14.9,12) + any leftover
    // legacy note_<id> (only present when the migration has not run yet,
    // e.g. always-offline user).
    const notes = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = String(localStorage.key(i));
        const mV2 = /^note_([A-Z0-9]{2,4}\.\d+\.[\d,\-]+)$/.exec(key);
        if (mV2) {
            try {
                const n = JSON.parse(localStorage.getItem(key));
                if (n && typeof n.note === 'string' && n.note.trim()) {
                    notes.push({ ref: mV2[1], label: n.label || refLabelFromKey(mV2[1]) || mV2[1], verse: n.verse || '', note: n.note });
                }
            } catch (e) { /* corrupt entry — skip */ }
            continue;
        }
        const mV1 = /^note_(\d+)$/.exec(key);
        if (mV1) {
            const noteText = localStorage.getItem(key);
            if (!noteText || !noteText.trim()) continue;
            const id = parseInt(mV1[1], 10);
            const q = pool.find(p => p.id === id);
            const pr = q ? parseRefLabel(q.author) : null;
            notes.push({ ref: pr ? pr.key : null, label: q ? q.author : ('Passage #' + id), verse: q ? q.text : '', note: noteText });
        }
    }

    const backupData = {
        version: 2,
        date: new Date().toISOString(),
        app: "Credo",
        favorites: favorites,
        notes: notes
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credo_backup_${new Date().toISOString().split('T')[0]}.credo`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('toast_backup_success'));
}

function importBackup(input) {
    const file = input.files[0];
    if (!file) return;
    // Backups are tiny JSON files — a bigger "backup" is not ours (v12 audit fix)
    if (file.size > 5 * 1024 * 1024) {
        showToast(t('invalid_backup'));
        input.value = '';
        return;
    }
    // Accepts .credo (current) and .thinkel (legacy pre-rename backups).
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            await ensureMigrated(); // try hard to be in v2 mode before writing
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad shape');
            const canConvert = storageV2 || poolLoadedOk;

            // --- favorites: v2 objects, v1 ids or v1 passage objects ---
            if (data.favorites !== undefined) {
                if (!Array.isArray(data.favorites)) throw new Error('favorites');
                const entries = [];
                data.favorites.forEach(q => {
                    if (q && typeof q === 'object' && q.ref && typeof q.ref === 'string') {
                        entries.push({ ref: q.ref, label: q.label || refLabelFromKey(q.ref) || q.ref, text: typeof q.text === 'string' ? q.text : '' });
                        return;
                    }
                    const id = (q && typeof q === 'object') ? parseInt(q.id, 10) : parseInt(q, 10);
                    if (!Number.isFinite(id)) return;
                    let entry = favEntryFromId(id);
                    if (!entry && q && typeof q === 'object' && typeof q.author === 'string') {
                        const pr = parseRefLabel(q.author);          // v1 object with ref label
                        if (pr) entry = { ref: pr.key, label: pr.label, text: typeof q.text === 'string' ? q.text : '' };
                    }
                    if (entry) entries.push(entry);
                    else console.warn('[backup-import] favorite could not be converted to a verse ref — skipped:', q);
                });
                const seen = new Set();
                const dedup = entries.filter(f => !seen.has(f.ref) && seen.add(f.ref)).slice(0, 1000);
                if (canConvert) {
                    localStorage.setItem('favorites', JSON.stringify(dedup));
                } else {
                    // Offline & pool unavailable: keep the raw legacy data and
                    // let the one-shot migration convert it on a later visit.
                    localStorage.setItem('favorites', JSON.stringify(data.favorites));
                    localStorage.removeItem('schema_version');
                }
            }

            // --- notes: v2 {ref,note,...} or v1 {quote:{...},note} ---
            if (data.notes !== undefined) {
                if (!Array.isArray(data.notes)) throw new Error('notes');
                data.notes.filter(item => item && typeof item === 'object'
                        && typeof item.note === 'string' && item.note.length <= 10000)
                    .slice(0, 1000)
                    .forEach(item => {
                        let refKey = null, label = null, verse = '';
                        if (item.ref && typeof item.ref === 'string' && /^[A-Z0-9]{2,4}\.\d+\.\d+$/.test(item.ref)) {
                            refKey = item.ref;
                            label = item.label || refLabelFromKey(refKey) || refKey;
                            verse = typeof item.verse === 'string' ? item.verse : '';
                        } else if (item.quote && typeof item.quote === 'object') {
                            const id = parseInt(item.quote.id, 10);
                            let pr = null;
                            const q = Number.isFinite(id) ? currentQuotes.find(p => p.id === id) : null;
                            pr = q ? parseRefLabel(q.author) : null;
                            if (!pr && typeof item.quote.author === 'string') pr = parseRefLabel(item.quote.author);
                            if (pr) {
                                refKey = pr.key;
                                label = pr.label;
                                verse = (typeof item.quote.text === 'string' && item.quote.text) ? item.quote.text : (q ? q.text : '');
                            }
                        }
                        if (!refKey) {
                            console.warn('[backup-import] note could not be converted to a verse ref — skipped:', item);
                            return;
                        }
                        localStorage.setItem('note_' + refKey, JSON.stringify({ note: item.note, verse: verse, label: label }));
                    });
            }

            if (typeof loadDailyQuote === 'function') loadDailyQuote();
            if (typeof updateFavButtonState === 'function') updateFavButtonState();
            if (typeof renderSaved === 'function') renderSaved();
            showToast(t('toast_restore_success'));
        } catch (err) {
            console.error('importBackup failed:', err);
            showToast(t('invalid_backup'));
        }
    };
    reader.onerror = function() { showToast(t('invalid_backup')); };
    reader.readAsText(file);
    input.value = '';
}

// === DATE HANDLING ===
function loadDate() {
    const now = new Date();
    updateDateDisplay(now);
}

function updateDateDisplay(dateObj) {
    const dateEl = document.getElementById('current-date');
    if (!dateEl) return;
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = dateObj.toLocaleDateString('en-US', options);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(dateObj);
    checkDate.setHours(0, 0, 0, 0);
    const label = document.getElementById('date-label');
    if (label) {
        if (checkDate.getTime() === today.getTime()) label.textContent = t('today');
        else label.textContent = t('quote_on_day');
    }
}

async function handleDateChange(dateString) {
    if (!dateString) return;
    
    // Parse as LOCAL calendar date (v12 audit fix): new Date("YYYY-MM-DD")
    // parses as UTC midnight, which in negative-UTC timezones lands on the
    // previous day and would select/display the wrong quote.
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return;
    const chosenDate = new Date(parts[0], parts[1] - 1, parts[2]);
    updateDateDisplay(chosenDate);
    
    // Make sure quotes are loaded
    if (currentQuotes.length === 0) {
        await loadQuotes();
    }
    await loadCalendar();
    
    const year = chosenDate.getFullYear();
    const month = chosenDate.getMonth();
    const day = chosenDate.getDate();

    // 1) Liturgical calendar first: the lectionary passage assigned to this date.
    // 2) Dates outside the calendar range use the same month/day of the wrap
    //    year (2026), e.g. 2027-03-05 -> 2026-03-05 (Feb 29 -> Feb 28).
    // 3) Fallback: stable daily selection — a hash of year, month and day picks
    //    from the passage pool, so every calendar day shows the same passage
    //    for everyone.
    const pad = n => String(n).padStart(2, '0');
    const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;
    let quote = null;
    if (liturgicalDays) {
        let key = liturgicalDays[dateKey] ? dateKey : null;
        if (!key) {
            let mm = pad(month + 1), dd = pad(day);
            if (mm === '02' && dd === '29') dd = '28';
            const wrapped = `${calendarWrapYear}-${mm}-${dd}`;
            if (wrapped !== dateKey && liturgicalDays[wrapped]) key = wrapped;
        }
        if (key) quote = currentQuotes.find(q => q.id === liturgicalDays[key]);
    }
    if (!quote) {
        const seed = (year * 10000) + (month * 100) + day;
        quote = currentQuotes[seed % currentQuotes.length];
    }
    currentQuote = quote;

    // Verse-reference anchor for this passage (schema v2): the daily quote's
    // ref like "Luke 2:16" (or a range "John 9:35-38") becomes the stable
    // verse key "LUK.2.16" used for favorites, notes and the
    // "Read full chapter" deep link into the Bible reader.
    const pr = parseRefLabel(currentQuote.author);
    currentQuote.verseKey = pr ? pr.key : null;
    currentQuote.verseChapter = pr ? pr.chapter : null;

    const quoteTextEl = document.getElementById('daily-quote-text');
    const quoteAuthorEl = document.getElementById('daily-quote-author');
    if (quoteTextEl) quoteTextEl.textContent = `"${currentQuote.text}"`;
    if (quoteAuthorEl) quoteAuthorEl.textContent = getAttribution(currentQuote, true);
    
    const quoteSourceEl = document.getElementById('daily-quote-source');
    if (quoteSourceEl) {
        const note = getSourceNote(currentQuote);
        quoteSourceEl.textContent = note;
        quoteSourceEl.style.display = note ? 'block' : 'none';
    }
    
    // "Read full chapter" button: visible whenever the daily ref parses
    const chapterBtn = document.getElementById('btn-full-chapter');
    if (chapterBtn) chapterBtn.style.display = currentQuote.verseKey ? 'flex' : 'none';
    
    if (typeof updateFavButtonState === 'function') updateFavButtonState();
}

// Home → Bible reader: open the WHOLE chapter the daily verse belongs to and
// scroll to + highlight the verse itself (bible?ref=LUK.2.16). When the daily
// passage is a RANGE ("John 9:35-38"), the human label is passed instead so
// the reader pre-selects every verse of the range with the same green
// highlight.
function goToFullChapter() {
    if (!currentQuote || !currentQuote.verseKey) return;
    const pr = parseRefLabel(currentQuote.author);
    const target = (pr && pr.endVerse) ? currentQuote.author : currentQuote.verseKey;
    window.location.href = 'bible?ref=' + encodeURIComponent(target);
}

async function loadDailyQuote() {
    // Run the one-shot storage v1→v2 migration on every visit (the Home page
    // is the app's entry point, so this is where most users get migrated).
    // Safe to call repeatedly; see STORAGE SCHEMA v2 at the top of the file.
    await ensureMigrated();
    await loadQuotes();
    await loadCalendar();
    // Local calendar date, NOT toISOString() (UTC) — in Slovenia between
    // 00:00–01:59 the UTC date is still "yesterday" (v12 audit fix).
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    handleDateChange(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
}

// === FAVORITES ===
// Schema v2: favorites are keyed to verse refs ("LUK.2.16"), NOT numeric ids.
// See the STORAGE SCHEMA v2 comment block near the top of this file.
// toggleFavoriteRef(refKey, label, text) — add/remove a single verse.
// toggleCurrentFavorite()      — the Home daily-quote heart button.
// A legacy id-based path is kept for the rare case where the migration could
// not run yet (offline first visit): then the daily quote still toggles by id.
function toggleFavoriteRef(refKey, label, text) {
    let favorites = getFavorites();
    const index = favorites.findIndex(f => f.ref === refKey);
    const btn = document.getElementById('btn-fav-daily');
    const icon = btn ? btn.querySelector('.material-icons-round') : null;
    
    if (index === -1) {
        favorites.push({ ref: refKey, label: label || refLabelFromKey(refKey) || refKey, text: text || '' });
        showToast(t('added_fav'));
        if (icon) {
            icon.classList.add('anim-pop');
            setTimeout(() => icon.classList.remove('anim-pop'), 300);
        }
    } else {
        favorites.splice(index, 1);
        showToast(t('removed_fav'));
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
    if (typeof updateFavButtonState === 'function') updateFavButtonState();
    if (typeof renderSaved === 'function') renderSaved();
}

function toggleCurrentFavorite() {
    if (storageV2 && currentQuote && currentQuote.verseKey) {
        toggleFavoriteRef(currentQuote.verseKey, currentQuote.author, currentQuote.text);
        return;
    }
    // Legacy v1 mode (migration not yet possible — pool unavailable):
    // keep the old id-based behaviour so nothing breaks or gets lost.
    toggleFavoriteLegacy(currentQuote.id);
}

function toggleFavoriteLegacy(id) {
    let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const index = favorites.indexOf(id);
    const btn = document.getElementById('btn-fav-daily');
    const icon = btn ? btn.querySelector('.material-icons-round') : null;
    
    if (index === -1) {
        favorites.push(id);
        showToast(t('added_fav'));
        if (icon) {
            icon.classList.add('anim-pop');
            setTimeout(() => icon.classList.remove('anim-pop'), 300);
        }
    } else {
        favorites.splice(index, 1);
        showToast(t('removed_fav'));
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
    if (typeof updateFavButtonState === 'function') updateFavButtonState();
    if (typeof renderSaved === 'function') renderSaved();
}

function updateFavButtonState() {
    const btn = document.getElementById('btn-fav-daily');
    if (!btn) return;
    const icon = btn.querySelector('.material-icons-round');
    let active = false;
    if (storageV2 && currentQuote && currentQuote.verseKey) {
        active = isFavoriteRef(currentQuote.verseKey);
    } else if (currentQuote && currentQuote.id != null) {
        // legacy check (works for both v1 arrays and on-the-fly conversion)
        active = getFavorites().some(f => f.ref === (favEntryFromId(currentQuote.id) || {}).ref);
    }
    if (active) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        icon.textContent = 'favorite';
    } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        icon.textContent = 'favorite_border';
    }
}

// === SHARE (v10) ===
// Phone/tablet: the share button opens the SYSTEM share sheet directly
// — the 9:16 image and the quote (author + link) travel together; the
// user only picks the app (Instagram story = one tap more).
// Desktop: the share button opens a modal with 2 options (download the
// image / copy the quote). The modal stays open until closed with ×.
function openShareModal() {
    if (!currentQuote || !currentQuote.text) return;
    const modal = document.getElementById('share-modal');
    const textSpan = document.getElementById('share-quote-text');
    const authorSpan = document.getElementById('share-quote-author');
    if (textSpan) textSpan.textContent = `"${currentQuote.text}"`;
    if (authorSpan) authorSpan.textContent = getAttribution(currentQuote, true);
    openModalA11y(modal);
}

function closeShareModal() {
    closeModalA11y(document.getElementById('share-modal'));
}

function buildShareText() {
    return `"${currentQuote.text}" ${getAttribution(currentQuote, true)}`.trim();
}

// Touch-primary device (phone/tablet)? Desktop pointers report
// hover:hover + pointer:fine, phones/tablets the opposite.
function isTouchPrimary() {
    return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
}

// Share button entry point.
async function onShareClick() {
    if (!currentQuote || !currentQuote.text) return;
    if (isTouchPrimary()) {
        await shareCurrentQuote();
        return;
    }
    openShareModal();
}

// Phone: straight to the system share sheet — image + quote + link.
async function shareCurrentQuote() {
    const url = window.location.origin + window.location.pathname;
    const text = `${buildShareText()}\n\n${url}`;
    showToast(t('image_creating'));
    const file = await createQuoteImageFile();
    if (!file) { showToast(t('image_failed')); return; }
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], text });
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return; // user closed the sheet
            console.error('navigator.share failed:', err);
        }
    }
    // Old device without image sharing: offer the desktop-style modal
    // (download the image / copy the quote) as a fallback.
    openShareModal();
}

// Desktop modal actions. The modal deliberately STAYS OPEN so the user
// can use both options; it closes only via the × button.
async function shareDesktopAction(action) {
    const url = window.location.origin + window.location.pathname;

    if (action === 'download') {
        showToast(t('image_creating'));
        const file = await createQuoteImageFile();
        if (!file) { showToast(t('image_failed')); return; }
        downloadQuoteImage(file);
        showToast(t('image_saved'));
        return;
    }

    if (action === 'copy') {
        const fullText = `${buildShareText()}\n\n${url}`;
        try {
            await navigator.clipboard.writeText(fullText);
            showToast(t('copied'));
        } catch (err) {
            // Clipboard API can be denied (permission/focus) — legacy fallback
            try {
                const ta = document.createElement('textarea');
                ta.value = fullText;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                showToast(t('copied'));
            } catch (err2) {
                console.error('clipboard failed:', err, err2);
                showToast(t('image_failed'));
            }
        }
    }
}

// === QUOTE AS IMAGE (9:16, ready for Instagram Story) ===
// Draws the neo-brutal 9:16 card on a canvas and returns it as a PNG
// File — used by the share modal. Returns null on failure.
async function createQuoteImageFile() {
    if (!currentQuote || !currentQuote.text) return null;
    try {
        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (e) { /* ignore */ }
        }
        const W = 1080, H = 1920;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d');

        // Rounded-rect helper (path, then fill/stroke by caller)
        const rr = (cx, cy, cw, ch, r) => {
            x.beginPath();
            x.moveTo(cx + r, cy);
            x.arcTo(cx + cw, cy, cx + cw, cy + ch, r);
            x.arcTo(cx + cw, cy + ch, cx, cy + ch, r);
            x.arcTo(cx, cy + ch, cx, cy, r);
            x.arcTo(cx, cy, cx + cw, cy, r);
            x.closePath();
        };

        // Neo-brutal card: flat sage canvas, hard ink frame + offset shadow
        const INK = '#12291A', CARD = '#FFFFFF', PAPER = '#F1F6EC';
        const GREEN = '#1CA85E', GOLD = '#A96A10';
        x.fillStyle = PAPER;
        x.fillRect(0, 0, W, H);

        const m = 96;                    // outer margin
        const cw = W - m * 2;            // card width
        const ct = 220;                  // card top
        const cb = H - 300;              // card bottom
        const ch = cb - ct;

        // hard offset shadow
        x.fillStyle = INK;
        rr(m + 26, ct + 26, cw, ch, 44);
        x.fill();

        // card face + border
        x.fillStyle = CARD;
        rr(m, ct, cw, ch, 44);
        x.fill();
        x.lineWidth = 12;
        x.strokeStyle = INK;
        rr(m, ct, cw, ch, 44);
        x.stroke();

        // Decorative oversized quotation mark (green, inside the card)
        x.fillStyle = 'rgba(28, 168, 94, 0.9)';
        x.textAlign = 'left';
        x.textBaseline = 'alphabetic';
        x.font = '700 300px "Playfair Display", serif';
        x.fillText('\u201C', m + 60, ct + 240);

        // Quote text (auto-shrinks to fit)
        let fs = 72;
        const maxW = cw - 140;
        const textTop = ct + 320;
        const textBottom = cb - 240;
        let lines;
        for (;;) {
            x.font = `400 ${fs}px "Playfair Display", serif`;
            lines = wrapCanvasText(x, currentQuote.text, maxW);
            if (lines.length * fs * 1.42 <= textBottom - textTop || fs <= 34) break;
            fs -= 4;
        }
        const lh = fs * 1.42;
        const centerY = (textTop + Math.min(textBottom, textTop + lines.length * lh)) / 2;
        const startY = centerY - (lines.length * lh) / 2 + lh / 2;
        x.fillStyle = INK;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        lines.forEach((ln, i) => x.fillText(ln, W / 2, startY + i * lh));

        // Attribution
        x.fillStyle = GOLD;
        x.font = 'italic 42px "Space Grotesk", sans-serif';
        x.textAlign = 'right';
        x.fillText(getAttribution(currentQuote, true), W - m - 90, cb - 110);

        // Branding footer: black pill with cream text
        const brand = 'CREDO \u00B7 daily gospel verse';
        x.font = '700 30px "Space Grotesk", sans-serif';
        const tw = x.measureText(brand).width;
        const pw = tw + 90, ph = 78, px = (W - pw) / 2, py = H - 220;
        x.fillStyle = INK;
        rr(px, py, pw, ph, ph / 2);
        x.fill();
        x.fillStyle = PAPER;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(brand, W / 2, py + ph / 2 + 2);

        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        if (!blob) throw new Error('toBlob failed');
        const fileName = 'credo-passage.png';
        return new File([blob], fileName, { type: 'image/png' });
    } catch (err) {
        console.error('createQuoteImageFile failed:', err);
        return null;
    }
}

// Desktop fallback: download the PNG to the device
function downloadQuoteImage(file) {
    const url2 = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url2;
    a.download = 'credo-passage-9x16.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url2), 2000);
}

// === SAVED PAGE ===
function switchSavedTab(tab) {
    currentSavedTab = tab;
    const favTab = document.getElementById('tab-fav');
    const notesTab = document.getElementById('tab-notes');
    const favContainer = document.getElementById('saved-favorites-container');
    const notesContainer = document.getElementById('saved-notes-container');
    
    if (favTab) {
        favTab.classList.toggle('active', tab === 'fav');
        favTab.setAttribute('aria-selected', tab === 'fav' ? 'true' : 'false');
    }
    if (notesTab) {
        notesTab.classList.toggle('active', tab === 'notes');
        notesTab.setAttribute('aria-selected', tab === 'notes' ? 'true' : 'false');
    }
    if (favContainer) favContainer.style.display = tab === 'fav' ? 'block' : 'none';
    if (notesContainer) notesContainer.style.display = tab === 'notes' ? 'block' : 'none';
    
    renderSaved();
}

function handleSearch(val) {
    searchQuery = val.toLowerCase();
    renderSaved();
}

async function renderSaved() {
    if (currentSavedTab === 'fav') await renderFavorites();
    else await renderNotes();
}

async function renderFavorites() {
    const listEl = document.getElementById('favorites-list');
    const emptyEl = document.getElementById('no-favorites');
    if (!listEl || !emptyEl) return;
    
    // Storage v2 migration (one-shot; see the comment block at the top) + pool
    await ensureMigrated();
    if (currentQuotes.length === 0) {
        await loadQuotes();
    }
    
    const favorites = getFavorites();
    listEl.innerHTML = '';
    
    const filteredFavs = favorites.filter(q =>
        (q.text || '').toLowerCase().includes(searchQuery) ||
        (q.label || '').toLowerCase().includes(searchQuery));

    if (filteredFavs.length === 0) {
        emptyEl.style.display = 'block';
        const titleEl = emptyEl.querySelector('.empty-title');
        const subEl = emptyEl.querySelector('p');
        const ctaEl = emptyEl.querySelector('.btn');
        if (searchQuery && favorites.length > 0) {
            if (titleEl) titleEl.textContent = "No results";
            if (subEl) subEl.textContent = t('no_results_sub');
            if (ctaEl) ctaEl.style.display = 'none';
        } else {
            if (titleEl) titleEl.textContent = t('empty_fav_title');
            if (subEl) subEl.textContent = t('no_fav');
            if (ctaEl) ctaEl.style.display = '';
        }
        return;
    }
    emptyEl.style.display = 'none';

    filteredFavs.forEach(quote => {
        const item = document.createElement('div');
        item.className = 'fav-item';
        
        item.onmousedown = (e) => handleTouchStart(e, quote.ref, 'fav');
        item.onmouseup = (e) => handleTouchEnd(e, quote.ref, 'fav');
        item.onmouseleave = () => clearTimeout(longPressTimer);
        item.ontouchstart = (e) => handleTouchStart(e, quote.ref, 'fav');
        item.ontouchend = (e) => handleTouchEnd(e, quote.ref, 'fav');
        item.ontouchmove = handleTouchMove;

        item.innerHTML = `
            <div class="fav-content">
                <div class="fav-quote">"${escapeHtml(quote.text || quote.label)}"</div>
                <div class="fav-author">${escapeHtml('- ' + (quote.label || ''))}</div>
            </div>
        `;
        listEl.appendChild(item);
    });
}

async function renderNotes() {
    const listEl = document.getElementById('notes-list');
    const emptyEl = document.getElementById('no-notes');
    if (!listEl || !emptyEl) return;
    
    // Storage v2 migration (one-shot; see the comment block at the top) + pool
    await ensureMigrated();
    if (currentQuotes.length === 0) {
        await loadQuotes();
    }
    
    listEl.innerHTML = '';
    
    // v2 notes live under note_<REF> keys (JSON objects with the verse text
    // embedded) — REF is a single verse (LUK.2.16) or a compressed selection
    // (LUK.14.9-12 / LUK.14.9,12); legacy v1 note_<id> keys (plain strings)
    // are shown too when the migration could not run yet (offline) — best
    // effort via the pool.
    const allNotes = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = String(localStorage.key(i));
        const mV2 = /^note_([A-Z0-9]{2,4}\.\d+\.[\d,\-]+)$/.exec(key);
        if (mV2) {
            let obj = null;
            try { obj = JSON.parse(localStorage.getItem(key)); } catch (e) { obj = null; }
            if (obj && typeof obj.note === 'string') {
                allNotes.push({
                    ref: mV2[1],
                    note: obj.note,
                    verse: obj.verse || '',
                    label: obj.label || refLabelFromKey(mV2[1]) || mV2[1]
                });
            }
            continue;
        }
        const mV1 = /^note_(\d+)$/.exec(key);
        if (mV1) {
            const noteText = localStorage.getItem(key);
            if (!noteText || !noteText.trim()) continue;
            const q = currentQuotes.find(p => p.id === parseInt(mV1[1], 10));
            allNotes.push({
                ref: q ? (parseRefLabel(q.author) || {}).key || mV1[1] : mV1[1],
                note: noteText,
                verse: q ? q.text : '',
                label: q ? q.author : ('Passage #' + mV1[1])
            });
        }
    }

    const filteredNotes = allNotes.filter(n =>
        n.note.toLowerCase().includes(searchQuery) ||
        (n.verse || '').toLowerCase().includes(searchQuery) ||
        (n.label || '').toLowerCase().includes(searchQuery));

    if (filteredNotes.length === 0) {
        emptyEl.style.display = 'block';
        const titleEl = emptyEl.querySelector('.empty-title');
        const subEl = emptyEl.querySelector('p');
        const ctaEl = emptyEl.querySelector('.btn');
        if (searchQuery) {
            if (titleEl) titleEl.textContent = "No results";
            if (subEl) subEl.textContent = t('no_results_sub');
            if (ctaEl) ctaEl.style.display = 'none';
        } else {
            if (titleEl) titleEl.textContent = t('empty_notes_title');
            if (subEl) subEl.textContent = t('no_notes');
            if (ctaEl) ctaEl.style.display = '';
        }
    } else {
        emptyEl.style.display = 'none';
    }

    filteredNotes.forEach(({ ref, note, verse, label }) => {
        const item = document.createElement('div');
        item.className = 'note-item';
        
        item.onmousedown = (e) => handleTouchStart(e, ref, 'note');
        item.onmouseup = (e) => handleTouchEnd(e, ref, 'note');
        item.onmouseleave = () => clearTimeout(longPressTimer);
        item.ontouchstart = (e) => handleTouchStart(e, ref, 'note');
        item.ontouchend = (e) => handleTouchEnd(e, ref, 'note');
        item.ontouchmove = handleTouchMove;

        item.innerHTML = `
            <div class="note-content">
                <span class="note-quote-ref">"${escapeHtml(verse || label)}"</span>
                <div class="note-author">${escapeHtml('- ' + label)}</div>
                <div class="note-body">${escapeHtml(note)}</div>
            </div>
        `;
        listEl.appendChild(item);
    });
}

// === MODALS ===
// === MODAL ACCESSIBILITY (v12 audit fix) ===
// Every dialog gets: role=dialog (in HTML), focus moved inside on open,
// focus restored to the trigger on close, background scroll lock and
// Escape-to-close (delegated listener below).
let lastFocusedElement = null;

function openModalA11y(modal) {
    if (!modal) return;
    lastFocusedElement = document.activeElement;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    const firstField = modal.querySelector('button, [href], input, textarea, select');
    if (firstField) setTimeout(() => firstField.focus(), 80);
}

function closeModalA11y(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
    lastFocusedElement = null;
}

// Escape closes whichever overlay is open (notes / share / delete / color).
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.modal-overlay.open, .color-modal-overlay.open');
    if (!open) return;
    if (open.id === 'delete-modal') { closeDeleteModal(null, true); }
    else if (open.id === 'share-modal') { closeShareModal(); }
    else if (open.id === 'notes-modal') { closeNotesModal(); }
    else if (open.id === 'color-modal') { closeColorPicker(); }   // wallpaper page
});

// === NOTES (schema v2: notes are keyed to verse refs, see top of file) ===
// currentNoteTarget = { ref, label, verse } for the note currently being
// edited in the modal; null in legacy id-based mode.
let currentNoteTarget = null;

// Open the notes modal for ANY verse (Bible reader uses this)
function openNotesModalForVerse(refKey, label, verseText) {
    // refKey: single verse (LUK.2.16) or a compressed selection
    // (LUK.14.9-12 / LUK.14.9,12) — both are valid note targets.
    if (!refKey || !/^[A-Z0-9]{2,4}\.\d+\.[\d,\-]+$/.test(refKey)) return;
    currentNoteTarget = {
        ref: refKey,
        label: label || refLabelFromKey(refKey) || refKey,
        verse: verseText || ''
    };
    const modal = document.getElementById('notes-modal');
    const textArea = document.getElementById('modal-note-input');
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('note_' + refKey)); } catch (e) { saved = null; }
    textArea.value = (saved && typeof saved.note === 'string') ? saved.note : "";
    
    updateModalQuoteRef({ text: currentNoteTarget.verse || currentNoteTarget.label, author: currentNoteTarget.label });
    
    openModalA11y(modal);
    setTimeout(() => textArea.focus(), 120);
}

// Saved page long-press "My Thoughts" — takes a verse ref key now.
function openNotesModalForEdit(refKey) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('note_' + refKey)); } catch (e) { saved = null; }
    const favEntry = getFavorites().find(f => f.ref === refKey);
    const verseText = (saved && saved.verse) || (favEntry && favEntry.text) || '';
    openNotesModalForVerse(refKey, (saved && saved.label) || null, verseText);
}

// Home daily-quote "My Thoughts" button
function openNotesModal() {
    if (storageV2 && currentQuote && currentQuote.verseKey) {
        openNotesModalForVerse(currentQuote.verseKey, currentQuote.author, currentQuote.text);
        return;
    }
    // Legacy v1 mode (migration not yet possible): id-based note handling.
    currentNoteTarget = null;
    const modal = document.getElementById('notes-modal');
    const textArea = document.getElementById('modal-note-input');
    const savedNote = localStorage.getItem(`note_${currentQuote.id}`);
    textArea.value = savedNote || "";
    
    updateModalQuoteRef(currentQuote);
    
    openModalA11y(modal);
    setTimeout(() => textArea.focus(), 120);
}

function updateModalQuoteRef(quote) {
    const refDiv = document.getElementById('modal-quote-ref');
    const textSpan = document.getElementById('modal-quote-text');
    const authorSpan = document.getElementById('modal-quote-author');
    
    if (refDiv) refDiv.style.display = 'flex';
    if (textSpan) textSpan.textContent = `"${quote.text}"`;
    if (authorSpan) authorSpan.textContent = getAttribution(quote, true);
}

function closeNotesModal() {
    closeModalA11y(document.getElementById('notes-modal'));
    if (typeof renderSaved === 'function') renderSaved();
}

function saveNoteFromModal() {
    const textArea = document.getElementById('modal-note-input');
    const text = textArea.value;
    if (currentNoteTarget) {
        // v2: note_<REF> = JSON { note, verse, label } (verse text embedded so
        // the Saved page renders fully offline)
        const key = 'note_' + currentNoteTarget.ref;
        if (!text.trim()) {
            localStorage.removeItem(key);   // empty note = delete
        } else {
            localStorage.setItem(key, JSON.stringify({
                note: text,
                verse: currentNoteTarget.verse || '',
                label: currentNoteTarget.label || ''
            }));
        }
        return;
    }
    // legacy id-based path (pre-migration only)
    localStorage.setItem(`note_${currentQuote.id}`, text);
}

function showDeleteModal(type, refKey) {
    itemToDelete = { type, ref: refKey };
    const modalTitle = document.getElementById('delete-modal-title');
    const modalText = document.getElementById('delete-modal-text');
    if (type === 'fav') {
        if (modalTitle) modalTitle.textContent = t('delete_confirm_title');
        if (modalText) modalText.textContent = t('delete_confirm_text');
    } else {
        if (modalTitle) modalTitle.textContent = t('delete_note_title');
        if (modalText) modalText.textContent = t('delete_note_text');
    }
    const modal = document.getElementById('delete-modal');
    openModalA11y(modal);
}

function closeDeleteModal(event, force = false) {
    if (force || (event && event.target.id === 'delete-modal')) {
        closeModalA11y(document.getElementById('delete-modal'));
        itemToDelete = null;
    }
}

function confirmDelete() {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'fav') {
        toggleFavoriteRef(itemToDelete.ref);
    } else if (itemToDelete.type === 'note') {
        localStorage.removeItem('note_' + itemToDelete.ref);
        showToast(t('removed_note'));
        if (typeof renderSaved === 'function') renderSaved();
    }
    closeDeleteModal(null, true);
}

// === UTILITIES ===
function showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (toastMessage) toastMessage.textContent = msg;
    if (toast) {
        toast.classList.add('show');
        setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Register Service Worker for PWA — with self-healing updates:
//   • updateViaCache:'none' → the sw.js update check can never be answered
//     from the browser HTTP cache (a stale sw.js here once kept the old
//     worker — and therefore the old whole app — alive for days).
//   • When an UPDATED worker takes over an already-controlled page, reload
//     ONCE so the new version is on screen without any hard reset. The very
//     first claim (page never had a controller) is NOT a version change and
//     must not trigger a reload.
//   • While the tab stays open, check for updates hourly.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        let pageHadController = !!navigator.serviceWorker.controller;
        let reloading = false;

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!pageHadController) { pageHadController = true; return; }
            if (reloading) return;
            reloading = true;
            console.log('[SW] New version took over — reloading');
            window.location.reload();
        });

        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
            .then(reg => {
                console.log('Service Worker registered', reg);
                // An update may already sit in "waiting" from a previous visit
                // — activate it right away so users never lag versions behind.
                if (reg.waiting && navigator.serviceWorker.controller) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                // Future updates: activate as soon as they finish installing.
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    if (!nw) return;
                    nw.addEventListener('statechange', () => {
                        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                            nw.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                });
                setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
            })
            .catch(err => console.error('Service Worker registration failed', err));
    });
}

// PWA Installation handling
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) installBtn.style.display = 'flex';
});

async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        const installBtn = document.getElementById('install-pwa-btn');
        if (installBtn) installBtn.style.display = 'none';
    }
    deferredPrompt = null;
}

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) installBtn.style.display = 'none';
    deferredPrompt = null;
});