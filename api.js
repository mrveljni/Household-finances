// Thin wrapper around the Apps Script JSON API, with local caching so the
// app still feels fast/offline-ish between syncs.

const Api = (() => {
  const cacheKey = (sheet) => `hft_cache_${sheet}`;

  function getCached(sheet) {
    try {
      const raw = localStorage.getItem(cacheKey(sheet));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function setCached(sheet, rows) {
    localStorage.setItem(cacheKey(sheet), JSON.stringify(rows));
  }

  async function fetchSheet(sheet) {
    try {
      const res = await fetch(`${CONFIG.API_URL}?sheet=${encodeURIComponent(sheet)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCached(sheet, data);
        return data;
      }
      console.warn('API error for', sheet, data);
      return getCached(sheet);
    } catch (err) {
      console.warn('Network error, using cache for', sheet, err);
      return getCached(sheet);
    }
  }

  async function post(sheet, action, payload) {
    const body = { sheet, action, ...payload };
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight on Apps Script
      body: JSON.stringify(body)
    });
    return res.json();
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  return {
    get: fetchSheet,
    upsert: (sheet, row) => post(sheet, 'upsert', { row }),
    bulkUpsert: (sheet, rows) => post(sheet, 'bulkUpsert', { rows }),
    remove: (sheet, id) => post(sheet, 'delete', { id }),
    uuid,
    getCached
  };
})();
