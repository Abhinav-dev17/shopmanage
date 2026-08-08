// expenses.js — free-text expense descriptions (no fixed categories),
// linked to a building.
import { db } from "../firebase/firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, showToast, openModal, closeModal, fmtMoney, fmtDate } from "./common.js";

let currentUser = null;
let expenses = [];
let buildings = [];
let filters = { buildingId: '' };

(async function boot() {
  currentUser = await requireAuth('expenses');
  if (!currentUser) return;

  document.getElementById('addExpenseBtn').onclick = openAddExpense;
  document.getElementById('filterBuilding').onchange = (e) => { filters.buildingId = e.target.value; render(); };

  onSnapshot(query(collection(db, 'buildings'), orderBy('name')), snap => {
    buildings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById('filterBuilding');
    sel.innerHTML = `<option value="">All buildings</option>` + buildings.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    render();
  });
  onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), snap => {
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
})();

function buildingName(id) { const b = buildings.find(x => x.id === id); return b ? b.name : '\u2014'; }

function render() {
  const body = document.getElementById('expensesList');
  const list = expenses.filter(e => !filters.buildingId || e.buildingId === filters.buildingId);
  const total = list.reduce((s, e) => s + (e.amount || 0), 0);

  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">No expenses recorded yet</div></div>`;
    return;
  }
  body.innerHTML = `
    <div style="margin-bottom:12px;font-size:13px;color:var(--text-light);">Total: <b style="color:var(--text);">${fmtMoney(total)}</b> across ${list.length} record(s)</div>
    <table class="data-table">
      <thead><tr><th>Date</th><th>Building</th><th>Description</th><th>Amount</th><th>Paid To</th><th>Method</th><th></th></tr></thead>
      <tbody>
        ${list.map(e => `
          <tr>
            <td>${fmtDate(e.date)}</td>
            <td>${escapeHtml(buildingName(e.buildingId))}</td>
            <td>${escapeHtml(e.description)}</td>
            <td>${fmtMoney(e.amount)}</td>
            <td>${escapeHtml(e.paidTo || '\u2014')}</td>
            <td>${escapeHtml(e.paymentMethod || '\u2014')}</td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm" data-edit="${e.id}">Edit</button>
              <button class="btn btn-danger-ghost btn-sm" data-delete="${e.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  list.forEach(e => {
    document.querySelector(`[data-edit="${e.id}"]`).onclick = () => openEditExpense(e);
    document.querySelector(`[data-delete="${e.id}"]`).onclick = () => removeExpense(e);
  });
}

function expenseFormFields(e) {
  return `
    <div class="field"><label>Date</label><input id="f-date" type="date" value="${e && e.date ? tsToInputDate(e.date) : new Date().toISOString().slice(0,10)}"/></div>
    <div class="field"><label>Building</label>
      <select id="f-building">${buildings.map(b => `<option value="${b.id}" ${e && e.buildingId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Description</label><input id="f-desc" placeholder="e.g. Painting, security salary, water bill\u2026" value="${e ? escapeHtml(e.description) : ''}"/></div>
    <div class="row2">
      <div class="field"><label>Amount (\u20B9)</label><input id="f-amount" type="number" value="${e ? e.amount || '' : ''}"/></div>
      <div class="field"><label>Paid to</label><input id="f-paidto" value="${e ? escapeHtml(e.paidTo || '') : ''}"/></div>
    </div>
    <div class="field"><label>Payment method</label>
      <select id="f-method"><option value="">\u2014</option><option>Cash</option><option>UPI</option><option>Bank</option><option>Card</option><option>Cheque</option></select>
    </div>
    <div class="field"><label>Notes</label><input id="f-notes" value="${e ? escapeHtml(e.notes || '') : ''}"/></div>
  `;
}
function tsToInputDate(ts) { const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toISOString().slice(0, 10); }

function openAddExpense() {
  if (buildings.length === 0) { showToast('Add a building first'); return; }
  openModal(`
    <h3>Add expense</h3>
    ${expenseFormFields(null)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Add expense</button>
    </div>
  `);
  const methodSel = document.getElementById('f-method');
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectExpenseForm();
    if (!payload) return;
    await addDoc(collection(db, 'expenses'), { ...payload, createdAt: serverTimestamp() });
    closeModal(); showToast('Expense added');
  };
}

function openEditExpense(e) {
  openModal(`
    <h3>Edit expense</h3>
    ${expenseFormFields(e)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save changes</button>
    </div>
  `);
  document.getElementById('f-method').value = e.paymentMethod || '';
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectExpenseForm();
    if (!payload) return;
    await updateDoc(doc(db, 'expenses', e.id), payload);
    closeModal(); showToast('Expense updated');
  };
}

function collectExpenseForm() {
  const description = document.getElementById('f-desc').value.trim();
  const amount = parseFloat(document.getElementById('f-amount').value) || 0;
  if (!description || !amount) { showToast('Enter a description and amount'); return null; }
  const dateVal = document.getElementById('f-date').value;
  return {
    date: dateVal ? new Date(dateVal) : new Date(),
    buildingId: document.getElementById('f-building').value,
    description,
    amount,
    paidTo: document.getElementById('f-paidto').value.trim(),
    paymentMethod: document.getElementById('f-method').value,
    notes: document.getElementById('f-notes').value.trim()
  };
}

async function removeExpense(e) {
  if (!confirm('Delete this expense record?')) return;
  await deleteDoc(doc(db, 'expenses', e.id));
  showToast('Expense deleted');
}
