// ============================================================
// CHECKOUT VIEW — checkout.js
// GO-Modus: window.goSession steuert erweitertes Verhalten
// ============================================================

// Snapshot der Cart-Items bei renderCheckout() — zum Dirty-Check
let _checkoutSnapshot = null;

function openCheckout() {
  productsSection.classList.add('hidden');
  checkoutSection.classList.remove('hidden');
  checkoutSection.classList.add('checkout-enter');
  closeCartDrawer();
  _checkoutSnapshot = null;
  renderCheckout();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeCheckout() {
  checkoutSection.classList.add('hidden');
  checkoutSection.classList.remove('checkout-enter');
  _checkoutSnapshot = null;
  // GO-Modus: zurück zur gefilterten Produktseite
  if (window.goSession) {
    productsSection.classList.remove('hidden');
    filterProductsForGo(window.goSession.supplierName);
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
// RENDER CHECKOUT
// ============================================================

async function renderCheckout() {
  const user = await getCurrentUser();
  if (!user) return;

  renderCheckoutHeader();
  updateSubmitButtonLabel();

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
    updateSubmitButtonDirtyState();
    return;
  }

  checkoutEmpty.classList.add('hidden');

  // Snapshot für Dirty-Check speichern
  _checkoutSnapshot = JSON.stringify(data.map(i => ({ id: i.id, qty: i.quantity })));

  let total = 0;
  let totalItems = 0;
  const groupedItems = {};
  data.forEach(item => {
    const product = item.products || {};
    const pid = item.product_id;
    if (!groupedItems[pid]) {
      groupedItems[pid] = {
        productId: pid,
        productName: product.name || 'Produkt',
        productSku: product.sku || null,
        productPrice: Number(product.price_brutto || 0),
        items: []
      };
    }
    groupedItems[pid].items.push(item);
  });

  checkoutList.innerHTML = Object.values(groupedItems).map(group => {
    const productTotal = group.items.reduce((sum, item) => sum + (group.productPrice * Number(item.quantity || 0)), 0);
    total += productTotal;
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

  checkoutTotal.textContent = formatPrice(total);
  checkoutItemCount.textContent = totalItems;

  // Event Delegation
  checkoutList.addEventListener('click', async (e) => {
    const incBtn = e.target.closest('[data-qty-inc]');
    if (incBtn) { await updateCheckoutItemQty(incBtn.getAttribute('data-qty-inc'),  1); return; }
    const decBtn = e.target.closest('[data-qty-dec]');
    if (decBtn) { await updateCheckoutItemQty(decBtn.getAttribute('data-qty-dec'), -1); return; }
    const removeBtn = e.target.closest('[data-checkout-remove]');
    if (removeBtn) { await removeCheckoutItem(removeBtn.getAttribute('data-checkout-remove')); }
  }, { once: true });

  // GO-Modus: bereits übermittelte Artikel der Sammelbestellung anzeigen
  if (window.goSession) await renderGoSubmittedItems(user);

  updateSubmitButtonDirtyState();
}

// ============================================================
// GO SUBMITTED ITEMS — bereits zur GO hinzugefügte Artikel
// ============================================================

async function renderGoSubmittedItems(user) {
  const sess = window.goSession;
  if (!sess) return;

  // Bereits submitted Order dieser GO laden
  const { data: goOrders } = await db.from('orders')
    .select('id, status').eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId)
    .eq('status', 'submitted').limit(1);

  let wrap = document.getElementById('go-submitted-wrap');
  const existing = goOrders && goOrders.length > 0 ? goOrders[0] : null;

  if (!existing) {
    if (wrap) wrap.remove();
    return;
  }

  const { data: submittedItems } = await db.from('order_items')
    .select(`id, quantity, product_name, product_sku, unit_price_netto, size_label`)
    .eq('order_id', existing.id);

  if (!submittedItems || submittedItems.length === 0) {
    if (wrap) wrap.remove();
    return;
  }

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'go-submitted-wrap';
    const checkoutBody = document.querySelector('.checkout-items-wrap');
    checkoutBody?.appendChild(wrap);
  }

  let rowsHtml = submittedItems.map(item => {
    const lineTotal = Number(item.unit_price_netto || 0) * Number(item.quantity || 0);
    return `<div class="go-submitted-row">
      <span class="go-submitted-name">${escapeHtml(item.product_name || '')}${item.product_sku ? ` <span class="go-submitted-sku">${escapeHtml(item.product_sku)}</span>` : ''}</span>
      <span class="go-submitted-meta">${item.size_label ? escapeHtml(item.size_label) + ' · ' : ''}${Number(item.quantity)}&times;</span>
      <span class="go-submitted-price">${formatPrice(lineTotal)}</span>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="go-submitted-header">
      <span>Bereits in Sammelbestellung</span>
      <span class="go-submitted-badge">${escapeHtml(sess.supplierName)}</span>
    </div>
    <div class="go-submitted-list">${rowsHtml}</div>`;
}

// ============================================================
// SUBMIT BUTTON LABEL + DIRTY STATE
// ============================================================

async function updateSubmitButtonLabel() {
  if (!window.goSession) {
    submitOrderBtn.textContent = 'Bestellung absenden';
    submitOrderBtn.disabled    = false;
    submitOrderBtn.style.opacity = '1';
    return;
  }

  const user = await getCurrentUser();
  if (!user) return;

  // Prüfen ob bereits eine submitted Order für diese GO vorhanden
  const { count } = await db.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('group_order_id', window.goSession.groupOrderId)
    .eq('status', 'submitted');

  const hasSubmitted = (count || 0) > 0;
  submitOrderBtn.textContent = hasSubmitted ? 'Bestellung aktualisieren' : 'Bestellung absenden';
  // Im GO-Modus ausgegraut bis Dirty-State (Funktion unten setzt es frei)
  if (hasSubmitted) {
    submitOrderBtn.disabled      = true;
    submitOrderBtn.style.opacity = '0.4';
    submitOrderBtn.style.cursor  = 'not-allowed';
  } else {
    submitOrderBtn.disabled      = false;
    submitOrderBtn.style.opacity = '1';
    submitOrderBtn.style.cursor  = 'pointer';
  }
}

function updateSubmitButtonDirtyState() {
  // Nur relevant wenn bereits submitted
  if (!submitOrderBtn.textContent.includes('aktualisieren')) return;
  // Dirty = Cart hat sich geändert seit renderCheckout() Snapshot
  // Wir lassen den Button freigeben wenn User etwas ändert (qty/remove)
  // Wird von updateCheckoutItemQty + removeCheckoutItem aufgerufen
}

function markCheckoutDirty() {
  if (!window.goSession) return;
  if (!submitOrderBtn.textContent.includes('aktualisieren')) return;
  submitOrderBtn.disabled      = false;
  submitOrderBtn.style.opacity = '1';
  submitOrderBtn.style.cursor  = 'pointer';
}

// ============================================================
// QTY + REMOVE
// ============================================================

const qtyDebounceMap = {};

async function updateCheckoutItemQty(cartItemId, delta) {
  const user = await getCurrentUser();
  if (!user) return;
  if (qtyDebounceMap[cartItemId]) return;
  qtyDebounceMap[cartItemId] = true;
  try {
    const valEl = document.getElementById(`qty-val-${cartItemId}`);
    const currentQty = valEl ? Number(valEl.textContent) : 1;
    const newQty = Math.max(1, currentQty + delta);
    if (valEl) valEl.textContent = newQty;
    const { error } = await db.from('cart_items')
      .update({ quantity: newQty }).eq('id', cartItemId).eq('user_id', user.id);
    if (error) {
      if (valEl) valEl.textContent = currentQty;
      setOrderMessage(`Fehler: ${error.message}`, true);
      return;
    }
    markCheckoutDirty();
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
  markCheckoutDirty();
  await Promise.all([renderCheckout(), loadCart()]);
}

// ============================================================
// ORDER SUBMIT (Standard + GO-Modus)
// ============================================================

async function submitOrder() {
  const user = await getCurrentUser();
  if (!user) { setOrderMessage('Du musst eingeloggt sein.', true); return; }

  const { data: cartItems, error: cartError } = await fetchCartItems(user.id);
  if (cartError) { setOrderMessage(`Fehler beim Laden: ${cartError.message}`, true); return; }
  if (!cartItems || cartItems.length === 0) { setOrderMessage('Dein Warenkorb ist leer.', true); return; }

  // GO-Modus: Update bestehender Order oder neue anlegen
  if (window.goSession) {
    await submitGoOrder(user, cartItems);
    return;
  }

  // Standard-Flow
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
// GO ORDER SUBMIT — Cart mit group_order_id verankern + Dialog
// ============================================================

async function submitGoOrder(user, cartItems) {
  const sess = window.goSession;

  // Bestehende GO-Order dieses Users laden
  const { data: existingOrders } = await db.from('orders')
    .select('id').eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId)
    .eq('status', 'submitted').limit(1);

  let orderId;

  if (existingOrders && existingOrders.length > 0) {
    // Update: alte order_items löschen und neu schreiben
    orderId = existingOrders[0].id;
    const { error: delError } = await db.from('order_items').delete().eq('order_id', orderId);
    if (delError) { setOrderMessage('Fehler beim Aktualisieren: ' + delError.message, true); return; }
  } else {
    // Neue Order mit group_order_id anlegen
    const { data: newOrder, error: newErr } = await db.from('orders')
      .insert({
        user_id:         user.id,
        status:         'submitted',
        group_order_id: sess.groupOrderId,
        note:           null
      }).select().single();
    if (newErr || !newOrder) { setOrderMessage('Fehler beim Anlegen: ' + (newErr?.message || 'Unbekannt'), true); return; }
    orderId = newOrder.id;
  }

  const itemRows = cartItems.map(item => ({
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
    setOrderMessage('Fehler beim Speichern: ' + itemsError.message, true);
    return;
  }

  // Warenkorb leeren
  await db.from('cart_items').delete().eq('user_id', user.id);
  await loadCart();

  // Post-Submit Dialog anzeigen
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
        <button type="button" class="go-btn-primary" id="go-post-go-back">Zur Sammelbestellung</button>
        <button type="button" class="go-btn-secondary" id="go-post-close-go">Sammelbestellung schließen</button>
      </div>
    </div>`;

  dialog.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');

  dialog.querySelector('#go-post-go-back').addEventListener('click', () => {
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
    checkoutSection.classList.add('hidden');
    productsSection.classList.remove('hidden');
    filterProductsForGo(sess.supplierName);
    renderGoSignalBanner();
    updateCartLabelsForGo(sess.supplierName);
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
