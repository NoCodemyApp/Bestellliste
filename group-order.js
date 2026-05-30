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

function teardownGroupOrders() {
  activeGroupOrders = [];
  blockedSuppliers  = new Set();
  window.goSession  = null;
  if (groupOrderChannel) { db.removeChannel(groupOrderChannel); groupOrderChannel = null; }
   document.getElementById('go-trigger-bar')?.remove();
  updateTriggerBar();
  closeGroupPanel();
  deactivateGoMode();
}

// ============================================================
// AUTO-CLOSE
// ============================================================

async function autoCloseExpiredOrders() {
  const now = new Date().toISOString();
  const { error } = await db.from('group_orders')
    .update({ status: 'closed' }).eq('status', 'open').lt('deadline', now);
  if (error) console.warn('Auto-Close Fehler:', error.message);
}

// ============================================================
// LOAD
// ============================================================

async function loadActiveGroupOrders() {
  const now = new Date().toISOString();
  // FIX #1: supplier_id + suppliers-Join ergänzt
  const { data, error } = await db.from('group_orders')
    .select('id, title, deadline, status, created_by, created_at, supplier_id, suppliers(name)')
    .eq('status', 'open').gt('deadline', now)
    .order('deadline', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden:', error.message);
    activeGroupOrders = []; blockedSuppliers = new Set();
  } else {
    activeGroupOrders = data || [];
    // FIX #2: blockedSuppliers auf supplier_id (UUID) umgestellt
    blockedSuppliers  = new Set(activeGroupOrders.map(o => o.supplier_id).filter(Boolean));
  }
  updateTriggerBar();
  if (document.getElementById('go-panel')?.classList.contains('go-panel--open')) renderPanelContent();
}

function subscribeGroupOrders() {
  if (groupOrderChannel) db.removeChannel(groupOrderChannel);
  groupOrderChannel = db.channel('group_orders_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_orders' }, async () => {
      await autoCloseExpiredOrders();
      await loadActiveGroupOrders();
    }).subscribe();
}

// ============================================================
// TRIGGER BAR
// ============================================================

