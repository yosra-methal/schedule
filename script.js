const CONFIG = {
    slotHeight: 60, // pixels per hour
    defaultStart: 8,
    defaultEnd: 18,
    colors: [
        { id: 'tomato',     bg: '#F28B82', border: '#C06060' },
        { id: 'flamingo',   bg: '#FCC4DE', border: '#D898B8' },
        { id: 'tangerine',  bg: '#FAC9A8', border: '#D89070' },
        { id: 'banana',     bg: '#FBE9A0', border: '#D8C060' },
        { id: 'sage',       bg: '#A8DCC0', border: '#70B898' },
        { id: 'basil',      bg: '#68C096', border: '#409870' },
        { id: 'peacock',    bg: '#A8DCF0', border: '#60B8D8' },
        { id: 'blueberry',  bg: '#A0C4F8', border: '#6090D0' },
        { id: 'lavender',   bg: '#CDB8EA', border: '#9A88C8' },
        { id: 'grape',      bg: '#C791D5', border: '#9050B0' },
        { id: 'graphite',   bg: '#EBEBEB', border: '#C0C0C0' }
    ]
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// State
let state = {
    events: [],
    use24h: true,
    viewStart: 8,
    viewEnd: 18
};

// DOM Elements
const elements = {
    timeColumn: document.getElementById('time-column'),
    daysGrid: document.getElementById('days-grid'),
    modal: document.getElementById('event-modal'),
    modalTitle: document.getElementById('modal-title'),
    form: {
        title: document.getElementById('event-title'),
        day: document.getElementById('event-day'),
        // Start/End are now handled via specific H/M inputs, 
        // but we might still use hidden inputs for state transfer
        start: document.getElementById('event-start'),
        end: document.getElementById('event-end'),
        colorContainer: document.getElementById('color-options')
    },
    btns: {
        save: document.getElementById('save-btn'),
        cancel: document.getElementById('cancel-btn'),
        delete: document.getElementById('delete-btn'),
        duplicate: document.getElementById('duplicate-btn'),
        close: document.getElementById('close-modal'),
        add: document.getElementById('add-event-btn')
    },
    toggle: document.getElementById('time-format-toggle')
};

let currentEditingId = null;
let selectedColor = 'peacock';

function updateBodyClass() {
    document.body.classList.toggle('ampm-mode', !state.use24h);
}

// Initialization
function init() {
    loadData();
    renderColorOptions();
    calculateViewRange();
    renderGrid();
    setupEventListeners();

    elements.toggle.checked = !state.use24h;
    updateBodyClass();
}

function loadData() {
    const data = localStorage.getItem('weeklyPlannerData');
    if (data) {
        state.events = JSON.parse(data);
    }
    const pref = localStorage.getItem('weeklyPlannerPrefs');
    if (pref) {
        const p = JSON.parse(pref);
        state.use24h = p.use24h;
    }
}

function saveData() {
    localStorage.setItem('weeklyPlannerData', JSON.stringify(state.events));
    localStorage.setItem('weeklyPlannerPrefs', JSON.stringify({ use24h: state.use24h }));
    calculateViewRange();
    renderGrid();
}

// Logic: Time Range Calculation
function calculateViewRange() {
    let min = CONFIG.defaultStart;
    let max = CONFIG.defaultEnd;

    if (state.events.length > 0) {
        state.events.forEach(ev => {
            if (!ev.start || !ev.end) return;
            const startH = getDecimalHour(ev.start);
            let endH = getDecimalHour(ev.end);

            // Handle midnight end (00:00 -> 24.0)
            if (endH === 0 && startH > 0) endH = 24.0;
            // Handle midnight start (00:00 -> 0.0) - already handled by split

            if (!isNaN(startH) && startH < min) min = Math.floor(startH);
            if (!isNaN(endH) && endH > max) max = Math.ceil(endH);
        });
    }

    state.viewStart = min;
    state.viewEnd = max;
}

function renderGrid() {
    // Clear existing
    elements.timeColumn.innerHTML = '';
    elements.daysGrid.innerHTML = '';

    // Corner Spacer
    const cornerSpacer = document.createElement('div');
    cornerSpacer.className = 'time-corner-spacer';
    elements.timeColumn.appendChild(cornerSpacer);

    // Render Time Column Labels
    // Range: viewStart to viewEnd
    for (let h = state.viewStart; h <= state.viewEnd; h++) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time-slot';
        // Mark the very last label so it doesn't add height if we want flush bottom
        if (h === state.viewEnd) timeDiv.classList.add('last-slot');
        timeDiv.textContent = formatTimeDisplay(h);
        elements.timeColumn.appendChild(timeDiv);
    }

    // Render Days Columns
    const totalHours = state.viewEnd - state.viewStart;

    DAYS.forEach((dayName, dayIndex) => {
        const col = document.createElement('div');
        col.className = 'day-column';

        // Header
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = dayName;
        col.appendChild(header);

        // Body container
        const body = document.createElement('div');
        body.className = 'day-body';
        body.dataset.dayIndex = dayIndex;
        // Don't fix height, let content define it

        // Render Physical Cells (Rows)
        for (let i = 0; i < totalHours; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            body.appendChild(cell);
        }

        // Click handler for creating events
        body.addEventListener('click', (e) => handleGridClick(e, dayIndex));

        // Drag-to-reschedule handlers
        body.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            body.classList.add('drag-over');
        });

        body.addEventListener('dragleave', () => {
            body.classList.remove('drag-over');
        });

        body.addEventListener('drop', (e) => {
            e.preventDefault();
            body.classList.remove('drag-over');
            const eventId = e.dataTransfer.getData('eventId');
            if (!eventId) return;

            const grabOffsetY = parseFloat(e.dataTransfer.getData('grabOffsetY')) || 0;
            const rect = body.getBoundingClientRect();
            const offsetY = e.clientY - rect.top - grabOffsetY;
            const droppedH = state.viewStart + (offsetY / CONFIG.slotHeight);

            const newStartH = Math.max(state.viewStart, Math.min(Math.round(droppedH), state.viewEnd - 1));

            const evIdx = state.events.findIndex(ev => ev.id === eventId);
            if (evIdx === -1) return;

            const ev = state.events[evIdx];
            const oldStartH = getDecimalHour(ev.start);
            const oldEndH = getDecimalHour(ev.end);
            const duration = Math.round(oldEndH - oldStartH) || 1;
            const newEndH = Math.min(newStartH + duration, 24);

            state.events[evIdx] = {
                ...ev,
                day: dayIndex,
                start: `${newStartH.toString().padStart(2, '0')}:00`,
                end: `${newEndH.toString().padStart(2, '0')}:00`
            };

            saveData();
        });

        // Render Events
        const dayEvents = state.events.filter(e => e.day == dayIndex);
        const { colMap, numColsMap } = computeLayout(dayEvents);
        dayEvents.forEach(ev => {
            const evEl = createEventElement(ev, colMap.get(ev.id) || 0, numColsMap.get(ev.id) || 1);
            body.appendChild(evEl);
        });

        col.appendChild(body);
        elements.daysGrid.appendChild(col);
    });
}

