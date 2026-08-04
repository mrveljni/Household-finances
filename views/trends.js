const TrendsView = (() => {
  let period = 'all'; // 'all' | 'YYYY-MM'
  let threeMonthChart = null;

  const CHART_COLORS = ['#1F6E5C', '#C97A3E', '#35507A', '#7A5A72', '#9B8B4E', '#5A7A6E'];

  function threeMonthCategoryData() {
    const now = new Date();
    const months = [0, 1, 2].map(i => new Date(now.getFullYear(), now.getMonth() - (2 - i), 1));
    const monthKeys = months.map(d => d.toISOString().slice(0, 7));
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
    return { labels: months.map(d => d.toLocaleDateString('en-US', { month: 'short' })), series: top };
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
      .slice(0, 10);

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
        <div class="ledger-sub" style="margin-bottom:6px;">Detected from at least 3 months of activity in the trailing 12 — drops off on its own after 2 months of no charge.</div>
        ${recurring.length ? recurring.map(g => `
          <div class="ledger-row">
            <div class="ledger-main">
              <span class="ledger-name">${g.latest.description}</span>
              <span class="ledger-sub">${g.category} · ${g.months.size} of last 12 months · last ${new Date(g.latest.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            </div>
            <div style="text-align:right;">
              <div class="ledger-amount num">${Store.formatMoney(g.total)}<span class="ledger-sub"> /12mo</span></div>
              <button class="ghost" data-hide-keyword="${g.keyword}" style="font-size:0.7rem; padding:2px 4px;">Not recurring</button>
            </div>
          </div>
        `).join('') : '<div class="empty-state">None detected in this period</div>'}
        ${hiddenKeywords().length ? `<a class="link" id="show-hidden-link" style="display:block; margin-top:10px;">${hiddenKeywords().length} hidden — show again</a>` : ''}
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
  }

  return { render, afterRender };
})();
