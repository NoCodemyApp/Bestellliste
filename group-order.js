// ============================================================
// GROUP ORDERS — group-order.js
// Abhängigkeiten: db, getCurrentUser, escapeHtml (app.js)
// goSession = globaler State der aktiven GO-Sitzung
// ============================================================

let activeGroupOrders = [];
let groupOrderChannel = null;
let blockedSuppliers  = new Set();

// Aktive GO-Sitzung: wird gesetzt wenn User einer GO beitritt/erstellt
// { groupOrderId, supplierName, supplierLogo, isCreator, deadline }
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
  updateTriggerBar();
  closeGroupPanel();
  deactivateGoMode();
}

// ============================================================
// AUTO-CLOSE
// ============================================================

async function autoCloseExpiredOrders() {
  const now = new Date().toISOString();
  const { error } = await db
    .from('group_orders').update({ status: 'closed' })
    .eq('status', 'open').lt('deadline', now);
  if (error) console.warn('Auto-Close Fehler:', error.message);
}

// ============================================================
// LOAD
// ============================================================

async function loadActiveGroupOrders() {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('group_orders')
    .select('id, title, deadline, status, created_by, created_at')
    .eq('status', 'open').gt('deadline', now)
    .order('deadline', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden:', error.message);
    activeGroupOrders = []; blockedSuppliers = new Set();
  } else {
    activeGroupOrders = data || [];
    blockedSuppliers  = new Set(activeGroupOrders.map(o => (o.title || '').trim().toLowerCase()));
  }

  updateTriggerBar();
  if (document.getElementById('go-panel')?.classList.contains('go-panel--open')) {
    renderPanelContent();
  }
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
  const productsSection = document.getElementById('products-section');
  productsSection?.parentNode?.insertBefore(bar, productsSection);
  updateTriggerBar();
}

function updateTriggerBar() {
  const bar = document.getElementById('go-trigger-bar');
  if (!bar) return;
  const count = activeGroupOrders.length;
  if (count === 0) {
    bar.innerHTML = `
      <div class="go-trigger-bar-actions">
        <button class="go-create-btn" id="go-trigger-create-btn" type="button">+ Sammelbestellung eröffnen</button>
      </div>`;
    document.getElementById('go-trigger-create-btn')?.addEventListener('click', openGroupPanel);
  } else {
    const titles = activeGroupOrders.map(o => escapeHtml(o.title || 'Sammelbestellung'));
    const label  = count === 1 ? titles[0] : `${count} Sammelbestellungen aktiv`;
    bar.innerHTML = `
      <div class="go-trigger-bar-text"><span class="go-trigger-dot"></span><span>${label}</span></div>
      <div class="go-trigger-bar-actions">
        <button class="go-open-btn"   id="go-trigger-open-btn"   type="button">Anzeigen</button>
        <button class="go-create-btn" id="go-trigger-create-btn" type="button">+ Neu</button>
      </div>`;
    document.getElementById('go-trigger-open-btn')  ?.addEventListener('click', openGroupPanel);
    document.getElementById('go-trigger-create-btn')?.addEventListener('click', openGroupPanel);
  }
}

// ============================================================
// GO-MODE — Signal-Banner, gefilterte Produktseite
// ============================================================

async function activateGoMode(groupOrderId, supplierName, isCreator, deadline) {
  // Supplier-Logo aus DB laden (optional)
  let supplierLogo = null;
  const { data: logoData } = await db.from('products')
    .select('supplyer_logo').eq('supplyer', supplierName).eq('active', true)
    .not('supplyer_logo', 'is', null).limit(1).maybeSingle();
  supplierLogo = logoData?.supplyer_logo || null;

  window.goSession = { groupOrderId, supplierName, supplierLogo, isCreator, deadline };

  // Panel schließen, GO-Banner zeigen, Produkte filtern
  closeGroupPanel();
  renderGoSignalBanner();
  filterProductsForGo(supplierName);

  // Warenkorb-Titel und Checkout-Labels aktualisieren
  updateCartLabelsForGo(supplierName);
}

