// Shared categorization logic used by both bulk Upload and manual quick-add,
// so category rules and recurring-detection stay consistent everywhere.

const Categorize = (() => {
  const DEFAULT_CATEGORIES = ['Groceries','Dining','Transport','Daycare','Travel','Utilities','Housing','Shopping','Health','Subscriptions','Income','Transfer','Other'];

  function extractKeyword(description) {
    const match = (description || '').match(/[A-Za-z]{3,}/);
    return match ? match[0].toUpperCase() : (description || '').trim().toUpperCase();
  }

  function autoCategory(description) {
    if (!description) return 'Other';
    const rule = Store.state.categoryRules.find(r =>
      r.keyword && description.toUpperCase().includes(r.keyword.toUpperCase())
    );
    return rule ? rule.category : 'Other';
  }

  function detectRecurring(description, amount) {
    const key = extractKeyword(description);
    const matches = Store.state.transactions.filter(t =>
      extractKeyword(t.description) === key && Math.abs(Number(t.amount) - amount) < 1
    );
    return matches.length >= 1;
  }

  async function saveRule(keyword, category) {
    if (!keyword) return;
    const existing = Store.state.categoryRules.find(r => r.keyword && r.keyword.toLowerCase() === keyword.toLowerCase());
    await Api.upsert('CategoryRules', { id: existing ? existing.id : undefined, keyword, category });
    if (existing) existing.category = category;
    else Store.state.categoryRules.push({ id: Api.uuid(), keyword, category });
  }

  function categoryOptions(selected) {
    return DEFAULT_CATEGORIES.map(c => `<option ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
  }

  return { DEFAULT_CATEGORIES, extractKeyword, autoCategory, detectRecurring, saveRule, categoryOptions };
})();
