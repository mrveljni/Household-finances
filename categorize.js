// Shared categorization logic used by both bulk Upload and manual quick-add,
// so category rules and recurring-detection stay consistent everywhere.

const Categorize = (() => {
  const DEFAULT_CATEGORIES = ['Groceries','Dining','Transport','Daycare','Travel','Utilities','Housing','Shopping','Health','Subscriptions','Income','Transfer','Other'];
  const MATCH_TYPES = ['contains', 'startsWith', 'endsWith', 'exactWord'];

  function extractKeyword(description) {
    const match = (description || '').match(/[A-Za-z]{3,}/);
    return match ? match[0].toUpperCase() : (description || '').trim().toUpperCase();
  }

  function ruleMatches(rule, descriptionUpper) {
    const kw = (rule.keyword || '').toUpperCase();
    if (!kw) return false;
    const type = rule.matchType || 'contains'; // older rules predate this column — default to contains
    if (type === 'startsWith') return descriptionUpper.trim().startsWith(kw);
    if (type === 'endsWith') return descriptionUpper.trim().endsWith(kw);
    if (type === 'exactWord') return descriptionUpper.split(/[^A-Z0-9]+/).includes(kw);
    return descriptionUpper.includes(kw); // 'contains'
  }

  function autoCategory(description) {
    if (!description) return 'Other';
    const upper = description.toUpperCase();
    const rule = Store.state.categoryRules.find(r => ruleMatches(r, upper));
    return rule ? rule.category : 'Other';
  }

  function detectRecurring(description, amount) {
    const key = extractKeyword(description);
    const matches = Store.state.transactions.filter(t =>
      extractKeyword(t.description) === key && Math.abs(Number(t.amount) - amount) < 1
    );
    return matches.length >= 1;
  }

  async function saveRule(keyword, category, matchType) {
    if (!keyword) return;
    const existing = Store.state.categoryRules.find(r => r.keyword && r.keyword.toLowerCase() === keyword.toLowerCase());
    const row = { id: existing ? existing.id : undefined, keyword, category, matchType: matchType || (existing ? existing.matchType : 'contains') || 'contains' };
    await Api.upsert('CategoryRules', row);
    if (existing) { existing.category = category; existing.matchType = row.matchType; }
    else Store.state.categoryRules.push({ id: Api.uuid(), keyword, category, matchType: row.matchType });
  }

  async function updateRule(id, fields) {
    const existing = Store.state.categoryRules.find(r => r.id === id);
    if (!existing) return;
    const row = Object.assign({}, existing, fields);
    await Api.upsert('CategoryRules', row);
    Object.assign(existing, fields);
  }

  async function deleteRule(id) {
    await Api.remove('CategoryRules', id);
    Store.state.categoryRules = Store.state.categoryRules.filter(r => r.id !== id);
  }

  function categoryOptions(selected) {
    return DEFAULT_CATEGORIES.map(c => `<option ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
  }

  function matchTypeOptions(selected) {
    const labels = { contains: 'Contains', startsWith: 'Starts with', endsWith: 'Ends with', exactWord: 'Exact word' };
    return MATCH_TYPES.map(t => `<option value="${t}" ${t === (selected || 'contains') ? 'selected' : ''}>${labels[t]}</option>`).join('');
  }

  return { DEFAULT_CATEGORIES, MATCH_TYPES, extractKeyword, autoCategory, detectRecurring, saveRule, updateRule, deleteRule, categoryOptions, matchTypeOptions };
})();
