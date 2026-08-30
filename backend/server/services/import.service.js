function splitCSV(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeHeaderCell(c) {
  return c.replace(/^\uFEFF/, '').trim().toLowerCase();
}

function findHeaderIndex(headers, candidates) {
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h === cand || h.includes(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ICICI & generic helper: detect if we have separate withdrawal/deposit columns
function detectDebitCreditHeaders(headers) {
  const hasWithdrawal = headers.some((h) => h.includes('withdrawal'));
  const hasDeposit = headers.some((h) => h.includes('deposit'));
  return hasWithdrawal && hasDeposit;
}

function parseBankDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    const hh = m[4] ? parseInt(m[4], 10) : 12;
    const mi = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmountStr(raw) {
  if (raw == null) return 0;
  const s = String(raw).replace(/[^0-9.-]/g, '');
  if (!s || s === '-' || s === '.') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseCSV(buffer) {
  let text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const rawLines = text.split(/\r?\n/);
  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line.trim()) continue;
    const cols = splitCSV(line).map(normalizeHeaderCell);
    const hasDate = cols.some((h) => h.includes('transaction date') || h === 'date' || h.includes('value date'));
    const hasAmount = cols.some((h) => h.includes('amount') || h.includes('debit') || h.includes('credit') || h.includes('withdrawal') || h.includes('deposit'));
    const hasDesc = cols.some((h) => h.includes('description') || h.includes('narration') || h.includes('particulars') || h.includes('details') || h.includes('remarks'));
    if (hasDate && (hasAmount || hasDesc)) { headerIdx = i; headers = cols; break; }
  }
  if (headerIdx === -1) return [];

  let dateIdx = findHeaderIndex(headers, ['transaction date', 'txn date', 'value date', 'date']);
  let descIdx = findHeaderIndex(headers, ['transaction remarks', 'remarks', 'description', 'narration', 'particulars', 'details']);
  let chqIdx = findHeaderIndex(headers, ['cheque number', 'chq /ref no', 'chq/ref no', 'chq', 'ref no', 'reference', 'utr', 'transaction id', 'txn id']);
  let amountIdx = findHeaderIndex(headers, ['amount']);
  // ICICI has separate Withdrawal/Deposit columns both containing "amount" – treat as debit/credit, not single amount
  const hasWithdrawalDeposit = detectDebitCreditHeaders(headers);
  let debitIdx = -1;
  let creditIdx = -1;
  let useSingleAmount = amountIdx !== -1;
  if (hasWithdrawalDeposit) {
    useSingleAmount = false;
    amountIdx = -1;
    debitIdx = findHeaderIndex(headers, ['withdrawal', 'debit', 'dr amount']);
    creditIdx = findHeaderIndex(headers, ['deposit', 'credit', 'cr amount']);
  } else if (amountIdx === -1) {
    debitIdx = findHeaderIndex(headers, ['debit', 'withdrawal', 'dr amount']);
    creditIdx = findHeaderIndex(headers, ['credit', 'deposit', 'cr amount']);
  }
  const drCrIdx = useSingleAmount ? headers.findIndex((h, i) => i > amountIdx && h.includes('dr') && h.includes('cr')) : -1;
  const upiIdx = findHeaderIndex(headers, ['upi', 'counterparty']);
  const rows = [];
  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line.trim()) continue;
    const cols = splitCSV(line);
    const firstCell = normalizeHeaderCell(cols[0] || '');
    if (firstCell.includes('closing balance') || firstCell.includes('important note') || firstCell.includes('sl. no')) {
      if (firstCell.includes('closing balance') || firstCell.includes('important note')) break;
      continue;
    }
    const dateRaw = dateIdx !== -1 ? (cols[dateIdx] || '') : '';
    const occurredAt = parseBankDate(dateRaw) || new Date();
    let amount = 0;
    let type = 'EXPENSE';
    if (useSingleAmount) {
      amount = Math.abs(parseAmountStr(cols[amountIdx]));
      if (!amount) continue;
      const dc = drCrIdx !== -1 ? normalizeHeaderCell(cols[drCrIdx] || '') : '';
      const isCr = dc === 'cr' || dc.includes('cr');
      const isDr = dc === 'dr' || dc.includes('dr');
      type = isCr ? 'INCOME' : isDr ? 'EXPENSE' : amount < 0 ? 'EXPENSE' : 'INCOME';
    } else {
      const debitRaw = debitIdx !== -1 ? cols[debitIdx] : '';
      const creditRaw = creditIdx !== -1 ? cols[creditIdx] : '';
      const debitAmt = Math.abs(parseAmountStr(debitRaw));
      const creditAmt = Math.abs(parseAmountStr(creditRaw));
      if (debitAmt > 0) { amount = debitAmt; type = 'EXPENSE'; }
      else if (creditAmt > 0) { amount = creditAmt; type = 'INCOME'; }
      else continue;
    }
    if (!amount) continue;
    const description = descIdx !== -1 ? (cols[descIdx] || '').trim() : '';
    const chqRef = chqIdx !== -1 ? (cols[chqIdx] || '').trim() : '';
    const upiCell = upiIdx !== -1 ? (cols[upiIdx] || '').trim() : '';
    const upiFromDesc = description.match(/[A-Z0-9._-]+@[a-z]+/i)?.[0];
    rows.push({
      occurredAt,
      amountPaise: Math.round(amount * 100),
      type,
      mode: 'BANK',
      recipient: description ? { name: description } : undefined,
      utr: chqRef || undefined,
      upiId: upiCell || upiFromDesc || undefined,
      rawPayload: { line, rowNumber: i + 1 },
    });
  }
  return rows;
}

