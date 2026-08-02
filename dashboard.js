const DashboardView = (() => {
  let chartInstance = null;

  function render() {
    const nw = Store.netWorth('All');
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

    return `
      <div class="card">
        <h3>Household Net Worth</h3>
        <div class="big-number num">${Store.formatMoney(nw)}</div>
        <span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Store.formatMoney(Math.abs(delta))} (${Math.abs(deltaPct).toFixed(1)}%) this month</span>
        <div class="chart-wrap"><canvas id="nw-chart"></canvas></div>
      </div>

      <div class="card">
        <h3>By Asset Type</h3>
        ${typeRows || emptyRow('No accounts yet — add one under Accounts')}
      </div>

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
    if (!ctx) return;
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

    document.querySelectorAll('[data-view-link]').forEach(el => {
      el.addEventListener('click', (e) => { e.preventDefault(); App.navigate(el.dataset.viewLink); });
    });
  }

  return { render, afterRender };
})();
