/* ═══════════════════════════════════════════════════════
   FINANCEIQ – Application Logic (API Version)
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ─── API Base URL ────────────────────────────────────── */
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001'
  : 'https://financeiq-gules.vercel.app/'; // ← Update after deploying backend

/* ─── Auth helpers ────────────────────────────────────── */
function getToken() { return localStorage.getItem('fiq_token'); }
function getUser()  { try { return JSON.parse(localStorage.getItem('fiq_user')); } catch(e) { return null; } }

async function apiFetch(path, options = {}) {
  const token = getToken();
  if (!token) { logout(); return null; }
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

function logout() {
  localStorage.removeItem('fiq_token');
  localStorage.removeItem('fiq_user');
  window.location.href = 'login.html';
}

/* ─── Currency formatter ─────────────────────────────── */
const fmt = (n) => '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─── Default categories ─────────────────────────────── */
const DEFAULT_CATS = [
  { name: 'Salary',        icon: '💼', color: '#22d3a2', type: 'income',  fixed: true  },
  { name: 'Freelance',     icon: '💻', color: '#34d399', type: 'income',  fixed: false },
  { name: 'Food',          icon: '🍔', color: '#f87171', type: 'expense', fixed: false },
  { name: 'Transport',     icon: '🚗', color: '#fb923c', type: 'expense', fixed: false },
  { name: 'Shopping',      icon: '🛍️', color: '#a78bfa', type: 'expense', fixed: false },
  { name: 'Bills',         icon: '🧾', color: '#60a5fa', type: 'expense', fixed: false },
  { name: 'Healthcare',    icon: '🏥', color: '#f472b6', type: 'expense', fixed: false },
  { name: 'Entertainment', icon: '🎬', color: '#fbbf24', type: 'expense', fixed: false },
  { name: 'Education',     icon: '📚', color: '#38bdf8', type: 'expense', fixed: false },
  { name: 'Savings',       icon: '🏦', color: '#4ade80', type: 'both',    fixed: false },
  { name: 'Mutual Funds',  icon: '📈', color: '#818cf8', type: 'savings', fixed: false },
  { name: 'Fixed Deposit', icon: '🏛️', color: '#38bdf8', type: 'savings', fixed: false },
  { name: 'Stocks',        icon: '📉', color: '#f59e0b', type: 'savings', fixed: false },
];

/* ═══════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════ */
const STATE = {
  transactions: [],
  categories:   [],
  budgets:       [],
};

async function loadState() {
  showGlobalLoader(true);
  try {
    const [txns, cats, budgets] = await Promise.all([
      apiFetch('/api/transactions'),
      apiFetch('/api/categories'),
      apiFetch('/api/budgets'),
    ]);
    STATE.transactions = txns || [];
    STATE.categories   = cats || [];
    STATE.budgets      = budgets || [];

    // If brand new user, seed default categories
    if (STATE.categories.length === 0) {
      await seedDefaultCategories();
    }
  } catch(e) {
    showToast('Could not load data. Check your connection.', 'error');
  }
  showGlobalLoader(false);
}

async function seedDefaultCategories() {
  const promises = DEFAULT_CATS.map(cat =>
    apiFetch('/api/categories', { method: 'POST', body: JSON.stringify(cat) })
  );
  const results = await Promise.all(promises);
  STATE.categories = results.filter(Boolean);
}

function showGlobalLoader(show) {
  let el = document.getElementById('globalLoader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalLoader';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(15,17,23,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;font-size:2rem';
    el.innerHTML = '<div style="text-align:center"><div style="animation:spin 0.7s linear infinite;display:inline-block;font-size:2.5rem">⏳</div><div style="margin-top:12px;color:#8b90a7;font-size:0.9rem">Loading your data…</div></div>';
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

function getCat(id) { return STATE.categories.find(c => c.id === id) || { name: id, icon: '❓', color: '#888' }; }

/* ═══════════════════════════════════════════════════════
   PERIOD HELPERS
   ═══════════════════════════════════════════════════════ */
function getPeriodRange(periodVal) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch(periodVal) {
    case 'this-month':  return [new Date(y, m, 1), new Date(y, m+1, 0, 23, 59, 59)];
    case 'last-month':  return [new Date(y, m-1, 1), new Date(y, m, 0, 23, 59, 59)];
    case 'last-3':      return [new Date(y, m-2, 1), new Date(y, m+1, 0, 23, 59, 59)];
    case 'last-6':      return [new Date(y, m-5, 1), new Date(y, m+1, 0, 23, 59, 59)];
    case 'this-year':   return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59)];
    case 'all': default:return [new Date(0), new Date(9999, 11, 31)];
  }
}

function filterByPeriod(txns, periodVal) {
  const [from, to] = getPeriodRange(periodVal);
  return txns.filter(t => { const d = new Date(t.date); return d >= from && d <= to; });
}

/* ═══════════════════════════════════════════════════════
   ROUTER
   ═══════════════════════════════════════════════════════ */
const PAGES = ['dashboard', 'transactions', 'budgets', 'categories', 'reports'];

function goToPage(name) {
  PAGES.forEach(p => {
    document.getElementById('page-'+p)?.classList.toggle('active', p === name);
    document.getElementById('nav-'+p)?.classList.toggle('active', p === name);
  });
  document.getElementById('pageTitle').textContent =
    name.charAt(0).toUpperCase() + name.slice(1);
  closeSidebar();
  if (name === 'dashboard')    renderDashboard();
  if (name === 'transactions') renderTransactions();
  if (name === 'budgets')      renderBudgets();
  if (name === 'categories')   renderCategories();
  if (name === 'reports')      renderReports();
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR / MOBILE NAV
   ═══════════════════════════════════════════════════════ */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 350);
  }, 3200);
}

