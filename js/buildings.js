// buildings.js — add / edit / delete buildings, plus a construction-cost
// "recovery" tracker: net rent (rent collected minus expenses and work
// costs for that building) is tracked against what it cost to build it.
// Once net rent exceeds the construction cost, the surplus is shown as profit.
import { db } from "../firebase/firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, showToast, openModal, closeModal, fmtMoney } from "./common.js";

let currentUser = null;
let buildings = [];
let shops = [];
let rentPayments = [];
let expenses = [];
let works = [];

(async function boot() {
  currentUser = await requireAuth('buildings');
  if (!currentUser) return;

  document.getElementById('addBuildingBtn').onclick = openAddBuilding;

  onSnapshot(query(collection(db, 'buildings'), orderBy('name')), snap => {
    buildings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
  onSnapshot(collection(db, 'shops'), snap => { shops = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'rentPayments'), snap => { rentPayments = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'expenses'), snap => { expenses = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'works'), snap => { works = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
})();

function shopsCount(buildingId) {
  return shops.filter(s => s.buildingId === buildingId).length;
}

// Net rent for a building = rent actually paid, minus expenses and work
// costs recorded against that same building.
function buildingFinancials(buildingId) {
  const rentCollected = rentPayments
    .filter(p => p.buildingId === buildingId && p.status === 'Paid')
    .reduce((s, p) => s + (p.paidAmount || 0), 0);
  const expensesTotal = expenses
    .filter(e => e.buildingId === buildingId)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const worksTotal = works
    .filter(w => w.buildingId === buildingId)
    .reduce((s, w) => s + (w.actualCost || 0), 0);
  const netIncome = rentCollected - expensesTotal - worksTotal;
  return { rentCollected, expensesTotal, worksTotal, netIncome };
}

function render() {
  const body = document.getElementById('buildingsList');
  if (buildings.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">No buildings yet</div><div>Add your first building to get started.</div></div>`;
    return;
  }
  body.innerHTML = `<div class="card-grid">${buildings.map(b => {
    const cost = b.constructionCost || 0;
    const fin = buildingFinancials(b.id);
    const recovered = cost > 0 ? Math.max(0, Math.min(fin.netIncome, cost)) : 0;
    const pct = cost > 0 ? Math.min(100, Math.round((recovered / cost) * 100)) : 0;
    const profit = cost > 0 ? Math.max(0, fin.netIncome - cost) : 0;
    return `
    <div class="entity-card">
      <div class="entity-title">${escapeHtml(b.name)}</div>
      <div class="entity-sub">${escapeHtml(b.address || 'No address on file')}</div>
      ${b.notes ? `<div class="entity-notes">${escapeHtml(b.notes)}</div>` : ''}
      <div class="entity-meta">${shopsCount(b.id)} shop(s)</div>
      ${cost > 0 ? `
        <div class="recovery-block">
          <div class="recovery-row"><span>Construction cost</span><b>${fmtMoney(cost)}</b></div>
          <div class="recovery-row"><span>Net rent so far</span><b>${fmtMoney(fin.netIncome)}</b></div>
          <div class="recovery-bar"><div class="recovery-fill" style="width:${pct}%;"></div></div>
          ${profit > 0
            ? `<div class="recovery-status recovery-profit">Recovered \u2014 ${fmtMoney(profit)} in profit</div>`
            : `<div class="recovery-status">${pct}% recovered \u00B7 ${fmtMoney(Math.max(0, cost - fin.netIncome))} remaining</div>`
          }
        </div>
      ` : `<div class="entity-meta" style="font-style:italic;">No construction cost set \u2014 edit this building to track recovery</div>`}
      <div class="entity-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${b.id}">Edit</button>
        <button class="btn btn-danger-ghost btn-sm" data-delete="${b.id}">Delete</button>
      </div>
    </div>
  `;
  }).join('')}</div>`;

  buildings.forEach(b => {
    document.querySelector(`[data-edit="${b.id}"]`).onclick = () => openEditBuilding(b);
    document.querySelector(`[data-delete="${b.id}"]`).onclick = () => removeBuilding(b);
  });
}

function buildingFormFields(b) {
  return `
    <div class="field"><label>Building name</label><input id="f-name" value="${b ? escapeHtml(b.name) : ''}" placeholder="e.g. Sunrise Complex"/></div>
    <div class="field"><label>Address</label><input id="f-address" value="${b ? escapeHtml(b.address || '') : ''}" placeholder="Address"/></div>
    <div class="field"><label>Construction cost (\u20B9)</label><input id="f-cost" type="number" value="${b ? b.constructionCost || '' : ''}" placeholder="What it cost to build this"/></div>
    <div class="field"><label>Notes</label><input id="f-notes" value="${b ? escapeHtml(b.notes || '') : ''}" placeholder="Optional notes"/></div>
  `;
}

function openAddBuilding() {
  openModal(`
    <h3>Add building</h3>
    ${buildingFormFields(null)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Add building</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectBuildingForm();
    if (!payload) return;
    await addDoc(collection(db, 'buildings'), { ...payload, createdAt: serverTimestamp() });
    closeModal(); showToast('Building added');
  };
}

function openEditBuilding(b) {
  openModal(`
    <h3>Edit building</h3>
    ${buildingFormFields(b)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save changes</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectBuildingForm();
    if (!payload) return;
    await updateDoc(doc(db, 'buildings', b.id), payload);
    closeModal(); showToast('Building updated');
  };
}

function collectBuildingForm() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { showToast('Enter a building name'); return null; }
  return {
    name,
    address: document.getElementById('f-address').value.trim(),
    constructionCost: parseFloat(document.getElementById('f-cost').value) || 0,
    notes: document.getElementById('f-notes').value.trim()
  };
}

async function removeBuilding(b) {
  if (shopsCount(b.id)) {
    showToast("Can't delete — this building still has shops linked to it");
    return;
  }
  if (!confirm(`Delete "${b.name}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'buildings', b.id));
  showToast('Building deleted');
}
