// ============================================================
// CHECKOUT VIEW — checkout.js
// GO-Modus: window.goSession steuert erweitertes Verhalten
// Normaler Warenkorb: cart_items
// GO-Warenkorb:      group_order_cart (persistent, deadline-gebunden)
// ============================================================

let _checkoutSnapshot = null;

function openCheckout() {
  productsSection.classList.add('hidden');
  checkoutSection.classList.add('hidden');      // ← erst versteckt lassen
  checkoutSection.classList.remove('checkout-enter');
  closeCartDrawer();
  _checkoutSnapshot = null;

  if (checkoutList)  checkoutList.innerHTML = '';
  if (goCartListEl)  goCartListEl.innerHTML = '';
  if (goOrderListEl) goOrderListEl.innerHTML = '';

  renderCheckout().then(() => {                 // ← erst nach Laden einblenden
    checkoutSection.classList.remove('hidden');
    checkoutSection.classList.add('checkout-enter');
  });

  history.pushState({ view: 'checkout' }, '', location.href);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeCheckout() {
  checkoutSection.classList.add('hidden');
  checkoutSection.classList.remove('checkout-enter');
  _checkoutSnapshot = null;
  if (window.goSession) {
    productsSection.classList.remove('hidden');
    filterProductsForGo(window.goSession.supplierId);
    renderGoSignalBanner();
    if (typeof loadGoCart === 'function') loadGoCart(); // ← NEU
  } else {
    productsSection.classList.remove('hidden');
    if (typeof loadCart === 'function') loadCart();    // ← NEU
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (openCheckoutBtn) openCheckoutBtn.addEventListener('click', openCheckout);
if (checkoutBackBtn) checkoutBackBtn.addEventListener('click', closeCheckout);
if (cartDrawerSubmit) cartDrawerSubmit.addEventListener('click', () => openCheckout());

// ============================================================
// CART LABELS — GO-Modus
// ============================================================

function updateCartLabelsForGo() {
  const sess = window.goSession;
  if (!sess) return;
  const supplierName = sess.supplierName || '';
  const supplierLogo = sess.supplierLogo || null;

  const logoOrName = supplierLogo
    ? `<img src="${escapeHtml(supplierLogo)}"
            alt="${escapeHtml(supplierName)}"
            class="cart-supplier-logo"
            onerror="this.style.display='none';this.nextElementSibling.style.display='inline';">
       <span class="cart-supplier-name" style="display:none;">${escapeHtml(supplierName)}</span>`
    : `<span class="cart-supplier-name">${escapeHtml(supplierName)}</span>`;

  const label = `<span style="display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;line-height:1;">Sammelbestellung</span>`;

  const cartHeadH2 = document.querySelector('#cart-section .section-head h2');
  if (cartHeadH2) cartHeadH2.innerHTML = label + logoOrName;

  const drawerTitle = document.querySelector('.cart-drawer-title');
  if (drawerTitle) drawerTitle.innerHTML = label + logoOrName;

  const badgeBtn = document.getElementById('cart-badge-btn');
  if (badgeBtn) badgeBtn.setAttribute('aria-label', `Sammelbestellung ${supplierName}`);
}

function resetCartLabels() {
  const cartHeadH2 = document.querySelector('#cart-section .section-head h2');
  if (cartHeadH2) cartHeadH2.innerHTML = 'Warenkorb';

  const drawerTitle = document.querySelector('.cart-drawer-title');
  if (drawerTitle) drawerTitle.innerHTML = 'Warenkorb';

  const badgeBtn = document.getElementById('cart-badge-btn');
  if (badgeBtn) badgeBtn.setAttribute('aria-label', 'Warenkorb öffnen');
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

async function fetchGoCartItems(userId, groupOrderId, confirmed = null) {
  let q = db.from('group_order_cart')
    .select(`
      id, quantity, product_id, clothing_size_id, weight_size_id, confirmed,
      products ( name, sku, price_brutto, price_netto ),
      sizes_clothing ( code ),
      sizes_weight   ( code )
    `)
    .eq('user_id', userId)
    .eq('group_order_id', groupOrderId);
  if (confirmed !== null) q = q.eq('confirmed', confirmed);
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

// ============================================================
// GO-CART BADGE — Anzahl Items im group_order_cart zählen + anzeigen
// ============================================================

async function loadGoCartBadge() {
  const user = await getCurrentUser();
  if (!user || !window.goSession) return;
  // Badge spiegelt den offenen Warenkorb (confirmed=false) wider.
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

// DOM-Refs für die GO-Zwei-Bereich-Ansicht
const goCartSection   = document.getElementById('go-cart-section');
const goCartListEl    = document.getElementById('go-cart-list');
const goCartEmptyEl   = document.getElementById('go-cart-empty');

const goOrderSection   = document.getElementById('go-order-section');
const goOrderListEl    = document.getElementById('go-order-list');
const goOrderEmptyEl   = document.getElementById('go-order-empty');

// Lokaler Pending-State für Bereich 2 "Meine Bestellung":
//   pendingOrderEdits.qty[id]      = neue Menge (Number)
//   pendingOrderEdits.removed[id]  = true wenn lokal gelöscht
const pendingOrderEdits = { qty: {}, removed: {} };

function resetPendingOrderEdits() {
  for (const k of Object.keys(pendingOrderEdits.qty)) delete pendingOrderEdits.qty[k];
  for (const k of Object.keys(pendingOrderEdits.removed)) delete pendingOrderEdits.removed[k];
}

function hasPendingOrderEdits() {
  return Object.keys(pendingOrderEdits.qty).length > 0
      || Object.keys(pendingOrderEdits.removed).length > 0;
}

// Tracking: hat Bereich 1 (Warenkorb) unbestätigte Artikel?
let _goHasUnconfirmed = false;
// Tracking: existiert in dieser GO bereits mind. eine confirmed=true-Zeile?
// Steuert das Label des Sidebar-Submit-Buttons:
//   false → "Bestellung absenden"
//   true  → "Bestellung aktualisieren"
let _goHasConfirmed = false;

async function renderCheckout() {
  const user = await getCurrentUser();
  if (!user) return;

  renderCheckoutHeader();

  if (window.goSession) {
    await renderGoCheckout(user);
    return;
  }

  // Normaler Modus: GO-Bereiche ausblenden
  if (goCartSection)  goCartSection.classList.add('hidden');
  if (goOrderSection) goOrderSection.classList.add('hidden');
  if (checkoutList)   checkoutList.classList.remove('hidden');

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
// GO-MODUS CHECKOUT — zwei Bereiche aus group_order_cart
//   Bereich 1: confirmed = false  → "Warenkorb"
//   Bereich 2: confirmed = true   → "Meine Bestellung"
// ============================================================

async function renderGoCheckout(user) {
  const sess = window.goSession;

  // Normalen Modus ausblenden, GO-Bereiche einblenden
  if (checkoutList)   { checkoutList.classList.add('hidden'); checkoutList.innerHTML = ''; }
  if (checkoutEmpty)  checkoutEmpty.classList.add('hidden');
  if (goCartSection)  goCartSection.classList.remove('hidden');
  if (goOrderSection) goOrderSection.classList.remove('hidden');

  const { data, error } = await fetchGoCartItems(user.id, sess.groupOrderId);

  if (error) {
    goCartListEl.innerHTML  = `<p class="checkout-error">Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    goOrderListEl.innerHTML = '';
    return;
  }

  const all       = data || [];
  const cartItems = all.filter(i => !i.confirmed);
  const orderItems = all.filter(i =>  i.confirmed);

  // ── Bereich 1: Warenkorb (confirmed=false) ──
  if (cartItems.length === 0) {
    goCartListEl.innerHTML = '';
    goCartEmptyEl.classList.remove('hidden');
  } else {
    goCartEmptyEl.classList.add('hidden');
    renderGoSection(goCartListEl, cartItems, 'cart');
  }

  // ── Bereich 2: Meine Bestellung (confirmed=true) ──
  // Lokale Edits anwenden: qty-Override + pendingRemoved-Flag (durchgestrichen)
  // Lokal gelöschte Zeilen bleiben sichtbar als Strikethrough, bis der Submit
  // sie endgültig persistiert.
  const visibleOrderItems = orderItems.map(i => ({
    ...i,
    quantity: pendingOrderEdits.qty[i.id] != null
      ? pendingOrderEdits.qty[i.id]
      : i.quantity,
    pendingRemoved: !!pendingOrderEdits.removed[i.id]
  }));

  if (visibleOrderItems.length === 0) {
    goOrderListEl.innerHTML = '';
    goOrderEmptyEl.classList.remove('hidden');
  } else {
    goOrderEmptyEl.classList.add('hidden');
    renderGoSection(goOrderListEl, visibleOrderItems, 'order');
  }

  // Zusammenfassung in der Sidebar: Summe über BEIDE Bereiche
  // (Bereich 2 inkl. lokaler Edits, ohne lokal als gelöscht markierte).
  const combined = [
    ...cartItems,
    ...visibleOrderItems.filter(i => !i.pendingRemoved)
  ];
  let totalSum = 0, totalCount = 0;
  combined.forEach(item => {
    const price = Number(item.products?.price_brutto || 0);
    const qty   = Number(item.quantity || 0);
    totalSum   += price * qty;
    totalCount += qty;
  });
  checkoutTotal.textContent     = formatPrice(totalSum);
  checkoutItemCount.textContent = String(totalCount);

  // Submit-Button-Status: aktiv, wenn Bereich 1 Artikel hat ODER lokale Edits in Bereich 2
  _goHasUnconfirmed = cartItems.length > 0;
  // Label-Trigger: gibt es überhaupt confirmed=true-Zeilen?
  // Wichtig: orderItems (ungefiltert) zählen, nicht visibleOrderItems — lokal als
  // gelöscht markierte Zeilen sind in der DB noch da. Erst nach Submit wird die
  // DB geändert und der Flag kippt eventuell auf false.
  _goHasConfirmed = orderItems.length > 0;
  _checkoutSnapshot = (cartItems.length > 0) ? 'has-cart' : null;

  await updateSubmitButtonLabel();
}

// ============================================================
// CART ITEMS LIST RENDERN (normaler + GO-Modus)
// ============================================================

// Normaler Modus (cart_items). GO-Modus nutzt jetzt renderGoSection().
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

    // "Keine Größen/Varianten": kein Item der Gruppe hat ein Größen-Code.
    const hasAnySize = group.items.some(item =>
      !!(item.sizes_clothing?.code || item.sizes_weight?.code)
    );
    const noSizeCls = !hasAnySize ? ' checkout-product-group--no-size' : '';

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      const sizeCell = hasAnySize
        ? `<div class="checkout-item-size">${sizeLabel
            ? `<span class="checkout-size-badge">${escapeHtml(sizeLabel)}</span>`
            : `<span class="checkout-size-badge checkout-size-badge--none">Keine Größe</span>`}</div>`
        : '';
      const priceCell = hasAnySize
        ? `<div class="checkout-item-price">${formatPrice(lineTotal)}</div>`
        : '';
      return `<div class="checkout-item-row">
        ${sizeCell}
        <div class="checkout-item-qty">
          <button type="button" class="qty-stepper-btn" data-qty-dec="${escapeHtml(String(item.id))}" aria-label="Menge verringern">−</button>
          <span class="qty-stepper-value" id="qty-val-${escapeHtml(String(item.id))}">${Number(item.quantity)}</span>
          <button type="button" class="qty-stepper-btn" data-qty-inc="${escapeHtml(String(item.id))}" aria-label="Menge erhöhen">+</button>
        </div>
        ${priceCell}
        <button type="button" class="remove-btn icon-btn checkout-remove-btn"
          data-checkout-remove="${escapeHtml(String(item.id))}" aria-label="Position entfernen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>`;
    }).join('');

    const headerRowHtml = hasAnySize ? `
        <div class="checkout-item-row checkout-item-row--header">
          <div class="checkout-item-size">Größe</div>
          <div class="checkout-item-qty">Menge</div>
          <div class="checkout-item-price">Preis</div>
          <div></div>
        </div>` : '';

    return `<article class="checkout-product-group${noSizeCls}">
      <div class="checkout-product-header">
        <div class="checkout-product-name-wrap">
          <span class="checkout-product-name">${escapeHtml(group.productName)}</span>
          ${group.productSku ? `<span class="checkout-product-sku">${escapeHtml(group.productSku)}</span>` : ''}
        </div>
        <span class="checkout-product-total">${formatPrice(productTotal)}</span>
      </div>
      <div class="checkout-item-rows">
        ${headerRowHtml}
        ${rowsHtml}
      </div>
    </article>`;
  }).join('');

  checkoutTotal.textContent    = formatPrice(total);
  checkoutItemCount.textContent = totalItems;

}

// ============================================================
// GO-MODUS: Eine Bereich-Liste rendern (Warenkorb ODER Meine Bestellung)
//   mode = 'cart'  → sofortige DB-Updates, Attribute: data-go-cart-*
//   mode = 'order' → lokale Edits,         Attribute: data-go-order-*
// ============================================================

function renderGoSection(containerEl, items, mode) {
  if (!containerEl) return;

  const isCart = mode === 'cart';
  const incAttr    = isCart ? 'data-go-cart-inc'    : 'data-go-order-inc';
  const decAttr    = isCart ? 'data-go-cart-dec'    : 'data-go-order-dec';
  const removeAttr = isCart ? 'data-go-cart-remove' : 'data-go-order-remove';
  const qtyValPrefix = isCart ? 'go-cart-qty-val-' : 'go-order-qty-val-';

  // Nach product_id gruppieren
  const groupedItems = {};
  items.forEach(item => {
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

  containerEl.innerHTML = Object.values(groupedItems).map(group => {
    const productTotal = group.items.reduce(
      (sum, item) => sum + (group.productPrice * Number(item.quantity || 0)), 0
    );

    // "Keine Größen/Varianten": kein Item der Gruppe hat ein Größen-Code.
    const hasAnySize = group.items.some(item =>
      !!(item.sizes_clothing?.code || item.sizes_weight?.code)
    );

    // Alle Items getoggelt? → Gruppen-Header durchstreichen
    const allRemoved =
      group.items.length > 0 &&
      group.items.every(item => item.pendingRemoved === true);
    const groupCls = allRemoved ? ' is-all-removed' : '';
    // Single-Row-Layout für Produkte ohne Größen
    const noSizeCls = !hasAnySize ? ' checkout-product-group--no-size' : '';

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      const removedCls = item.pendingRemoved ? ' is-pending-removed' : '';
      // Im no-size-Layout entfällt die Größen-Zelle komplett.
      const sizeCell = hasAnySize
        ? `<div class="checkout-item-size">${sizeLabel
            ? `<span class="checkout-size-badge">${escapeHtml(sizeLabel)}</span>`
            : `<span class="checkout-size-badge checkout-size-badge--none">Keine Größe</span>`}</div>`
        : '';
      // Im no-size-Layout wird der Zeilenpreis nicht zusätzlich angezeigt —
      // der Gruppenpreis im Header reicht (eine Zeile pro Produkt).
      const priceCell = hasAnySize
        ? `<div class="checkout-item-price" data-line-total="${escapeHtml(String(item.id))}">${formatPrice(lineTotal)}</div>`
        : '';
      return `<div class="checkout-item-row${removedCls}">
        ${sizeCell}
        <div class="checkout-item-qty">
          <button type="button" class="qty-stepper-btn" ${decAttr}="${escapeHtml(String(item.id))}" aria-label="Menge verringern">−</button>
          <span class="qty-stepper-value" id="${qtyValPrefix}${escapeHtml(String(item.id))}">${Number(item.quantity)}</span>
          <button type="button" class="qty-stepper-btn" ${incAttr}="${escapeHtml(String(item.id))}" aria-label="Menge erhöhen">+</button>
        </div>
        ${priceCell}
        <button type="button" class="remove-btn icon-btn checkout-remove-btn"
          ${removeAttr}="${escapeHtml(String(item.id))}" aria-label="Position entfernen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>`;
    }).join('');

    // Header-Zeile (Größe | Menge | Preis) nur, wenn das Produkt Größen hat.
    const headerRowHtml = hasAnySize ? `
        <div class="checkout-item-row checkout-item-row--header">
          <div class="checkout-item-size">Größe</div>
          <div class="checkout-item-qty">Menge</div>
          <div class="checkout-item-price">Preis</div>
          <div></div>
        </div>` : '';

    return `<article class="checkout-product-group${groupCls}${noSizeCls}">
      <div class="checkout-product-header">
        <div class="checkout-product-name-wrap">
          <span class="checkout-product-name">${escapeHtml(group.productName)}</span>
          ${group.productSku ? `<span class="checkout-product-sku">${escapeHtml(group.productSku)}</span>` : ''}
        </div>
        <span class="checkout-product-total">${formatPrice(productTotal)}</span>
      </div>
      <div class="checkout-item-rows">
        ${headerRowHtml}
        ${rowsHtml}
      </div>
    </article>`;
  }).join('');
}

// ============================================================
// GO-CART BEREICH 1 (Warenkorb, confirmed=false):
// QTY + REMOVE direkt auf der DB
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
// GO-CART BEREICH 2 (Meine Bestellung, confirmed=true):
// QTY + REMOVE NUR LOKAL — erst beim Klick auf
// dem Sidebar-Submit-Button ("Bestellung absenden") wird die DB verändert.
// ============================================================

function goOrderLocalQtyDelta(cartItemId, delta) {
  const valEl = document.getElementById(`go-order-qty-val-${cartItemId}`);
  const currentQty = valEl
    ? Number(valEl.textContent)
    : (pendingOrderEdits.qty[cartItemId] != null ? pendingOrderEdits.qty[cartItemId] : 1);
  const newQty = Math.max(1, currentQty + delta);

  pendingOrderEdits.qty[cartItemId] = newQty;
  // wenn der Eintrag vorher als gelöscht markiert war, Rücknahme
  delete pendingOrderEdits.removed[cartItemId];

  if (valEl) valEl.textContent = String(newQty);

  // Zeilenpreis lokal aktualisieren
  const row = valEl ? valEl.closest('.checkout-item-row') : null;
  // Strikethrough-Markierung visuell zurücknehmen, falls vorher gesetzt
  if (row) row.classList.remove('is-pending-removed');
  const priceEl = row ? row.querySelector('[data-line-total]') : null;
  // Preis aus dem Header der Produktgruppe ableiten geht hier nicht zuverlässig;
  // wir rerendern stattdessen die Summen-Anzeige sauber via renderGoCheckout.
  void priceEl;

  updateSubmitButtonLabel();
  // Sidebar-Summe live aktualisieren
  refreshGoCheckoutTotals();
}

async function goOrderLocalRemove(cartItemId) {
  // Toggle: bereits als gelöscht markiert? → Markierung zurücknehmen.
  // Sonst: als gelöscht markieren (lokale Edits in qty werden verworfen).
  if (pendingOrderEdits.removed[cartItemId]) {
    delete pendingOrderEdits.removed[cartItemId];
  } else {
    pendingOrderEdits.removed[cartItemId] = true;
    delete pendingOrderEdits.qty[cartItemId];
  }
  updateSubmitButtonLabel();
  // Komplettes Re-Render, damit durchgestrichene Zeilen sichtbar bleiben
  // bzw. die Strikethrough-Markierung beim erneuten Klick zurückkommt.
  const user = await getCurrentUser();
  if (user) await renderGoCheckout(user);
}

// Summen über Bereich 1 + Bereich 2 (inkl. lokaler Edits) neu berechnen,
// ohne komplett neu zu rendern (damit Bereich-2-Eingaben nicht den Fokus verlieren).
async function refreshGoCheckoutTotals() {
  const user = await getCurrentUser();
  if (!user || !window.goSession) return;
  const sess = window.goSession;
  const { data } = await fetchGoCartItems(user.id, sess.groupOrderId);
  const all = data || [];
  let totalSum = 0, totalCount = 0;
  all.forEach(item => {
    if (item.confirmed && pendingOrderEdits.removed[item.id]) return;
    const qty = item.confirmed && pendingOrderEdits.qty[item.id] != null
      ? pendingOrderEdits.qty[item.id]
      : Number(item.quantity || 0);
    const price = Number(item.products?.price_brutto || 0);
    totalSum   += price * qty;
    totalCount += qty;
  });
  checkoutTotal.textContent     = formatPrice(totalSum);
  checkoutItemCount.textContent = String(totalCount);
}

// ============================================================
// SUBMIT BUTTON STATE (Sidebar-Button)
//   Label bleibt immer "Bestellung absenden".
//   Single-User: immer aktiv.
//   GO-Modus:    aktiv gdw. Bereich 1 unbestätigte Artikel hat
//                ODER Bereich 2 lokale Edits aufweist.
// ============================================================

async function updateSubmitButtonLabel() {
  if (!window.goSession) {
    submitOrderBtn.textContent   = 'Bestellung absenden';
    submitOrderBtn.disabled      = false;
    submitOrderBtn.style.opacity = '1';
    submitOrderBtn.style.cursor  = 'pointer';
    return;
  }

  // GO-Modus: Label nach Existenz von confirmed=true-Zeilen wechseln
  submitOrderBtn.textContent = _goHasConfirmed
    ? 'Bestellung aktualisieren'
    : 'Bestellung absenden';

  const enabled = _goHasUnconfirmed || hasPendingOrderEdits();
  submitOrderBtn.disabled      = !enabled;
  submitOrderBtn.style.opacity = enabled ? '1' : '0.4';
  submitOrderBtn.style.cursor  = enabled ? 'pointer' : 'not-allowed';
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
    // GO-Modus: Sidebar-Button "Bestellung absenden" macht zwei Dinge atomar:
    //   1) Lokale Edits aus Bereich 2 persistieren (Menge/Löschungen)
    //   2) Unbestätigte Items aus Bereich 1 bestätigen (confirmed=false → true)
    // Reihenfolge: erst Edits, dann Confirm, damit gelöschte Bereich-2-Zeilen
    // nicht durch frisches Confirmen überlebt werden könnten.
    const didEdits   = hasPendingOrderEdits();
    const didConfirm = _goHasUnconfirmed;
    if (didEdits)   await applyPendingOrderEdits();
    if (didConfirm) await confirmGoCartItems(user);

    // Post-Submit-Dialog anzeigen, falls tatsächlich etwas passiert ist
    if (didEdits || didConfirm) {
      showGoPostSubmitDialog(window.goSession);
    }
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
// GO BEREICH 1 → BEREICH 2: confirmed=false  →  confirmed=true
// (Schreibt NICHT in order_items — das passiert erst beim Auto-Close
//  via DB-Trigger / Edge Function.)
// ============================================================

async function confirmGoCartItems(user) {
  const sess = window.goSession;

  const { data: openItems, error: loadErr } =
    await fetchGoCartItems(user.id, sess.groupOrderId, false);
  if (loadErr) { setOrderMessage('Fehler beim Laden: ' + loadErr.message, true); return; }
  if (!openItems || openItems.length === 0) {
    setOrderMessage('Dein Warenkorb ist leer.', true);
    return;
  }

  // Pro Item prüfen, ob bereits eine confirmed=true-Zeile derselben Variante
  // (Produkt + Größe) existiert:
  //  - Wenn ja: Menge auf die bestehende Zeile addieren und die unbestätigte
  //    Zeile löschen. Damit bleibt die Bereich-2-Tabelle frei von Duplikaten
  //    und der UNIQUE-Index (user, go, product, size, confirmed) wird nicht verletzt.
  //  - Wenn nein: confirmed=true setzen (Zeile wandert in Bereich 2).
  for (const item of openItems) {
    const clothingId = item.clothing_size_id || null;
    const weightId   = item.weight_size_id   || null;

    let confQ = db.from('group_order_cart')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('group_order_id', sess.groupOrderId)
      .eq('product_id', item.product_id)
      .eq('confirmed', true);
    if (clothingId)      confQ = confQ.eq('clothing_size_id', clothingId);
    else                 confQ = confQ.is('clothing_size_id', null);
    if (weightId)        confQ = confQ.eq('weight_size_id', weightId);
    else                 confQ = confQ.is('weight_size_id', null);

    const { data: existingConfirmed, error: confLoadErr } = await confQ.maybeSingle();
    if (confLoadErr) {
      setOrderMessage('Fehler beim Prüfen bestehender Positionen: ' + confLoadErr.message, true);
      return;
    }

    if (existingConfirmed) {
      // Mengen-Merge: confirmed=true-Zeile erhält die addierte Menge,
      // die unbestätigte Zeile wird gelöscht.
      const mergedQty = Number(existingConfirmed.quantity || 0) + Number(item.quantity || 0);
      const { error: mergeErr } = await db.from('group_order_cart')
        .update({ quantity: mergedQty })
        .eq('id', existingConfirmed.id);
      if (mergeErr) {
        setOrderMessage('Fehler beim Zusammenführen: ' + mergeErr.message, true);
        return;
      }
      const { error: delErr } = await db.from('group_order_cart')
        .delete()
        .eq('id', item.id);
      if (delErr) {
        setOrderMessage('Fehler beim Aufräumen der Warenkorb-Zeile: ' + delErr.message, true);
        return;
      }
    } else {
      // Keine bestehende Bereich-2-Zeile — einfach bestätigen.
      const { error: confErr } = await db.from('group_order_cart')
        .update({ confirmed: true })
        .eq('id', item.id);
      if (confErr) {
        setOrderMessage('Fehler beim Hinzufügen zur Bestellung: ' + confErr.message, true);
        return;
      }
    }
  }

  setOrderMessage('Zur Sammelbestellung hinzugefügt.');

  // Ansichten aktualisieren
  await renderGoCheckout(user);
  if (typeof loadGoCart === 'function') await loadGoCart();
  await loadGoCartBadge();
}

// ============================================================
// GO BEREICH 2: lokale Edits persistieren
// Schreibt alle lokal gesammelten Mengen- und Lösch-Änderungen
// in einem Rutsch in die Datenbank — weiterhin nur in group_order_cart.
// Wird vom Sidebar-Submit-Button mitausgeführt.
// ============================================================

async function applyPendingOrderEdits() {
  const user = await getCurrentUser();
  if (!user) { setOrderMessage('Du musst eingeloggt sein.', true); return; }
  if (!hasPendingOrderEdits()) return;

  const ids        = Object.keys(pendingOrderEdits.qty);
  const removedIds = Object.keys(pendingOrderEdits.removed);

  // Löschungen
  if (removedIds.length > 0) {
    const { error } = await db.from('group_order_cart')
      .delete()
      .in('id', removedIds)
      .eq('user_id', user.id)
      .eq('confirmed', true);
    if (error) {
      setOrderMessage('Fehler beim Löschen: ' + error.message, true);
      return;
    }
  }

  // Mengen-Updates (pro Zeile)
  for (const id of ids) {
    if (pendingOrderEdits.removed[id]) continue;
    const newQty = pendingOrderEdits.qty[id];
    const { error } = await db.from('group_order_cart')
      .update({ quantity: newQty })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('confirmed', true);
    if (error) {
      setOrderMessage('Fehler beim Aktualisieren: ' + error.message, true);
      return;
    }
  }

  resetPendingOrderEdits();
  setOrderMessage('Bestellung aktualisiert.');
  await renderGoCheckout(user);
  await loadGoCartBadge();
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

  // Titel/Text je nachdem, ob es ein Erst-Submit oder Update war.
  // _goHasConfirmed wurde durch das vorherige render aktualisiert und
  // beschreibt den Zustand VOR dem aktuellen Submit nicht mehr zuverlässig;
  // wir orientieren uns am aktuellen Label-Stand des Sidebar-Buttons.
  const wasUpdate = submitOrderBtn.textContent === 'Bestellung aktualisieren';
  const title     = wasUpdate ? 'Bestellung aktualisiert' : 'Bestellung gespeichert';
  const message   = wasUpdate
    ? `Deine Änderungen wurden in der Sammelbestellung <strong>${escapeHtml(sess.supplierName)}</strong> gespeichert.`
    : `Deine Artikel wurden der Sammelbestellung <strong>${escapeHtml(sess.supplierName)}</strong> hinzugefügt.`;

  dialog.innerHTML = `
    <div class="go-modal-backdrop"></div>
    <div class="go-modal-box">
      <div class="go-post-submit-icon">✓</div>
      <h2 class="go-modal-title">${title}</h2>
      <p class="go-post-submit-text">${message}</p>
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

// ============================================================
// GO BEREICH 1 — Click-Delegation (qty +/-, remove)
// ============================================================
if (goCartListEl) {
  goCartListEl.addEventListener('click', async (e) => {
    const incBtn    = e.target.closest('[data-go-cart-inc]');
    const decBtn    = e.target.closest('[data-go-cart-dec]');
    const removeBtn = e.target.closest('[data-go-cart-remove]');
    if (incBtn)    { await updateGoCartItemQty(incBtn.getAttribute('data-go-cart-inc'),    1); return; }
    if (decBtn)    { await updateGoCartItemQty(decBtn.getAttribute('data-go-cart-dec'),   -1); return; }
    if (removeBtn) { await removeGoCartItem(removeBtn.getAttribute('data-go-cart-remove')); }
  });
}

// ============================================================
// GO BEREICH 2 — Click-Delegation (qty +/-, remove) NUR LOKAL
// ============================================================
if (goOrderListEl) {
  goOrderListEl.addEventListener('click', (e) => {
    const incBtn    = e.target.closest('[data-go-order-inc]');
    const decBtn    = e.target.closest('[data-go-order-dec]');
    const removeBtn = e.target.closest('[data-go-order-remove]');
    if (incBtn)    { goOrderLocalQtyDelta(incBtn.getAttribute('data-go-order-inc'),    1); return; }
    if (decBtn)    { goOrderLocalQtyDelta(decBtn.getAttribute('data-go-order-dec'),   -1); return; }
    if (removeBtn) { goOrderLocalRemove(removeBtn.getAttribute('data-go-order-remove')); }
  });
}

// ============================================================
// NORMALER CHECKOUT — Click-Delegation (qty +/-, remove)
// ============================================================
if (checkoutList) {
  checkoutList.addEventListener('click', async (e) => {
    const incBtn    = e.target.closest('[data-qty-inc]');
    const decBtn    = e.target.closest('[data-qty-dec]');
    const removeBtn = e.target.closest('[data-checkout-remove]');

    if (incBtn)    { await updateCheckoutItemQty(incBtn.getAttribute('data-qty-inc'), 1); return; }
    if (decBtn)    { await updateCheckoutItemQty(decBtn.getAttribute('data-qty-dec'), -1); return; }
    if (removeBtn) { await removeCheckoutItem(removeBtn.getAttribute('data-checkout-remove')); }
  });
}


// Beim Verlassen des Checkouts lokale Edits verwerfen,
// damit sie nicht beim nächsten Öffnen wieder erscheinen.
if (checkoutBackBtn) {
  checkoutBackBtn.addEventListener('click', () => {
    resetPendingOrderEdits();
    updateSubmitButtonLabel();
  });
}