function createEventElement(ev, colIndex = 0, numCols = 1) {
    const el = document.createElement('div');
    el.className = `event-card ${ev.color}`;

    const startH = getDecimalHour(ev.start);
    let endH = getDecimalHour(ev.end);
    if (endH === 0 && startH > 0) endH = 24;

    const duration = endH - startH;

    const top = (startH - state.viewStart) * CONFIG.slotHeight;
    const height = duration * CONFIG.slotHeight;

    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    el.style.zIndex = Math.floor(startH * 60) + colIndex;

    if (numCols <= 1) {
        el.style.left = '4px';
        el.style.right = '4px';
    } else {
        const GAP = 2; // px between adjacent events
        const leftPct  = (colIndex / numCols * 100).toFixed(3);
        const rightPct = ((numCols - colIndex - 1) / numCols * 100).toFixed(3);
        el.style.left  = `calc(${leftPct}% + ${colIndex === 0 ? 4 : GAP}px)`;
        el.style.right = `calc(${rightPct}% + ${colIndex === numCols - 1 ? 4 : GAP}px)`;
    }

    el.innerHTML = `
        <strong>${ev.title || 'Untitled'}</strong>
        <span class="event-time">${formatTimeRange(ev.start, ev.end)}</span>
    `;

    el.draggable = true;

    el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        const rect = el.getBoundingClientRect();
        const grabOffsetY = e.clientY - rect.top;
        e.dataTransfer.setData('eventId', ev.id);
        e.dataTransfer.setData('grabOffsetY', grabOffsetY.toString());
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
    });

    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
    });

    let didDrag = false;
    el.addEventListener('dragstart', () => { didDrag = true; });
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (didDrag) { didDrag = false; return; }
        openModal(ev);
    });

    return el;
}

