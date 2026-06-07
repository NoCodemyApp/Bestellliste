// ============================================================
// SHARED XSS HELPER (wird auch in group-order.js genutzt)
// ============================================================

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// DOM-REFERENZEN
// ============================================================

const authSection = document.getElementById("auth-section");
const productsSection = document.getElementById("products-section");
const cartSection     = document.getElementById("cart-section");
const checkoutSection = document.getElementById("checkout-section");
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

// Null-Guard: kritische DOM-Elemente prüfen
if (!cartBadgeBtn || !cartDrawer || !cartOverlay || !filterDrawer || !filterToggleBtn) {
  console.error("Kritische DOM-Elemente nicht gefunden. App kann nicht starten.");
}

// Filter State
let allProducts = [];
let activeFilters = { category: new Set(), supplier: new Set() };

if (typeof db === "undefined" || typeof getCurrentUser === "undefined") {
  console.error("auth.js muss vor app.js geladen werden.");
}

// ============================================================
// UI-STATE: Reagiert auf auth:changed von auth.js
// ============================================================

document.addEventListener("auth:changed", async ({ detail: { session, approvalStatus } }) => {
  const pendingSection = document.getElementById("pending-section");

  if (session?.user) {
    if (approvalStatus !== "approved") {
      // Pending-View: eingeloggt, aber noch nicht freigeschalten
      authSection.classList.add("hidden");
      pendingSection?.classList.remove("hidden");
      productsSection.classList.add("hidden");
      cartSection.classList.add("hidden");
      checkoutSection.classList.add("hidden");
      document.getElementById("logout-btn").classList.remove("hidden");
      document.getElementById("user-menu-btn").classList.add("hidden");
      userBox.textContent = "";
      return;
    }

    // Approved — normaler App-Start
    pendingSection?.classList.add("hidden");
    authSection.classList.add("hidden");
    productsSection.classList.remove("hidden");
    cartSection.classList.remove("hidden");
    document.getElementById("logout-btn").classList.remove("hidden");
    userBox.textContent = session.user.email || "";
    document.getElementById("user-menu-btn").classList.remove("hidden");
    document.getElementById("user-dropdown-email").textContent = session.user.email || "";
    document.getElementById("shop-sidebar-desktop")?.classList.remove("hidden");  // ← NEU
    document.querySelector(".shop-topbar")?.classList.remove("hidden");            // ← NEU
    await loadProducts();
    await initGroupOrders();
    if (window.goSession) {
      await loadGoCart();
    } else {
      await loadCart();
    }
  } else {
    // Ausgeloggt — alles zurücksetzen
    pendingSection?.classList.add("hidden");
    authSection.classList.remove("hidden");
    productsSection.classList.add("hidden");
    cartSection.classList.add("hidden");
    checkoutSection.classList.add("hidden");
    document.getElementById("logout-btn").classList.add("hidden");
    userBox.textContent = "";
    document.getElementById("user-menu-btn").classList.add("hidden");
    document.getElementById("user-dropdown-email").textContent = "";
    productsList.innerHTML = "";
    cartList.innerHTML = "";
    updateCartBadge(0);
    allProducts = [];
    activeFilters = { category: new Set(), supplier: new Set() };
    buildFilterChips([]);     // setzt alle sidebar-blocks und filter-sections auf hidden
    updateFilterUI();         // setzt active-filter-bar auf hidden, Badge auf 0
    // Optional, falls Topbar/Sidebar noch eigene hidden-Klasse brauchen:
    document.getElementById("shop-sidebar-desktop")?.classList.add("hidden");
    document.querySelector(".shop-topbar")?.classList.add("hidden");

    if (typeof teardownGroupOrders === "function") teardownGroupOrders();
  }
});

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

// Swipe-down Cart-Handle Drawer löst Swipe-close aus
let touchStartY = 0;
let swipeFromHandle = false;
const cartDrawerHandle = cartDrawer.querySelector(".cart-drawer-handle");

cartDrawerHandle.addEventListener("touchstart", e => {
  touchStartY = e.touches[0].clientY;
  swipeFromHandle = true;
}, { passive: true });

cartDrawer.addEventListener("touchend", e => {
  if (swipeFromHandle && e.changedTouches[0].clientY - touchStartY > 60) closeCartDrawer();
  swipeFromHandle = false;
}, { passive: true });

// Swipe-left Filter Drawer schliessen
let touchStartX = 0;
filterDrawer.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
filterDrawer.addEventListener("touchend",   e => { if (touchStartX - e.changedTouches[0].clientX > 60) closeFilterDrawer(); }, { passive: true });