/* ═══════════════════════════════════════════════════════
   CONFIRM MODAL
   ═══════════════════════════════════════════════════════ */
let confirmCallback = null;
function showConfirm(msg, cb) {
  document.getElementById('confirmText').textContent = msg;
  document.getElementById('confirmModal').classList.add('open');
  confirmCallback = cb;
}
function closeConfirm() { document.getElementById('confirmModal').classList.remove('open'); confirmCallback = null; }

/* ═══════════════════════════════════════════════════════
   CHART INSTANCES
   ═══════════════════════════════════════════════════════ */
let donutChartInst = null;
let trendChartInst = null;
let reportChartInst = null;

function destroyChart(inst) { if (inst) { try { inst.destroy(); } catch(e){} } }

/* ═══════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════ */
function renderDashboard() {
  const period = document.getElementById('dashPeriod').value;
  const txns = filterByPeriod(STATE.transactions, period);

  const income  = txns.filter(t => t.type==='income').reduce((s,t)=>s+Number(t.amount), 0);
  const expense = txns.filter(t => t.type==='expense').reduce((s,t)=>s+Number(t.amount), 0);
  const invest  = txns.filter(t => t.type==='savings').reduce((s,t)=>s+Number(t.amount), 0);
  const balance = income - expense - invest;
  const netSave = balance;

  document.getElementById('cardBalance').textContent = fmt(balance);
  document.getElementById('cardIncome').textContent  = fmt(income);
  document.getElementById('cardExpense').textContent = fmt(expense);
  document.getElementById('cardSavings').textContent = fmt(netSave);
  document.getElementById('cardInvest').textContent  = fmt(invest);

  const balEl = document.querySelector('.card-balance .card-value');
  balEl.style.color = balance < 0 ? 'var(--expense-color)' : 'var(--balance-color)';

  renderDonutChart(txns);
  renderTrendChart(period);
  renderRecentTxns(txns);
}

function renderDonutChart(txns) {
  const expenses = txns.filter(t => t.type==='expense' || t.type==='savings');
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category]||0) + Number(t.amount); });
  const catIds = Object.keys(byCat);

  const legend = document.getElementById('donutLegend');
  legend.innerHTML = '';

  if (!catIds.length) {
    legend.innerHTML = '<div class="empty-state" style="padding:12px 0"><span class="empty-state-icon">🍩</span><div class="empty-state-text">No expense data</div></div>';
    destroyChart(donutChartInst); donutChartInst = null;
    return;
  }

  const labels = catIds.map(id => getCat(id).name);
  const data   = catIds.map(id => byCat[id]);
  const colors = catIds.map(id => getCat(id).color);
  const total  = data.reduce((s,v)=>s+v,0);

  catIds.forEach((id, i) => {
    const pct = total ? ((data[i]/total)*100).toFixed(1) : 0;
    legend.innerHTML += `
      <div class="legend-item">
        <div class="legend-dot" style="background:${colors[i]}"></div>
        <span class="legend-label">${labels[i]}</span>
        <span class="legend-val">${pct}%</span>
      </div>`;
  });

  destroyChart(donutChartInst);
  donutChartInst = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: 'var(--bg-card)', hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '68%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} (${((ctx.raw/total)*100).toFixed(1)}%)` } } }
    }
  });
}

