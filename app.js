// ============================================================
// BESTELLLISTE — app.js
// Supabase-Client, Auth, Produkte, Warenkorb, Drawer-Logik
// ============================================================
const SUPABASE_URL     = 'https://nf7r95ikldat1qk52vbpw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nf7r95IkldTatlQk52vBpw_kbbHXeCm';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// UTILS
// ============================================================
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatPrice(cents) {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function setMessage(msg, isError = false, el = null) {
  const target = el || document.getElementById('order-message');
  if (!target) return;
  target.textContent = msg;
  target.className   = isError ? 'order-message error' : 'order-message success';
}

async function getCurrentUser() {
  const { data: { user } } = await db.auth.getUser();
  return user || null;
}

// ============================================================
// AUTH
// ============================================================
let authStateProcessed = false;

document.addEventListener('DOMContentLoaded', () => {
  db.auth.onAuthStateChange(async (_event, session) => {
    if (authStateProcessed && _event === 'INITIAL_SESSION') return;
    authStateProcessed = true;

    const user = session?.user ?? null;
    if (user) {
      await onUserLoggedIn(user);
    } else {
      onUserLoggedOut();
    }
  });

  setupAuthForm();
  setupLogout();
  setupUserMenu();
});

function setupAuthForm() {
  const form       = document.getElementById('auth-form');
  const loginBtn   = document.getElementById('login-btn');
  const signupBtn  = document.getElementById('signup-btn');
  const msgEl      = document.getElementById('auth-message');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    loginBtn.disabled  = true;
    loginBtn.textContent = 'Einloggen…';
    msgEl.textContent  = '';

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      msgEl.textContent  = error.message;
      msgEl.className    = 'auth-message error';
      loginBtn.disabled  = false;
      loginBtn.textContent = 'Einloggen';
    }
  });

  signupBtn?.addEventListener('click', async () => {
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    signupBtn.disabled   = true;
    signupBtn.textContent = 'Registrieren…';
    msgEl.textContent    = '';

    const { error } = await db.auth.signUp({ email, password });
    if (error) {
      msgEl.textContent    = error.message;
      msgEl.className      = 'auth-message error';
    } else {
      msgEl.textContent    = 'Bestätigungs-E-Mail gesendet. Bitte prüfe dein Postfach.';
      msgEl.className      = 'auth-message success';
    }
    signupBtn.disabled   = false;
    signupBtn.textContent = 'Neu registrieren';
  });
}

function setupLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await db.auth.signOut();
  });
}

function setupUserMenu() {
  const btn      = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!isOpen));
    dropdown.setAttribute('aria-hidden',  String(isOpen));
    dropdown.classList.toggle('open', !isOpen);
  });

  document.addEventListener('click', () => {
    btn.setAttribute('aria-expanded', 'false');
    dropdown.setAttribute('aria-hidden', 'true');
    dropdown.classList.remove('open');
  });
}

async function onUserLoggedIn(user) {
  document.getElementById('auth-section')?.classList.add('hidden');
  document.getElementById('products-section')?.classList.remove('hidden');

  const emailEl = document.getElementById('user-menu-email');
  if (emailEl) emailEl.textContent = user.email;
  document.getElementById('user-menu-btn')?.classList.remove('hidden');
  document.getElementById('logout-btn')?.classList.remove('hidden');
  document.getElementById('cart-badge-btn')?.classList.remove('hidden');

  const dropdownEmail = document.getElementById('user-dropdown-email');
  if (dropdownEmail) dropdownEmail.textContent = user.email;

  await Promise.all([
    loadProducts(),
    fetchCartItems(),
  ]);

  if (typeof initGroupOrders === 'function') await initGroupOrders();
  if (typeof loadGoCart      === 'function') await loadGoCart();

  setupCartEvents();
  setupCheckoutBtn();
  setupFilterFab();
}

