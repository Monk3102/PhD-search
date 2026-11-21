import { Store } from '../state/store.js';
import { Utils } from '../utils/helpers.js';
import { App } from '../app.js';

export const FilterEngine = {
  state: {
    search: '',
    country: '',
    subfield: '',
    hideClosed: true,
    fundedOnly: false,
    takingStudents: false,
  },

  init() {
    const $ = (id) => document.getElementById(id);
    const searchInput = $('search-input');
    const clearBtn = $('clear-search');
    const popover = $('filter-popover');
    const filterBtn = $('filter-btn');
    const subfieldSelect = $('subfield-select');
    const hideClosed = $('check-hide-closed');
    const funded = $('check-funded-only');
    const taking = $('check-taking-students');

    let timer;
    searchInput.addEventListener('input', (e) => {
      this.state.search = e.target.value.toLowerCase().trim();
      clearBtn.style.display = this.state.search ? 'block' : 'none';
      clearTimeout(timer);
      timer = setTimeout(() => App.applyFilters(), 150);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      this.state.search = '';
      clearBtn.style.display = 'none';
      App.applyFilters();
    });

    $('country-select').addEventListener('change', (e) => {
      this.state.country = e.target.value;
      App.applyFilters();
    });

    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && !filterBtn.contains(e.target)) {
        popover.classList.remove('open');
      }
    });

    const bind = (el, key, prop) =>
      el.addEventListener('change', (e) => {
        this.state[key] = e.target[prop];
        this.updateBadge();
        App.applyFilters();
      });

    bind(subfieldSelect, 'subfield', 'value');
    bind(hideClosed, 'hideClosed', 'checked');
    bind(funded, 'fundedOnly', 'checked');
    bind(taking, 'takingStudents', 'checked');

    $('reset-filters-btn').addEventListener('click', () => {
      Object.assign(this.state, {
        subfield: '',
        hideClosed: true,
        fundedOnly: false,
        takingStudents: false,
      });
      subfieldSelect.value = '';
      hideClosed.checked = true;
      funded.checked = false;
      taking.checked = false;
      this.updateBadge();
      App.applyFilters();
    });
  },

  updateBadge() {
    const s = this.state;
    const count =
      (s.subfield ? 1 : 0) +
      (s.fundedOnly ? 1 : 0) +
      (s.takingStudents ? 1 : 0) +
      (s.hideClosed ? 0 : 1);
    const badge = document.getElementById('active-filter-badge');
    badge.textContent = count;
    badge.style.display = count ? 'inline-block' : 'none';
    document.getElementById('filter-btn').classList.toggle('has-active', count > 0);
  },

  filterRecords(records, tab) {
    const today = new Date().toISOString().slice(0, 10);
    const s = this.state;
    const sub = s.subfield.toLowerCase();

    return records.filter((r) => {
      const uni = Utils.getUniversity(r);

      if (s.country && uni?.country !== s.country) return false;
      if (tab === 'openings' && s.hideClosed && (r.status === 'closed' || (r.deadline && r.deadline < today))) {
        return false;
      }

      if (s.fundedOnly) {
        if (tab === 'openings' && r.funding) {
          const f = r.funding.toLowerCase();
          if (!f.includes('fully') && !f.includes('funded')) return false;
        }
        if (tab === 'universities' && !/fully|funded|full funding/i.test(r.funding || '')) return false;
      }

      if (tab === 'supervisors' && s.takingStudents && !r.takingStudents) return false;

      if (sub) {
        const subs = r.subfields || uni?.subfields || [];
        if (!subs.some((x) => x.toLowerCase().includes(sub))) return false;
      }

      if (s.search && !Store.hay(r).includes(s.search)) return false;
      return true;
    });
  },
};