function renderTrendChart(period) {
  const [from, to] = getPeriodRange(period);
  const months = [];
  let cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }

  const incomeData  = months.map(({ year, month }) =>
    STATE.transactions.filter(t => t.type==='income'  && new Date(t.date).getFullYear()===year && new Date(t.date).getMonth()===month).reduce((s,t)=>s+Number(t.amount),0));
  const expenseData = months.map(({ year, month }) =>
    STATE.transactions.filter(t => t.type==='expense' && new Date(t.date).getFullYear()===year && new Date(t.date).getMonth()===month).reduce((s,t)=>s+Number(t.amount),0));
  const labels = months.map(({ year, month }) => new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'short', year: months.length > 12 ? '2-digit' : undefined }));

  document.getElementById('trendSubtitle').textContent = `${labels[0] || ''} – ${labels[labels.length-1] || ''}`;

  destroyChart(trendChartInst);
  trendChartInst = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Income',   data: incomeData,  borderColor: '#22d3a2', backgroundColor: 'rgba(34,211,162,0.1)', tension:0.4, fill:true, pointBackgroundColor:'#22d3a2', pointRadius:4 },
        { label: 'Expenses', data: expenseData, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)', tension:0.4, fill:true, pointBackgroundColor:'#f87171', pointRadius:4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#8b90a7', boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b90a7' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b90a7', callback: v => '₹'+v.toLocaleString('en-IN') } }
      }
    }
  });
}

