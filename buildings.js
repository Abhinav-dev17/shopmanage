// buildings.js — add / edit / delete buildings.
import { db } from "../firebase/firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, escapeHtml, showToast, openModal, closeModal } from "./common.js";

let currentUser = null;
let buildings = [];
let shopsCountByBuilding = {}; // filled lazily from shops collection for delete-guard messaging

(async function boot() {
  currentUser = await requireAuth('buildings');
  if (!currentUser) return;

  document.getElementById('addBuildingBtn').onclick = openAddBuilding;

  onSnapshot(query(collection(db, 'buildings'), orderBy('name')), snap => {
    buildings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
  onSnapshot(collection(db, 'shops'), snap => {
    shopsCountByBuilding = {};
    snap.docs.forEach(d => {
      const b = d.data().buildingId;
      shopsCountByBuilding[b] = (shopsCountByBuilding[b] || 0) + 1;
    });
    render();
  });
})();

function render() {
  const body = document.getElementById('buildingsList');
  if (buildings.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="em-title">No buildings yet</div><div>Add your first building to get started.</div></div>`;
    return;
  }
  body.innerHTML = `<div class="card-grid">${buildings.map(b => `
    <div class="entity-card">
      <div class="entity-title">${escapeHtml(b.name)}</div>
      <div class="entity-sub">${escapeHtml(b.address || 'No address on file')}</div>
      ${b.notes ? `<div class="entity-notes">${escapeHtml(b.notes)}</div>` : ''}
      <div class="entity-meta">${shopsCountByBuilding[b.id] || 0} shop(s)</div>
      <div class="entity-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${b.id}">Edit</button>
        <button class="btn btn-danger-ghost btn-sm" data-delete="${b.id}">Delete</button>
      </div>
    </div>
  `).join('')}</div>`;

  buildings.forEach(b => {
    document.querySelector(`[data-edit="${b.id}"]`).onclick = () => openEditBuilding(b);
    document.querySelector(`[data-delete="${b.id}"]`).onclick = () => removeBuilding(b);
  });
}

function openAddBuilding() {
  openModal(`
    <h3>Add building</h3>
    <div class="field"><label>Building name</label><input id="f-name" placeholder="e.g. Sunrise Complex"/></div>
    <div class="field"><label>Address</label><input id="f-address" placeholder="Address"/></div>
    <div class="field"><label>Notes</label><input id="f-notes" placeholder="Optional notes"/></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Add building</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const name = document.getElementById('f-name').value.trim();
    const address = document.getElementById('f-address').value.trim();
    const notes = document.getElementById('f-notes').value.trim();
    if (!name) { showToast('Enter a building name'); return; }
    await addDoc(collection(db, 'buildings'), { name, address, notes, createdAt: serverTimestamp() });
    closeModal(); showToast('Building added');
  };
}

function openEditBuilding(b) {
  openModal(`
    <h3>Edit building</h3>
    <div class="field"><label>Building name</label><input id="f-name" value="${escapeHtml(b.name)}"/></div>
    <div class="field"><label>Address</label><input id="f-address" value="${escapeHtml(b.address || '')}"/></div>
    <div class="field"><label>Notes</label><input id="f-notes" value="${escapeHtml(b.notes || '')}"/></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveBtn">Save changes</button>
    </div>
  `);
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async () => {
    const name = document.getElementById('f-name').value.trim();
    const address = document.getElementById('f-address').value.trim();
    const notes = document.getElementById('f-notes').value.trim();
    if (!name) { showToast('Enter a building name'); return; }
    await updateDoc(doc(db, 'buildings', b.id), { name, address, notes });
    closeModal(); showToast('Building updated');
  };
}

async function removeBuilding(b) {
  if (shopsCountByBuilding[b.id]) {
    showToast("Can't delete — this building still has shops linked to it");
    return;
  }
  if (!confirm(`Delete "${b.name}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'buildings', b.id));
  showToast('Building deleted');
}
