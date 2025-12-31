const CONFIG = {
    slotHeight: 60, // pixels per hour
    defaultStart: 8,
    defaultEnd: 18,
    colors: [
        { id: 'blue', bg: '#E1F5FE', border: '#0288D1' },
        { id: 'green', bg: '#E8F5E9', border: '#388E3C' },
        { id: 'rose', bg: '#FCE4EC', border: '#D81B60' },
        { id: 'purple', bg: '#F3E5F5', border: '#7B1FA2' },
        { id: 'orange', bg: '#FFF0EB', border: '#FF8B66' },
        { id: 'grey', bg: '#F5F5F5', border: '#616161' }
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
        start: document.getElementById('event-start'),
        end: document.getElementById('event-end'),
        colorContainer: document.getElementById('color-options')
    },
    btns: {
        save: document.getElementById('save-btn'),
        cancel: document.getElementById('cancel-btn'),
        delete: document.getElementById('delete-btn'),
        close: document.getElementById('close-modal'),
        add: document.getElementById('add-event-btn')
    },
    toggle: document.getElementById('time-format-toggle')
};

let currentEditingId = null;
let selectedColor = CONFIG.colors[0].id;

// Initialization
function init() {
    loadData();
    renderColorOptions();
    calculateViewRange();
    renderGrid();
    setupEventListeners();

    // Set toggle state
    elements.toggle.checked = !state.use24h;
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

    state.events.forEach(ev => {
        const startH = getDecimalHour(ev.start);
        const endH = getDecimalHour(ev.end);
        if (startH < min) min = Math.floor(startH);
        if (endH > max) max = Math.ceil(endH);
    });

    state.viewStart = min;
    state.viewEnd = max;
}

function renderGrid() {
    // Clear
    elements.timeColumn.innerHTML = '';
    elements.daysGrid.innerHTML = '';

    // Corner Spacer
    const cornerSpacer = document.createElement('div');
    cornerSpacer.className = 'time-corner-spacer';
    elements.timeColumn.appendChild(cornerSpacer);

    // Render Time Column
    // We render labels for each hour from viewStart to viewEnd
    // If viewStart is 8, first label is 08:00
    // Last label is viewEnd.
    for (let h = state.viewStart; h <= state.viewEnd; h++) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time-slot';
        if (h === state.viewEnd) timeDiv.classList.add('last-slot');
        timeDiv.textContent = formatTimeDisplay(h);
        elements.timeColumn.appendChild(timeDiv);
    }

    // Render Days
    const totalHours = state.viewEnd - state.viewStart;
    DAYS.forEach((dayName, dayIndex) => {
        const col = document.createElement('div');
        col.className = 'day-column';

        // Header
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = dayName;
        col.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'day-body';
        // Height not strictly needed if we obey content flow, but good for scroll consistency
        // body.style.height = (totalHours * CONFIG.slotHeight) + 'px'; // Let cells dictate height
        body.dataset.dayIndex = dayIndex;

        // Render Physical Cells
        for (let i = 0; i < totalHours; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            body.appendChild(cell);
        }

        // Click to add (using bubbling from cells works, or body click)
        body.addEventListener('click', (e) => handleGridClick(e, dayIndex));

        // Render Events for this day
        const dayEvents = state.events.filter(e => e.day == dayIndex);
        dayEvents.forEach(ev => {
            const evEl = createEventElement(ev);
            body.appendChild(evEl);
        });

        col.appendChild(body);
        elements.daysGrid.appendChild(col);
    });
}

function createEventElement(ev) {
    const el = document.createElement('div');
    el.className = `event-card ${ev.color}`;

    const startH = getDecimalHour(ev.start);
    const endH = getDecimalHour(ev.end);
    const duration = endH - startH;

    // Top relative to viewStart
    const top = (startH - state.viewStart) * CONFIG.slotHeight;
    const height = duration * CONFIG.slotHeight;

    el.style.top = `${top}px`;
    el.style.height = `${height}px`;

    // Content
    el.innerHTML = `
        <strong>${ev.title || 'Untitled'}</strong>
        <span style="font-weight: 400; font-size: 11px; margin-top: 2px;">
            ${formatTimeRange(ev.start, ev.end)}
        </span>
    `;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(ev);
    });

    return el;
}

