const TrendsView = (() => {
  let period = 'all'; // 'all' | 'YYYY-MM'
  let threeMonthChart = null;

  const CHART_COLORS = ['#1F6E5C', '#C97A3E', '#35507A', '#7A5A72', '#9B8B4E', '#5A7A6E'];

  function threeMonthCategoryData() {
    const now = new Date();
    const currentKey = now.toISOString().slice(0, 7);
    const hasCurrentMonthData = Store.state.transactions.some(t => (t.date || '').slice(0, 7) === currentKey);
    // Skip the current month unless it actually has data yet, so a nearly-empty
    // in-progress month doesn't make everything look like a cliff.
    const endOffset = hasCurrentMonthData ? 0 : 1;
    const ordered = [0, 1, 2].map(i => new Date(now.getFullYear(), now.getMonth() - (2 - i) - endOffset, 1));
    const monthKeys = ordered.map(d => d.toISOString().slice(0, 7));

    const byCatMonth = {};
    Store.state.transactions.forEach(t => {
      if (Number(t.amount) >= 0 || t.category === 'Transfer') return;
      const idx = monthKeys.indexOf((t.date || '').slice(0, 7));
      if (idx === -1) return;
      if (!byCatMonth[t.category]) byCatMonth[t.category] = [0, 0, 0];
      byCatMonth[t.category][idx] += Math.abs(Number(t.amount));
    });
    const top = Object.entries(byCatMonth)
      .map(([cat, vals]) => ({ cat, total: vals.reduce((a, b) => a + b, 0), vals }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
    return { labels: ordered.map(d => d.toLocaleDateString('en-US', { month: 'short' })), series: top };
  }

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
      .slice(0, 7);

    const topRefunds = txns
      .filter(t => Number(t.amount) > 0 && t.category !== 'Transfer' && t.category !== 'Income')
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 3);

    const recurring = Store.recurringSummary(12, 2).filter(g => !isHidden(g.keyword));

    return `
      <div class="filter-row">
        <select id="period-select" style="width:auto; font-size:0.82rem; padding:6px 8px;">
          <option value="all" ${period === 'all' ? 'selected' : ''}>All Time</option>
          ${periods.map(p => `<option value="${p}" ${p === period ? 'selected' : ''}>${monthLabel(p)}</option>`).join('')}
        </select>
      </div>

      <div class="card">
        <h3>Last 3 Months by Category</h3>
        <div class="ledger-sub" style="margin-bottom:6px;">See what's trending up or down.</div>
        <div class="chart-wrap" style="height:230px;"><canvas id="three-month-chart"></canvas></div>
      </div>

      <div class="card">
        <h3>Spend by Category</h3>
        ${categoryRows || '<div class="empty-state">No spend transactions in this period</div>'}
      </div>

      <div class="card">
        <h3>Recurring Subscriptions</h3>
        <div class="ledger-sub" style="margin-bottom:6px;">Detected from 3+ months of activity in the trailing 12 — drops off after 2 months of no charge.</div>
        ${recurring.length ? recurring.map(g => `
          <div class="ledger-row">
            <div class="ledger-main">
              <span class="ledger-name">${g.latest.description}</span>
              <span class="ledger-sub">${g.category} · ${g.months.size} of last 12 months · last ${new Date(g.latest.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            </div>
            <div style="text-align:right;">
              <div class="ledger-amount num">${Store.formatMoney(Math.abs(g.latest.amount))}<span class="ledger-sub"> /mo</span></div>
              <div class="ledger-sub num">${Store.formatMoney(g.total)} /12mo</div>
              <button class="ghost" data-hide-keyword="${g.keyword}" style="font-size:0.7rem; padding:2px 4px;">Not recurring</button>
            </div>
          </div>
        `).join('') : '<div class="empty-state">None detected in this period</div>'}
        ${hiddenKeywords().length ? `<a class="link" id="show-hidden-link" style="display:block; margin-top:10px;">${hiddenKeywords().length} hidden — show again</a>` : ''}
      </div>

      <div class="card">
        <h3>Top 7 Highest Expenses</h3>
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

      ${renderRuleManager()}
    `;
  }

  function renderRuleManager() {
    const rules = Store.state.categoryRules.slice().sort((a, b) => (a.keyword || '').localeCompare(b.keyword || ''));
    const rows = rules.map(r => `
      <div class="ledger-row" style="flex-wrap:wrap; gap:6px;" data-rule-id="${r.id}">
        <input data-rule-keyword="${r.id}" value="${r.keyword || ''}" style="flex:1; min-width:90px; font-size:0.82rem; padding:6px;">
        <select data-rule-matchtype="${r.id}" style="width:auto; font-size:0.78rem; padding:5px;">${Categorize.matchTypeOptions(r.matchType)}</select>
        <select data-rule-category="${r.id}" style="width:auto; font-size:0.78rem; padding:5px;">${Categorize.categoryOptions(r.category)}</select>
        <button class="ghost" data-rule-delete="${r.id}" style="font-size:0.75rem;">✕</button>
      </div>
    `).join('');

    return `
      <details class="card">
        <summary style="cursor:pointer; font-family:'Fraunces',serif; font-weight:600; font-size:1.05rem;">Category Rules (${rules.length})</summary>
        <div class="ledger-sub" style="margin:8px 0;">Edit how transactions get auto-categorized. Changes apply to future uploads.</div>
        ${rows || '<div class="empty-state">No rules yet — they get created automatically as you categorize transactions</div>'}
      </details>
    `;
  }

  function monthLabel(p) {
    return new Date(Number(p.slice(0,4)), Number(p.slice(5,7))-1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function hiddenKeywords() {
    return Store.state.recurringOverrides.map(r => r.keyword);
  }

  function isHidden(keyword) {
    return hiddenKeywords().includes(keyword);
  }

  async function hideKeyword(keyword) {
    await Api.upsert('RecurringOverrides', { keyword });
    await Store.loadAll();
  }

  async function clearHidden() {
    for (const r of Store.state.recurringOverrides) {
      await Api.remove('RecurringOverrides', r.id);
    }
    await Store.loadAll();
  }

  function afterRender() {
    const { labels, series } = threeMonthCategoryData();
    const ctx = document.getElementById('three-month-chart');
    if (ctx) {
      if (threeMonthChart) threeMonthChart.destroy();
      threeMonthChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: series.map((s, i) => ({
            label: s.cat,
            data: s.vals,
            borderColor: CHART_COLORS[i % CHART_COLORS.length],
            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3
          }))
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
          scales: {
            y: { ticks: { callback: v => Store.formatMoney(v) }, grid: { color: '#E2E0D8' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    document.getElementById('period-select')?.addEventListener('change', (e) => {
      period = e.target.value;
      App.rerender();
    });

    document.querySelectorAll('[data-hide-keyword]').forEach(btn => {
      btn.addEventListener('click', async () => {
        App.showSaving();
        await hideKeyword(btn.dataset.hideKeyword);
        App.rerender();
      });
    });
    document.getElementById('show-hidden-link')?.addEventListener('click', async () => {
      App.showSaving();
      await clearHidden();
      App.rerender();
    });

    document.querySelectorAll('[data-rule-keyword]').forEach(el => {
      el.addEventListener('change', async () => {
        App.showSaving();
        await Categorize.updateRule(el.dataset.ruleKeyword, { keyword: el.value.trim().toUpperCase() });
        App.rerender();
      });
    });
    document.querySelectorAll('[data-rule-matchtype]').forEach(el => {
      el.addEventListener('change', async () => {
        App.showSaving();
        await Categorize.updateRule(el.dataset.ruleMatchtype, { matchType: el.value });
        App.rerender();
      });
    });
    document.querySelectorAll('[data-rule-category]').forEach(el => {
      el.addEventListener('change', async () => {
        App.showSaving();
        await Categorize.updateRule(el.dataset.ruleCategory, { category: el.value });
        App.rerender();
      });
    });
    document.querySelectorAll('[data-rule-delete]').forEach(el => {
      el.addEventListener('click', async () => {
        App.showSaving();
        await Categorize.deleteRule(el.dataset.ruleDelete);
        App.rerender();
      });
    });
  }

  return { render, afterRender };
})();