function renderRecentTxns(txns) {
  const el = document.getElementById('recentTxnList');
  const sorted = [...txns].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5);
  if (!sorted.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No transactions yet. Add your first one!</div></div>';
    return;
  }
  el.innerHTML = sorted.map(t => {
    const cat = getCat(t.category);
    return `
    <div class="txn-item">
      <div class="txn-cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
      <div class="txn-info">
        <div class="txn-desc">${esc(t.description)}</div>
        <div class="txn-meta">${cat.name} · ${new Date(t.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
      </div>
      <div class="txn-amount ${t.type==='savings'?'savings':t.type}">${t.type==='income'?'+':t.type==='savings'?'💰':'-'}${fmt(t.amount)}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   TRANSACTIONS PAGE
   ═══════════════════════════════════════════════════════ */
let txnPage = 1;
const TXN_PER_PAGE = 10;
let txnDateRange = null;

function getFilteredTxns() {
  const search  = document.getElementById('txnSearch')?.value.toLowerCase() || '';
  const type    = document.getElementById('txnFilterType')?.value || '';
  const cat     = document.getElementById('txnFilterCat')?.value  || '';

  return STATE.transactions.filter(t => {
    if (type && t.type !== type) return false;
    if (cat  && t.category !== cat) return false;
    if (txnDateRange && txnDateRange.length === 2) {
      const d = new Date(t.date);
      if (d < txnDateRange[0] || d > txnDateRange[1]) return false;
    }
    if (search && !(t.description.toLowerCase().includes(search) || getCat(t.category).name.toLowerCase().includes(search) || (t.notes||'').toLowerCase().includes(search))) return false;
    return true;
  }).sort((a,b) => new Date(b.date)-new Date(a.date));
}

function renderTransactions() {
  const catSel = document.getElementById('txnFilterCat');
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">All Categories</option>' +
      STATE.categories.map(c => `<option value="${c.id}" ${c.id===cur?'selected':''}>${c.icon} ${c.name}</option>`).join('');
  }

  const filtered = getFilteredTxns();
  const totalPages = Math.max(1, Math.ceil(filtered.length / TXN_PER_PAGE));
  txnPage = Math.min(txnPage, totalPages);
  const paged = filtered.slice((txnPage-1)*TXN_PER_PAGE, txnPage*TXN_PER_PAGE);

  const tbody = document.getElementById('txnTableBody');
  if (!paged.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No transactions found.</div></div></td></tr>`;
  } else {
    tbody.innerHTML = paged.map(t => {
      const cat = getCat(t.category);
      return `
      <tr>
        <td>${new Date(t.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td>
        <td>
          <div style="font-weight:600">${esc(t.description)}</div>
          ${t.notes ? `<div style="font-size:0.76rem;color:var(--text-secondary);margin-top:2px">${esc(t.notes)}</div>` : ''}
        </td>
        <td><span class="cat-chip" style="background:${cat.color}22;color:${cat.color}">${cat.icon} ${cat.name}</span></td>
        <td><span class="type-badge ${t.type}">${t.type === 'savings' ? '💰 savings' : t.type}</span></td>
        <td class="text-right" style="color:${t.type==='income'?'var(--income-color)':'var(--expense-color)'}; font-weight:700">
          ${t.type==='income'?'+':'-'}${fmt(t.amount)}
        </td>
        <td class="text-center">
          <div class="action-btns">
            <button class="btn-icon" onclick="openEditTxn('${t.id}')" title="Edit">✏️</button>
            <button class="btn-icon danger" onclick="deleteTxn('${t.id}')" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  const pagEl = document.getElementById('txnPagination');
  pagEl.innerHTML = '';
  if (totalPages > 1) {
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === txnPage ? ' active' : '');
      btn.textContent = i;
      btn.onclick = () => { txnPage = i; renderTransactions(); };
      pagEl.appendChild(btn);
    }
  }
}

async function deleteTxn(id) {
  showConfirm('Delete this transaction? This action cannot be undone.', async () => {
    await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
    STATE.transactions = STATE.transactions.filter(t => t.id !== id);
    renderTransactions();
    showToast('Transaction deleted');
    checkBudgetAlerts();
  });
}

/* ═══════════════════════════════════════════════════════
   TRANSACTION MODAL
   ═══════════════════════════════════════════════════════ */
let txnDatePicker = null;

function openAddTxn() {
  document.getElementById('txnModalTitle').textContent = 'Add Transaction';
  document.getElementById('txnForm').reset();
  document.getElementById('txnId').value = '';
  populateTxnCatSelect();
  document.getElementById('txnModal').classList.add('open');
  initTxnDatePicker();
  txnDatePicker?.setDate(new Date());
}

function openEditTxn(id) {
  const t = STATE.transactions.find(x => x.id===id);
  if (!t) return;
  document.getElementById('txnModalTitle').textContent = 'Edit Transaction';
  document.getElementById('txnId').value      = t.id;
  document.getElementById('txnType').value    = t.type;
  document.getElementById('txnAmount').value  = t.amount;
  document.getElementById('txnDesc').value    = t.description;
  document.getElementById('txnNotes').value   = t.notes || '';
  populateTxnCatSelect(t.type);
  document.getElementById('txnCategory').value = t.category;
  document.getElementById('txnModal').classList.add('open');
  initTxnDatePicker();
  txnDatePicker?.setDate(t.date ? new Date(t.date) : new Date());
}

function populateTxnCatSelect(type) {
  const sel = document.getElementById('txnCategory');
  const curType = type || document.getElementById('txnType').value;
  const cats = STATE.categories.filter(c => {
    if (curType === 'savings') return c.type === 'savings' || c.type === 'both';
    return c.type === curType || c.type === 'both';
  });
  sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

function initTxnDatePicker() {
  if (txnDatePicker) { try { txnDatePicker.destroy(); } catch(e){} txnDatePicker = null; }
  txnDatePicker = flatpickr('#txnDate', {
    dateFormat: 'Y-m-d',
    maxDate: 'today',
    theme: 'dark',
  });
}

function closeTxnModal() { document.getElementById('txnModal').classList.remove('open'); }

async function saveTxn(e) {
  e.preventDefault();
  const id     = document.getElementById('txnId').value;
  const type   = document.getElementById('txnType').value;
  const amount = parseFloat(document.getElementById('txnAmount').value);
  const cat    = document.getElementById('txnCategory').value;
  const date   = document.getElementById('txnDate').value;
  const desc   = document.getElementById('txnDesc').value.trim();
  const notes  = document.getElementById('txnNotes').value.trim();

  if (!amount || amount <= 0 || !cat || !date || !desc) {
    showToast('Please fill in all required fields.', 'error'); return;
  }

  const btn = document.getElementById('txnSaveBtn');
  btn.disabled = true;

  const payload = { type, amount, category: cat, date, description: desc, notes };

  if (id) {
    const updated = await apiFetch(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (updated) {
      const idx = STATE.transactions.findIndex(t => t.id===id);
      if (idx >= 0) STATE.transactions[idx] = updated;
      showToast('Transaction updated ✓');
    }
  } else {
    const created = await apiFetch('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });
    if (created) {
      STATE.transactions.unshift(created);
      showToast('Transaction added ✓');
    }
  }

  btn.disabled = false;
  closeTxnModal();
  renderTransactions();
  checkBudgetAlerts();
}

/* ═══════════════════════════════════════════════════════
   CATEGORIES
   ═══════════════════════════════════════════════════════ */
function renderCategories() {
  const grid = document.getElementById('catGrid');
  if (!STATE.categories.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗂️</div><div class="empty-state-text">No categories yet.</div></div>';
    return;
  }
  grid.innerHTML = STATE.categories.map(c => `
    <div class="cat-card" style="border-top: 3px solid ${c.color}">
      <div class="cat-card-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
      <div class="cat-card-name">${esc(c.name)}</div>
      <div class="cat-card-type">${c.type}</div>
      <div class="cat-card-actions">
        <button class="btn-icon" onclick="openEditCat('${c.id}')" title="Edit category">✏️</button>
        ${!c.fixed ? `<button class="btn-icon danger" onclick="deleteCat('${c.id}')" title="Delete category">🗑️</button>` : `<span class="cat-fixed-badge">Default</span>`}
      </div>
    </div>`).join('');
}

function openAddCat() {
  document.getElementById('catModalTitle').textContent = 'Add Category';
  document.getElementById('catForm').reset();
  document.getElementById('catId').value = '';
  document.getElementById('catColor').value = '#6c63ff';
  document.getElementById('catModal').classList.add('open');
}

function openEditCat(id) {
  const c = STATE.categories.find(x => x.id===id);
  if (!c) return;
  document.getElementById('catModalTitle').textContent = 'Edit Category';
  document.getElementById('catId').value    = c.id;
  document.getElementById('catName').value  = c.name;
  document.getElementById('catIcon').value  = c.icon;
  document.getElementById('catColor').value = c.color;
  document.getElementById('catType').value  = c.type;
  document.getElementById('catModal').classList.add('open');
}

function closeCatModal() { document.getElementById('catModal').classList.remove('open'); }

async function saveCat(e) {
  e.preventDefault();
  const id    = document.getElementById('catId').value;
  const name  = document.getElementById('catName').value.trim();
  const icon  = document.getElementById('catIcon').value.trim() || '📁';
  const color = document.getElementById('catColor').value;
  const type  = document.getElementById('catType').value;

  if (!name) { showToast('Category name is required.', 'error'); return; }

  if (id) {
    const updated = await apiFetch(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name, icon, color, type }) });
    if (updated) {
      const idx = STATE.categories.findIndex(c => c.id===id);
      if (idx >= 0) STATE.categories[idx] = updated;
      showToast('Category updated ✓');
    }
  } else {
    if (STATE.categories.find(c => c.name.toLowerCase()===name.toLowerCase())) {
      showToast('A category with that name already exists.', 'warn'); return;
    }
    const created = await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name, icon, color, type, fixed: false }) });
    if (created) {
      STATE.categories.push(created);
      showToast('Category added ✓');
    }
  }
  closeCatModal();
  renderCategories();
}

async function deleteCat(id) {
  const c = STATE.categories.find(x => x.id===id);
  if (!c) return;
  const inUse = STATE.transactions.some(t => t.category===id);
  if (inUse) { showToast('Cannot delete — category is used in transactions.', 'warn'); return; }
  showConfirm(`Delete category "${c.name}"? This cannot be undone.`, async () => {
    await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
    STATE.categories = STATE.categories.filter(x => x.id!==id);
    STATE.budgets    = STATE.budgets.filter(b => b.category_id!==id);
    renderCategories();
    showToast('Category deleted');
  });
}

/* ═══════════════════════════════════════════════════════
   BUDGETS
   ═══════════════════════════════════════════════════════ */
function renderBudgets() {
  const grid = document.getElementById('budgetGrid');
  const now  = new Date();
  if (!STATE.budgets.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🎯</div><div class="empty-state-text">No budgets set yet. Click "+ Set Budget" to get started.</div></div>';
    return;
  }

  grid.innerHTML = STATE.budgets.map(b => {
    const cat   = getCat(b.category_id);
    const limit = Number(b.amount);
    const spent = STATE.transactions
      .filter(t => t.type==='expense' && t.category===b.category_id && new Date(t.date).getFullYear()===now.getFullYear() && new Date(t.date).getMonth()===now.getMonth())
      .reduce((s,t) => s+Number(t.amount), 0);
    const pct   = Math.min((spent/limit)*100, 100);
    const remaining = Math.max(limit-spent, 0);
    let fillColor = 'var(--income-color)';
    let statusClass='status-ok', statusText='On Track';
    if (pct >= 100) { fillColor='var(--expense-color)'; statusClass='status-over'; statusText='Over Budget!'; }
    else if (pct >= 80) { fillColor='var(--warn-color)'; statusClass='status-warn'; statusText='Near Limit'; }

    return `
    <div class="budget-card">
      <div class="budget-card-header">
        <div class="budget-cat-info">
          <div class="budget-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
          <div>
            <div class="budget-cat-name">${esc(cat.name)}</div>
            <div class="budget-cat-limit">Limit: ${fmt(limit)}/mo</div>
          </div>
        </div>
        <div class="action-btns">
          <button class="btn-icon" onclick="openEditBudget('${b.id}')" title="Edit">✏️</button>
          <button class="btn-icon danger" onclick="deleteBudget('${b.id}')" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="budget-amounts">
        <span class="budget-spent" style="color:${fillColor}">${fmt(spent)} spent</span>
        <span class="budget-remaining">${fmt(remaining)} left</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${pct}%;background:${fillColor}"></div>
      </div>
      <span class="budget-status ${statusClass}">${statusText} · ${pct.toFixed(0)}%</span>
    </div>`;
  }).join('');
}

function openAddBudget() {
  document.getElementById('budgetModalTitle').textContent = 'Set Budget';
  document.getElementById('budgetForm').reset();
  document.getElementById('budgetId').value = '';
  populateBudgetCatSelect();
  document.getElementById('budgetModal').classList.add('open');
}

function openEditBudget(id) {
  const b = STATE.budgets.find(x=>x.id===id);
  if (!b) return;
  document.getElementById('budgetModalTitle').textContent = 'Edit Budget';
  document.getElementById('budgetId').value    = b.id;
  populateBudgetCatSelect(b.category_id);
  document.getElementById('budgetCat').value    = b.category_id;
  document.getElementById('budgetAmount').value = b.amount;
  document.getElementById('budgetModal').classList.add('open');
}

function populateBudgetCatSelect(selectedId) {
  const sel = document.getElementById('budgetCat');
  const expCats = STATE.categories.filter(c => c.type==='expense' || c.type==='both');
  sel.innerHTML = expCats.map(c=>`<option value="${c.id}" ${c.id===selectedId?'selected':''}>${c.icon} ${c.name}</option>`).join('');
}

function closeBudgetModal() { document.getElementById('budgetModal').classList.remove('open'); }

async function saveBudget(e) {
  e.preventDefault();
  const id     = document.getElementById('budgetId').value;
  const catId  = document.getElementById('budgetCat').value;
  const amount = parseFloat(document.getElementById('budgetAmount').value);

  if (!catId || !amount || amount<=0) { showToast('Please fill all fields.','error'); return; }

  if (id) {
    const updated = await apiFetch(`/api/budgets/${id}`, { method: 'PUT', body: JSON.stringify({ category_id: catId, amount }) });
    if (updated) {
      const idx = STATE.budgets.findIndex(b=>b.id===id);
      if (idx>=0) STATE.budgets[idx] = updated;
      showToast('Budget updated ✓');
    }
  } else {
    if (STATE.budgets.find(b=>b.category_id===catId)) { showToast('A budget for this category already exists.','warn'); return; }
    const created = await apiFetch('/api/budgets', { method: 'POST', body: JSON.stringify({ category_id: catId, amount }) });
    if (created) {
      STATE.budgets.push(created);
      showToast('Budget set ✓');
    }
  }
  closeBudgetModal();
  renderBudgets();
}

async function deleteBudget(id) {
  showConfirm('Delete this budget? You can always recreate it later.', async () => {
    await apiFetch(`/api/budgets/${id}`, { method: 'DELETE' });
    STATE.budgets = STATE.budgets.filter(b=>b.id!==id);
    renderBudgets();
    showToast('Budget deleted');
  });
}

function checkBudgetAlerts() {
  const now = new Date();
  STATE.budgets.forEach(b => {
    const spent = STATE.transactions
      .filter(t => t.type==='expense' && t.category===b.category_id && new Date(t.date).getFullYear()===now.getFullYear() && new Date(t.date).getMonth()===now.getMonth())
      .reduce((s,t)=>s+Number(t.amount),0);
    const pct = (spent/Number(b.amount))*100;
    const cat = getCat(b.category_id);
    if (pct >= 100) showToast(`🚨 ${cat.name} budget exceeded! (${fmt(spent)} / ${fmt(b.amount)})`, 'error');
    else if (pct >= 80) showToast(`⚠️ ${cat.name} budget at ${pct.toFixed(0)}% — approaching limit.`, 'warn');
  });
}

/* ═══════════════════════════════════════════════════════
   REPORTS
   ═══════════════════════════════════════════════════════ */
function renderReports() {
  const period = document.getElementById('reportPeriod').value;
  const txns   = filterByPeriod(STATE.transactions, period);

  const income  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  document.getElementById('repIncome').textContent  = fmt(income);
  document.getElementById('repExpense').textContent = fmt(expense);
  document.getElementById('repSavings').textContent = fmt(income-expense);

  const byCat = {};
  txns.forEach(t => {
    if (!byCat[t.category]) byCat[t.category] = { inc:0, exp:0 };
    if (t.type==='income')  byCat[t.category].inc += Number(t.amount);
    else                     byCat[t.category].exp += Number(t.amount);
  });

  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = Object.entries(byCat).map(([catId, vals]) => {
    const cat = getCat(catId);
    const pct = expense ? ((vals.exp/expense)*100).toFixed(1) : '—';
    return `<tr>
      <td><span class="cat-chip" style="background:${cat.color}22;color:${cat.color}">${cat.icon} ${cat.name}</span></td>
      <td class="text-right" style="color:var(--income-color)">${vals.inc ? fmt(vals.inc) : '—'}</td>
      <td class="text-right" style="color:var(--expense-color)">${vals.exp ? fmt(vals.exp) : '—'}</td>
      <td class="text-right" style="color:${vals.inc-vals.exp>=0?'var(--income-color)':'var(--expense-color)'}">${fmt(vals.inc-vals.exp)}</td>
      <td class="text-right">${pct}%</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data for this period.</div></div></td></tr>`;

  const [from, to] = getPeriodRange(period);
  const months = [];
  let cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }
  const incData = months.map(({year,month}) => STATE.transactions.filter(t=>t.type==='income'  && new Date(t.date).getFullYear()===year && new Date(t.date).getMonth()===month).reduce((s,t)=>s+Number(t.amount),0));
  const expData = months.map(({year,month}) => STATE.transactions.filter(t=>t.type==='expense' && new Date(t.date).getFullYear()===year && new Date(t.date).getMonth()===month).reduce((s,t)=>s+Number(t.amount),0));
  const labels  = months.map(({year,month}) => new Date(year,month,1).toLocaleDateString('en-IN',{month:'short',year:months.length>12?'2-digit':undefined}));

  destroyChart(reportChartInst);
  reportChartInst = new Chart(document.getElementById('reportChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Income',   data:incData, backgroundColor:'rgba(34,211,162,0.7)',  borderRadius:6 },
        { label:'Expenses', data:expData, backgroundColor:'rgba(248,113,113,0.7)', borderRadius:6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: { legend: { labels: { color:'#8b90a7', boxWidth:12 } }, tooltip:{ callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
      scales: {
        x: { grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b90a7'} },
        y: { grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b90a7', callback:v=>'₹'+v.toLocaleString('en-IN')} }
      }
    }
  });
}

/* ─── CSV Export ────────────────────────────────────── */
function exportCsv() {
  const period = document.getElementById('reportPeriod').value;
  const txns   = filterByPeriod(STATE.transactions, period).sort((a,b)=>new Date(a.date)-new Date(b.date));
  if (!txns.length) { showToast('No data to export.','warn'); return; }

  const rows = [
    ['Date','Description','Category','Type','Amount (₹)','Notes'],
    ...txns.map(t=>[
      t.date,
      `"${t.description.replace(/"/g,'""')}"`,
      getCat(t.category).name,
      t.type,
      Number(t.amount).toFixed(2),
      `"${(t.notes||'').replace(/"/g,'""')}"`
    ])
  ];

  const csv  = rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `FinanceIQ_${period}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('CSV exported ✓');
}

/* ═══════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════ */
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }

  // Show user name in sidebar
  const user = getUser();
  if (user) {
    const nameEl = document.querySelector('.user-name');
    const subEl  = document.querySelector('.user-sub');
    if (nameEl) nameEl.textContent = user.user_metadata?.name || user.email?.split('@')[0] || 'My Account';
    if (subEl)  subEl.textContent  = user.email || 'Personal Account';
  }

  // Add logout button to sidebar footer
  const sidebarFooter = document.querySelector('.sidebar-footer');
  if (sidebarFooter) {
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = '🚪 Sign Out';
    logoutBtn.style.cssText = 'margin-top:12px;width:100%;padding:10px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2);color:#f87171;border-radius:8px;cursor:pointer;font-family:inherit;font-size:0.85rem;font-weight:600';
    logoutBtn.onclick = () => {
      apiFetch('/api/auth/logout', { method: 'POST' });
      logout();
    };
    sidebarFooter.appendChild(logoutBtn);
  }

  // Load data from API
  await loadState();

  // Nav links
  document.querySelectorAll('.nav-item[data-page]').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); goToPage(link.dataset.page); });
  });

  document.querySelectorAll('.btn-link[data-page]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(btn.dataset.page));
  });

  // Topbar
  document.getElementById('hamburger').addEventListener('click', openSidebar);
  document.getElementById('overlay').addEventListener('click', closeSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);

  // Add Transaction buttons
  document.getElementById('addTxnBtn').addEventListener('click', openAddTxn);
  document.getElementById('addTxnBtnTopbar').addEventListener('click', openAddTxn);

  // Transaction modal
  document.getElementById('txnModalClose').addEventListener('click', closeTxnModal);
  document.getElementById('txnCancelBtn').addEventListener('click', closeTxnModal);
  document.getElementById('txnForm').addEventListener('submit', saveTxn);
  document.getElementById('txnType').addEventListener('change', () => populateTxnCatSelect());

  // Transaction filters
  document.getElementById('txnSearch').addEventListener('input', () => { txnPage=1; renderTransactions(); });
  document.getElementById('txnFilterType').addEventListener('change', () => { txnPage=1; renderTransactions(); });
  document.getElementById('txnFilterCat').addEventListener('change', () => { txnPage=1; renderTransactions(); });
  document.getElementById('txnClearFilter').addEventListener('click', () => {
    document.getElementById('txnSearch').value = '';
    document.getElementById('txnFilterType').value = '';
    document.getElementById('txnFilterCat').value = '';
    txnDateRange = null;
    if (window._txnRangePicker) { window._txnRangePicker.clear(); }
    txnPage = 1;
    renderTransactions();
  });

  window._txnRangePicker = flatpickr('#txnFilterDate', {
    mode: 'range',
    dateFormat: 'Y-m-d',
    onChange: (dates) => {
      if (dates.length === 2) {
        txnDateRange = [dates[0], new Date(dates[1].getFullYear(), dates[1].getMonth(), dates[1].getDate(), 23, 59, 59)];
      } else { txnDateRange = null; }
      txnPage = 1;
      renderTransactions();
    }
  });

  // Category modal
  document.getElementById('addCatBtn').addEventListener('click', openAddCat);
  document.getElementById('catModalClose').addEventListener('click', closeCatModal);
  document.getElementById('catCancelBtn').addEventListener('click', closeCatModal);
  document.getElementById('catForm').addEventListener('submit', saveCat);

  // Budget modal
  document.getElementById('addBudgetBtn').addEventListener('click', openAddBudget);
  document.getElementById('budgetModalClose').addEventListener('click', closeBudgetModal);
  document.getElementById('budgetCancelBtn').addEventListener('click', closeBudgetModal);
  document.getElementById('budgetForm').addEventListener('submit', saveBudget);

  // Confirm modal
  document.getElementById('confirmModalClose').addEventListener('click', closeConfirm);
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmOk').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });

  // Dashboard period
  document.getElementById('dashPeriod').addEventListener('change', renderDashboard);

  // Reports
  document.getElementById('reportPeriod').addEventListener('change', renderReports);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

  // Backdrop clicks close modals
  ['txnModal','catModal','budgetModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target === document.getElementById(id)) {
        document.getElementById(id).classList.remove('open');
      }
    });
  });

  // Initial render
  goToPage('dashboard');
});
