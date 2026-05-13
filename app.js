const SUPABASE_URL = "https://fniweelbmnsrdmotkmzu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q8KSsPOtjWq5u2bGStAoDg_v1WAhzMt";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const authSection     = document.getElementById("auth-section");
const productsSection = document.getElementById("products-section");
const cartSection     = document.getElementById("cart-section");
const checkoutSection = document.getElementById("checkout-section");
const authForm        = document.getElementById("auth-form");
const signupBtn       = document.getElementById("signup-btn");
const logoutBtn       = document.getElementById("logout-btn");
const authMessage     = document.getElementById("auth-message");
const userBox         = document.getElementById("user-menu-email");
const productsList    = document.getElementById("products-list");
const cartList        = document.getElementById("cart-list");
const submitOrderBtn  = document.getElementById("submit-order-btn");
const cartTotal       = document.getElementById("cart-total");
const orderMessage    = document.getElementById("order-message");
const productsEmpty   = document.getElementById("products-empty");

// Checkout-Elemente
const openCheckoutBtn   = document.getElementById("open-checkout-btn");
const checkoutBackBtn   = document.getElementById("checkout-back-btn");
const checkoutList      = document.getElementById("checkout-list");
const checkoutEmpty     = document.getElementById("checkout-empty");
const checkoutTotal     = document.getElementById("checkout-total");
const checkoutItemCount = document.getElementById("checkout-item-count");

// --- Mobile Cart Drawer ---
const cartBadgeBtn        = document.getElementById("cart-badge-btn");
const cartBadgeCount      = document.getElementById("cart-badge-count");
const cartDrawer          = document.getElementById("cart-drawer");
const cartOverlay         = document.getElementById("cart-overlay");
const cartDrawerClose     = document.getElementById("cart-drawer-close");
const cartDrawerBody      = document.querySelector(".cart-drawer-body");
const cartDrawerTotal     = document.getElementById("cart-drawer-total");
const cartDrawerMsg       = document.getElementById("cart-drawer-message");
const cartDrawerSubmit    = document.getElementById("cart-drawer-submit");
const cartDrawerItemCount = document.getElementById("cart-drawer-item-count");

// --- Mobile Filter Drawer ---
const filterDrawer       = document.getElementById("filter-drawer");
const filterToggleBtn    = document.getElementById("filter-toggle-btn");
const filterDrawerClose  = document.getElementById("filter-drawer-close");
const filterApplyBtn     = document.getElementById("filter-apply-btn");
const filterResetMobile  = document.getElementById("filter-reset-btn-mobile");
const filterResetDesktop = document.getElementById("filter-reset-btn-desktop");
const filterActiveCount  = document.getElementById("filter-active-count");
const activeFilterBar    = document.getElementById("active-filter-bar");

// --- Filter FAB ---
const filterFab      = document.getElementById("filter-fab");
const filterFabCount = document.getElementById("filter-fab-count");

// Filter State
let allProducts = [];
let activeFilters = { category: null, supplier: null };

// ============================================================
// DRAWER HELPERS
// ============================================================

function isMobile() { return window.innerWidth < 1024; }

function openCartDrawer() {
  cartDrawer.setAttribute("aria-hidden", "false");
  cartOverlay.setAttribute("aria-hidden", "false");
  cartDrawer.classList.add("cart-drawer--open");
  cartOverlay.classList.add("cart-overlay--visible");
  document.body.classList.add("drawer-open");
  cartBadgeBtn.setAttribute("aria-expanded", "true");
}

function closeCartDrawer() {
  cartDrawer.setAttribute("aria-hidden", "true");
  cartOverlay.setAttribute("aria-hidden", "true");
  cartDrawer.classList.remove("cart-drawer--open");
  cartOverlay.classList.remove("cart-overlay--visible");
  document.body.classList.remove("drawer-open");
  cartBadgeBtn.setAttribute("aria-expanded", "false");
}

