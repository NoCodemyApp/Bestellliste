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

const authSection     = document.getElementById("auth-section");
const pendingSection  = document.getElementById("pending-section");
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

// ============================================================
// UI-STATE: Reagiert auf auth:changed von auth.js
// 3 Zustände: !session → Auth | pending → Pending | approved → App
// ============================================================

function resetAppState() {
  document.getElementById("logout-btn").classList.add("hidden");
  userBox.textContent = "";
  document.getElementById("user-menu-btn").classList.add("hidden");
  document.getElementById("user-dropdown-email").textContent = "";
  productsList.innerHTML = "";
  cartList.innerHTML = "";
  updateCartBadge(0);
  allProducts = [];
  activeFilters = { category: new Set(), supplier: new Set() };
  if (typeof teardownGroupOrders === "function") teardownGroupOrders();
}

document.addEventListener("auth:changed", async ({ detail: { session, approvalStatus } }) => {

  // ── Zustand 1: Nicht eingeloggt ──────────────────────────
  if (!session) {
    authSection.classList.remove("hidden");
    pendingSection.classList.add("hidden");
    productsSection.classList.add("hidden");
    cartSection.classList.add("hidden");
    checkoutSection.classList.add("hidden");
    resetAppState();
    return;
  }

  // ── Zustand 2: Eingeloggt, aber nicht freigegeben ────────
  if (approvalStatus !== "approved") {
    authSection.classList.add("hidden");
    pendingSection.classList.remove("hidden");
    productsSection.classList.add("hidden");
    cartSection.classList.add("hidden");
    checkoutSection.classList.add("hidden");
    // E-Mail im Pending-View anzeigen
    const pendingEmail = document.getElementById("pending-email");
    if (pendingEmail) pendingEmail.textContent = session.user.email || "";
    resetAppState();
    return;
  }

  // ── Zustand 3: Eingeloggt + approved ─────────────────────
  authSection.classList.add("hidden");
  pendingSection.classList.add("hidden");
  productsSection.classList.remove("hidden");
  cartSection.classList.remove("hidden");
  document.getElementById("logout-btn").classList.remove("hidden");
  userBox.textContent = session.user.email || "";
  document.getElementById("user-menu-btn").classList.remove("hidden");
  document.getElementById("user-dropdown-email").textContent = session.user.email || "";
  await loadProducts();
  await initGroupOrders();
  if (window.goSession) {
    await loadGoCart();
  } else {
    await loadCart();
  }
});
