const TrendsView = (() => {
  let period = 'all'; // 'all' | 'YYYY-MM'

  function render() {
    const periods = Store.transactionMonthOptions();
    const txns = Store.transactionsForPeriod(period);

    const byCategory = {};
    txns.forEach(t => {
      if (Number(t.amount) < 0 && t.category !== 'Transfer') {
        byCategory[t.category] = (byCategory[t.category] || 0) + Math.abs(Number(t.amount));
      }
    });
    const categoryRows = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => `
        <div class="ledger-row">
          <div class="ledger-main"><span class="ledger-name">${cat}</span></div>
          <div class="ledger-amount num">${Store.formatMoney(total)}</div>
        </div>
      `).join('');

    const topExpenses = txns
      .filter(t => Number(t.amount) < 0 && t.category !== 'Transfer')
      .sort((a, b) => Number(a.amount) - Number(b.amount))
      .slice(0, 10);

    const topRefunds = txns
      .filter(t => Number(t.amount) > 0 && t.category !== 'Transfer' && t.category !== 'Income')
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 3);

    const recurring = dedupeRecurring(txns.filter(t => isRecurring(t.recurring)));

    return `
      <div class="filter-row">
        <select id="period-select" style="width:auto; font-size:0.82rem; padding:6px 8px;">
          <option value="all" ${period === 'all' ? 'selected' : ''}>All Time</option>
          ${periods.map(p => `<option value="${p}" ${p === period ? 'selected' : ''}>${monthLabel(p)}</option>`).join('')}
        </select>
      </div>

      <div class="card">
        <h3>Spend by Category</h3>
        ${categoryRows || '<div class="empty-state">No spend transactions in this period</div>'}
      </div>

      <div class="card">
        <h3>Recurring Subscriptions</h3>
        <div class="ledger-sub" style="margin-bottom:6px;">Flagged as repeating — worth a quick review.</div>
        ${recurring.length ? recurring.map(t => `
          <div class="ledger-row">
            <div class="ledger-main">
              <span class="ledger-name">${t.description}</span>
              <span class="ledger-sub">${t.category} · last ${t.date ? new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</span>
            </div>
            <div class="ledger-amount num">${Store.formatMoney(Math.abs(t.amount))}</div>
          </div>
        `).join('') : '<div class="empty-state">None detected in this period</div>'}
      </div>

      <div class="card">
        <h3>Top 10 Highest Expenses</h3>
        ${topExpenses.length ? topExpenses.map(t => `
          <div class="ledger-row">
            <div class="ledger-main">
              <span class="ledger-name">${t.description}</span>
              <span class="ledger-sub">${t.category} · ${t.date ? new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</span>
            </div>
            <div class="ledger-amount num">${Store.formatMoney(Math.abs(t.amount))}</div>
          </div>
        `).join('') : '<div class="empty-state">No expenses in this period</div>'}
      </div>

      <div class="card">
        <h3>Top 3 Refunds / Returns</h3>
        ${topRefunds.length ? topRefunds.map(t => `
          <div class="ledger-row">
            <div class="ledger-main">
              <span class="ledger-name">${t.description}</span>
              <span class="ledger-sub">${t.category} · ${t.date ? new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</span>
            </div>
            <div class="ledger-amount num">${Store.formatMoney(t.amount)}</div>
          </div>
        `).join('') : '<div class="empty-state">None in this period</div>'}
      </div>

      <div class="card">
        <div class="empty-state">Threshold and smart trend alerts land in a future update.</div>
      </div>
    `;
  }

  function monthLabel(p) {
    return new Date(Number(p.slice(0,4)), Number(p.slice(5,7))-1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function isRecurring(val) {
    return val === true || val === 'TRUE' || val === 'true';
  }

  // One row per merchant keyword, keeping the most recent occurrence
  function dedupeRecurring(txns) {
    const byKeyword = {};
    txns.forEach(t => {
      const key = Categorize.extractKeyword(t.description);
      if (!byKeyword[key] || new Date(t.date) > new Date(byKeyword[key].date)) {
        byKeyword[key] = t;
      }
    });
    return Object.values(byKeyword).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }

  function afterRender() {
    document.getElementById('period-select')?.addEventListener('change', (e) => {
      period = e.target.value;
      App.rerender();
    });
  }

  return { render, afterRender };
})();
