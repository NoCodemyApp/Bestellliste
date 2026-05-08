const SUPABASE_URL = "https://fniweelbmnsrdmotkmzu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q8KSsPOtjWq5u2bGStAoDg_v1WAhzMt";


const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
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
const submitOrderBtn = document.getElementById("submit-order-btn");
const cartTotal = document.getElementById("cart-total");
const orderMessage = document.getElementById("order-message");

function setOrderMessage(text, isError = false) {
  orderMessage.textContent = text;
  orderMessage.style.color = isError ? "#a12c45" : "#666";
}

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

  if (error) return null;
  return user;
}

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select(`
      *,
      product_images (
        image_id,
        image_url,
        sort_order,
        is_primary
      )
    `)
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

  productsList.innerHTML = data.map(product => {
    const images = Array.isArray(product.product_images) ? [...product.product_images] : [];

    images.sort((a, b) => {
      if (a.is_primary === b.is_primary) {
        return (a.sort_order ?? 999) - (b.sort_order ?? 999);
      }
      return a.is_primary ? -1 : 1;
    });

    const mainImage =
      images[0]?.image_url ||
      "https://via.placeholder.com/600x600?text=Kein+Bild";

    return `
      <article class="product-card">
        <a href="${product.product_url || "#"}" class="product-image-wrap" target="_blank" rel="noopener noreferrer">
          <img src="${mainImage}" alt="${product.name}">
        </a>

        <div class="product-info">
          <h3 class="product-title">${product.name}</h3>
          <p class="product-price">${formatPrice(product.price_custom)}</p>
        </div>

        <div class="product-actions">
          <label class="qty-box">
            Menge
            <input type="number" min="1" value="1" data-qty-for="${product.id}">
          </label>
          <button class="small-btn" data-add-to-cart="${product.id}">In den Warenkorb</button>
        </div>
      </article>
    `;
  }).join("");

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
    cartTotal.textContent = "";
    return [];
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
        price_custom,
        category
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    cartList.innerHTML = `<p>Fehler beim Laden des Warenkorbs: ${error.message}</p>`;
    cartTotal.textContent = "";
    return [];
  }

  if (!data || data.length === 0) {
    cartList.innerHTML = `<p>Dein Warenkorb ist noch leer.</p>`;
    cartTotal.textContent = "Gesamt: 0,00 €";
    return [];
  }

  let total = 0;

  cartList.innerHTML = data.map(item => {
    const product = item.products || {};
    const lineTotal = Number(product.price_custom || 0) * Number(item.quantity || 0);
    total += lineTotal;

    return `
      <article class="product">
        <h3>${product.name || "Produkt"}</h3>
        <p><strong>Artikelnummer:</strong> ${product.sku || "-"}</p>
        <p class="cart-meta">Menge: ${item.quantity}</p>
        <p class="cart-meta">Einzelpreis: ${formatPrice(product.price_custom)}</p>
        <p class="price">Gesamt: ${formatPrice(lineTotal)}</p>
        <button class="remove-btn small-btn" data-remove-cart="${item.id}">Entfernen</button>
      </article>
    `;
  }).join("");

  cartTotal.textContent = `Gesamt: ${formatPrice(total)}`;

  document.querySelectorAll("[data-remove-cart]").forEach(button => {
    button.addEventListener("click", async () => {
      const cartItemId = button.getAttribute("data-remove-cart");
      await removeFromCart(cartItemId);
    });
  });

  return data;
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

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setMessage(error.message, true);
    return;
  }

  if (!data?.session?.user) {
    setMessage("Login war erfolgreich, aber es wurde keine Session gefunden.", true);
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
    password,
    options: {
      emailRedirectTo: "https://bestellliste.bastian-jonas.workers.dev/"
    }
  });

  if (error) {
    setMessage(error.message, true);
    return;
  }

  if (data?.user?.identities?.length === 0) {
    setMessage("Diese E-Mail ist bereits registriert oder konnte nicht neu angelegt werden.", true);
    return;
  }

  setMessage("Registrierung erfolgreich. Bitte E-Mail bestätigen.");
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

async function submitOrder() {
  const user = await getCurrentUser();

  if (!user) {
    setOrderMessage("Du musst eingeloggt sein.", true);
    return;
  }

  const cartItems = await loadCart();

  if (!cartItems || cartItems.length === 0) {
    setOrderMessage("Dein Warenkorb ist leer.", true);
    return;
  }

  const { data: orderData, error: orderError } = await db
    .from("orders")
    .insert({
      user_id: user.id,
      status: "submitted",
      note: null
    })
    .select()
    .single();

  if (orderError || !orderData) {
    setOrderMessage(`Bestellung konnte nicht angelegt werden: ${orderError?.message || "Unbekannter Fehler"}`, true);
    return;
  }

  const itemRows = cartItems.map(item => ({
    order_id: orderData.id,
    product_id: item.product_id,
    product_name: item.products?.name || "Produkt",
    product_sku: item.products?.sku || null,
    quantity: item.quantity,
    unit_price_custom: Number(item.products?.price_custom || 0)
  }));

  const { error: itemsError } = await db
    .from("order_items")
    .insert(itemRows);

  if (itemsError) {
    setOrderMessage(`Bestellpositionen konnten nicht gespeichert werden: ${itemsError.message}`, true);
    return;
  }

  try {
    await sendOrderEmailViaEdgeFunction(orderData.id);
  } catch (mailError) {
    setOrderMessage(`Bestellung gespeichert, aber E-Mail konnte nicht gesendet werden: ${mailError.message}`, true);
    return;
  }

  const { error: clearCartError } = await db
    .from("cart_items")
    .delete()
    .eq("user_id", user.id);

  if (clearCartError) {
    setOrderMessage(`Bestellung gespeichert, aber Warenkorb nicht geleert: ${clearCartError.message}`, true);
    return;
  }

  setOrderMessage(`Bestellung erfolgreich abgesendet. Bestell-ID: ${orderData.id}`);
  await loadCart();
}
async function sendOrderEmailViaEdgeFunction(orderId) {
  const { data: sessionData } = await db.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error("Kein Access Token gefunden.");
  }

  const response = await fetch("https://fniweelbmnsrdmotkmzu.supabase.co/functions/v1/resend-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      orderId,
      recipientEmail: "bastian-jonas@gmx.net"
    })
  });

  const rawText = await response.text();
  console.log("Edge Function status:", response.status);
  console.log("Edge Function raw response:", rawText);

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${rawText}`);
  }

  return parsed;
}

submitOrderBtn.addEventListener("click", async () => {
  await submitOrder();
});

db.auth.onAuthStateChange(() => {
  setTimeout(() => {
    updateUI();
  }, 0);
});

updateUI();
