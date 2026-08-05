const DashboardView = (() => {
  let chartInstance = null;
  let forecastChartInstance = null;
  let selectedMonth = null;
  let liquidPanelOpen = false;

  function render() {
    const nw = Store.netWorth('All');
    const totalIncl = Store.totalNetWorthIncludingRestricted('All');
    const trend = Store.netWorthTrend(12, 'All');

    const prevMonth = trend.length > 1 ? trend[trend.length - 2].value : nw;
    const delta = nw - prevMonth;
    const deltaPct = prevMonth ? (delta / prevMonth * 100) : 0;

    const byType = Store.netWorthByType('All');
    const typeRows = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, val]) => `
        <div class="ledger-row">
          <div class="ledger-main"><span class="ledger-name">${type}</span></div>
          <div class="ledger-amount num">${Store.formatMoney(val)}</div>
        </div>
      `).join('');

    return `
      <div class="card">
        <div style="display:flex; align-items:baseline; gap:6px;">
          <h3>Liquid Net Worth</h3>
          <button class="ghost" id="nw-info-btn" style="font-size:0.85rem; padding:0 4px;">ⓘ</button>
        </div>
        <div class="big-number num">${Store.formatMoney(nw)}</div>
        <span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Store.formatMoney(Math.abs(delta))} (${Math.abs(deltaPct).toFixed(1)}%) this month</span>
        <div id="nw-info-panel" style="display:${liquidPanelOpen ? 'block' : 'none'}; margin-top:14px; padding-top:12px; border-top:1px solid var(--border);">
          <div class="ledger-sub" style="margin-bottom:6px;">Total including restricted/excluded: <span class="num">${Store.formatMoney(totalIncl)}</span></div>
          ${renderLiquidChecklist()}
        </div>
        <div class="chart-wrap"><canvas id="nw-chart"></canvas></div>
      </div>

      <div class="card">
        <h3>By Asset Type</h3>
        ${typeRows || emptyRow('No accounts yet — add one under Accounts')}
      </div>

      ${renderPerPerson()}

      ${renderMonthDrilldown()}

      ${renderForecast()}

      <div class="card">
        <h3>Goals</h3>
        ${renderGoalsSummary()}
      </div>
    `;
  }

  function renderForecast() {
    const { labels, series, monthsRemaining } = Store.forecastToYearEnd();
    if (monthsRemaining <= 0) {
      return `
        <div class="card">
          <h3>Forecast to Year End</h3>
          <div class="empty-state">You're in the final month of the year — check back in January for next year's forecast.</div>
        </div>
      `;
    }
    const finalRows = series.map(s => `
      <div class="ledger-row">
        <div class="ledger-main"><span class="ledger-name">${s.type}</span></div>
        <div class="ledger-amount num">${Store.formatMoney(s.values[s.values.length - 1])}</div>
      </div>
    `).join('');
    return `
      <div class="card">
        <h3>Forecast to Year End</h3>
        <div class="ledger-sub" style="margin-bottom:6px;">Projected from each type's recent trend, with upcoming planned expenses subtracted from Cash.</div>
        <div class="chart-wrap"><canvas id="forecast-chart"></canvas></div>
        <div class="section-label">Projected December total</div>
        ${finalRows}
      </div>
    `;
  }

  function renderLiquidChecklist() {
    const list = Store.liquidToggleList().sort((a, b) => a.account.name.localeCompare(b.account.name));
    const rows = list.map(({ account, included }) => `
      <div class="ledger-row" style="padding:6px 0;">
        <div class="ledger-main">
          <span class="owner-dot ${account.owner==='Mine'?'mine':account.owner==='His'?'his':'joint'}"></span>
          <span class="ledger-name">${account.name}</span>
          <span class="ledger-sub">${Store.ownerLabel(account.owner)} · ${account.institution || '—'}</span>
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:var(--text-muted); flex-shrink:0;">
          <input type="checkbox" data-liquid-toggle="${account.id}" ${included ? 'checked' : ''} style="width:auto;">
          liquid
        </label>
      </div>
    `).join('');
    return `<details><summary style="cursor:pointer; font-size:0.82rem; color:var(--accent); font-weight:600;">Customize which accounts count →</summary><div style="margin-top:8px;">${rows}</div></details>`;
  }

  function emptyRow(msg) {
    return `<div class="empty-state">${msg}</div>`;
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
            <span class="ledger-name" style="font-weight:700;">${Store.ownerLabel(o)}</span>
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
    const matrix = Store.monthBreakdownMatrix(month);
    const total = matrix.reduce((s, r) => s + r.total, 0);
    const topExpenses = Store.topExpensesForMonth(month, 5);

    const monthLabel = new Date(Number(month.slice(0,4)), Number(month.slice(5,7))-1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const matrixRows = matrix.map(row => `
      <tr>
        <td style="padding:7px 4px; font-size:0.82rem;">${row.type}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.78rem; color:var(--owner-mine);">${shortMoney(row.Mine)}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.78rem; color:var(--owner-his);">${shortMoney(row.His)}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.78rem; color:var(--owner-joint);">${shortMoney(row.Joint)}</td>
        <td class="num" style="text-align:right; padding:7px 4px; font-size:0.82rem; font-weight:700;">${shortMoney(row.total)}</td>
      </tr>
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
        <div class="big-number num" style="font-size:1.5rem; margin-bottom:12px;">${Store.formatMoney(total)}</div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="text-align:left; padding:4px; font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Type</th>
              <th style="text-align:right; padding:4px; font-size:0.68rem; color:var(--owner-mine); text-transform:uppercase;">Niki</th>
              <th style="text-align:right; padding:4px; font-size:0.68rem; color:var(--owner-his); text-transform:uppercase;">Nico</th>
              <th style="text-align:right; padding:4px; font-size:0.68rem; color:var(--owner-joint); text-transform:uppercase;">Joint</th>
              <th style="text-align:right; padding:4px; font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Total</th>
            </tr>
          </thead>
          <tbody>${matrixRows}</tbody>
        </table>

        <div class="section-label">Top 5 Expenses</div>
        ${expenseRows}
      </div>
    `;
  }

  function shortMoney(v) {
    if (!v) return '—';
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: CONFIG.HOME_CURRENCY, maximumFractionDigits: 0, notation: 'compact' }).format(v);
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

    const { labels: fcLabels, series: fcSeries, monthsRemaining } = Store.forecastToYearEnd();
    const fcCtx = document.getElementById('forecast-chart');
    if (fcCtx && monthsRemaining > 0) {
      if (forecastChartInstance) forecastChartInstance.destroy();
      const fcColors = ['#1F6E5C', '#C97A3E', '#35507A', '#7A5A72'];
      forecastChartInstance = new Chart(fcCtx, {
        type: 'line',
        data: {
          labels: fcLabels,
          datasets: fcSeries.map((s, i) => ({
            label: s.type,
            data: s.values,
            borderColor: fcColors[i % fcColors.length],
            backgroundColor: fcColors[i % fcColors.length],
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

    document.getElementById('nw-info-btn')?.addEventListener('click', () => {
      liquidPanelOpen = !liquidPanelOpen;
      App.rerender();
    });

    document.querySelectorAll('[data-liquid-toggle]').forEach(el => {
      el.addEventListener('change', async () => {
        const account = Store.state.accounts.find(a => a.id === el.dataset.liquidToggle);
        const intended = el.checked ? 'Yes' : 'No';
        App.showSaving();
        await Store.setLiquidOverride(account, intended);
        await Store.loadAll();
        const updated = Store.state.accounts.find(a => a.id === account.id);
        if (updated && updated.liquidOverride !== intended) {
          alert('This didn\'t save — your Accounts sheet is missing the "liquidOverride" column. Add that header to the Accounts tab, then try again.');
          el.checked = !el.checked; // revert the visual state since it didn't actually save
        }
        App.rerender();
      });
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
