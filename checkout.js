// ============================================================
// CHECKOUT VIEW — checkout.js
// GO-Modus: window.goSession steuert erweitertes Verhalten
// Normaler Warenkorb: cart_items
// GO-Warenkorb:      group_order_cart (persistent, deadline-gebunden)
//
// GO-Checkout hat 2 Bereiche:
//   Bereich 1 (confirmed=false): Warenkorb — sofort editierbar
//   Bereich 2 (confirmed=true):  In Bestellung — Pending-State, erst bei "Bestellung aktualisieren" gespeichert
// ============================================================

let _checkoutSnapshot = null;

// Pending-State für Bereich 2 (confirmed items)
let _goQtyPending    = new Map();  // cartItemId → neue Qty
let _goDeletePending = new Set();  // cartItemIds die gelöscht werden sollen

function openCheckout() {
  productsSection.classList.add('hidden');
  checkoutSection.classList.remove('hidden');
  checkoutSection.classList.add('checkout-enter');
  closeCartDrawer();
  _checkoutSnapshot = null;
  _goQtyPending     = new Map();
  _goDeletePending  = new Set();
  renderCheckout();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeCheckout() {
  checkoutSection.classList.add('hidden');
  checkoutSection.classList.remove('checkout-enter');
  _checkoutSnapshot = null;
  _goQtyPending     = new Map();
  _goDeletePending  = new Set();
  if (window.goSession) {
    productsSection.classList.remove('hidden');
    filterProductsForGo(window.goSession.supplierId);
    renderGoSignalBanner();
  } else {
    productsSection.classList.remove('hidden');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (openCheckoutBtn) openCheckoutBtn.addEventListener('click', openCheckout);
if (checkoutBackBtn) checkoutBackBtn.addEventListener('click', closeCheckout);
if (cartDrawerSubmit) cartDrawerSubmit.addEventListener('click', () => openCheckout());

// ============================================================
// CART LABELS — GO-Modus
// ============================================================

function updateCartLabelsForGo(supplierName) {
  const cartHeadH2 = document.querySelector('#cart-section .section-head h2');
  if (cartHeadH2) {
    cartHeadH2.innerHTML = `
      <span style="display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;line-height:1;">Sammelbestellung</span>
      ${escapeHtml(supplierName)}`;
  }
  const drawerTitle = document.querySelector('.cart-drawer-title');
  if (drawerTitle) {
    drawerTitle.innerHTML = `
      <span style="display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;line-height:1;margin-bottom:1px;">Sammelbestellung</span>
      ${escapeHtml(supplierName)}`;
  }
  const badgeBtn = document.getElementById('cart-badge-btn');
  if (badgeBtn) badgeBtn.setAttribute('aria-label', `Sammelbestellung ${supplierName}`);
}

function resetCartLabels() {
  const cartHeadH2 = document.querySelector('#cart-section .section-head h2');
  if (cartHeadH2) cartHeadH2.innerHTML = 'Warenkorb';
  const drawerTitle = document.querySelector('.cart-drawer-title');
  if (drawerTitle) drawerTitle.innerHTML = 'Warenkorb';
  const badgeBtn = document.getElementById('cart-badge-btn');
  if (badgeBtn) badgeBtn.setAttribute('aria-label', 'Warenkorb');
}

// ============================================================
// CHECKOUT HEADER — GO-Modus: Supplier-Label + Logo
// ============================================================

function renderCheckoutHeader() {
  const titleWrap = document.querySelector('.checkout-header-title');
  if (!titleWrap) return;

  const sess = window.goSession;
  if (!sess) {
    titleWrap.innerHTML = `
      <p class="sidebar-label">Schritt 2 von 2</p>
      <h2>Bestellübersicht</h2>`;
    return;
  }

  let supplierDisplay = '';
  if (sess.supplierLogo) {
    supplierDisplay = `<img src="${escapeHtml(sess.supplierLogo)}" alt="${escapeHtml(sess.supplierName)}" class="checkout-supplier-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='inline';">
      <span class="checkout-supplier-name" style="display:none;">${escapeHtml(sess.supplierName)}</span>`;
  } else {
    supplierDisplay = `<span class="checkout-supplier-name">${escapeHtml(sess.supplierName)}</span>`;
  }

  titleWrap.innerHTML = `
    <p class="sidebar-label">Sammelbestellung</p>
    <div class="checkout-header-go-row">
      <h2>Bestellübersicht</h2>
      <div class="checkout-supplier-badge">${supplierDisplay}</div>
    </div>`;
}

// ============================================================
// GO-CART HELPERS — group_order_cart lesen/schreiben
// ============================================================

async function fetchGoCartItems(userId, groupOrderId, confirmed = false) {
  return db.from('group_order_cart')
    .select(`
      id, quantity, product_id, clothing_size_id, weight_size_id, confirmed,
      products ( name, sku, price_brutto, price_netto ),
      sizes_clothing ( code ),
      sizes_weight   ( code )
    `)
    .eq('user_id', userId)
    .eq('group_order_id', groupOrderId)
    .eq('confirmed', confirmed);
}

async function updateGoCartQty(cartItemId, newQty, userId) {
  return db.from('group_order_cart')
    .update({ quantity: newQty })
    .eq('id', cartItemId)
    .eq('user_id', userId);
}

async function deleteGoCartItem(cartItemId, userId) {
  return db.from('group_order_cart')
    .delete()
    .eq('id', cartItemId)
    .eq('user_id', userId);
}

// ============================================================
// GO-CART BADGE — Anzahl Items (nur unconfirmed = Warenkorb)
// ============================================================

async function loadGoCartBadge() {
  const user = await getCurrentUser();
  if (!user || !window.goSession) return;
  const { data, error } = await db.from('group_order_cart')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('group_order_id', window.goSession.groupOrderId)
    .eq('confirmed', false);
  if (error) return;
  const total = (data || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  updateCartBadge(total);
}

// ============================================================
// RENDER CHECKOUT
// ============================================================

async function renderCheckout() {
  const user = await getCurrentUser();
  if (!user) return;

  renderCheckoutHeader();

  if (window.goSession) {
    await renderGoCheckout(user);
    return;
  }

  const { data, error } = await fetchCartItems(user.id);

  if (error) {
    checkoutList.innerHTML = `<p class="checkout-error">Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    checkoutList.innerHTML = '';
    checkoutEmpty.classList.remove('hidden');
    checkoutTotal.textContent = '0,00 €';
    checkoutItemCount.textContent = '0';
    _checkoutSnapshot = null;
    updateSubmitButtonLabel();
    return;
  }

  checkoutEmpty.classList.add('hidden');
  _checkoutSnapshot = JSON.stringify(data.map(i => ({ id: i.id, qty: i.quantity })));
  renderCartItemsList(data);
  updateSubmitButtonLabel();
}

// ============================================================
// GO-MODUS CHECKOUT — Bereich 1 (Warenkorb) + Bereich 2 (Bestellung)
// ============================================================

async function renderGoCheckout(user) {
  const sess = window.goSession;

  // Bereich 1: unconfirmed (Warenkorb)
  const { data: cartItems, error: cartErr } = await fetchGoCartItems(user.id, sess.groupOrderId, false);
  if (cartErr) {
    checkoutList.innerHTML = `<p class="checkout-error">Fehler beim Laden: ${escapeHtml(cartErr.message)}</p>`;
    return;
  }

  // Bereich 2: confirmed (in Bestellung)
  const { data: confirmedItems, error: confErr } = await fetchGoCartItems(user.id, sess.groupOrderId, true);
  if (confErr) {
    checkoutList.innerHTML = `<p class="checkout-error">Fehler beim Laden: ${escapeHtml(confErr.message)}</p>`;
    return;
  }

  const hasCart      = cartItems && cartItems.length > 0;
  const hasConfirmed = confirmedItems && confirmedItems.length > 0;

  if (!hasCart && !hasConfirmed) {
    checkoutList.innerHTML = '';
    checkoutEmpty.classList.remove('hidden');
    checkoutTotal.textContent = '0,00 €';
    checkoutItemCount.textContent = '0';
    _checkoutSnapshot = null;
    await updateSubmitButtonLabel();
    return;
  }

  checkoutEmpty.classList.add('hidden');

  // Snapshot nur für Bereich 1 (Warenkorb-Änderungen triggern "Zur Bestellung hinzufügen")
  _checkoutSnapshot = hasCart
    ? JSON.stringify(cartItems.map(i => ({ id: i.id, qty: i.quantity })))
    : null;

  // Bereich 1 rendern
  if (hasCart) {
    renderCartItemsList(cartItems, true);
  } else {
    checkoutList.innerHTML = '';
  }

  // Bereich 2 rendern
  renderGoConfirmedSection(confirmedItems || []);

  await updateSubmitButtonLabel();
}

// ============================================================
// BEREICH 2 — confirmed items mit Pending-State
// ============================================================

function renderGoConfirmedSection(items) {
  const existingWrap = document.getElementById('go-confirmed-wrap');
  if (existingWrap) existingWrap.remove();

  const wrap = document.createElement('div');
  wrap.id = 'go-confirmed-wrap';

  const sess = window.goSession;
  const deadlinePassed = sess ? new Date(sess.deadline) <= new Date() : false;

  const trashIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;

  if (items.length === 0) {
    wrap.innerHTML = `
      <div class="go-confirmed-header">
        <span>In Bestellung</span>
        ${sess ? `<span class="go-submitted-badge">${escapeHtml(sess.supplierName)}</span>` : ''}
      </div>
      <div class="go-confirmed-empty">Noch keine Artikel zur Bestellung hinzugefügt.</div>`;
  } else {
    const rowsHtml = items.map(item => {
      const id         = String(item.id);
      const product    = item.products || {};
      const unitPrice  = Number(product.price_brutto || 0);
      const displayQty = _goQtyPending.has(id) ? _goQtyPending.get(id) : Number(item.quantity);
      const lineTotal  = unitPrice * displayQty;
      const sizeLabel  = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const isMarked   = _goDeletePending.has(id);
      const rowStyle   = isMarked ? 'text-decoration:line-through;opacity:0.5;' : '';
      const btnDisabled = (isMarked || deadlinePassed) ? ' disabled' : '';
      const removeBtnClass   = isMarked ? 'go-submitted-remove go-submitted-remove--undo' : 'go-submitted-remove';
      const removeBtnLabel   = isMarked ? 'Löschen rückgängig' : 'Entfernen';
      const removeBtnContent = isMarked ? '↩' : trashIcon;

      return `<div class="go-submitted-row" data-go-conf-id="${escapeHtml(id)}" data-unit-price="${unitPrice}" style="${rowStyle}">
        <span class="go-submitted-name">
          ${escapeHtml(product.name || 'Produkt')}
          ${product.sku ? `<span class="go-submitted-sku">${escapeHtml(product.sku)}</span>` : ''}
        </span>
        <span class="go-submitted-meta">${sizeLabel ? `<span style="color:var(--muted);">${escapeHtml(sizeLabel)}</span> · ` : ''}</span>
        <div class="go-submitted-qty-stepper">
          <button type="button" class="go-submitted-qty-btn" data-go-conf-dec="${escapeHtml(id)}" aria-label="Weniger"${btnDisabled}>−</button>
          <span class="go-submitted-qty-val" id="go-conf-qty-val-${escapeHtml(id)}">${displayQty}</span>
          <button type="button" class="go-submitted-qty-btn" data-go-conf-inc="${escapeHtml(id)}" aria-label="Mehr"${btnDisabled}>+</button>
        </div>
        <span class="go-submitted-price" id="go-conf-price-val-${escapeHtml(id)}">${formatPrice(lineTotal)}</span>
        <button type="button" class="${removeBtnClass}" data-go-conf-remove="${escapeHtml(id)}" aria-label="${removeBtnLabel}"${deadlinePassed ? ' disabled' : ''}>${removeBtnContent}</button>
      </div>`;
    }).join('');

    // Gesamtpreis Bereich 2
    let confirmedTotal = 0;
    items.forEach(item => {
      const id        = String(item.id);
      const unitPrice = Number(item.products?.price_brutto || 0);
      const qty       = _goQtyPending.has(id) ? _goQtyPending.get(id) : Number(item.quantity);
      if (!_goDeletePending.has(id)) confirmedTotal += unitPrice * qty;
    });

    wrap.innerHTML = `
      <div class="go-confirmed-header">
        <span>In Bestellung</span>
        ${sess ? `<span class="go-submitted-badge">${escapeHtml(sess.supplierName)}</span>` : ''}
      </div>
      <div class="go-submitted-list" id="go-confirmed-list">${rowsHtml}</div>
      <div class="go-confirmed-footer">
        <span class="go-confirmed-total-label">Gesamt Bestellung</span>
        <span class="go-confirmed-total-value" id="go-confirmed-total">${formatPrice(confirmedTotal)}</span>
      </div>`;
  }

  // Update-Button für Bereich 2
  const updateBtn = document.createElement('button');
  updateBtn.type = 'button';
  updateBtn.id   = 'go-confirmed-update-btn';
  updateBtn.className = 'go-btn-primary go-confirmed-update-btn';
  updateBtn.textContent = 'Bestellung aktualisieren';
  updateBtn.disabled = true;
  updateBtn.style.opacity = '0.4';
  updateBtn.style.cursor  = 'not-allowed';
  updateBtn.style.marginTop = '12px';
  if (deadlinePassed) {
    updateBtn.title = 'Deadline abgelaufen';
  }
  wrap.appendChild(updateBtn);
  updateBtn.addEventListener('click', () => applyGoConfirmedUpdates());

  const checkoutBody = document.querySelector('.checkout-items-wrap') || checkoutList?.parentElement;
  if (checkoutBody) checkoutBody.appendChild(wrap);

  wrap.addEventListener('click', (e) => {
    const incBtn    = e.target.closest('[data-go-conf-inc]');
    const decBtn    = e.target.closest('[data-go-conf-dec]');
    const removeBtn = e.target.closest('[data-go-conf-remove]');
    if (incBtn)    { updateGoConfirmedQtyPending(incBtn.getAttribute('data-go-conf-inc'),    1); return; }
    if (decBtn)    { updateGoConfirmedQtyPending(decBtn.getAttribute('data-go-conf-dec'),   -1); return; }
    if (removeBtn) { toggleGoConfirmedDelete(removeBtn.getAttribute('data-go-conf-remove')); }
  });
}

// ============================================================
// PENDING-STATE: QTY + DELETE für Bereich 2
// ============================================================

function updateGoConfirmedQtyPending(cartItemId, delta) {
  const id     = String(cartItemId);
  const valEl  = document.getElementById(`go-conf-qty-val-${id}`);
  const current = valEl ? Number(valEl.textContent) : 1;
  const newQty  = Math.max(1, current + delta);
  _goQtyPending.set(id, newQty);
  if (valEl) valEl.textContent = String(newQty);

  // Preis der Zeile aktualisieren
  const row       = document.querySelector(`[data-go-conf-id="${id}"]`);
  const unitPrice = row ? Number(row.getAttribute('data-unit-price') || 0) : 0;
  const priceEl   = document.getElementById(`go-conf-price-val-${id}`);
  if (priceEl) priceEl.textContent = formatPrice(unitPrice * newQty);

  _updateGoConfirmedTotal();
  _recheckUpdateButtonState();
}

function toggleGoConfirmedDelete(cartItemId) {
  const id = String(cartItemId);
  if (_goDeletePending.has(id)) {
    _goDeletePending.delete(id);
  } else {
    _goDeletePending.add(id);
    _goQtyPending.delete(id);
  }

  const isMarked = _goDeletePending.has(id);
  const row      = document.querySelector(`[data-go-conf-id="${id}"]`);
  const btn      = row?.querySelector('[data-go-conf-remove]');
  const decBtn   = row?.querySelector('[data-go-conf-dec]');
  const incBtn   = row?.querySelector('[data-go-conf-inc]');
  const valEl    = document.getElementById(`go-conf-qty-val-${id}`);

  if (row)    row.style.cssText = isMarked ? 'text-decoration:line-through;opacity:0.5;' : '';
  if (btn) {
    btn.innerHTML  = isMarked ? '↩' : `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
    btn.setAttribute('aria-label', isMarked ? 'Löschen rückgängig' : 'Entfernen');
  }
  if (decBtn) decBtn.disabled = isMarked;
  if (incBtn) incBtn.disabled = isMarked;

  // Qty-Display auf Original zurücksetzen wenn Undo
  if (!isMarked && valEl) {
    const pendingQty = _goQtyPending.get(id);
    if (pendingQty) valEl.textContent = String(pendingQty);
  }

  _updateGoConfirmedTotal();
  _recheckUpdateButtonState();
}

function _updateGoConfirmedTotal() {
  const totalEl = document.getElementById('go-confirmed-total');
  if (!totalEl) return;
  let total = 0;
  document.querySelectorAll('[data-go-conf-id]').forEach(row => {
    const id        = row.getAttribute('data-go-conf-id');
    const unitPrice = Number(row.getAttribute('data-unit-price') || 0);
    const valEl     = document.getElementById(`go-conf-qty-val-${id}`);
    const qty       = valEl ? Number(valEl.textContent) : 1;
    if (!_goDeletePending.has(id)) total += unitPrice * qty;
  });
  totalEl.textContent = formatPrice(total);
}

function _recheckUpdateButtonState() {
  const btn = document.getElementById('go-confirmed-update-btn');
  if (!btn) return;
  const sess = window.goSession;
  const deadlinePassed = sess ? new Date(sess.deadline) <= new Date() : false;
  const hasPendingChanges = _goQtyPending.size > 0 || _goDeletePending.size > 0;
  const enabled = hasPendingChanges && !deadlinePassed;
  btn.disabled      = !enabled;
  btn.style.opacity = enabled ? '1' : '0.4';
  btn.style.cursor  = enabled ? 'pointer' : 'not-allowed';
}

// ============================================================
// BESTELLUNG AKTUALISIEREN — Pending-State in DB schreiben
// ============================================================

async function applyGoConfirmedUpdates() {
  const user = await getCurrentUser();
  if (!user) return;
  const sess = window.goSession;
  if (!sess) return;

  if (new Date(sess.deadline) <= new Date()) {
    setOrderMessage('Deadline abgelaufen – keine Änderungen mehr möglich.', true);
    return;
  }

  const btn = document.getElementById('go-confirmed-update-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }

  const errors = [];

  // Qty-Updates
  for (const [id, newQty] of _goQtyPending.entries()) {
    if (_goDeletePending.has(id)) continue; // wird sowieso gelöscht
    const { error } = await db.from('group_order_cart')
      .update({ quantity: newQty })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('confirmed', true);
    if (error) errors.push(`Qty-Update ${id}: ${error.message}`);
  }

  // Löschungen
  for (const id of _goDeletePending) {
    const { error } = await db.from('group_order_cart')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('confirmed', true);
    if (error) errors.push(`Delete ${id}: ${error.message}`);
  }

  if (errors.length > 0) {
    setOrderMessage('Teilfehler: ' + errors.join(', '), true);
  } else {
    setOrderMessage('Bestellung aktualisiert.');
  }

  _goQtyPending    = new Map();
  _goDeletePending = new Set();

  await renderGoCheckout(user);
  await loadGoCartBadge();
}

// ============================================================
// CART ITEMS LIST RENDERN — Bereich 1 (normaler + GO-Warenkorb)
// ============================================================

function renderCartItemsList(data, isGoCart = false) {
  let total = 0;
  let totalItems = 0;
  const groupedItems = {};

  data.forEach(item => {
    const product = item.products || {};
    const pid = item.product_id;
    if (!groupedItems[pid]) {
      groupedItems[pid] = {
        productId:    pid,
        productName:  product.name  || 'Produkt',
        productSku:   product.sku   || null,
        productPrice: Number(product.price_brutto || 0),
        items: []
      };
    }
    groupedItems[pid].items.push(item);
  });

  checkoutList.innerHTML = Object.values(groupedItems).map(group => {
    const productTotal = group.items.reduce((sum, item) => sum + (group.productPrice * Number(item.quantity || 0)), 0);
    total      += productTotal;
    totalItems += group.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const qtyDecAttr   = isGoCart ? 'data-go-qty-dec'      : 'data-qty-dec';
    const qtyIncAttr   = isGoCart ? 'data-go-qty-inc'      : 'data-qty-inc';
    const removeAttr   = isGoCart ? 'data-go-cart-remove'  : 'data-checkout-remove';
    const qtyValPrefix = isGoCart ? 'go-cart-qty-val-'     : 'qty-val-';

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      return `<div class="checkout-item-row">
        <div class="checkout-item-size">${sizeLabel
          ? `<span class="checkout-size-badge">${escapeHtml(sizeLabel)}</span>`
          : `<span class="checkout-size-badge checkout-size-badge--none">Keine Größe</span>`}</div>
        <div class="checkout-item-qty">
          <button type="button" class="qty-stepper-btn" ${qtyDecAttr}="${escapeHtml(String(item.id))}" aria-label="Menge verringern">−</button>
          <span class="qty-stepper-value" id="${qtyValPrefix}${escapeHtml(String(item.id))}">${Number(item.quantity)}</span>
          <button type="button" class="qty-stepper-btn" ${qtyIncAttr}="${escapeHtml(String(item.id))}" aria-label="Menge erhöhen">+</button>
        </div>
        <div class="checkout-item-price">${formatPrice(lineTotal)}</div>
        <button type="button" class="remove-btn icon-btn checkout-remove-btn"
          ${removeAttr}="${escapeHtml(String(item.id))}" aria-label="Position entfernen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>`;
    }).join('');

    return `<article class="checkout-product-group">
      <div class="checkout-product-header">
        <div class="checkout-product-name-wrap">
          <span class="checkout-product-name">${escapeHtml(group.productName)}</span>
          ${group.productSku ? `<span class="checkout-product-sku">${escapeHtml(group.productSku)}</span>` : ''}
        </div>
        <span class="checkout-product-total">${formatPrice(productTotal)}</span>
      </div>
      <div class="checkout-item-rows">
        <div class="checkout-item-row checkout-item-row--header">
          <div class="checkout-item-size">Größe</div>
          <div class="checkout-item-qty">Menge</div>
          <div class="checkout-item-price">Preis</div>
          <div></div>
        </div>
        ${rowsHtml}
      </div>
    </article>`;
  }).join('');

  checkoutTotal.textContent     = formatPrice(total);
  checkoutItemCount.textContent = totalItems;

  checkoutList.addEventListener('click', async (e) => {
    if (isGoCart) {
      const incBtn    = e.target.closest('[data-go-qty-inc]');
      const decBtn    = e.target.closest('[data-go-qty-dec]');
      const removeBtn = e.target.closest('[data-go-cart-remove]');
      if (incBtn)    { await updateGoCartItemQty(incBtn.getAttribute('data-go-qty-inc'),    1); return; }
      if (decBtn)    { await updateGoCartItemQty(decBtn.getAttribute('data-go-qty-dec'),   -1); return; }
      if (removeBtn) { await removeGoCartItem(removeBtn.getAttribute('data-go-cart-remove')); }
    } else {
      const incBtn    = e.target.closest('[data-qty-inc]');
      const decBtn    = e.target.closest('[data-qty-dec]');
      const removeBtn = e.target.closest('[data-checkout-remove]');
      if (incBtn)    { await updateCheckoutItemQty(incBtn.getAttribute('data-qty-inc'),    1); return; }
      if (decBtn)    { await updateCheckoutItemQty(decBtn.getAttribute('data-qty-dec'),   -1); return; }
      if (removeBtn) { await removeCheckoutItem(removeBtn.getAttribute('data-checkout-remove')); }
    }
  }, { once: true });
}

// ============================================================
// GO-CART BEREICH 1: QTY + REMOVE (direkte DB-Writes, confirmed=false)
// ============================================================

const goQtyDebounceMap = {};

async function updateGoCartItemQty(cartItemId, delta) {
  const user = await getCurrentUser();
  if (!user) return;
  if (window.goSession && new Date(window.goSession.deadline) <= new Date()) {
    setOrderMessage('Deadline abgelaufen – keine Änderungen mehr möglich.', true);
    return;
  }
  if (goQtyDebounceMap[cartItemId]) return;
  goQtyDebounceMap[cartItemId] = true;
  try {
    const valEl      = document.getElementById(`go-cart-qty-val-${cartItemId}`);
    const currentQty = valEl ? Number(valEl.textContent) : 1;
    const newQty     = Math.max(1, currentQty + delta);
    if (valEl) valEl.textContent = String(newQty);
    const { error } = await updateGoCartQty(cartItemId, newQty, user.id);
    if (error) {
      if (valEl) valEl.textContent = String(currentQty);
      setOrderMessage(`Fehler: ${error.message}`, true);
      return;
    }
    await renderGoCheckout(user);
    await loadGoCartBadge();
  } finally {
    delete goQtyDebounceMap[cartItemId];
  }
}

async function removeGoCartItem(cartItemId) {
  const user = await getCurrentUser();
  if (!user) return;
  if (window.goSession && new Date(window.goSession.deadline) <= new Date()) {
    setOrderMessage('Deadline abgelaufen – Entfernen nicht mehr möglich.', true);
    return;
  }
  const { error } = await deleteGoCartItem(cartItemId, user.id);
  if (error) { setOrderMessage(`Fehler beim Entfernen: ${error.message}`, true); return; }
  await renderGoCheckout(user);
  await loadGoCartBadge();
}

// ============================================================
// SUBMIT BUTTON LABEL
// ============================================================

async function updateSubmitButtonLabel() {
  if (!window.goSession) {
    submitOrderBtn.textContent   = 'Bestellung absenden';
    submitOrderBtn.disabled      = false;
    submitOrderBtn.style.opacity = '1';
    submitOrderBtn.style.cursor  = 'pointer';
    return;
  }

  // GO-Modus: Button steuert Bereich 1 → "Zur Bestellung hinzufügen"
  const hasCartItems = _checkoutSnapshot !== null;
  submitOrderBtn.textContent   = 'Zur Bestellung hinzufügen';
  submitOrderBtn.disabled      = !hasCartItems;
  submitOrderBtn.style.opacity = hasCartItems ? '1' : '0.4';
  submitOrderBtn.style.cursor  = hasCartItems ? 'pointer' : 'not-allowed';
}

// ============================================================
// NORMALER CART: QTY + REMOVE (cart_items)
// ============================================================

const qtyDebounceMap = {};

async function updateCheckoutItemQty(cartItemId, delta) {
  const user = await getCurrentUser();
  if (!user) return;
  if (qtyDebounceMap[cartItemId]) return;
  qtyDebounceMap[cartItemId] = true;
  try {
    const valEl      = document.getElementById(`qty-val-${cartItemId}`);
    const currentQty = valEl ? Number(valEl.textContent) : 1;
    const newQty     = Math.max(1, currentQty + delta);
    if (valEl) valEl.textContent = String(newQty);
    const { error } = await db.from('cart_items')
      .update({ quantity: newQty }).eq('id', cartItemId).eq('user_id', user.id);
    if (error) {
      if (valEl) valEl.textContent = String(currentQty);
      setOrderMessage(`Fehler: ${error.message}`, true);
      return;
    }
    await Promise.all([renderCheckout(), loadCart()]);
  } finally {
    delete qtyDebounceMap[cartItemId];
  }
}

async function removeCheckoutItem(cartItemId) {
  const user = await getCurrentUser();
  if (!user) return;
  const { error } = await db.from('cart_items')
    .delete().eq('id', cartItemId).eq('user_id', user.id);
  if (error) { setOrderMessage(`Fehler beim Entfernen: ${error.message}`, true); return; }
  await Promise.all([renderCheckout(), loadCart()]);
}

// ============================================================
// ORDER SUBMIT
// ============================================================

async function submitOrder() {
  const user = await getCurrentUser();
  if (!user) { setOrderMessage('Du musst eingeloggt sein.', true); return; }

  if (window.goSession) {
    await submitGoOrder(user);
    return;
  }

  const { data: cartItems, error: cartError } = await fetchCartItems(user.id);
  if (cartError) { setOrderMessage(`Fehler beim Laden: ${cartError.message}`, true); return; }
  if (!cartItems || cartItems.length === 0) { setOrderMessage('Dein Warenkorb ist leer.', true); return; }

  const { data: orderData, error: orderError } = await db.from('orders')
    .insert({ user_id: user.id, status: 'submitted', note: null })
    .select().single();
  if (orderError || !orderData) { setOrderMessage(`Fehler: ${orderError?.message || 'Unbekannt'}`, true); return; }

  const itemRows = cartItems.map(item => ({
    order_id:         orderData.id,
    product_id:       item.product_id,
    product_name:     item.products?.name || 'Produkt',
    product_sku:      item.products?.sku  || null,
    quantity:         item.quantity,
    unit_price_netto: Number(item.products?.price_netto || 0),
    clothing_size_id: item.clothing_size_id || null,
    weight_size_id:   item.weight_size_id   || null,
    size_label:       item.sizes_clothing?.code || item.sizes_weight?.code || null
  }));

  const { error: itemsError } = await db.from('order_items').insert(itemRows);
  if (itemsError) {
    await db.from('orders').delete().eq('id', orderData.id);
    setOrderMessage(`Fehler beim Speichern: ${itemsError.message}`, true);
    return;
  }

  try {
    await sendOrderEmailViaEdgeFunction(orderData.id);
  } catch (mailError) {
    console.warn('E-Mail-Fehler:', mailError.message);
    setOrderMessage(`Bestellung gespeichert (ID: ${orderData.id}), E-Mail fehlgeschlagen.`, true);
    await db.from('cart_items').delete().eq('user_id', user.id);
    closeCheckout(); closeCartDrawer(); await loadCart();
    return;
  }

  const { error: clearCartError } = await db.from('cart_items').delete().eq('user_id', user.id);
  if (clearCartError) { setOrderMessage(`Gespeichert, aber Warenkorb nicht geleert: ${clearCartError.message}`, true); return; }

  setOrderMessage(`Bestellung erfolgreich. ID: ${orderData.id}`);
  closeCheckout(); closeCartDrawer(); await loadCart();
}

// ============================================================
// GO ORDER SUBMIT — setzt confirmed=false → confirmed=true
// ============================================================

async function submitGoOrder(user) {
  const sess = window.goSession;

  if (new Date(sess.deadline) <= new Date()) {
    setOrderMessage('Deadline abgelaufen – Hinzufügen nicht mehr möglich.', true);
    return;
  }

  // Nur unconfirmed Items holen
  const { data: cartItems, error: cartErr } = await fetchGoCartItems(user.id, sess.groupOrderId, false);
  if (cartErr) { setOrderMessage('Fehler beim Laden: ' + cartErr.message, true); return; }
  if (!cartItems || cartItems.length === 0) {
    setOrderMessage('Keine neuen Artikel im Warenkorb.', true);
    return;
  }

  const ids = cartItems.map(i => i.id);
  const { error: updateErr } = await db.from('group_order_cart')
    .update({ confirmed: true })
    .in('id', ids)
    .eq('user_id', user.id);

  if (updateErr) {
    setOrderMessage('Fehler beim Hinzufügen: ' + updateErr.message, true);
    return;
  }

  _goQtyPending    = new Map();
  _goDeletePending = new Set();

  if (typeof loadGoCart === 'function') await loadGoCart();
  await loadGoCartBadge();
  await renderGoCheckout(user);

  showGoPostSubmitDialog(sess);
}

// ============================================================
// POST-SUBMIT DIALOG
// ============================================================

function showGoPostSubmitDialog(sess) {
  let dialog = document.getElementById('go-post-submit-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'go-post-submit-dialog';
    dialog.className = 'go-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Bestellung gespeichert');
    document.body.appendChild(dialog);
  }

  dialog.innerHTML = `
    <div class="go-modal-backdrop"></div>
    <div class="go-modal-box">
      <div class="go-post-submit-icon">✓</div>
      <h2 class="go-modal-title">Zur Bestellung hinzugefügt</h2>
      <p class="go-post-submit-text">Deine Artikel wurden der Sammelbestellung <strong>${escapeHtml(sess.supplierName)}</strong> hinzugefügt.</p>
      <div class="go-modal-footer go-modal-footer--col">
        <button type="button" class="go-btn-primary"   id="go-post-go-back">Zur Sammelbestellung</button>
        <button type="button" class="go-btn-secondary" id="go-post-close-go">Sammelbestellung schließen</button>
      </div>
    </div>`;

  dialog.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');

  dialog.querySelector('#go-post-go-back').addEventListener('click', async () => {
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
    checkoutSection.classList.add('hidden');
    productsSection.classList.remove('hidden');
    filterProductsForGo(sess.supplierId);
    renderGoSignalBanner();
    updateCartLabelsForGo(sess.supplierName);
    if (typeof loadGoCart === 'function') await loadGoCart();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  dialog.querySelector('#go-post-close-go').addEventListener('click', () => {
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
    checkoutSection.classList.add('hidden');
    deactivateGoMode();
    productsSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ============================================================
// EMAIL
// ============================================================

async function sendOrderEmailViaEdgeFunction(orderId) {
  const { data: sessionData } = await db.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Kein Access Token.');
  const response = await fetch('https://fniweelbmnsrdmotkmzu.supabase.co/functions/v1/resend-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ orderId })
  });
  const rawText = await response.text();
  let parsed;
  try { parsed = JSON.parse(rawText); } catch { parsed = { raw: rawText }; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${rawText}`);
  return parsed;
}

// ============================================================
// SUBMIT BUTTON — Doppelklick-Guard
// ============================================================

submitOrderBtn.addEventListener('click', async () => {
  submitOrderBtn.disabled = true;
  try {
    await submitOrder();
  } finally {
    submitOrderBtn.disabled = false;
  }
});
