// ============================================================
// GROUP ORDERS — group-order.js
// Abhängigkeiten: db, getCurrentUser, escapeHtml (aus app.js)
// Tabelle: group_orders (id, created_by, deadline, status, title, created_at)
//          title = Lieferantenname (kein separates supplier-Feld nötig)
// ============================================================

let activeGroupOrders = [];
let groupOrderChannel  = null;

// Banner-interne Fehlermeldung (ersetzt alert())
function showBannerError(message) {
  let el = document.getElementById("go-banner-error");
  if (!el) {
    el = document.createElement("p");
    el.id = "go-banner-error";
    el.style.cssText = "color:#a12c45;font-size:0.85rem;margin:4px 0 0;";
    const banner = document.getElementById("group-order-banner");
    if (banner) banner.appendChild(el);
  }
  el.textContent = message;
  setTimeout(() => { if (el) el.textContent = ""; }, 4000);
}

// ============================================================
// INIT / TEARDOWN
// ============================================================

async function initGroupOrders() {
  await autoCloseExpiredOrders();
  await loadActiveGroupOrders();
  subscribeGroupOrders();
}

function teardownGroupOrders() {
  activeGroupOrders = [];
  if (groupOrderChannel) {
    db.removeChannel(groupOrderChannel);
    groupOrderChannel = null;
  }
  renderGroupOrderBanner([]);
  const btn = document.getElementById("create-group-order-btn");
  if (btn) btn.classList.add("hidden");
}

// ============================================================
// AUTO-CLOSE (clientseitig beim Laden)
// HINWEIS: Idealerweise durch DB-Trigger / pg_cron ersetzen.
// ============================================================

async function autoCloseExpiredOrders() {
  const now = new Date().toISOString();
  const { error } = await db
    .from("group_orders")
    .update({ status: "closed" })
    .eq("status", "open")
    .lt("deadline", now);

  if (error) console.warn("Auto-Close Fehler:", error.message);
}

// ============================================================
// LOAD
// ============================================================

async function loadActiveGroupOrders() {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("group_orders")
    .select("id, title, deadline, status, created_by, created_at")
    .eq("status", "open")
    .gt("deadline", now)
    .order("deadline", { ascending: true });

  if (error) {
    console.error("Fehler beim Laden der Sammelbestellungen:", error.message);
    activeGroupOrders = [];
  } else {
    activeGroupOrders = data || [];
  }

  renderGroupOrderBanner(activeGroupOrders);
  renderCreateGroupOrderButton(true);
}

// ============================================================
// REALTIME
// ============================================================

function subscribeGroupOrders() {
  if (groupOrderChannel) db.removeChannel(groupOrderChannel);

  groupOrderChannel = db
    .channel("group_orders_realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_orders" },
      async () => {
        await autoCloseExpiredOrders();
        await loadActiveGroupOrders();
      }
    )
    .subscribe();
}

// ============================================================
// RENDER BANNER
// ============================================================

function renderGroupOrderBanner(orders) {
  let banner = document.getElementById("group-order-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "group-order-banner";
    const productsSection = document.getElementById("products-section");
    productsSection?.parentNode?.insertBefore(banner, productsSection);
  }

  if (!orders || orders.length === 0) {
    banner.innerHTML = "";
    banner.classList.remove("group-order-banner--active");
    return;
  }

  banner.classList.add("group-order-banner--active");

  if (orders.length === 1) {
    const o = orders[0];
    const dateStr = formatDeadline(o.deadline);

    banner.innerHTML = `
      <div class="go-banner-single">
        <span class="go-banner-text">
          <strong>${escapeHtml(o.title || "Sammelbestellung")}</strong> — Endet ${escapeHtml(dateStr)}
        </span>
        <div class="go-banner-actions">
          <button class="go-join-btn" data-join-id="${escapeHtml(String(o.id))}" type="button">Mitmachen</button>
          <button class="go-undo-btn hidden" data-undo-id="${escapeHtml(String(o.id))}" type="button">Rükgängig</button>
          <button class="go-edit-btn" data-edit-id="${escapeHtml(String(o.id))}"
            data-edit-title="${escapeAttr(o.title || '')}"
            data-edit-deadline="${escapeAttr(o.deadline)}"
            type="button" aria-label="Sammelbestellung bearbeiten">✏️</button>
        </div>
      </div>
      <p id="go-banner-error" style="color:#a12c45;font-size:0.85rem;margin:4px 0 0;"></p>`;
  } else {
    const rows = orders.map(o => {
      const dateStr = formatDeadline(o.deadline);
      return `
        <li class="go-banner-row">
          <div class="go-banner-row-info">
            <button class="go-join-btn" data-join-id="${escapeHtml(String(o.id))}" type="button">${escapeHtml(o.title || "Sammelbestellung")}</button>
            <button class="go-undo-btn hidden" data-undo-id="${escapeHtml(String(o.id))}" type="button">Rükgängig</button>
            <span class="go-banner-date">Endet ${escapeHtml(dateStr)}</span>
          </div>
          <button class="go-edit-btn" data-edit-id="${escapeHtml(String(o.id))}"
            data-edit-title="${escapeAttr(o.title || '')}"
            data-edit-deadline="${escapeAttr(o.deadline)}"
            type="button" aria-label="${escapeAttr(o.title || 'Sammelbestellung')} bearbeiten">✏️</button>
        </li>`;
    }).join("");

    banner.innerHTML = `
      <p class="go-banner-multi-title">Aktive Sammelbestellungen:</p>
      <ul class="go-banner-list">${rows}</ul>
      <p id="go-banner-error" style="color:#a12c45;font-size:0.85rem;margin:4px 0 0;"></p>`;
  }

  orders.forEach(o => syncJoinState(o.id));

  banner.querySelectorAll("[data-join-id]").forEach(btn => {
    btn.addEventListener("click", () => joinGroupOrder(btn.getAttribute("data-join-id")));
  });
  banner.querySelectorAll("[data-undo-id]").forEach(btn => {
    btn.addEventListener("click", () => leaveGroupOrder(btn.getAttribute("data-undo-id")));
  });
  banner.querySelectorAll("[data-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(
      btn.getAttribute("data-edit-id"),
      btn.getAttribute("data-edit-title"),
      btn.getAttribute("data-edit-deadline")
    ));
  });
}

