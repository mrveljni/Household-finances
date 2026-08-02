const GoalsView = (() => {
  function render() {
    const goalRows = Store.state.goals.map(g => {
      const pct = g.targetAmount ? Math.min(100, (Number(g.allocatedAmount) / Number(g.targetAmount)) * 100) : 0;
      return `
        <div class="card" data-goal-id="${g.id}">
          <div style="display:flex; justify-content:space-between;">
            <h3>${g.name}</h3>
            <span class="pill">${g.priority || ''}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin:6px 0;">
            <span class="num">${Store.formatMoney(g.allocatedAmount)} / ${Store.formatMoney(g.targetAmount)}</span>
            <span class="ledger-sub">by ${g.targetDate ? new Date(g.targetDate).toLocaleDateString('en-US',{year:'numeric',month:'short'}) : '—'}</span>
          </div>
          <div style="background:var(--surface-sunken); border-radius:6px; height:6px; overflow:hidden;">
            <div style="background:var(--accent); height:100%; width:${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');

    const plannedRows = Store.state.plannedExpenses
      .sort((a,b) => new Date(a.period) - new Date(b.period))
      .map(pe => `
      <div class="ledger-row" data-planned-id="${pe.id}">
        <div class="ledger-main">
          <span class="ledger-name">${pe.name}</span>
          <span class="ledger-sub">${pe.tag || ''}</span>
        </div>
        <div style="text-align:right;">
          <div class="ledger-amount num">${Store.formatMoney(pe.amount)}</div>
          <div class="ledger-sub">${pe.period ? new Date(pe.period).toLocaleDateString('en-US',{year:'numeric',month:'short'}) : ''}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="section-label">Goals</div>
      ${goalRows || '<div class="card"><div class="empty-state">No goals yet</div></div>'}
      <button id="add-goal-btn" class="secondary" style="width:100%; margin-bottom:10px;">+ Add Goal</button>

      <div class="section-label">Planned Future Expenses</div>
      <div class="card">
        ${plannedRows || '<div class="empty-state">None yet — e.g. a wedding, trip, or big purchase you know is coming</div>'}
      </div>
      <button id="add-planned-btn" class="secondary" style="width:100%;">+ Add Planned Expense</button>
    `;
  }

  function afterRender() {
    document.getElementById('add-goal-btn')?.addEventListener('click', () => openGoalForm());
    document.getElementById('add-planned-btn')?.addEventListener('click', () => openPlannedForm());
    document.querySelectorAll('[data-goal-id]').forEach(el => {
      el.addEventListener('click', () => openGoalForm(Store.state.goals.find(g => g.id === el.dataset.goalId)));
    });
    document.querySelectorAll('[data-planned-id]').forEach(el => {
      el.addEventListener('click', () => openPlannedForm(Store.state.plannedExpenses.find(p => p.id === el.dataset.plannedId)));
    });
  }

  function openGoalForm(existing) {
    App.openModal(`
      <h2>${existing ? 'Edit Goal' : 'Add Goal'}</h2>
      <label>Goal name</label>
      <input id="f-name" value="${existing?.name || ''}" placeholder="e.g. Daycare Fund">
      <div class="form-grid">
        <div><label>Target amount</label><input id="f-target" type="number" value="${existing?.targetAmount || ''}"></div>
        <div><label>Current amount</label><input id="f-allocated" type="number" value="${existing?.allocatedAmount || ''}"></div>
      </div>
      <div class="form-grid">
        <div><label>Target date</label><input id="f-date" type="date" value="${existing?.targetDate ? new Date(existing.targetDate).toISOString().slice(0,10) : ''}"></div>
        <div><label>Priority</label><select id="f-priority">${['High','Medium','Low'].map(p => `<option ${existing?.priority===p?'selected':''}>${p}</option>`).join('')}</select></div>
      </div>
      <div class="modal-actions">
        ${existing ? '<button class="secondary" id="delete-goal">Delete</button>' : ''}
        <button id="save-goal">Save</button>
      </div>
    `);
    document.getElementById('save-goal').addEventListener('click', async () => {
      const row = {
        id: existing?.id,
        name: document.getElementById('f-name').value.trim(),
        targetAmount: Number(document.getElementById('f-target').value || 0),
        allocatedAmount: Number(document.getElementById('f-allocated').value || 0),
        targetDate: document.getElementById('f-date').value,
        priority: document.getElementById('f-priority').value
      };
      if (!row.name) return;
      App.closeModal(); App.showSaving();
      await Api.upsert('Goals', row);
      await Store.loadAll();
      App.rerender();
    });
    if (existing) {
      document.getElementById('delete-goal').addEventListener('click', async () => {
        App.closeModal(); App.showSaving();
        await Api.remove('Goals', existing.id);
        await Store.loadAll();
        App.rerender();
      });
    }
  }

  function openPlannedForm(existing) {
    App.openModal(`
      <h2>${existing ? 'Edit' : 'Add'} Planned Expense</h2>
      <label>Name</label>
      <input id="f-name" value="${existing?.name || ''}" placeholder="e.g. Sarah's Wedding">
      <div class="form-grid">
        <div><label>Amount</label><input id="f-amount" type="number" value="${existing?.amount || ''}"></div>
        <div><label>Month</label><input id="f-period" type="month" value="${existing?.period ? new Date(existing.period).toISOString().slice(0,7) : ''}"></div>
      </div>
      <label>Tag (optional)</label>
      <input id="f-tag" value="${existing?.tag || ''}" placeholder="links to matching transactions">
      <div class="modal-actions">
        ${existing ? '<button class="secondary" id="delete-planned">Delete</button>' : ''}
        <button id="save-planned">Save</button>
      </div>
    `);
    document.getElementById('save-planned').addEventListener('click', async () => {
      const row = {
        id: existing?.id,
        name: document.getElementById('f-name').value.trim(),
        amount: Number(document.getElementById('f-amount').value || 0),
        period: document.getElementById('f-period').value ? document.getElementById('f-period').value + '-01' : '',
        tag: document.getElementById('f-tag').value.trim()
      };
      if (!row.name) return;
      App.closeModal(); App.showSaving();
      await Api.upsert('PlannedExpenses', row);
      await Store.loadAll();
      App.rerender();
    });
    if (existing) {
      document.getElementById('delete-planned').addEventListener('click', async () => {
        App.closeModal(); App.showSaving();
        await Api.remove('PlannedExpenses', existing.id);
        await Store.loadAll();
        App.rerender();
      });
    }
  }

  return { render, afterRender };
})();