function onUserLoggedOut() {
  document.getElementById('auth-section')?.classList.remove('hidden');
  document.getElementById('products-section')?.classList.add('hidden');
  document.getElementById('user-menu-btn')?.classList.add('hidden');
  document.getElementById('logout-btn')?.classList.add('hidden');
  document.getElementById('cart-badge-btn')?.classList.add('hidden');

  cartItems = {};
  renderCartItemsList();
  updateCartBadge();

  if (typeof teardownGroupOrders === 'function') teardownGroupOrders();
}

// ============================================================
// PRODUKTE
// ============================================================
let allProducts  = [];
let categories   = [];
let suppliers    = [];
let activeFilters = { categories: new Set(), suppliers: new Set() };

async function loadProducts() {
  const { data, error } = await db
    .from('products')
    .select('id, name, price, unit, category, supplier_id, supplier_name, supplier_logo, image_url, note')
    .eq('active', true)
    .order('supplier_name', { ascending: true })
    .order('category',      { ascending: true })
    .order('name',          { ascending: true });

  if (error) { console.error('Produkte laden:', error); return; }

  allProducts = data || [];
  categories  = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
  suppliers   = [...new Set(allProducts.map(p => p.supplier_name).filter(Boolean))].sort();

  renderFilterChips();
  renderProducts();
}

