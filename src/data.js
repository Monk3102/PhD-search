import { App } from './app.js';
import { Drawer } from './views.js';

export const Config = {
  storageKeyTracker: 'phdmap.tracker.v1',
  storageKeyTheme: 'phdmap.theme',
  storageKeyNotes: 'phdmap.notes.v1',
  storageKeyCustom: 'phdmap.custom.v1',
  accounts: [
    { id: 'naman', name: 'Naman', color: '#2563eb' },
    { id: 'peehu', name: 'Peehu', color: '#9333ea' },
  ],
  trackerKey: (acc) => `${Config.storageKeyTracker}.${acc}`,
  notesKey: (acc) => `${Config.storageKeyNotes}.${acc}`,
  dataUrl: './data.json',
  detailUrl: './detail.json',
  stages: [
    { key: 'saved', label: 'Considering', color: '#9333ea' },
    { key: 'emailed', label: 'Contacted', color: '#2563eb' },
    { key: 'replied', label: 'In Discussion', color: '#0284c7' },
    { key: 'interview', label: 'Interview', color: '#d97706' },
    { key: 'offer', label: 'Offer', color: '#16a34a' },
    { key: 'declined', label: 'Declined', color: '#dc2626' },
  ],
  markerColors: { openings: '#ea580c', universities: '#2563eb', supervisors: '#16a34a' },
  mapLayers: {
    street: {
      base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attr: 'Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, METI, OpenStreetMap contributors',
    },
    satellite: {
      base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      overlay: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attr: 'Esri, Maxar, Earthstar Geographics',
    },
  },
};

export const TYPE_LABEL = {
  openings: 'Opening',
  universities: 'University',
  supervisors: 'Supervisor',
};

