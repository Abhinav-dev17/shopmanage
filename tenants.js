// tenants.js — add / edit tenants, assign them to a vacant shop, and
// vacate (which moves the record to History and frees the shop).
import { db } from "../firebase/firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, showToast, openModal, closeModal, fmtDate, fmtMoney, filterNumericInput, filterNameInput } from "./common.js";

let currentUser = null;
let tenants = [];
let shops = [];
let buildings = [];
let activeTab = 'active';

(async function boot() {
  currentUser = await requireAuth('tenants');
  if (!currentUser) return;

  document.getElementById('addTenantBtn').onclick = openAddTenant;
  document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    };
  });

  onSnapshot(query(collection(db, 'buildings'), orderBy('name')), snap => {
    buildings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
  onSnapshot(collection(db, 'shops'), snap => {
    shops = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
  onSnapshot(query(collection(db, 'tenants'), orderBy('createdAt', 'desc')), snap => {
    tenants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
})();

function shopLabel(shopId) {
  const s = shops.find(x => x.id === shopId);
  if (!s) return '\u2014';
  const b = buildings.find(x => x.id === s.buildingId);
  return `${s.number}${b ? ' \u00B7 ' + b.name : ''}`;
}

function render() {
  const body = document.getElementById('tenantsList');
  const list = tenants.filter(t => activeTab === 'active' ? t.status !== 'History' : t.status === 'History');

  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">No ${activeTab === 'active' ? 'active tenants' : 'history'} yet</div></div>`;
    return;
  }
  body.innerHTML = `<div class="card-grid">${list.map(t => `
    <div class="entity-card">
      <div class="entity-title">${escapeHtml(t.name)}</div>
      <div class="entity-sub">${escapeHtml(t.businessName || '')}</div>
      <div class="entity-meta">${escapeHtml(t.phone || '')}</div>
      <div class="entity-meta">Shop: ${escapeHtml(shopLabel(t.shopId))}</div>
      <div class="entity-meta">Rent: ${fmtMoney(t.monthlyRent)} / month \u00B7 Due day: ${escapeHtml(String(t.rentDueDay || '\u2014'))}</div>
      <div class="entity-meta">Lease: ${fmtDate(t.leaseStart)} \u2192 ${fmtDate(t.leaseEnd)}</div>
      ${activeTab === 'active' ? `
        <div class="entity-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${t.id}">Edit</button>
          <button class="btn btn-danger-ghost btn-sm" data-vacate="${t.id}">Vacate</button>
        </div>
      ` : `<div class="entity-meta">Vacated: ${fmtDate(t.vacatedAt)}</div>`}
    </div>
  `).join('')}</div>`;

  if (activeTab === 'active') {
    list.forEach(t => {
      document.querySelector(`[data-edit="${t.id}"]`).onclick = () => openEditTenant(t);
      document.querySelector(`[data-vacate="${t.id}"]`).onclick = () => vacateTenant(t);
    });
  }
}

function vacantShopOptions(currentShopId) {
  const vacant = shops.filter(s => s.status === 'Vacant' || s.id === currentShopId);
  return vacant.map(s => `<option value="${s.id}" ${s.id === currentShopId ? 'selected' : ''}>${escapeHtml(shopLabel(s.id))}</option>`).join('');
}

function tenantFormFields(t) {
  return `
    <div class="field"><label>Tenant name</label><input id="f-name" value="${t ? escapeHtml(t.name) : ''}"/></div>
    <div class="field"><label>Business name</label><input id="f-business" value="${t ? escapeHtml(t.businessName || '') : ''}"/></div>
    <div class="row2">
      <div class="field"><label>Phone</label><input id="f-phone" value="${t ? escapeHtml(t.phone || '') : ''}"/></div>
      <div class="field"><label>Alternate phone</label><input id="f-altphone" value="${t ? escapeHtml(t.altPhone || '') : ''}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Aadhaar</label><input id="f-aadhaar" value="${t ? escapeHtml(t.aadhaar || '') : ''}"/></div>
      <div class="field"><label>PAN</label><input id="f-pan" value="${t ? escapeHtml(t.pan || '') : ''}"/></div>
    </div>
    <div class="field"><label>GST (optional)</label><input id="f-gst" value="${t ? escapeHtml(t.gst || '') : ''}"/></div>
    <div class="field"><label>Address</label><input id="f-address" value="${t ? escapeHtml(t.address || '') : ''}"/></div>
    <div class="field"><label>Shop</label><select id="f-shop">${vantOrEmpty(t)}</select></div>
    <div class="row2">
      <div class="field"><label>Lease start</label><input id="f-leasestart" type="date" value="${t && t.leaseStart ? tsToInputDate(t.leaseStart) : ''}"/></div>
      <div class="field"><label>Lease end</label><input id="f-leaseend" type="date" value="${t && t.leaseEnd ? tsToInputDate(t.leaseEnd) : ''}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Monthly rent (\u20B9)</label><input id="f-rent" type="number" value="${t ? t.monthlyRent || '' : ''}"/></div>
      <div class="field"><label>Deposit (\u20B9)</label><input id="f-deposit" type="number" value="${t ? t.deposit || '' : ''}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Agreement number</label><input id="f-agreement" value="${t ? escapeHtml(t.agreementNumber || '') : ''}"/></div>
      <div class="field"><label>Rent due day (1-28)</label><input id="f-dueday" type="number" min="1" max="28" value="${t ? t.rentDueDay || '' : ''}"/></div>
    </div>
  `;
}
function vantOrEmpty(t) {
  const opts = vacantShopOptions(t ? t.shopId : null);
  return opts || `<option value="">No vacant shops \u2014 add one first</option>`;
}
function tsToInputDate(ts) {
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().slice(0, 10);
}

function openAddTenant() {
  openModal(`
    <h3>Add tenant</h3>
    ${tenantFormFields(null)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Add tenant</button>
    </div>
  `);
  wireFilters();
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectTenantForm();
    if (!payload) return;
    await addDoc(collection(db, 'tenants'), { ...payload, status: 'Active', createdAt: serverTimestamp() });
    if (payload.shopId) await updateDoc(doc(db, 'shops', payload.shopId), { status: 'Occupied' });
    closeModal(); showToast('Tenant added');
  };
}

function openEditTenant(t) {
  openModal(`
    <h3>Edit tenant</h3>
    ${tenantFormFields(t)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save changes</button>
    </div>
  `);
  wireFilters();
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectTenantForm();
    if (!payload) return;
    const oldShopId = t.shopId;
    await updateDoc(doc(db, 'tenants', t.id), payload);
    if (payload.shopId !== oldShopId) {
      if (oldShopId) await updateDoc(doc(db, 'shops', oldShopId), { status: 'Vacant' });
      if (payload.shopId) await updateDoc(doc(db, 'shops', payload.shopId), { status: 'Occupied' });
    }
    closeModal(); showToast('Tenant updated');
  };
}

function wireFilters() {
  filterNumericInput(document.getElementById('f-phone'), 10);
  filterNumericInput(document.getElementById('f-altphone'), 10);
}

function collectTenantForm() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { showToast('Enter tenant name'); return null; }
  const leaseStartVal = document.getElementById('f-leasestart').value;
  const leaseEndVal = document.getElementById('f-leaseend').value;
  return {
    name,
    businessName: document.getElementById('f-business').value.trim(),
    phone: document.getElementById('f-phone').value.trim(),
    altPhone: document.getElementById('f-altphone').value.trim(),
    aadhaar: document.getElementById('f-aadhaar').value.trim(),
    pan: document.getElementById('f-pan').value.trim(),
    gst: document.getElementById('f-gst').value.trim(),
    address: document.getElementById('f-address').value.trim(),
    shopId: document.getElementById('f-shop').value || null,
    leaseStart: leaseStartVal ? new Date(leaseStartVal) : null,
    leaseEnd: leaseEndVal ? new Date(leaseEndVal) : null,
    monthlyRent: parseFloat(document.getElementById('f-rent').value) || 0,
    deposit: parseFloat(document.getElementById('f-deposit').value) || 0,
    agreementNumber: document.getElementById('f-agreement').value.trim(),
    rentDueDay: parseInt(document.getElementById('f-dueday').value) || 1
  };
}

async function vacateTenant(t) {
  if (!confirm(`Vacate ${t.name}? This moves them to History and frees their shop.`)) return;
  await updateDoc(doc(db, 'tenants', t.id), { status: 'History', vacatedAt: serverTimestamp() });
  if (t.shopId) await updateDoc(doc(db, 'shops', t.shopId), { status: 'Vacant' });
  showToast('Tenant moved to history');
}
