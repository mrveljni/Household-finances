const Store = (() => {
  const state = {
    accounts: [],
    snapshots: [],
    transactions: [],
    goals: [],
    plannedExpenses: [],
    categoryRules: [],
    fxRates: { CAD: 1 },
    loaded: false
  };

  async function loadAll() {
    const [accounts, snapshots, transactions, goals, plannedExpenses, categoryRules] = await Promise.all([
      Api.get('Accounts'),
      Api.get('Snapshots'),
      Api.get('Transactions'),
      Api.get('Goals'),
      Api.get('PlannedExpenses'),
      Api.get('CategoryRules')
    ]);
    state.accounts = accounts;
    state.snapshots = snapshots;
    state.transactions = transactions;
    state.goals = goals;
    state.plannedExpenses = plannedExpenses;
    state.categoryRules = categoryRules;
    state.loaded = true;
    await loadFx();
    return state;
  }

  async function loadFx() {
    try {
      const cached = localStorage.getItem('hft_fx');
      const cachedAt = localStorage.getItem('hft_fx_at');
      const oneDay = 24 * 60 * 60 * 1000;
      if (cached && cachedAt && (Date.now() - Number(cachedAt) < oneDay)) {
        state.fxRates = JSON.parse(cached);
        return;
      }
      const res = await fetch(CONFIG.FX_API_URL + CONFIG.HOME_CURRENCY);
      const data = await res.json();
      if (data && data.rates) {
        // rates are FROM home currency TO other currencies; invert for "amount in X -> home"
        const inverted = {};
        Object.keys(data.rates).forEach(cur => { inverted[cur] = 1 / data.rates[cur]; });
        inverted[CONFIG.HOME_CURRENCY] = 1;
        state.fxRates = inverted;
        localStorage.setItem('hft_fx', JSON.stringify(inverted));
        localStorage.setItem('hft_fx_at', String(Date.now()));
      }
    } catch (err) {
      console.warn('FX fetch failed, using cached/fallback', err);
      const cached = localStorage.getItem('hft_fx');
      if (cached) state.fxRates = JSON.parse(cached);
    }
  }

  function toHomeCurrency(amount, currency) {
    const rate = state.fxRates[currency];
    if (!rate) return amount; // unknown currency, assume 1:1 rather than silently zeroing
    return amount * rate;
  }

  // Latest snapshot balance per account
  function latestSnapshotFor(accountId) {
    const rows = state.snapshots
      .filter(s => s.accountId === accountId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return rows[0] || null;
  }

  function accountValue(account) {
    const snap = latestSnapshotFor(account.id);
    if (!snap) return 0;
    if (account.type === 'Private Stock' && snap.shares && snap.pricePerShare) {
      return Number(snap.shares) * Number(snap.pricePerShare);
    }
    return Number(snap.balance) || 0;
  }

  // Credit cards paid off in full monthly aren't a real asset or liability —
  // they're only used to tag/track spend, so they're excluded from net worth.
  function isNetWorthAccount(a) {
    return a.type !== 'Credit Card';
  }

  function netWorth(ownerFilter) {
    let accounts = state.accounts.filter(isNetWorthAccount);
    if (ownerFilter && ownerFilter !== 'All') accounts = accounts.filter(a => a.owner === ownerFilter);
    return accounts.reduce((sum, a) => sum + toHomeCurrency(accountValue(a), a.currency), 0);
  }

  function netWorthByType(ownerFilter) {
    let accounts = state.accounts.filter(isNetWorthAccount);
    if (ownerFilter && ownerFilter !== 'All') accounts = accounts.filter(a => a.owner === ownerFilter);
    const byType = {};
    accounts.forEach(a => {
      const val = toHomeCurrency(accountValue(a), a.currency);
      byType[a.type] = (byType[a.type] || 0) + val;
    });
    return byType;
  }

  // Net worth trend by month, using latest snapshot on/before each month-end
  function netWorthTrend(monthsBack = 12, ownerFilter) {
    let accounts = state.accounts.filter(isNetWorthAccount);
    if (ownerFilter && ownerFilter !== 'All') accounts = accounts.filter(a => a.owner === ownerFilter);
    const months = [];
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d);
    }
    return months.map(monthDate => {
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      let total = 0;
      accounts.forEach(a => {
        const snaps = state.snapshots
          .filter(s => s.accountId === a.id && new Date(s.date) <= monthEnd)
          .sort((x, y) => new Date(y.date) - new Date(x.date));
        if (snaps[0]) {
          const snap = snaps[0];
          const val = (a.type === 'Private Stock' && snap.shares && snap.pricePerShare)
            ? Number(snap.shares) * Number(snap.pricePerShare)
            : Number(snap.balance) || 0;
          total += toHomeCurrency(val, a.currency);
        }
      });
      return { label: monthDate.toLocaleDateString('en-US', { month: 'short' }), value: total };
    });
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: CONFIG.HOME_CURRENCY, maximumFractionDigits: 0 }).format(amount || 0);
  }

  return {
    state, loadAll, toHomeCurrency, latestSnapshotFor, accountValue,
    netWorth, netWorthByType, netWorthTrend, formatMoney
  };
})();
