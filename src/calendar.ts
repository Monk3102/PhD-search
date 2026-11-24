import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { Config, TYPE_LABEL, Store, Utils } from './data.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const auth = getAuth(initializeApp(firebaseConfig));
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar.events');

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let currentUser: User | null = null;

interface CalendarReminderOverride {
  method: 'popup' | 'email';
  minutes: number;
}

interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  date: string;
  allDay: boolean;
  startTime?: string;
  durationMinutes?: number;
  reminderMinutes: number;
  reminderMethod: 'popup' | 'email' | 'both';
  entityId: string;
  entityType: string;
  reminderKind?: string;
}

interface CalendarEventRecord {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

function nextDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function buildEventPayload(input: CalendarEventInput) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let start: { date?: string; dateTime?: string; timeZone?: string };
  let end: { date?: string; dateTime?: string; timeZone?: string };

  if (input.allDay) {
    start = { date: input.date };
    end = { date: nextDate(input.date) };
  } else {
    const startDt = new Date(`${input.date}T${input.startTime || '09:00'}:00`);
    const endDt = new Date(startDt.getTime() + Math.max(15, input.durationMinutes || 30) * 60000);
    start = { dateTime: startDt.toISOString(), timeZone: tz };
    end = { dateTime: endDt.toISOString(), timeZone: tz };
  }

  const overrides: CalendarReminderOverride[] =
    input.reminderMethod === 'both'
      ? [
          { method: 'popup', minutes: input.reminderMinutes },
          { method: 'email', minutes: input.reminderMinutes },
        ]
      : [{ method: input.reminderMethod, minutes: input.reminderMinutes }];

  return {
    summary: input.summary,
    description: input.description || '',
    location: input.location || '',
    start,
    end,
    reminders: { useDefault: false, overrides },
    extendedProperties: {
      private: {
        phdMapApp: 'true',
        phdMapEntityId: input.entityId,
        phdMapType: input.entityType,
        phdMapKind: input.reminderKind || 'custom',
      },
    },
  };
}

async function calendarFetch(url: string, init: RequestInit = {}) {
  if (!cachedAccessToken) throw new Error('AUTH_REQUIRED');
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) {
    cachedAccessToken = null;
    CalendarUI.syncAuthUI();
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) detail = errJson.error.message;
    } catch {
      // ignore json parse failure
    }
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

const isSignedIn = () => Boolean(cachedAccessToken && currentUser);

async function googleSignIn() {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Calendar access token.');
    }
    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    CalendarUI.syncAuthUI();
  } finally {
    isSigningIn = false;
  }
}

async function logout() {
  await auth.signOut();
  cachedAccessToken = null;
  currentUser = null;
  CalendarUI.syncAuthUI();
}

async function listEntityEvents(entityId: string): Promise<CalendarEventRecord[]> {
  const params = new URLSearchParams({
    privateExtendedProperty: `phdMapEntityId=${entityId}`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '25',
  });
  const data = await calendarFetch(`${CALENDAR_API}?${params.toString()}`);
  return data?.items || [];
}

