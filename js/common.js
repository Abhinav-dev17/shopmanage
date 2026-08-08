// common.js — shared utilities used across every page:
// formatting helpers, toast/modal UI, session/auth guard, and the
// sidebar / mobile bottom-navigation renderer.

import { db } from "../firebase/firebase-config.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const SESSION_KEY = 'pm_staff_id';

export const ROLE_LABELS = {
  superowner: 'Super Owner',
  owner: 'Owner',
  manager: 'Manager',
  accountant: 'Accountant'
};

// Which roles can open which page. Edit this to change access rules.
export const PAGE_ACCESS = {
  dashboard: ['superowner', 'owner', 'manager', 'accountant'],
  buildings: ['superowner', 'owner'],
  shops:     ['superowner', 'owner'],
  tenants:   ['superowner', 'owner', 'manager'],
  rent:      ['superowner', 'owner', 'manager', 'accountant'],
  works:     ['superowner', 'owner', 'manager'],
  expenses:  ['superowner', 'owner', 'manager', 'accountant'],
  reports:   ['superowner', 'owner', 'accountant'],
  staff:     ['superowner']
};

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '\u2302' },
  { key: 'buildings', label: 'Buildings', href: 'buildings.html', icon: '\u25A6' },
  { key: 'shops',     label: 'Shops',     href: 'shops.html',     icon: '\u25A3' },
  { key: 'tenants',   label: 'Tenants',   href: 'tenants.html',   icon: '\u25CF' },
  { key: 'rent',      label: 'Rent',      href: 'rent.html',      icon: '\u20B9' },
  { key: 'works',     label: 'Works',     href: 'works.html',     icon: '\u2692' },
  { key: 'expenses',  label: 'Expenses',  href: 'expenses.html',  icon: '\u2707' },
  { key: 'reports',   label: 'Reports',   href: 'reports.html',   icon: '\u25A4' },
  { key: 'staff',     label: 'Staff',     href: 'staff.html',     icon: '\u2699' }
];

// ---------- Formatting ----------
export function escapeHtml(s) {
  return (s || '').toString().replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
export function fmtMoney(n) {
  const num = Number(n) || 0;
  return '\u20B9' + num.toLocaleString('en-IN');
}
export function fmtDate(ts) {
  if (!ts) return '\u2014';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(ts) {
  if (!ts) return '\u2014';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function uid8() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}
export function genSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function hashPassword(password, salt) {
  const enc = new TextEncoder().encode(salt + ':' + password);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Input filters ----------
export function filterNumericInput(el, maxLen) {
  if (!el) return;
  el.setAttribute('inputmode', 'numeric');
  el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, maxLen); });
}
export function filterNameInput(el) {
  if (!el) return;
  el.addEventListener('input', () => { el.value = el.value.replace(/[^A-Za-z\s.]/g, ''); });
}

// ---------- Toast ----------
export function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// ---------- Modal ----------
export function openModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'overlay';
  overlay.innerHTML = `<div class="modal-sheet">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
export function closeModal() {
  const o = document.getElementById('overlay');
  if (o) o.remove();
}

// ---------- Auth guard (call at the top of every protected page) ----------
export async function requireAuth(pageKey) {
  const savedId = localStorage.getItem(SESSION_KEY);
  if (!savedId) { window.location.href = 'index.html'; return null; }

  const staffDoc = await getDoc(doc(db, 'staff', savedId));
  if (!staffDoc.exists()) {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
    return null;
  }
  const data = staffDoc.data();
  const currentUser = { id: savedId, username: data.username, role: data.role };

  const allowed = PAGE_ACCESS[pageKey] || [];
  if (!allowed.includes(currentUser.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  renderNav(pageKey, currentUser);
  return currentUser;
}

// ---------- Sidebar / bottom-nav ----------
export function renderNav(activePage, currentUser) {
  const visibleItems = NAV_ITEMS.filter(item => (PAGE_ACCESS[item.key] || []).includes(currentUser.role));
  const navHtml = `
    <div class="brandmark">Property<span>Manager</span></div>
    <nav class="nav-links">
      ${visibleItems.map(item => `
        <a href="${item.href}" class="nav-link ${activePage === item.key ? 'active' : ''}">
          <span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span>
        </a>
      `).join('')}
    </nav>
    <div class="nav-footer">
      <div class="who">${escapeHtml(currentUser.username)}<br><span class="role-tag">${ROLE_LABELS[currentUser.role] || currentUser.role}</span></div>
      <button class="icon-btn" id="navPwBtn">Change password</button>
      <button class="icon-btn" id="navLogoutBtn">Log out</button>
    </div>
  `;
  const placeholder = document.getElementById('navPlaceholder');
  if (placeholder) placeholder.innerHTML = navHtml;

  const logoutBtn = document.getElementById('navLogoutBtn');
  if (logoutBtn) logoutBtn.onclick = () => { localStorage.removeItem(SESSION_KEY); window.location.href = 'index.html'; };

  const pwBtn = document.getElementById('navPwBtn');
  if (pwBtn) pwBtn.onclick = () => openChangePasswordModal(currentUser);

  // Mobile bottom nav mirrors the same items
  const mobilePlaceholder = document.getElementById('bottomNavPlaceholder');
  if (mobilePlaceholder) {
    mobilePlaceholder.innerHTML = visibleItems.map(item => `
      <a href="${item.href}" class="bnav-link ${activePage === item.key ? 'active' : ''}">
        <span class="nav-icon">${item.icon}</span><span class="bnav-label">${item.label}</span>
      </a>
    `).join('');
  }
}

export function openChangePasswordModal(currentUser) {
  openModal(`
    <h3>Change password</h3>
    <div id="pwErr"></div>
    <div class="field"><label>Current password</label><input id="cp-current" type="password"/></div>
    <div class="field"><label>New password</label><input id="cp-new" type="password" placeholder="At least 6 characters"/></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cp-cancel">Cancel</button>
      <button class="btn btn-primary" id="cp-submit">Update password</button>
    </div>
  `);
  document.getElementById('cp-cancel').onclick = closeModal;
  document.getElementById('cp-submit').onclick = async () => {
    const current = document.getElementById('cp-current').value;
    const next = document.getElementById('cp-new').value;
    const errBox = document.getElementById('pwErr');
    if (!current || next.length < 6) {
      errBox.innerHTML = `<div class="err-msg">Enter your current password and a new one of at least 6 characters.</div>`;
      return;
    }
    try {
      const staffDoc = await getDoc(doc(db, 'staff', currentUser.id));
      const data = staffDoc.data();
      const computedHash = await hashPassword(current, data.salt);
      if (computedHash !== data.passwordHash) {
        errBox.innerHTML = `<div class="err-msg">Current password is incorrect.</div>`;
        return;
      }
      const newSalt = genSalt();
      const newHash = await hashPassword(next, newSalt);
      await updateDoc(doc(db, 'staff', currentUser.id), { salt: newSalt, passwordHash: newHash });
      closeModal();
      showToast('Password updated');
    } catch (e) {
      errBox.innerHTML = `<div class="err-msg">Something went wrong. Try again.</div>`;
    }
  };
}
