const TrendsView = (() => {
  function render() {
    const txns = [...Store.state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const byCategory = {};
    txns.forEach(t => {
      if (Number(t.amount) < 0) {
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

    const recentRows = txns.slice(0, 25).map(t => `
      <div class="ledger-row">
        <div class="ledger-main">
          <span class="owner-dot ${ownerClass(t.owner)}"></span>
          <span class="ledger-name">${t.description}</span>
          <span class="ledger-sub">${t.category}${t.recurring ? ' \u00b7 recurring' : ''}</span>
        </div>
        <div style="text-align:right;">
          <div class="ledger-amount num">${Number(t.amount) < 0 ? '-' : ''}${Store.formatMoney(Math.abs(t.amount))}</div>
          <div class="ledger-sub">${t.date ? new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="card">
        <h3>Spend by Category (all time)</h3>
        ${categoryRows || '<div class="empty-state">No spend transactions yet — try Upload</div>'}
      </div>
      <div class="card">
        <h3>Recent Transactions</h3>
        ${recentRows || '<div class="empty-state">Nothing uploaded yet</div>'}
      </div>
      <div class="card">
        <div class="empty-state">Threshold and smart trend alerts land in Stage 3.</div>
      </div>
    `;
  }

  function ownerClass(owner) {
    if (owner === 'Mine') return 'mine';
    if (owner === 'His') return 'his';
    return 'joint';
  }

  function afterRender() {}
  return { render, afterRender };
})();
