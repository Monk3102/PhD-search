import { Config } from '../config/constants.js';
import { Store } from '../state/store.js';
import { Utils } from '../utils/helpers.js';
import { App } from '../app.js';
import { MapModule } from './map.js';
import { NoteWindow } from './notes.js';
import { CalendarUI } from './calendar.js';

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
