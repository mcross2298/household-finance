/* Export & Backup — CSV spreadsheet export and full JSON backup/restore. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.backup = function (root) {
    const S = Store;
    const n = S.data.transactions.length;
    const stamp = () => new Date().toISOString().slice(0, 10);

    root.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>Export &amp; Backup</h1></div>

        <section class="card">
          <div class="card-head"><h2>Spreadsheet export (CSV)</h2><span class="card-note">${n} transactions</span></div>
          <p class="help">Exports <b>Date, Category, Description, Amount, Who, Account, Notes</b> —
             a fixed column order you can open in Excel, Google Sheets, or Numbers, or wire into
             your own analysis workbook.</p>
          <div class="btn-row">
            <button class="btn gold" id="exp-csv">⬇ Export transactions CSV</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Full backup (JSON)</h2></div>
          <p class="help">Everything — budget, income, transactions, goals, house plan, investments,
             wedding — in one file. This is also the device-to-device handoff: export here, then
             restore on another phone or computer to move your data across.</p>
          <div class="btn-row">
            <button class="btn" id="exp-json">⬇ Download backup</button>
            <label class="btn ghost file-btn">⬆ Restore from backup
              <input type="file" id="imp-json" accept=".json,application/json" hidden>
            </label>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Privacy &amp; Lock</h2>
            <span class="card-note">${Lock.isEnabled() ? 'on · auto-lock ' + Lock.getTimeoutMin() + ' min' : 'off'}</span></div>
          <p class="help">A PIN (and Face ID/Touch ID, where this phone supports it) between whoever
             picks up this phone and your balances. It's a lock on the door, not encryption — data in
             this browser is unchanged either way. <b>There is no bypass for a forgotten PIN</b> — the
             only way back in is restoring a JSON backup, so keep one current.</p>
          <div id="lock-status-body"></div>
        </section>

        <section class="card">
          <div class="card-head"><h2>About this data</h2></div>
          <p class="help">Data lives only in this browser (localStorage) — nothing is sent anywhere.
             That means: back up before clearing browser data, and export a backup any time
             you've entered something you'd hate to retype. Last updated
             <b>${new Date(S.data.lastUpdated).toLocaleString()}</b>.</p>
        </section>

        <section class="card danger-zone">
          <div class="card-head"><h2>Danger zone</h2></div>
          <p class="help">New here? <b>Start fresh</b> clears the demo household so you can enter your
             own. Changed your mind? <b>Reset to demo data</b> brings the sample household back.</p>
          <div class="btn-row">
            <button class="btn gold" id="start-fresh">✨ Start fresh (clear demo data)</button>
            <button class="btn danger ghost" id="reset-app">Reset to demo data</button>
          </div>
        </section>
      </div>`;

    root.querySelector('#exp-csv').addEventListener('click', () => {
      App.exportTransactionsCSV();
      App.render();
    });
    root.querySelector('#exp-json').addEventListener('click', () => {
      App.download('household-finance-backup-' + stamp() + '.json',
        JSON.stringify(S.data, null, 2), 'application/json');
      App.toast('Backup downloaded');
    });
    root.querySelector('#imp-json').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        let next;
        try { next = JSON.parse(String(reader.result)); }
        catch (err) { return App.toast('Not a valid backup file', 'warn'); }
        if (!next || !Array.isArray(next.transactions) || !Array.isArray(next.budget) || !Array.isArray(next.goals)) {
          return App.toast("That file isn't a Household Finance backup", 'warn');
        }
        App.confirmDialog('Restore backup',
          `Replace everything on this device with the backup (${next.transactions.length} transactions, last updated ${next.lastUpdated ? new Date(next.lastUpdated).toLocaleDateString() : 'unknown'})?`,
          'Restore', () => {
            S.replace(next); App.render(); App.toast('Backup restored');
          });
      };
      reader.readAsText(f);
      e.target.value = '';
    });
    root.querySelector('#start-fresh').addEventListener('click', () => {
      App.confirmDialog('Start fresh',
        'This clears the demo household — budget, transactions, goals, accounts, everything — and leaves you a blank slate with one member to rename. Export a backup first if you want to keep anything.',
        'Start fresh', () => { S.startFresh(); App.render(); App.go('budget'); App.toast('Cleared — add your household on the Budget screen'); });
    });
    root.querySelector('#reset-app').addEventListener('click', () => {
      App.confirmDialog('Reset to demo data',
        'This wipes all data on this device and reloads the sample demo household. Export a backup first if in doubt.',
        'Reset', () => { S.reset(); App.render(); App.toast('Reset to demo data'); });
    });

    renderLockStatus(root.querySelector('#lock-status-body'));
  };

  function pinModalMarkup(fields) {
    return fields.map(f => `
      <label>${f.label}
        <input class="input" id="${f.id}" type="password" inputmode="numeric"
          pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="off">
      </label>`).join('') + '<div class="lock-error" id="lp-err" role="alert"></div>';
  }

  function openSetupPinModal() {
    const m = App.modal('Turn on app lock', `
      <p class="help">Choose a 4–8 digit PIN. You'll need it (or Face ID/Touch ID, if enabled below)
         whenever the app has been closed or idle a few minutes.</p>
      ${pinModalMarkup([{ label: 'New PIN', id: 'lp-new' }, { label: 'Confirm PIN', id: 'lp-confirm' }])}
      <div class="btn-row"><button class="btn gold" id="lp-save">Turn on</button></div>`);
    m.el.querySelector('#lp-save').addEventListener('click', async () => {
      const a = m.el.querySelector('#lp-new').value.trim();
      const b = m.el.querySelector('#lp-confirm').value.trim();
      const err = m.el.querySelector('#lp-err');
      if (!/^\d{4,8}$/.test(a)) { err.textContent = 'PIN must be 4–8 digits.'; return; }
      if (a !== b) { err.textContent = "PINs don't match."; return; }
      await Lock.setup(a);
      m.close(); App.render(); App.toast('App lock turned on');
    });
  }

  function openChangePinModal() {
    const m = App.modal('Change PIN', `
      ${pinModalMarkup([{ label: 'Current PIN', id: 'lp-old' }, { label: 'New PIN', id: 'lp-new' }, { label: 'Confirm new PIN', id: 'lp-confirm' }])}
      <div class="btn-row"><button class="btn gold" id="lp-save">Save</button></div>`);
    m.el.querySelector('#lp-save').addEventListener('click', async () => {
      const old = m.el.querySelector('#lp-old').value.trim();
      const a = m.el.querySelector('#lp-new').value.trim();
      const b = m.el.querySelector('#lp-confirm').value.trim();
      const err = m.el.querySelector('#lp-err');
      if (!/^\d{4,8}$/.test(a)) { err.textContent = 'New PIN must be 4–8 digits.'; return; }
      if (a !== b) { err.textContent = "PINs don't match."; return; }
      const ok = await Lock.changePin(old, a);
      if (!ok) { err.textContent = 'Current PIN is wrong.'; return; }
      m.close(); App.toast('PIN changed');
    });
  }

  function renderLockStatus(slot) {
    if (!slot) return;
    if (!Lock.isEnabled()) {
      slot.innerHTML = `<div class="btn-row"><button class="btn gold" id="lock-enable">🔒 Turn on app lock</button></div>`;
      slot.querySelector('#lock-enable').addEventListener('click', openSetupPinModal);
      return;
    }
    const min = Lock.getTimeoutMin();
    slot.innerHTML = `
      <div class="form-grid">
        <label>Auto-lock after
          <select class="select" id="lock-timeout">
            ${[1, 5, 15, 30].map(v => `<option value="${v}"${v === min ? ' selected' : ''}>${v} minute${v === 1 ? '' : 's'}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="lock-change-pin">Change PIN</button>
        <button class="btn danger ghost" id="lock-disable">Turn off app lock</button>
      </div>
      <div id="lock-bio-slot" class="btn-row"></div>`;
    slot.querySelector('#lock-timeout').addEventListener('change', e => {
      Lock.setTimeoutMin(e.target.value);
      App.toast('Auto-lock updated');
    });
    slot.querySelector('#lock-change-pin').addEventListener('click', openChangePinModal);
    slot.querySelector('#lock-disable').addEventListener('click', () => {
      App.confirmDialog('Turn off app lock', 'The app will open unlocked from now on.', 'Turn off', () => {
        Lock.disable(); App.render(); App.toast('App lock turned off');
      });
    });
    Lock.webauthnAvailable().then(avail => {
      const bioSlot = slot.querySelector('#lock-bio-slot');
      if (!bioSlot || !avail) return;
      if (Lock.hasBiometric()) {
        bioSlot.innerHTML = `<button class="btn ghost sm" id="lock-bio-off">Turn off Face ID / Touch ID</button>`;
        bioSlot.querySelector('#lock-bio-off').addEventListener('click', () => {
          App.confirmDialog('Turn off Face ID / Touch ID', 'PIN-only from now on.', 'Turn off', () => {
            Lock.removeBiometric(); App.toast('Biometric unlock turned off'); App.render();
          });
        });
      } else {
        bioSlot.innerHTML = `<button class="btn ghost sm" id="lock-bio-on">Also allow Face ID / Touch ID</button>`;
        bioSlot.querySelector('#lock-bio-on').addEventListener('click', async () => {
          try { await Lock.registerBiometric(); App.toast('Face ID / Touch ID enabled'); App.render(); }
          catch (e) { App.toast('Could not enable — try again', 'warn'); }
        });
      }
    });
  }
})();