function openFilterDrawer() {
  filterDrawer.setAttribute("aria-hidden", "false");
  cartOverlay.setAttribute("aria-hidden", "false");
  filterDrawer.classList.add("filter-drawer--open");
  cartOverlay.classList.add("cart-overlay--visible");
  document.body.classList.add("drawer-open");
  filterToggleBtn.setAttribute("aria-expanded", "true");
}

function closeFilterDrawer() {
  filterDrawer.setAttribute("aria-hidden", "true");
  cartOverlay.setAttribute("aria-hidden", "true");
  filterDrawer.classList.remove("filter-drawer--open");
  cartOverlay.classList.remove("cart-overlay--visible");
  document.body.classList.remove("drawer-open");
  filterToggleBtn.setAttribute("aria-expanded", "false");
}

cartOverlay.addEventListener("click", () => {
  if (cartDrawer.classList.contains("cart-drawer--open")) closeCartDrawer();
  if (filterDrawer.classList.contains("filter-drawer--open")) closeFilterDrawer();
});

cartBadgeBtn.addEventListener("click", () => {
  if (!checkoutSection.classList.contains("hidden")) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  openCartDrawer();
});
cartDrawerClose.addEventListener("click", closeCartDrawer);
filterToggleBtn.addEventListener("click", openFilterDrawer);
filterDrawerClose.addEventListener("click", closeFilterDrawer);
filterApplyBtn.addEventListener("click", closeFilterDrawer);

if (filterFab) {
  filterFab.addEventListener("click", openFilterDrawer);
}

// Swipe-down Cart Drawer schliessen
let touchStartY = 0;
cartDrawer.addEventListener("touchstart", e => { touchStartY = e.touches[0].clientY; }, { passive: true });
cartDrawer.addEventListener("touchend",   e => { if (e.changedTouches[0].clientY - touchStartY > 60) closeCartDrawer(); }, { passive: true });

// Swipe-left Filter Drawer schliessen
let touchStartX = 0;
filterDrawer.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
filterDrawer.addEventListener("touchend",   e => { if (touchStartX - e.changedTouches[0].clientX > 60) closeFilterDrawer(); }, { passive: true });

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeCartDrawer();
    closeFilterDrawer();
    if (!checkoutSection.classList.contains("hidden")) closeCheckout();
  }
});

// ============================================================
// FILTER FAB - Scroll-aware visibility
// ============================================================

(function initFilterFabScroll() {
  if (!filterFab) return;

  let lastScrollY = window.scrollY;
  const THRESHOLD = 80;

  function updateFabVisibility() {
    if (!checkoutSection.classList.contains("hidden")) {
      filterFab.classList.remove("filter-fab--visible");
      filterFab.setAttribute("aria-hidden", "true");
      lastScrollY = window.scrollY;
      return;
    }

    const currentScrollY = window.scrollY;
    const scrollingUp    = currentScrollY < lastScrollY;

    if (scrollingUp && currentScrollY > THRESHOLD) {
      filterFab.classList.add("filter-fab--visible");
      filterFab.setAttribute("aria-hidden", "false");
    } else {
      filterFab.classList.remove("filter-fab--visible");
      filterFab.setAttribute("aria-hidden", "true");
    }

    lastScrollY = currentScrollY;
  }

  window.addEventListener("scroll", updateFabVisibility, { passive: true });
})();

// ============================================================
// FILTER LOGIC
// ============================================================

function buildFilterChips(products) {
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const suppliers  = [...new Set(products.map(p => p.supplyer).filter(Boolean))].sort();

  renderChips("filter-chips-category",        categories, "category", false);
  renderChips("filter-chips-supplier",         suppliers,  "supplier",  false);
  renderChips("filter-chips-category-mobile",  categories, "category", true);
  renderChips("filter-chips-supplier-mobile",  suppliers,  "supplier",  true);
}