async function parseXLSX(buffer) {
  // try ExcelJS first (handles .xlsx)
  let rows = [];
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (ws) {
      let headerIdx = -1;
      let headers = [];
      ws.eachRow((row, n) => {
        if (headerIdx !== -1) return;
        const vals = [];
        row.eachCell((c, col) => { vals[col - 1] = normalizeHeaderCell(String(c.value ?? '')); });
        const hasDate = vals.some((h) => h && (h.includes('transaction date') || h === 'date' || h.includes('value date')));
        const hasAmount = vals.some((h) => h && (h.includes('amount') || h.includes('debit') || h.includes('credit') || h.includes('withdrawal') || h.includes('deposit')));
        const hasDesc = vals.some((h) => h && (h.includes('remarks') || h.includes('description') || h.includes('narration')));
        if (hasDate && (hasAmount || hasDesc)) { headerIdx = n; headers = vals; }
      });
      if (headerIdx !== -1) {
        let dateIdx = findHeaderIndex(headers, ['transaction date', 'txn date', 'value date', 'date']);
        let descIdx = findHeaderIndex(headers, ['transaction remarks', 'remarks', 'description', 'narration', 'particulars', 'details']);
        let chqIdx = findHeaderIndex(headers, ['cheque number', 'chq /ref no', 'chq/ref no', 'chq', 'ref no', 'reference', 'utr', 'transaction id', 'txn id']);
        let amountIdx = findHeaderIndex(headers, ['amount']);
        const hasWithdrawalDeposit = headers.some((h) => h && h.includes('withdrawal')) && headers.some((h) => h && h.includes('deposit'));
        let debitIdx = -1;
        let creditIdx = -1;
        let useSingleAmount = amountIdx !== -1;
        if (hasWithdrawalDeposit) {
          useSingleAmount = false;
          amountIdx = -1;
          debitIdx = findHeaderIndex(headers, ['withdrawal', 'debit', 'dr amount']);
          creditIdx = findHeaderIndex(headers, ['deposit', 'credit', 'cr amount']);
        } else if (amountIdx === -1) {
          debitIdx = findHeaderIndex(headers, ['debit', 'withdrawal', 'dr amount']);
          creditIdx = findHeaderIndex(headers, ['credit', 'deposit', 'cr amount']);
        }
        const drCrIdx = useSingleAmount ? headers.findIndex((h, i) => h && i > amountIdx && h.includes('dr') && h.includes('cr')) : -1;
        const upiIdx = findHeaderIndex(headers, ['upi', 'counterparty']);
        ws.eachRow((row, n) => {
          if (n <= headerIdx) return;
          const cols = [];
          row.eachCell((c, col) => {
            const v = c.value;
            if (v instanceof Date) cols[col - 1] = v;
            else if (v && typeof v === 'object' && v.text) cols[col - 1] = String(v.text).trim();
            else cols[col - 1] = v != null ? String(v).trim() : '';
          });
          const firstCell = normalizeHeaderCell(String(cols[0] || ''));
          if (firstCell.includes('closing balance') || firstCell.includes('important note')) return;
          if (cols.every((c) => !String(c || '').trim())) return;
          const dateRaw = dateIdx !== -1 ? cols[dateIdx] : '';
          const occurredAt = parseBankDate(dateRaw) || new Date();
          let amount = 0;
          let type = 'EXPENSE';
          if (useSingleAmount) {
            amount = Math.abs(parseAmountStr(cols[amountIdx]));
            if (!amount) return;
            const dc = drCrIdx !== -1 ? normalizeHeaderCell(String(cols[drCrIdx] || '')) : '';
            type = dc === 'cr' || dc.includes('cr') ? 'INCOME' : dc === 'dr' || dc.includes('dr') ? 'EXPENSE' : amount < 0 ? 'EXPENSE' : 'INCOME';
          } else {
            const debitAmt = Math.abs(parseAmountStr(cols[debitIdx !== -1 ? debitIdx : 0]));
            const creditAmt = Math.abs(parseAmountStr(cols[creditIdx !== -1 ? creditIdx : 0]));
            if (debitAmt > 0) { amount = debitAmt; type = 'EXPENSE'; }
            else if (creditAmt > 0) { amount = creditAmt; type = 'INCOME'; }
            else return;
          }
          if (!amount) return;
          const description = descIdx !== -1 ? String(cols[descIdx] || '').trim() : '';
          const chqRef = chqIdx !== -1 ? String(cols[chqIdx] || '').trim() : '';
          const upiCell = upiIdx !== -1 ? String(cols[upiIdx] || '').trim() : '';
          const upiFromDesc = description.match(/[A-Z0-9._-]+@[a-z]+/i)?.[0];
          rows.push({ occurredAt, amountPaise: Math.round(amount * 100), type, mode: 'BANK', recipient: description ? { name: description } : undefined, utr: chqRef || undefined, upiId: upiCell || upiFromDesc || undefined, rawPayload: { row: n } });
        });
        if (rows.length) return rows;
      }
    }
  } catch (e) {
    // fall through to xlsx fallback
  }

  // Fallback for old .xls (BIFF) using SheetJS 'xlsx' library
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return rows.length ? rows : [];
    const ws = wb.Sheets[sheetName];
    // use sheet_to_json with header:1 to get raw rows
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true });
    if (!raw || raw.length === 0) return rows.length ? rows : [];
    // find header row
    let headerIdx = -1;
    let headers = [];
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      if (!row || !row.length) continue;
      const norm = row.map((c) => normalizeHeaderCell(String(c ?? '')));
      const hasDate = norm.some((h) => h && (h.includes('transaction date') || h === 'date' || h.includes('value date')));
      const hasAmount = norm.some((h) => h && (h.includes('amount') || h.includes('debit') || h.includes('credit') || h.includes('withdrawal') || h.includes('deposit')));
      const hasDesc = norm.some((h) => h && (h.includes('remarks') || h.includes('description') || h.includes('narration')));
      if (hasDate && (hasAmount || hasDesc)) { headerIdx = i; headers = norm; break; }
    }
    if (headerIdx === -1) return rows.length ? rows : [];
    let dateIdx = findHeaderIndex(headers, ['transaction date', 'txn date', 'value date', 'date']);
    let descIdx = findHeaderIndex(headers, ['transaction remarks', 'remarks', 'description', 'narration', 'particulars', 'details']);
    let chqIdx = findHeaderIndex(headers, ['cheque number', 'chq /ref no', 'chq/ref no', 'chq', 'ref no', 'reference', 'utr', 'transaction id', 'txn id']);
    let amountIdx = findHeaderIndex(headers, ['amount']);
    const hasWithdrawalDeposit = headers.some((h) => h && h.includes('withdrawal')) && headers.some((h) => h && h.includes('deposit'));
    let debitIdx = -1;
    let creditIdx = -1;
    let useSingleAmount = amountIdx !== -1;
    if (hasWithdrawalDeposit) {
      useSingleAmount = false;
      amountIdx = -1;
      debitIdx = findHeaderIndex(headers, ['withdrawal', 'debit', 'dr amount']);
      creditIdx = findHeaderIndex(headers, ['deposit', 'credit', 'cr amount']);
    } else if (amountIdx === -1) {
      debitIdx = findHeaderIndex(headers, ['debit', 'withdrawal', 'dr amount']);
      creditIdx = findHeaderIndex(headers, ['credit', 'deposit', 'cr amount']);
    }
    const drCrIdx = useSingleAmount ? headers.findIndex((h, i) => h && i > amountIdx && h.includes('dr') && h.includes('cr')) : -1;
    const upiIdx = findHeaderIndex(headers, ['upi', 'counterparty']);
    const out = [];
    for (let i = headerIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row) continue;
      const cols = row.map((c) => (c instanceof Date ? c : c != null ? String(c).trim() : ''));
      // also handle Date objects from xlsx cellDates
      const firstCell = normalizeHeaderCell(String(cols[0] || ''));
      if (firstCell.includes('closing balance') || firstCell.includes('important note')) break;
      if (cols.every((c) => !String(c || '').trim())) continue;
      const dateRaw = dateIdx !== -1 ? cols[dateIdx] : '';
      const occurredAt = parseBankDate(dateRaw) || new Date();
      let amount = 0;
      let type = 'EXPENSE';
      if (useSingleAmount) {
        amount = Math.abs(parseAmountStr(cols[amountIdx]));
        if (!amount) continue;
        const dc = drCrIdx !== -1 ? normalizeHeaderCell(String(cols[drCrIdx] || '')) : '';
        type = dc === 'cr' || dc.includes('cr') ? 'INCOME' : dc === 'dr' || dc.includes('dr') ? 'EXPENSE' : 'INCOME';
      } else {
        const debitAmt = Math.abs(parseAmountStr(cols[debitIdx !== -1 ? debitIdx : 0]));
        const creditAmt = Math.abs(parseAmountStr(cols[creditIdx !== -1 ? creditIdx : 0]));
        if (debitAmt > 0) { amount = debitAmt; type = 'EXPENSE'; }
        else if (creditAmt > 0) { amount = creditAmt; type = 'INCOME'; }
        else continue;
      }
      if (!amount) continue;
      const description = descIdx !== -1 ? String(cols[descIdx] || '').trim() : '';
      const chqRef = chqIdx !== -1 ? String(cols[chqIdx] || '').trim() : '';
      const upiCell = upiIdx !== -1 ? String(cols[upiIdx] || '').trim() : '';
      const upiFromDesc = description.match(/[A-Z0-9._-]+@[a-z]+/i)?.[0];
      out.push({ occurredAt, amountPaise: Math.round(amount * 100), type, mode: 'BANK', recipient: description ? { name: description } : undefined, utr: chqRef || undefined, upiId: upiCell || upiFromDesc || undefined, rawPayload: { row: i + 1 } });
    }
    if (out.length) return out;
  } catch (e2) {
    // ignore, return whatever we have
  }
  return rows;
}

const crypto = require('crypto');
function hashFile(buffer){ return crypto.createHash('sha256').update(buffer).digest('hex'); }
function derivePeriod(rows){
  if(!rows.length) return {};
  let min=rows[0].occurredAt, max=rows[0].occurredAt;
  for(const r of rows){ if(r.occurredAt<min) min=r.occurredAt; if(r.occurredAt>max) max=r.occurredAt; }
  return { periodFrom: min, periodTo: max };
}
function rowHash(rows){
  const fps = rows.map(r=> `${r.amountPaise}|${new Date(r.occurredAt).toISOString().slice(0,10)}|${(r.utr||'').toLowerCase()}|${(r.upiId||'').toLowerCase()}`).sort().join('\n');
  return crypto.createHash('sha256').update(fps).digest('hex').slice(0,32);
}
module.exports = { parseCSV, parseXLSX, hashFile, derivePeriod, rowHash };
