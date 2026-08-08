// works.js — maintenance / construction work items, free-text description
// rather than fixed categories (per spec: don't force long dropdowns).
import { db } from "../firebase/firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, showToast, openModal, closeModal, fmtMoney, fmtDate, uid8 } from "./common.js";

let currentUser = null;
let works = [];
let buildings = [];
let shops = [];
let filters = { buildingId: '', status: '' };

(async function boot() {
  currentUser = await requireAuth('works');
  if (!currentUser) return;

  document.getElementById('addWorkBtn').onclick = openAddWork;
  document.getElementById('filterBuilding').onchange = (e) => { filters.buildingId = e.target.value; render(); };
  document.getElementById('filterStatus').onchange = (e) => { filters.status = e.target.value; render(); };

  onSnapshot(query(collection(db, 'buildings'), orderBy('name')), snap => {
    buildings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById('filterBuilding');
    sel.innerHTML = `<option value="">All buildings</option>` + buildings.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    render();
  });
  onSnapshot(collection(db, 'shops'), snap => {
    shops = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
  onSnapshot(query(collection(db, 'works'), orderBy('createdAt', 'desc')), snap => {
    works = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
})();

function buildingName(id) { const b = buildings.find(x => x.id === id); return b ? b.name : '\u2014'; }
function shopNumber(id) { const s = shops.find(x => x.id === id); return s ? s.number : ''; }

function render() {
  const body = document.getElementById('worksList');
  const list = works.filter(w =>
    (!filters.buildingId || w.buildingId === filters.buildingId) &&
    (!filters.status || w.status === filters.status)
  );
  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">No work records yet</div><div>Log painting, repairs, installations — anything done on a building or shop.</div></div>`;
    return;
  }
  body.innerHTML = `<div class="card-grid">${list.map(w => `
    <div class="entity-card">
      <div class="entity-title">${escapeHtml(w.description.slice(0, 60))}${w.description.length > 60 ? '\u2026' : ''}</div>
      <div class="entity-sub">${escapeHtml(buildingName(w.buildingId))}${w.shopId ? ' \u00B7 Shop ' + escapeHtml(shopNumber(w.shopId)) : ''}</div>
      <div class="entity-meta"><span class="status-pill status-${(w.status||'').toLowerCase().replace(/\s+/g,'-')}">${escapeHtml(w.status)}</span></div>
      <div class="entity-meta">Estimated: ${fmtMoney(w.estimatedCost)} \u00B7 Actual: ${fmtMoney(w.actualCost)}</div>
      ${w.contractor ? `<div class="entity-meta">Contractor: ${escapeHtml(w.contractor)} ${w.contractorPhone ? '(' + escapeHtml(w.contractorPhone) + ')' : ''}</div>` : ''}
      <div class="entity-meta">${fmtDate(w.startDate)} \u2192 ${w.completionDate ? fmtDate(w.completionDate) : 'ongoing'}</div>
      ${w.notes ? `<div class="entity-notes">${escapeHtml(w.notes)}</div>` : ''}
      <div class="entity-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${w.id}">Edit</button>
        <button class="btn btn-danger-ghost btn-sm" data-delete="${w.id}">Delete</button>
      </div>
    </div>
  `).join('')}</div>`;

  list.forEach(w => {
    document.querySelector(`[data-edit="${w.id}"]`).onclick = () => openEditWork(w);
    document.querySelector(`[data-delete="${w.id}"]`).onclick = () => removeWork(w);
  });
}

function workFormFields(w) {
  return `
    <div class="field"><label>Building</label>
      <select id="f-building">${buildings.map(b => `<option value="${b.id}" ${w && w.buildingId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Shop (optional)</label>
      <select id="f-shop"><option value="">\u2014 Whole building \u2014</option>${shops.map(s => `<option value="${s.id}" ${w && w.shopId === s.id ? 'selected' : ''}>${escapeHtml(s.number)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Description</label>
      <textarea id="f-desc" rows="3" placeholder="e.g. Painted building A, changed roof sheets, installed rolling shutter\u2026" style="width:100%;padding:10px 11px;border-radius:9px;border:1px solid var(--border);font-family:'Inter',sans-serif;font-size:14px;">${w ? escapeHtml(w.description) : ''}</textarea>
    </div>
    <div class="row2">
      <div class="field"><label>Estimated cost (\u20B9)</label><input id="f-estcost" type="number" value="${w ? w.estimatedCost || '' : ''}"/></div>
      <div class="field"><label>Actual cost (\u20B9)</label><input id="f-actcost" type="number" value="${w ? w.actualCost || '' : ''}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Contractor</label><input id="f-contractor" value="${w ? escapeHtml(w.contractor || '') : ''}"/></div>
      <div class="field"><label>Contractor phone</label><input id="f-contractorphone" value="${w ? escapeHtml(w.contractorPhone || '') : ''}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Start date</label><input id="f-start" type="date" value="${w && w.startDate ? tsToInputDate(w.startDate) : ''}"/></div>
      <div class="field"><label>Completion date</label><input id="f-end" type="date" value="${w && w.completionDate ? tsToInputDate(w.completionDate) : ''}"/></div>
    </div>
    <div class="field"><label>Status</label>
      <select id="f-status">${['Planned','In Progress','Completed','Cancelled'].map(s => `<option value="${s}" ${w && w.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Notes</label><input id="f-notes" value="${w ? escapeHtml(w.notes || '') : ''}"/></div>
  `;
}
function tsToInputDate(ts) { const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toISOString().slice(0, 10); }

function openAddWork() {
  if (buildings.length === 0) { showToast('Add a building first'); return; }
  openModal(`
    <h3>Add work record</h3>
    ${workFormFields(null)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Add work</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectWorkForm();
    if (!payload) return;
    await addDoc(collection(db, 'works'), { ...payload, workId: 'WRK-' + uid8().toUpperCase(), createdAt: serverTimestamp() });
    closeModal(); showToast('Work record added');
  };
}

function openEditWork(w) {
  openModal(`
    <h3>Edit work record</h3>
    ${workFormFields(w)}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save changes</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const payload = collectWorkForm();
    if (!payload) return;
    await updateDoc(doc(db, 'works', w.id), payload);
    closeModal(); showToast('Work record updated');
  };
}

function collectWorkForm() {
  const description = document.getElementById('f-desc').value.trim();
  if (!description) { showToast('Describe the work'); return null; }
  const startVal = document.getElementById('f-start').value;
  const endVal = document.getElementById('f-end').value;
  return {
    buildingId: document.getElementById('f-building').value,
    shopId: document.getElementById('f-shop').value || null,
    description,
    estimatedCost: parseFloat(document.getElementById('f-estcost').value) || 0,
    actualCost: parseFloat(document.getElementById('f-actcost').value) || 0,
    contractor: document.getElementById('f-contractor').value.trim(),
    contractorPhone: document.getElementById('f-contractorphone').value.trim(),
    startDate: startVal ? new Date(startVal) : null,
    completionDate: endVal ? new Date(endVal) : null,
    status: document.getElementById('f-status').value,
    notes: document.getElementById('f-notes').value.trim()
  };
}

async function removeWork(w) {
  if (!confirm('Delete this work record? This cannot be undone.')) return;
  await deleteDoc(doc(db, 'works', w.id));
  showToast('Work record deleted');
}
