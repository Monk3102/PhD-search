import { Config, TYPE_LABEL } from './config.js';
import { Store } from './store.js';
import { Utils } from './utils.js';

export const CalendarConfirm = {
  resolver: null,

  init() {
    const modal = document.getElementById('cal-confirm-modal');
    document.getElementById('cc-cancel').addEventListener('click', () => this.resolve(false));
    document.getElementById('cc-confirm').addEventListener('click', () => this.resolve(true));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.resolve(false);
    });
  },

  ask({ title, description, summary, confirmLabel = 'Confirm', danger = false }) {
    document.getElementById('cc-title').textContent = title;
    document.getElementById('cc-desc').textContent = description;
    document.getElementById('cc-summary').textContent = summary;
    const btn = document.getElementById('cc-confirm');
    btn.textContent = confirmLabel;
    btn.style.background = danger ? 'var(--rose)' : 'var(--primary)';
    btn.style.borderColor = danger ? 'var(--rose)' : 'var(--primary)';
    document.getElementById('cal-confirm-modal').classList.add('open');
    return new Promise((res) => {
      this.resolver = res;
    });
  },

  resolve(val) {
    document.getElementById('cal-confirm-modal').classList.remove('open');
    if (this.resolver) {
      const fn = this.resolver;
      this.resolver = null;
      fn(val);
    }
  },
};

