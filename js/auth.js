// auth.js — powers index.html only: first-time Super Owner setup and login.
import { db } from "../firebase/firebase-config.js";
import {
  doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uid8, genSalt, hashPassword, escapeHtml, SESSION_KEY } from "./common.js";

function normUsername(u) { return u.trim().toLowerCase(); }

async function checkBootstrap() {
  const initDoc = await getDoc(doc(db, 'meta', 'init'));
  return !initDoc.exists();
}

async function init() {
  const savedId = localStorage.getItem(SESSION_KEY);
  if (savedId) {
    const staffDoc = await getDoc(doc(db, 'staff', savedId));
    if (staffDoc.exists()) { window.location.href = 'dashboard.html'; return; }
    localStorage.removeItem(SESSION_KEY);
  }
  const bootstrapNeeded = await checkBootstrap();
  render(bootstrapNeeded);
}

function render(bootstrapNeeded) {
  const app = document.getElementById('authApp');
  app.innerHTML = bootstrapNeeded ? bootstrapScreen() : loginScreen();
  wire(bootstrapNeeded);
}

function bootstrapScreen() {
  return `
    <div class="auth-card">
      <div class="auth-brand">Property<span>Manager</span></div>
      <div class="auth-sub">FIRST-TIME SETUP</div>
      <div class="info-msg">No account exists yet. Create the Super Owner — the main account that manages everything, including staff logins.</div>
      <div id="authErr"></div>
      <div class="field"><label>Username</label><input id="bs-username" placeholder="e.g. superowner"/></div>
      <div class="field"><label>Password</label><input id="bs-password" type="password" placeholder="At least 6 characters"/></div>
      <div class="field"><label>Confirm password</label><input id="bs-confirm" type="password"/></div>
      <button class="btn btn-primary btn-block" id="bs-submit">Create Super Owner account</button>
    </div>
  `;
}
function loginScreen() {
  return `
    <div class="auth-card">
      <div class="auth-brand">Property<span>Manager</span></div>
      <div class="auth-sub">STAFF LOGIN</div>
      <div id="authErr"></div>
      <div class="field"><label>Username</label><input id="li-username" placeholder="Username"/></div>
      <div class="field"><label>Password</label><input id="li-password" type="password" placeholder="Password"/></div>
      <button class="btn btn-primary btn-block" id="li-submit">Log in</button>
    </div>
  `;
}

function wire(bootstrapNeeded) {
  const errBox = document.getElementById('authErr');
  function setErr(msg) { errBox.innerHTML = msg ? `<div class="err-msg">${escapeHtml(msg)}</div>` : ''; }

  const bsBtn = document.getElementById('bs-submit');
  if (bsBtn) {
    bsBtn.onclick = async () => {
      const usernameRaw = document.getElementById('bs-username').value.trim();
      const password = document.getElementById('bs-password').value;
      const confirmPw = document.getElementById('bs-confirm').value;
      if (!usernameRaw || password.length < 6) { setErr('Enter a username and a password of at least 6 characters.'); return; }
      if (password !== confirmPw) { setErr('Passwords do not match.'); return; }
      bsBtn.disabled = true;
      try {
        const username = normUsername(usernameRaw);
        const salt = genSalt();
        const passwordHash = await hashPassword(password, salt);
        const id = uid8();
        await setDoc(doc(db, 'staff', id), { username, passwordHash, salt, role: 'superowner', createdAt: serverTimestamp() });
        await setDoc(doc(db, 'meta', 'init'), { done: true });
        localStorage.setItem(SESSION_KEY, id);
        window.location.href = 'dashboard.html';
      } catch (e) { setErr(e.message); bsBtn.disabled = false; }
    };
  }
  const liBtn = document.getElementById('li-submit');
  if (liBtn) {
    liBtn.onclick = async () => {
      const usernameRaw = document.getElementById('li-username').value.trim();
      const password = document.getElementById('li-password').value;
      if (!usernameRaw || !password) { setErr('Enter your username and password.'); return; }
      liBtn.disabled = true;
      try {
        const username = normUsername(usernameRaw);
        const q = query(collection(db, 'staff'), where('username', '==', username));
        const snap = await getDocs(q);
        if (snap.empty) { setErr('Incorrect username or password.'); liBtn.disabled = false; return; }
        const staffDoc = snap.docs[0];
        const data = staffDoc.data();
        const computedHash = await hashPassword(password, data.salt);
        if (computedHash !== data.passwordHash) { setErr('Incorrect username or password.'); liBtn.disabled = false; return; }
        localStorage.setItem(SESSION_KEY, staffDoc.id);
        window.location.href = 'dashboard.html';
      } catch (e) { setErr('Something went wrong. Try again.'); liBtn.disabled = false; }
    };
  }
}

init();