function renderChips(containerId, values, filterKey, isMobileDrawer) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (values.length === 0) {
    container.closest(".sidebar-block, .filter-drawer-section")?.classList.add("hidden");
    return;
  }

  container.innerHTML = values.map(val => {
    const isActive = activeFilters[filterKey] === val;
    return `<button
      type="button"
      class="filter-chip${isActive ? ' filter-chip--active' : ''}"
      data-filter-key="${filterKey}"
      data-filter-val="${val}"
    >${val}</button>`;
  }).join("");

  container.querySelectorAll(".filter-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-filter-key");
      const val = btn.getAttribute("data-filter-val");
      activeFilters[key] = activeFilters[key] === val ? null : val;
      buildFilterChips(allProducts);
      applyFilters();
    });
  });
}

function applyFilters() {
  const { category, supplier } = activeFilters;
  let filtered = allProducts.filter(p => {
    const matchCat = !category || p.category === category;
    const matchSup = !supplier || p.supplyer === supplier;
    return matchCat && matchSup;
  });
  renderProducts(filtered);
  updateFilterUI();
}

function updateFilterUI() {
  const { category, supplier } = activeFilters;
  const total = (category ? 1 : 0) + (supplier ? 1 : 0);

  filterActiveCount.textContent = total;
  filterActiveCount.classList.toggle("hidden", total === 0);

  if (filterFabCount) {
    filterFabCount.textContent = total;
    filterFabCount.classList.toggle("hidden", total === 0);
  }
  if (filterFab) {
    filterFab.classList.toggle("filter-fab--active", total > 0);
  }

  activeFilterBar.innerHTML = "";
  if (total === 0) {
    activeFilterBar.classList.add("hidden");
    return;
  }
  activeFilterBar.classList.remove("hidden");

  const addTag = (label, key) => {
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "active-filter-tag";
    tag.innerHTML = `${label}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    tag.addEventListener("click", () => {
      activeFilters[key] = null;
      buildFilterChips(allProducts);
      applyFilters();
    });
    activeFilterBar.appendChild(tag);
  };

  if (category) addTag(category, "category");
  if (supplier) addTag(supplier, "supplier");
}

function resetFilters() {
  activeFilters = { category: null, supplier: null };
  buildFilterChips(allProducts);
  applyFilters();
}

filterResetMobile?.addEventListener("click",  resetFilters);
filterResetDesktop?.addEventListener("click", resetFilters);

// ============================================================
// BADGE
// ============================================================

function updateCartBadge(itemCount) {
  const show = itemCount > 0;
  cartBadgeCount.textContent = itemCount > 99 ? "99+" : itemCount;
  cartBadgeBtn.classList.toggle("hidden", !show);
  if (show) {
    cartBadgeCount.classList.remove("badge-pop");
    void cartBadgeCount.offsetWidth;
    cartBadgeCount.classList.add("badge-pop");
  }
}

// ============================================================
// DRAWER SYNC
// ============================================================

function syncDrawer(totalText, itemCount) {
  cartDrawerBody.innerHTML = cartList.innerHTML;

  if (cartDrawerItemCount) {
    cartDrawerItemCount.textContent = itemCount > 99 ? "99+" : itemCount;
  }

  cartDrawerTotal.textContent = totalText;

  cartDrawerBody.querySelectorAll("[data-remove-cart]").forEach(btn => {
    btn.addEventListener("click", async () => { await removeFromCart(btn.getAttribute("data-remove-cart")); });
  });

  cartDrawerBody.querySelectorAll("[data-scroll-to-product]").forEach(btn => {
    btn.addEventListener("click", () => {
      const productId = btn.getAttribute("data-scroll-to-product");
      closeCartDrawer();
      setTimeout(() => {
        const card = document.querySelector(`[data-product-card="${productId}"]`);
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("product-card-highlight");
        setTimeout(() => card.classList.remove("product-card-highlight"), 1600);
      }, 320);
    });
  });

  if (cartDrawerMsg) cartDrawerMsg.textContent = "";
}

// ============================================================
// HELPERS
// ============================================================

function setOrderMessage(text, isError = false) {
  orderMessage.textContent = text;
  orderMessage.style.color = isError ? "#a12c45" : "#666";
  if (cartDrawerMsg) { cartDrawerMsg.textContent = text; cartDrawerMsg.style.color = isError ? "#a12c45" : "#666"; }
}

function setMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#a12c45" : "#666";
}

function formatPrice(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

async function getCurrentUser() {
  const { data: { user }, error } = await db.auth.getUser();
  if (error) return null;
  return user;
}

// ============================================================
// SAMMELBESTELLUNG BANNER
// ============================================================

let activeGroupOrder = null; // Hält die aktive Sammelbestellung im State
let groupOrderChannel = null; // Supabase Realtime Channel

async function loadActiveGroupOrder() {
  const { data, error } = await db
    .from("group_orders")
    .select("id, deadline, status, created_by, created_at")
    .eq("status", "open")
    .gt("deadline", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Fehler beim Laden der Sammelbestellung:", error.message);
    return;
  }

  activeGroupOrder = data || null;
  renderGroupOrderBanner();
}

function renderGroupOrderBanner() {
  let banner = document.getElementById("group-order-banner");

  if (!activeGroupOrder) {
    if (banner) banner.remove();
    return;
  }

  const deadline = new Date(activeGroupOrder.deadline);
  const now = new Date();
  const diffMs = deadline - now;
  const diffH  = Math.floor(diffMs / 1000 / 60 / 60);
  const diffM  = Math.floor((diffMs / 1000 / 60) % 60);
  const deadlineStr = deadline.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

  let countdownText = "";
  if (diffMs > 0) {
    countdownText = diffH > 0
      ? `Noch ${diffH} Std. ${diffM} Min.`
      : `Noch ${diffM} Min.`;
  } else {
    countdownText = "Läuft gleich ab";
  }

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "group-order-banner";
    banner.style.cssText = [
      "background:#01696f",
      "color:#fff",
      "padding:12px 20px",
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "gap:12px",
      "flex-wrap:wrap",
      "font-family:inherit",
      "font-size:14px",
      "position:sticky",
      "top:0",
      "z-index:100",
    ].join(";");

    // Banner vor dem products-section einfügen
    const ref = productsSection || document.body;
    ref.parentNode.insertBefore(banner, ref);
  }

  banner.innerHTML = `
    <span>
      🛒 <strong>Sammelbestellung läuft!</strong>
      Deadline: ${deadlineStr} — ${countdownText}
    </span>
    <button
      id="group-order-join-btn"
      style="background:#fff;color:#01696f;border:none;border-radius:6px;padding:6px 14px;font-weight:600;cursor:pointer;font-size:13px;"
    >Mitmachen</button>
  `;

  document.getElementById("group-order-join-btn")?.addEventListener("click", joinGroupOrder);
}

async function joinGroupOrder() {
  if (!activeGroupOrder) return;
  const user = await getCurrentUser();
  if (!user) { alert("Du musst eingeloggt sein, um mitzumachen."); return; }

  // Alle offenen Orders des Users in die aktive Sammelbestellung einbuchen
  const { data: userOrders, error: fetchError } = await db
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .is("group_order_id", null);

  if (fetchError) { alert("Fehler: " + fetchError.message); return; }

  if (!userOrders || userOrders.length === 0) {
    alert("Du hast noch keine offene Bestellung, die zur Sammelbestellung hinzugefügt werden kann.");
    return;
  }

  const orderIds = userOrders.map(o => o.id);

  const { error: updateError } = await db
    .from("orders")
    .update({ group_order_id: activeGroupOrder.id })
    .in("id", orderIds);

  if (updateError) { alert("Fehler beim Beitreten: " + updateError.message); return; }

  alert(`Du nimmst jetzt an der Sammelbestellung teil! (${orderIds.length} Bestellung(en) zugewiesen)`);
}

async function createGroupOrder() {
  const user = await getCurrentUser();
  if (!user) { alert("Du musst eingeloggt sein."); return; }

  // Einfaches Prompt – kann später durch ein Modal ersetzt werden
  const input = prompt("Deadline für die Sammelbestellung (z. B. 2026-06-01T18:00):  ");
  if (!input) return;

  const deadline = new Date(input);
  if (isNaN(deadline.getTime())) { alert("Ungültiges Datum."); return; }

  const { error } = await db.from("group_orders").insert({
    created_by: user.id,
    deadline: deadline.toISOString(),
    status: "open",
  });

  if (error) { alert("Fehler: " + error.message); return; }

  await loadActiveGroupOrder();
  alert("Sammelbestellung erstellt!");
}

function subscribeGroupOrders() {
  if (groupOrderChannel) {
    db.removeChannel(groupOrderChannel);
  }
  groupOrderChannel = db
    .channel("group_orders_realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_orders" },
      () => { loadActiveGroupOrder(); }
    )
    .subscribe();
}

// ============================================================
// RENDER PRODUCTS
// ============================================================

function renderProducts(products) {
  if (!products || products.length === 0) {
    productsList.innerHTML = "";
    productsEmpty.classList.remove("hidden");
    return;
  }
  productsEmpty.classList.add("hidden");

  productsList.innerHTML = products.map(product => {
    const images = Array.isArray(product.product_images) ? [...product.product_images] : [];
    images.sort((a, b) => {
      const aPrimary = !!a.is_primary, bPrimary = !!b.is_primary;
      if (aPrimary === bPrimary) return (a.sort_order ?? 999) - (b.sort_order ?? 999);
      return aPrimary ? -1 : 1;
    });

    const firstImage  = images[0]?.image_url || "https://via.placeholder.com/600x600?text=Kein+Bild";
    const secondImage = images[1]?.image_url || firstImage;

    const clothingSizes = (product.product_clothing_sizes || []).map(r => r.sizes_clothing).filter(Boolean).sort((a,b) => (a.sort_order??999)-(b.sort_order??999));
    const weightSizes   = (product.product_weight_sizes   || []).map(r => r.sizes_weight).filter(Boolean).sort((a,b) => (a.sort_order??999)-(b.sort_order??999));
    const sizeType = clothingSizes.length > 0 ? "clothing" : weightSizes.length > 0 ? "weight" : null;
    const sizes    = sizeType === "clothing" ? clothingSizes : weightSizes;

    const sizesHtml = sizes.map(size => `
      <button type="button" class="size-btn"
        data-size-select="${product.id}"
        data-size-id="${size.id}"
        data-size-type="${sizeType}"
        data-size-code="${size.code}">${size.code}</button>`).join("");

    const hasSizes = sizes.length > 0;

    return `<article class="product-card" data-product-card="${product.id}">
      <div class="product-image-wrap">
        <img class="product-image product-image-primary" src="${firstImage}"  alt="${product.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/600x600?text=Bild+fehlt';">
        <img class="product-image product-image-hover"   src="${secondImage}" alt="${product.name}" loading="lazy" onerror="this.src='${firstImage}';">
      </div>
      <div class="product-info">
        <h3 class="product-title">${product.name}</h3>
        <p class="product-price">${formatPrice(product.price_brutto)}</p>
      </div>
      <div class="product-actions ${hasSizes ? 'product-actions-vertical' : ''}">
        ${hasSizes ? `
          <div class="size-selector">${sizesHtml}</div>
          <div class="purchase-panel hidden" data-purchase-panel="${product.id}">
            <label class="qty-box">Menge<input type="number" min="1" value="1" data-qty-for="${product.id}"></label>
            <button class="small-btn" data-add-to-cart="${product.id}">In den Warenkorb</button>
          </div>` : `
          <label class="qty-box">Menge<input type="number" min="1" value="1" data-qty-for="${product.id}"></label>
          <button class="small-btn" data-add-to-cart="${product.id}">In den Warenkorb</button>`}
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-size-select]").forEach(button => {
    button.addEventListener("click", () => {
      const productId = button.getAttribute("data-size-select");
      const sizeId    = button.getAttribute("data-size-id");
      const sizeType  = button.getAttribute("data-size-type");
      const card      = document.querySelector(`[data-product-card="${productId}"]`);
      const panel     = document.querySelector(`[data-purchase-panel="${productId}"]`);
      if (!card || !panel) return;
      card.querySelectorAll("[data-size-select]").forEach(b => b.classList.remove("size-btn-active"));
      button.classList.add("size-btn-active");
      card.setAttribute("data-selected-size-id", sizeId);
      card.setAttribute("data-selected-size-type", sizeType);
      panel.classList.remove("hidden");
    });
  });

  document.querySelectorAll("[data-add-to-cart]").forEach(button => {
    button.addEventListener("click", async () => {
      const productId      = button.getAttribute("data-add-to-cart");
      const card           = document.querySelector(`[data-product-card="${productId}"]`);
      const qtyInput       = document.querySelector(`[data-qty-for="${productId}"]`);
      const quantity       = Number(qtyInput?.value || 1);
      const selectedSizeId = card?.getAttribute("data-selected-size-id");
      const selectedSizeType = card?.getAttribute("data-selected-size-type");
      const hasSizeSelector = card?.querySelector(".size-selector");

      if (hasSizeSelector && (!selectedSizeId || !selectedSizeType)) {
        setMessage("Bitte zuerst eine Groesse auswaehlen.", true); return;
      }
      if (!quantity || quantity < 1) {
        setMessage("Bitte eine gueltige Menge eingeben.", true); return;
      }

      await addToCart(productId, quantity, selectedSizeId && selectedSizeType ? { sizeId: selectedSizeId, sizeType: selectedSizeType } : undefined);
      qtyInput.value = 1;

      if (hasSizeSelector) {
        card.removeAttribute("data-selected-size-id");
        card.removeAttribute("data-selected-size-type");
        card.querySelectorAll("[data-size-select]").forEach(b => b.classList.remove("size-btn-active"));
        document.querySelector(`[data-purchase-panel="${productId}"]`)?.classList.add("hidden");
      }
    });
  });
}