export const CalendarUI = {
  currentRecord: null,
  editingEventId: null,
  needsAuth: true,

  bridge() {
    return window.GoogleCalendarBridge || null;
  },

  init() {
    CalendarConfirm.init();
    const $ = (id) => document.getElementById(id);

    const handleSignIn = async () => {
      const b = this.bridge();
      if (!b) return;
      try {
        await b.googleSignIn();
        this.syncAuthUI();
        if (this.currentRecord && $('cal-modal').classList.contains('open')) {
          this.loadEntityEvents();
        }
      } catch (err) {
        const msg = err?.message || 'Google sign-in failed';
        if ($('cal-modal').classList.contains('open')) this.setMsg(msg, 'err');
      }
    };

    $('gcal-signin-btn').addEventListener('click', handleSignIn);
    $('cm-signin-btn').addEventListener('click', handleSignIn);
    $('gcal-connected-btn').addEventListener('click', () => this.openOverview());

    $('cm-close-x').addEventListener('click', () => this.closeModal());
    $('cm-close-btn').addEventListener('click', () => this.closeModal());
    $('cal-modal').addEventListener('click', (e) => {
      if (e.target === $('cal-modal')) this.closeModal();
    });
    $('cm-allday').addEventListener('change', () => this.toggleTimeFields());
    $('cm-date').addEventListener('change', () => this.syncOpenCalendarLink());
    $('cm-cancel-edit').addEventListener('click', () => this.resetFormToDefault());
    $('cm-submit-btn').addEventListener('click', () => this.handleSubmit());

    $('gco-close-x').addEventListener('click', () => $('gcal-overview-modal').classList.remove('open'));
    $('gco-close').addEventListener('click', () => $('gcal-overview-modal').classList.remove('open'));
    $('gcal-overview-modal').addEventListener('click', (e) => {
      if (e.target === $('gcal-overview-modal')) $('gcal-overview-modal').classList.remove('open');
    });
    $('gco-refresh').addEventListener('click', () => this.loadOverviewEvents());
    $('gco-signout').addEventListener('click', async () => {
      const b = this.bridge();
      if (!b) return;
      await b.logout();
      $('gcal-overview-modal').classList.remove('open');
      this.syncAuthUI();
    });

    window.addEventListener('phdmap:gcal-auth-changed', () => this.syncAuthUI());

    const bindBridgeAuth = () => {
      const b = this.bridge();
      if (!b) return;
      b.initAuth(
        () => {
          this.needsAuth = false;
          this.syncAuthUI();
        },
        () => {
          this.needsAuth = true;
          this.syncAuthUI();
        }
      );
      this.syncAuthUI();
    };
    if (this.bridge()) bindBridgeAuth();
    else window.addEventListener('load', bindBridgeAuth, { once: true });
  },

  calendarUrlForDate(yyyyMmDd) {
    if (yyyyMmDd && /^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
      const [y, m, d] = yyyyMmDd.split('-');
      return `https://calendar.google.com/calendar/r/day/${y}/${Number(m)}/${Number(d)}`;
    }
    return 'https://calendar.google.com';
  },

  syncOpenCalendarLink() {
    const el = document.getElementById('cm-open-gcal');
    if (el) el.href = this.calendarUrlForDate(document.getElementById('cm-date')?.value);
  },

  syncAuthUI() {
    const b = this.bridge();
    const signedIn = b ? b.isSignedIn() : false;
    this.needsAuth = !signedIn;
    document.getElementById('gcal-signin-btn').style.display = signedIn ? 'none' : 'inline-flex';
    document.getElementById('gcal-connected-btn').style.display = signedIn ? 'inline-flex' : 'none';
    const info = b?.getUserInfo();
    document.getElementById('gcal-user-label').textContent = info?.email || 'Google Calendar';
    document.getElementById('cm-auth-banner').style.display = signedIn ? 'none' : 'flex';
  },

  toggleTimeFields() {
    const allDay = document.getElementById('cm-allday').checked;
    document.getElementById('cm-time-wrap').style.display = allDay ? 'none' : 'flex';
    document.getElementById('cm-dur-wrap').style.display = allDay ? 'none' : 'flex';
  },

  setMsg(text, cls = '') {
    const el = document.getElementById('cm-msg');
    el.textContent = text;
    el.className = 'cal-msg' + (cls ? ' ' + cls : '');
  },

  buildDescription(record) {
    const uni = Utils.getUniversity(record);
    const portal =
      record.applyUrl || record.staffPageUrl || record.phdProgramUrl || record.sourceUrl || record.url || uni?.url || '';
    const note = Store.notes[record.id]?.text || '';
    return [
      `Entity: ${record.title || record.name || record.id} (${TYPE_LABEL[record._t] || 'Entity'})`,
      uni ? `Institution: ${uni.name}${uni.city ? ', ' + uni.city : ''}${uni.country ? ', ' + uni.country : ''}` : '',
      record.deadline ? `Application Last Date: ${record.deadline}` : '',
      portal ? `Portal: ${portal}` : '',
      note ? `\nMy Notes:\n${note}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },

  applyPreset(kind) {
    const r = this.currentRecord;
    if (!r) return;
    const $ = (id) => document.getElementById(id);
    const title = r.title || r.name || r.id;
    const entry = Store.tracker[r.id] || {};
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

    document.querySelectorAll('.cal-preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.preset === kind));

    if (kind === 'deadline' && r.deadline) {
      $('cm-summary').value = `Last Date: ${title}`;
      $('cm-date').value = r.deadline;
      $('cm-allday').checked = true;
      $('cm-remind-min').value = '1440';
      $('cm-remind-method').value = 'both';
    } else if (kind === 'followup') {
      $('cm-summary').value = `Follow up: ${title}`;
      $('cm-date').value = entry.follow || tomorrow;
      $('cm-allday').checked = false;
      $('cm-time').value = '09:00';
      $('cm-duration').value = '30';
      $('cm-remind-min').value = '30';
      $('cm-remind-method').value = 'popup';
    } else if (kind === 'interview') {
      $('cm-summary').value = `Interview: ${title}`;
      $('cm-date').value = entry.interviewDate || tomorrow;
      $('cm-allday').checked = false;
      $('cm-time').value = '10:00';
      $('cm-duration').value = '60';
      $('cm-remind-min').value = '60';
      $('cm-remind-method').value = 'both';
    } else {
      $('cm-summary').value = `Reminder: ${title}`;
      $('cm-date').value = r.deadline || entry.follow || tomorrow;
      $('cm-allday').checked = false;
      $('cm-time').value = '09:00';
      $('cm-duration').value = '30';
      $('cm-remind-min').value = '60';
      $('cm-remind-method').value = 'popup';
    }
    $('cm-desc').value = this.buildDescription(r);
    this.toggleTimeFields();
    this.syncOpenCalendarLink();
  },

  resetFormToDefault() {
    this.editingEventId = null;
    document.getElementById('cm-submit-btn').textContent = 'Save to Google Calendar';
    document.getElementById('cm-cancel-edit').style.display = 'none';
    const r = this.currentRecord;
    if (!r) return;
    if (r.deadline) this.applyPreset('deadline');
    else if (Store.tracker[r.id]?.follow) this.applyPreset('followup');
    else this.applyPreset('custom');
  },

  openForRecord(record) {
    if (!record) return;
    this.currentRecord = record;
    this.editingEventId = null;
    this.setMsg('');
    this.syncAuthUI();

    const $ = (id) => document.getElementById(id);
    const uni = Utils.getUniversity(record);
    const typeKey = record._t || 'openings';
    const badge = $('cm-type');
    badge.textContent = TYPE_LABEL[typeKey] || 'Entity';
    badge.style.background = Config.markerColors[typeKey] || 'var(--primary)';
    $('cm-title').textContent = record.title || record.name || record.id;
    $('cm-sub').textContent = uni
      ? `${uni.name}${uni.city ? ' · ' + uni.city : ''}${uni.country ? ', ' + uni.country : ''}`
      : '';

    const presets = [];
    if (record.deadline) presets.push({ id: 'deadline', label: `📅 Last Date (${record.deadline})` });
    presets.push({ id: 'followup', label: '⏰ Follow-up Reminder' });
    presets.push({ id: 'interview', label: '🎤 Interview / Meeting' });
    presets.push({ id: 'custom', label: '✨ Custom Reminder' });

    const presetEl = $('cm-presets');
    presetEl.innerHTML = presets
      .map((p) => `<button type="button" class="cal-preset-btn" data-preset="${p.id}">${Utils.escape(p.label)}</button>`)
      .join('');
    presetEl.querySelectorAll('.cal-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
    });

    this.resetFormToDefault();
    $('cal-modal').classList.add('open');
    this.loadEntityEvents();
  },

  closeModal() {
    document.getElementById('cal-modal').classList.remove('open');
    this.currentRecord = null;
    this.editingEventId = null;
  },

  formatEventWhen(ev) {
    if (ev.start?.date) return `${ev.start.date} (All-day)`;
    if (ev.start?.dateTime) return new Date(ev.start.dateTime).toLocaleString();
    return '';
  },

  async loadEntityEvents() {
    const listEl = document.getElementById('cm-events-list');
    const b = this.bridge();
    if (!b || !b.isSignedIn() || !this.currentRecord) {
      listEl.innerHTML =
        '<div style="font-size:12px;color:var(--text-subtle)">Sign in with Google above to view and manage saved Google Calendar reminders for this entity.</div>';
      return;
    }
    listEl.innerHTML = '<div style="font-size:12px;color:var(--text-subtle)">Loading calendar reminders…</div>';
    try {
      const items = await b.listEntityEvents(this.currentRecord.id);
      if (!items.length) {
        listEl.innerHTML =
          '<div style="font-size:12px;color:var(--text-subtle)">No Google Calendar reminders saved for this entity yet.</div>';
        return;
      }
      listEl.innerHTML = items
        .map(
          (ev) => `
        <div class="cal-event-item" data-ev-id="${Utils.escape(ev.id)}">
          <div class="cal-event-info">
            <div class="cal-event-title">${Utils.escape(ev.summary || '(Untitled)')}</div>
            <div class="cal-event-time">${Utils.escape(this.formatEventWhen(ev))}</div>
          </div>
          <div class="cal-event-btns">
            ${ev.htmlLink ? `<a class="btn-kanban" href="${Utils.escape(ev.htmlLink)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}
            <button type="button" class="btn-kanban" data-ev-action="edit" data-ev-id="${Utils.escape(ev.id)}">Edit</button>
            <button type="button" class="btn-kanban btn-remove-stage" data-ev-action="delete" data-ev-id="${Utils.escape(ev.id)}">Delete</button>
          </div>
        </div>`
        )
        .join('');

      listEl.querySelectorAll('[data-ev-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = items.find((x) => x.id === btn.dataset.evId);
          if (!ev) return;
          if (btn.dataset.evAction === 'edit') this.startEditEvent(ev);
          else if (btn.dataset.evAction === 'delete') this.confirmDeleteEvent(ev, () => this.loadEntityEvents());
        });
      });
    } catch (err) {
      this.syncAuthUI();
      listEl.innerHTML = `<div style="font-size:12px;color:var(--rose)">Could not load reminders: ${Utils.escape(err?.message || 'Error')}</div>`;
    }
  },

  startEditEvent(ev) {
    this.editingEventId = ev.id;
    document.getElementById('cm-summary').value = ev.summary || '';
    document.getElementById('cm-desc').value = ev.description || '';
    if (ev.start?.date) {
      document.getElementById('cm-allday').checked = true;
      document.getElementById('cm-date').value = ev.start.date;
    } else if (ev.start?.dateTime) {
      document.getElementById('cm-allday').checked = false;
      const dt = new Date(ev.start.dateTime);
      const pad = (n) => String(n).padStart(2, '0');
      document.getElementById('cm-date').value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      document.getElementById('cm-time').value = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
    this.toggleTimeFields();
    document.getElementById('cm-submit-btn').textContent = 'Update Google Calendar Event';
    document.getElementById('cm-cancel-edit').style.display = 'inline-flex';
  },

  async handleSubmit() {
    const b = this.bridge();
    if (!b) return;
    if (!b.isSignedIn()) {
      this.setMsg('Please sign in with Google first.', 'err');
      return;
    }
    const $ = (id) => document.getElementById(id);
    const summary = $('cm-summary').value.trim();
    const date = $('cm-date').value;
    if (!summary || !date) {
      this.setMsg('Please enter both a reminder title and date.', 'err');
      return;
    }
    const allDay = $('cm-allday').checked;
    const startTime = $('cm-time').value || '09:00';
    const durationMinutes = Number($('cm-duration').value || 30);
    const reminderMinutes = Number($('cm-remind-min').value || 1440);
    const reminderMethod = $('cm-remind-method').value || 'both';
    const description = $('cm-desc').value.trim();
    const uni = Utils.getUniversity(this.currentRecord);
    const location = uni ? [uni.name, uni.city, uni.country].filter(Boolean).join(', ') : '';

    const isUpdate = Boolean(this.editingEventId);
    const activePreset = document.querySelector('.cal-preset-btn.active')?.dataset.preset || 'custom';
    const ok = await CalendarConfirm.ask({
      title: isUpdate ? 'Update Google Calendar Event?' : 'Add Reminder to Google Calendar?',
      description: isUpdate
        ? 'This will modify the existing event in your primary Google Calendar.'
        : 'This will create a new event and reminder in your primary Google Calendar.',
      summary: `Title: ${summary}\nWhen: ${allDay ? `${date} (All-day)` : `${date} at ${startTime} (${durationMinutes} min)`}\nNotify: ${reminderMinutes >= 1440 ? `${reminderMinutes / 1440} day(s)` : `${reminderMinutes} min`} before (${reminderMethod})`,
      confirmLabel: isUpdate ? 'Update Event' : 'Add to Google Calendar',
    });
    if (!ok) return;

    const submitBtn = $('cm-submit-btn');
    submitBtn.disabled = true;
    this.setMsg(isUpdate ? 'Updating Google Calendar…' : 'Adding to Google Calendar…');
    try {
      const payload = {
        summary,
        description,
        location,
        date,
        allDay,
        startTime,
        durationMinutes,
        reminderMinutes,
        reminderMethod,
        entityId: this.currentRecord.id,
        entityType: this.currentRecord._t || 'openings',
        reminderKind: activePreset,
      };
      if (isUpdate) await b.updateCalendarEvent(this.editingEventId, payload);
      else await b.createCalendarEvent(payload);

      this.setMsg(isUpdate ? 'Google Calendar event updated!' : 'Reminder added to Google Calendar!', 'ok');
      this.resetFormToDefault();
      await this.loadEntityEvents();
    } catch (err) {
      this.syncAuthUI();
      this.setMsg(
        err?.message === 'AUTH_EXPIRED'
          ? 'Session expired — please sign in with Google again.'
          : err?.message || 'Failed to save calendar event.',
        'err'
      );
    } finally {
      submitBtn.disabled = false;
    }
  },

  async confirmDeleteEvent(ev, onDeleted) {
    const b = this.bridge();
    if (!b) return;
    const ok = await CalendarConfirm.ask({
      title: 'Delete Google Calendar Event?',
      description: 'Are you sure you want to permanently delete this event from your Google Calendar?',
      summary: `Event: ${ev.summary || '(Untitled)'}\nWhen: ${this.formatEventWhen(ev)}`,
      confirmLabel: 'Delete Event',
      danger: true,
    });
    if (!ok) return;
    try {
      await b.deleteCalendarEvent(ev.id);
      if (this.editingEventId === ev.id) this.resetFormToDefault();
      await onDeleted?.();
    } catch (err) {
      this.syncAuthUI();
      this.setMsg(err?.message || 'Failed to delete event.', 'err');
    }
  },

  openOverview() {
    const info = this.bridge()?.getUserInfo();
    document.getElementById('gco-user').textContent = info?.email
      ? `Signed in as ${info.email}`
      : 'Connected to Google Calendar';
    document.getElementById('gcal-overview-modal').classList.add('open');
    this.loadOverviewEvents();
  },

  async loadOverviewEvents() {
    const listEl = document.getElementById('gco-list');
    const msgEl = document.getElementById('gco-msg');
    msgEl.textContent = '';
    const b = this.bridge();
    if (!b || !b.isSignedIn()) {
      listEl.innerHTML =
        '<div style="font-size:12px;color:var(--text-subtle)">Sign in with Google to view your saved PhD Map reminders.</div>';
      return;
    }
    listEl.innerHTML = '<div style="font-size:12px;color:var(--text-subtle)">Loading reminders from Google Calendar…</div>';
    try {
      const items = await b.listAllPhdMapEvents();
      if (!items.length) {
        listEl.innerHTML =
          '<div style="font-size:12px;color:var(--text-subtle)">No PhD Map reminders on your Google Calendar yet. Click "📅 Remind Last Date" or "📅 Add Reminder" on any opening, university, or supervisor card.</div>';
        return;
      }
      listEl.innerHTML = items
        .map((ev) => {
          const entityId = ev.extendedProperties?.private?.phdMapEntityId;
          const rec = entityId ? Store.byId.get(entityId) : null;
          return `
          <div class="cal-event-item">
            <div class="cal-event-info">
              <div class="cal-event-title">${Utils.escape(ev.summary || '(Untitled)')}</div>
              <div class="cal-event-time">${Utils.escape(this.formatEventWhen(ev))}${rec ? ' · ' + Utils.escape(rec.title || rec.name) : ''}</div>
            </div>
            <div class="cal-event-btns">
              ${rec ? `<button type="button" class="btn-kanban" data-ov-open="${Utils.escape(rec.id)}">Entity</button>` : ''}
              ${ev.htmlLink ? `<a class="btn-kanban" href="${Utils.escape(ev.htmlLink)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}
              <button type="button" class="btn-kanban btn-remove-stage" data-ov-del="${Utils.escape(ev.id)}">Delete</button>
            </div>
          </div>`;
        })
        .join('');

      listEl.querySelectorAll('[data-ov-open]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = Store.byId.get(btn.dataset.ovOpen);
          if (rec) {
            document.getElementById('gcal-overview-modal').classList.remove('open');
            this.openForRecord(rec);
          }
        });
      });
      listEl.querySelectorAll('[data-ov-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = items.find((x) => x.id === btn.dataset.ovDel);
          if (ev) this.confirmDeleteEvent(ev, () => this.loadOverviewEvents());
        });
      });
    } catch (err) {
      this.syncAuthUI();
      msgEl.textContent = err?.message || 'Could not load Google Calendar reminders.';
      msgEl.className = 'cal-msg err';
      listEl.innerHTML = '';
    }
  },
};
