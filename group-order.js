// ============================================================
// GROUP ORDERS — group-order.js
// Abhängigkeiten: db, getCurrentUser, escapeHtml (app.js)
// goSession = globaler State der aktiven GO-Sitzung
// ============================================================

let activeGroupOrders = [];
let groupOrderChannel = null;
let blockedSuppliers  = new Set();

// { groupOrderId, supplierId, supplierName, supplierLogo, isCreator, deadline }
window.goSession = null;

// ============================================================
// INIT / TEARDOWN
// ============================================================

async function initGroupOrders() {
  ensurePanel();
  ensureTriggerBar();
  await autoCloseExpiredOrders();
  await loadActiveGroupOrders();
  subscribeGroupOrders();
}

async function teardownGroupOrders() {
  if (groupOrderChannel) {
    await db.removeChannel(groupOrderChannel);
    groupOrderChannel = null;
  }
  activeGroupOrders = [];
  blockedSuppliers.clear();
  window.goSession = null;

  document.getElementById('go-panel')?.remove();
  document.getElementById('go-trigger-bar')?.remove();
}

// ============================================================
// REALTIME
// ============================================================

function subscribeGroupOrders() {
  if (groupOrderChannel) return;
  groupOrderChannel = db
    .channel('group-orders-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_orders' }, () => {
      loadActiveGroupOrders();
    })
    .subscribe();
}

// ============================================================
// AUTO-CLOSE EXPIRED
// ============================================================

async function autoCloseExpiredOrders() {
  const user = await getCurrentUser();
  if (!user) return;

  const now = new Date().toISOString();
  const { data } = await db
    .from('group_orders')
    .select('id')
    .eq('creator_id', user.id)
    .eq('status', 'open')
    .lt('deadline', now);

  if (!data?.length) return;

  await Promise.all(data.map(go =>
    db.from('group_orders').update({ status: 'closed' }).eq('id', go.id)
  ));
}

// ============================================================
// LADEN + RENDERN
// ============================================================

async function loadActiveGroupOrders() {
  const user = await getCurrentUser();
  if (!user) return;

  const { data, error } = await db
    .from('group_orders')
    .select('id, supplier_id, supplier_name, supplier_logo, deadline, status, creator_id')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) { console.error('GO laden:', error); return; }

  activeGroupOrders = data || [];
  blockedSuppliers  = new Set(activeGroupOrders.map(go => go.supplier_id));

  renderGoPanel(user);
  renderGoBanner();
}

function renderGoPanel(user) {
  const panel = document.getElementById('go-panel-inner');
  if (!panel) return;

  if (!activeGroupOrders.length) {
    panel.innerHTML = `<div class="go-empty-state">Keine aktiven Sammelbestellungen.</div>`;
    return;
  }

  panel.innerHTML = activeGroupOrders.map(go => {
    const isCreator = go.creator_id === user.id;
    const deadline  = formatDeadline(go.deadline);
    return `
    <div class="go-order-card" data-id="${go.id}">
      <div class="go-order-card-header">
        ${go.supplier_logo
          ? `<img src="${escapeHtml(go.supplier_logo)}" alt="${escapeHtml(go.supplier_name)}" class="go-supplier-logo">`
          : `<span class="go-supplier-name">${escapeHtml(go.supplier_name)}</span>`}
        <div class="go-order-meta">
          <span class="go-order-deadline">⏱ ${deadline}</span>
          ${isCreator ? '<span class="go-creator-badge">Ersteller</span>' : ''}
        </div>
      </div>
      <div class="go-order-card-footer">
        <button type="button" class="go-btn-primary go-join-btn" data-id="${go.id}"
                data-supplier-id="${go.supplier_id}"
                data-supplier-name="${escapeAttr(go.supplier_name)}"
                data-supplier-logo="${escapeAttr(go.supplier_logo ?? '')}"
                data-deadline="${escapeAttr(go.deadline)}"
                data-is-creator="${isCreator}">
          Teilnehmen
        </button>
        ${isCreator ? `<button type="button" class="go-btn-secondary go-close-btn" data-id="${go.id}">Beenden</button>` : ''}
      </div>
    </div>`;
  }).join('');

  // Events
  panel.querySelectorAll('.go-join-btn').forEach(btn => {
    btn.addEventListener('click', () => joinGoSession({
      groupOrderId:  btn.dataset.id,
      supplierId:    btn.dataset.supplierId,
      supplierName:  btn.dataset.supplierName,
      supplierLogo:  btn.dataset.supplierLogo,
      deadline:      btn.dataset.deadline,
      isCreator:     btn.dataset.isCreator === 'true',
    }));
  });

  panel.querySelectorAll('.go-close-btn').forEach(btn => {
    btn.addEventListener('click', () => closeGroupOrder(btn.dataset.id));
  });
}

// ============================================================
// BANNER
// ============================================================

