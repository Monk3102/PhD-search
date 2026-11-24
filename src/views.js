import { Config, TYPE_LABEL, Store, Utils } from './data.js';
import { App } from './app.js';
import { CalendarUI } from './calendar.ts';

export const MapModule = {
  map: null,
  markerLayer: null,
  baseTile: null,
  overlayTile: null,
  markerById: new Map(),
  selected: null,

  init() {
    this.map = L.map('map', { center: [50.8, 11.5], zoom: 4, minZoom: 3, maxZoom: 18, preferCanvas: true });
    this.setLayer('street');
    this.markerLayer = L.layerGroup().addTo(this.map);

    document.querySelectorAll('.map-style-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-style-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.setLayer(btn.dataset.style);
      });
    });
  },

  setLayer(style) {
    const cfg = Config.mapLayers[style];
    if (!cfg) return;
    if (this.baseTile) this.map.removeLayer(this.baseTile);
    if (this.overlayTile) this.map.removeLayer(this.overlayTile);
    this.baseTile = L.tileLayer(cfg.base, { maxZoom: 19, attribution: cfg.attr }).addTo(this.map);
    this.overlayTile = cfg.overlay ? L.tileLayer(cfg.overlay, { maxZoom: 19 }).addTo(this.map) : null;
  },

  renderMarkers(records, tab) {
    this.markerLayer.clearLayers();
    this.markerById.clear();
    this.selected = null;
    const fillColor = Config.markerColors[tab] || '#2563eb';
    const groups = {};

    records.forEach((r) => {
      const uni = Utils.getUniversity(r);
      if (!uni || uni.lat == null || uni.lng == null) return;
      const key = `${uni.lat.toFixed(4)},${uni.lng.toFixed(4)}`;
      (groups[key] = groups[key] || { lat: uni.lat, lng: uni.lng, uni, items: [] }).items.push(r);
    });

    Object.values(groups).forEach((g) => {
      const marker = L.circleMarker([g.lat, g.lng], {
        radius: Math.min(16, 7 + Math.log2(g.items.length + 1) * 3),
        fillColor,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });
      const items = g.items;
      const popupMax = Math.min(300, Math.max(200, window.innerWidth - 48));
      marker.bindPopup(() => this.buildPopup(g, tab), {
        minWidth: Math.min(210, popupMax),
        maxWidth: popupMax,
      });
      marker.on('click', () => {
        if (items.length === 1) Drawer.open(items[0]);
      });
      items.forEach((item) => this.markerById.set(item.id, marker));
      marker.addTo(this.markerLayer);
    });
  },

  buildPopup(g, tab) {
    const nameOf = (r) => r.title || r.name || '';
    const items = g.items.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const el = document.createElement('div');
    el.style.cssText = 'font-size:12px;line-height:1.4';
    el.innerHTML = `
      <strong style="font-size:13px;color:#0f172a">${Utils.escape(g.uni.name)}</strong>
      <div style="color:#64748b;font-size:11px">${g.uni.city ? Utils.escape(g.uni.city) + ', ' : ''}${Utils.escape(g.uni.country)}</div>
      <div style="margin-top:6px;font-weight:600;color:#1d4ed8">${items.length} ${tab.slice(0, -1)}${items.length === 1 ? '' : 's'} here${items.length > 1 ? ' · pick one:' : ''}</div>`;
    if (!(tab === 'universities' && items.length === 1)) {
      const list = document.createElement('div');
      list.className = 'pin-list';
      items.forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pin-item';
        b.textContent = (Utils.isNew(item) ? '✨ ' : '') + nameOf(item);
        b.addEventListener('click', () => Drawer.open(item));
        list.appendChild(b);
      });
      el.appendChild(list);
    }
    return el;
  },

  // Fly to the pin of a record and highlight it
  focus(record) {
    if (!this.map || App.activeTab === 'tracker') return;
    const uni = Utils.getUniversity(record);
    if (!uni || uni.lat == null || uni.lng == null) return;
    this.clearHighlight();
    const marker = this.markerById.get(record.id);
    if (marker) {
      marker.setStyle({ color: '#facc15', weight: 4 });
      marker.bringToFront();
      this.selected = marker;
    }
    this.map.flyTo([uni.lat, uni.lng], Math.max(this.map.getZoom(), 6), { duration: 0.6 });
  },

  clearHighlight() {
    if (this.selected) this.selected.setStyle({ color: '#ffffff', weight: 2 });
    this.selected = null;
  },
};