// Helpers
function getDecimalHour(timeStr) {
    // Normalize to 24h if AM/PM is present (unlikely with type=time but safe)
    let str = timeStr.trim().toLowerCase();
    const isPM = str.includes('pm');
    const isAM = str.includes('am');

    // Remove suffixes
    str = str.replace(/(am|pm)/g, '').trim();

    const [hStr, mStr] = str.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    if (isNaN(h) || isNaN(m)) return 0;

    // 12h conversion if detected
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    // Note: If no suffix, assume 24h standard (e.g. "13:00", "00:00")

    return h + m / 60;
}

function formatTimeDisplay(hour) {
    // Check if hour is integer
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const mStr = m < 10 ? '0' + m : m;

    if (state.use24h) {
        // Handle 24 as 00:00 or keep 24:00? 
        // User requested support for 00:00. 
        // But if it's the end of the day, 00:00 is fine.
        const displayH = h === 24 ? '00' : h < 10 ? '0' + h : h;
        return `${displayH}:${mStr}`;
    } else {
        // 12h Format
        // 0 -> 12 AM, 12 -> 12 PM, 24 -> 12 AM
        const effectiveH = h % 24;
        const suffix = effectiveH >= 12 ? 'PM' : 'AM';
        const h12 = effectiveH % 12 || 12;
        return `${h12}:${mStr} ${suffix}`;
    }
}

function formatTimeString(timeStr) {
    if (state.use24h) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h >= 12 && h < 24 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const mStr = m < 10 ? '0' + m : m;
    return `${h12}:${mStr} ${suffix}`;
}

function formatTimeRange(start, end) {
    return `${formatTimeString(start)} - ${formatTimeString(end)}`;
}

// Modal handling
function renderColorOptions() {
    elements.form.colorContainer.innerHTML = '';
    CONFIG.colors.forEach(c => {
        const d = document.createElement('div');
        d.className = 'color-option';
        d.style.backgroundColor = c.bg;
        d.style.setProperty('--glow-color', c.border);
        d.dataset.id = c.id;
        if (c.id === selectedColor) d.classList.add('selected');

        d.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
            d.classList.add('selected');
            selectedColor = c.id;
        });

        elements.form.colorContainer.appendChild(d);
    });
}

// Unified Input Logic
function updateInputMode() {
    const is24 = state.use24h;

    // Toggle AM/PM visibility
    document.getElementById('start-ampm').classList.toggle('hidden', is24);
    document.getElementById('end-ampm').classList.toggle('hidden', is24);

    // Update constraints
    const maxHour = is24 ? 23 : 12;
    const minHour = is24 ? 0 : 1;

    ['start', 'end'].forEach(prefix => {
        const hInput = document.getElementById(`${prefix}-h`);
        if (hInput) {
            hInput.setAttribute('max', maxHour);
            hInput.setAttribute('min', minHour);
        }
    });
}

function setTimeInputs(startStr, endStr) {
    // startStr/endStr are always 24h "HH:mm" from internal data
    const parse = (str) => {
        let [h, m] = str.split(':').map(Number);

        if (state.use24h) {
            return { h, m, suffix: null };
        } else {
            const suffix = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return { h, m, suffix };
        }
    };

    const s = parse(startStr);
    document.getElementById('start-h').value = s.h.toString().padStart(2, '0');
    document.getElementById('start-m').value = s.m.toString().padStart(2, '0');
    if (s.suffix) document.getElementById('start-ampm').value = s.suffix;

    const e = parse(endStr);
    document.getElementById('end-h').value = e.h.toString().padStart(2, '0');
    document.getElementById('end-m').value = e.m.toString().padStart(2, '0');
    if (e.suffix) document.getElementById('end-ampm').value = e.suffix;
}

