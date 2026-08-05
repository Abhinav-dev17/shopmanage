// rent.js — record and track monthly rent payments per tenant, with a
// printable receipt for anything marked Paid.
import { db } from "../firebase/firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, showToast, openModal, closeModal, fmtMoney, fmtDate, uid8 } from "./common.js";

let currentUser = null;
let tenants = [];
let rentPayments = [];
let filters = { status: '' };

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

(async function boot() {
  currentUser = await requireAuth('rent');
  if (!currentUser) return;

  document.getElementById('addRentBtn').onclick = openAddRent;
  document.getElementById('filterStatus').onchange = (e) => { filters.status = e.target.value; render(); };

  onSnapshot(query(collection(db, 'tenants'), orderBy('name')), snap => {
    tenants = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.status !== 'History');
    render();
  });
  onSnapshot(query(collection(db, 'rentPayments'), orderBy('createdAt', 'desc')), snap => {
    rentPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
})();

function tenantName(id) {
  const t = tenants.find(x => x.id === id);
  return t ? t.name : '(former tenant)';
}

function computeStatus(amount, paidAmount) {
  if (paidAmount >= amount && amount > 0) return 'Paid';
  if (paidAmount > 0) return 'Partial';
  return 'Pending';
}

function render() {
  const body = document.getElementById('rentList');
  const list = rentPayments.filter(p => !filters.status || p.status === filters.status);
  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">No rent records yet</div><div>Add a rent record for a tenant to get started.</div></div>`;
    return;
  }
  body.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Tenant</th><th>Month</th><th>Amount</th><th>Paid</th><th>Method</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map(p => `
          <tr>
            <td>${escapeHtml(p.tenantName || tenantName(p.tenantId))}</td>
            <td>${escapeHtml(p.monthLabel || '')}</td>
            <td>${fmtMoney(p.amount)}</td>
            <td>${fmtMoney(p.paidAmount)}</td>
            <td>${escapeHtml(p.paymentMethod || '\u2014')}</td>
            <td><span class="status-pill status-${(p.status || '').toLowerCase()}">${escapeHtml(p.status)}</span></td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Update</button>
              ${p.status === 'Paid' ? `<button class="btn btn-ghost btn-sm" data-receipt="${p.id}">Receipt</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  list.forEach(p => {
    document.querySelector(`[data-edit="${p.id}"]`).onclick = () => openEditRent(p);
    const rBtn = document.querySelector(`[data-receipt="${p.id}"]`);
    if (rBtn) rBtn.onclick = () => showReceipt(p);
  });
}

function tenantSelectOptions(currentId) {
  return tenants.map(t => `<option value="${t.id}" ${t.id === currentId ? 'selected' : ''} data-rent="${t.monthlyRent || 0}">${escapeHtml(t.name)}</option>`).join('');
}

function openAddRent() {
  if (tenants.length === 0) {
    showToast('Add an active tenant first');
    return;
  }
  const now = new Date();
  openModal(`
    <h3>Add rent record</h3>
    <div class="field"><label>Tenant</label><select id="f-tenant">${tenantSelectOptions(null)}</select></div>
    <div class="row2">
      <div class="field"><label>Month</label>
        <select id="f-month">${MONTHS.map((m, i) => `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Year</label><input id="f-year" type="number" value="${now.getFullYear()}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Amount due (\u20B9)</label><input id="f-amount" type="number"/></div>
      <div class="field"><label>Amount paid (\u20B9)</label><input id="f-paid" type="number" value="0"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Late fee (\u20B9)</label><input id="f-latefee" type="number" value="0"/></div>
      <div class="field"><label>Discount (\u20B9)</label><input id="f-discount" type="number" value="0"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Payment method</label>
        <select id="f-method"><option value="">\u2014</option><option>Cash</option><option>UPI</option><option>Bank</option><option>Card</option><option>Cheque</option></select>
      </div>
      <div class="field"><label>Payment date</label><input id="f-paydate" type="date"/></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save record</button>
    </div>
  `);
  const tenantSel = document.getElementById('f-tenant');
  const amountField = document.getElementById('f-amount');
  const applyDefaultRent = () => {
    const opt = tenantSel.selectedOptions[0];
    if (opt && !amountField.value) amountField.value = opt.dataset.rent;
  };
  tenantSel.onchange = applyDefaultRent;
  applyDefaultRent();

  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectRentForm();
    if (!payload) return;
    await addDoc(collection(db, 'rentPayments'), { ...payload, receiptNumber: 'RCPT-' + uid8().toUpperCase(), createdAt: serverTimestamp() });
    closeModal(); showToast('Rent record saved');
  };
}

function openEditRent(p) {
  openModal(`
    <h3>Update rent record</h3>
    <div class="field"><label>Tenant</label><div class="static-value">${escapeHtml(p.tenantName || tenantName(p.tenantId))} \u2014 ${escapeHtml(p.monthLabel || '')}</div></div>
    <div class="row2">
      <div class="field"><label>Amount due (\u20B9)</label><input id="f-amount" type="number" value="${p.amount || 0}"/></div>
      <div class="field"><label>Amount paid (\u20B9)</label><input id="f-paid" type="number" value="${p.paidAmount || 0}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Late fee (\u20B9)</label><input id="f-latefee" type="number" value="${p.lateFee || 0}"/></div>
      <div class="field"><label>Discount (\u20B9)</label><input id="f-discount" type="number" value="${p.discount || 0}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Payment method</label>
        <select id="f-method">
          <option value="">\u2014</option>
          ${['Cash','UPI','Bank','Card','Cheque'].map(m => `<option ${p.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Payment date</label><input id="f-paydate" type="date" value="${p.paymentDate ? new Date(p.paymentDate.toDate ? p.paymentDate.toDate() : p.paymentDate).toISOString().slice(0,10) : ''}"/></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save changes</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const amount = parseFloat(document.getElementById('f-amount').value) || 0;
    const paidAmount = parseFloat(document.getElementById('f-paid').value) || 0;
    const status = computeStatus(amount, paidAmount);
    await updateDoc(doc(db, 'rentPayments', p.id), {
      amount, paidAmount, status,
      lateFee: parseFloat(document.getElementById('f-latefee').value) || 0,
      discount: parseFloat(document.getElementById('f-discount').value) || 0,
      paymentMethod: document.getElementById('f-method').value,
      paymentDate: document.getElementById('f-paydate').value ? new Date(document.getElementById('f-paydate').value) : null
    });
    closeModal(); showToast('Rent record updated');
  };
}

function collectRentForm() {
  const tenantSel = document.getElementById('f-tenant');
  const tenantId = tenantSel.value;
  const tenantNameVal = tenantSel.selectedOptions[0].textContent;
  const monthIdx = parseInt(document.getElementById('f-month').value);
  const year = parseInt(document.getElementById('f-year').value);
  const amount = parseFloat(document.getElementById('f-amount').value) || 0;
  const paidAmount = parseFloat(document.getElementById('f-paid').value) || 0;
  if (!tenantId || !amount) { showToast('Select a tenant and enter an amount'); return null; }
  return {
    tenantId, tenantName: tenantNameVal,
    monthKey: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
    monthLabel: `${MONTHS[monthIdx]} ${year}`,
    amount, paidAmount,
    status: computeStatus(amount, paidAmount),
    lateFee: parseFloat(document.getElementById('f-latefee').value) || 0,
    discount: parseFloat(document.getElementById('f-discount').value) || 0,
    paymentMethod: document.getElementById('f-method').value,
    paymentDate: document.getElementById('f-paydate').value ? new Date(document.getElementById('f-paydate').value) : null
  };
}

function showReceipt(p) {
  openModal(`
    <div class="receipt">
      <h3>Rent Receipt</h3>
      <div class="receipt-row"><span>Receipt No.</span><b>${escapeHtml(p.receiptNumber || '\u2014')}</b></div>
      <div class="receipt-row"><span>Tenant</span><b>${escapeHtml(p.tenantName || tenantName(p.tenantId))}</b></div>
      <div class="receipt-row"><span>Month</span><b>${escapeHtml(p.monthLabel || '')}</b></div>
      <div class="receipt-row"><span>Amount Due</span><b>${fmtMoney(p.amount)}</b></div>
      <div class="receipt-row"><span>Amount Paid</span><b>${fmtMoney(p.paidAmount)}</b></div>
      <div class="receipt-row"><span>Late Fee</span><b>${fmtMoney(p.lateFee)}</b></div>
      <div class="receipt-row"><span>Discount</span><b>${fmtMoney(p.discount)}</b></div>
      <div class="receipt-row"><span>Method</span><b>${escapeHtml(p.paymentMethod || '\u2014')}</b></div>
      <div class="receipt-row"><span>Date</span><b>${fmtDate(p.paymentDate)}</b></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="closeBtn">Close</button>
      <button class="btn btn-primary" id="printBtn">Print</button>
    </div>
  `);
  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('printBtn').onclick = () => window.print();
}