// Globale Delegations-Listener für cartList und cartDrawerBody
cartList.addEventListener("click", async (e) => {
  const removeGoCart = e.target.closest("[data-remove-go-cart]");
  if (removeGoCart) { await removeFromGoCart(removeGoCart.getAttribute("data-remove-go-cart")); return; }

  const removeCart = e.target.closest("[data-remove-cart]");
  if (removeCart) { await removeFromCart(removeCart.getAttribute("data-remove-cart")); return; }

  const scrollBtn = e.target.closest("[data-scroll-to-product]");
  if (scrollBtn) {
    const productId = scrollBtn.getAttribute("data-scroll-to-product");
    const card = document.querySelector(`[data-product-card="${productId}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("product-card-highlight");
    setTimeout(() => card.classList.remove("product-card-highlight"), 1600);
  }
});

cartDrawerBody.addEventListener("click", async (e) => {
  const removeBtn = e.target.closest("[data-remove-cart]");
  if (removeBtn) { await removeFromCart(removeBtn.getAttribute("data-remove-cart")); return; }

  const scrollBtn = e.target.closest("[data-scroll-to-product]");
  if (scrollBtn) {
    const productId = scrollBtn.getAttribute("data-scroll-to-product");
    closeCartDrawer();
    setTimeout(() => {
      const card = document.querySelector(`[data-product-card="${productId}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("product-card-highlight");
      setTimeout(() => card.classList.remove("product-card-highlight"), 1600);
    }, 320);
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeCartDrawer();
    closeFilterDrawer();
    closeGroupOrderModal();
    closeEditModal();
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
  const suppliers  = [...new Set(products.map(p => p.suppliers?.name).filter(Boolean))].sort();

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

  container.closest(".sidebar-block, .filter-drawer-section")?.classList.remove("hidden");

  container.innerHTML = values.map(val => {
    const isActive = activeFilters[filterKey].has(val);
    return `<button
      type="button"
      class="filter-chip${isActive ? ' filter-chip--active' : ''}"
      data-filter-key="${escapeHtml(filterKey)}"
      data-filter-val="${escapeHtml(val)}"
    >${escapeHtml(val)}</button>`;
  }).join("");

  container.querySelectorAll(".filter-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-filter-key");
      const val = btn.getAttribute("data-filter-val");
      if (activeFilters[key].has(val)) {
        activeFilters[key].delete(val);
      } else {
        activeFilters[key].add(val);
      }
      buildFilterChips(allProducts);
      applyFilters();
    });
  });
}

function applyFilters() {
  const { category, supplier } = activeFilters;
  const goSupplierId = window.goSession?.supplierId || null;
  let filtered = allProducts.filter(p => {
    const matchCat   = category.size === 0 || category.has(p.category);
    const matchSup   = supplier.size === 0 || supplier.has(p.suppliers?.name);
    const matchGoSup = !goSupplierId || p.supplier_id === goSupplierId;
    return matchCat && matchSup && matchGoSup;
  });
  renderProducts(filtered);
  updateFilterUI();
}

