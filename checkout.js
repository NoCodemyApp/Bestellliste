// ============================================================
// CHECKOUT VIEW — checkout.js
// GO-Modus: window.goSession steuert erweitertes Verhalten
// Normaler Warenkorb: cart_items
// GO-Warenkorb:      group_order_cart (persistent, deadline-gebunden)
// ============================================================

// ============================================================
// CART-LABEL HELPERS (GO-Modus)
// ============================================================
function updateCartLabelsForGo(supplierName) {
  const label = supplierName || window.goSession?.supplierName || 'Sammelbestellung';
  document.querySelectorAll('.cart-drawer-title, .section-head h2').forEach(el => {
    if (el.closest('#cart-section, .cart-drawer')) el.textContent = label;
  });
}

function resetCartLabels() {
  document.querySelectorAll('.cart-drawer-title, .section-head h2').forEach(el => {
    if (el.closest('#cart-section, .cart-drawer')) el.textContent = 'Warenkorb';
  });
}

// ============================================================
// CHECKOUT RENDER
// ============================================================
function renderCheckout() {
  const sess = window.goSession;
  if (sess) {
    renderGoCheckout();
  } else {
    renderNormalCheckout();
  }
}

function renderNormalCheckout() {
  const listEl    = document.getElementById('checkout-list');
  const emptyEl   = document.getElementById('checkout-empty');
  const totalEl   = document.getElementById('checkout-total');
  const countEl   = document.getElementById('checkout-item-count');
  const submitBtn = document.getElementById('submit-order-btn');

  if (!listEl) return;

  const entries  = Object.entries(cartItems).filter(([, v]) => v.qty > 0);
  const total    = entries.reduce((s, [, v]) => s + v.price * v.qty, 0);
  const hasItems = entries.length > 0;

  if (emptyEl)   emptyEl.classList.toggle('hidden', hasItems);
  if (totalEl)   totalEl.textContent = formatPrice(total);
  if (countEl)   countEl.textContent = entries.reduce((s, [, v]) => s + v.qty, 0);
  if (submitBtn) submitBtn.textContent = 'Bestellung absenden';

  listEl.innerHTML = hasItems
    ? entries.map(([id, v]) => `
      <div class="checkout-item" data-id="${id}">
        <div class="checkout-item-info">
          <span class="checkout-item-name">${escapeHtml(v.name)}</span>
          <span class="checkout-item-unit">${escapeHtml(v.unit)}</span>
        </div>
        <div class="checkout-item-controls">
          <button class="qty-btn qty-dec" data-id="${id}" aria-label="Menge verringern">−</button>
          <span class="qty-value">${v.qty}</span>
          <button class="qty-btn qty-inc" data-id="${id}" aria-label="Menge erhöhen">+</button>
          <span class="checkout-item-price">${formatPrice(v.price * v.qty)}</span>
          <button class="checkout-item-remove" data-id="${id}" aria-label="${escapeHtml(v.name)} entfernen">×</button>
        </div>
      </div>`).join('')
    : '';

  listEl.removeEventListener('click', handleCheckoutListClick);
  listEl.addEventListener('click', handleCheckoutListClick);
}

function handleCheckoutListClick(e) {
  const inc    = e.target.closest('.qty-inc');
  const dec    = e.target.closest('.qty-dec');
  const remove = e.target.closest('.checkout-item-remove');
  if (inc)    changeQty(inc.dataset.id,      1);
  if (dec)    changeQty(dec.dataset.id,     -1);
  if (remove) removeFromCart(remove.dataset.id);
  if (inc || dec || remove) renderNormalCheckout();
}

