// ============================================================
// CHECKOUT VIEW — checkout.js
// GO-Modus: window.goSession steuert erweitertes Verhalten
// Normaler Warenkorb: cart_items
// GO-Warenkorb:      group_order_cart (persistent, deadline-gebunden)
// ============================================================

let _checkoutSnapshot = null;

function openCheckout() {
  productsSection.classList.add('hidden');
  checkoutSection.classList.remove('hidden');
  checkoutSection.classList.add('checkout-enter');
  closeCartDrawer();
  _checkoutSnapshot = null;
  resetGoPendingState();
  renderCheckout();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeCheckout() {
  checkoutSection.classList.add('hidden');
  checkoutSection.classList.remove('checkout-enter');
  _checkoutSnapshot = null;
  resetGoPendingState();
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

// confirmedFilter: true  -> nur bestaetigte Zeilen ("Meine Bestellung")
//                  false -> nur unbestaetigte Zeilen ("Warenkorb")
//                  null  -> beide (z.B. fuer Submit-Flow als Fallback)
async function fetchGoCartItems(userId, groupOrderId, confirmedFilter = null) {
  let q = db.from('group_order_cart')
    .select(`
      id, quantity, product_id, clothing_size_id, weight_size_id, confirmed,
      products ( name, sku, price_brutto, price_netto ),
      sizes_clothing ( code ),
      sizes_weight   ( code )
    `)
    .eq('user_id', userId)
    .eq('group_order_id', groupOrderId);
  if (confirmedFilter !== null) q = q.eq('confirmed', confirmedFilter);
  return q;
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

// Setzt alle confirmed=false-Zeilen des Nutzers in der aktiven GO auf confirmed=true.
async function confirmGoCartItems(userId, groupOrderId) {
  return db.from('group_order_cart')
    .update({ confirmed: true })
    .eq('user_id', userId)
    .eq('group_order_id', groupOrderId)
    .eq('confirmed', false);
}

// ============================================================
// GO-CART BADGE — Anzahl Items im group_order_cart zählen + anzeigen
// ============================================================

async function loadGoCartBadge() {
  const user = await getCurrentUser();
  if (!user || !window.goSession) return;
  // Badge spiegelt Sidebar-"Warenkorb" wider -> nur confirmed=false.
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
// GO-MODUS CHECKOUT — zwei Bereiche
//   Bereich 1 "Warenkorb"       : confirmed = false  (Live-DB, sofortige Writes)
//   Bereich 2 "Meine Bestellung": confirmed = true   (Pending-State, Flush per Klick)
// ============================================================

// Pending-State fuer Bereich 2:
//   _pendingConfirmedEdits[id] = newQty  -> Mengenaenderung lokal
//   _pendingConfirmedEdits[id] = 'delete' -> lokal markiertes Loeschen
//   Vorhandener Eintrag mit identischer Original-Menge wird beim Setzen entfernt.
let _pendingConfirmedEdits = {};
// Snapshot der zuletzt geladenen confirmed-Zeilen, damit qty-Stepper lokal rechnen koennen.
let _confirmedSnapshot = [];
// Snapshot der zuletzt geladenen unbestaetigten Zeilen (fuer Submit "Zur Bestellung hinzufuegen")
let _unconfirmedSnapshot = [];

function resetGoPendingState() {
  _pendingConfirmedEdits = {};
}

async function renderGoCheckout(user) {
  const sess = window.goSession;

  const { data, error } = await fetchGoCartItems(user.id, sess.groupOrderId, null);

  if (error) {
    checkoutList.innerHTML = `<p class="checkout-error">Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    await updateSubmitButtonLabel();
    return;
  }

  const rows = data || [];
  const unconfirmed = rows.filter(r => !r.confirmed);
  const confirmed   = rows.filter(r =>  r.confirmed);

  _unconfirmedSnapshot = unconfirmed;
  _confirmedSnapshot   = confirmed;

  // Nicht mehr existierende IDs aus dem Pending-State raeumen.
  const confirmedIds = new Set(confirmed.map(r => String(r.id)));
  Object.keys(_pendingConfirmedEdits).forEach(id => {
    if (!confirmedIds.has(String(id))) delete _pendingConfirmedEdits[id];
  });

  if (unconfirmed.length === 0 && confirmed.length === 0) {
    checkoutList.innerHTML = '';
    checkoutEmpty.classList.remove('hidden');
    checkoutTotal.textContent = '0,00 €';
    checkoutItemCount.textContent = '0';
    _checkoutSnapshot = null;
    await updateSubmitButtonLabel();
    return;
  }

  checkoutEmpty.classList.add('hidden');
  _checkoutSnapshot = JSON.stringify(rows.map(i => ({ id: i.id, qty: i.quantity, c: i.confirmed })));

  renderGoTwoSections(unconfirmed, confirmed);
  await updateSubmitButtonLabel();
}

// Liefert die effektive Anzeige-Menge fuer eine confirmed-Zeile unter Beruecksichtigung
// des Pending-State (null = lokal als geloescht markiert).
function effectiveConfirmedQty(item) {
  const p = _pendingConfirmedEdits[item.id];
  if (p === 'delete') return null;
  if (typeof p === 'number') return p;
  return Number(item.quantity || 0);
}

function renderGoTwoSections(unconfirmed, confirmed) {
  const sectionHtml = [];
  let grandTotal = 0;
  let grandItems = 0;

  if (unconfirmed.length > 0) {
    const { html, total, itemCount } = renderGoArea(unconfirmed, /*area*/ 'unconfirmed');
    grandTotal += total;
    grandItems += itemCount;
    sectionHtml.push(`
      <div class="checkout-area checkout-area--unconfirmed" data-go-area="unconfirmed">
        <h3 class="checkout-area-title">Warenkorb</h3>
        ${html}
      </div>`);
  }

  if (confirmed.length > 0) {
    const { html, total, itemCount } = renderGoArea(confirmed, /*area*/ 'confirmed');
    grandTotal += total;
    grandItems += itemCount;
    sectionHtml.push(`
      <div class="checkout-area checkout-area--confirmed" data-go-area="confirmed">
        <h3 class="checkout-area-title">Meine Bestellung</h3>
        ${html}
      </div>`);
  }

  checkoutList.innerHTML = sectionHtml.join('');
  checkoutTotal.textContent     = formatPrice(grandTotal);
  checkoutItemCount.textContent = grandItems;
}

function renderGoArea(items, area) {
  const isUnconfirmed = area === 'unconfirmed';
  let total = 0;
  let itemCount = 0;
  const grouped = {};

  items.forEach(item => {
    const product = item.products || {};
    const pid = item.product_id;
    if (!grouped[pid]) {
      grouped[pid] = {
        productId:    pid,
        productName:  product.name  || 'Produkt',
        productSku:   product.sku   || null,
        productPrice: Number(product.price_brutto || 0),
        items: []
      };
    }
    grouped[pid].items.push(item);
  });

  const html = Object.values(grouped).map(group => {
    let productTotal = 0;
    const rowsHtml = group.items.map(item => {
      const idStr     = String(item.id);
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const qty       = isUnconfirmed ? Number(item.quantity || 0) : effectiveConfirmedQty(item);
      const isDeleted = qty === null;
      const shownQty  = isDeleted ? 0 : qty;
      const lineTotal = group.productPrice * shownQty;
      if (!isDeleted) {
        productTotal += lineTotal;
        itemCount    += shownQty;
      }

      const qtyDecAttr   = isUnconfirmed ? 'data-go-qty-dec'        : 'data-go-pending-qty-dec';
      const qtyIncAttr   = isUnconfirmed ? 'data-go-qty-inc'        : 'data-go-pending-qty-inc';
      const removeAttr   = isUnconfirmed ? 'data-go-cart-remove'    : 'data-go-pending-remove';
      const qtyValPrefix = isUnconfirmed ? 'go-cart-qty-val-'       : 'go-pending-qty-val-';

      return `<div class="checkout-item-row${isDeleted ? ' checkout-item-row--pending-delete' : ''}">
        <div class="checkout-item-size">${sizeLabel
          ? `<span class="checkout-size-badge">${escapeHtml(sizeLabel)}</span>`
          : `<span class="checkout-size-badge checkout-size-badge--none">Keine Größe</span>`}</div>
        <div class="checkout-item-qty">
          <button type="button" class="qty-stepper-btn" ${qtyDecAttr}="${escapeHtml(idStr)}" aria-label="Menge verringern" ${isDeleted ? 'disabled' : ''}>−</button>
          <span class="qty-stepper-value" id="${qtyValPrefix}${escapeHtml(idStr)}">${shownQty}</span>
          <button type="button" class="qty-stepper-btn" ${qtyIncAttr}="${escapeHtml(idStr)}" aria-label="Menge erhöhen" ${isDeleted ? 'disabled' : ''}>+</button>
        </div>
        <div class="checkout-item-price">${formatPrice(lineTotal)}</div>
        <button type="button" class="remove-btn icon-btn checkout-remove-btn"
          ${removeAttr}="${escapeHtml(idStr)}" aria-label="Position entfernen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>`;
    }).join('');

    total += productTotal;

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

  return { html, total, itemCount };
}

// ============================================================
// CART ITEMS LIST RENDERN (nur normaler Modus — cart_items)
// GO-Modus rendert ueber renderGoTwoSections.
// ============================================================

function renderCartItemsList(data) {
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

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      return `<div class="checkout-item-row">
        <div class="checkout-item-size">${sizeLabel
          ? `<span class="checkout-size-badge">${escapeHtml(sizeLabel)}</span>`
          : `<span class="checkout-size-badge checkout-size-badge--none">Keine Größe</span>`}</div>
        <div class="checkout-item-qty">
          <button type="button" class="qty-stepper-btn" data-qty-dec="${escapeHtml(String(item.id))}" aria-label="Menge verringern">−</button>
          <span class="qty-stepper-value" id="qty-val-${escapeHtml(String(item.id))}">${Number(item.quantity)}</span>
          <button type="button" class="qty-stepper-btn" data-qty-inc="${escapeHtml(String(item.id))}" aria-label="Menge erhöhen">+</button>
        </div>
        <div class="checkout-item-price">${formatPrice(lineTotal)}</div>
        <button type="button" class="remove-btn icon-btn checkout-remove-btn"
          data-checkout-remove="${escapeHtml(String(item.id))}" aria-label="Position entfernen">
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
}

// Delegierter Click-Handler fuer checkoutList: einmal registrieren, fuer normalen
// Cart UND GO-Cart-Bereiche zustaendig. Vermeidet { once: true }, das nach
// Re-Renderings den Listener verschluckt hat.
function ensureCheckoutListHandler() {
  if (checkoutList.dataset.handlerBound === '1') return;
  checkoutList.dataset.handlerBound = '1';
  checkoutList.addEventListener('click', async (e) => {
    // GO-Cart Bereich 1 (Warenkorb, confirmed=false) — Live-DB
    const goIncBtn    = e.target.closest('[data-go-qty-inc]');
    const goDecBtn    = e.target.closest('[data-go-qty-dec]');
    const goRemoveBtn = e.target.closest('[data-go-cart-remove]');
    if (goIncBtn)    { await updateGoCartItemQty(goIncBtn.getAttribute('data-go-qty-inc'),    1); return; }
    if (goDecBtn)    { await updateGoCartItemQty(goDecBtn.getAttribute('data-go-qty-dec'),   -1); return; }
    if (goRemoveBtn) { await removeGoCartItem(goRemoveBtn.getAttribute('data-go-cart-remove')); return; }

    // GO-Cart Bereich 2 (Meine Bestellung, confirmed=true) — Pending-State
    const pInc    = e.target.closest('[data-go-pending-qty-inc]');
    const pDec    = e.target.closest('[data-go-pending-qty-dec]');
    const pRemove = e.target.closest('[data-go-pending-remove]');
    if (pInc)    { pendingConfirmedQtyChange(pInc.getAttribute('data-go-pending-qty-inc'),    1); return; }
    if (pDec)    { pendingConfirmedQtyChange(pDec.getAttribute('data-go-pending-qty-dec'),   -1); return; }
    if (pRemove) { pendingConfirmedRemove(pRemove.getAttribute('data-go-pending-remove'));   return; }

    // Normaler Cart
    const incBtn    = e.target.closest('[data-qty-inc]');
    const decBtn    = e.target.closest('[data-qty-dec]');
    const removeBtn = e.target.closest('[data-checkout-remove]');
    if (incBtn)    { await updateCheckoutItemQty(incBtn.getAttribute('data-qty-inc'),    1); return; }
    if (decBtn)    { await updateCheckoutItemQty(decBtn.getAttribute('data-qty-dec'),   -1); return; }
    if (removeBtn) { await removeCheckoutItem(removeBtn.getAttribute('data-checkout-remove')); }
  });
}

ensureCheckoutListHandler();

// ============================================================
// GO-CART: QTY + REMOVE (direkte DB-Writes)
// ============================================================

const goQtyDebounceMap = {};

async function updateGoCartItemQty(cartItemId, delta) {
  const user = await getCurrentUser();
  if (!user) return;
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
  const { error } = await deleteGoCartItem(cartItemId, user.id);
  if (error) { setOrderMessage(`Fehler beim Entfernen: ${error.message}`, true); return; }
  await renderGoCheckout(user);
  await loadGoCartBadge();
}

// ============================================================
// GO-CART BEREICH 2 ("Meine Bestellung"): Pending-Edits
// Mengenaenderungen und Loeschungen wirken nur lokal bis "Bestellung aktualisieren".
// ============================================================

function pendingConfirmedQtyChange(cartItemId, delta) {
  const orig = _confirmedSnapshot.find(r => String(r.id) === String(cartItemId));
  if (!orig) return;
  const current = effectiveConfirmedQty(orig);
  // Loesch-Markierung wird durch Klicks auf +/- aufgehoben.
  const base = current === null ? Number(orig.quantity || 0) : current;
  const newQty = Math.max(1, base + delta);
  if (newQty === Number(orig.quantity || 0)) {
    delete _pendingConfirmedEdits[cartItemId];
  } else {
    _pendingConfirmedEdits[cartItemId] = newQty;
  }
  rerenderGoSectionsFromSnapshot();
  updateSubmitButtonLabel();
}

function pendingConfirmedRemove(cartItemId) {
  _pendingConfirmedEdits[cartItemId] = 'delete';
  rerenderGoSectionsFromSnapshot();
  updateSubmitButtonLabel();
}

function hasPendingConfirmedEdits() {
  return Object.keys(_pendingConfirmedEdits).length > 0;
}

function rerenderGoSectionsFromSnapshot() {
  renderGoTwoSections(_unconfirmedSnapshot, _confirmedSnapshot);
}

// Schreibt alle Pending-Edits in einem Durchgang in die DB.
async function flushPendingConfirmedEdits() {
  const user = await getCurrentUser();
  if (!user) { setOrderMessage('Du musst eingeloggt sein.', true); return false; }

  const entries = Object.entries(_pendingConfirmedEdits);
  if (entries.length === 0) return true;

  for (const [cartItemId, action] of entries) {
    if (action === 'delete') {
      const { error } = await deleteGoCartItem(cartItemId, user.id);
      if (error) { setOrderMessage(`Fehler beim Loeschen: ${error.message}`, true); return false; }
    } else if (typeof action === 'number') {
      const { error } = await updateGoCartQty(cartItemId, action, user.id);
      if (error) { setOrderMessage(`Fehler beim Aktualisieren: ${error.message}`, true); return false; }
    }
  }
  _pendingConfirmedEdits = {};
  return true;
}

// ============================================================
// SUBMIT BUTTON LABEL
// ============================================================

function applySubmitBtnState(label, enabled) {
  submitOrderBtn.textContent   = label;
  submitOrderBtn.disabled      = !enabled;
  submitOrderBtn.style.opacity = enabled ? '1' : '0.4';
  submitOrderBtn.style.cursor  = enabled ? 'pointer' : 'not-allowed';
}

async function updateSubmitButtonLabel() {
  if (!window.goSession) {
    applySubmitBtnState('Bestellung absenden', true);
    return;
  }

  // GO-Modus: Buttonlabel haengt von Bereichs-Zustand ab.
  const hasUnconfirmed = (_unconfirmedSnapshot && _unconfirmedSnapshot.length > 0);
  const hasConfirmed   = (_confirmedSnapshot   && _confirmedSnapshot.length   > 0);
  const hasPending     = hasPendingConfirmedEdits();

  if (hasUnconfirmed) {
    applySubmitBtnState('Zur Bestellung hinzufügen', true);
    return;
  }
  if (hasConfirmed && hasPending) {
    applySubmitBtnState('Bestellung aktualisieren', true);
    return;
  }
  if (hasConfirmed) {
    applySubmitBtnState('Bestellung gespeichert', false);
    return;
  }
  applySubmitBtnState('Zur Bestellung hinzufügen', false);
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
    // GO-Modus: Der Submit-Button bedeutet hier NICHT mehr "Bestellung absenden".
    // Stattdessen je nach Zustand:
    //   - unconfirmed vorhanden -> "Zur Bestellung hinzufuegen" (confirmed=false -> true)
    //   - keine unconfirmed, aber pending edits auf confirmed -> "Bestellung aktualisieren"
    //   - sonst: no-op (Button ist disabled).
    // Die finale orders/order_items-Erzeugung erfolgt erst beim Schliessen der GO
    // (group_orders.status='closed') und ist serverseitig (Trigger/Edge Function) zu
    // implementieren. Siehe PR-Beschreibung.
    await submitGoCheckoutAction(user);
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
// GO CHECKOUT ACTION — confirmed-Flip ODER Pending-Flush
// ============================================================

async function submitGoCheckoutAction(user) {
  const sess = window.goSession;

  const hasUnconfirmed = (_unconfirmedSnapshot && _unconfirmedSnapshot.length > 0);

  if (hasUnconfirmed) {
    // "Zur Bestellung hinzufuegen": confirmed=false -> true fuer alle aktuellen Zeilen.
    const { error } = await confirmGoCartItems(user.id, sess.groupOrderId);
    if (error) { setOrderMessage(`Fehler: ${error.message}`, true); return; }
    setOrderMessage('Artikel zur Bestellung hinzugefügt.');
    await renderGoCheckout(user);
    await loadGoCartBadge();
    if (typeof loadGoCart === 'function') await loadGoCart();
    return;
  }

  if (hasPendingConfirmedEdits()) {
    const ok = await flushPendingConfirmedEdits();
    if (!ok) return;
    setOrderMessage('Bestellung aktualisiert.');
    await renderGoCheckout(user);
    await loadGoCartBadge();
    return;
  }
}

// ============================================================
// GO ORDER SUBMIT — Legacy/Finalize-Pfad
// Wird aktuell vom Per-User-Submit nicht mehr aufgerufen. Erzeugt orders + order_items
// aus den BESTAETIGTEN Zeilen (confirmed=true). Vorgesehen fuer den GO-Close-Flow
// (durch DB-Trigger oder Edge Function bei status='closed').
// ============================================================

async function submitGoOrder(user) {
  const sess = window.goSession;

  // Nur bestaetigte Zeilen werden zur finalen Bestellung verarbeitet.
  const { data: goCartItems, error: cartErr } = await fetchGoCartItems(user.id, sess.groupOrderId, true);
  if (cartErr) { setOrderMessage('Fehler beim Laden: ' + cartErr.message, true); return; }
  if (!goCartItems || goCartItems.length === 0) {
    setOrderMessage('Keine bestätigten Artikel zum Absenden.', true);
    return;
  }

  const { data: existingOrders } = await db.from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId)
    .eq('status', 'submitted')
    .limit(1);

  let orderId;

  if (existingOrders && existingOrders.length > 0) {
    orderId = existingOrders[0].id;
    const { error: delErr } = await db.from('order_items').delete().eq('order_id', orderId);
    if (delErr) { setOrderMessage('Fehler beim Aktualisieren: ' + delErr.message, true); return; }
  } else {
    const { data: newOrder, error: newErr } = await db.from('orders')
      .insert({ user_id: user.id, status: 'submitted', group_order_id: sess.groupOrderId, note: null })
      .select().single();
    if (newErr || !newOrder) { setOrderMessage('Fehler beim Anlegen: ' + (newErr?.message || 'Unbekannt'), true); return; }
    orderId = newOrder.id;
  }

  const itemRows = goCartItems.map(item => ({
    order_id:         orderId,
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
    if (orderId) await db.from('orders').delete().eq('id', orderId);
    setOrderMessage('Fehler beim Speichern: ' + itemsError.message, true);
    return;
  }

  // Nur die bestaetigten Zeilen leeren — eventuelle confirmed=false Eintraege
  // (z.B. wenn der Nutzer waehrend des Submit-Vorgangs in einem anderen Tab
  // weiter Artikel hinzugefuegt hat) bleiben als neuer Warenkorb erhalten.
  await db.from('group_order_cart')
    .delete()
    .eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId)
    .eq('confirmed', true);

  if (typeof loadGoCart === 'function') await loadGoCart();
  await loadGoCartBadge();

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
      <h2 class="go-modal-title">Bestellung gespeichert</h2>
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
    // FIX: Cart nach Rückkehr neu laden (ist jetzt leer)
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
