// shops.js — add / edit / delete shops, each linked to a building.
import { db } from "../firebase/firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, showToast, openModal, closeModal, fmtMoney, filterNumericInput } from "./common.js";

let currentUser = null;
let shops = [];
let buildings = [];
let filters = { buildingId: '', status: '' };

(async function boot() {
  currentUser = await requireAuth('shops');
  if (!currentUser) return;

  document.getElementById('addShopBtn').onclick = openAddShop;
  document.getElementById('filterBuilding').onchange = (e) => { filters.buildingId = e.target.value; render(); };
  document.getElementById('filterStatus').onchange = (e) => { filters.status = e.target.value; render(); };

  onSnapshot(query(collection(db, 'buildings'), orderBy('name')), snap => {
    buildings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById('filterBuilding');
    sel.innerHTML = `<option value="">All buildings</option>` + buildings.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    render();
  });
  onSnapshot(query(collection(db, 'shops'), orderBy('number')), snap => {
    shops = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
})();

function buildingName(id) {
  const b = buildings.find(x => x.id === id);
  return b ? b.name : '\u2014';
}

function render() {
  const body = document.getElementById('shopsList');
  if (buildings.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">Add a building first</div><div>Shops must belong to a building — go to Buildings to add one.</div></div>`;
    return;
  }
  const filtered = shops.filter(s =>
    (!filters.buildingId || s.buildingId === filters.buildingId) &&
    (!filters.status || s.status === filters.status)
  );
  if (filtered.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">No shops found</div><div>Add a shop or adjust your filters.</div></div>`;
    return;
  }
  body.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Shop No.</th><th>Building</th><th>Floor</th><th>Area (sqft)</th><th>Rent</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${filtered.map(s => `
          <tr>
            <td>${escapeHtml(s.number)}</td>
            <td>${escapeHtml(buildingName(s.buildingId))}</td>
            <td>${escapeHtml(s.floor || '\u2014')}</td>
            <td>${escapeHtml(String(s.area || '\u2014'))}</td>
            <td>${fmtMoney(s.rent)}</td>
            <td><span class="status-pill status-${(s.status || '').toLowerCase().replace(/\s+/g, '-')}">${escapeHtml(s.status)}</span></td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm" data-edit="${s.id}">Edit</button>
              <button class="btn btn-danger-ghost btn-sm" data-delete="${s.id}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  filtered.forEach(s => {
    document.querySelector(`[data-edit="${s.id}"]`).onclick = () => openEditShop(s);
    document.querySelector(`[data-delete="${s.id}"]`).onclick = () => removeShop(s);
  });
}

function shopFormFields(s) {
  return `
    <div class="field"><label>Shop number</label><input id="f-number" value="${s ? escapeHtml(s.number) : ''}" placeholder="e.g. G-12"/></div>
    <div class="field"><label>Building</label>
      <select id="f-building">${buildings.map(b => `<option value="${b.id}" ${s && s.buildingId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select>
    </div>
    <div class="row2">
      <div class="field"><label>Floor</label><input id="f-floor" value="${s ? escapeHtml(s.floor || '') : ''}"/></div>
      <div class="field"><label>Area (sqft)</label><input id="f-area" type="number" value="${s ? s.area || '' : ''}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Monthly rent (\u20B9)</label><input id="f-rent" type="number" value="${s ? s.rent || '' : ''}"/></div>
      <div class="field"><label>Deposit (\u20B9)</label><input id="f-deposit" type="number" value="${s ? s.deposit || '' : ''}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Electricity meter no.</label><input id="f-elec" value="${s ? escapeHtml(s.electricityMeter || '') : ''}"/></div>
      <div class="field"><label>Water meter no.</label><input id="f-water" value="${s ? escapeHtml(s.waterMeter || '') : ''}"/></div>
    </div>
    <div class="field"><label>Status</label>
      <select id="f-status">
        ${['Vacant', 'Occupied', 'Under Work'].map(opt => `<option value="${opt}" ${s && s.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}
      </select>
    </div>
  `;
}

function openAddShop() {
  openModal(`
    <h3>Add shop</h3>
    ${shopFormFields(null)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Add shop</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectShopForm();
    if (!payload) return;
    await addDoc(collection(db, 'shops'), { ...payload, createdAt: serverTimestamp() });
    closeModal(); showToast('Shop added');
  };
}

function openEditShop(s) {
  openModal(`
    <h3>Edit shop</h3>
    ${shopFormFields(s)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save changes</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectShopForm();
    if (!payload) return;
    await updateDoc(doc(db, 'shops', s.id), payload);
    closeModal(); showToast('Shop updated');
  };
}

function collectShopForm() {
  const number = document.getElementById('f-number').value.trim();
  if (!number) { showToast('Enter a shop number'); return null; }
  return {
    number,
    buildingId: document.getElementById('f-building').value,
    floor: document.getElementById('f-floor').value.trim(),
    area: parseFloat(document.getElementById('f-area').value) || 0,
    rent: parseFloat(document.getElementById('f-rent').value) || 0,
    deposit: parseFloat(document.getElementById('f-deposit').value) || 0,
    electricityMeter: document.getElementById('f-elec').value.trim(),
    waterMeter: document.getElementById('f-water').value.trim(),
    status: document.getElementById('f-status').value
  };
}

async function removeShop(s) {
  if (s.status === 'Occupied') {
    showToast("Can't delete an occupied shop — vacate the tenant first");
    return;
  }
  if (!confirm(`Delete shop "${s.number}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'shops', s.id));
  showToast('Shop deleted');
}
