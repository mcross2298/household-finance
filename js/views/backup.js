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
  };
})();
