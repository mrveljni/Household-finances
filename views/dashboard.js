const DashboardView = (() => {
  let chartInstance = null;
  let selectedMonth = null; // 'YYYY-MM' or null = latest

  function render() {
    const nw = Store.netWorth('All');
    const totalIncl = Store.totalNetWorthIncludingRestricted('All');
    const excluded = Store.excludedFromNetWorth('All');
    const byType = Store.netWorthByType('All');
    const trend = Store.netWorthTrend(12, 'All');

    const prevMonth = trend.length > 1 ? trend[trend.length - 2].value : nw;
    const delta = nw - prevMonth;
    const deltaPct = prevMonth ? (delta / prevMonth * 100) : 0;

    const typeRows = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, val]) => `
        <div class="ledger-row">
          <div class="ledger-main"><span class="ledger-name">${type}</span></div>
          <div class="ledger-amount num">${Store.formatMoney(val)}</div>
        </div>
      `).join('');

    const goalsHtml = renderGoalsSummary();
    const prediction = computeYearEndPrediction();

    const excludedRows = excluded.map(e => `
      <div class="ledger-row">
        <div class="ledger-main">
          <span class="ledger-name">${e.account.name}</span>
          <span class="ledger-sub">${e.reason}</span>
        </div>
        <div class="ledger-amount num">${Store.formatMoney(e.value)}</div>
      </div>
    `).join('') || '<div class="empty-state">Nothing excluded</div>';

    return `
      <div class="card">
        <div style="display:flex; align-items:baseline; gap:6px;">
          <h3>Liquid Net Worth</h3>
          <button class="ghost" id="nw-info-btn" style="font-size:0.85rem; padding:0 4px;">ⓘ</button>
        </div>
        <div class="big-number num">${Store.formatMoney(nw)}</div>
        <span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Store.formatMoney(Math.abs(delta))} (${Math.abs(deltaPct).toFixed(1)}%) this month</span>
        <div id="nw-info-panel" style="display:none; margin-top:14px; padding-top:12px; border-top:1px solid var(--border);">
          <div class="ledger-sub" style="margin-bottom:6px;">Excluded from Liquid Net Worth (${Store.formatMoney(totalIncl - nw)} total):</div>
          ${excludedRows}
          <div class="ledger-sub" style="margin-top:8px;">Total incl. these: <span class="num">${Store.formatMoney(totalIncl)}</span></div>
        </div>
        <div class="chart-wrap"><canvas id="nw-chart"></canvas></div>
      </div>

      <div class="card">
        <h3>By Asset Type</h3>
        ${typeRows || emptyRow('No accounts yet — add one under Accounts')}
      </div>

      ${renderPerPerson()}

      ${renderMonthDrilldown()}

      <div class="card">
        <h3>Year-End Savings Estimate</h3>
        <div class="big-number num">${Store.formatMoney(prediction.yearEndEstimate)}</div>
        <div style="color:var(--text-muted); font-size:0.82rem; margin-top:4px;">
          Based on avg. monthly change of ${Store.formatMoney(prediction.avgMonthlyChange)}, minus ${Store.formatMoney(prediction.remainingPlannedExpenses)} in planned expenses through year end.
        </div>
      </div>

      <div class="card">
        <h3>Goals</h3>
        ${goalsHtml}
      </div>
    `;
  }

  function renderPerPerson() {
    const breakdown = Store.perPersonTypeBreakdown();
    const owners = ['Mine', 'His', 'Joint'];
    const rows = owners.map(o => {
      const { cash, investment } = breakdown[o];
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex; align-items:center; margin-bottom:6px;">
            <span class="owner-dot ${o==='Mine'?'mine':o==='His'?'his':'joint'}"></span>
            <span class="ledger-name" style="font-weight:700;">${o}</span>
          </div>
          <div class="ledger-row" style="padding:4px 0;">
            <div class="ledger-sub">Cash</div>
            <div class="ledger-amount num">${Store.formatMoney(cash)}</div>
          </div>
          <div class="ledger-row" style="padding:4px 0;">
            <div class="ledger-sub">Investments</div>
            <div class="ledger-amount num">${Store.formatMoney(investment)}</div>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="card">
        <h3>Cash vs. Investments by Person</h3>
        ${rows}
      </div>
    `;
  }

  function renderMonthDrilldown() {
    const months = Store.snapshotMonthOptions();
    if (!months.length) return '';
    const month = selectedMonth && months.includes(selectedMonth) ? selectedMonth : months[0];
    const { byType, byOwner, total } = Store.monthBreakdown(month);
    const topExpenses = Store.topExpensesForMonth(month, 5);

    const monthLabel = new Date(Number(month.slice(0,4)), Number(month.slice(5,7))-1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const typeRows = Object.entries(byType).sort((a,b) => b[1]-a[1]).map(([t, v]) => `
      <div class="ledger-row">
        <div class="ledger-main"><span class="ledger-name">${t}</span></div>
        <div class="ledger-amount num">${Store.formatMoney(v)}</div>
      </div>
    `).join('') || emptyRow('No data for this month');

    const ownerRows = ['Mine','His','Joint'].map(o => `
      <div class="ledger-row">
        <div class="ledger-main">
          <span class="owner-dot ${o==='Mine'?'mine':o==='His'?'his':'joint'}"></span>
          <span class="ledger-name">${o}</span>
        </div>
        <div class="ledger-amount num">${Store.formatMoney(byOwner[o] || 0)}</div>
      </div>
    `).join('');

    const expenseRows = topExpenses.map(t => `
      <div class="ledger-row">
        <div class="ledger-main">
          <span class="ledger-name">${t.description}</span>
          <span class="ledger-sub">${t.category}</span>
        </div>
        <div class="ledger-amount num">${Store.formatMoney(Math.abs(t.amount))}</div>
      </div>
    `).join('') || emptyRow('No expenses logged this month');

    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h3>Month Snapshot</h3>
          <select id="month-select" style="width:auto; font-size:0.82rem; padding:6px 8px;">
            ${months.map(m => `<option value="${m}" ${m===month?'selected':''}>${new Date(Number(m.slice(0,4)), Number(m.slice(5,7))-1, 1).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</option>`).join('')}
          </select>
        </div>
        <div class="ledger-sub" style="margin-bottom:2px;">${monthLabel} total</div>
        <div class="big-number num" style="font-size:1.5rem;">${Store.formatMoney(total)}</div>

        <div class="section-label">By Asset Type</div>
        ${typeRows}

        <div class="section-label">By Owner</div>
        ${ownerRows}

        <div class="section-label">Top 5 Expenses</div>
        ${expenseRows}
      </div>
    `;
  }

  function emptyRow(msg) {
    return `<div class="empty-state">${msg}</div>`;
  }

  function renderGoalsSummary() {
    if (!Store.state.goals.length) return emptyRow('No goals yet — add one under Goals');
    return Store.state.goals.slice(0, 3).map(g => {
      const pct = g.targetAmount ? Math.min(100, (Number(g.allocatedAmount) / Number(g.targetAmount)) * 100) : 0;
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
            <span>${g.name}</span>
            <span class="num">${Store.formatMoney(g.allocatedAmount)} / ${Store.formatMoney(g.targetAmount)}</span>
          </div>
          <div style="background:var(--surface-sunken); border-radius:6px; height:6px; overflow:hidden;">
            <div style="background:var(--accent); height:100%; width:${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('') + `<a class="link" data-view-link="goals">View all goals →</a>`;
  }

  function computeYearEndPrediction() {
    const trend = Store.netWorthTrend(6, 'All');
    const changes = [];
    for (let i = 1; i < trend.length; i++) changes.push(trend[i].value - trend[i - 1].value);
    const avgMonthlyChange = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;

    const now = new Date();
    const monthsRemaining = 12 - now.getMonth() - 1;
    const currentNw = Store.netWorth('All');

    const remainingPlannedExpenses = Store.state.plannedExpenses
      .filter(pe => {
        const d = new Date(pe.period);
        return d.getFullYear() === now.getFullYear() && d.getMonth() >= now.getMonth();
      })
      .reduce((sum, pe) => sum + Number(pe.amount || 0), 0);

    const yearEndEstimate = currentNw + (avgMonthlyChange * monthsRemaining) - remainingPlannedExpenses;
    return { yearEndEstimate, avgMonthlyChange, remainingPlannedExpenses };
  }

  function afterRender() {
    const trend = Store.netWorthTrend(12, 'All');
    const ctx = document.getElementById('nw-chart');
    if (ctx) {
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trend.map(t => t.label),
          datasets: [{
            data: trend.map(t => t.value),
            borderColor: '#1F6E5C',
            backgroundColor: 'rgba(31,110,92,0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { callback: v => Store.formatMoney(v) }, grid: { color: '#E2E0D8' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    document.getElementById('nw-info-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('nw-info-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('month-select')?.addEventListener('change', (e) => {
      selectedMonth = e.target.value;
      App.rerender();
    });

    document.querySelectorAll('[data-view-link]').forEach(el => {
      el.addEventListener('click', (e) => { e.preventDefault(); App.navigate(el.dataset.viewLink); });
    });
  }

  return { render, afterRender };
})();