async function listAllPhdMapEvents(): Promise<CalendarEventRecord[]> {
  const params = new URLSearchParams({
    privateExtendedProperty: 'phdMapApp=true',
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const data = await calendarFetch(`${CALENDAR_API}?${params.toString()}`);
  return data?.items || [];
}

async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventRecord> {
  return calendarFetch(CALENDAR_API, {
    method: 'POST',
    body: JSON.stringify(buildEventPayload(input)),
  });
}

async function updateCalendarEvent(eventId: string, input: CalendarEventInput): Promise<CalendarEventRecord> {
  return calendarFetch(`${CALENDAR_API}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(buildEventPayload(input)),
  });
}

async function deleteCalendarEvent(eventId: string): Promise<void> {
  await calendarFetch(`${CALENDAR_API}/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}

export const CalendarConfirm = {
  resolver: null as ((val: boolean) => void) | null,

  init() {
    const modal = document.getElementById('cal-confirm-modal')!;
    document.getElementById('cc-cancel')!.addEventListener('click', () => this.resolve(false));
    document.getElementById('cc-confirm')!.addEventListener('click', () => this.resolve(true));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.resolve(false);
    });
  },

  ask({
    title,
    description,
    summary,
    confirmLabel = 'Confirm',
    danger = false,
  }: {
    title: string;
    description: string;
    summary: string;
    confirmLabel?: string;
    danger?: boolean;
  }) {
    document.getElementById('cc-title')!.textContent = title;
    document.getElementById('cc-desc')!.textContent = description;
    document.getElementById('cc-summary')!.textContent = summary;
    const btn = document.getElementById('cc-confirm') as HTMLButtonElement;
    btn.textContent = confirmLabel;
    btn.style.background = danger ? 'var(--rose)' : 'var(--primary)';
    btn.style.borderColor = danger ? 'var(--rose)' : 'var(--primary)';
    document.getElementById('cal-confirm-modal')!.classList.add('open');
    return new Promise<boolean>((res) => {
      this.resolver = res;
    });
  },

  resolve(val: boolean) {
    document.getElementById('cal-confirm-modal')!.classList.remove('open');
    if (this.resolver) {
      const fn = this.resolver;
      this.resolver = null;
      fn(val);
    }
  },
};

export const CalendarUI = {
  currentRecord: null as any,
  editingEventId: null as string | null,

  init() {
    CalendarConfirm.init();
    const $ = (id: string) => document.getElementById(id)!;

    const handleSignIn = async () => {
      try {
        await googleSignIn();
        if (this.currentRecord && $('cal-modal').classList.contains('open')) {
          this.loadEntityEvents();
        }
      } catch (err: any) {
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
      await logout();
      $('gcal-overview-modal').classList.remove('open');
    });

    onAuthStateChanged(auth, (user: User | null) => {
      currentUser = user;
      if (!user || !isSigningIn) {
        if (!user) cachedAccessToken = null;
      }
      this.syncAuthUI();
    });
    this.syncAuthUI();
  },

  calendarUrlForDate(yyyyMmDd?: string) {
    if (yyyyMmDd && /^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
      const [y, m, d] = yyyyMmDd.split('-');
      return `https://calendar.google.com/calendar/r/day/${y}/${Number(m)}/${Number(d)}`;
    }
    return 'https://calendar.google.com';
  },

  syncOpenCalendarLink() {
    const el = document.getElementById('cm-open-gcal') as HTMLAnchorElement | null;
    const dateVal = (document.getElementById('cm-date') as HTMLInputElement | null)?.value;
    if (el) el.href = this.calendarUrlForDate(dateVal);
  },

  syncAuthUI() {
    const signedIn = isSignedIn();
    document.getElementById('gcal-signin-btn')!.style.display = signedIn ? 'none' : 'inline-flex';
    document.getElementById('gcal-connected-btn')!.style.display = signedIn ? 'inline-flex' : 'none';
    document.getElementById('gcal-user-label')!.textContent = currentUser?.email || 'Google Calendar';
    document.getElementById('cm-auth-banner')!.style.display = signedIn ? 'none' : 'flex';
  },

  toggleTimeFields() {
    const allDay = (document.getElementById('cm-allday') as HTMLInputElement).checked;
    document.getElementById('cm-time-wrap')!.style.display = allDay ? 'none' : 'flex';
    document.getElementById('cm-dur-wrap')!.style.display = allDay ? 'none' : 'flex';
  },

  setMsg(text: string, cls = '') {
    const el = document.getElementById('cm-msg')!;
    el.textContent = text;
    el.className = 'cal-msg' + (cls ? ' ' + cls : '');
  },

  buildDescription(record: any) {
    const uni = Utils.getUniversity(record);
    const portal =
      record.applyUrl || record.staffPageUrl || record.phdProgramUrl || record.sourceUrl || record.url || uni?.url || '';
    const note = (Store.notes as Record<string, any>)[record.id]?.text || '';
    return [
      `Entity: ${record.title || record.name || record.id} (${(TYPE_LABEL as Record<string, string>)[record._t] || 'Entity'})`,
      uni ? `Institution: ${uni.name}${uni.city ? ', ' + uni.city : ''}${uni.country ? ', ' + uni.country : ''}` : '',
      record.deadline ? `Application Last Date: ${record.deadline}` : '',
      portal ? `Portal: ${portal}` : '',
      note ? `\nMy Notes:\n${note}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },

  applyPreset(kind: string) {
    const r = this.currentRecord;
    if (!r) return;
    const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const title = r.title || r.name || r.id;
    const entry = (Store.tracker as Record<string, any>)[r.id] || {};
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    document.querySelectorAll<HTMLElement>('.cal-preset-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.preset === kind)
    );

    if (kind === 'deadline' && r.deadline) {
      $('cm-summary').value = `Last Date: ${title}`;
      $('cm-date').value = r.deadline;
      ($('cm-allday') as HTMLInputElement).checked = true;
      $('cm-remind-min').value = '1440';
      $('cm-remind-method').value = 'both';
    } else if (kind === 'followup') {
      $('cm-summary').value = `Follow up: ${title}`;
      $('cm-date').value = entry.follow || tomorrow;
      ($('cm-allday') as HTMLInputElement).checked = false;
      $('cm-time').value = '09:00';
      $('cm-duration').value = '30';
      $('cm-remind-min').value = '30';
      $('cm-remind-method').value = 'popup';
    } else if (kind === 'interview') {
      $('cm-summary').value = `Interview: ${title}`;
      $('cm-date').value = entry.interviewDate || tomorrow;
      ($('cm-allday') as HTMLInputElement).checked = false;
      $('cm-time').value = '10:00';
      $('cm-duration').value = '60';
      $('cm-remind-min').value = '60';
      $('cm-remind-method').value = 'both';
    } else {
      $('cm-summary').value = `Reminder: ${title}`;
      $('cm-date').value = r.deadline || entry.follow || tomorrow;
      ($('cm-allday') as HTMLInputElement).checked = false;
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
    document.getElementById('cm-submit-btn')!.textContent = 'Save to Google Calendar';
    document.getElementById('cm-cancel-edit')!.style.display = 'none';
    const r = this.currentRecord;
    if (!r) return;
    if (r.deadline) this.applyPreset('deadline');
    else if ((Store.tracker as Record<string, any>)[r.id]?.follow) this.applyPreset('followup');
    else this.applyPreset('custom');
  },

  openForRecord(record: any) {
    if (!record) return;
    this.currentRecord = record;
    this.editingEventId = null;
    this.setMsg('');
    this.syncAuthUI();

    const $ = (id: string) => document.getElementById(id)!;
    const uni = Utils.getUniversity(record);
    const typeKey = record._t || 'openings';
    const badge = $('cm-type');
    badge.textContent = (TYPE_LABEL as Record<string, string>)[typeKey] || 'Entity';
    badge.style.background = (Config.markerColors as Record<string, string>)[typeKey] || 'var(--primary)';
    $('cm-title').textContent = record.title || record.name || record.id;
    $('cm-sub').textContent = uni
      ? `${uni.name}${uni.city ? ' · ' + uni.city : ''}${uni.country ? ', ' + uni.country : ''}`
      : '';

    const presets: Array<{ id: string; label: string }> = [];
    if (record.deadline) presets.push({ id: 'deadline', label: `📅 Last Date (${record.deadline})` });
    presets.push({ id: 'followup', label: '⏰ Follow-up Reminder' });
    presets.push({ id: 'interview', label: '🎤 Interview / Meeting' });
    presets.push({ id: 'custom', label: '✨ Custom Reminder' });

    const presetEl = $('cm-presets');
    presetEl.innerHTML = presets
      .map((p) => `<button type="button" class="cal-preset-btn" data-preset="${p.id}">${Utils.escape(p.label)}</button>`)
      .join('');
    presetEl.querySelectorAll<HTMLElement>('.cal-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset!));
    });

    this.resetFormToDefault();
    $('cal-modal').classList.add('open');
    this.loadEntityEvents();
  },

  closeModal() {
    document.getElementById('cal-modal')!.classList.remove('open');
    this.currentRecord = null;
    this.editingEventId = null;
  },

  formatEventWhen(ev: CalendarEventRecord) {
    if (ev.start?.date) return `${ev.start.date} (All-day)`;
    if (ev.start?.dateTime) return new Date(ev.start.dateTime).toLocaleString();
    return '';
  },

  async loadEntityEvents() {
    const listEl = document.getElementById('cm-events-list')!;
    if (!isSignedIn() || !this.currentRecord) {
      listEl.innerHTML =
        '<div style="font-size:12px;color:var(--text-subtle)">Sign in with Google above to view and manage saved Google Calendar reminders for this entity.</div>';
      return;
    }
    listEl.innerHTML = '<div style="font-size:12px;color:var(--text-subtle)">Loading calendar reminders…</div>';
    try {
      const items = await listEntityEvents(this.currentRecord.id);
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

      listEl.querySelectorAll<HTMLElement>('[data-ev-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = items.find((x) => x.id === btn.dataset.evId);
          if (!ev) return;
          if (btn.dataset.evAction === 'edit') this.startEditEvent(ev);
          else if (btn.dataset.evAction === 'delete') this.confirmDeleteEvent(ev, () => this.loadEntityEvents());
        });
      });
    } catch (err: any) {
      this.syncAuthUI();
      listEl.innerHTML = `<div style="font-size:12px;color:var(--rose)">Could not load reminders: ${Utils.escape(err?.message || 'Error')}</div>`;
    }
  },

  startEditEvent(ev: CalendarEventRecord) {
    this.editingEventId = ev.id;
    (document.getElementById('cm-summary') as HTMLInputElement).value = ev.summary || '';
    (document.getElementById('cm-desc') as HTMLTextAreaElement).value = ev.description || '';
    if (ev.start?.date) {
      (document.getElementById('cm-allday') as HTMLInputElement).checked = true;
      (document.getElementById('cm-date') as HTMLInputElement).value = ev.start.date;
    } else if (ev.start?.dateTime) {
      (document.getElementById('cm-allday') as HTMLInputElement).checked = false;
      const dt = new Date(ev.start.dateTime);
      const pad = (n: number) => String(n).padStart(2, '0');
      (document.getElementById('cm-date') as HTMLInputElement).value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      (document.getElementById('cm-time') as HTMLInputElement).value = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
    this.toggleTimeFields();
    document.getElementById('cm-submit-btn')!.textContent = 'Update Google Calendar Event';
    document.getElementById('cm-cancel-edit')!.style.display = 'inline-flex';
  },

  async handleSubmit() {
    if (!isSignedIn()) {
      this.setMsg('Please sign in with Google first.', 'err');
      return;
    }
    const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const summary = $('cm-summary').value.trim();
    const date = $('cm-date').value;
    if (!summary || !date) {
      this.setMsg('Please enter both a reminder title and date.', 'err');
      return;
    }
    const allDay = ($('cm-allday') as HTMLInputElement).checked;
    const startTime = $('cm-time').value || '09:00';
    const durationMinutes = Number($('cm-duration').value || 30);
    const reminderMinutes = Number($('cm-remind-min').value || 1440);
    const reminderMethod = ($('cm-remind-method').value || 'both') as 'popup' | 'email' | 'both';
    const description = $('cm-desc').value.trim();
    const uni = Utils.getUniversity(this.currentRecord);
    const location = uni ? [uni.name, uni.city, uni.country].filter(Boolean).join(', ') : '';

    const isUpdate = Boolean(this.editingEventId);
    const activePreset =
      (document.querySelector<HTMLElement>('.cal-preset-btn.active')?.dataset.preset) || 'custom';
    const ok = await CalendarConfirm.ask({
      title: isUpdate ? 'Update Google Calendar Event?' : 'Add Reminder to Google Calendar?',
      description: isUpdate
        ? 'This will modify the existing event in your primary Google Calendar.'
        : 'This will create a new event and reminder in your primary Google Calendar.',
      summary: `Title: ${summary}\nWhen: ${allDay ? `${date} (All-day)` : `${date} at ${startTime} (${durationMinutes} min)`}\nNotify: ${reminderMinutes >= 1440 ? `${reminderMinutes / 1440} day(s)` : `${reminderMinutes} min`} before (${reminderMethod})`,
      confirmLabel: isUpdate ? 'Update Event' : 'Add to Google Calendar',
    });
    if (!ok) return;

    const submitBtn = document.getElementById('cm-submit-btn') as HTMLButtonElement;
    submitBtn.disabled = true;
    this.setMsg(isUpdate ? 'Updating Google Calendar…' : 'Adding to Google Calendar…');
    try {
      const payload: CalendarEventInput = {
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
      if (isUpdate && this.editingEventId) await updateCalendarEvent(this.editingEventId, payload);
      else await createCalendarEvent(payload);

      this.setMsg(isUpdate ? 'Google Calendar event updated!' : 'Reminder added to Google Calendar!', 'ok');
      this.resetFormToDefault();
      await this.loadEntityEvents();
    } catch (err: any) {
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

  async confirmDeleteEvent(ev: CalendarEventRecord, onDeleted?: () => Promise<void>) {
    const ok = await CalendarConfirm.ask({
      title: 'Delete Google Calendar Event?',
      description: 'Are you sure you want to permanently delete this event from your Google Calendar?',
      summary: `Event: ${ev.summary || '(Untitled)'}\nWhen: ${this.formatEventWhen(ev)}`,
      confirmLabel: 'Delete Event',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCalendarEvent(ev.id);
      if (this.editingEventId === ev.id) this.resetFormToDefault();
      await onDeleted?.();
    } catch (err: any) {
      this.syncAuthUI();
      this.setMsg(err?.message || 'Failed to delete event.', 'err');
    }
  },

  openOverview() {
    document.getElementById('gco-user')!.textContent = currentUser?.email
      ? `Signed in as ${currentUser.email}`
      : 'Connected to Google Calendar';
    document.getElementById('gcal-overview-modal')!.classList.add('open');
    this.loadOverviewEvents();
  },

  async loadOverviewEvents() {
    const listEl = document.getElementById('gco-list')!;
    const msgEl = document.getElementById('gco-msg')!;
    msgEl.textContent = '';
    if (!isSignedIn()) {
      listEl.innerHTML =
        '<div style="font-size:12px;color:var(--text-subtle)">Sign in with Google to view your saved PhD Map reminders.</div>';
      return;
    }
    listEl.innerHTML = '<div style="font-size:12px;color:var(--text-subtle)">Loading reminders from Google Calendar…</div>';
    try {
      const items = await listAllPhdMapEvents();
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

      listEl.querySelectorAll<HTMLElement>('[data-ov-open]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = Store.byId.get(btn.dataset.ovOpen!);
          if (rec) {
            document.getElementById('gcal-overview-modal')!.classList.remove('open');
            this.openForRecord(rec);
          }
        });
      });
      listEl.querySelectorAll<HTMLElement>('[data-ov-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = items.find((x) => x.id === btn.dataset.ovDel);
          if (ev) this.confirmDeleteEvent(ev, () => this.loadOverviewEvents());
        });
      });
    } catch (err: any) {
      this.syncAuthUI();
      msgEl.textContent = err?.message || 'Could not load Google Calendar reminders.';
      msgEl.className = 'cal-msg err';
      listEl.innerHTML = '';
    }
  },
};