function deactivateGoMode() {
  window.goSession = null;
  removeGoSignalBanner();
  resetCartLabels();
  // Filter zurücksetzen und alle Produkte wieder anzeigen
  if (typeof allProducts !== 'undefined' && allProducts.length > 0) {
    activeFilters = { category: null, supplier: null };
    buildFilterChips(allProducts);
    renderProducts(allProducts);
    updateFilterUI();
  }
}

function filterProductsForGo(supplierName) {
  if (typeof allProducts === 'undefined') return;
  const filtered = allProducts.filter(p =>
    (p.supplier || p.supplyer || '').toLowerCase() === supplierName.toLowerCase()
  );
  // Filter-Chips ausblenden im GO-Modus (nur ein Supplier sichtbar)
  document.getElementById('shop-sidebar-desktop')?.classList.add('hidden');
  document.getElementById('filter-toggle-btn')?.classList.add('hidden');
  document.getElementById('filter-fab')?.classList.add('hidden');
  document.getElementById('active-filter-bar')?.classList.add('hidden');
  renderProducts(filtered);
}

function renderGoSignalBanner() {
  removeGoSignalBanner();
  const sess = window.goSession;
  if (!sess) return;

  const banner = document.createElement('div');
  banner.id = 'go-signal-banner';
  banner.className = 'go-signal-banner';
  banner.innerHTML = `
    <div class="go-signal-left">
      <span class="go-signal-dot"></span>
      <span class="go-signal-label">Sammelbestellung</span>
      <span class="go-signal-supplier">${escapeHtml(sess.supplierName)}</span>
    </div>
    <button class="go-signal-leave-btn" id="go-signal-leave" type="button">Verlassen</button>`;

  const productsSection = document.getElementById('products-section');
  productsSection?.parentNode?.insertBefore(banner, productsSection);

  document.getElementById('go-signal-leave')?.addEventListener('click', () => {
    deactivateGoMode();
    // Filter + Sidebar wieder einblenden
    document.getElementById('shop-sidebar-desktop')?.classList.remove('hidden');
    document.getElementById('filter-toggle-btn')?.classList.remove('hidden');
  });
}

function removeGoSignalBanner() {
  document.getElementById('go-signal-banner')?.remove();
}

function updateCartLabelsForGo(supplierName) {
  // Desktop Cart-Header
  const cartHeadH2 = document.querySelector('#cart-section .section-head h2');
  if (cartHeadH2) {
    cartHeadH2.innerHTML = `
      <span style="display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;line-height:1;">Sammelbestellung</span>
      ${escapeHtml(supplierName)}`;
  }
  // Mobile Drawer-Header
  const drawerTitle = document.querySelector('.cart-drawer-title');
  if (drawerTitle) {
    drawerTitle.innerHTML = `
      <span style="display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;line-height:1;margin-bottom:1px;">Sammelbestellung</span>
      ${escapeHtml(supplierName)}`;
  }
}

