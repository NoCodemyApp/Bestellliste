// ============================================================
// CHECKOUT VIEW
// ============================================================

function openCheckout() {
  productsSection.classList.add("hidden");
  checkoutSection.classList.remove("hidden");
  checkoutSection.classList.add("checkout-enter");
  closeCartDrawer();
  renderCheckout();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeCheckout() {
  checkoutSection.classList.add("hidden");
  checkoutSection.classList.remove("checkout-enter");
  productsSection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (openCheckoutBtn) openCheckoutBtn.addEventListener("click", openCheckout);
if (checkoutBackBtn) checkoutBackBtn.addEventListener("click", closeCheckout);

if (cartDrawerSubmit) cartDrawerSubmit.addEventListener("click", () => { openCheckout(); });

// ============================================================
// RENDER CHECKOUT
// ============================================================

async function renderCheckout() {
  const user = await getCurrentUser();
  if (!user) return;

  // FIX: Fehler und leerer Warenkorb werden separat behandelt
  const { data, error } = await fetchCartItems(user.id);

  if (error) {
    checkoutList.innerHTML = `<p class="checkout-error">Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    checkoutList.innerHTML = "";
    checkoutEmpty.classList.remove("hidden");
    checkoutTotal.textContent = "0,00 \u20ac";
    checkoutItemCount.textContent = "0";
    return;
  }

  checkoutEmpty.classList.add("hidden");

  let total = 0;
  let totalItems = 0;

  const groupedItems = {};
  data.forEach(item => {
    const product = item.products || {};
    const productId = item.product_id;
    if (!groupedItems[productId]) {
      groupedItems[productId] = {
        productId,
        productName: product.name || "Produkt",
        productSku: product.sku || null,
        productPrice: Number(product.price_brutto || 0),
        items: []
      };
    }
    groupedItems[productId].items.push(item);
  });

  // FIX: escapeHtml auf alle DB-Werte (XSS)
  checkoutList.innerHTML = Object.values(groupedItems).map(group => {
    const productTotal = group.items.reduce((sum, item) => sum + (group.productPrice * Number(item.quantity || 0)), 0);
    total += productTotal;
    totalItems += group.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      return `<div class="checkout-item-row">
        <div class="checkout-item-size">${sizeLabel ? `<span class="checkout-size-badge">${escapeHtml(sizeLabel)}</span>` : "<span class=\"checkout-size-badge checkout-size-badge--none\">Keine Gr\u00f6\u00dfe</span>"}</div>
        <div class="checkout-item-qty">
          <button type="button" class="qty-stepper-btn" data-qty-dec="${escapeHtml(String(item.id))}" aria-label="Menge verringern">−</button>
          <span class="qty-stepper-value" id="qty-val-${escapeHtml(String(item.id))}">${Number(item.quantity)}</span>
          <button type="button" class="qty-stepper-btn" data-qty-inc="${escapeHtml(String(item.id))}" aria-label="Menge erh\u00f6hen">+</button>
        </div>
        <div class="checkout-item-price">${formatPrice(lineTotal)}</div>
        <button type="button" class="remove-btn icon-btn checkout-remove-btn" data-checkout-remove="${escapeHtml(String(item.id))}" aria-label="Position entfernen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>`;
    }).join("");

    return `<article class="checkout-product-group">
      <div class="checkout-product-header">
        <div class="checkout-product-name-wrap">
          <span class="checkout-product-name">${escapeHtml(group.productName)}</span>
          ${group.productSku ? `<span class="checkout-product-sku">${escapeHtml(group.productSku)}</span>` : ""}
        </div>
        <span class="checkout-product-total">${formatPrice(productTotal)}</span>
      </div>
      <div class="checkout-item-rows">
        <div class="checkout-item-row checkout-item-row--header">
          <div class="checkout-item-size">Gr\u00f6\u00dfe</div>
          <div class="checkout-item-qty">Menge</div>
          <div class="checkout-item-price">Preis</div>
          <div></div>
        </div>
        ${rowsHtml}
      </div>
    </article>`;
  }).join("");

  checkoutTotal.textContent = formatPrice(total);
  checkoutItemCount.textContent = totalItems;

  // FIX: Event Delegation (verhindert doppelte Listener bei mehrfachem renderCheckout)
  checkoutList.addEventListener("click", async (e) => {
    const incBtn = e.target.closest("[data-qty-inc]");
    if (incBtn) { await updateCheckoutItemQty(incBtn.getAttribute("data-qty-inc"), 1); return; }

    const decBtn = e.target.closest("[data-qty-dec]");
    if (decBtn) { await updateCheckoutItemQty(decBtn.getAttribute("data-qty-dec"), -1); return; }

    const removeBtn = e.target.closest("[data-checkout-remove]");
    if (removeBtn) { await removeCheckoutItem(removeBtn.getAttribute("data-checkout-remove")); }
  }, { once: true });
}

// FIX: Debounce-Map für Qty-Stepper (verhindert Race Condition bei schnellen Klicks)
const qtyDebounceMap = {};