// Helpers
function getDecimalHour(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
}

function formatTimeDisplay(hour) {
    // Check if hour is integer
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const mStr = m < 10 ? '0' + m : m;

    if (state.use24h) {
        return `${h}:${mStr}`;
    } else {
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${mStr} ${suffix}`;
    }
}

function formatTimeRange(start, end) {
    // Simple formatter for event card
    return `${start} - ${end}`;
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

function openModal(existingEvent = null) {
    elements.modal.classList.remove('hidden');
    // Trigger reflow for transition
    setTimeout(() => elements.modal.classList.add('visible'), 10);

    if (existingEvent) {
        currentEditingId = existingEvent.id;
        elements.modalTitle.textContent = 'Edit Event';
        elements.form.title.value = existingEvent.title;
        elements.form.day.value = existingEvent.day;
        elements.form.start.value = existingEvent.start;
        elements.form.end.value = existingEvent.end;
        selectedColor = existingEvent.color;
        elements.btns.delete.classList.remove('hidden');
    } else {
        currentEditingId = null;
        elements.modalTitle.textContent = 'New Event';
        elements.form.title.value = '';
        // Day/Time might be pre-filled by quick add, otherwise default
        if (!elements.form.start.value) elements.form.start.value = '09:00';
        if (!elements.form.end.value) elements.form.end.value = '10:00';
        selectedColor = CONFIG.colors[0].id;
        elements.btns.delete.classList.add('hidden');
    }

    // Update color selection UI
    document.querySelectorAll('.color-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === selectedColor);
    });
}

function closeModal() {
    elements.modal.classList.remove('visible');
    setTimeout(() => elements.modal.classList.add('hidden'), 200);
    // Reset form mostly handled in open
}

function handleGridClick(e, dayIndex) {
    if (e.target.classList.contains('event-card')) return;

    // Calculate clicked time
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top; // pixels from top of day-body
    const clickedH = state.viewStart + (offsetY / CONFIG.slotHeight);

    // Round to nearest 30 mins
    const h = Math.floor(clickedH);
    const m = Math.floor((clickedH - h) * 60);

    // Round m to 0 or 30
    const mRounded = m < 30 ? 0 : 30;

    const startStr = `${h.toString().padStart(2, '0')}:${mRounded.toString().padStart(2, '0')}`;
    // End logic: +1 hour
    const endH = h + 1;
    const endStr = `${endH.toString().padStart(2, '0')}:${mRounded.toString().padStart(2, '0')}`;

    elements.form.day.value = dayIndex;
    elements.form.start.value = startStr;
    elements.form.end.value = endStr;

    openModal();
}

function setupEventListeners() {
    elements.btns.cancel.addEventListener('click', closeModal);
    elements.btns.close.addEventListener('click', closeModal);
    elements.btns.add.addEventListener('click', () => openModal());

    elements.btns.save.addEventListener('click', () => {
        const title = elements.form.title.value;
        const day = parseInt(elements.form.day.value);
        const start = elements.form.start.value;
        const end = elements.form.end.value;
        const color = selectedColor;

        if (!start || !end) return alert('Time is required');

        // Validation: End > Start
        const startH = getDecimalHour(start);
        const endH = getDecimalHour(end);

        if (endH <= startH) {
            return alert('Error: The end time must be after the start time.');
        }

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

    elements.btns.delete.addEventListener('click', () => {
        if (!currentEditingId) return;
        if (confirm('Delete this event?')) {
            state.events = state.events.filter(e => e.id !== currentEditingId);
            saveData();
            closeModal();
        }
    });

    elements.toggle.addEventListener('change', (e) => {
        state.use24h = !e.target.checked; // If checked, it means AM/PM mode usually or toggle right
        // Label says 24h [toggle] AM/PM. 
        // If unchecked (left) -> 24h.
        // If checked (right) -> AM/PM.
        // My init: checked = !state.use24h.
        // So if use24h is true, checked is false. Correct.
        saveData(); // saves pref
    });
}

// Run
init();