function resetCartLabels() {
  const cartHeadH2 = document.querySelector('#cart-section .section-head h2');
  if (cartHeadH2) cartHeadH2.innerHTML = 'Warenkorb';
  const drawerTitle = document.querySelector('.cart-drawer-title');
  if (drawerTitle) drawerTitle.innerHTML = 'Warenkorb';
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
  panel.id = 'go-panel'; panel.className = 'go-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Sammelbestellungen');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="go-panel-inner">
      <div class="go-panel-handle" aria-hidden="true"></div>
      <div class="go-panel-header">
        <button class="go-panel-back-btn" id="go-panel-back" type="button">
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
    html += orders.map(o => {
      const dateStr = formatDeadline(o.deadline);
      return `
        <div class="go-item" data-go-item-id="${escapeHtml(String(o.id))}">
          <div class="go-item-info">
            <p class="go-item-title">${escapeHtml(o.title || 'Sammelbestellung')}</p>
            <p class="go-item-deadline">Endet am ${escapeHtml(dateStr)}</p>
          </div>
          <div class="go-item-actions">
            <button class="go-join-btn" data-join-id="${escapeHtml(String(o.id))}" type="button">Mitmachen</button>
            <button class="go-undo-btn hidden" data-undo-id="${escapeHtml(String(o.id))}" type="button">Austreten</button>
            <button class="go-edit-btn" data-edit-id="${escapeHtml(String(o.id))}"
              data-edit-title="${escapeAttr(o.title || '')}"
              data-edit-deadline="${escapeAttr(o.deadline)}"
              data-edit-creator="${escapeAttr(o.created_by || '')}"
              type="button" aria-label="Bearbeiten">✏️</button>
          </div>
        </div>`;
    }).join('');
    html += '</div>';
  } else {
    html += `<div style="padding:32px 0;text-align:center;color:var(--muted);font-size:0.875rem;">Keine aktiven Sammelbestellungen.</div>`;
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
      <div style="display:flex;justify-content:flex-end;gap:8px;">
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
    // Nur Ersteller sieht Edit-Button aktiv
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

  // Wenn bereits beigetreten: "Zur GO-Ansicht" Button anzeigen
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
      goBtn.addEventListener('click', async () => {
        const u = await getCurrentUser();
        if (!u || !order) return;
        await activateGoMode(String(order.id), order.title || '', u.id === order.created_by, order.deadline);
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

  // Doppelt-Beitreten für diese spezifische GO verhindern
  const { count: alreadyJoined } = await db.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('group_order_id', groupOrderId);
  if ((alreadyJoined || 0) > 0) {
    // Schon beigetreten → direkt in GO-Modus wechseln
    const order = activeGroupOrders.find(o => String(o.id) === String(groupOrderId));
    if (order) await activateGoMode(String(order.id), order.title || '', user.id === order.created_by, order.deadline);
    return;
  }

  // Prüfen ob pending Order ohne GO vorhanden
  const { data: pendingOrders } = await db.from('orders')
    .select('id').eq('user_id', user.id)
    .is('group_order_id', null).eq('status', 'pending').limit(1);

  if (!pendingOrders || pendingOrders.length === 0) {
    showBannerError('Keine offene Bestellung gefunden. Bitte lege zuerst Produkte in den Warenkorb.');
    return;
  }

  const { error } = await db.from('orders')
    .update({ group_order_id: groupOrderId })
    .eq('id', pendingOrders[0].id);
  if (error) { showBannerError('Fehler beim Beitreten: ' + error.message); return; }

  // GO-Modus aktivieren und Produktseite öffnen
  const order = activeGroupOrders.find(o => String(o.id) === String(groupOrderId));
  if (order) await activateGoMode(String(order.id), order.title || '', user.id === order.created_by, order.deadline);
}

async function leaveGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  const order = activeGroupOrders.find(o => String(o.id) === String(groupOrderId));
  if (order && new Date(order.deadline) <= new Date()) {
    showBannerError('Die Deadline ist abgelaufen. Austreten nicht mehr möglich.');
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

  const { data, error } = await db.from('products')
    .select('supplyer').eq('active', true).not('supplyer', 'is', null);
  if (error) { select.innerHTML = `<option value="">Fehler beim Laden</option>`; return; }

  const suppliers = [...new Set(data.map(p => p.supplyer).filter(Boolean))].sort();
  if (suppliers.length === 0) { select.innerHTML = `<option value="">Keine aktiven Lieferanten</option>`; return; }

  select.innerHTML = `<option value="">Bitte wählen …</option>` +
    suppliers.map(s => {
      const isBlocked = blockedSuppliers.has(s.trim().toLowerCase());
      return `<option value="${escapeAttr(s)}"${isBlocked ? ' disabled' : ''}>${escapeHtml(s)}${isBlocked ? ' (bereits aktiv)' : ''}</option>`;
    }).join('');

  select.addEventListener('change', () => onSupplierChange(select, errorEl));
}

function onSupplierChange(select, errorEl) {
  const val = select.value.trim();
  if (!val) { setCreateFieldsEnabled(false); if (errorEl) errorEl.textContent = ''; return; }
  const isBlocked = blockedSuppliers.has(val.toLowerCase());
  if (isBlocked) {
    setCreateFieldsEnabled(false);
    if (errorEl) errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für „${escapeHtml(val)}