function renderProducts() {
  const grid  = document.getElementById('products-list');
  const empty = document.getElementById('products-empty');
  if (!grid) return;

  const filtered = allProducts.filter(p => {
    const catOK = activeFilters.categories.size === 0 || activeFilters.categories.has(p.category);
    const supOK = activeFilters.suppliers.size  === 0 || activeFilters.suppliers.has(p.supplier_name);
    return catOK && supOK;
  });

  if (empty) empty.classList.toggle('hidden', filtered.length > 0);

  grid.innerHTML = filtered.map(p => {
    const qty    = cartItems[p.id]?.qty  ?? 0;
    const inCart = qty > 0;
    return `
    <article class="product-card${inCart ? ' in-cart' : ''}" data-id="${p.id}">
      <div class="product-img-wrap">
        ${p.image_url
          ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="product-img" loading="lazy">`
          : `<div class="product-img-placeholder" aria-hidden="true"></div>`}
      </div>
      <div class="product-body">
        <div class="product-meta">
          ${p.supplier_logo
            ? `<img src="${escapeHtml(p.supplier_logo)}" alt="${escapeHtml(p.supplier_name)}" class="supplier-logo" loading="lazy">`
            : `<span class="supplier-name-text">${escapeHtml(p.supplier_name ?? '')}</span>`}
          <span class="product-category">${escapeHtml(p.category ?? '')}</span>
        </div>
        <h3 class="product-name">${escapeHtml(p.name)}</h3>
        ${p.note ? `<p class="product-note">${escapeHtml(p.note)}</p>` : ''}
        <div class="product-footer">
          <span class="product-price">${formatPrice(p.price)}<span class="product-unit"> / ${escapeHtml(p.unit ?? 'Stk.')}</span></span>
          <div class="product-qty-control" role="group" aria-label="Menge für ${escapeHtml(p.name)}">
            <button class="qty-btn qty-dec" data-id="${p.id}" aria-label="Menge verringern" ${qty === 0 ? 'disabled' : ''}>−</button>
            <span class="qty-value" data-id="${p.id}">${qty}</span>
            <button class="qty-btn qty-inc" data-id="${p.id}" aria-label="Menge erhöhen">+</button>
          </div>
        </div>
      </div>
    </article>`;
  }).join('');
}

// ============================================================
// FILTER
// ============================================================
function renderFilterChips() {
  renderChipGroup('filter-chips-category',        categories,  'categories');
  renderChipGroup('filter-chips-supplier',        suppliers,   'suppliers');
  renderChipGroup('filter-chips-category-mobile', categories,  'categories');
  renderChipGroup('filter-chips-supplier-mobile', suppliers,   'suppliers');
  renderActiveFilterBar();
}

function renderChipGroup(containerId, items, filterKey) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map(item => {
    const active = activeFilters[filterKey].has(item);
    return `<button class="filter-chip${active ? ' active' : ''}" data-key="${filterKey}" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`;
  }).join('');

  el.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const val = btn.dataset.value;
      if (activeFilters[key].has(val)) activeFilters[key].delete(val);
      else                             activeFilters[key].add(val);
      renderFilterChips();
      renderProducts();
      updateFilterBadges();
    });
  });
}

function renderActiveFilterBar() {
  const bar = document.getElementById('active-filter-bar');
  if (!bar) return;
  const all = [
    ...[...activeFilters.categories].map(v => ({ key: 'categories', val: v })),
    ...[...activeFilters.suppliers ].map(v => ({ key: 'suppliers',  val: v })),
  ];
  bar.classList.toggle('hidden', all.length === 0);
  bar.innerHTML = all.map(({ key, val }) =>
    `<button class="active-filter-tag" data-key="${key}" data-value="${escapeHtml(val)}">${escapeHtml(val)} ×</button>`
  ).join('');
  bar.querySelectorAll('.active-filter-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilters[btn.dataset.key].delete(btn.dataset.value);
      renderFilterChips();
      renderProducts();
      updateFilterBadges();
    });
  });
}

function updateFilterBadges() {
  const count = activeFilters.categories.size + activeFilters.suppliers.size;
  ['filter-active-count', 'filter-fab-count'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
  });
}

function setupFilterResetBtns() {
  ['filter-reset-btn-desktop', 'filter-reset-btn-mobile'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      activeFilters.categories.clear();
      activeFilters.suppliers.clear();
      renderFilterChips();
      renderProducts();
      updateFilterBadges();
    });
  });
}

function setupFilterToggle() {
  const toggleBtn = document.getElementById('filter-toggle-btn');
  const sidebar   = document.getElementById('shop-sidebar-desktop');
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });
}

function setupFilterFab() {
  const fab         = document.getElementById('filter-fab');
  const drawer      = document.getElementById('filter-drawer');
  const closeBtn    = document.getElementById('filter-drawer-close');
  const applyBtn    = document.getElementById('filter-apply-btn');
  const overlay     = document.getElementById('cart-overlay');

  if (!fab || !drawer) return;

  fab.classList.remove('hidden');
  fab.removeAttribute('aria-hidden');

  function openFilterDrawer() {
    drawer.classList.add('open');
    drawer.removeAttribute('aria-hidden');
    overlay?.classList.add('active');
  }

  function closeFilterDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay?.classList.remove('active');
  }

  fab.addEventListener('click', openFilterDrawer);
  closeBtn?.addEventListener('click', closeFilterDrawer);
  applyBtn?.addEventListener('click', closeFilterDrawer);
  overlay?.addEventListener('click', closeFilterDrawer);

  setupFilterResetBtns();
  setupFilterToggle();
}

// ============================================================
// WARENKORB STATE
// ============================================================
let cartItems = {}; // { productId: { qty, name, price, unit } }

async function fetchCartItems() {
  const user = await getCurrentUser();
  if (!user) return;

  const { data, error } = await db
    .from('cart_items')
    .select('product_id, quantity, products(name, price, unit)')
    .eq('user_id', user.id);

  if (error) { console.error('Cart laden:', error); return; }

  cartItems = {};
  (data || []).forEach(row => {
    cartItems[row.product_id] = {
      qty:   row.quantity,
      name:  row.products?.name  ?? '?',
      price: row.products?.price ?? 0,
      unit:  row.products?.unit  ?? 'Stk.',
    };
  });

  renderCartItemsList();
  updateCartBadge();
  renderProducts();
}

// ============================================================
// WARENKORB RENDER
// ============================================================
function renderCartItemsList() {
  const cartList      = document.getElementById('cart-list');
  const cartTotal     = document.getElementById('cart-total');
  const cartSection   = document.getElementById('cart-section');
  const drawerBody    = document.querySelector('.cart-drawer-body');
  const drawerTotal   = document.getElementById('cart-drawer-total');
  const drawerCount   = document.getElementById('cart-drawer-item-count');
  const drawerMessage = document.getElementById('cart-drawer-message');

  const entries  = Object.entries(cartItems).filter(([, v]) => v.qty > 0);
  const total    = entries.reduce((s, [, v]) => s + v.price * v.qty, 0);
  const hasItems = entries.length > 0;

  if (cartSection)  cartSection.classList.toggle('hidden', !hasItems);
  if (cartTotal)    cartTotal.textContent = formatPrice(total);
  if (drawerTotal)  drawerTotal.textContent = formatPrice(total);
  if (drawerCount)  drawerCount.textContent = entries.reduce((s, [, v]) => s + v.qty, 0);
  if (drawerMessage) drawerMessage.textContent = '';

  const itemsHtml = hasItems
    ? entries.map(([id, v]) => `
      <div class="cart-item" data-id="${id}">
        <div class="cart-item-info">
          <span class="cart-item-name">${escapeHtml(v.name)}</span>
          <span class="cart-item-unit">${escapeHtml(v.unit)}</span>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn qty-dec" data-id="${id}" aria-label="Menge verringern">−</button>
          <span class="qty-value">${v.qty}</span>
          <button class="qty-btn qty-inc" data-id="${id}" aria-label="Menge erhöhen">+</button>
          <span class="cart-item-price">${formatPrice(v.price * v.qty)}</span>
          <button class="cart-item-remove" data-id="${id}" aria-label="${escapeHtml(v.name)} entfernen">×</button>
        </div>
      </div>`).join('')
    : '<p class="cart-empty">Dein Warenkorb ist leer.</p>';

  if (cartList) {
    cartList.innerHTML = itemsHtml;
    cartList.removeEventListener('click', handleCartListClick);
    cartList.addEventListener('click', handleCartListClick);
  }
  if (drawerBody) {
    drawerBody.innerHTML = itemsHtml;
    drawerBody.removeEventListener('click', handleCartListClick);
    drawerBody.addEventListener('click', handleCartListClick);
  }
}

function handleCartListClick(e) {
  const incBtn    = e.target.closest('.qty-inc');
  const decBtn    = e.target.closest('.qty-dec');
  const removeBtn = e.target.closest('.cart-item-remove');

  if (incBtn)    changeQty(incBtn.dataset.id,    1);
  if (decBtn)    changeQty(decBtn.dataset.id,   -1);
  if (removeBtn) removeFromCart(removeBtn.dataset.id);
}

function updateCartBadge() {
  const total = Object.values(cartItems).reduce((s, v) => s + (v.qty || 0), 0);
  const badge = document.getElementById('cart-badge-count');
  if (badge) badge.textContent = total;
}

// ============================================================
// CART EVENTS (Produkt-Grid)
// ============================================================
function setupCartEvents() {
  const grid = document.getElementById('products-list');
  if (!grid) return;
  grid.addEventListener('click', e => {
    const inc = e.target.closest('.qty-inc');
    const dec = e.target.closest('.qty-dec');
    if (inc) changeQty(inc.dataset.id,  1);
    if (dec) changeQty(dec.dataset.id, -1);
  });
}

// ============================================================
// MENGE ÄNDERN / ENTFERNEN
// ============================================================
async function changeQty(productId, delta) {
  const user = await getCurrentUser();
  if (!user) return;

  const current = cartItems[productId]?.qty ?? 0;
  const newQty  = Math.max(0, current + delta);

  if (newQty === 0) {
    await removeFromCart(productId);
    return;
  }

  const product = allProducts.find(p => p.id == productId);
  if (!product) return;

  const { error } = await db.from('cart_items').upsert(
    { user_id: user.id, product_id: productId, quantity: newQty },
    { onConflict: 'user_id,product_id' }
  );

  if (error) { setMessage('Fehler beim Aktualisieren.', true); return; }

  cartItems[productId] = {
    qty:   newQty,
    name:  product.name,
    price: product.price,
    unit:  product.unit ?? 'Stk.',
  };

  renderCartItemsList();
  updateCartBadge();
  renderProducts();
  syncDrawer();
}

async function removeFromCart(productId) {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await db.from('cart_items')
    .delete()
    .eq('user_id', user.id)
    .eq('product_id', productId);

  if (error) { setMessage('Fehler beim Entfernen.', true); return; }

  delete cartItems[productId];
  renderCartItemsList();
  updateCartBadge();
  renderProducts();
  syncDrawer();
}

// ============================================================
// GO-CART: ENTFERNEN (abgesichert mit user_id)
// ============================================================
async function removeFromGoCart(goCartItemId) {
  const user = await getCurrentUser();
  if (!user) return;
  const { error } = await db.from('group_order_cart').delete().eq('id', goCartItemId).eq('user_id', user.id);
  if (error) { setMessage(`Fehler beim Entfernen: ${error.message}`, true); return; }
  if (typeof loadGoCart === 'function') await loadGoCart();
}

// ============================================================
// GO-CART: BADGE + RENDER
// ============================================================
async function loadGoCart() {
  const user = await getCurrentUser();
  if (!user) return;

  const sess = window.goSession;

  const { data, error } = await db
    .from('group_order_cart')
    .select('id, quantity, products(id, name, price, unit)')
    .eq('user_id', user.id)
    .eq('group_order_id', sess?.groupOrderId ?? null);

  if (error) { console.error('GO-Cart laden:', error); return; }

  const items   = data || [];
  const cartList = document.getElementById('cart-list');
  const cartTotal = document.getElementById('cart-total');

  const total = items.reduce((s, r) => s + (r.products?.price ?? 0) * r.quantity, 0);

  if (cartList) {
    cartList.innerHTML = items.length
      ? items.map(r => `
        <div class="cart-item" data-go-id="${r.id}">
          <div class="cart-item-info">
            <span class="cart-item-name">${escapeHtml(r.products?.name ?? '?')}</span>
            <span class="cart-item-unit">${escapeHtml(r.products?.unit ?? 'Stk.')}</span>
          </div>
          <div class="cart-item-controls">
            <span class="qty-value">${r.quantity}</span>
            <span class="cart-item-price">${formatPrice((r.products?.price ?? 0) * r.quantity)}</span>
            <button class="cart-item-remove" data-go-id="${r.id}" aria-label="Entfernen">×</button>
          </div>
        </div>`).join('')
      : '<p class="cart-empty">Dein GO-Warenkorb ist leer.</p>';

    cartList.removeEventListener('click', handleGoCartClick);
    cartList.addEventListener('click', handleGoCartClick);
  }

  if (cartTotal) cartTotal.textContent = formatPrice(total);
  updateCartBadge();
}

function handleGoCartClick(e) {
  const removeBtn = e.target.closest('.cart-item-remove[data-go-id]');
  if (removeBtn) removeFromGoCart(removeBtn.dataset.goId);
}

// ============================================================
// DRAWER
// ============================================================
function syncDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer || !drawer.classList.contains('open')) return;
  const drawerBody  = drawer.querySelector('.cart-drawer-body');
  const drawerTotal = document.getElementById('cart-drawer-total');
  if (!drawerBody) return;

  const entries = Object.entries(cartItems).filter(([, v]) => v.qty > 0);
  const total   = entries.reduce((s, [, v]) => s + v.price * v.qty, 0);
  if (drawerTotal) drawerTotal.textContent = formatPrice(total);

  drawerBody.innerHTML = entries.length
    ? entries.map(([id, v]) => `
      <div class="cart-item" data-id="${id}">
        <div class="cart-item-info">
          <span class="cart-item-name">${escapeHtml(v.name)}</span>
          <span class="cart-item-unit">${escapeHtml(v.unit)}</span>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn qty-dec" data-id="${id}" aria-label="Menge verringern">−</button>
          <span class="qty-value">${v.qty}</span>
          <button class="qty-btn qty-inc" data-id="${id}" aria-label="Menge erhöhen">+</button>
          <span class="cart-item-price">${formatPrice(v.price * v.qty)}</span>
          <button class="cart-item-remove" data-id="${id}" aria-label="${escapeHtml(v.name)} entfernen">×</button>
        </div>
      </div>`).join('')
    : '<p class="cart-empty">Dein Warenkorb ist leer.</p>';

  drawerBody.removeEventListener('click', handleCartListClick);
  drawerBody.addEventListener('click', handleCartListClick);
}

function setupCartDrawer() {
  const badgeBtn  = document.getElementById('cart-badge-btn');
  const drawer    = document.getElementById('cart-drawer');
  const closeBtn  = document.getElementById('cart-drawer-close');
  const overlay   = document.getElementById('cart-overlay');
  const submitBtn = document.getElementById('cart-drawer-submit');

  if (!drawer) return;

  function openDrawer() {
    syncDrawer();
    drawer.classList.add('open');
    drawer.removeAttribute('aria-hidden');
    overlay?.classList.add('active');
    badgeBtn?.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay?.classList.remove('active');
    badgeBtn?.setAttribute('aria-expanded', 'false');
  }

  badgeBtn?.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer();
  });
  closeBtn?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);

  submitBtn?.addEventListener('click', () => {
    closeDrawer();
    openCheckout();
  });
}

// ============================================================
// CHECKOUT
// ============================================================
function setupCheckoutBtn() {
  document.getElementById('open-checkout-btn')?.addEventListener('click', openCheckout);
  document.getElementById('checkout-back-btn')?.addEventListener('click', closeCheckout);
  setupCartDrawer();

  document.getElementById('submit-order-btn')?.addEventListener('click', submitOrder);
}

function openCheckout() {
  document.getElementById('products-section')?.classList.add('hidden');
  document.getElementById('checkout-section')?.classList.remove('hidden');
  if (typeof renderCheckout === 'function') renderCheckout();
}

function closeCheckout() {
  document.getElementById('checkout-section')?.classList.add('hidden');
  document.getElementById('products-section')?.classList.remove('hidden');
}

async function submitOrder() {
  const user = await getCurrentUser();
  if (!user) return;

  const entries = Object.entries(cartItems).filter(([, v]) => v.qty > 0);
  if (entries.length === 0) {
    setMessage('Dein Warenkorb ist leer.', true);
    return;
  }

  const btn = document.getElementById('submit-order-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Wird gesendet…'; }

  const orderItems = entries.map(([productId, v]) => ({
    user_id:    user.id,
    product_id: productId,
    quantity:   v.qty,
    price:      v.price,
  }));

  const { error } = await db.from('orders').insert(orderItems);

  if (error) {
    setMessage(`Fehler: ${error.message}`, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Bestellung absenden'; }
    return;
  }

  // Cart in DB leeren
  await db.from('cart_items').delete().eq('user_id', user.id);

  cartItems = {};
  renderCartItemsList();
  updateCartBadge();
  renderProducts();
  closeCheckout();
  setMessage('Bestellung erfolgreich abgesendet! ✓', false);

  if (btn) { btn.disabled = false; btn.textContent = 'Bestellung absenden'; }

  setTimeout(() => {
    const msgEl = document.getElementById('order-message');
    if (msgEl) msgEl.textContent = '';
  }, 5000);
}
