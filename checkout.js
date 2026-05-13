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

// Mobile Drawer "Zur Bestellübersicht" öffnet den Checkout
if (cartDrawerSubmit) cartDrawerSubmit.addEventListener("click", () => { openCheckout(); });

// ============================================================
// RENDER CHECKOUT
// ============================================================

async function renderCheckout() {
  const user = await getCurrentUser();
  if (!user) return;

  const { data, error } = await db
    .from("cart_items")
    .select(`id, quantity, product_id, clothing_size_id, weight_size_id,
             products(id,name,sku,price_brutto,price_netto),
             sizes_clothing(id,code), sizes_weight(id,code)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    checkoutList.innerHTML = "";
    checkoutEmpty.classList.remove("hidden");
    checkoutTotal.textContent = "0,00 €";
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

  checkoutList.innerHTML = Object.values(groupedItems).map(group => {
    const productTotal = group.items.reduce((sum, item) => sum + (group.productPrice * Number(item.quantity || 0)), 0);
    total += productTotal;
    totalItems += group.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      return `<div class="checkout-item-row">
        <div class="checkout-item-size">${sizeLabel ? `<span class="checkout-size-badge">${sizeLabel}</span>` : "<span class=\"checkout-size-badge checkout-size-badge--none\">Keine Größe</span>"}</div>
        <div class="checkout-item-qty">
          <button type="button" class="qty-stepper-btn" data-qty-dec="${item.id}" aria-label="Menge verringern">−</button>
          <span class="qty-stepper-value" id="qty-val-${item.id}">${item.quantity}</span>
          <button type="button" class="qty-stepper-btn" data-qty-inc="${item.id}" aria-label="Menge erhöhen">+</button>
        </div>
        <div class="checkout-item-price">${formatPrice(lineTotal)}</div>
        <button type="button" class="remove-btn icon-btn checkout-remove-btn" data-checkout-remove="${item.id}" aria-label="Position entfernen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>`;
    }).join("");

    return `<article class="checkout-product-group">
      <div class="checkout-product-header">
        <div class="checkout-product-name-wrap">
          <span class="checkout-product-name">${group.productName}</span>
          ${group.productSku ? `<span class="checkout-product-sku">${group.productSku}</span>` : ""}
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
  }).join("");

  checkoutTotal.textContent = formatPrice(total);
  checkoutItemCount.textContent = totalItems;

  checkoutList.querySelectorAll("[data-qty-inc]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateCheckoutItemQty(btn.getAttribute("data-qty-inc"), 1);
    });
  });
  checkoutList.querySelectorAll("[data-qty-dec]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateCheckoutItemQty(btn.getAttribute("data-qty-dec"), -1);
    });
  });
  checkoutList.querySelectorAll("[data-checkout-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await removeCheckoutItem(btn.getAttribute("data-checkout-remove"));
    });
  });
}

async function updateCheckoutItemQty(cartItemId, delta) {
  const user = await getCurrentUser();
  if (!user) return;

  const valEl = document.getElementById(`qty-val-${cartItemId}`);
  const currentQty = valEl ? Number(valEl.textContent) : 1;
  const newQty = Math.max(1, currentQty + delta);

  const { error } = await db
    .from("cart_items")
    .update({ quantity: newQty })
    .eq("id", cartItemId)
    .eq("user_id", user.id);

  if (error) { setOrderMessage(`Fehler beim Aktualisieren: ${error.message}`, true); return; }

  await Promise.all([renderCheckout(), loadCart()]);
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
  const cartItems = await loadCart();
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
  if (itemsError) { setOrderMessage(`Bestellpositionen konnten nicht gespeichert werden: ${itemsError.message}`, true); return; }

  try {
    await sendOrderEmailViaEdgeFunction(orderData.id);
  } catch (mailError) {
    setOrderMessage(`Bestellung gespeichert, aber E-Mail konnte nicht gesendet werden: ${mailError.message}`, true);
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

  // recipientEmail wird NICHT mehr im Frontend übergeben.
  // Die Edge Function liest ADMIN_EMAIL aus dem Supabase Secret.
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

submitOrderBtn.addEventListener("click", async () => { await submitOrder(); });