function updateFilterUI() {
  const { category, supplier } = activeFilters;
  const total = category.size + supplier.size;

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
    tag.innerHTML = `${escapeHtml(label)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    tag.addEventListener("click", () => {
      activeFilters[key].delete(label);
      buildFilterChips(allProducts);
      applyFilters();
    });
    activeFilterBar.appendChild(tag);
  };

  category.forEach(val => addTag(val, "category"));
  supplier.forEach(val => addTag(val, "supplier"));
}

function resetFilters() {
  activeFilters = { category: new Set(), supplier: new Set() };
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

  if (cartDrawerMsg) cartDrawerMsg.textContent = "";
}

// ============================================================
// GO-MODUS: group_order_cart laden und rendern
// ============================================================

async function loadGoCart() {
  const user = await getCurrentUser();
  if (!user || !window.goSession) return;

  const goId = window.goSession.groupOrderId;

  const { data, error } = await db
    .from("group_order_cart")
    .select(`id, quantity, product_id,
             clothing_size_id, weight_size_id,
             products(id, name, sku, price_brutto),
             sizes_clothing(id, code),
             sizes_weight(id, code)`)
    .eq("user_id", user.id)
    .eq("group_order_id", goId)
    .eq("confirmed", false)
    .order("created_at", { ascending: false });

  if (error) {
    cartList.innerHTML = `<p>Fehler beim Laden: ${escapeHtml(error.message)}</p>`;
    updateCartBadge(0);
    return;
  }

  if (!data || data.length === 0) {
    cartList.innerHTML = "<p>Noch keine Produkte in dieser Sammelbestellung.</p>";
    cartTotal.textContent = "Gesamt: 0,00 \u20ac";
    updateCartBadge(0);
    syncDrawer("0,00 \u20ac", 0);
    return;
  }

  const totalItems = data.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  updateCartBadge(totalItems);

  let total = 0;
  const groupedItems = {};

  data.forEach(item => {
    const product = item.products || {};
    const productId = item.product_id;
    if (!groupedItems[productId]) {
      groupedItems[productId] = {
        productId,
        productName:  product.name  || "Produkt",
        productSku:   product.sku   || null,
        productPrice: Number(product.price_brutto || 0),
        items: []
      };
    }
    groupedItems[productId].items.push(item);
  });

  cartList.innerHTML = Object.values(groupedItems).map(group => {
    const productTotal = group.items.reduce(
      (sum, item) => sum + group.productPrice * Number(item.quantity || 0), 0
    );
    total += productTotal;

    const rowsHtml = group.items.map(item => {
      const sizeLabel = item.sizes_clothing?.code || item.sizes_weight?.code || null;
      const lineTotal = group.productPrice * Number(item.quantity || 0);
      return `<div class="cart-size-row">
        <div class="cart-size-row-left"><div class="cart-line-meta">
          ${sizeLabel ? `<span class="cart-line-qty">Gr\u00f6\u00dfe: ${escapeHtml(sizeLabel)}</span>` : ""}
          <span class="cart-line-qty">Menge: ${Number(item.quantity)}</span>
        </div></div>
        <div class="cart-size-row-right">
          <span class="cart-line-total">${formatPrice(lineTotal)}</span>
          <button class="remove-btn icon-btn" data-remove-go-cart="${escapeHtml(String(item.id))}" type="button"
                  aria-label="Produkt entfernen" title="Entfernen">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>`;
    }).join("");

    return `<article class="cart-line" data-cart-product-id="${escapeHtml(String(group.productId))}">
      <div class="cart-line-top">
        <button class="cart-line-link" type="button"
                data-scroll-to-product="${escapeHtml(String(group.productId))}">${escapeHtml(group.productName)}</button>
        <p class="cart-line-total">${formatPrice(productTotal)}</p>
      </div>
      <div class="cart-group-rows">${rowsHtml}</div>
    </article>`;
  }).join("");

  const totalText = formatPrice(total);
  cartTotal.textContent = `Gesamt: ${totalText}`;
  syncDrawer(totalText, totalItems);
  
}

async function removeFromGoCart(goCartItemId) {
  const { error } = await db.from("group_order_cart").delete().eq("id", goCartItemId);
  if (error) { console.error(`Fehler beim Entfernen: ${error.message}`); return; }
  await loadGoCart();
}

// ============================================================
// HELPERS
// ============================================================

function setMessage(text, isError = false) {
  if (orderMessage) {
    orderMessage.textContent = text;
    orderMessage.style.color = isError ? "#a12c45" : "#666";
  }
  if (cartDrawerMsg) {
    cartDrawerMsg.textContent = text;
    cartDrawerMsg.style.color = isError ? "#a12c45" : "#666";
  }
}
const setOrderMessage = setMessage; //in checkout.js als setOrderMessage 

function formatPrice(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

// ============================================================
// FETCH CART DATA
// ============================================================

async function fetchCartItems(userId) {
  const { data, error } = await db
    .from("cart_items")
    .select(`id, quantity, product_id, clothing_size_id, weight_size_id,
             products(id,name,sku,price_brutto,price_netto),
             sizes_clothing(id,code), sizes_weight(id,code)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error };
  return { data: data || [], error: null };
}

// ============================================================
// RENDER PRODUCTS
// ============================================================