// ============================================================
// GO-CHECKOUT RENDER
// ============================================================
async function renderGoCheckout() {
  const user = await getCurrentUser();
  if (!user) return;

  const sess   = window.goSession;
  const listEl = document.getElementById('checkout-list');
  const emptyEl = document.getElementById('checkout-empty');
  if (!listEl) return;

  const { data, error } = await db
    .from('group_order_cart')
    .select('id, quantity, products(id, name, price, unit)')
    .eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId);

  if (error) {
    listEl.innerHTML = `<p class="cart-empty">Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const items   = data || [];
  const total   = items.reduce((s, r) => s + (r.products?.price ?? 0) * r.quantity, 0);
  const hasItems = items.length > 0;

  const totalEl  = document.getElementById('checkout-total');
  const countEl  = document.getElementById('checkout-item-count');
  const submitBtn = document.getElementById('submit-order-btn');

  if (totalEl) totalEl.textContent = formatPrice(total);
  if (countEl) countEl.textContent = items.reduce((s, r) => s + r.quantity, 0);
  if (emptyEl) emptyEl.classList.toggle('hidden', hasItems);
  if (submitBtn) submitBtn.textContent = 'GO-Bestellung absenden';

  listEl.innerHTML = hasItems
    ? items.map(r => `
      <div class="checkout-item" data-go-id="${r.id}">
        <div class="checkout-item-info">
          <span class="checkout-item-name">${escapeHtml(r.products?.name ?? '?')}</span>
          <span class="checkout-item-unit">${escapeHtml(r.products?.unit ?? 'Stk.')}</span>
        </div>
        <div class="checkout-item-controls">
          <span class="qty-value">${r.quantity}</span>
          <span class="checkout-item-price">${formatPrice((r.products?.price ?? 0) * r.quantity)}</span>
          <button class="checkout-item-remove" data-go-id="${r.id}" aria-label="Entfernen">×</button>
        </div>
      </div>`).join('')
    : '';

  listEl.removeEventListener('click', handleGoCheckoutListClick);
  listEl.addEventListener('click', handleGoCheckoutListClick);
}

function handleGoCheckoutListClick(e) {
  const removeBtn = e.target.closest('.checkout-item-remove[data-go-id]');
  if (removeBtn) deleteGoCartItem(removeBtn.dataset.goId);
}

// ============================================================
// GO-CART: QTY + REMOVE
// ============================================================
async function deleteGoCartItem(goCartItemId) {
  const user = await getCurrentUser();
  if (!user) return;
  const { error } = await db
    .from('group_order_cart')
    .delete()
    .eq('id', goCartItemId)
    .eq('user_id', user.id);
  if (error) { console.error('GO-Item entfernen:', error); return; }
  await renderGoCheckout();
  if (typeof loadGoCart === 'function') await loadGoCart();
}

// ============================================================
// GO-CART BADGE
// ============================================================
async function loadGoCartBadge() {
  const user = await getCurrentUser();
  if (!user) return;
  const sess = window.goSession;
  if (!sess) return;

  const { count } = await db
    .from('group_order_cart')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId);

  const badge = document.getElementById('cart-badge-count');
  if (badge) badge.textContent = count ?? 0;
}

// ============================================================
// GO-CART IN PRODUKT-GRID HINZUFÜGEN
// ============================================================
async function addToGoCart(productId, qty = 1) {
  const user = await getCurrentUser();
  if (!user) return;
  const sess = window.goSession;
  if (!sess) return;

  const existing = await db
    .from('group_order_cart')
    .select('id, quantity')
    .eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId)
    .eq('product_id', productId)
    .maybeSingle();

  if (existing.error) { console.error('GO addToCart check:', existing.error); return; }

  if (existing.data) {
    const newQty = existing.data.quantity + qty;
    const { error } = await db
      .from('group_order_cart')
      .update({ quantity: newQty })
      .eq('id', existing.data.id)
      .eq('user_id', user.id);
    if (error) { console.error('GO update qty:', error); return; }
  } else {
    const { error } = await db
      .from('group_order_cart')
      .insert({ user_id: user.id, group_order_id: sess.groupOrderId, product_id: productId, quantity: qty });
    if (error) { console.error('GO insert:', error); return; }
  }

  if (typeof loadGoCart === 'function') await loadGoCart();
}

// ============================================================
// GO ORDER SUBMIT
// ============================================================
async function submitGoOrder() {
  const user = await getCurrentUser();
  if (!user) return;
  const sess = window.goSession;
  if (!sess) return;

  const submitBtn = document.getElementById('submit-order-btn');
  const msgEl     = document.getElementById('order-message');

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gesendet…'; }

  const { data: cartData, error: cartErr } = await db
    .from('group_order_cart')
    .select('product_id, quantity, products(price)')
    .eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId);

  if (cartErr || !cartData?.length) {
    if (msgEl) { msgEl.textContent = cartErr ? cartErr.message : 'Warenkorb leer.'; msgEl.className = 'order-message error'; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'GO-Bestellung absenden'; }
    return;
  }

  const orderItems = cartData.map(r => ({
    user_id:         user.id,
    product_id:      r.product_id,
    quantity:        r.quantity,
    price:           r.products?.price ?? 0,
    group_order_id:  sess.groupOrderId,
  }));

  const { error: insertErr } = await db.from('orders').insert(orderItems);
  if (insertErr) {
    if (msgEl) { msgEl.textContent = insertErr.message; msgEl.className = 'order-message error'; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'GO-Bestellung absenden'; }
    return;
  }

  await db.from('group_order_cart')
    .delete()
    .eq('user_id', user.id)
    .eq('group_order_id', sess.groupOrderId);

  if (typeof loadGoCart === 'function') await loadGoCart();

  showGoPostSubmitDialog(sess);

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'GO-Bestellung absenden'; }
}

// ============================================================
// POST-SUBMIT DIALOG
// ============================================================
function showGoPostSubmitDialog(sess) {
  const existing = document.getElementById('go-post-submit-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id        = 'go-post-submit-dialog';
  dialog.className = 'go-modal-overlay';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Bestellung abgeschlossen');

  dialog.innerHTML = `
    <div class="go-modal">
      <div class="go-modal-header">
        <h3 class="go-modal-title">✅ Bestellung abgesendet</h3>
      </div>
      <div class="go-modal-body">
        <p>Deine Bestellung bei <strong>${escapeHtml(sess.supplierName)}</strong> wurde erfolgreich übermittelt.</p>
        <p style="margin-top:8px;font-size:.875rem;color:var(--muted);">Deadline: ${sess.deadline ? new Date(sess.deadline).toLocaleDateString('de-DE') : 'keine Angabe'}</p>
      </div>
      <div class="go-modal-footer">
        <button type="button" class="go-btn-primary" id="go-post-submit-close">Zurück zum Shop</button>
      </div>
    </div>`;

  document.body.appendChild(dialog);
  document.getElementById('go-post-submit-close')?.addEventListener('click', () => {
    dialog.remove();
    if (typeof leaveGoSession === 'function') leaveGoSession();
  });
}

// ============================================================
// CHECKOUT SUBMIT ROUTER
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('submit-order-btn')?.addEventListener('click', () => {
    if (window.goSession) {
      submitGoOrder();
    } else {
      submitOrder();
    }
  });
});