function getTimeInputValues() {
    const get24 = (prefix) => {
        let h = parseInt(document.getElementById(`${prefix}-h`).value, 10);
        const m = parseInt(document.getElementById(`${prefix}-m`).value, 10);

        if (isNaN(h) || isNaN(m)) return '';

        if (!state.use24h) {
            const suffix = document.getElementById(`${prefix}-ampm`).value;
            if (suffix === 'PM' && h < 12) h += 12;
            if (suffix === 'AM' && h === 12) h = 0;
        }

        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    return {
        start: get24('start'),
        end: get24('end')
    };
}

function openModal(existingEvent = null) {
    elements.modal.classList.remove('hidden');
    setTimeout(() => elements.modal.classList.add('visible'), 10);

    updateInputMode();

    let startVal = '09:00';
    let endVal = '10:00';
    let dayVal = '0';
    let titleVal = '';

    if (existingEvent) {
        currentEditingId = existingEvent.id;
        elements.modalTitle.textContent = 'Edit Entry';
        titleVal = existingEvent.title;
        dayVal = existingEvent.day;
        startVal = existingEvent.start;
        endVal = existingEvent.end;
        selectedColor = existingEvent.color;
        elements.btns.delete.classList.remove('hidden');
        elements.btns.duplicate.classList.remove('hidden');
    } else {
        currentEditingId = null;
        elements.modalTitle.textContent = 'New Entry';
        selectedColor = 'peacock';
        elements.btns.delete.classList.add('hidden');
        elements.btns.duplicate.classList.add('hidden');

        // Use hidden inputs as transfer state from grid clicks
        const hideStart = document.getElementById('event-start');
        const hideEnd = document.getElementById('event-end');
        if (hideStart && hideStart.value) startVal = hideStart.value;
        if (hideEnd && hideEnd.value) endVal = hideEnd.value;
        if (elements.form.day.value) dayVal = elements.form.day.value;
    }

    elements.form.title.value = titleVal;
    elements.form.day.value = dayVal;

    setTimeInputs(startVal, endVal);

    // Update color selection UI
    document.querySelectorAll('.color-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === selectedColor);
    });
}

function closeModal() {
    elements.modal.classList.remove('visible');
    setTimeout(() => elements.modal.classList.add('hidden'), 200);
    // Clear transfer state
    const hideStart = document.getElementById('event-start');
    const hideEnd = document.getElementById('event-end');
    if (hideStart) hideStart.value = '';
    if (hideEnd) hideEnd.value = '';

    // Clear validation errors and duplicate state
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.getElementById('duplicate-hint').classList.add('hidden');
    document.getElementById('event-day').classList.remove('day-highlight');
}

function overlaps(a, b) {
    const aStart = getDecimalHour(a.start);
    let aEnd = getDecimalHour(a.end);
    if (aEnd === 0 && aStart > 0) aEnd = 24;
    const bStart = getDecimalHour(b.start);
    let bEnd = getDecimalHour(b.end);
    if (bEnd === 0 && bStart > 0) bEnd = 24;
    return !(aEnd <= bStart || aStart >= bEnd);
}

function computeLayout(dayEvents) {
    const sorted = [...dayEvents].sort((a, b) => getDecimalHour(a.start) - getDecimalHour(b.start));
    const colMap = new Map();

    // Step 1: greedy column index assignment
    sorted.forEach(ev => {
        const occupied = new Set();
        colMap.forEach((col, id) => {
            const other = dayEvents.find(e => e.id === id);
            if (other && overlaps(ev, other)) occupied.add(col);
        });
        let col = 0;
        while (occupied.has(col)) col++;
        colMap.set(ev.id, col);
    });

    // Step 2: for each event, numCols = highest column index in its overlap group + 1
    const numColsMap = new Map();
    dayEvents.forEach(ev => {
        let maxCol = colMap.get(ev.id);
        dayEvents.forEach(other => {
            if (other.id !== ev.id && overlaps(ev, other)) {
                maxCol = Math.max(maxCol, colMap.get(other.id));
            }
        });
        numColsMap.set(ev.id, maxCol + 1);
    });

    return { colMap, numColsMap };
}

