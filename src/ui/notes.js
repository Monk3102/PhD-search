import { Config, TYPE_LABEL } from '../config/constants.js';
import { Store } from '../state/store.js';
import { Utils } from '../utils/helpers.js';
import { App } from '../app.js';
import { Drawer } from './drawer.js';

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
