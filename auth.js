// ============================================================
// auth.js — Supabase Auth & UI-State
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
// DOM-REFERENZEN
// ============================================================

const authSection    = document.getElementById("auth-section");
const authViewLogin  = document.getElementById("auth-view-login");
const authViewReg    = document.getElementById("auth-view-register");

// Login
const authForm       = document.getElementById("auth-form");
const signupBtn      = document.getElementById("signup-btn");
const authMessage    = document.getElementById("auth-message");

// Registrierung
const registerForm   = document.getElementById("register-form");
const backToLoginBtn = document.getElementById("back-to-login-btn");
const registerMsg    = document.getElementById("register-message");
const orgFields      = document.getElementById("org-fields");
const accountTypeRadios = document.querySelectorAll("input[name='account_type']");

// Shared
const logoutBtn      = document.getElementById("logout-btn");
const userBox        = document.getElementById("user-menu-email");

// ============================================================
// HELPERS
// ============================================================

function setMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#a12c45" : "#666";
}

function setRegMessage(text, isError = false) {
  registerMsg.textContent = text;
  registerMsg.style.color = isError ? "#a12c45" : "#666";
}

async function getCurrentUser() {
  const { data: { user }, error } = await db.auth.getUser();
  if (error) return null;
  return user;
}

// ============================================================
// VIEW-WECHSEL
// ============================================================

function showLoginView() {
  authViewLogin.classList.remove("hidden");
  authViewReg.classList.add("hidden");
  setMessage("");
}

function showRegisterView() {
  authViewLogin.classList.add("hidden");
  authViewReg.classList.remove("hidden");
  setRegMessage("");
}

// ============================================================
// ORGANISATIONS-FELDER TOGGLE
// ============================================================

accountTypeRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    const isOrg = document.querySelector("input[name='account_type']:checked")?.value === "organization";
    orgFields.classList.toggle("hidden", !isOrg);
    // required-Attribute setzen/entfernen
    orgFields.querySelectorAll("input").forEach((inp) => {
      inp.required = isOrg;
    });
  });
});

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
    showLoginView();
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
// AUTH EVENT LISTENER: Zur Registrierung wechseln
// ============================================================

signupBtn.addEventListener("click", () => {
  showRegisterView();
});

backToLoginBtn.addEventListener("click", () => {
  showLoginView();
});

// ============================================================
// AUTH EVENT LISTENER: Registrierung
// ============================================================

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email       = document.getElementById("reg-email").value.trim();
  const password    = document.getElementById("reg-password").value;
  const first_name  = document.getElementById("reg-first-name").value.trim();
  const last_name   = document.getElementById("reg-last-name").value.trim();
  const street      = document.getElementById("reg-street").value.trim();
  const postal_code = document.getElementById("reg-postal").value.trim();
  const city        = document.getElementById("reg-city").value.trim();
  const account_type = document.querySelector("input[name='account_type']:checked")?.value || "person";

  // Pflichtfeld-Prüfung
  if (!email || !password || !first_name || !last_name || !street || !postal_code || !city) {
    setRegMessage("Bitte alle Pflichtfelder ausfüllen.", true);
    return;
  }

  // Metadaten zusammenbauen
  const metadata = {
    first_name,
    last_name,
    account_type,
    street,
    postal_code,
    city,
  };

  // Organisationsfelder nur wenn account_type = organization
  if (account_type === "organization") {
    const organization_name  = document.getElementById("reg-org-name").value.trim();
    const organization_city  = document.getElementById("reg-org-city").value.trim();
    const register_number    = document.getElementById("reg-org-register").value.trim();
    const organization_email = document.getElementById("reg-org-email").value.trim();

    if (!organization_name || !organization_city || !register_number || !organization_email) {
      setRegMessage("Bitte alle Vereinsdaten ausfüllen.", true);
      return;
    }

    metadata.organization_name  = organization_name;
    metadata.organization_city  = organization_city;
    metadata.register_number    = register_number;
    metadata.organization_email = organization_email;
  }

  // Supabase signUp
  const submitBtn = document.getElementById("register-submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Wird registriert…";

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: "https://bestellliste.bastian-jonas.workers.dev/",
      data: metadata,
    },
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Registrieren";

  if (error) {
    setRegMessage(error.message, true);
    return;
  }

  if (data?.user?.identities?.length === 0) {
    setRegMessage("Diese E-Mail ist bereits registriert.", true);
    return;
  }

  // Erfolg
  setRegMessage("Registrierung erfolgreich! Bitte bestätige deine E-Mail-Adresse. Danach wird dein Konto von einem Admin freigeschaltet.");
  registerForm.reset();
  orgFields.classList.add("hidden");
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
