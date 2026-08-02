const UploadView = (() => {
  let parsedRows = []; // {date, description, amount, category, include, id(temp)}
  let step = 'select'; // 'select' | 'preview'

  function render() {
    if (step === 'preview') return renderPreview();
    return `
      <div class="card">
        <h3>Upload Transactions</h3>
        <div class="ledger-sub" style="margin-bottom:12px;">CSV, Excel (.xlsx), or PDF bank statement exports.</div>
        <label>Which account are these transactions from?</label>
        <select id="upload-account">
          ${Store.state.accounts.map(a => `<option value="${a.id}">${a.name} (${a.owner})</option>`).join('')}
        </select>
        <label>Owner (applies to all imported rows, editable after)</label>
        <select id="upload-owner">
          ${['Mine','His','Joint'].map(o => `<option>${o}</option>`).join('')}
        </select>
        <label style="margin-top:14px;">File</label>
        <input type="file" id="upload-file" accept=".csv,.xlsx,.xls,.pdf">
        <div id="upload-status" class="ledger-sub" style="margin-top:10px;"></div>
      </div>
    `;
  }

  function renderPreview() {
    const rows = parsedRows.map((r, i) => `
      <div class="ledger-row" style="align-items:flex-start;">
        <input type="checkbox" ${r.include ? 'checked' : ''} data-row-include="${i}" style="width:auto; margin-top:4px;">
        <div style="flex:1; min-width:0; margin-left:8px;">
          <div style="display:flex; justify-content:space-between;">
            <span class="ledger-name">${r.description}</span>
            <span class="ledger-amount num">${r.amount < 0 ? '-' : ''}$${Math.abs(r.amount).toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <span class="ledger-sub">${r.date}${r.recurring ? ' \u00b7 recurring' : ''}</span>
            <select data-row-category="${i}" style="width:auto; font-size:0.78rem; padding:4px 6px;">
              ${Categorize.categoryOptions(r.category)}
            </select>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <div class="card">
        <h3>Review ${parsedRows.length} Transactions</h3>
        <div class="ledger-sub" style="margin-bottom:10px;">Categories were auto-assigned from your rules. Edit any that are wrong — you can reapply a correction to all similar rows.</div>
        ${rows}
      </div>
      <div class="modal-actions" style="position:sticky; bottom:70px;">
        <button class="secondary" id="cancel-upload">Cancel</button>
        <button id="confirm-upload">Save ${parsedRows.filter(r=>r.include).length} Transactions</button>
      </div>
    `;
  }

  function afterRender() {
    if (step === 'select') {
      document.getElementById('upload-file').addEventListener('change', handleFile);
    } else {
      document.querySelectorAll('[data-row-include]').forEach(el => {
        el.addEventListener('change', () => { parsedRows[el.dataset.rowInclude].include = el.checked; });
      });
      document.querySelectorAll('[data-row-category]').forEach(el => {
        el.addEventListener('change', () => onCategoryChange(Number(el.dataset.rowCategory), el.value));
      });
      document.getElementById('cancel-upload').addEventListener('click', () => { step = 'select'; parsedRows = []; App.rerender(); });
      document.getElementById('confirm-upload').addEventListener('click', confirmUpload);
    }
  }

  async function onCategoryChange(index, newCategory) {
    const row = parsedRows[index];
    const oldDesc = row.description;
    row.category = newCategory;
    const keyword = Categorize.extractKeyword(oldDesc);
    const matchCount = parsedRows.filter(r => Categorize.extractKeyword(r.description) === keyword).length;
    if (matchCount > 1) {
      const applyAll = confirm(`Apply "${newCategory}" to all ${matchCount} transactions matching "${keyword}"?`);
      if (applyAll) {
        parsedRows.forEach(r => { if (Categorize.extractKeyword(r.description) === keyword) r.category = newCategory; });
      }
    }
    await Categorize.saveRule(keyword, newCategory);
    App.rerender();
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    status.textContent = 'Parsing...';
    const ext = file.name.split('.').pop().toLowerCase();

    try {
      let rawRows = [];
      if (ext === 'csv') rawRows = await parseCsv(file);
      else if (ext === 'xlsx' || ext === 'xls') rawRows = await parseExcel(file);
      else if (ext === 'pdf') rawRows = await parsePdf(file);
      else { status.textContent = 'Unsupported file type.'; return; }

      if (!rawRows.length) {
        status.textContent = 'No transactions could be detected in this file. You can still add them manually.';
        return;
      }

      const accountId = document.getElementById('upload-account').value;
      const owner = document.getElementById('upload-owner').value;

      parsedRows = rawRows.map(r => ({
        date: r.date,
        description: r.description,
        amount: r.amount,
        category: Categorize.autoCategory(r.description),
        recurring: Categorize.detectRecurring(r.description, r.amount),
        include: true,
        accountId, owner
      }));

      step = 'preview';
      App.rerender();
    } catch (err) {
      console.error(err);
      status.textContent = 'Could not parse this file. Try a CSV export instead if this keeps happening.';
    }
  }

  function parseCsv(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(mapGenericRows(results.data)),
        error: reject
      });
    });
  }

  async function parseExcel(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return mapGenericRows(json);
  }

  function mapGenericRows(rows) {
    if (!rows.length) return [];
    const keys = Object.keys(rows[0]);
    const dateKey = keys.find(k => /date/i.test(k));
    const descKey = keys.find(k => /desc|merchant|payee|memo/i.test(k)) || keys.find(k => /name/i.test(k));
    const amountKey = keys.find(k => /amount/i.test(k));
    const debitKey = keys.find(k => /debit|withdrawal/i.test(k));
    const creditKey = keys.find(k => /credit|deposit/i.test(k));

    return rows.map(row => {
      let amount;
      if (amountKey) amount = parseFloat(String(row[amountKey]).replace(/[$,]/g, '')) || 0;
      else {
        const debit = parseFloat(String(row[debitKey] || '0').replace(/[$,]/g, '')) || 0;
        const credit = parseFloat(String(row[creditKey] || '0').replace(/[$,]/g, '')) || 0;
        amount = credit - debit;
      }
      return {
        date: normalizeDate(row[dateKey]),
        description: String(row[descKey] || 'Unknown').trim(),
        amount
      };
    }).filter(r => r.date && !isNaN(r.amount));
  }

  function normalizeDate(val) {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  async function parsePdf(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(it => it.str).join(' ') + '\n';
    }
    const lineRe = /(\d{1,2}[\/\-\s](?:\d{1,2}|[A-Za-z]{3})[\/\-\s]\d{2,4})\s+(.+?)\s+([-]?\$?\d[\d,]*\.\d{2})/g;
    const rows = [];
    let m;
    while ((m = lineRe.exec(fullText)) !== null) {
      rows.push({
        date: normalizeDate(m[1]),
        description: m[2].trim().slice(0, 80),
        amount: parseFloat(m[3].replace(/[$,]/g, ''))
      });
    }
    return rows.filter(r => r.date);
  }

  async function confirmUpload() {
    const toSave = parsedRows.filter(r => r.include).map(r => ({
      date: r.date,
      amount: r.amount,
      currency: (Store.state.accounts.find(a => a.id === r.accountId) || {}).currency || CONFIG.HOME_CURRENCY,
      description: r.description,
      category: r.category,
      accountId: r.accountId,
      owner: r.owner,
      recurring: r.recurring,
      notes: ''
    }));
    App.showSaving();
    await Api.bulkUpsert('Transactions', toSave);
    await Store.loadAll();
    step = 'select';
    parsedRows = [];
    App.navigate('trends');
  }

  return { render, afterRender };
})();