async function updateCheckoutItemQty(cartItemId, delta) {
  const user = await getCurrentUser();
  if (!user) return;

  // Debounce: doppelten schnellen Klick blockieren
  if (qtyDebounceMap[cartItemId]) return;
  qtyDebounceMap[cartItemId] = true;

  try {
    const valEl = document.getElementById(`qty-val-${cartItemId}`);
    const currentQty = valEl ? Number(valEl.textContent) : 1;
    const newQty = Math.max(1, currentQty + delta);

    // Optimistisches Update im DOM
    if (valEl) valEl.textContent = newQty;

    const { error } = await db
      .from("cart_items")
      .update({ quantity: newQty })
      .eq("id", cartItemId)
      .eq("user_id", user.id);

    if (error) {
      // Rollback bei Fehler
      if (valEl) valEl.textContent = currentQty;
      setOrderMessage(`Fehler beim Aktualisieren: ${error.message}`, true);
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

  const { error } = await db
    .from("cart_items")
    .delete()
    .eq("id", cartItemId)
    .eq("user_id", user.id);

  if (error) { setOrderMessage(`Fehler beim Entfernen: ${error.message}`, true); return; }

  await Promise.all([renderCheckout(), loadCart()]);
}

// ============================================================
// ORDER SUBMIT
// ============================================================

async function submitOrder() {
  const user = await getCurrentUser();
  if (!user) { setOrderMessage("Du musst eingeloggt sein.", true); return; }

  // FIX: fetchCartItems() statt loadCart() – keine DOM-Seiteneffekte
  const { data: cartItems, error: cartError } = await fetchCartItems(user.id);
  if (cartError) { setOrderMessage(`Fehler beim Laden des Warenkorbs: ${cartError.message}`, true); return; }
  if (!cartItems || cartItems.length === 0) { setOrderMessage("Dein Warenkorb ist leer.", true); return; }

  const { data: orderData, error: orderError } = await db
    .from("orders")
    .insert({ user_id: user.id, status: "submitted", note: null })
    .select()
    .single();
  if (orderError || !orderData) { setOrderMessage(`Bestellung konnte nicht angelegt werden: ${orderError?.message || "Unbekannter Fehler"}`, true); return; }

  const itemRows = cartItems.map(item => ({
    order_id: orderData.id,
    product_id: item.product_id,
    product_name: item.products?.name || "Produkt",
    product_sku: item.products?.sku || null,
    quantity: item.quantity,
    unit_price_netto: Number(item.products?.price_netto || 0),
    clothing_size_id: item.clothing_size_id || null,
    weight_size_id: item.weight_size_id || null,
    size_label: item.sizes_clothing?.code || item.sizes_weight?.code || null
  }));

  const { error: itemsError } = await db.from("order_items").insert(itemRows);
  if (itemsError) {
    // FIX: Rollback – Order löschen wenn Items nicht gespeichert werden konnten
    await db.from("orders").delete().eq("id", orderData.id);
    setOrderMessage(`Bestellpositionen konnten nicht gespeichert werden: ${itemsError.message}`, true);
    return;
  }

  try {
    await sendOrderEmailViaEdgeFunction(orderData.id);
  } catch (mailError) {
    // E-Mail-Fehler: Order ist gespeichert, Benutzer informieren aber NICHT abbrechen
    console.warn("E-Mail-Fehler:", mailError.message);
    setOrderMessage(`Bestellung gespeichert (ID: ${orderData.id}), aber E-Mail konnte nicht gesendet werden.`, true);
    // FIX: Cart trotzdem leeren, Bestellung ist gültig
    await db.from("cart_items").delete().eq("user_id", user.id);
    closeCheckout();
    closeCartDrawer();
    await loadCart();
    return;
  }

  const { error: clearCartError } = await db.from("cart_items").delete().eq("user_id", user.id);
  if (clearCartError) { setOrderMessage(`Bestellung gespeichert, aber Warenkorb nicht geleert: ${clearCartError.message}`, true); return; }

  setOrderMessage(`Bestellung erfolgreich abgesendet. Bestell-ID: ${orderData.id}`);
  closeCheckout();
  closeCartDrawer();
  await loadCart();
}

async function sendOrderEmailViaEdgeFunction(orderId) {
  const { data: sessionData } = await db.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Kein Access Token gefunden.");

  const response = await fetch("https://fniweelbmnsrdmotkmzu.supabase.co/functions/v1/resend-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ orderId })
  });

  const rawText = await response.text();
  let parsed;
  try { parsed = JSON.parse(rawText); } catch { parsed = { raw: rawText }; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${rawText}`);
  return parsed;
}

// FIX: Submit-Button wird während der Bestellung disabled (verhindert Doppelklick)
submitOrderBtn.addEventListener("click", async () => {
  submitOrderBtn.disabled = true;
  try {
    await submitOrder();
  } finally {
    submitOrderBtn.disabled = false;
  }
});