// ============================================================
// JOIN / LEAVE
// ============================================================

async function syncJoinState(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  const banner = document.getElementById("group-order-banner");
  if (!banner) return;

  const joinBtn = banner.querySelector(`[data-join-id="${groupOrderId}"]`);
  const undoBtn = banner.querySelector(`[data-undo-id="${groupOrderId}"]`);
  if (!joinBtn || !undoBtn) return;

  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("group_order_id", groupOrderId);

  const hasJoined = (count || 0) > 0;
  const orderObj  = activeGroupOrders.find(o => o.id === groupOrderId);

  joinBtn.classList.toggle("go-join-btn--active", hasJoined);
  if (hasJoined) {
    joinBtn.textContent = "Beigetreten \u2713";
  } else {
    joinBtn.textContent = activeGroupOrders.length === 1
      ? "Mitmachen"
      : escapeHtml(orderObj?.title || "Mitmachen");
  }
  undoBtn.classList.toggle("hidden", !hasJoined);
}

async function joinGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  const { count: alreadyJoined } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("group_order_id", groupOrderId);

  if ((alreadyJoined || 0) > 0) {
    // FIX: alert() ersetzt durch Banner-Fehlermeldung
    showBannerError("Du nimmst bereits an dieser Sammelbestellung teil.");
    return;
  }

  // FIX: Prüfen ob überhaupt eine pending Order existiert, bevor Update
  const { count: pendingCount } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("group_order_id", null)
    .eq("status", "pending");

  if ((pendingCount || 0) === 0) {
    showBannerError("Es wurde keine offene Bestellung gefunden, die der Sammelbestellung zugeordnet werden kann. Bitte lege zuerst eine Bestellung an.");
    return;
  }

  const { error } = await db
    .from("orders")
    .update({ group_order_id: groupOrderId })
    .eq("user_id", user.id)
    .is("group_order_id", null)
    .eq("status", "pending");

  if (error) {
    // FIX: alert() ersetzt durch Banner-Fehlermeldung
    showBannerError("Fehler beim Beitreten: " + error.message);
    return;
  }

  await syncJoinState(groupOrderId);
}

async function leaveGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await db
    .from("orders")
    .update({ group_order_id: null })
    .eq("user_id", user.id)
    .eq("group_order_id", groupOrderId);

  if (error) {
    // FIX: alert() ersetzt durch Banner-Fehlermeldung
    showBannerError("Fehler beim Rükgängig machen: " + error.message);
    return;
  }

  await syncJoinState(groupOrderId);
}

// ============================================================
// CREATE-BUTTON
// ============================================================

function renderCreateGroupOrderButton(visible) {
  let btn = document.getElementById("create-group-order-btn");

  if (!btn) {
    btn = document.createElement("button");
    btn.id        = "create-group-order-btn";
    btn.type      = "button";
    btn.className = "go-create-btn";
    btn.textContent = "+ Sammelbestellung eröffnen";
    btn.addEventListener("click", openGroupOrderModal);

    const banner = document.getElementById("group-order-banner");
    banner?.parentNode?.insertBefore(btn, banner?.nextSibling);
  }

  btn.classList.toggle("hidden", !visible);
}

