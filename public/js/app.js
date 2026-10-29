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

// === LONG PRESS ===
let longPressTimer;
let isLongPress = false;
const LONG_PRESS_DURATION = 500;

// === TRANSLATIONS ===
const translations = {
    en: {
        nav_today: "Home", nav_saved: "Saved", nav_settings: "Settings",
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
        aria_search: "Search passages and notes", aria_note: "Your thoughts about the passage"
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
        showToast(t('quote_data_error'));
        return currentQuotes;
    }
}

// === LONG PRESS HANDLERS ===
function handleTouchStart(e, id, type) {
    if (e.currentTarget.classList.contains('editing-mode')) return;
    isLongPress = false;
    
    longPressTimer = setTimeout(() => {
        isLongPress = true;
        showActionMenu(e.currentTarget, id, type);
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

function showActionMenu(itemElement, id, type) {
    id = parseInt(id, 10);               // ids are numbers — guard the inline templates
    if (!Number.isFinite(id)) return;
    itemElement.classList.add('long-press-active');
    
    const actionRow = document.createElement('div');
    actionRow.className = 'action-row';
    
    if (type === 'fav') {
        actionRow.innerHTML = `
            <button class="btn btn-danger" style="padding: 8px 16px; font-size: 0.8rem;" onclick="confirmDeleteDirect('fav', ${id}, this)">
                ${t('delete_yes')}
            </button>
        `;
    } else {
        actionRow.innerHTML = `
            <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.8rem;" onclick="editNoteDirect(${id}, this)">
                ${t('my_thoughts')}
            </button>
            <button class="btn btn-danger" style="padding: 8px 16px; font-size: 0.8rem;" onclick="confirmDeleteDirect('note', ${id}, this)">
                ${t('delete_yes')}
            </button>
        `;
    }
    
    itemElement.appendChild(actionRow);
    itemElement.classList.add('editing-mode');
}

function confirmDeleteDirect(type, id, btnElement) {
    const actionRow = btnElement.parentElement;
    const itemElement = actionRow.parentElement;
    
    itemElement.classList.remove('long-press-active', 'editing-mode');
    actionRow.remove();

    if (type === 'fav') {
        toggleFavorite(id);
    } else if (type === 'note') {
        localStorage.removeItem(`note_${id}`);
        showToast(t('removed_note'));
        renderSaved();
    }
}

function editNoteDirect(id, btnElement) {
    const actionRow = btnElement.parentElement;
    const itemElement = actionRow.parentElement;
    
    itemElement.classList.remove('long-press-active', 'editing-mode');
    actionRow.remove();
    
    openNotesModalForEdit(id);
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
// v17 fix: the old export built favourites/notes out of `currentQuotes`, which
// is only populated on the HOME page — on Settings (where the backup button
// lives) the array is empty, so the downloaded backup contained zero items.
// The export now reads everything straight from localStorage (the source of
// truth) and embeds the full quote text whenever the passage pool can resolve it.
async function exportBackup() {
    // Load the passage pool (no-op if already loaded) so favourites and notes
    // can embed the full passage text; on fetch failure loadQuotes() falls
    // back to the built-in passages, and unresolved ids stay as bare ids
    // (importBackup accepts both shapes).
    if (!currentQuotes.length) {
        try { await loadQuotes(); } catch (e) { /* proceed — bare ids still export */ }
    }
    const pool = currentQuotes.length ? currentQuotes : fallbackQuotes;

    // Favourites: localStorage holds plain passage ids.
    const favIds = JSON.parse(localStorage.getItem('favorites') || '[]')
        .map(id => parseInt(id, 10))
        .filter(id => Number.isFinite(id));
    const favObjs = favIds.map(id => pool.find(q => q.id === id) || id);

    // Notes: scan EVERY localStorage key of the form note_<id>, not just the
    // passages that happen to be loaded on this page.
    const notes = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = String(localStorage.key(i));
        const m = /^note_(\d+)$/.exec(key);
        if (!m) continue;
        const noteText = localStorage.getItem(key);
        if (!noteText || !noteText.trim()) continue;
        const id = parseInt(m[1], 10);
        const q = pool.find(item => item.id === id);
        notes.push({
            quote: q ? { id: q.id, text: q.text, author: q.author } : { id: id },
            note: noteText
        });
    }

    const backupData = {
        version: 1,
        date: new Date().toISOString(),
        app: "Credo",
        favorites: favObjs,
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
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad shape');
            // favorites: array of quote objects (or bare ids) → sanitized numeric id list
            if (data.favorites !== undefined) {
                if (!Array.isArray(data.favorites)) throw new Error('favorites');
                const ids = data.favorites
                    .map(q => (q && typeof q === 'object') ? parseInt(q.id, 10) : parseInt(q, 10))
                    .filter(id => Number.isFinite(id))
                    .slice(0, 1000);
                localStorage.setItem('favorites', JSON.stringify([...new Set(ids)]));
            }
            // notes: { quote: { id }, note: string } — validated + capped
            if (data.notes !== undefined) {
                if (!Array.isArray(data.notes)) throw new Error('notes');
                data.notes
                    .filter(item => item && typeof item === 'object'
                        && item.quote && typeof item.quote === 'object'
                        && Number.isFinite(parseInt(item.quote.id, 10))
                        && typeof item.note === 'string'
                        && item.note.length <= 10000)
                    .slice(0, 1000)
                    .forEach(item => {
                        localStorage.setItem(`note_${parseInt(item.quote.id, 10)}`, item.note);
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
    
    if (typeof updateFavButtonState === 'function') updateFavButtonState();
}

async function loadDailyQuote() {
    await loadQuotes();
    await loadCalendar();
    // Local calendar date, NOT toISOString() (UTC) — in Slovenia between
    // 00:00–01:59 the UTC date is still "yesterday" (v12 audit fix).
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    handleDateChange(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
}

// === FAVORITES ===
function toggleFavorite(id) {
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
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const btn = document.getElementById('btn-fav-daily');
    if (!btn) return;
    
    const icon = btn.querySelector('.material-icons-round');
    if (favorites.includes(currentQuote.id)) {
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
    
    // Make sure quotes are loaded
    if (currentQuotes.length === 0) {
        await loadQuotes();
    }
    
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    listEl.innerHTML = '';
    
    const filteredFavs = favorites.map(id => currentQuotes.find(q => q.id === id))
                                 .filter(q => q && (q.text.toLowerCase().includes(searchQuery) || 
                                                   (q.author && q.author.toLowerCase().includes(searchQuery))));

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
        
        item.onmousedown = (e) => handleTouchStart(e, quote.id, 'fav');
        item.onmouseup = (e) => handleTouchEnd(e, quote.id, 'fav');
        item.onmouseleave = () => clearTimeout(longPressTimer);
        item.ontouchstart = (e) => handleTouchStart(e, quote.id, 'fav');
        item.ontouchend = (e) => handleTouchEnd(e, quote.id, 'fav');
        item.ontouchmove = handleTouchMove;

        item.innerHTML = `
            <div class="fav-content">
                <div class="fav-quote">"${escapeHtml(quote.text)}"</div>
                <div class="fav-author">${escapeHtml(getAttribution(quote, true))}</div>
            </div>
        `;
        listEl.appendChild(item);
    });
}

async function renderNotes() {
    const listEl = document.getElementById('notes-list');
    const emptyEl = document.getElementById('no-notes');
    if (!listEl || !emptyEl) return;
    
    // Make sure quotes are loaded
    if (currentQuotes.length === 0) {
        await loadQuotes();
    }
    
    listEl.innerHTML = '';
    
    const allNotes = [];
    currentQuotes.forEach(quote => {
        const note = localStorage.getItem(`note_${quote.id}`);
        if (note && note.trim().length > 0) {
            if (note.toLowerCase().includes(searchQuery) || 
                quote.text.toLowerCase().includes(searchQuery) ||
                (quote.author && quote.author.toLowerCase().includes(searchQuery))) {
                allNotes.push({ quote, note });
            }
        }
    });

    if (allNotes.length === 0) {
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

    allNotes.forEach(({ quote, note }) => {
        const item = document.createElement('div');
        item.className = 'note-item';
        
        item.onmousedown = (e) => handleTouchStart(e, quote.id, 'note');
        item.onmouseup = (e) => handleTouchEnd(e, quote.id, 'note');
        item.onmouseleave = () => clearTimeout(longPressTimer);
        item.ontouchstart = (e) => handleTouchStart(e, quote.id, 'note');
        item.ontouchend = (e) => handleTouchEnd(e, quote.id, 'note');
        item.ontouchmove = handleTouchMove;

        item.innerHTML = `
            <div class="note-content">
                <span class="note-quote-ref">"${escapeHtml(quote.text)}"</span>
                <div class="note-author">${escapeHtml(getAttribution(quote, true))}</div>
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

function openNotesModalForEdit(quoteId) {
    const quote = currentQuotes.find(q => q.id === quoteId);
    if (!quote) return;
    currentQuote = quote;
    
    const modal = document.getElementById('notes-modal');
    const textArea = document.getElementById('modal-note-input');
    const savedNote = localStorage.getItem(`note_${quoteId}`);
    textArea.value = savedNote || "";
    
    updateModalQuoteRef(quote);
    
    openModalA11y(modal);
    setTimeout(() => textArea.focus(), 120);
}

function openNotesModal() {
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
    localStorage.setItem(`note_${currentQuote.id}`, text);
}

function showDeleteModal(type, id) {
    itemToDelete = { type, id };
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
        toggleFavorite(itemToDelete.id);
    } else if (itemToDelete.type === 'note') {
        localStorage.removeItem(`note_${itemToDelete.id}`);
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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered', reg))
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