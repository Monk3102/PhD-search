import { Config, TYPE_LABEL } from './config/constants.js';
import { Store } from './state/store.js';
import { Utils } from './utils/helpers.js';
import { MapModule } from './ui/map.js';
import { FilterEngine } from './ui/filters.js';
import { Drawer } from './ui/drawer.js';
import { NoteWindow } from './ui/notes.js';
import { CalendarUI } from './ui/calendar.js';
import { AccountManager } from './ui/accounts.js';
import { Importer } from './ui/importer.js';

export const App = {
  activeTab: 'openings',
  filteredRecords: [],
  rendered: 0,
  CARD_BATCH: 60,
  dataLoaded: false,

  async init() {
    const dataPromise = Store.fetchDataset(); // start download immediately, in parallel with setup
    Store.init();
    MapModule.init();
    FilterEngine.init();
    Drawer.init();
    NoteWindow.init();
    CalendarUI.init();
    AccountManager.init();
    Importer.init();
    this.initTheme();
    this.bindEvents();
    AccountManager.open(false);

    const ok = await dataPromise;
    if (!ok) {
      document.getElementById('results-count-label').textContent = 'Data failed to load';
      document.getElementById('cards-container').innerHTML =
        '<div class="empty-msg">Could not load data.json. Make sure it sits next to index.html.</div>';
      return;
    }
    this.dataLoaded = true;
    this.populateDropdowns();
    this.updateCounts();
    this.applyFilters();
    if (this.activeTab === 'tracker') this.renderTracker();
    (window.requestIdleCallback || setTimeout)(() =>
      Store.loadDetail().then((detailOk) => {
        if (!detailOk) return;
        if (FilterEngine.state.search) this.applyFilters();
        if (Drawer.currentRecord) Drawer.render(Drawer.currentRecord);
      })
    );
  },

  initTheme() {
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const dark = document.documentElement.classList.toggle('dark');
      try {
        localStorage.setItem(Config.storageKeyTheme, dark ? 'dark' : 'light');
      } catch (e) {}
    });
  },

  bindEvents() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.setTab(btn.dataset.tab);
      });
    });

    // One delegated listener for all result cards (notes & calendar triggers)
    document.getElementById('cards-container').addEventListener('click', (e) => {
      if (e.target.closest('.btn-cal-open')) {
        e.stopPropagation();
        return;
      }
      const noteBtn = e.target.closest('.btn-note-trigger');
      if (noteBtn) {
        e.stopPropagation();
        const record = Store.byId.get(noteBtn.dataset.noteId);
        if (record) NoteWindow.open(record);
        return;
      }
      const calBtn = e.target.closest('.btn-cal-trigger');
      if (calBtn) {
        e.stopPropagation();
        const record = Store.byId.get(calBtn.dataset.calId);
        if (record) CalendarUI.openForRecord(record);
        return;
      }
      const card = e.target.closest('.record-card');
      if (!card) return;
      const record = Store.byId.get(card.dataset.id);
      if (!record) return;
      Drawer.open(record);
    });

    // Cards are rendered in batches; the next batch is added when the list is scrolled near the end
    const cc = document.getElementById('cards-container');
    cc.addEventListener(
      'scroll',
      () => {
        if (cc.scrollTop + cc.clientHeight >= cc.scrollHeight - 600) this.appendCards();
      },
      { passive: true }
    );
  },

  setTab(tab) {
    this.activeTab = tab;
    const isTracker = tab === 'tracker';
    document.getElementById('explorer-view').style.display = isTracker ? 'none' : 'flex';
    document.getElementById('tracker-view').style.display = isTracker ? 'flex' : 'none';
    document.querySelector('.filter-bar').style.display = isTracker ? 'none' : 'flex';

    if (isTracker) this.renderTracker();
    else {
      this.applyFilters();
      requestAnimationFrame(() => MapModule.map.invalidateSize());
    }
  },

  populateDropdowns() {
    const { universities, openings, supervisors } = Store.dataset;
    const countrySelect = document.getElementById('country-select');
    const subfieldSelect = document.getElementById('subfield-select');
    const addOptions = (select, values) => {
      const keep = select.value;
      select.length = 1;
      const frag = document.createDocumentFragment();
      values.forEach((v) => {
        const o = document.createElement('option');
        o.value = o.textContent = v;
        frag.appendChild(o);
      });
      select.appendChild(frag);
      select.value = keep;
    };

    addOptions(countrySelect, [...new Set(universities.map((u) => u.country).filter(Boolean))].sort());

    const subfields = new Set();
    [universities, openings, supervisors].forEach((list) =>
      list.forEach((x) => (x.subfields || []).forEach((s) => subfields.add(s)))
    );
    addOptions(subfieldSelect, [...subfields].sort());
  },

  updateCounts() {
    const { openings, universities, supervisors } = Store.dataset;
    document.getElementById('count-openings').textContent = openings.length;
    document.getElementById('count-universities').textContent = universities.length;
    document.getElementById('count-supervisors').textContent = supervisors.length;
    document.getElementById('count-tracker').textContent = Object.values(Store.tracker).filter(
      (e) => e.status && e.status !== 'none'
    ).length;
  },

  applyFilters() {
    if (this.activeTab === 'tracker') return;
    const raw = Store.dataset[this.activeTab] || [];
    this.filteredRecords = FilterEngine.filterRecords(raw, this.activeTab);
    this.sortTrackedFirst();
    document.getElementById('results-count-label').textContent = `Showing ${this.filteredRecords.length} of ${raw.length} ${this.activeTab}`;
    this.renderCards(this.filteredRecords);
    MapModule.renderMarkers(this.filteredRecords, this.activeTab);
  },

  // Openings sort strictly ascending by deadline (then title); other tabs float tracked & new first
  sortTrackedFirst() {
    if (this.activeTab === 'openings') {
      this.filteredRecords.sort((a, b) => {
        const da = a.deadline || '9999-99-99';
        const db = b.deadline || '9999-99-99';
        if (da !== db) return da < db ? -1 : 1;
        return (a.title || a.name || '').localeCompare(b.title || b.name || '');
      });
      return;
    }
    const score = (r) => {
      const e = Store.tracker[r.id];
      const tracked = e && e.status && e.status !== 'none' ? 2 : 0;
      const isNew = Utils.isNew(r) ? 1 : 0;
      return tracked + isNew;
    };
    this.filteredRecords.sort((a, b) => score(b) - score(a));
  },

  refreshCards() {
    if (this.activeTab === 'tracker') return;
    this.sortTrackedFirst();
    this.renderCards(this.filteredRecords, Math.max(this.rendered, this.CARD_BATCH));
  },

  renderCards(records, count = this.CARD_BATCH) {
    const container = document.getElementById('cards-container');
    if (!records.length) {
      container.innerHTML = `<div class="empty-msg">No ${this.activeTab} found matching your filters.</div>`;
      return;
    }

    this.rendered = Math.min(count, records.length);
    container.innerHTML = records.slice(0, this.rendered).map((r) => this.cardHtml(r)).join('');
  },

  appendCards() {
    const recs = this.filteredRecords;
    if (this.rendered >= recs.length) return;
    const next = recs.slice(this.rendered, this.rendered + this.CARD_BATCH);
    this.rendered += next.length;
    document.getElementById('cards-container').insertAdjacentHTML('beforeend', next.map((r) => this.cardHtml(r)).join(''));
  },

  cardHtml(r) {
    const uni = Utils.getUniversity(r);
    const stageKey = Store.tracker[r.id]?.status;
    const stage = stageKey && stageKey !== 'none' ? Config.stages.find((s) => s.key === stageKey) : null;
    let deadline = '';
    if ('deadline' in r && r.deadline) {
      const n = Utils.daysLeft(r.deadline);
      const cls = n < 0 ? 'deadline-passed' : n <= 7 ? 'deadline-urgent' : 'deadline-open';
      deadline = `<span class="tag ${cls}">📅 ${Utils.escape(r.deadline)} · ${Utils.daysLeftText(r.deadline)}</span>`;
    }
    const isTracked = !!(stageKey && stageKey !== 'none');
    const stageBadge = isTracked ? `<span class="tag stage-badge">★ ${Utils.escape(stage ? stage.label : stageKey)}</span>` : '';
    const noteBtn = isTracked
      ? `<button type="button" class="btn-note-trigger" data-note-id="${Utils.escape(r.id)}">📝 ${Store.notes[r.id] ? 'Edit Note' : 'Add Note'}</button>`
      : '';
    const calBtn = `<button type="button" class="btn-cal-trigger" data-cal-id="${Utils.escape(r.id)}" title="Add last date or custom reminder to Google Calendar">📅 ${r.deadline ? 'Remind Last Date' : 'Add Reminder'}</button>`;
    const calOpenUrl = CalendarUI.calendarUrlForDate(
      r.deadline || Store.tracker[r.id]?.follow || Store.tracker[r.id]?.interviewDate
    );
    const calOpenBtn = `<a class="btn-cal-open" href="${Utils.escape(calOpenUrl)}" target="_blank" rel="noopener noreferrer" title="Open Google Calendar webpage or app">📆 ↗</a>`;
    const isNew = Utils.isNew(r);
    const newBadge = isNew ? '<span class="tag new-badge">✨ NEW</span>' : '';

    return `
      <div class="record-card${isNew ? ' is-new' : ''}" data-id="${Utils.escape(r.id)}">
        <div class="card-title">${Utils.escape(r.title || r.name)}</div>
        <div class="card-uni">🏛 ${uni ? Utils.escape(uni.name) : ''} · ${Utils.escape(uni?.country || '')}</div>
        <div class="tag-row">
          ${newBadge}${deadline}${stageBadge}${noteBtn}${calBtn}${calOpenBtn}
          ${(r.subfields || []).slice(0, 3).map((s) => `<span class="tag">${Utils.escape(s)}</span>`).join('')}
        </div>
      </div>`;
  },

  renderTracker() {
    if (this.activeTab !== 'tracker') return; // board is rebuilt when the tab is opened
    const board = document.getElementById('kanban-board');
    const tracked = Object.entries(Store.tracker)
      .filter(([, e]) => e.status && e.status !== 'none')
      .map(([id, entry]) => {
        const record = Store.byId.get(id) || { id, title: id };
        return { id, entry, record, uni: Utils.getUniversity(record) };
      });

    const countOf = (...keys) => tracked.filter((i) => keys.includes(i.entry.status)).length;
    document.getElementById('metric-total').textContent = tracked.length;
    document.getElementById('metric-contacted').textContent = countOf('emailed', 'replied');
    document.getElementById('metric-interviews').textContent = countOf('interview');
    document.getElementById('metric-offers').textContent = countOf('offer');

    board.innerHTML = Config.stages
      .map((stg) => {
        const items = tracked.filter((i) => i.entry.status === stg.key);
        return `
        <div class="kanban-col" data-stage="${stg.key}">
          <div class="kanban-col-head">
            <span style="color:${stg.color}">● ${stg.label}</span>
            <span style="font-family:var(--font-mono);color:var(--text-subtle)">${items.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${items
              .map(
                (i) => `
              <div class="kanban-card" draggable="true" data-id="${Utils.escape(i.id)}"${i.record._t ? ` data-type="${i.record._t}"` : ''}>
                ${i.record._t ? `<div class="kanban-type">${TYPE_LABEL[i.record._t]}</div>` : ''}
                <strong style="font-size:12px;line-height:1.3">${Utils.escape(i.record.title || i.record.name || i.id)}</strong>
                <div style="font-size:11px;color:var(--text-muted)">${i.uni ? Utils.escape(i.uni.name) : ''}</div>
                ${i.entry.follow ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--amber)">⏰ Follow: ${Utils.escape(i.entry.follow)}</div>` : ''}
                ${Store.notes[i.id] ? `<div class="kanban-note">📝 ${Utils.escape(Store.notes[i.id].text)}</div>` : ''}
                <div class="kanban-actions">
                  <button class="btn-kanban" data-action="details" data-id="${Utils.escape(i.id)}">Details</button>
                  <button class="btn-kanban btn-kanban-notes" data-action="notes" data-id="${Utils.escape(i.id)}" title="Open separate note-taking window">📝 ${Store.notes[i.id] ? 'Note •' : 'Notes'}</button>
                  <button class="btn-kanban btn-kanban-cal" data-action="calendar" data-id="${Utils.escape(i.id)}" title="Add reminder to Google Calendar">📅 Remind</button>
                  <a class="btn-kanban" href="${Utils.escape(CalendarUI.calendarUrlForDate(i.record.deadline || i.entry.follow || i.entry.interviewDate))}" target="_blank" rel="noopener noreferrer" title="Open Google Calendar webpage or app" style="text-decoration:none;color:var(--primary)">📆↗</a>
                  <button class="btn-kanban btn-remove-stage" data-action="remove" data-id="${Utils.escape(i.id)}" title="Remove from application stage">🗑</button>
                </div>
              </div>`
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('');

    board._tracked = tracked;
    if (!board._bound) {
      board._bound = true;
      const clearOver = () => board.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));

      board.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.kanban-card');
        if (!card) return;
        e.dataTransfer.setData('text/plain', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      board.addEventListener('dragend', (e) => {
        e.target.closest?.('.kanban-card')?.classList.remove('dragging');
        clearOver();
      });
      board.addEventListener('dragover', (e) => {
        const col = e.target.closest('.kanban-col');
        if (!col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!col.classList.contains('drag-over')) {
          clearOver();
          col.classList.add('drag-over');
        }
      });
      board.addEventListener('dragleave', (e) => {
        const col = e.target.closest('.kanban-col');
        if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
      });
      board.addEventListener('drop', (e) => {
        const col = e.target.closest('.kanban-col');
        if (!col) return;
        e.preventDefault();
        clearOver();
        const id = e.dataTransfer.getData('text/plain');
        const stage = col.dataset.stage;
        if (id && Store.tracker[id] && Store.tracker[id].status !== stage) Store.updateStage(id, stage);
      });
      board.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-kanban');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === 'remove') Store.updateStage(id, 'none');
        else if (btn.dataset.action === 'notes') {
          const item = board._tracked.find((i) => i.id === id);
          if (item) NoteWindow.open(item.record);
        } else if (btn.dataset.action === 'calendar') {
          const item = board._tracked.find((i) => i.id === id);
          if (item) CalendarUI.openForRecord(item.record);
        } else {
          const item = board._tracked.find((i) => i.id === id);
          if (item) Drawer.open(item.record);
        }
      });
    }
  },
};
