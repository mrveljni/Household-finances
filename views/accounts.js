const AccountsView = (() => {
  let ownerFilter = 'All';

  function render() {
    const filtered = ownerFilter === 'All'
      ? Store.state.accounts
      : Store.state.accounts.filter(a => a.owner === ownerFilter);

    const rows = filtered.map(a => {
      const val = Store.toHomeCurrency(Store.accountValue(a), a.currency);
      const snap = Store.latestSnapshotFor(a.id);
      return `
        <div class="ledger-row" data-account-id="${a.id}">
          <div class="ledger-main">
            <span class="owner-dot ${ownerClass(a.owner)}"></span>
            <span class="ledger-name">${a.name}</span>
            <span class="ledger-sub">${a.institution || ''}</span>
          </div>
          <div style="text-align:right;">
            <div class="ledger-amount num">${Store.formatMoney(val)}</div>
            <div class="ledger-sub">${snap ? new Date(snap.date).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'no snapshot'}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="filter-row">
        ${['All', 'Mine', 'His', 'Joint'].map(o => `
          <button class="pill ${ownerFilter === o ? 'active' : ''}" data-owner-filter="${o}">${o}</button>
        `).join('')}
      </div>

      <div class="card">
        <h3>Net Worth (${ownerFilter})</h3>
        <div class="big-number num">${Store.formatMoney(Store.netWorth(ownerFilter))}</div>
      </div>

      <div class="card">
        <h3>Accounts</h3>
        ${rows || `<div class="empty-state">No accounts yet.<br><br><button id="add-account-btn">Add your first account</button></div>`}
      </div>

      ${filtered.length ? `<button id="add-account-btn-2" class="secondary" style="width:100%;">+ Add Account</button>` : ''}
    `;
  }

  function ownerClass(owner) {
    if (owner === 'Mine') return 'mine';
    if (owner === 'His') return 'his';
    return 'joint';
  }

  function afterRender() {
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
            ${['Mine', 'His', 'Joint'].map(o => `<option ${existing?.owner === o ? 'selected' : ''}>${o}</option>`).join('')}
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
        ${['Cash', 'Investment', 'Private Stock'].map(t => `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
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
    const snaps = Store.state.snapshots
      .filter(s => s.accountId === accountId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const snapRows = snaps.map(s => `
      <div class="ledger-row">
        <div class="ledger-sub">${new Date(s.date).toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'})}</div>
        <div class="ledger-amount num">${account.type === 'Private Stock' ? Store.formatMoney(Number(s.shares) * Number(s.pricePerShare)) : new Intl.NumberFormat('en-CA', {style:'currency', currency: account.currency}).format(s.balance)}</div>
      </div>
    `).join('');

    App.openModal(`
      <h2>${account.name}</h2>
      <div class="ledger-sub" style="margin-bottom:10px;">${account.institution} · ${account.owner} · ${account.currency}</div>
      <button id="edit-account-btn" class="secondary" style="width:100%; margin-bottom:14px;">Edit account</button>
      <div class="section-label">Snapshots</div>
      ${snapRows || '<div class="empty-state">No snapshots yet</div>'}
      <button id="add-snapshot-btn" style="width:100%; margin-top:12px;">+ Add Snapshot</button>
    `);

    document.getElementById('edit-account-btn').addEventListener('click', () => openAccountForm(account));
    document.getElementById('add-snapshot-btn').addEventListener('click', () => openSnapshotForm(account));
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