// ============================================================
// ERSTELLEN MODAL
// ============================================================

function openGroupOrderModal() {
  let modal = document.getElementById("go-create-modal");
  if (!modal) {
    modal = buildCreateModal();
    document.body.appendChild(modal);
  }
  const supplierSelect = document.getElementById("go-supplier-select");
  const deadlineInput  = document.getElementById("go-deadline-input");
  const startdateInput = document.getElementById("go-startdate-input");
  const errorEl        = document.getElementById("go-create-error");
  if (supplierSelect) supplierSelect.value = "";
  if (deadlineInput)  deadlineInput.value  = "";
  if (startdateInput) startdateInput.value = "";
  if (errorEl)        errorEl.textContent  = "";

  loadSupplierDropdown();

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("go-supplier-select")?.focus();
}

function closeGroupOrderModal() {
  const modal = document.getElementById("go-create-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
}

function buildCreateModal() {
  const modal = document.createElement("div");
  modal.id = "go-create-modal";
  modal.className = "go-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "go-create-modal-title");
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="go-modal-backdrop" id="go-create-backdrop"></div>
    <div class="go-modal-box">
      <button class="go-modal-close" type="button" aria-label="Schlie\u00dfen" id="go-create-close">\u2715</button>
      <h2 class="go-modal-title" id="go-create-modal-title">Sammelbestellung er\u00f6ffnen</h2>

      <label class="go-label" for="go-supplier-select">
        Lieferant <span class="go-required" aria-hidden="true">*</span>
      </label>
      <select id="go-supplier-select" class="go-input" required>
        <option value="">— wird geladen …</option>
      </select>

      <label class="go-label" for="go-deadline-input">
        Deadline <span class="go-required" aria-hidden="true">*</span>
      </label>
      <input type="datetime-local" id="go-deadline-input" class="go-input" required>

      <label class="go-label" for="go-startdate-input">Startdatum <span class="go-hint-inline">(optional — leer = sofort)</span></label>
      <input type="datetime-local" id="go-startdate-input" class="go-input">

      <p id="go-create-error" class="go-error" role="alert" aria-live="polite"></p>

      <div class="go-modal-footer">
        <button type="button" class="go-btn-secondary" id="go-create-cancel">Abbrechen</button>
        <button type="button" class="go-btn-primary"   id="go-create-submit">Erstellen</button>
      </div>
    </div>`;

  modal.querySelector("#go-create-backdrop").addEventListener("click", closeGroupOrderModal);
  modal.querySelector("#go-create-close").addEventListener("click",   closeGroupOrderModal);
  modal.querySelector("#go-create-cancel").addEventListener("click",  closeGroupOrderModal);
  modal.querySelector("#go-create-submit").addEventListener("click",  submitGroupOrder);

  return modal;
}

async function loadSupplierDropdown() {
  const select = document.getElementById("go-supplier-select");
  if (!select) return;

  select.innerHTML = `<option value="">— wird geladen …</option>`;

  const { data, error } = await db
    .from("products")
    .select("supplyer")
    .eq("active", true)
    .not("supplyer", "is", null);

  if (error) {
    select.innerHTML = `<option value="">Fehler beim Laden</option>`;
    return;
  }

  const suppliers = [...new Set(data.map(p => p.supplyer).filter(Boolean))].sort();

  if (suppliers.length === 0) {
    select.innerHTML = `<option value="">Keine aktiven Lieferanten gefunden</option>`;
    return;
  }

  select.innerHTML =
    `<option value="">Bitte wählen …</option>` +
    suppliers.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
}

async function submitGroupOrder() {
  const supplierSelect = document.getElementById("go-supplier-select");
  const deadlineInput  = document.getElementById("go-deadline-input");
  const errorEl        = document.getElementById("go-create-error");

  const supplier = supplierSelect?.value?.trim() || "";
  const deadline = deadlineInput?.value || "";

  errorEl.textContent = "";

  if (!supplier) { errorEl.textContent = "Bitte einen Lieferanten auswählen."; return; }
  if (!deadline) { errorEl.textContent = "Bitte eine Deadline angeben."; return; }

  const deadlineDate = new Date(deadline);
  if (deadlineDate <= new Date()) {
    errorEl.textContent = "Die Deadline muss in der Zukunft liegen.";
    return;
  }

  const { data: existing, error: checkError } = await db
    .from("group_orders")
    .select("id")
    .eq("status", "open")
    .eq("title", supplier)
    .gt("deadline", new Date().toISOString())
    .maybeSingle();

  if (checkError) { errorEl.textContent = "Prüfungsfehler: " + checkError.message; return; }
  if (existing) {
    errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für \u201e${escapeHtml(supplier)}\u201c.`;
    return;
  }

  const user = await getCurrentUser();
  if (!user) { errorEl.textContent = "Nicht eingeloggt."; return; }

  const { error: insertError } = await db.from("group_orders").insert({
    title:      supplier,
    deadline:   deadlineDate.toISOString(),
    status:     "open",
    created_by: user.id,
  });

  if (insertError) { errorEl.textContent = "Fehler beim Erstellen: " + insertError.message; return; }

  closeGroupOrderModal();
  await loadActiveGroupOrders();
}

