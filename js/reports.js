// reports.js — date-filtered rent, expense, and occupancy reports with CSV export.
import { db } from "../firebase/firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, fmtMoney, fmtDate, showToast } from "./common.js";

let currentUser = null;
let rentPayments = [], expenses = [], shops = [], buildings = [];
let range = 'month';
let customFrom = null, customTo = null;

(async function boot() {
  currentUser = await requireAuth('reports');
  if (!currentUser) return;

  document.getElementById('rangeSelect').onchange = (e) => {
    range = e.target.value;
    const showCustom = range === 'custom';
    document.getElementById('customFrom').style.display = showCustom ? 'inline-block' : 'none';
    document.getElementById('customTo').style.display = showCustom ? 'inline-block' : 'none';
    render();
  };
  document.getElementById('customFrom').onchange = (e) => { customFrom = e.target.value; render(); };
  document.getElementById('customTo').onchange = (e) => { customTo = e.target.value; render(); };
  document.getElementById('exportRentBtn').onclick = () => exportCsv(filteredRent(), ['tenantName','monthLabel','amount','paidAmount','status','paymentMethod'], 'rent-report.csv');
  document.getElementById('exportExpenseBtn').onclick = () => exportCsv(filteredExpenses(), ['description','amount','paidTo','paymentMethod'], 'expense-report.csv');

  onSnapshot(collection(db, 'buildings'), snap => { buildings = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'shops'), snap => { shops = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'rentPayments'), snap => { rentPayments = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'expenses'), snap => { expenses = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
})();

function dateInRange(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  let from, to;
  if (range === 'today') { from = new Date(now.setHours(0,0,0,0)); to = new Date(); }
  else if (range === 'yesterday') { const y = new Date(); y.setDate(y.getDate()-1); from = new Date(y.setHours(0,0,0,0)); to = new Date(y.setHours(23,59,59,999)); }
  else if (range === 'week') { const w = new Date(); w.setDate(w.getDate() - w.getDay()); from = new Date(w.setHours(0,0,0,0)); to = new Date(); }
  else if (range === 'year') { from = new Date(now.getFullYear(), 0, 1); to = new Date(); }
  else if (range === 'custom') {
    if (!customFrom || !customTo) return true;
    from = new Date(customFrom); to = new Date(customTo); to.setHours(23,59,59,999);
  }
  else { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(); }
  return d >= from && d <= to;
}

function filteredRent() { return rentPayments.filter(p => dateInRange(p.createdAt)); }
function filteredExpenses() { return expenses.filter(e => dateInRange(e.date)); }

function buildingName(id) { const b = buildings.find(x => x.id === id); return b ? b.name : '\u2014'; }

function render() {
  const rr = filteredRent();
  const er = filteredExpenses();
  const collected = rr.filter(p => p.status === 'Paid').reduce((s,p) => s + (p.paidAmount||0), 0);
  const pending = rr.filter(p => p.status === 'Pending' || p.status === 'Partial').reduce((s,p) => s + ((p.amount||0)-(p.paidAmount||0)), 0);
  const overdueCount = rr.filter(p => p.status === 'Overdue').length;
  const totalExpenses = er.reduce((s,e) => s + (e.amount||0), 0);
  const netIncome = collected - totalExpenses;

  document.getElementById('reportStats').innerHTML = [
    statCard(fmtMoney(collected), 'Rent Collected', 'green'),
    statCard(fmtMoney(pending), 'Pending Rent', 'orange'),
    statCard(overdueCount, 'Overdue', 'red'),
    statCard(fmtMoney(totalExpenses), 'Expenses'),
    statCard(fmtMoney(netIncome), 'Net Income', netIncome >= 0 ? 'green' : 'red')
  ].join('');

  document.getElementById('rentReportTable').innerHTML = rr.length === 0
    ? `<div class="empty-state"><div class="em-title">No rent records in this range</div></div>`
    : `<table class="data-table"><thead><tr><th>Tenant</th><th>Month</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead><tbody>
        ${rr.map(p => `<tr><td>${escapeHtml(p.tenantName||'')}</td><td>${escapeHtml(p.monthLabel||'')}</td><td>${fmtMoney(p.amount)}</td><td>${fmtMoney(p.paidAmount)}</td><td><span class="status-pill status-${(p.status||'').toLowerCase()}">${escapeHtml(p.status)}</span></td></tr>`).join('')}
      </tbody></table>`;

  document.getElementById('expenseReportTable').innerHTML = er.length === 0
    ? `<div class="empty-state"><div class="em-title">No expenses in this range</div></div>`
    : `<table class="data-table"><thead><tr><th>Date</th><th>Building</th><th>Description</th><th>Amount</th></tr></thead><tbody>
        ${er.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${escapeHtml(buildingName(e.buildingId))}</td><td>${escapeHtml(e.description)}</td><td>${fmtMoney(e.amount)}</td></tr>`).join('')}
      </tbody></table>`;

  const occTotal = shops.length;
  const occOccupied = shops.filter(s => s.status === 'Occupied').length;
  const occVacant = shops.filter(s => s.status === 'Vacant').length;
  const pct = occTotal ? Math.round((occOccupied / occTotal) * 100) : 0;
  document.getElementById('occupancyReport').innerHTML = `
    <div class="entity-card" style="max-width:320px;">
      <div class="entity-meta">Total shops: <b>${occTotal}</b></div>
      <div class="entity-meta">Occupied: <b>${occOccupied}</b></div>
      <div class="entity-meta">Vacant: <b>${occVacant}</b></div>
      <div class="entity-meta">Occupancy rate: <b>${pct}%</b></div>
    </div>
  `;
}

function statCard(value, label, tone) {
  return `<div class="stat-card ${tone||''}"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

function exportCsv(rows, fields, filename) {
  if (rows.length === 0) { showToast('Nothing to export in this range'); return; }
  const header = fields.join(',');
  const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g,'""')}"`).join(','));
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
