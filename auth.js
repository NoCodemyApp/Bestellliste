// ============================================================
// auth.js — Supabase Auth & UI-State
// Ausgelagert aus app.js (Refactoring)
// Abhängigkeiten: db (Supabase-Client), escapeHtml(), updateUI-Callbacks
// ============================================================

// ============================================================
// SUPABASE CLIENT
// ============================================================

const SUPABASE_URL      = "https://fniweelbmnsrdmotkmzu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nf7r95IkldTatlQk52vBpw_kbbHXeCm";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ============================================================
// HELPERS (Auth-spezifisch)
// ============================================================

function setMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#a12c45" : "#666";
}

async function getCurrentUser() {
  const { data: { user }, error } = await db.auth.getUser();
  if (error) return null;
  return user;
}

// ============================================================
// UI-STATE: Eingeloggt / Ausgeloggt
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
    await initGroupOrders();
    if (window.goSession) {
      await loadGoCart();
    } else {
      await loadCart();
    }
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
    activeFilters = { category: new Set(), supplier: new Set() };
    teardownGroupOrders();
  }
}

// ============================================================
// AUTH EVENT LISTENER: Login
// ============================================================

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

// ============================================================
// AUTH EVENT LISTENER: Registrierung
// ============================================================

signupBtn.addEventListener("click", async () => {
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) { setMessage("Bitte E-Mail und Passwort eingeben.", true); return; }
  const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: "https://bestellliste.bastian-jonas.workers.dev/" } });
  if (error) { setMessage(error.message, true); return; }
  if (data?.user?.identities?.length === 0) { setMessage("Diese E-Mail ist bereits registriert oder konnte nicht neu angelegt werden.", true); return; }
  setMessage("Registrierung erfolgreich. Bitte E-Mail bestaetigen.");
});

// ============================================================
// AUTH EVENT LISTENER: Logout
// ============================================================

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

// ============================================================
// AUTH STATE CHANGE + INITIALISIERUNG
// ============================================================

db.auth.onAuthStateChange(() => { setTimeout(() => { updateUI(); }, 0); });

updateUI();