export const Drawer = {
  currentRecord: null,
  activeTab: 'overview',

  init() {
    const overlay = document.getElementById('drawer-overlay');
    document.getElementById('drawer-close-btn').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    document.getElementById('d-cal-btn').addEventListener('click', () => {
      if (this.currentRecord) CalendarUI.openForRecord(this.currentRecord);
    });
    document.getElementById('d-note-window-btn').addEventListener('click', () => {
      if (this.currentRecord) NoteWindow.open(this.currentRecord);
    });
    document.getElementById('d-remove-stage-btn').addEventListener('click', () => {
      if (this.currentRecord) Store.updateStage(this.currentRecord.id, 'none');
    });
    document.querySelectorAll('.drawer-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.drawer-nav-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.dtab;
        this.renderTabContent();
      });
    });
  },

  // Universities have no stored research block; build it from the supervisor list
  getResearch(r) {
    if (r._t !== 'universities') return r.researchWork;
    const sups = Store.supByUni.get(r.id) || [];
    return {
      researchAreas: r.subfields,
      groupsAndSupervisors: sups.map((sp) => ({
        name: sp.name,
        group: sp.group,
        summary: sp.researchWork?.summary || '',
      })),
    };
  },

  open(record) {
    this.currentRecord = record;
    this.activeTab = 'overview';
    document.querySelectorAll('.drawer-nav-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.dtab === 'overview')
    );
    this.render(record);
    document.getElementById('drawer-overlay').classList.add('open');
    MapModule.focus(record);
  },

  close() {
    document.getElementById('drawer-overlay').classList.remove('open');
    this.currentRecord = null;
    MapModule.clearHighlight();
  },

  render(record) {
    const uni = Utils.getUniversity(record);
    const isOpening = record._t === 'openings';
    const isSupervisor = record._t === 'supervisors';

    document.getElementById('d-type').textContent = isOpening
      ? 'PhD Opening'
      : isSupervisor
        ? 'Faculty Supervisor'
        : 'University / Institute';
    document.getElementById('d-title').textContent = record.title || record.name;
    document.getElementById('d-uni').textContent = uni
      ? `${uni.name} · ${uni.city || ''} ${uni.country}`
      : '';

    const applyBtn = document.getElementById('d-apply-btn');
    const portalUrl =
      record.applyUrl || record.staffPageUrl || record.phdProgramUrl || record.sourceUrl || record.url || uni?.url;
    if (portalUrl) {
      applyBtn.href = portalUrl;
      applyBtn.style.display = 'inline-flex';
    } else {
      applyBtn.style.display = 'none';
    }

    const entry = Store.tracker[record.id];
    const isTracked = !!(entry && entry.status && entry.status !== 'none');
    document.getElementById('d-remove-stage-btn').style.display = isTracked ? 'inline-flex' : 'none';
    document.getElementById('d-note-window-btn').style.display = isTracked ? 'inline-flex' : 'none';
    document.getElementById('d-open-gcal-btn').href = CalendarUI.calendarUrlForDate(
      record.deadline || entry?.follow || entry?.interviewDate
    );

    const rw = this.getResearch(record);
    const hasRw =
      rw && (rw.description || rw.summary || rw.researchAreas?.length || rw.groupsAndSupervisors?.length);
    document.getElementById('dtab-research-btn').style.display = hasRw ? 'inline-block' : 'none';

    this.updateNotesDot();
    this.renderTabContent();
  },

  updateNotesDot() {
    const r = this.currentRecord;
    document.getElementById('dtab-notes-btn').textContent = r && Store.notes[r.id] ? 'Notes •' : 'Notes';
  },

  renderTabContent() {
    const container = document.getElementById('drawer-body');
    const r = this.currentRecord;
    if (!r) return;
    const uni = Utils.getUniversity(r);
    const rw = this.getResearch(r);
    const entry = Store.tracker[r.id] || { status: 'none' };
    const esc = Utils.escape;

    if (this.activeTab === 'overview') {
      container.innerHTML = `
        <div class="section-card">
          <div class="section-title">Key Information</div>
          <div class="fact-grid">
            ${r.deadline ? `<div class="fact-label">Deadline</div><div style="font-weight:700;color:#fbbf24">${esc(r.deadline)} · ${Utils.daysLeftText(r.deadline)}</div>` : ''}
            ${r.deadlineNote ? `<div class="fact-label">Deadlines</div><div>${esc(r.deadlineNote)}</div>` : ''}
            ${r.group ? `<div class="fact-label">Group</div><div>${esc(r.group)}</div>` : ''}
            ${uni ? `<div class="fact-label">University</div><div>${esc(uni.name)}</div>` : ''}
            ${uni?.country ? `<div class="fact-label">Country</div><div>${esc(uni.country)}</div>` : ''}
            ${r.funding ? `<div class="fact-label">Funding</div><div>${esc(r.funding)}</div>` : ''}
            ${r.programType ? `<div class="fact-label">Program Type</div><div>${esc(r.programType)}</div>` : ''}
            ${r.takingStudents != null ? `<div class="fact-label">Students</div><div>${r.takingStudents ? '✅ Taking Students' : '❌ Not currently taking students'}</div>` : ''}
            ${Utils.isNew(r) ? `<div class="fact-label">Highlight</div><div><span class="tag new-badge">✨ NEW</span> <span style="color:#94a3b8;font-size:11px;margin-left:6px">Marked new until ${esc(new Date(r.newUntil).toLocaleString())}</span></div>` : ''}
            ${r.uncertain ? `<div class="fact-label">Note</div><div style="color:#fbbf24">⚠ Some details are unconfirmed. Check the source page.</div>` : ''}
          </div>
        </div>
        ${r.description ? `<div class="section-card"><div class="section-title">Project Overview</div><div class="body-text">${esc(r.description)}</div></div>` : ''}
        ${r.subfields?.length ? `<div class="section-card"><div class="section-title">Topics & Subfields</div><div class="tag-row">${r.subfields.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div></div>` : ''}`;
    } else if (this.activeTab === 'research') {
      container.innerHTML = `
        <div class="section-card">
          <div class="section-title">Department Research Overview</div>
          <div class="body-text">${esc(rw?.description || rw?.summary || 'Research work overview available on departmental portal.')}</div>
        </div>
        ${rw?.researchAreas?.length ? `<div class="section-card"><div class="section-title">Core Research Themes</div><div class="tag-row">${rw.researchAreas.map((a) => `<span class="tag" style="background:#172554;color:#93c5fd;border-color:#1e3a8a">${esc(a)}</span>`).join('')}</div></div>` : ''}
        ${rw?.groupsAndSupervisors?.length ? `
          <div class="section-card">
            <div class="section-title">Research Groups & Faculty Summaries</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${rw.groupsAndSupervisors.map((g) => `
                <div style="padding:8px;background:#090e1a;border-radius:6px;border:1px solid #223354">
                  <strong style="color:#60a5fa;font-size:12px">${esc(g.name || g.group)}</strong>
                  ${g.group ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${esc(g.group)}</div>` : ''}
                  <div style="font-size:11px;color:#94a3b8;margin-top:2px">${esc(g.summary || '')}</div>
                </div>`).join('')}
            </div>
          </div>` : ''}`;
    } else if (this.activeTab === 'notes') {
      const n = Store.notes[r.id];
      container.innerHTML = `
        <div class="section-card">
          <div class="section-title">My Notes</div>
          <textarea id="note-input" rows="16" placeholder="Emails sent, papers to read, questions to ask, impressions…" style="width:100%;resize:vertical;padding:8px;background:#090e1a;border:1px solid #223354;border-radius:6px;color:#fff;font:12px/1.5 var(--font-sans);outline:none">${esc(n?.text || '')}</textarea>
          <div id="note-status" style="margin-top:6px;font-size:10px;color:#94a3b8">${n ? 'Saved ' + esc(new Date(n.updatedAt).toLocaleString()) : 'Autosaves as you type'}</div>
        </div>`;
      const input = container.querySelector('#note-input');
      const status = container.querySelector('#note-status');
      let timer;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          Store.setNote(r.id, input.value);
          status.textContent = 'Saved ' + new Date().toLocaleTimeString();
          this.updateNotesDot();
          App.renderTracker();
          App.refreshCards();
        }, 400);
      });
    } else if (this.activeTab === 'tracker') {
      const dateInput = 'width:100%;padding:6px;background:#090e1a;border:1px solid #223354;border-radius:4px;color:#fff;font-size:12px';
      container.innerHTML = `
        <div class="section-card">
          <div class="section-title">Application Pipeline Stage</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${Config.stages.map((s) => {
              const on = entry.status === s.key;
              return `<button class="stage-btn" data-stage="${s.key}" style="padding:8px;border-radius:6px;font-size:11px;font-weight:600;text-align:left;cursor:pointer;border:1px solid ${on ? s.color : '#223354'};background:${on ? '#1e1b4b' : '#090e1a'};color:${on ? '#c084fc' : '#94a3b8'}">${s.label}</button>`;
            }).join('')}
          </div>
          ${entry.status && entry.status !== 'none' ? `
            <div style="margin-top:12px;display:flex;justify-content:flex-end">
              <button id="btn-drawer-clear" style="background:none;border:none;color:#f87171;font-size:11px;font-weight:600;cursor:pointer;text-decoration:underline">🗑 Clear and Remove from Pipeline</button>
            </div>` : ''}
        </div>
        <div class="section-card">
          <div class="section-title">Follow-up & Interview Dates</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:2px">Follow-up Due Date</label>
              <input type="date" id="input-follow" value="${esc(entry.follow || '')}" style="${dateInput}"></div>
            <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:2px">Interview Date</label>
              <input type="date" id="input-interview" value="${esc(entry.interviewDate || '')}" style="${dateInput}"></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" id="btn-drawer-add-cal" class="btn-drawer-cal">📅 Add Reminder to Google Calendar</button>
            <a href="${esc(CalendarUI.calendarUrlForDate(r.deadline || entry.follow || entry.interviewDate))}" target="_blank" rel="noopener noreferrer" class="btn-drawer-cal-link">📆 Open Google Calendar ↗</a>
          </div>
        </div>`;

      container.querySelector('#btn-drawer-add-cal').addEventListener('click', () => CalendarUI.openForRecord(r));

      container.querySelectorAll('.stage-btn').forEach((btn) => {
        btn.addEventListener('click', () => Store.updateStage(r.id, btn.dataset.stage));
      });
      const clearBtn = container.querySelector('#btn-drawer-clear');
      if (clearBtn) clearBtn.addEventListener('click', () => Store.updateStage(r.id, 'none'));

      const bindDate = (id, field) =>
        container.querySelector(id).addEventListener('change', (e) => {
          Store.tracker[r.id] = { ...(Store.tracker[r.id] || {}), [field]: e.target.value };
          Store.saveTracker();
          App.renderTracker();
        });
      bindDate('#input-follow', 'follow');
      bindDate('#input-interview', 'interviewDate');
    }
  },
};

export const AccountManager = {
  init() {
    const $ = (id) => document.getElementById(id);
    $('account-btn').addEventListener('click', () => this.open(true));
    $('account-modal-close').addEventListener('click', () => this.close());
    $('account-modal').addEventListener('click', (e) => {
      if (e.target === $('account-modal') && Store.activeAccount) this.close();
    });
  },

  open(allowClose = false) {
    const grid = document.getElementById('account-grid');
    grid.innerHTML = Config.accounts
      .map((acc) => {
        const stats = Store.getAccountStats(acc.id);
        const isActive = Store.activeAccount === acc.id;
        return `
        <button type="button" class="account-card${isActive ? ' active' : ''}" data-account="${acc.id}">
          <div class="account-avatar" style="background:${acc.color}">${acc.name[0]}</div>
          <div class="account-name">${Utils.escape(acc.name)}</div>
          <div class="account-stats">
            ${stats.trackedCount} tracked ${stats.trackedCount === 1 ? 'entity' : 'entities'}<br>
            ${stats.notesCount} saved ${stats.notesCount === 1 ? 'note' : 'notes'}
          </div>
        </button>`;
      })
      .join('');

    grid.querySelectorAll('.account-card').forEach((btn) => {
      btn.addEventListener('click', () => this.select(btn.dataset.account));
    });

    document.getElementById('account-modal-close').style.display =
      allowClose && Store.activeAccount ? 'inline-block' : 'none';
    document.getElementById('account-modal').classList.add('open');
  },

  close() {
    if (!Store.activeAccount) return;
    document.getElementById('account-modal').classList.remove('open');
  },

  select(accId) {
    const acc = Config.accounts.find((a) => a.id === accId);
    if (!acc) return;
    NoteWindow.close();
    Drawer.close();
    Store.setAccount(acc.id);
    document.getElementById('account-label').textContent = acc.name;
    document.querySelector('.account-dot').style.background = acc.color;
    this.close();
    if (App.dataLoaded) {
      App.updateCounts();
      App.refreshCards();
      App.renderTracker();
    }
  },
};

export const NoteWindow = {
  currentRecord: null,
  timer: null,

  init() {
    const $ = (id) => document.getElementById(id);
    const modal = $('note-modal');
    const input = $('nm-input');
    const status = $('nm-status');

    $('nm-close-x').addEventListener('click', () => this.close());
    $('nm-save-close').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) this.close();
    });

    input.addEventListener('input', () => {
      if (!this.currentRecord) return;
      clearTimeout(this.timer);
      status.textContent = 'Saving…';
      this.timer = setTimeout(() => this.persist(), 300);
    });

    $('nm-clear').addEventListener('click', () => {
      if (!this.currentRecord) return;
      clearTimeout(this.timer);
      input.value = '';
      this.persist();
      status.textContent = 'Note cleared';
    });

    $('nm-details').addEventListener('click', () => {
      const rec = this.currentRecord;
      this.close();
      if (rec) Drawer.open(rec);
    });
  },

  persist() {
    if (!this.currentRecord) return;
    const id = this.currentRecord.id;
    const text = document.getElementById('nm-input').value;
    Store.setNote(id, text);
    const savedNote = Store.notes[id];
    document.getElementById('nm-status').textContent = savedNote
      ? `Saved ${new Date(savedNote.updatedAt).toLocaleTimeString()}`
      : 'No note saved';
    App.renderTracker();
    App.refreshCards();
    if (Drawer.currentRecord && Drawer.currentRecord.id === id) {
      Drawer.updateNotesDot();
      if (Drawer.activeTab === 'notes') Drawer.renderTabContent();
    }
  },

  open(record) {
    if (!record) return;
    this.currentRecord = record;
    const $ = (id) => document.getElementById(id);
    const uni = Utils.getUniversity(record);
    const typeKey = record._t || 'openings';
    const typeBadge = $('nm-type');
    typeBadge.textContent = TYPE_LABEL[typeKey] || 'Entity';
    typeBadge.style.background = Config.markerColors[typeKey] || 'var(--primary)';

    $('nm-title').textContent = record.title || record.name || record.id;
    $('nm-sub').textContent = uni
      ? `${uni.name}${uni.city ? ' · ' + uni.city : ''}${uni.country ? ', ' + uni.country : ''}`
      : '';

    const stageKey = Store.tracker[record.id]?.status;
    const stage = Config.stages.find((s) => s.key === stageKey);
    $('nm-stage').textContent = stage ? `★ ${stage.label}` : 'Tracker';
    const acc = Config.accounts.find((a) => a.id === Store.activeAccount);
    $('nm-account').textContent = acc ? `Account: ${acc.name}` : '';

    const note = Store.notes[record.id];
    $('nm-input').value = note?.text || '';
    $('nm-status').textContent = note
      ? `Last saved ${new Date(note.updatedAt).toLocaleString()}`
      : 'Autosaves as you type';
    $('note-modal').classList.add('open');
    $('nm-input').focus();
  },

  close() {
    clearTimeout(this.timer);
    if (this.currentRecord) this.persist();
    this.currentRecord = null;
    document.getElementById('note-modal').classList.remove('open');
  },
};

export const Importer = {
  TYPES: {
    opening: 'openings',
    openings: 'openings',
    phd: 'openings',
    supervisor: 'supervisors',
    supervisors: 'supervisors',
    university: 'universities',
    universities: 'universities',
    uni: 'universities',
  },
  TEMPLATE: [
    {
      type: 'university',
      name: 'Example University',
      city: 'Example City',
      country: 'Germany',
      lat: 50.1,
      lng: 8.6,
      url: 'https://example.edu',
      funding: 'Fully funded',
      subfields: ['cosmology'],
    },
    {
      type: 'opening',
      title: 'PhD in Galaxy Evolution',
      university: 'Example University',
      deadline: '2026-12-31',
      funding: 'Fully funded',
      applyUrl: 'https://example.edu/apply',
      subfields: ['galaxies'],
      description: 'Short project description',
    },
    {
      type: 'supervisor',
      name: 'Jane Doe',
      university: 'Example University',
      group: 'Astrophysics Group',
      staffPageUrl: 'https://example.edu/jane',
      takingStudents: true,
      subfields: ['cosmology'],
      summary: 'Research summary',
    },
  ],

  slug: (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),

  parse(text) {
    const clean = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const data = JSON.parse(clean);
    return Array.isArray(data) ? data : [data];
  },

  // Returns { added: [], skipped: n, errors: [] }; universities are processed first so same-paste references resolve
  build(entries) {
    const out = { added: [], skipped: 0, errors: [] };
    const order = { universities: 0, supervisors: 1, openings: 1 };
    const items = entries.map((e, i) => ({ e, i, k: this.TYPES[String(e?.type || '').toLowerCase()] }));
    items.sort((a, b) => (order[a.k] ?? 9) - (order[b.k] ?? 9));
    const unis = new Map(Store.dataset.universities.map((u) => [u.name.toLowerCase(), u]));

    items.forEach(({ e, i, k }) => {
      const tag = `#${i + 1}`;
      if (!k) return out.errors.push(`${tag}: unknown or missing "type"`);
      const label = e.title || e.name;
      if (!label) return out.errors.push(`${tag}: missing ${k === 'openings' ? 'title' : 'name'}`);
      const r = { ...e, custom: true };
      delete r.type;
      delete r.university;
      if (typeof r.subfields === 'string') {
        r.subfields = r.subfields.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (k === 'universities') {
        r.lat = Number(r.lat);
        r.lng = Number(r.lng);
        if (!r.country || !isFinite(r.lat) || !isFinite(r.lng) || e.lat == null || e.lng == null) {
          return out.errors.push(`${tag}: university needs country, lat and lng`);
        }
        r.id = r.id || `uni-${this.slug(r.name)}`;
      } else {
        const u = r.universityId
          ? Store.uniById.get(r.universityId)
          : unis.get(String(e.university || '').toLowerCase());
        if (!u) {
          return out.errors.push(
            `${tag}: university "${e.university || r.universityId || ''}" not found; add it as a university entry first`
          );
        }
        r.universityId = u.id;
        r.id = r.id || `${k === 'openings' ? 'opn-' : 'sup-'}${this.slug(`${u.name}-${label}`)}`;
        const text = r.description || r.summary;
        delete r.description;
        delete r.summary;
        if (text) r.researchWork = k === 'openings' ? { description: text } : { summary: text };
        if (k === 'supervisors' && r.takingStudents != null) {
          r.takingStudents = r.takingStudents === true || r.takingStudents === 'true';
        }
      }
      if (Store.byId.has(r.id)) {
        out.skipped++;
        return;
      }
      r._t = k;
      Store.addRecords([r]);
      if (k === 'universities') unis.set(r.name.toLowerCase(), r);
      out.added.push(r);
    });
    return out;
  },

  run() {
    const msg = document.getElementById('import-msg');
    const show = (t, cls) => {
      msg.textContent = t;
      msg.className = cls || '';
    };
    let entries;
    try {
      entries = this.parse(document.getElementById('import-text').value);
    } catch (e) {
      return show(`Invalid JSON: ${e.message}`, 'err');
    }
    if (!entries.length) return show('Nothing to add.', 'err');
    const res = this.build(entries);
    if (res.added.length) {
      Store.saveCustom();
      App.populateDropdowns();
      App.updateCounts();
      App.applyFilters();
      if (App.activeTab === 'tracker') App.renderTracker();
    }
    const parts = [
      `Added ${res.added.length}`,
      res.skipped ? `skipped ${res.skipped} duplicate(s)` : '',
      res.errors.length ? `${res.errors.length} error(s)` : '',
    ].filter(Boolean);
    show(parts.join(' · ') + (res.errors.length ? `\n${res.errors.join('\n')}` : ''), res.errors.length ? 'err' : 'ok');
    if (!res.errors.length && res.added.length) document.getElementById('import-text').value = '';
  },

  init() {
    const $ = (id) => document.getElementById(id);
    const modal = $('import-modal');
    const toggle = (open) => modal.classList.toggle('open', open);
    $('add-btn').addEventListener('click', () => {
      $('import-msg').textContent = '';
      toggle(true);
      $('import-text').focus();
    });
    $('import-close').addEventListener('click', () => toggle(false));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) toggle(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') toggle(false);
    });
    $('import-run').addEventListener('click', () => this.run());
    $('import-template').addEventListener('click', () => {
      $('import-text').value = JSON.stringify(this.TEMPLATE, null, 2);
    });
    $('import-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(Store.saveCustom(), null, 2)], { type: 'application/json' }));
      a.download = 'my-entries.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('import-clear').addEventListener('click', () => {
      if (!confirm('Remove all entries you added? This reloads the page.')) return;
      try {
        localStorage.removeItem(Config.storageKeyCustom);
      } catch (e) {}
      location.reload();
    });
  },
};
