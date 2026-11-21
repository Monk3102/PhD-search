import { Config } from '../config/constants.js';
import { Store } from '../state/store.js';
import { App } from '../app.js';

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