function renderGoBanner() {
  let banner = document.getElementById('go-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'go-banner';
    banner.className = 'go-banner';
    document.querySelector('.shop-content')?.prepend(banner);
  }

  const sess = window.goSession;
  if (!sess) { banner.classList.add('hidden'); return; }

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="go-banner-inner">
      <div class="go-banner-info">
        ${sess.supplierLogo
          ? `<img src="${escapeHtml(sess.supplierLogo)}" alt="${escapeHtml(sess.supplierName)}" class="go-banner-logo">`
          : ''}
        <div>
          <strong>${escapeHtml(sess.supplierName)}</strong>
          <span class="go-banner-deadline">⏱ ${formatDeadline(sess.deadline)}</span>
        </div>
      </div>
      <button type="button" class="go-btn-secondary go-banner-leave" id="go-banner-leave-btn">Verlassen</button>
    </div>
    <p class="go-banner-error" id="go-banner-error"></p>`;

  document.getElementById('go-banner-leave-btn')?.addEventListener('click', leaveGoSession);
}

// ============================================================
// SESSION: BEITRETEN / VERLASSEN
// ============================================================

async function joinGoSession(opts) {
  const user = await getCurrentUser();
  if (!user) return;

  window.goSession = {
    groupOrderId: opts.groupOrderId,
    supplierId:   opts.supplierId,
    supplierName: opts.supplierName,
    supplierLogo: opts.supplierLogo,
    deadline:     opts.deadline,
    isCreator:    opts.isCreator,
  };

  // Produkte neu laden (gefiltert nach Lieferant)
  await loadProductsForGo(opts.supplierId);
  if (typeof updateCartLabelsForGo === 'function') updateCartLabelsForGo(opts.supplierName);
  if (typeof loadGoCart            === 'function') await loadGoCart();

  renderGoBanner();
  closePanelDrawer();
}

async function leaveGoSession() {
  window.goSession = null;

  await loadProducts();
  if (typeof resetCartLabels === 'function') resetCartLabels();
  if (typeof loadGoCart      === 'function') await loadGoCart();

  renderGoBanner();
}

async function loadProductsForGo(supplierId) {
  const { data, error } = await db
    .from('products')
    .select('id, name, price, unit, category, supplier_id, supplier_name, supplier_logo, image_url, note')
    .eq('active', true)
    .eq('supplier_id', supplierId)
    .order('category', { ascending: true })
    .order('name',     { ascending: true });

  if (error) { console.error('GO Produkte laden:', error); return; }

  allProducts = data || [];
  categories  = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
  suppliers   = [window.goSession?.supplierName].filter(Boolean);

  activeFilters.categories.clear();
  activeFilters.suppliers.clear();

  renderFilterChips();
  renderProducts();
}

// ============================================================
// GROUP ORDER: ERSTELLEN
// ============================================================

function openCreateForm() {
  const panel = document.getElementById('go-panel-inner');
  if (!panel) return;

  panel.innerHTML = `
    <p class="go-section-title go-section-title--spacious">Neue Sammelbestellung</p>
    <form id="go-create-form" class="go-create-form" novalidate>
      <div class="go-field">
        <label for="go-supplier-select" class="go-label">Lieferant</label>
        <select id="go-supplier-select" class="go-select">
          <option value="">-- Lieferant wählen --</option>
          ${suppliers.map(s => `<option value="">${escapeHtml(s)}</option>`).join('')}
        </select>
        <p id="go-supplier-error" class="go-error go-error--field" role="alert" aria-live="polite"></p>
      </div>
      <div id="go-deadline-wrap" class="go-deadline-wrap go-deadline-wrap--disabled">
        <div class="go-field">
          <label for="go-deadline-input" class="go-label">Deadline</label>
          <input type="date" id="go-deadline-input" class="go-input" disabled>
        </div>
      </div>
      <div class="go-form-footer">
        <button type="button" class="go-btn-secondary" id="go-create-cancel-btn">Abbrechen</button>
        <button type="button" class="go-btn-primary go-btn-primary--disabled" id="go-create-submit-btn" disabled>Sammelbestellung erstellen</button>
      </div>
    </form>`;

  setupCreateForm();
}

function setupCreateForm() {
  const selectEl  = document.getElementById('go-supplier-select');
  const submitBtn = document.getElementById('go-create-submit-btn');
  const cancelBtn = document.getElementById('go-create-cancel-btn');
  const errEl     = document.getElementById('go-supplier-error');

  // Lieferanten aus allProducts befüllen (die ohne aktive GO)
  const available = suppliers.filter(s => {
    const prod = allProducts.find(p => p.supplier_name === s);
    return prod && !blockedSuppliers.has(prod.supplier_id);
  });

  selectEl.innerHTML = '<option value="">-- Lieferant wählen --</option>' +
    available.map(s => {
      const prod = allProducts.find(p => p.supplier_name === s);
      return `<option value="${escapeAttr(prod?.supplier_id ?? '')}" data-name="${escapeAttr(s)}" data-logo="${escapeAttr(prod?.supplier_logo ?? '')}">${escapeHtml(s)}</option>`;
    }).join('');

  selectEl.addEventListener('change', () => {
    const hasValue = !!selectEl.value;
    setCreateFieldsEnabled(hasValue);
    if (errEl) errEl.textContent = hasValue ? '' : 'Bitte Lieferant wählen.';
  });

  cancelBtn?.addEventListener('click', () => renderGoPanel(null));
  submitBtn?.addEventListener('click', createGroupOrder);
}

function setCreateFieldsEnabled(enabled) {
  const deadlineWrap  = document.getElementById('go-deadline-wrap');
  const deadlineInput = document.getElementById('go-deadline-input');
  const submitBtn     = document.getElementById('go-create-submit-btn');
  if (deadlineWrap) {
    deadlineWrap.classList.toggle('go-deadline-wrap--disabled', !enabled);
  }
  if (deadlineInput) deadlineInput.disabled = !enabled;
  if (submitBtn) {
    submitBtn.disabled = !enabled;
    submitBtn.classList.toggle('go-btn-primary--disabled', !enabled);
  }
}

async function createGroupOrder() {
  const user = await getCurrentUser();
  if (!user) return;

  const selectEl  = document.getElementById('go-supplier-select');
  const dateEl    = document.getElementById('go-deadline-input');
  const errEl     = document.getElementById('go-supplier-error');
  const submitBtn = document.getElementById('go-create-submit-btn');

  const supplierId   = selectEl?.value;
  const selectedOpt  = selectEl?.options[selectEl.selectedIndex];
  const supplierName = selectedOpt?.dataset.name ?? '';
  const supplierLogo = selectedOpt?.dataset.logo ?? '';
  const deadline     = dateEl?.value ? new Date(dateEl.value + 'T23:59:59').toISOString() : null;

  if (!supplierId) {
    if (errEl) errEl.textContent = 'Bitte Lieferant wählen.';
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Erstellen…'; }

  const { data, error } = await db.from('group_orders').insert({
    creator_id:    user.id,
    supplier_id:   supplierId,
    supplier_name: supplierName,
    supplier_logo: supplierLogo || null,
    deadline:      deadline,
    status:        'open',
  }).select().single();

  if (error) {
    const bannerErr = document.getElementById('go-banner-error');
    if (bannerErr) bannerErr.textContent = `Fehler: ${error.message}`;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sammelbestellung erstellen'; }
    return;
  }

  await loadActiveGroupOrders();
  await joinGoSession({
    groupOrderId: data.id,
    supplierId,
    supplierName,
    supplierLogo,
    deadline,
    isCreator: true,
  });
}

// ============================================================
// GROUP ORDER: SCHLIEßEN
// ============================================================

async function closeGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await db
    .from('group_orders')
    .update({ status: 'closed' })
    .eq('id', groupOrderId)
    .eq('creator_id', user.id);

  if (error) { console.error('GO schließen:', error); return; }

  if (window.goSession?.groupOrderId === groupOrderId) {
    await leaveGoSession();
  } else {
    await loadActiveGroupOrders();
  }
}

// ============================================================
// PANEL: TRIGGER + DRAWER
// ============================================================

function ensureTriggerBar() {
  if (document.getElementById('go-trigger-bar')) return;

  const bar = document.createElement('div');
  bar.id        = 'go-trigger-bar';
  bar.className = 'go-trigger-bar';
  bar.innerHTML = `
    <button type="button" class="go-trigger-btn" id="go-trigger-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      Sammelbestellung
    </button>`;

  document.querySelector('.shop-topbar')?.appendChild(bar);
  document.getElementById('go-trigger-btn')?.addEventListener('click', openPanelDrawer);
}

function ensurePanel() {
  if (document.getElementById('go-panel')) return;

  const panel = document.createElement('div');
  panel.id        = 'go-panel';
  panel.className = 'go-panel';
  panel.setAttribute('aria-label', 'Sammelbestellung');
  panel.setAttribute('aria-hidden', 'true');

  panel.innerHTML = `
    <div class="go-panel-header">
      <h2 class="go-panel-title">Sammelbestellungen</h2>
      <button type="button" class="go-panel-close" id="go-panel-close" aria-label="Panel schließen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div id="go-panel-inner" class="go-panel-inner"></div>
    <div class="go-panel-footer">
      <button type="button" class="go-btn-primary" id="go-create-btn">+ Neue Sammelbestellung</button>
    </div>`;

  document.body.appendChild(panel);

  document.getElementById('go-panel-close')?.addEventListener('click', closePanelDrawer);
  document.getElementById('go-create-btn')?.addEventListener('click', () => {
    if (suppliers.length === 0) {
      alert('Keine Lieferanten verfügbar.');
      return;
    }
    openCreateForm();
  });

  // Overlay-Klick
  panel.addEventListener('click', e => {
    if (e.target === panel) closePanelDrawer();
  });
}

function openPanelDrawer() {
  const panel = document.getElementById('go-panel');
  if (!panel) return;
  panel.classList.add('open');
  panel.removeAttribute('aria-hidden');
}

function closePanelDrawer() {
  const panel = document.getElementById('go-panel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

// ============================================================
// HELPERS
// ============================================================

function formatDeadline(isoString) {
  return new Date(isoString).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = function(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
