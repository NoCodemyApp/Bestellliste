const SUPABASE_URL = "https://fniweelbmnsrdmotkmzu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_CAA83P2b6hQwkz_dxpUwlw_LHEoAM1y";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authSection = document.getElementById("auth-section");
const productsSection = document.getElementById("products-section");
const authForm = document.getElementById("auth-form");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");
const authMessage = document.getElementById("auth-message");
const userBox = document.getElementById("user-box");
const productsList = document.getElementById("products-list");

function setMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#a12c45" : "#666";
}

function formatPrice(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(value || 0);
}

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    productsList.innerHTML = `<p>Fehler beim Laden der Produkte: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    productsList.innerHTML = `<p>Noch keine Produkte vorhanden.</p>`;
    return;
  }

  productsList.innerHTML = data.map(product => `
    <article class="product">
      <h3>${product.name}</h3>
      <p><strong>Artikelnummer:</strong> ${product.sku || "-"}</p>
      <p><strong>Kategorie:</strong> ${product.category || "-"}</p>
      <p class="price">${formatPrice(product.price_eur)}</p>
      ${product.product_url ? `<p><a href="${product.product_url}" target="_blank" rel="noopener noreferrer">Produktlink öffnen</a></p>` : ""}
    </article>
  `).join("");
}

async function updateUI() {
  const {
    data: { session },
    error
  } = await db.auth.getSession();

  if (error) {
    setMessage(`Sitzung konnte nicht geladen werden: ${error.message}`, true);
    return;
  }

  if (session?.user) {
    authSection.classList.add("hidden");
    productsSection.classList.remove("hidden");
    userBox.textContent = session.user.email || "";
    await loadProducts();
  } else {
    authSection.classList.remove("hidden");
    productsSection.classList.add("hidden");
    userBox.textContent = "";
    productsList.innerHTML = "";
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    setMessage("Bitte E-Mail und Passwort eingeben.", true);
    return;
  }

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setMessage(error.message, true);
    return;
  }

  setMessage("Login erfolgreich.");
  await updateUI();
});

signupBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    setMessage("Bitte E-Mail und Passwort eingeben.", true);
    return;
  }

  const { data, error } = await db.auth.signUp({
    email,
    password
  });

  if (error) {
    setMessage(error.message, true);
    return;
  }

  if (data?.user?.identities?.length === 0) {
    setMessage("Diese E-Mail ist bereits registriert oder konnte nicht neu angelegt werden.", true);
    return;
  }

  setMessage("Registrierung erfolgreich. Das Profil wird automatisch im Hintergrund angelegt. Bitte E-Mail bestätigen, falls Supabase das verlangt.");
});

logoutBtn.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    setMessage(`Fehler beim Abmelden: ${error.message}`, true);
    return;
  }

  setMessage("Abgemeldet.");
  await updateUI();
});

db.auth.onAuthStateChange(async () => {
  await updateUI();
});

updateUI();
