import { Config } from './config.js';
import { Celebrate, Utils } from './utils.js';
import { App } from './app.js';
import { Drawer } from './drawer.js';

export const Store = {
  dataset: { openings: [], universities: [], supervisors: [] },
  uniById: new Map(),
  supByUni: new Map(),
  byId: new Map(),
  tracker: {},
  notes: {},
  activeAccount: null,

  init() {
    this.tracker = {};
    this.notes = {};
  },

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