export const Celebrate = {
  run() {
    const banner = document.createElement('div');
    banner.className = 'celebrate-banner';
    banner.textContent = '🎉 Congratulations on the offer!';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3200);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:3000';
    const dpr = window.devicePixelRatio || 1;
    const W = innerWidth;
    const H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15', '#14b8a6'];
    const bits = Array.from({ length: 170 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(now) {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = t > 2600 ? Math.max(0, 1 - (t - 2600) / 600) : 1;
      bits.forEach((b) => {
        b.vy += 0.35;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      if (t < 3200) requestAnimationFrame(frame);
      else cv.remove();
    })(t0);
  },
};

export const Utils = {
  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Whole days from today (local) to a YYYY-MM-DD deadline; negative if passed
  daysLeft(deadline) {
    const t = new Date();
    const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((Date.parse(deadline) - today) / 86400000);
  },

  daysLeftText(deadline) {
    const n = this.daysLeft(deadline);
    if (isNaN(n)) return '';
    if (n < 0) return 'closed';
    if (n === 0) return 'today';
    return n === 1 ? '1 day left' : `${n} days left`;
  },

  getUniversity(record) {
    if (!record) return null;
    if (record._t === 'universities') return record;
    return Store.uniById.get(record.universityId) || null;
  },

  isNew(record) {
    if (!record?.newUntil) return false;
    const until = Date.parse(record.newUntil);
    return !isNaN(until) && Date.now() < until;
  },
};

export const Store = {
  dataset: { openings: [], universities: [], supervisors: [] },
  uniById: new Map(),
  supByUni: new Map(),
  byId: new Map(),
  tracker: {},
  notes: {},
  activeAccount: null,

  readAccountData(accId) {
    let tracker = {};
    let notes = {};
    try {
      tracker = JSON.parse(localStorage.getItem(Config.trackerKey(accId))) || {};
    } catch (e) {
      tracker = {};
    }
    try {
      notes = JSON.parse(localStorage.getItem(Config.notesKey(accId))) || {};
    } catch (e) {
      notes = {};
    }
    return { tracker, notes };
  },

  getAccountStats(accId) {
    const { tracker, notes } = this.readAccountData(accId);
    const trackedCount = Object.values(tracker).filter((e) => e && e.status && e.status !== 'none').length;
    const notesCount = Object.values(notes).filter((n) => n && n.text && n.text.trim()).length;
    return { trackedCount, notesCount };
  },

  setAccount(accId) {
    this.activeAccount = accId;
    const { tracker, notes } = this.readAccountData(accId);
    this.tracker = tracker;
    this.notes = notes;
  },

  // Notes are kept per record id within the active local account
  setNote(id, text) {
    if (!this.activeAccount) return;
    if (text.trim()) this.notes[id] = { text, updatedAt: new Date().toISOString() };
    else delete this.notes[id];
    try {
      localStorage.setItem(Config.notesKey(this.activeAccount), JSON.stringify(this.notes));
    } catch (e) {
      console.warn('Notes save failed', e);
    }
  },

  saveTracker() {
    if (!this.activeAccount) return;
    try {
      localStorage.setItem(Config.trackerKey(this.activeAccount), JSON.stringify(this.tracker));
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  },

  updateStage(id, status) {
    if (!this.activeAccount) return;
    const prev = this.tracker[id]?.status;
    if (!status || status === 'none') delete this.tracker[id];
    else this.tracker[id] = { ...(this.tracker[id] || {}), status, updatedAt: new Date().toISOString() };
    this.saveTracker();
    App.renderTracker();
    App.updateCounts();
    App.refreshCards();
    if (Drawer.currentRecord && Drawer.currentRecord.id === id) Drawer.render(Drawer.currentRecord);
    if (status === 'offer' && prev !== 'offer') Celebrate.run();
  },

  // One-time lookups so filtering/searching never scans arrays
  buildIndexes() {
    const d = this.dataset;
    const dict = d.subfieldDict || [];
    this.uniById = new Map(d.universities.map((u) => [u.id, u]));
    this.supByUni = new Map();
    this.byId = new Map();
    ['universities', 'supervisors', 'openings'].forEach((k) =>
      d[k].forEach((r) => {
        r._t = k; // explicit record type
        if (r.subfields) r.subfields = r.subfields.map((i) => dict[i]); // data.json stores subfields as dictionary indexes
        this.byId.set(r.id, r);
      })
    );
    d.supervisors.forEach((sp) => {
      if (!this.supByUni.has(sp.universityId)) this.supByUni.set(sp.universityId, []);
      this.supByUni.get(sp.universityId).push(sp);
    });
  },

  // Search text is built on first search, not at load
  hay(r) {
    if (r._hay === undefined) {
      const uni = Utils.getUniversity(r);
      r._hay = [
        r.title,
        r.name,
        r.group,
        uni?.name,
        uni?.city,
        uni?.country,
        ...(r.subfields || []),
        r.researchWork?.description,
        r.researchWork?.summary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    }
    return r._hay;
  },

  // User-added entries (persisted in this browser)
  loadCustom() {
    try {
      return JSON.parse(localStorage.getItem(Config.storageKeyCustom)) || [];
    } catch (e) {
      return [];
    }
  },

  saveCustom() {
    const clean = ['universities', 'supervisors', 'openings'].flatMap((k) =>
      this.dataset[k]
        .filter((r) => r.custom)
        .map((r) => ({ ...Object.fromEntries(Object.entries(r).filter(([f]) => f[0] !== '_')), kind: k }))
    );
    try {
      localStorage.setItem(Config.storageKeyCustom, JSON.stringify(clean));
    } catch (e) {
      console.warn('Custom save failed', e);
    }
    return clean;
  },

  addRecords(list) {
    list.forEach((r) => {
      const k = r._t || r.type;
      r._t = k;
      this.dataset[k].push(r);
      this.byId.set(r.id, r);
      if (k === 'universities') this.uniById.set(r.id, r);
      if (k === 'supervisors') {
        if (!this.supByUni.has(r.universityId)) this.supByUni.set(r.universityId, []);
        this.supByUni.get(r.universityId).push(r);
      }
    });
  },

  // Long research text lives in detail.json and loads after first paint
  async loadDetail() {
    try {
      const res = await fetch(Config.detailUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const det = await res.json();
      this.dataset.openings.forEach((r) => {
        if (det.o[r.id]) {
          r.researchWork = { description: det.o[r.id] };
          r._hay = undefined;
        }
      });
      this.dataset.supervisors.forEach((r) => {
        if (det.s[r.id]) {
          r.researchWork = { summary: det.s[r.id] };
          r._hay = undefined;
        }
      });
      return true;
    } catch (err) {
      console.warn('Detail load failed', err);
      return false;
    }
  },

  async fetchDataset() {
    try {
      const res = await fetch(Config.dataUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.dataset = await res.json();
      this.buildIndexes();
      this.addRecords(this.loadCustom().filter((r) => r.kind).map(({ kind, ...r }) => ({ ...r, _t: kind })));
      return true;
    } catch (err) {
      console.error('Failed to load ' + Config.dataUrl, err);
      return false;
    }
  },
};
