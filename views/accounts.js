const AccountsView = (() => {
  let ownerFilter = 'All';
  let viewMode = 'owner'; // 'owner' | 'institution' | 'type'

  function render() {
    const modeToggle = `
      <div class="filter-row">
        <button class="pill ${viewMode === 'owner' ? 'active' : ''}" data-view-mode="owner">By Owner</button>
        <button class="pill ${viewMode === 'institution' ? 'active' : ''}" data-view-mode="institution">By Institution</button>
        <button class="pill ${viewMode === 'type' ? 'active' : ''}" data-view-mode="type">By Type</button>
      </div>
    `;
    let body;
    if (viewMode === 'institution') body = renderByInstitution();
    else if (viewMode === 'type') body = renderByType();
    else body = renderByOwner();
    return renderMatrix() + modeToggle + body;
  }

  function renderByType() {
    const groups = {};
    Store.state.accounts.filter(a => a.type !== 'Credit Card').forEach(a => {
      const key = Store.accountSubtype(a);
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });

    const withTotals = Object.entries(groups).map(([type, accts]) => {
      const total = accts.reduce((sum, a) => sum + Store.toHomeCurrency(Store.accountValue(a), a.currency), 0);
      return { type, accts, total };
    }).sort((a, b) => b.total - a.total);

    const cards = withTotals.map(({ type, accts, total }) => {
      const rows = accts
        .slice()
        .sort((a, b) => Store.toHomeCurrency(Store.accountValue(b), b.currency) - Store.toHomeCurrency(Store.accountValue(a), a.currency))
        .map(a => `
          <div class="ledger-row" data-account-id="${a.id}">
            <div class="ledger-main">
              <span class="owner-dot ${ownerClass(a.owner)}"></span>
              <span class="ledger-name">${a.name}</span>
              <span class="ledger-sub">${a.institution || ''}</span>
            </div>
            <div class="ledger-amount num">${new Intl.NumberFormat('en-CA', {style:'currency', currency: a.currency}).format(Store.accountValue(a))}</div>
          </div>
        `).join('');
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between;">
            <h3>${type}</h3>
            <span class="ledger-amount num">${Store.formatMoney(total)}</span>
          </div>
          ${rows}
        </div>
      `;
    }).join('');

    return cards || `<div class="card"><div class="empty-state">No accounts yet</div></div>`;
  }

  function renderMatrix() {
    const matrix = Store.institutionOwnerMatrix();
    if (!matrix.length) return '';
    const rows = matrix.map(row => `
      <tr>
        <td style="padding:7px 4px; font-size:0.82rem;">${row.inst}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.78rem; color:var(--owner-mine);">${shortMoney(row.Mine)}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.78rem; color:var(--owner-his);">${shortMoney(row.His)}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.78rem; color:var(--owner-joint);">${shortMoney(row.Joint)}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.82rem; font-weight:700;">${shortMoney(row.total)}</td>
      </tr>
    `).join('');
    return `
      <div class="card">
        <h3>Institution × Owner</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="text-align:left; padding:4px; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Institution</th>
              <th style="text-align:right; padding:4px; font-size:0.7rem; color:var(--owner-mine); text-transform:uppercase;">Niki</th>
              <th style="text-align:right; padding:4px; font-size:0.7rem; color:var(--owner-his); text-transform:uppercase;">Nico</th>
              <th style="text-align:right; padding:4px; font-size:0.7rem; color:var(--owner-joint); text-transform:uppercase;">Joint</th>
              <th style="text-align:right; padding:4px; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function shortMoney(v) {
    if (!v) return '—';
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: CONFIG.HOME_CURRENCY, maximumFractionDigits: 0, notation: 'compact' }).format(v);
  }

  function renderByInstitution() {
    const groups = {};
    Store.state.accounts.filter(a => a.type !== 'Credit Card').forEach(a => {
      const key = a.institution || 'Unspecified';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });

    const withTotals = Object.entries(groups).map(([inst, accts]) => {
      const total = accts.reduce((sum, a) => sum + Store.toHomeCurrency(Store.accountValue(a), a.currency), 0);
      return { inst, accts, total };
    }).sort((a, b) => b.total - a.total);

    const cards = withTotals.map(({ inst, accts, total }) => {
      const rows = accts
        .slice()
        .sort((a, b) => Store.toHomeCurrency(Store.accountValue(b), b.currency) - Store.toHomeCurrency(Store.accountValue(a), a.currency))
        .map(a => `
          <div class="ledger-row" data-account-id="${a.id}">
            <div class="ledger-main">
              <span class="owner-dot ${ownerClass(a.owner)}"></span>
              <span class="ledger-name">${a.name}</span>
              <span class="ledger-sub">${a.type}</span>
            </div>
            <div class="ledger-amount num">${new Intl.NumberFormat('en-CA', {style:'currency', currency: a.currency}).format(Store.accountValue(a))}</div>
          </div>
        `).join('');
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between;">
            <h3>${inst}</h3>
            <span class="ledger-amount num">${Store.formatMoney(total)}</span>
          </div>
          ${rows}
        </div>
      `;
    }).join('');

    return cards || `<div class="card"><div class="empty-state">No accounts yet</div></div>`;
  }

  function renderByOwner() {
    const filtered = (ownerFilter === 'All'
      ? Store.state.accounts
      : Store.state.accounts.filter(a => a.owner === ownerFilter)
    ).filter(a => a.type !== 'Credit Card');

    const restricted = filtered.filter(a => !Store.isLiquid(a));
    const normal = filtered.filter(a => Store.isLiquid(a) && (a.institution || a.name) !== 'Home Cash Fund');
    const cashFund = filtered.filter(a => Store.isLiquid(a) && (a.institution || a.name) === 'Home Cash Fund');

    const normalHtml = renderAccountGroups(groupByInstitutionOrName(normal));
    const cashFundHtml = renderAccountGroups(groupByInstitutionOrName(cashFund));
    const restrictedHtml = renderAccountGroups(groupByInstitutionOrName(restricted), true);

    return `
      <div class="filter-row">
        ${['All', 'Mine', 'His', 'Joint'].map(o => `
          <button class="pill ${ownerFilter === o ? 'active' : ''}" data-owner-filter="${o}">${o === 'All' ? 'All' : Store.ownerLabel(o)}</button>
        `).join('')}
      </div>

      <div class="card">
        <h3>Net Worth (${ownerFilter === 'All' ? 'All' : Store.ownerLabel(ownerFilter)})</h3>
        <div class="big-number num">${Store.formatMoney(Store.netWorth(ownerFilter))}</div>
      </div>

      ${normalHtml || !(cashFundHtml || restrictedHtml) ? `
        <div class="card">
          <h3>Accounts</h3>
          ${normalHtml || `<div class="empty-state">No accounts yet.<br><br><button id="add-account-btn">Add your first account</button></div>`}
        </div>
      ` : ''}

      ${cashFundHtml ? `<div class="card">${cashFundHtml}</div>` : ''}

      ${restrictedHtml ? `
        <details class="card">
          <summary style="cursor:pointer; font-family:'Fraunces',serif; font-weight:600; font-size:1.05rem;">🔒 Restricted / Retirement Accounts</summary>
          <div style="margin-top:8px;">${restrictedHtml}</div>
        </details>
      ` : ''}

      ${filtered.length ? `<button id="add-account-btn-2" class="secondary" style="width:100%;">+ Add Account</button>` : ''}
    `;
  }

  function groupByInstitutionOrName(accts) {
    const groups = {};
    accts.forEach(a => {
      const key = a.institution || a.name;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }

  function renderAccountGroups(groups, hideRestrictedBadge) {
    return Object.entries(groups).map(([groupName, accts]) => {
      const groupTotal = accts.reduce((sum, a) => sum + Store.toHomeCurrency(Store.accountValue(a), a.currency), 0);
      const currencies = accts.map(a => a.currency);
      const allCurrenciesUnique = new Set(currencies).size === currencies.length;
      // Only collapse into a grouped "fund" view when every account here is a
      // different currency of the same fund — e.g. a CAD/EUR/USD cash stash.
      // Accounts that merely share an institution name (two TD accounts, both CAD)
      // stay listed individually so their real names aren't hidden.
      const isMultiCurrencyFund = accts.length > 1 && allCurrenciesUnique;

      const acctRows = accts.map(a => {
        const snap = Store.latestSnapshotFor(a.id);
        const restricted = !hideRestrictedBadge && !Store.isLiquid(a);
        return `
          <div class="ledger-row" data-account-id="${a.id}">
            <div class="ledger-main">
              <span class="owner-dot ${ownerClass(a.owner)}"></span>
              <span class="ledger-name">${isMultiCurrencyFund ? a.currency : a.name}</span>
              ${restricted ? '<span class="pill" style="margin-left:6px;">🔒 restricted</span>' : ''}
              <span class="ledger-sub">${isMultiCurrencyFund ? '' : (a.institution || '')}</span>
            </div>
            <div style="text-align:right;">
              <div class="ledger-amount num">${new Intl.NumberFormat('en-CA', {style:'currency', currency: a.currency}).format(Store.accountValue(a))}</div>
              <div class="ledger-sub">${snap ? new Date(snap.date).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'no snapshot'}</div>
            </div>
          </div>
        `;
      }).join('');

      if (!isMultiCurrencyFund) return acctRows;

      return `
        <div style="margin-bottom:4px;">
          <div style="display:flex; justify-content:space-between; padding:8px 0 2px;">
            <span class="ledger-name" style="font-weight:700;">${groupName}</span>
            <span class="ledger-sub num">${Store.formatMoney(groupTotal)} total</span>
          </div>
          ${acctRows}
        </div>
      `;
    }).join('');
  }

  function ownerClass(owner) {
    if (owner === 'Mine') return 'mine';
    if (owner === 'His') return 'his';
    return 'joint';
  }

  function afterRender() {
    document.querySelectorAll('[data-view-mode]').forEach(btn => {
      btn.addEventListener('click', () => { viewMode = btn.dataset.viewMode; App.rerender(); });
    });
    document.querySelectorAll('[data-owner-filter]').forEach(btn => {
      btn.addEventListener('click', () => { ownerFilter = btn.dataset.ownerFilter; App.rerender(); });
    });
    document.querySelectorAll('[data-account-id]').forEach(row => {
      row.addEventListener('click', () => openAccountDetail(row.dataset.accountId));
    });
    const addBtn = document.getElementById('add-account-btn') || document.getElementById('add-account-btn-2');
    if (addBtn) addBtn.addEventListener('click', () => openAccountForm());
  }

  function openAccountForm(existing) {
    const isEdit = !!existing;
    App.openModal(`
      <h2>${isEdit ? 'Edit Account' : 'Add Account'}</h2>
      <label>Account name</label>
      <input id="f-name" value="${existing?.name || ''}" placeholder="e.g. TD Chequing">
      <label>Institution</label>
      <input id="f-institution" value="${existing?.institution || ''}" placeholder="e.g. TD, Wealthsimple, Cash">
      <div class="form-grid">
        <div>
          <label>Owner</label>
          <select id="f-owner">
            ${['Mine', 'His', 'Joint'].map(o => `<option value="${o}" ${existing?.owner === o ? 'selected' : ''}>${Store.ownerLabel(o)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Currency</label>
          <select id="f-currency">
            ${['CAD', 'USD', 'EUR', 'GBP'].map(c => `<option ${existing?.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <label>Account type</label>
      <select id="f-type">
        ${['Cash', 'Investment', 'Private Stock', 'Credit Card', 'Liability'].map(t => `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <div class="modal-actions">
        ${isEdit ? '<button class="secondary" id="delete-account">Delete</button>' : ''}
        <button id="save-account">Save</button>
      </div>
    `);

    document.getElementById('save-account').addEventListener('click', async () => {
      const row = {
        id: existing?.id,
        name: document.getElementById('f-name').value.trim(),
        institution: document.getElementById('f-institution').value.trim(),
        owner: document.getElementById('f-owner').value,
        currency: document.getElementById('f-currency').value,
        type: document.getElementById('f-type').value
      };
      if (!row.name) return;
      App.closeModal();
      App.showSaving();
      await Api.upsert('Accounts', row);
      await Store.loadAll();
      App.rerender();
    });

    if (isEdit) {
      document.getElementById('delete-account').addEventListener('click', async () => {
        App.closeModal();
        App.showSaving();
        await Api.remove('Accounts', existing.id);
        await Store.loadAll();
        App.rerender();
      });
    }
  }

  function openAccountDetail(accountId) {
    const account = Store.state.accounts.find(a => a.id === accountId);
    const hasSnapshots = account.type !== 'Credit Card';

    const snaps = Store.state.snapshots
      .filter(s => s.accountId === accountId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const snapRows = snaps.map(s => `
      <div class="ledger-row">
        <div class="ledger-sub">${new Date(s.date).toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'})}</div>
        <div class="ledger-amount num">${account.type === 'Private Stock' ? Store.formatMoney(Number(s.shares) * Number(s.pricePerShare)) : new Intl.NumberFormat('en-CA', {style:'currency', currency: account.currency}).format(s.balance)}</div>
      </div>
    `).join('');

    const txns = Store.state.transactions
      .filter(t => t.accountId === accountId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);
    const txnRows = txns.map(t => `
      <div class="ledger-row">
        <div class="ledger-main">
          <span class="ledger-name">${t.description}</span>
          <span class="ledger-sub">${t.category}</span>
        </div>
        <div class="ledger-amount num">${Number(t.amount) < 0 ? '-' : ''}${Store.formatMoney(Math.abs(t.amount))}</div>
      </div>
    `).join('');

    App.openModal(`
      <h2>${account.name}</h2>
      <div class="ledger-sub" style="margin-bottom:10px;">${account.institution} · ${Store.ownerLabel(account.owner)} · ${account.currency}</div>
      <button id="edit-account-btn" class="secondary" style="width:100%; margin-bottom:14px;">Edit account</button>

      ${hasSnapshots ? `
        <div class="section-label">Snapshots</div>
        ${snapRows || '<div class="empty-state">No snapshots yet</div>'}
        <button id="add-snapshot-btn" class="secondary" style="width:100%; margin-top:10px;">+ Add Snapshot</button>
      ` : ''}

      <div class="section-label">Recent Transactions</div>
      ${txnRows || '<div class="empty-state">No transactions yet</div>'}
      <button id="add-transaction-btn" style="width:100%; margin-top:12px;">+ Add Transaction</button>
    `);

    document.getElementById('edit-account-btn').addEventListener('click', () => openAccountForm(account));
    document.getElementById('add-snapshot-btn')?.addEventListener('click', () => openSnapshotForm(account));
    document.getElementById('add-transaction-btn').addEventListener('click', () => openTransactionForm(account));
  }

  function openTransactionForm(account) {
    App.openModal(`
      <h2>Add Transaction</h2>
      <div class="ledger-sub" style="margin-bottom:6px;">${account.name}</div>
      <label>Date</label>
      <input id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}">
      <label>Description</label>
      <input id="f-desc" placeholder="e.g. Farmers market, parking">
      <div class="form-grid">
        <div>
          <label>Amount (${account.currency})</label>
          <input id="f-amount" type="number" step="any" placeholder="negative for spend, e.g. -42.50">
        </div>
        <div>
          <label>Category</label>
          <select id="f-category">${Categorize.categoryOptions('Other')}</select>
        </div>
      </div>
      <label>Owner</label>
      <select id="f-owner">
        ${['Mine','His','Joint'].map(o => `<option value="${o}" ${account.owner === o ? 'selected' : ''}>${Store.ownerLabel(o)}</option>`).join('')}
      </select>
      <label>Notes / tags (optional)</label>
      <input id="f-notes" placeholder="e.g. Sarah's wedding">
      <div class="modal-actions">
        <button id="save-transaction">Save</button>
      </div>
    `);

    const descInput = document.getElementById('f-desc');
    descInput.addEventListener('blur', () => {
      const suggested = Categorize.autoCategory(descInput.value);
      document.getElementById('f-category').value = suggested;
    });

    document.getElementById('save-transaction').addEventListener('click', async () => {
      const description = document.getElementById('f-desc').value.trim();
      const amount = Number(document.getElementById('f-amount').value || 0);
      const category = document.getElementById('f-category').value;
      if (!description || !amount) return;

      const keyword = Categorize.extractKeyword(description);
      const recurring = Categorize.detectRecurring(description, amount);

      const row = {
        date: document.getElementById('f-date').value,
        amount,
        currency: account.currency,
        description,
        category,
        accountId: account.id,
        owner: document.getElementById('f-owner').value,
        recurring,
        notes: document.getElementById('f-notes').value.trim()
      };
      App.closeModal();
      App.showSaving();
      await Categorize.saveRule(keyword, category);
      await Api.upsert('Transactions', row);
      await Store.loadAll();
      App.rerender();
    });
  }

  function openSnapshotForm(account) {
    const isStock = account.type === 'Private Stock';
    App.openModal(`
      <h2>Add Snapshot</h2>
      <div class="ledger-sub">${account.name}</div>
      <label>Date</label>
      <input id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}">
      ${isStock ? `
        <label>Shares</label>
        <input id="f-shares" type="number" step="any" placeholder="e.g. 5000">
        <label>Price per share (${account.currency})</label>
        <input id="f-price" type="number" step="any" placeholder="e.g. 2.15">
      ` : `
        <label>Balance (${account.currency})</label>
        <input id="f-balance" type="number" step="any" placeholder="e.g. 12500.00">
      `}
      <div class="modal-actions">
        <button id="save-snapshot">Save</button>
      </div>
    `);

    document.getElementById('save-snapshot').addEventListener('click', async () => {
      const row = {
        accountId: account.id,
        date: document.getElementById('f-date').value,
        balance: isStock ? '' : Number(document.getElementById('f-balance').value || 0),
        shares: isStock ? Number(document.getElementById('f-shares').value || 0) : '',
        pricePerShare: isStock ? Number(document.getElementById('f-price').value || 0) : ''
      };
      App.closeModal();
      App.showSaving();
      await Api.upsert('Snapshots', row);
      await Store.loadAll();
      App.rerender();
    });
  }

  return { render, afterRender };
})();
