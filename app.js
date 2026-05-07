const SUPABASE_URL = "https://fniweelbmnsrdmotkmzu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q8KSsPOtjWq5u2bGStAoDg_v1WAhzMt";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const authSection = document.getElementById("auth-section");
const productsSection = document.getElementById("products-section");
const cartSection = document.getElementById("cart-section");
const authForm = document.getElementById("auth-form");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");
const authMessage = document.getElementById("auth-message");
const userBox = document.getElementById("user-box");
const productsList = document.getElementById("products-list");
const cartList = document.getElementById("cart-list");

function setMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#a12c45" : "#666";
}

function formatPrice(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await db.auth.getUser();

  if (error) {
    return null;
  }

  return user;
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
      <div class="product-actions">
        <label class="qty-box">
          Menge
          <input type="number" min="1" value="1" data-qty-for="${product.id}">
        </label>
        <button class="small-btn" data-add-to-cart="${product.id}">In den Warenkorb</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-add-to-cart]").forEach(button => {
    button.addEventListener("click", async () => {
      const productId = button.getAttribute("data-add-to-cart");
      const qtyInput = document.querySelector(`[data-qty-for="${productId}"]`);
      const quantity = Number(qtyInput?.value || 1);

      if (!quantity || quantity < 1) {
        setMessage("Bitte eine gültige Menge eingeben.", true);
        return;
      }

      await addToCart(productId, quantity);
    });
  });
}

async function addToCart(productId, quantity) {
  const user = await getCurrentUser();

  if (!user) {
    setMessage("Du musst eingeloggt sein.", true);
    return;
  }

  const { error } = await db
    .from("cart_items")
    .upsert(
      {
        user_id: user.id,
        product_id: productId,
        quantity
      },
      {
        onConflict: "user_id,product_id"
      }
    );

  if (error) {
    setMessage(`Fehler beim Speichern im Warenkorb: ${error.message}`, true);
    return;
  }

  setMessage("Produkt zum Warenkorb hinzugefügt.");
  await loadCart();
}

async function loadCart() {
  const user = await getCurrentUser();

  if (!user) {
    cartList.innerHTML = "";
    return;
  }

  const { data, error } = await db
    .from("cart_items")
    .select(`
      id,
      quantity,
      product_id,
      products (
        id,
        name,
        sku,
        price_eur,
        category
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    cartList.innerHTML = `<p>Fehler beim Laden des Warenkorbs: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    cartList.innerHTML = `<p>Dein Warenkorb ist noch leer.</p>`;
    return;
  }

  cartList.innerHTML = data.map(item => {
    const product = item.products || {};
    const lineTotal = Number(product.price_eur || 0) * Number(item.quantity || 0);

    return `
      <article class="product">
        <h3>${product.name || "Produkt"}</h3>
        <p><strong>Artikelnummer:</strong> ${product.sku || "-"}</p>
        <p class="cart-meta">Menge: ${item.quantity}</p>
        <p class="cart-meta">Einzelpreis: ${formatPrice(product.price_eur)}</p>
        <p class="price">Gesamt: ${formatPrice(lineTotal)}</p>
        <button class="remove-btn small-btn" data-remove-cart="${item.id}">Entfernen</button>
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-remove-cart]").forEach(button => {
    button.addEventListener("click", async () => {
      const cartItemId = button.getAttribute("data-remove-cart");
      await removeFromCart(cartItemId);
    });
  });
}

async function removeFromCart(cartItemId) {
  const { error } = await db
    .from("cart_items")
    .delete()
    .eq("id", cartItemId);

  if (error) {
    setMessage(`Fehler beim Entfernen: ${error.message}`, true);
    return;
  }

  setMessage("Produkt aus dem Warenkorb entfernt.");
  await loadCart();
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
    cartSection.classList.remove("hidden");
    userBox.textContent = session.user.email || "";
    await loadProducts();
    await loadCart();
  } else {
    authSection.classList.remove("hidden");
    productsSection.classList.add("hidden");
    cartSection.classList.add("hidden");
    userBox.textContent = "";
    productsList.innerHTML = "";
    cartList.innerHTML = "";
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

db.auth.onAuthStateChange(() => {
  setTimeout(() => {
    updateUI();
  }, 0);
});

updateUI();