function ensureTriggerBar() {
  if (document.getElementById('go-trigger-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'go-trigger-bar'; bar.className = 'go-trigger-bar';
  const ps = document.getElementById('products-section');
  ps?.parentNode?.insertBefore(bar, ps);
  updateTriggerBar();
}

function updateTriggerBar() {
  const bar = document.getElementById('go-trigger-bar');
  if (!bar) return;
  const count = activeGroupOrders.length;
  if (count === 0) {
    bar.innerHTML = `<div class="go-trigger-bar-actions"><button class="go-create-btn" id="go-trigger-create-btn" type="button">+ Sammelbestellung eröffnen</button></div>`;
    document.getElementById('go-trigger-create-btn')?.addEventListener('click', openGroupPanel);
  } else {
    // FIX #3: o.suppliers?.name statt o.title
    const titles = activeGroupOrders.map(o => escapeHtml(o.suppliers?.name || o.title || 'Sammelbestellung'));
    const label  = count === 1 ? titles[0] : `${count} Sammelbestellungen aktiv`;
    bar.innerHTML = `
      <div class="go-trigger-bar-text"><span class="go-trigger-dot"></span><span>${label}</span></div>
      <div class="go-trigger-bar-actions">
        <button class="go-open-btn" id="go-trigger-open-btn" type="button">Anzeigen</button>
        <button class="go-create-btn" id="go-trigger-create-btn" type="button">+ Neu</button>
      </div>`;
    document.getElementById('go-trigger-open-btn')  ?.addEventListener('click', openGroupPanel);
    document.getElementById('go-trigger-create-btn')?.addEventListener('click', openGroupPanel);
  }
}

// ============================================================
// GO-MODE — Signal-Banner + gefilterte Produktseite
// ============================================================

// FIX #4: 6-Parameter-Signatur + kein products-Query mehr
async function activateGoMode(groupOrderId, supplierId, supplierName, supplierLogo, isCreator, deadline) {
  window.goSession = { groupOrderId, supplierId, supplierName, supplierLogo, isCreator, deadline };
  closeGroupPanel();
  renderGoSignalBanner();
  await renderGoSupplierLogo(supplierId);
  filterProductsForGo(supplierId);
  // FIX: supplierName übergeben, nicht supplierId
  if (typeof updateCartLabelsForGo === 'function') updateCartLabelsForGo(supplierName);
  if (typeof loadGoCart === 'function') await loadGoCart();
  history.pushState({ view: 'go-products' }, '', location.href);
}

async function deactivateGoMode() {
  window.goSession = null;
  removeGoSignalBanner();
  document.getElementById('go-supplier-logo-banner')?.remove();
  if (typeof resetCartLabels === 'function') resetCartLabels();

  // GO-Mode-Klassen entfernen — Sidebar/Filter wieder im Normalzustand
  const sidebar = document.getElementById('shop-sidebar-desktop');
  if (sidebar) {
    sidebar.classList.remove('go-sidebar-hidden');
    sidebar.classList.remove('go-sidebar-supplier-only');
  }
  const supplierBlock = document.getElementById('filter-block-supplier');
  if (supplierBlock) supplierBlock.classList.remove('go-sidebar-hidden');
  const supplierBlockMobile = document.getElementById('filter-block-supplier-mobile');
  if (supplierBlockMobile) supplierBlockMobile.classList.remove('go-sidebar-hidden');
  const filterBtn = document.getElementById('filter-toggle-btn');
  if (filterBtn) filterBtn.classList.remove('go-sidebar-hidden');
  const filterFabEl = document.getElementById('filter-fab');
  if (filterFabEl) filterFabEl.classList.remove('go-sidebar-hidden');
  const activeFilterBarEl = document.getElementById('active-filter-bar');
  if (activeFilterBarEl) activeFilterBarEl.classList.remove('go-sidebar-hidden');

  const triggerBar = document.getElementById('go-trigger-bar');
  if (triggerBar) triggerBar.style.display = '';

  if (typeof allProducts !== 'undefined' && allProducts.length > 0) {
    activeFilters = { category: new Set(), supplier: new Set() };
    buildFilterChips(allProducts);
    renderProducts(allProducts);
    updateFilterUI();
  }
  if (typeof loadCart === 'function') await loadCart();
}


function filterProductsForGo(supplierId) {
  if (typeof allProducts === 'undefined') return;

  const filtered = allProducts.filter(p => p.supplier_id === supplierId);

  // Sidebar bleibt sichtbar im GO-Mode, aber der Lieferanten-Block wird
  // ausgeblendet (Lieferant ist durch die Sammelbestellung fix).
  // Kategorie-Filter + Reset-Button bleiben nutzbar.
  const sidebar = document.getElementById('shop-sidebar-desktop');
  if (sidebar) {
    sidebar.classList.remove('go-sidebar-hidden');
    sidebar.classList.add('go-sidebar-supplier-only');
  }
  const supplierBlock = document.getElementById('filter-block-supplier');
  if (supplierBlock) supplierBlock.classList.add('go-sidebar-hidden');
  const supplierBlockMobile = document.getElementById('filter-block-supplier-mobile');
  if (supplierBlockMobile) supplierBlockMobile.classList.add('go-sidebar-hidden');

  // Filter-Toggle-Button (mobile) + FAB bleiben sichtbar
  const filterBtn = document.getElementById('filter-toggle-btn');
  if (filterBtn) filterBtn.classList.remove('go-sidebar-hidden');
  const filterFabEl = document.getElementById('filter-fab');
  if (filterFabEl) filterFabEl.classList.remove('go-sidebar-hidden');

  // Active-Filter-Bar (Chips zeigen aktive Filter) sichtbar lassen
  const activeFilterBarEl = document.getElementById('active-filter-bar');
  if (activeFilterBarEl) activeFilterBarEl.classList.remove('go-sidebar-hidden');

  const triggerBar = document.getElementById('go-trigger-bar');
  if (triggerBar) triggerBar.style.display = 'none';

  // Lieferanten-Vorauswahl anwenden, damit der Kategorie-Filter
  // über Produkte des passenden Lieferanten arbeitet.
  window.__goSupplierFilter = supplierId;

  // Kategorie-Chips neu aufbauen — nur Kategorien des aktuellen Lieferanten
  if (typeof buildFilterChips === 'function') {
    if (typeof activeFilters !== 'undefined') {
      activeFilters = { category: new Set(), supplier: new Set() };
    }
    buildFilterChips(filtered);
    if (typeof updateFilterUI === 'function') updateFilterUI();
  }

  renderProducts(filtered);
}

function renderGoSignalBanner() {
  removeGoSignalBanner();
  const sess = window.goSession;
  if (!sess) return;
  const banner = document.createElement('div');
  banner.id = 'go-signal-banner';
  banner.className = 'go-signal-banner';
  // FIX #6: sess.supplierName statt sess.supplierId
  banner.innerHTML = `
    <div class="go-signal-left">
      <span class="go-signal-dot"></span>
      <span class="go-signal-label">Sammelbestellung</span>
      <span class="go-signal-supplier">${escapeHtml(sess.supplierName)}</span>
    </div>
    <button class="go-signal-leave-btn" id="go-signal-leave" type="button">Verlassen</button>`;
  const ps = document.getElementById('products-section');
  ps?.parentNode?.insertBefore(banner, ps);
  document.getElementById('go-signal-leave')?.addEventListener('click', () => deactivateGoMode());
}

function removeGoSignalBanner() {
  document.getElementById('go-signal-banner')?.remove();
}

// Lieferanten Logo anzeigen lassen
async function renderGoSupplierLogo(supplierId) {
  document.getElementById('go-supplier-logo-banner')?.remove();
  if (!supplierId) return;

  const { data } = await db.from('suppliers')
    .select('logo_url')
    .eq('id', supplierId)
    .maybeSingle();
  
  if (window.goSession) {
    window.goSession.supplierLogo = data?.logo_url || null;
  }

  if (!data?.logo_url) return;

  const banner = document.createElement('div');
  banner.id = 'go-supplier-logo-banner';
  banner.className = 'go-supplier-logo-banner';
  banner.innerHTML = `<img src="${escapeHtml(data.logo_url)}" alt="Lieferanten-Logo" class="go-supplier-logo-img">`;

  const ps = document.getElementById('products-section');
  ps?.parentNode?.insertBefore(banner, ps);
}

// ============================================================
// OVERLAY
// ============================================================

function openPanelOverlay() {
  if (window.innerWidth >= 1024) return;
  const overlay = document.getElementById('cart-overlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('cart-overlay--visible');
  document.body.classList.add('drawer-open');
}

function closePanelOverlay() {
  if (window.innerWidth >= 1024) return;
  const overlay = document.getElementById('cart-overlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('cart-overlay--visible');
  document.body.classList.remove('drawer-open');
}

// ============================================================
// PANEL — OPEN / CLOSE
// ============================================================

function ensurePanel() {
  if (document.getElementById('go-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'go-panel'; panel.className = 'go-panel app-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Sammelbestellungen');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="go-panel-inner app-panel-inner">
      <div class="go-panel-handle" aria-hidden="true"></div>
      <div class="go-panel-header app-panel-header">
        <button class="go-panel-back-btn app-panel-back-btn" id="go-panel-back" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Zurück
        </button>
        <h2 class="go-panel-header-title">Sammelbestellungen</h2>
        <button class="go-panel-close-btn" id="go-panel-close" type="button" aria-label="Schließen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="go-panel-body" id="go-panel-body"></div>
    </div>`;
  document.body.appendChild(panel);
  document.getElementById('go-panel-back') ?.addEventListener('click', closeGroupPanel);
  document.getElementById('go-panel-close')?.addEventListener('click', closeGroupPanel);
  let touchStartY = 0;
  panel.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  panel.addEventListener('touchend',   e => { if (e.changedTouches[0].clientY - touchStartY > 70) closeGroupPanel(); }, { passive: true });
}

function openGroupPanel() {
  const panel = document.getElementById('go-panel');
  if (!panel) return;
  if (window.innerWidth >= 1024) {
    document.getElementById('products-section')?.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  panel.classList.add('go-panel--open');
  panel.setAttribute('aria-hidden', 'false');
  openPanelOverlay();
  renderPanelContent();
  history.pushState({ view: 'go-panel' }, '', location.href);
}

function closeGroupPanel() {
  const panel = document.getElementById('go-panel');
  if (!panel) return;
  panel.classList.remove('go-panel--open');
  panel.setAttribute('aria-hidden', 'true');
  closePanelOverlay();
  if (window.innerWidth >= 1024) {
    document.getElementById('products-section')?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function closeGroupOrderModal() { closeGroupPanel(); }

// ============================================================
// PANEL CONTENT
// ============================================================

function renderPanelContent() {
  const body = document.getElementById('go-panel-body');
  if (!body) return;
  const orders = activeGroupOrders;
  let html = '';

  if (orders.length > 0) {
    html += `<p class="go-section-title">Aktive Bestellungen</p><div class="go-list">`;
    html += orders.map(o => `
      <div class="go-item" data-go-item-id="${escapeHtml(String(o.id))}">
        <div class="go-item-info">
          <p class="go-item-title">${escapeHtml(o.suppliers?.name || o.title || 'Sammelbestellung')}</p>
          <p class="go-item-deadline">Endet am ${escapeHtml(formatDeadline(o.deadline))}</p>
        </div>
        <div class="go-item-actions">
          <button class="go-join-btn" data-join-id="${escapeHtml(String(o.id))}" type="button">Mitmachen</button>
          <button class="go-undo-btn hidden" data-undo-id="${escapeHtml(String(o.id))}" type="button">Austreten</button>
          <button class="go-edit-btn"
            data-edit-id="${escapeHtml(String(o.id))}"
            data-edit-title="${escapeAttr(o.suppliers?.name || o.title || '')}"
            data-edit-deadline="${escapeAttr(o.deadline)}"
            data-edit-creator="${escapeAttr(o.created_by || '')}"
            type="button" aria-label="Bearbeiten">✏️</button>
        </div>
      </div>`).join('');
    html += '</div>';
  } else {
    html += `<div style="padding:32px 0;text-align:center;color:var(--muted);font-size:.875rem;">Keine aktiven Sammelbestellungen.</div>`;
  }

  html += `
    <p class="go-section-title" style="margin-top:28px;">Neue Sammelbestellung</p>
    <div class="go-create-form">
      <div>
        <label class="go-label" for="go-supplier-select">Lieferant <span class="go-required">*</span></label>
        <select id="go-supplier-select" class="go-input" required><option value="">— wird geladen …</option></select>
        <p id="go-supplier-error" class="go-error" role="alert" aria-live="polite" style="margin-top:4px;"></p>
      </div>
      <div id="go-deadline-wrap" style="opacity:.4;pointer-events:none;">
        <label class="go-label" for="go-deadline-input">Deadline <span class="go-required">*</span></label>
        <input type="datetime-local" id="go-deadline-input" class="go-input" required disabled>
      </div>
      <p id="go-create-error" class="go-error" role="alert" aria-live="polite"></p>
      <div style="display:flex;justify-content:flex-end;">
        <button type="button" class="go-btn-primary" id="go-create-submit-btn" disabled style="opacity:.4;cursor:not-allowed;">Sammelbestellung erstellen</button>
      </div>
    </div>
    <p id="go-banner-error" style="margin-top:8px;font-size:.8125rem;color:#ffaab4;"></p>`;

  body.innerHTML = html;

  body.querySelectorAll('[data-join-id]').forEach(btn =>
    btn.addEventListener('click', () => joinGroupOrder(btn.getAttribute('data-join-id'))));
  body.querySelectorAll('[data-undo-id]').forEach(btn =>
    btn.addEventListener('click', () => leaveGroupOrder(btn.getAttribute('data-undo-id'))));

  body.querySelectorAll('[data-edit-id]').forEach(async btn => {
    const creatorId = btn.getAttribute('data-edit-creator');
    const user = await getCurrentUser();
    if (user && user.id === creatorId) {
      btn.addEventListener('click', () => openEditModal(
        btn.getAttribute('data-edit-id'),
        btn.getAttribute('data-edit-title'),
        btn.getAttribute('data-edit-deadline')
      ));
    } else {
      btn.style.opacity = '0.3';
      btn.style.cursor  = 'not-allowed';
      btn.title = 'Nur der Ersteller kann die Deadline ändern';
    }
  });

  document.getElementById('go-create-submit-btn')?.addEventListener('click', submitGroupOrder);
  orders.forEach(o => syncJoinState(o.id));
  loadSupplierDropdown();
}

// ============================================================
// JOIN STATE
// ============================================================

async function syncJoinState(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;
  const body = document.getElementById('go-panel-body');
  if (!body) return;
  const joinBtn = body.querySelector(`[data-join-id="${groupOrderId}"]`);
  const undoBtn = body.querySelector(`[data-undo-id="${groupOrderId}"]`);
  if (!joinBtn || !undoBtn) return;

  const { count } = await db.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('group_order_id', groupOrderId);
  const hasJoined = (count || 0) > 0;

  joinBtn.classList.toggle('go-join-btn--active', hasJoined);
  joinBtn.textContent = hasJoined ? 'Beigetreten ✓' : 'Mitmachen';
  undoBtn.classList.toggle('hidden', !hasJoined);

  if (hasJoined) {
    let goBtn = body.querySelector(`[data-goto-go="${groupOrderId}"]`);
    if (!goBtn) {
      goBtn = document.createElement('button');
      goBtn.className = 'go-join-btn go-join-btn--goto';
      goBtn.setAttribute('data-goto-go', groupOrderId);
      goBtn.type = 'button';
      goBtn.textContent = '→ Zur Sammelbestellung';
      undoBtn.after(goBtn);
      const order = activeGroupOrders.find(o => String(o.id) === String(groupOrderId));
      // FIX #7: 6-Parameter-Signatur
      goBtn.addEventListener('click', async () => {
        const u = await getCurrentUser();
        if (!u || !order) return;
        await activateGoMode(
          String(order.id),
          order.supplier_id,
          order.suppliers?.name || order.title || '',
          null,
          u.id === order.created_by,
          order.deadline
        );
      });
    }
  }
}

// ============================================================
// JOIN / LEAVE
// ============================================================

function showBannerError(message) {
  const el = document.getElementById('go-banner-error');
  if (!el) return;
  el.textContent = message;
  setTimeout(() => { if (el) el.textContent = ''; }, 5000);
}

async function joinGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  const { count: alreadyJoined } = await db.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('group_order_id', groupOrderId);

  const order = activeGroupOrders.find(o => String(o.id) === String(groupOrderId));

  // FIX #7 (join) + FIX #8: pendingOrders-Check entfernt
  if ((alreadyJoined || 0) > 0) {
    if (order) await activateGoMode(
      String(order.id),
      order.supplier_id,
      order.suppliers?.name || order.title || '',
      null,
      user.id === order.created_by,
      order.deadline
    );
    return;
  }

  if (order) await activateGoMode(
    String(order.id),
    order.supplier_id,
    order.suppliers?.name || order.title || '',
    null,
    user.id === order.created_by,
    order.deadline
  );
}

async function leaveGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;
  const order = activeGroupOrders.find(o => String(o.id) === String(groupOrderId));
  if (order && new Date(order.deadline) <= new Date()) {
    showBannerError('Deadline abgelaufen. Austreten nicht mehr möglich.');
    return;
  }
  const { error } = await db.from('orders')
    .update({ group_order_id: null })
    .eq('user_id', user.id).eq('group_order_id', groupOrderId);
  if (error) { showBannerError('Fehler beim Austreten: ' + error.message); return; }
  await syncJoinState(groupOrderId);
  if (window.goSession?.groupOrderId === String(groupOrderId)) deactivateGoMode();
}

// ============================================================
// SUPPLIER DROPDOWN
// ============================================================

async function loadSupplierDropdown() {
  const select  = document.getElementById('go-supplier-select');
  const errorEl = document.getElementById('go-supplier-error');
  if (!select) return;
  select.innerHTML = `<option value="">— wird geladen …</option>`;

  const { data, error } = await db.from('suppliers')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) { select.innerHTML = `<option value="">Fehler beim Laden</option>`; return; }
  if (!data || data.length === 0) { select.innerHTML = `<option value="">Keine aktiven Lieferanten</option>`; return; }

  select.innerHTML = `<option value="">Bitte wählen …</option>` +
    data.map(s => {
      const isBlocked = blockedSuppliers.has(s.id);
      return `<option value="${escapeAttr(s.id)}" data-name="${escapeAttr(s.name)}"${isBlocked ? ' disabled' : ''}>
        ${escapeHtml(s.name)}${isBlocked ? ' (bereits aktiv)' : ''}
      </option>`;
    }).join('');

  select.addEventListener('change', () => onSupplierChange(select, errorEl));
}

function onSupplierChange(select, errorEl) {
  const val = select.value.trim();
  if (!val) { setCreateFieldsEnabled(false); if (errorEl) errorEl.textContent = ''; return; }
  const isBlocked = blockedSuppliers.has(val);
  if (isBlocked) {
    setCreateFieldsEnabled(false);
    const name = select.options[select.selectedIndex]?.getAttribute('data-name') || val;
    if (errorEl) errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für „${escapeHtml(name)}".`;
    return;
  }
  setCreateFieldsEnabled(true);
  if (errorEl) errorEl.textContent = '';
  const createError = document.getElementById('go-create-error');
  if (createError) createError.textContent = '';
}

// FIX #9: setCreateFieldsEnabled eingefügt
function setCreateFieldsEnabled(enabled) {
  const deadlineWrap  = document.getElementById('go-deadline-wrap');
  const deadlineInput = document.getElementById('go-deadline-input');
  const submitBtn     = document.getElementById('go-create-submit-btn');
  if (deadlineWrap) {
    deadlineWrap.style.opacity       = enabled ? '1' : '.4';
    deadlineWrap.style.pointerEvents = enabled ? '' : 'none';
  }
  if (deadlineInput) deadlineInput.disabled = !enabled;
  if (submitBtn) {
    submitBtn.disabled      = !enabled;
    submitBtn.style.opacity = enabled ? '1' : '.4';
    submitBtn.style.cursor  = enabled ? '' : 'not-allowed';
  }
}

// ============================================================
// CREATE SUBMIT
// ============================================================

async function submitGroupOrder() {
  const supplierSelect = document.getElementById('go-supplier-select');
  const deadlineInput  = document.getElementById('go-deadline-input');
  const errorEl        = document.getElementById('go-create-error');
  if (!errorEl) return;

  // FIX #10: supplierId = UUID aus dem Select-Value
  const supplierId   = supplierSelect?.value?.trim() || '';
  const supplierName = supplierSelect?.options[supplierSelect.selectedIndex]?.getAttribute('data-name') || supplierId;
  const deadline     = deadlineInput?.value || '';
  errorEl.textContent = '';

  if (!supplierId) { errorEl.textContent = 'Bitte einen Lieferanten wählen.'; return; }
  // FIX #10: direkter UUID-Vergleich (kein .toLowerCase())
  if (blockedSuppliers.has(supplierId)) {
    errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für „${escapeHtml(supplierName)}".`; return;
  }
  if (!deadline) { errorEl.textContent = 'Bitte eine Deadline angeben.'; return; }
  const deadlineDate = new Date(deadline);
  if (deadlineDate <= new Date()) { errorEl.textContent = 'Die Deadline muss in der Zukunft liegen.'; return; }

  // FIX #10: Duplicate-Check gegen supplier_id statt title
  const { data: existing, error: checkError } = await db.from('group_orders')
    .select('id').eq('status', 'open').eq('supplier_id', supplierId)
    .gt('deadline', new Date().toISOString()).maybeSingle();
  if (checkError) { errorEl.textContent = 'Prüfungsfehler: ' + checkError.message; return; }
  if (existing)   { errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für „${escapeHtml(supplierName)}".`; return; }

  const user = await getCurrentUser();
  if (!user) { errorEl.textContent = 'Nicht eingeloggt.'; return; }

  const submitBtn = document.getElementById('go-create-submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  const { data: newOrder, error: insertError } = await db.from('group_orders').insert({
    supplier_id: supplierId,
    title:       supplierName,
    deadline:    deadlineDate.toISOString(),
    status:      'open',
    created_by:  user.id,
  }).select().single();

  if (submitBtn) submitBtn.disabled = false;
  if (insertError) { errorEl.textContent = 'Fehler beim Erstellen: ' + insertError.message; return; }

  await loadActiveGroupOrders();
  // FIX #7: 6-Parameter-Signatur
  if (newOrder) await activateGoMode(String(newOrder.id), supplierId, supplierName, null, true, newOrder.deadline);
}

// ============================================================
// EDIT MODAL
// ============================================================

function openEditModal(groupOrderId, currentTitle, currentDeadline) {
  let modal = document.getElementById('go-edit-modal');
  if (!modal) { modal = buildEditModal(); document.body.appendChild(modal); }
  document.getElementById('go-edit-id').value = groupOrderId;
  document.getElementById('go-edit-title-display').textContent = currentTitle || '';
  document.getElementById('go-edit-error').textContent = '';
  if (currentDeadline) {
    const d = new Date(currentDeadline);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('go-edit-deadline-input').value = local;
  } else {
    document.getElementById('go-edit-deadline-input').value = '';
  }
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('go-edit-deadline-input')?.focus();
}

function closeEditModal() {
  const modal = document.getElementById('go-edit-modal');
  if (modal) { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); }
}

function buildEditModal() {
  const modal = document.createElement('div');
  modal.id = 'go-edit-modal'; modal.className = 'go-modal hidden';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'go-edit-modal-title');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="go-modal-backdrop" id="go-edit-backdrop"></div>
    <div class="go-modal-box">
      <button class="go-modal-close" type="button" aria-label="Schließen" id="go-edit-close">✕</button>
      <h2 class="go-modal-title" id="go-edit-modal-title">Sammelbestellung bearbeiten</h2>
      <input type="hidden" id="go-edit-id">
      <div>
        <p class="go-label">Lieferant</p>
        <p id="go-edit-title-display" class="go-value-readonly"></p>
      </div>
      <div>
        <label class="go-label" for="go-edit-deadline-input">Deadline <span class="go-required">*</span></label>
        <input type="datetime-local" id="go-edit-deadline-input" class="go-input" required>
      </div>
      <p id="go-edit-error" class="go-error" role="alert" aria-live="polite"></p>
      <div class="go-modal-footer">
        <button type="button" class="go-btn-secondary" id="go-edit-cancel">Abbrechen</button>
        <button type="button" class="go-btn-primary"   id="go-edit-submit">Speichern</button>
      </div>
    </div>`;
  modal.querySelector('#go-edit-backdrop').addEventListener('click', closeEditModal);
  modal.querySelector('#go-edit-close')   .addEventListener('click', closeEditModal);
  modal.querySelector('#go-edit-cancel')  .addEventListener('click', closeEditModal);
  modal.querySelector('#go-edit-submit')  .addEventListener('click', submitEditGroupOrder);
  return modal;
}

async function submitEditGroupOrder() {
  const groupOrderId = document.getElementById('go-edit-id').value;
  const deadline     = document.getElementById('go-edit-deadline-input').value;
  const errorEl      = document.getElementById('go-edit-error');
  errorEl.textContent = '';
  if (!deadline) { errorEl.textContent = 'Bitte eine Deadline angeben.'; return; }
  const deadlineDate = new Date(deadline);
  if (deadlineDate <= new Date()) { errorEl.textContent = 'Die Deadline muss in der Zukunft liegen.'; return; }
  const { error } = await db.from('group_orders')
    .update({ deadline: deadlineDate.toISOString() })
    .eq('id', groupOrderId).eq('status', 'open');
  if (error) { errorEl.textContent = 'Fehler: ' + error.message; return; }
  closeEditModal();
  await loadActiveGroupOrders();
  renderPanelContent();
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