// ============================================================
// LOAD PRODUCTS
// ============================================================

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select(`
      id, name, sku, category, supplyer, price_brutto,
      product_images(image_id, image_url, sort_order, is_primary),
      product_clothing_sizes(size_id, sizes_clothing(id, code, sort_order)),
      product_weight_sizes(size_id, sizes_weight(id, code, sort_order))
    `)
    .eq("active", true)
    .order("category", { ascending: true });

  if (error) {
    productsList.innerHTML = `<p>Fehler beim Laden der Produkte: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    productsList.innerHTML = "<p>Noch keine Produkte vorhanden.</p>";
    return;
  }

  allProducts = data;
  buildFilterChips(allProducts);
  renderProducts(allProducts);
}

// ============================================================
// CART
// ============================================================

async function addToCart(productId, quantity, selectedSize) {
  const user = await getCurrentUser();
  if (!user) { setMessage("Du musst eingeloggt sein.", true); return; }

  const isClothing     = selectedSize?.sizeType === "clothing";
  const isWeight       = selectedSize?.sizeType === "weight";
  const clothingSizeId = isClothing ? selectedSize.sizeId : null;
  const weightSizeId   = isWeight   ? selectedSize.sizeId : null;

  let existingQuery = db.from("cart_items").select("id, quantity").eq("user_id", user.id).eq("product_id", productId);
  if (isClothing) existingQuery = existingQuery.eq("clothing_size_id", clothingSizeId);
  else if (isWeight) existingQuery = existingQuery.eq("weight_size_id", weightSizeId);

  const { data: existingItem, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) { setMessage(`Fehler beim Pruefen des Warenkorbs: ${existingError.message}`, true); return; }

  if (existingItem) {
    const { error: updateError } = await db.from("cart_items").update({ quantity: Number(existingItem.quantity||0) + Number(quantity||0) }).eq("id", existingItem.id);
    if (updateError) { setMessage(`Fehler beim Aktualisieren des Warenkorbs: ${updateError.message}`, true); return; }
  } else {
    const { error: insertError } = await db.from("cart_items").insert({ user_id: user.id, product_id: productId, quantity, clothing_size_id: clothingSizeId, weight_size_id: weightSizeId });
    if (insertError) { setMessage(`Fehler beim Speichern im Warenkorb: ${insertError.message}`, true); return; }
  }

  setMessage("Produkt zum Warenkorb hinzugefuegt.");
  await loadCart(productId);
  cartSection.classList.remove("cart-bump");
  void cartSection.offsetWidth;
  cartSection.classList.add("cart-bump");
}

async function loadCart(highlightProductId = null) {
  const user = await getCurrentUser();
  if (!user) { cartList.innerHTML = ""; cartTotal.textContent = ""; updateCartBadge(0); return []; }

  const { data, error } = await db
    .from("cart_items")
    .select(`id, quantity, product_id, clothing_size_id, weight_size_id,
             products(id,name,sku,price_brutto,price_netto),
             sizes_clothing(id,code), sizes_weight(id,code)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) { cartList.innerHTML = `<p>Fehler beim Laden des Warenkorbs: ${error.message}</p>`; cartTotal.textContent = ""; updateCartBadge(0); return []; }

  if (!data || data.length === 0) {
    cartList.innerHTML = "<p>Dein Warenkorb ist noch leer.</p>";
    cartTotal.textContent = "Gesamt: 0,00 \u20ac";
    updateCartBadge(0);
    syncDrawer("0,00 \u20ac", 0);
    return [];
  }

  const totalItems = data.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  updateCartBadge(totalItems);

  let total = 0;
  const groupedItems = {};

  data.forEach(item => {
    const product = item.products || {};
    const productId = item.product_id;
    if (!groupedItems[productId]) {
      groupedItems[productId] = { productId, productName: product.name || "Produkt", productSku: product.sku || null, productPrice: Number(product.price_brutto || 0), items: [] };
    }
    groupedItems[productId].items.push(item);
  });

  cartList.innerHTML = Object.values(groupedItems).map(group => {
    const productTotal = group.items.reduce((sum, item) => sum + (group.productPrice * Number(item.quantity || 0)), 0);
    total += productTotal;

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      return `<div class="cart-size-row">
        <div class="cart-size-row-left"><div class="cart-line-meta">
          ${sizeLabel ? `<span class="cart-line-qty">Groesse: ${sizeLabel}</span>` : ""}
          <span class="cart-line-qty">Menge: ${item.quantity}</span>
        </div></div>
        <div class="cart-size-row-right">
          <span class="cart-line-total">${formatPrice(lineTotal)}</span>
          <button class="remove-btn icon-btn" data-remove-cart="${item.id}" type="button" aria-label="Produkt aus dem Warenkorb entfernen" title="Entfernen">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>`;
    }).join("");

    return `<article class="cart-line" data-cart-product-id="${group.productId}">
      <div class="cart-line-top">
        <button class="cart-line-link" type="button" data-scroll-to-product="${group.productId}">${group.productName}</button>
        <p class="cart-line-total">${formatPrice(productTotal)}</p>
      </div>
      <div class="cart-group-rows">${rowsHtml}</div>
    </article>`;
  }).join("");

  const totalText = formatPrice(total);
  cartTotal.textContent = `Gesamt: ${totalText}`;

  syncDrawer(totalText, totalItems);

  document.querySelectorAll("#cart-section [data-remove-cart]").forEach(btn => {
    btn.addEventListener("click", async () => { await removeFromCart(btn.getAttribute("data-remove-cart")); });
  });

  document.querySelectorAll("#cart-section [data-scroll-to-product]").forEach(btn => {
    btn.addEventListener("click", () => {
      const productId = btn.getAttribute("data-scroll-to-product");
      const card = document.querySelector(`[data-product-card="${productId}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("product-card-highlight");
      setTimeout(() => card.classList.remove("product-card-highlight"), 1600);
    });
  });

  if (highlightProductId && !isMobile()) {
    const newCartItem = cartList.querySelector(`[data-cart-product-id="${highlightProductId}"]`);
    if (newCartItem) {
      newCartItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
      newCartItem.classList.remove("cart-line-highlight");
      void newCartItem.offsetWidth;
      newCartItem.classList.add("cart-line-highlight");
    }
  }

  if (highlightProductId && isMobile()) {
    cartBadgeCount.classList.remove("badge-pop");
    void cartBadgeCount.offsetWidth;
    cartBadgeCount.classList.add("badge-pop");
  }

  return data;
}

async function removeFromCart(cartItemId) {
  const { error } = await db.from("cart_items").delete().eq("id", cartItemId);
  if (error) { setMessage(`Fehler beim Entfernen: ${error.message}`, true); return; }
  setMessage("Produkt aus dem Warenkorb entfernt.");
  await loadCart();
}

// ============================================================
// AUTH + UI
// ============================================================

async function updateUI() {
  const { data: { session }, error } = await db.auth.getSession();
  if (error) { setMessage(`Sitzung konnte nicht geladen werden: ${error.message}`, true); return; }

  if (session?.user) {
    authSection.classList.add("hidden");
    productsSection.classList.remove("hidden");
    cartSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    userBox.textContent = session.user.email || "";
    document.getElementById("user-menu-btn").classList.remove("hidden");
    document.getElementById("user-dropdown-email").textContent = session.user.email || "";
    await loadProducts();
    await loadCart();
    await loadActiveGroupOrder();
    subscribeGroupOrders();
  } else {
    authSection.classList.remove("hidden");
    productsSection.classList.add("hidden");
    cartSection.classList.add("hidden");
    checkoutSection.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    userBox.textContent = "";
    document.getElementById("user-menu-btn").classList.add("hidden");
    document.getElementById("user-dropdown-email").textContent = "";
    productsList.innerHTML = "";
    cartList.innerHTML = "";
    updateCartBadge(0);
    allProducts = [];
    activeFilters = { category: null, supplier: null };
    activeGroupOrder = null;
    const banner = document.getElementById("group-order-banner");
    if (banner) banner.remove();
    if (groupOrderChannel) { db.removeChannel(groupOrderChannel); groupOrderChannel = null; }
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) { setMessage("Bitte E-Mail und Passwort eingeben.", true); return; }
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) { setMessage(error.message, true); return; }
  if (!data?.session?.user) { setMessage("Login war erfolgreich, aber es wurde keine Session gefunden.", true); return; }
  setMessage("Login erfolgreich.");
  await updateUI();
});

signupBtn.addEventListener("click", async () => {
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) { setMessage("Bitte E-Mail und Passwort eingeben.", true); return; }
  const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: "https://bestellliste.bastian-jonas.workers.dev/" } });
  if (error) { setMessage(error.message, true); return; }
  if (data?.user?.identities?.length === 0) { setMessage("Diese E-Mail ist bereits registriert oder konnte nicht neu angelegt werden.", true); return; }
  setMessage("Registrierung erfolgreich. Bitte E-Mail bestaetigen.");
});

logoutBtn.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) { setMessage(`Fehler beim Abmelden: ${error.message}`, true); return; }
  setMessage("Abgemeldet.");
  await updateUI();
});

// ============================================================
// USER MENU DROPDOWN TOGGLE
// ============================================================

const userMenuBtn  = document.getElementById("user-menu-btn");
const userDropdown = document.getElementById("user-dropdown");

userMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = userDropdown.classList.contains("user-dropdown--open");
  userDropdown.classList.toggle("user-dropdown--open", !isOpen);
  userMenuBtn.setAttribute("aria-expanded", String(!isOpen));
  userDropdown.setAttribute("aria-hidden", String(isOpen));
});

document.addEventListener("click", () => {
  userDropdown.classList.remove("user-dropdown--open");
  userMenuBtn.setAttribute("aria-expanded", "false");
  userDropdown.setAttribute("aria-hidden", "true");
});

db.auth.onAuthStateChange(() => { setTimeout(() => { updateUI(); }, 0); });

updateUI();
