import { Config } from '../config/constants.js';
import { Store } from '../state/store.js';
import { Utils } from '../utils/helpers.js';
import { App } from '../app.js';
import { NoteWindow } from './notes.js';
import { Drawer } from './drawer.js';

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
