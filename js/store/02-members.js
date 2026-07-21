/* ---- household members — WHO, add/rename/remove member ---- */
'use strict';

  /* ---------- household members ---------- */

  /* The attribution vocabulary: 'Shared' (split evenly) plus every member, in
     roster order. Everything that offers a "who owns this" choice reads from here. */
  function WHO() { return [SHARED].concat(data.members || []); }
  function members() { return (data.members || []).slice(); }

  /* Add a member. Names are the identity used across budget sections, transaction
     'who', account owners and the Roth/income maps, so a name must be unique and
     may not collide with the reserved 'Shared'. Returns the trimmed name or null. */
  function addMember(name) {
    name = String(name || '').trim();
    if (!name || name.toLowerCase() === SHARED.toLowerCase()) return null;
    if (data.members.some(m => m.toLowerCase() === name.toLowerCase())) return null;
    data.members.push(name);
    if (!(name in data.incomes)) data.incomes[name] = 0;
    if (data.invest && data.invest.roth && !(name in data.invest.roth)) data.invest.roth[name] = 0;
    data.payCycles = data.payCycles || {};
    if (!(name in data.payCycles)) data.payCycles[name] = { frequency: 'biweekly', anchor: null };
    save();
    return name;
  }
  /* Rename a member everywhere the old name was used as an identity. */
  function renameMember(oldName, next) {
    next = String(next || '').trim();
    const i = data.members.indexOf(oldName);
    if (i < 0 || !next || next === oldName) return false;
    if (next.toLowerCase() === SHARED.toLowerCase()) return false;
    if (data.members.some(m => m.toLowerCase() === next.toLowerCase())) return false;
    data.members[i] = next;
    data.budget.forEach(b => { if (b.section === oldName) b.section = next; });
    data.transactions.forEach(t => { if (t.who === oldName) t.who = next; });
    data.accounts.forEach(a => { if (a.owner === oldName) a.owner = next; });
    data.rules.forEach(r => { if (r.who === oldName) r.who = next; });
    if (oldName in data.incomes) { data.incomes[next] = data.incomes[oldName]; delete data.incomes[oldName]; }
    if (data.invest && data.invest.roth && oldName in data.invest.roth) {
      data.invest.roth[next] = data.invest.roth[oldName]; delete data.invest.roth[oldName];
    }
    if (data.payCycles && oldName in data.payCycles) {
      data.payCycles[next] = data.payCycles[oldName]; delete data.payCycles[oldName];
    }
    save();
    return true;
  }
  /* Remove a member. The last member can't be removed (the household needs at
     least one). Anything attributed to them falls back to 'Shared' so no budget
     line, transaction or account is orphaned. */
  function removeMember(name) {
    const i = data.members.indexOf(name);
    if (i < 0 || data.members.length <= 1) return false;
    data.members.splice(i, 1);
    data.budget.forEach(b => { if (b.section === name) b.section = SHARED; });
    data.transactions.forEach(t => { if (t.who === name) t.who = SHARED; });
    data.accounts.forEach(a => { if (a.owner === name) a.owner = SHARED; });
    data.rules.forEach(r => { if (r.who === name) r.who = SHARED; });
    delete data.incomes[name];
    if (data.invest && data.invest.roth) delete data.invest.roth[name];
    if (data.payCycles) delete data.payCycles[name];
    save();
    return true;
  }