function handleGridClick(e, dayIndex) {
    if (e.target.closest('.event-card')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const clickedH = state.viewStart + (offsetY / CONFIG.slotHeight);

    // Snap to nearest full hour
    const h = Math.round(clickedH);
    const clampedH = Math.max(state.viewStart, Math.min(h, state.viewEnd - 1));

    const startStr = `${clampedH.toString().padStart(2, '0')}:00`;
    const endStr = `${(clampedH + 1).toString().padStart(2, '0')}:00`;

    const hideStart = document.getElementById('event-start');
    const hideEnd = document.getElementById('event-end');
    if (hideStart) hideStart.value = startStr;
    if (hideEnd) hideEnd.value = endStr;

    elements.form.day.value = dayIndex;

    openModal();
}

function setupEventListeners() {
    // Clear errors on interaction
    const timeInputs = [
        'start-h', 'start-m', 'start-ampm',
        'end-h', 'end-m', 'end-ampm'
    ];
    timeInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                el.classList.remove('input-error');
                const errMsg = document.getElementById('time-error-msg');
                if (errMsg) errMsg.classList.add('hidden');
            });
            el.addEventListener('focus', () => {
                el.classList.remove('input-error');
                const errMsg = document.getElementById('time-error-msg');
                if (errMsg) errMsg.classList.add('hidden');
            });
        }
    });

    elements.btns.cancel.addEventListener('click', closeModal);
    elements.btns.close.addEventListener('click', closeModal);
    elements.btns.add.addEventListener('click', () => {
        elements.form.day.value = '0';
        openModal();
    });

    elements.btns.save.addEventListener('click', () => {
        const title = elements.form.title.value;
        const day = parseInt(elements.form.day.value);

        const times = getTimeInputValues();
        const start = times.start;
        const end = times.end;
        const color = selectedColor;

        if (!start || !end) return;

        // Validation: End > Start
        const startH = getDecimalHour(start);
        let endH = getDecimalHour(end);

        // Handle midnight end
        if (endH === 0 && startH > 0) {
            endH = 24;
        }

        // Validation: end must be after start
        if (endH <= startH) {
            ['end-h', 'end-m', 'end-ampm'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('input-error');
            });
            const errMsg = document.getElementById('time-error-msg');
            if (errMsg) { errMsg.textContent = 'The end time must be after the start time.'; errMsg.classList.remove('hidden'); }
            return;
        }

        // Clear any residual errors
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

        if (currentEditingId) {
            // Update
            const idx = state.events.findIndex(e => e.id === currentEditingId);
            if (idx !== -1) {
                state.events[idx] = { ...state.events[idx], title, day, start, end, color };
            }
        } else {
            // Create
            const newEvent = {
                id: Date.now().toString(),
                title, day, start, end, color
            };
            state.events.push(newEvent);
        }

        saveData();
        closeModal();
    });

    elements.btns.duplicate.addEventListener('click', () => {
        if (!currentEditingId) return;
        currentEditingId = null;
        elements.modalTitle.textContent = 'Duplicate Entry';
        elements.btns.delete.classList.add('hidden');
        elements.btns.duplicate.classList.add('hidden');
        document.getElementById('duplicate-hint').classList.remove('hidden');
        document.getElementById('event-day').classList.add('day-highlight');
        document.getElementById('event-day').focus();
    });

    elements.btns.delete.addEventListener('click', () => {
        if (!currentEditingId) return;
        // Direct delete for Notion compatibility
        state.events = state.events.filter(e => e.id !== currentEditingId);
        saveData();
        closeModal();
    });

    elements.toggle.addEventListener('change', (e) => {
        // Capture current values before switching
        let currentStart = '09:00';
        let currentEnd = '10:00';

        if (elements.modal.classList.contains('visible')) {
            const t = getTimeInputValues();
            if (t.start && t.end) {
                currentStart = t.start;
                currentEnd = t.end;
            }
        }

        state.use24h = !e.target.checked;
        updateBodyClass();
        saveData();

        if (elements.modal.classList.contains('visible')) {
            updateInputMode();
            setTimeInputs(currentStart, currentEnd);
        }
    });
}

// Run
init();
