const Store = (() => {
  const state = {
    accounts: [],
    snapshots: [],
    transactions: [],
    goals: [],
    plannedExpenses: [],
    categoryRules: [],
    recurringOverrides: [],
    fxRates: { CAD: 1 },
    loaded: false
  };

  async function loadAll() {
    const all = await Api.getAll();
    if (all) {
      state.accounts = all.Accounts || [];
      state.snapshots = all.Snapshots || [];
      state.transactions = all.Transactions || [];
      state.goals = all.Goals || [];
      state.plannedExpenses = all.PlannedExpenses || [];
      state.categoryRules = all.CategoryRules || [];
      state.recurringOverrides = all.RecurringOverrides || [];
    } else {
      // Older Apps Script deployment without the getAll endpoint — fall back
      const [accounts, snapshots, transactions, goals, plannedExpenses, categoryRules, recurringOverrides] = await Promise.all([
        Api.get('Accounts'), Api.get('Snapshots'), Api.get('Transactions'), Api.get('Goals'),
        Api.get('PlannedExpenses'), Api.get('CategoryRules'), Api.get('RecurringOverrides')
      ]);
      state.accounts = accounts; state.snapshots = snapshots; state.transactions = transactions;
      state.goals = goals; state.plannedExpenses = plannedExpenses; state.categoryRules = categoryRules;
      state.recurringOverrides = recurringOverrides;
    }
    state.loaded = true;
    await loadFx();
    return state;
  }

  // Instant paint from last-known-good local cache, no network — call this
  // before loadAll() so the UI isn't blank while waiting on the network.
  function loadFromCache() {
    state.accounts = Api.getCached('Accounts');
    state.snapshots = Api.getCached('Snapshots');
    state.transactions = Api.getCached('Transactions');
    state.goals = Api.getCached('Goals');
    state.plannedExpenses = Api.getCached('PlannedExpenses');
    state.categoryRules = Api.getCached('CategoryRules');
    state.recurringOverrides = Api.getCached('RecurringOverrides');
    try {
      const cachedFx = localStorage.getItem('hft_fx');
      if (cachedFx) state.fxRates = JSON.parse(cachedFx);
    } catch {}
    state.loaded = state.accounts.length > 0 || state.snapshots.length > 0;
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
    let accounts = state.accounts.filter(isLiquidNetWorthAccount);
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
    let accounts = state.accounts.filter(isLiquidNetWorthAccount);
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

  // ---- Month drill-down helpers (Dashboard) ----

  // All months ('YYYY-MM') that have at least one snapshot, most recent first
  function snapshotMonthOptions() {
    const months = new Set(state.snapshots.map(s => (s.date || '').slice(0, 7)).filter(Boolean));
    return Array.from(months).sort().reverse();
  }

  function valuesAsOfMonth(monthStr) {
    const monthEnd = new Date(Number(monthStr.slice(0,4)), Number(monthStr.slice(5,7)), 0);
    return state.accounts.filter(isLiquidNetWorthAccount).map(a => {
      const snaps = state.snapshots
        .filter(s => s.accountId === a.id && new Date(s.date) <= monthEnd)
        .sort((x, y) => new Date(y.date) - new Date(x.date));
      if (!snaps[0]) return null;
      const snap = snaps[0];
      const rawVal = (a.type === 'Private Stock' && snap.shares && snap.pricePerShare)
        ? Number(snap.shares) * Number(snap.pricePerShare)
        : Number(snap.balance) || 0;
      return { account: a, value: toHomeCurrency(rawVal, a.currency) };
    }).filter(Boolean);
  }

  function monthBreakdown(monthStr) {
    const entries = valuesAsOfMonth(monthStr);
    const byType = {}, byOwner = {};
    let total = 0;
    entries.forEach(({ account, value }) => {
      byType[account.type] = (byType[account.type] || 0) + value;
      byOwner[account.owner] = (byOwner[account.owner] || 0) + value;
      total += value;
    });
    return { byType, byOwner, total };
  }

  // Asset type (rows) x Owner (columns) matrix for a given month
  function monthBreakdownMatrix(monthStr) {
    const entries = valuesAsOfMonth(monthStr);
    const owners = ['Mine', 'His', 'Joint'];
    const byType = {};
    entries.forEach(({ account, value }) => {
      if (!byType[account.type]) byType[account.type] = { Mine: 0, His: 0, Joint: 0, total: 0 };
      byType[account.type][account.owner] = (byType[account.type][account.owner] || 0) + value;
      byType[account.type].total += value;
    });
    return Object.entries(byType)
      .map(([type, vals]) => ({ type, ...vals }))
      .sort((a, b) => b.total - a.total);
  }

  // Largest expenses within a given month, excluding card-payment transfers
  function topExpensesForMonth(monthStr, n = 5) {
    return state.transactions
      .filter(t => (t.date || '').slice(0, 7) === monthStr && Number(t.amount) < 0 && t.category !== 'Transfer')
      .sort((a, b) => Number(a.amount) - Number(b.amount))
      .slice(0, n);
  }

  // ---- Owner display labels (stored values stay Mine/His/Joint for backward
  // compatibility with existing sheet data; only the display text changes) ----
  const OWNER_LABELS = { Mine: 'Niki', His: 'Nico', Joint: 'Joint' };
  function ownerLabel(v) {
    return OWNER_LABELS[v] || v;
  }

  // ---- Liquidity ----
  // RRSP/RESP/pension accounts carry withdrawal penalties/taxes, and accounts
  // named as a "business" account aren't household liquid net worth either.
  // Both are detected from the account name by default, but an explicit
  // liquidOverride ('Yes'/'No') on the account always wins if set.
  function isLiquid(account) {
    return !/RRSP|RESP|pension/i.test(account.name || '');
  }

  function isBusinessAccount(account) {
    return /business/i.test(account.name || '') || /business/i.test(account.institution || '');
  }

  function isLiquidNetWorthAccount(a) {
    if (!isNetWorthAccount(a)) return false; // Credit Card always excluded
    if (a.liquidOverride === 'Yes') return true;
    if (a.liquidOverride === 'No') return false;
    return isLiquid(a) && !isBusinessAccount(a);
  }

  // Net Worth is liquid-only by default per household preference — RRSP/RESP,
  // pension, business accounts, and Credit Cards are all excluded. Use
  // totalNetWorthIncludingRestricted() for the full picture including those.
  function netWorth(ownerFilter) {
    let accounts = state.accounts.filter(isLiquidNetWorthAccount);
    if (ownerFilter && ownerFilter !== 'All') accounts = accounts.filter(a => a.owner === ownerFilter);
    return accounts.reduce((sum, a) => sum + toHomeCurrency(accountValue(a), a.currency), 0);
  }

  function totalNetWorthIncludingRestricted(ownerFilter) {
    let accounts = state.accounts.filter(isNetWorthAccount);
    if (ownerFilter && ownerFilter !== 'All') accounts = accounts.filter(a => a.owner === ownerFilter);
    return accounts.reduce((sum, a) => sum + toHomeCurrency(accountValue(a), a.currency), 0);
  }

  // Accounts excluded from the liquid Net Worth figure, with reason — for the
  // "what got excluded" info panel so the number is verifiable, not a black box.
  function excludedFromNetWorth(ownerFilter) {
    let accounts = state.accounts.filter(isNetWorthAccount).filter(a => !isLiquidNetWorthAccount(a));
    if (ownerFilter && ownerFilter !== 'All') accounts = accounts.filter(a => a.owner === ownerFilter);
    return accounts.map(a => ({
      account: a,
      value: toHomeCurrency(accountValue(a), a.currency),
      reason: a.liquidOverride === 'No' ? 'Manually excluded'
        : isBusinessAccount(a) ? 'Business account'
        : 'Restricted (RRSP/RESP/pension)'
    }));
  }

  // Full list of accounts that can be toggled in/out of Liquid Net Worth,
  // with their current effective state, for the customization checklist.
  function liquidToggleList() {
    return state.accounts.filter(isNetWorthAccount).map(a => ({
      account: a,
      included: isLiquidNetWorthAccount(a),
      isDefault: !a.liquidOverride
    }));
  }

  async function setLiquidOverride(account, value) {
    // value: 'Yes' | 'No' | '' (clear override, fall back to auto-detection)
    const row = Object.assign({}, account, { liquidOverride: value });
    await Api.upsert('Accounts', row);
  }

  function liquidNetWorth(ownerFilter) {
    return netWorth(ownerFilter); // kept for backwards compatibility with existing call sites
  }

  // ---- Account sub-type (Chequing/TFSA/RRSP/etc), inferred from the name ----
  function accountSubtype(account) {
    const n = account.name || '';
    if (/chequing/i.test(n)) return 'Chequing';
    if (/tfsa/i.test(n)) return 'TFSA';
    if (/rrsp/i.test(n)) return 'RRSP';
    if (/resp/i.test(n)) return 'RESP';
    if (/crypto/i.test(n)) return 'Crypto';
    if (/nsa/i.test(n)) return 'Non-Registered';
    if (/heloc/i.test(n)) return 'HELOC';
    if (/saving/i.test(n)) return 'Savings';
    if (/cash fund/i.test(n)) return 'Cash Fund';
    if (account.type === 'Private Stock') return 'Private Stock';
    if (account.type === 'Credit Card') return 'Credit Card';
    return account.type || 'Other';
  }

  // ---- Per-person Cash vs Investment ----
  function perPersonTypeBreakdown() {
    const owners = ['Mine', 'His', 'Joint'];
    const result = {};
    owners.forEach(o => {
      const accounts = state.accounts.filter(isLiquidNetWorthAccount).filter(a => a.owner === o);
      let cash = 0, investment = 0;
      accounts.forEach(a => {
        const val = toHomeCurrency(accountValue(a), a.currency);
        if (a.type === 'Cash') cash += val;
        else if (a.type === 'Investment' || a.type === 'Private Stock') investment += val;
      });
      result[o] = { cash, investment };
    });
    return result;
  }

  // ---- Institution x Owner matrix (excludes Credit Card — always $0, not useful here) ----
  function institutionOwnerMatrix() {
    const owners = ['Mine', 'His', 'Joint'];
    const accounts = state.accounts.filter(a => a.type !== 'Credit Card');
    const byInstitution = {};
    accounts.forEach(a => {
      const inst = a.institution || 'Unspecified';
      if (!byInstitution[inst]) {
        byInstitution[inst] = { Mine: 0, His: 0, Joint: 0, total: 0 };
      }
      const val = toHomeCurrency(accountValue(a), a.currency);
      byInstitution[inst][a.owner] = (byInstitution[inst][a.owner] || 0) + val;
      byInstitution[inst].total += val;
    });
    return Object.entries(byInstitution)
      .map(([inst, vals]) => ({ inst, ...vals }))
      .sort((a, b) => b.total - a.total);
  }

  // ---- Recurring detection ----
  // A subscription often shares a merchant keyword with unrelated one-off spend
  // (e.g. a monthly gym membership AND an occasional smoothie at the same
  // place). So instead of just grouping by keyword, we cluster by keyword AND
  // similar amount, then only treat a cluster as "recurring" if it charged in
  // 3 consecutive months — that's what actually distinguishes a subscription
  // from incidental repeat visits.
  function recurringSummary(windowMonths = 12, dropoffMonths = 2) {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - windowMonths, now.getDate());
    const dropoff = new Date(now.getFullYear(), now.getMonth() - dropoffMonths, now.getDate());

    const spend = state.transactions.filter(t =>
      Number(t.amount) < 0 && t.category !== 'Transfer' && t.date && new Date(t.date) >= cutoff
    );

    const byKeyword = {};
    spend.forEach(t => {
      const kw = Categorize.extractKeyword(t.description);
      (byKeyword[kw] = byKeyword[kw] || []).push(t);
    });

    const results = [];
    Object.entries(byKeyword).forEach(([keyword, txns]) => {
      // cluster by amount: tolerance = max($2, 5%)
      const clusters = [];
      txns.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
        const amt = Math.abs(Number(t.amount));
        let cluster = clusters.find(c => Math.abs(c.avgAmount - amt) <= Math.max(2, amt * 0.05));
        if (!cluster) { cluster = { txns: [], avgAmount: amt }; clusters.push(cluster); }
        cluster.txns.push(t);
        cluster.avgAmount = cluster.txns.reduce((s, x) => s + Math.abs(Number(x.amount)), 0) / cluster.txns.length;
      });

      // pick the best qualifying cluster for this keyword, if any
      let best = null;
      clusters.forEach(cluster => {
        const monthSet = new Set(cluster.txns.map(t => (t.date || '').slice(0, 7)));
        const months = Array.from(monthSet).sort();
        if (months.length < 3) return;
        // check the most recent 3+ months in this cluster are consecutive
        let consecutiveRun = 1;
        for (let i = months.length - 1; i > 0; i--) {
          const cur = new Date(months[i] + '-01');
          const prev = new Date(months[i - 1] + '-01');
          const diff = (cur.getFullYear() - prev.getFullYear()) * 12 + (cur.getMonth() - prev.getMonth());
          if (diff === 1) consecutiveRun++; else break;
        }
        if (consecutiveRun < 3) return;
        const latest = cluster.txns[cluster.txns.length - 1];
        if (new Date(latest.date) < dropoff) return; // stale, hasn't charged recently
        const total = cluster.txns.reduce((s, x) => s + Math.abs(Number(x.amount)), 0);
        const monthlyAvg = total / months.length;
        const candidate = {
          keyword, latest, category: latest.category,
          months: monthSet, consecutiveRun,
          lastAmount: Math.abs(Number(latest.amount)),
          rollingAnnual: monthlyAvg * 12
        };
        if (!best || months.length > best.months.size) best = candidate;
      });
      if (best) results.push(best);
    });

    return results.sort((a, b) => b.rollingAnnual - a.rollingAnnual);
  }

  // ---- Year-end forecast, by asset type, incorporating planned expenses ----
  function typeMonthlySeries(type, monthsBack) {
    const now = new Date();
    const months = [];
    for (let i = monthsBack - 1; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    return months.map(monthDate => {
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      let total = 0;
      state.accounts.filter(isLiquidNetWorthAccount).filter(a => a.type === type).forEach(a => {
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
      return total;
    });
  }

  function forecastToYearEnd() {
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const monthsRemaining = 11 - currentMonthIdx;
    const types = Array.from(new Set(state.accounts.filter(isLiquidNetWorthAccount).map(a => a.type)));
    const historyMonths = 6;

    const labels = [];
    for (let i = 0; i <= monthsRemaining; i++) {
      labels.push(new Date(now.getFullYear(), currentMonthIdx + i, 1).toLocaleDateString('en-US', { month: 'short' }));
    }

    const series = types.map(type => {
      const hist = typeMonthlySeries(type, historyMonths);
      const avgDelta = hist.length > 1 ? (hist[hist.length - 1] - hist[0]) / (hist.length - 1) : 0;
      const current = hist[hist.length - 1] || 0;
      const values = [current];
      for (let i = 1; i <= monthsRemaining; i++) {
        let projected = current + avgDelta * i;
        if (type === 'Cash') {
          const monthKey = new Date(now.getFullYear(), currentMonthIdx + i, 1).toISOString().slice(0, 7);
          const startKey = new Date(now.getFullYear(), currentMonthIdx, 1).toISOString().slice(0, 7);
          const cumPlanned = state.plannedExpenses
            .filter(pe => { const pk = (pe.period || '').slice(0, 7); return pk && pk >= startKey && pk <= monthKey; })
            .reduce((s, pe) => s + Number(pe.amount || 0), 0);
          projected -= cumPlanned;
        }
        values.push(projected);
      }
      return { type, values };
    });

    return { labels, series, monthsRemaining };
  }

  function transactionMonthOptions() {
    const months = new Set(state.transactions.map(t => (t.date || '').slice(0, 7)).filter(Boolean));
    return Array.from(months).sort().reverse();
  }

  function transactionsForPeriod(period) {
    if (!period || period === 'all') return state.transactions;
    return state.transactions.filter(t => (t.date || '').slice(0, 7) === period);
  }

  return {
    state, loadAll, loadFromCache, toHomeCurrency, latestSnapshotFor, accountValue,
    netWorth, netWorthByType, netWorthTrend, formatMoney,
    snapshotMonthOptions, valuesAsOfMonth, monthBreakdown, monthBreakdownMatrix, topExpensesForMonth,
    transactionMonthOptions, transactionsForPeriod,
    isLiquid, isBusinessAccount, isLiquidNetWorthAccount, liquidNetWorth,
    totalNetWorthIncludingRestricted, excludedFromNetWorth, liquidToggleList, setLiquidOverride,
    perPersonTypeBreakdown, institutionOwnerMatrix, accountSubtype, recurringSummary, ownerLabel,
    forecastToYearEnd
  };
})();