// ============================================================
// BEARBEITEN MODAL
// ============================================================

function openEditModal(groupOrderId, currentTitle, currentDeadline) {
  let modal = document.getElementById("go-edit-modal");
  if (!modal) {
    modal = buildEditModal();
    document.body.appendChild(modal);
  }

  document.getElementById("go-edit-id").value            = groupOrderId;
  document.getElementById("go-edit-title-display").textContent = currentTitle || "";
  document.getElementById("go-edit-error").textContent  = "";

  if (currentDeadline) {
    const d = new Date(currentDeadline);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    document.getElementById("go-edit-deadline-input").value = local;
  } else {
    document.getElementById("go-edit-deadline-input").value = "";
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("go-edit-deadline-input")?.focus();
}

function closeEditModal() {
  const modal = document.getElementById("go-edit-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
}

function buildEditModal() {
  const modal = document.createElement("div");
  modal.id = "go-edit-modal";
  modal.className = "go-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "go-edit-modal-title");
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="go-modal-backdrop" id="go-edit-backdrop"></div>
    <div class="go-modal-box">
      <button class="go-modal-close" type="button" aria-label="Schlie\u00dfen" id="go-edit-close">\u2715</button>
      <h2 class="go-modal-title" id="go-edit-modal-title">Sammelbestellung bearbeiten</h2>
      <input type="hidden" id="go-edit-id">

      <p class="go-label">Lieferant</p>
      <p id="go-edit-title-display" class="go-value-readonly"></p>

      <label class="go-label" for="go-edit-deadline-input">
        Deadline <span class="go-required" aria-hidden="true">*</span>
      </label>
      <input type="datetime-local" id="go-edit-deadline-input" class="go-input" required>

      <p id="go-edit-error" class="go-error" role="alert" aria-live="polite"></p>

      <div class="go-modal-footer">
        <button type="button" class="go-btn-secondary" id="go-edit-cancel">Abbrechen</button>
        <button type="button" class="go-btn-primary"   id="go-edit-submit">Speichern</button>
      </div>
    </div>`;

  modal.querySelector("#go-edit-backdrop").addEventListener("click", closeEditModal);
  modal.querySelector("#go-edit-close").addEventListener("click",   closeEditModal);
  modal.querySelector("#go-edit-cancel").addEventListener("click",  closeEditModal);
  modal.querySelector("#go-edit-submit").addEventListener("click",  submitEditGroupOrder);

  return modal;
}

async function submitEditGroupOrder() {
  const groupOrderId = document.getElementById("go-edit-id").value;
  const deadline     = document.getElementById("go-edit-deadline-input").value;
  const errorEl      = document.getElementById("go-edit-error");

  errorEl.textContent = "";

  if (!deadline) { errorEl.textContent = "Bitte eine Deadline angeben."; return; }

  const deadlineDate = new Date(deadline);
  if (deadlineDate <= new Date()) {
    errorEl.textContent = "Die Deadline muss in der Zukunft liegen.";
    return;
  }

  const { error } = await db
    .from("group_orders")
    .update({ deadline: deadlineDate.toISOString() })
    .eq("id", groupOrderId)
    .eq("status", "open");

  if (error) { errorEl.textContent = "Fehler: " + error.message; return; }

  closeEditModal();
  await loadActiveGroupOrders();
}

// ============================================================
// HELPERS
// ============================================================

function formatDeadline(isoString) {
  return new Date(isoString).toLocaleDateString("de-DE", {
    day:   "2-digit",
    month: "2-digit",
    year:  "numeric",
  });
}

// escapeHtml ist global in app.js definiert und muss hier nicht dupliziert werden.
// Für den Fall dass group-order.js standalone geladen wird, Fallback:
if (typeof escapeHtml === "undefined") {
  window.escapeHtml = function(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
}

function escapeAttr(str) {
  return String(str ?? "")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
