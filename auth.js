// ============================================================
// auth.js — Supabase Auth (Login, Registrierung, Logout)
// Keine DOM-Abhängigkeiten außer auth-section + eigene Felder.
// Kommunikation mit app.js über CustomEvent "auth:changed".
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
// DOM-REFERENZEN (nur auth-eigene Elemente)
// ============================================================

const authViewLogin  = document.getElementById("auth-view-login");
const authViewReg    = document.getElementById("auth-view-register");

// Login
const authForm       = document.getElementById("auth-form");
const signupBtn      = document.getElementById("signup-btn");
const authMessage    = document.getElementById("auth-message");

// Registrierung
const registerForm      = document.getElementById("register-form");
const backToLoginBtn    = document.getElementById("back-to-login-btn");
const registerMsg       = document.getElementById("register-message");
const orgFields         = document.getElementById("org-fields");
const accountTypeRadios = document.querySelectorAll("input[name='account_type']");

// Logout + User-Menu
const logoutBtn    = document.getElementById("logout-btn");
const userMenuBtn  = document.getElementById("user-menu-btn");
const userDropdown = document.getElementById("user-dropdown");

// ============================================================
// HELPERS
// ============================================================

function setAuthMessage(text, isError = false) {
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
  setAuthMessage("");
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
    orgFields.querySelectorAll("input").forEach((inp) => { inp.required = isOrg; });
  });
});

// ============================================================
// AUTH STATE — CustomEvent an app.js
// ============================================================

async function dispatchAuthChanged(session) {
  if (session?.user) {
    const { data: profile } = await db
      .from('user_profiles')
      .select('approval_status')
      .eq('id', session.user.id)
      .single();

    if (!profile || profile.approval_status !== 'approved') {
      await db.auth.signOut();
      document.dispatchEvent(new CustomEvent("auth:changed", { detail: { session: null } }));
      return;
    }
  }

  document.dispatchEvent(new CustomEvent("auth:changed", { detail: { session } }));
}

db.auth.onAuthStateChange((_event, session) => {
  dispatchAuthChanged(session);
});

// Initialer State beim Laden
db.auth.getSession().then(({ data: { session } }) => {
  dispatchAuthChanged(session);
});

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
  setMessage("");
});

// ============================================================
// AUTH EVENT LISTENER: View-Wechsel
// ============================================================

signupBtn.addEventListener("click", () => showRegisterView());
backToLoginBtn.addEventListener("click", () => showLoginView());

// ============================================================
// AUTH EVENT LISTENER: Registrierung
// ============================================================

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email        = document.getElementById("reg-email").value.trim();
  const password     = document.getElementById("reg-password").value;
  const first_name   = document.getElementById("reg-first-name").value.trim();
  const last_name    = document.getElementById("reg-last-name").value.trim();
  const street       = document.getElementById("reg-street").value.trim();
  const postal_code  = document.getElementById("reg-postal").value.trim();
  const city         = document.getElementById("reg-city").value.trim();
  const account_type = document.querySelector("input[name='account_type']:checked")?.value || "person";

  if (!email || !password || !first_name || !last_name || !street || !postal_code || !city) {
    setRegMessage("Bitte alle Pflichtfelder ausfüllen.", true);
    return;
  }

  const metadata = { first_name, last_name, account_type, street, postal_code, city };

  if (account_type === "organization") {
    const organization_name  = document.getElementById("reg-org-name").value.trim();
    const organization_city  = document.getElementById("reg-org-city").value.trim();
    const register_number    = document.getElementById("reg-org-register").value.trim();
    const organization_email = document.getElementById("reg-org-email").value.trim();
    if (!organization_name || !organization_city || !register_number || !organization_email) {
      setRegMessage("Bitte alle Vereinsdaten ausfüllen.", true);
      return;
    }
    Object.assign(metadata, { organization_name, organization_city, register_number, organization_email });
  }

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

  if (error) { setRegMessage(error.message, true); return; }
  if (data?.user?.identities?.length === 0) {
    setRegMessage("Diese E-Mail ist bereits registriert.", true);
    return;
  }

  setRegMessage("Registrierung erfolgreich! Bitte bestätige deine E-Mail-Adresse. Danach wird dein Konto von einem Admin freigeschaltet.");
  registerForm.reset();
  orgFields.classList.add("hidden");

  // Nach 2,5 Sekunden zum Login-View zurückwechseln,
  // damit die Erfolgsmeldung noch kurz lesbar ist.
  setTimeout(() => {
    showLoginView();
    setAuthMessage("Registrierung erfolgreich. Bitte E-Mail bestätigen.");
  }, 500);
});

// ============================================================
// AUTH EVENT LISTENER: Logout
// ============================================================

logoutBtn.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) { setAuthMessage(`Fehler beim Abmelden: ${error.message}`, true); return; }
  showLoginView();
});

// ============================================================
// USER MENU DROPDOWN TOGGLE
// ============================================================

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
