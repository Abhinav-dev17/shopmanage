// dashboard.js — summary stat cards computed from live Firestore data.
import { db } from "../firebase/firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, fmtMoney } from "./common.js";

let buildings = [], shops = [], tenants = [], rentPayments = [];

(async function boot() {
  const user = await requireAuth('dashboard');
  if (!user) return;

  onSnapshot(collection(db, 'buildings'), snap => { buildings = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'shops'), snap => { shops = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'tenants'), snap => { tenants = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  onSnapshot(collection(db, 'rentPayments'), snap => { rentPayments = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
})();

function render() {
  const totalBuildings = buildings.length;
  const totalShops = shops.length;
  const occupied = shops.filter(s => s.status === 'Occupied').length;
  const vacant = shops.filter(s => s.status === 'Vacant').length;
  const activeTenants = tenants.filter(t => t.status !== 'History').length;

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const collectedThisMonth = rentPayments
    .filter(p => p.monthKey === thisMonthKey && p.status === 'Paid')
    .reduce((s, p) => s + (p.paidAmount || 0), 0);
  const pendingAmount = rentPayments
    .filter(p => p.status === 'Pending' || p.status === 'Partial')
    .reduce((s, p) => s + ((p.amount || 0) - (p.paidAmount || 0)), 0);
  const overdueCount = rentPayments.filter(p => p.status === 'Overdue').length;

  document.getElementById('statCards').innerHTML = [
    statCard(totalBuildings, 'Buildings'),
    statCard(totalShops, 'Total Shops'),
    statCard(occupied, 'Occupied Shops', 'green'),
    statCard(vacant, 'Vacant Shops', 'orange'),
    statCard(activeTenants, 'Active Tenants'),
    statCard(fmtMoney(collectedThisMonth), 'Collected This Month', 'green'),
    statCard(fmtMoney(pendingAmount), 'Pending Rent', 'orange'),
    statCard(overdueCount, 'Overdue Payments', 'red')
  ].join('');
}

function statCard(value, label, tone) {
  return `<div class="stat-card ${tone || ''}"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}