const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Crect width='600' height='600' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='28' fill='%23999'%3EKein Bild%3C/text%3E%3C/svg%3E";

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

    const firstImage  = images[0]?.image_url || FALLBACK_IMAGE;
    const secondImage = images[1]?.image_url || firstImage;

    const clothingSizes = (product.product_clothing_sizes || []).map(r => r.sizes_clothing).filter(Boolean).sort((a,b) => (a.sort_order??999)-(b.sort_order??999));
    const weightSizes   = (product.product_weight_sizes   || []).map(r => r.sizes_weight).filter(Boolean).sort((a,b) => (a.sort_order??999)-(b.sort_order??999));
    const sizeType = clothingSizes.length > 0 ? "clothing" : weightSizes.length > 0 ? "weight" : null;
    const sizes    = sizeType === "clothing" ? clothingSizes : weightSizes;

    const safeName = escapeHtml(product.name);
    const safeId   = escapeHtml(String(product.id));

    const sizesHtml = sizes.map(size => `
      <button type="button" class="size-btn"
        data-size-select="${safeId}"
        data-size-id="${escapeHtml(String(size.id))}"
        data-size-type="${escapeHtml(sizeType)}"
        data-size-code="${escapeHtml(size.code)}">${escapeHtml(size.code)}</button>`).join("");

    const hasSizes = sizes.length > 0;

    return `<article class="product-card" data-product-card="${safeId}">
      <div class="product-image-wrap">
        <img class="product-image product-image-primary" src="${firstImage}"  alt="${safeName}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}';">
        <img class="product-image product-image-hover"   src="${secondImage}" alt="${safeName}" loading="lazy" onerror="this.onerror=null;this.src='${firstImage}';">
      </div>
      <div class="product-info">
        <h3 class="product-title">${safeName}</h3>
        <p class="product-price">${formatPrice(product.price_brutto)}</p>
      </div>
      <div class="product-actions ${hasSizes ? 'product-actions-vertical' : ''}">
        ${hasSizes ? `
          <div class="size-selector">${sizesHtml}</div>
          <div class="purchase-panel hidden" data-purchase-panel="${safeId}">
            <label class="qty-box">Menge<input type="number" min="1" value="1" data-qty-for="${safeId}"></label>
            <button class="small-btn" data-add-to-cart="${safeId}">In den Warenkorb</button>
          </div>` : `
          <label class="qty-box">Menge<input type="number" min="1" value="1" data-qty-for="${safeId}"></label>
          <button class="small-btn" data-add-to-cart="${safeId}">In den Warenkorb</button>`}
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
      const productId        = button.getAttribute("data-add-to-cart");
      const card             = document.querySelector(`[data-product-card="${productId}"]`);
      const qtyInput         = document.querySelector(`[data-qty-for="${productId}"]`);
      const quantity         = Number(qtyInput?.value || 1);
      const selectedSizeId   = card?.getAttribute("data-selected-size-id");
      const selectedSizeType = card?.getAttribute("data-selected-size-type");
      const hasSizeSelector  = card?.querySelector(".size-selector");

      if (hasSizeSelector && (!selectedSizeId || !selectedSizeType)) {
        setMessage("Bitte zuerst eine Groesse auswaehlen.", true); return;
      }
      if (!quantity || quantity < 1) {
        setMessage("Bitte eine gueltige Menge eingeben.", true); return;
      }

      button.disabled = true;
      await addToCart(productId, quantity, selectedSizeId && selectedSizeType ? { sizeId: selectedSizeId, sizeType: selectedSizeType } : undefined);
      button.disabled = false;
      if (qtyInput) qtyInput.value = 1;

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
      id,
      name,
      sku,
      category,
      price_brutto,
      price_netto,
      supplier_id,
      brand_id,
      suppliers(id, name, logo_url),
      brands(id, name, logo_url),
      product_images(image_id, image_url, sort_order, is_primary),
      product_clothing_sizes(size_id, sizes_clothing(id, code, sort_order)),
      product_weight_sizes(size_id, sizes_weight(id, code, sort_order))
    `)
    .eq("active", true)
    .order("category", { ascending: true });

  if (error) {
    productsList.innerHTML = `<p>Fehler beim Laden der Produkte: ${escapeHtml(error.message)}</p>`;
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
// CART — addToCart
// ============================================================

async function addToCart(productId, quantity, selectedSize) {
  const user = await getCurrentUser();
  if (!user) { setMessage("Du musst eingeloggt sein.", true); return; }

  const isClothing     = selectedSize?.sizeType === "clothing";
  const isWeight       = selectedSize?.sizeType === "weight";
  const clothingSizeId = isClothing ? selectedSize.sizeId : null;
  const weightSizeId   = isWeight   ? selectedSize.sizeId : null;

  if (window.goSession) {
    const goId = window.goSession.groupOrderId;

    let goQuery = db.from("group_order_cart")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("group_order_id", goId)
      .eq("product_id", productId)
      .eq("confirmed", false);

    if (isClothing)    goQuery = goQuery.eq("clothing_size_id", clothingSizeId);
    else if (isWeight) goQuery = goQuery.eq("weight_size_id", weightSizeId);
    else               goQuery = goQuery.is("clothing_size_id", null).is("weight_size_id", null);

    const { data: existing, error: goErr } = await goQuery.maybeSingle();
    if (goErr) { setMessage(`Fehler: ${goErr.message}`, true); return; }

    if (existing) {
      const { error: updErr } = await db.from("group_order_cart")
        .update({ quantity: Number(existing.quantity || 0) + Number(quantity || 0) })
        .eq("id", existing.id);
      if (updErr) { setMessage(`Fehler: ${updErr.message}`, true); return; }
    } else {
      const { error: insErr } = await db.from("group_order_cart").insert({
        user_id:          user.id,
        group_order_id:   goId,
        product_id:       productId,
        quantity,
        clothing_size_id: clothingSizeId,
        weight_size_id:   weightSizeId,
        confirmed:        false
      });
      if (insErr) { setMessage(`Fehler: ${insErr.message}`, true); return; }
    }

    setMessage("Produkt zur Sammelbestellung hinzugef\u00fcgt.");
    await loadGoCart();
    cartSection.classList.remove("cart-bump");
    void cartSection.offsetWidth;
    cartSection.classList.add("cart-bump");
    return;
  }

  let existingQuery = db.from("cart_items")
    .select("id, quantity").eq("user_id", user.id).eq("product_id", productId);

  if (isClothing)    existingQuery = existingQuery.eq("clothing_size_id", clothingSizeId);
  else if (isWeight) existingQuery = existingQuery.eq("weight_size_id", weightSizeId);
  else               existingQuery = existingQuery.is("clothing_size_id", null).is("weight_size_id", null);

  const { data: existingItem, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) { setMessage(`Fehler beim Pruefen des Warenkorbs: ${existingError.message}`, true); return; }

  if (existingItem) {
    const { error: updateError } = await db.from("cart_items")
      .update({ quantity: Number(existingItem.quantity || 0) + Number(quantity || 0) })
      .eq("id", existingItem.id);
    if (updateError) { setMessage(`Fehler beim Aktualisieren des Warenkorbs: ${updateError.message}`, true); return; }
  } else {
    const { error: insertError } = await db.from("cart_items").insert({
      user_id: user.id, product_id: productId, quantity,
      clothing_size_id: clothingSizeId, weight_size_id: weightSizeId
    });
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

  const { data, error } = await fetchCartItems(user.id);

  if (error) { cartList.innerHTML = `<p>Fehler beim Laden des Warenkorbs: ${escapeHtml(error.message)}</p>`; cartTotal.textContent = ""; updateCartBadge(0); return []; }

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
          ${sizeLabel ? `<span class="cart-line-qty">Groesse: ${escapeHtml(sizeLabel)}</span>` : ""}
          <span class="cart-line-qty">Menge: ${Number(item.quantity)}</span>
        </div></div>
        <div class="cart-size-row-right">
          <span class="cart-line-total">${formatPrice(lineTotal)}</span>
          <button class="remove-btn icon-btn" data-remove-cart="${escapeHtml(String(item.id))}" type="button" aria-label="Produkt aus dem Warenkorb entfernen" title="Entfernen">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>`;
    }).join("");

    return `<article class="cart-line" data-cart-product-id="${escapeHtml(String(group.productId))}">
      <div class="cart-line-top">
        <button class="cart-line-link" type="button" data-scroll-to-product="${escapeHtml(String(group.productId))}">${escapeHtml(group.productName)}</button>
        <p class="cart-line-total">${formatPrice(productTotal)}</p>
      </div>
      <div class="cart-group-rows">${rowsHtml}</div>
    </article>`;
  }).join("");

  const totalText = formatPrice(total);
  cartTotal.textContent = `Gesamt: ${totalText}`;
  syncDrawer(totalText, totalItems);

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
// Browser-Zurück-Taste
// ============================================================

window.addEventListener('popstate', () => {
  if (!checkoutSection.classList.contains('hidden')) {
    closeCheckout();
  } else if (document.getElementById('go-panel')?.classList.contains('go-panel--open')) {
    closeGroupPanel();
  } else if (window.goSession) {
    deactivateGoMode();
  } else if (cartDrawer.classList.contains('cart-drawer--open')) {
    closeCartDrawer();
  } else if (filterDrawer.classList.contains('filter-drawer--open')) {
    closeFilterDrawer();
  }
});
