// ============================================================
// GROUP ORDERS — group-order.js
// Abhängigkeiten: db, getCurrentUser, escapeHtml (aus app.js)
// UI-Konzept:
//   Desktop (≥1024px): Fullscreen-Takeover (identisch zu checkout-section)
//   Mobile  (<1024px):  Bottom-Sheet (identisch zu cart-drawer)
// ============================================================

let activeGroupOrders    = [];
let groupOrderChannel    = null;
// Suppliers mit bereits aktiver Sammelbestellung — Set von title-Strings
let blockedSuppliers     = new Set();

// ============================================================
// INIT / TEARDOWN
// ============================================================

async function initGroupOrders() {
  ensurePanel();
  ensureTriggerBar();
  await autoCloseExpiredOrders();
  await loadActiveGroupOrders();
  subscribeGroupOrders();
}

function teardownGroupOrders() {
  activeGroupOrders = [];
  blockedSuppliers  = new Set();
  if (groupOrderChannel) {
    db.removeChannel(groupOrderChannel);
    groupOrderChannel = null;
  }
  updateTriggerBar();
  closeGroupPanel();
}

// ============================================================
// AUTO-CLOSE
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
    blockedSuppliers  = new Set();
  } else {
    activeGroupOrders = data || [];
    // Alle Lieferanten mit bestehender offener Bestellung merken
    blockedSuppliers  = new Set(activeGroupOrders.map(o => (o.title || "").trim().toLowerCase()));
  }

  updateTriggerBar();
  if (document.getElementById("go-panel")?.classList.contains("go-panel--open")) {
    renderPanelContent();
  }
}

// ============================================================
// REALTIME
// ============================================================

function subscribeGroupOrders() {
  if (groupOrderChannel) db.removeChannel(groupOrderChannel);
  groupOrderChannel = db
    .channel("group_orders_realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "group_orders" }, async () => {
      await autoCloseExpiredOrders();
      await loadActiveGroupOrders();
    })
    .subscribe();
}

// ============================================================
// TRIGGER BAR
// ============================================================

function ensureTriggerBar() {
  if (document.getElementById("go-trigger-bar")) return;
  const bar = document.createElement("div");
  bar.id = "go-trigger-bar";
  bar.className = "go-trigger-bar";
  const productsSection = document.getElementById("products-section");
  productsSection?.parentNode?.insertBefore(bar, productsSection);
  updateTriggerBar();
}

function updateTriggerBar() {
  const bar = document.getElementById("go-trigger-bar");
  if (!bar) return;

  const count = activeGroupOrders.length;

  if (count === 0) {
    bar.innerHTML = `
      <div class="go-trigger-bar-actions">
        <button class="go-create-btn" id="go-trigger-create-btn" type="button">
          + Sammelbestellung eröffnen
        </button>
      </div>`;
    document.getElementById("go-trigger-create-btn")
      ?.addEventListener("click", openGroupPanel);
  } else {
    const titles = activeGroupOrders.map(o => escapeHtml(o.title || "Sammelbestellung"));
    const label  = count === 1 ? titles[0] : `${count} Sammelbestellungen aktiv`;
    bar.innerHTML = `
      <div class="go-trigger-bar-text">
        <span class="go-trigger-dot"></span>
        <span>${label}</span>
      </div>
      <div class="go-trigger-bar-actions">
        <button class="go-open-btn"   id="go-trigger-open-btn"   type="button">Anzeigen</button>
        <button class="go-create-btn" id="go-trigger-create-btn" type="button">+ Neu</button>
      </div>`;
    document.getElementById("go-trigger-open-btn")
      ?.addEventListener("click", openGroupPanel);
    document.getElementById("go-trigger-create-btn")
      ?.addEventListener("click", openGroupPanel);
  }
}

// ============================================================
// OVERLAY
// ============================================================

function openPanelOverlay() {
  if (window.innerWidth >= 1024) return;
  const overlay = document.getElementById("cart-overlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("cart-overlay--visible");
  document.body.classList.add("drawer-open");
}

function closePanelOverlay() {
  if (window.innerWidth >= 1024) return;
  const overlay = document.getElementById("cart-overlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "true");
  overlay.classList.remove("cart-overlay--visible");
  document.body.classList.remove("drawer-open");
}

// ============================================================
// PANEL — OPEN / CLOSE
// ============================================================

function ensurePanel() {
  if (document.getElementById("go-panel")) return;

  const panel = document.createElement("div");
  panel.id = "go-panel";
  panel.className = "go-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Sammelbestellungen");
  panel.setAttribute("aria-hidden", "true");

  panel.innerHTML = `
    <div class="go-panel-inner">
      <div class="go-panel-handle" aria-hidden="true"></div>
      <div class="go-panel-header">
        <button class="go-panel-back-btn" id="go-panel-back" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Zurück
        </button>
        <h2 class="go-panel-header-title">Sammelbestellungen</h2>
        <button class="go-panel-close-btn" id="go-panel-close" type="button" aria-label="Schließen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="go-panel-body" id="go-panel-body"></div>
    </div>`;

  document.body.appendChild(panel);
  document.getElementById("go-panel-back") ?.addEventListener("click", closeGroupPanel);
  document.getElementById("go-panel-close")?.addEventListener("click", closeGroupPanel);

  let touchStartY = 0;
  panel.addEventListener("touchstart", e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  panel.addEventListener("touchend",   e => {
    if (e.changedTouches[0].clientY - touchStartY > 70) closeGroupPanel();
  }, { passive: true });
}

function openGroupPanel() {
  const panel = document.getElementById("go-panel");
  if (!panel) return;
  if (window.innerWidth >= 1024) {
    document.getElementById("products-section")?.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  panel.classList.add("go-panel--open");
  panel.setAttribute("aria-hidden", "false");
  openPanelOverlay();
  renderPanelContent();
}

function closeGroupPanel() {
  const panel = document.getElementById("go-panel");
  if (!panel) return;
  panel.classList.remove("go-panel--open");
  panel.setAttribute("aria-hidden", "true");
  closePanelOverlay();
  if (window.innerWidth >= 1024) {
    document.getElementById("products-section")?.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function closeGroupOrderModal() { closeGroupPanel(); }

// ============================================================
// PANEL CONTENT RENDERN
// ============================================================

function renderPanelContent() {
  const body = document.getElementById("go-panel-body");
  if (!body) return;

  const orders = activeGroupOrders;
  let html = "";

  if (orders.length > 0) {
    html += `<p class="go-section-title">Aktive Bestellungen</p><div class="go-list">`;
    html += orders.map(o => {
      const dateStr = formatDeadline(o.deadline);
      return `
        <div class="go-item" data-go-item-id="${escapeHtml(String(o.id))}">
          <div class="go-item-info">
            <p class="go-item-title">${escapeHtml(o.title || "Sammelbestellung")}</p>
            <p class="go-item-deadline">Endet am ${escapeHtml(dateStr)}</p>
          </div>
          <div class="go-item-actions">
            <button class="go-join-btn" data-join-id="${escapeHtml(String(o.id))}" type="button">Mitmachen</button>
            <button class="go-undo-btn hidden" data-undo-id="${escapeHtml(String(o.id))}" type="button">Austreten</button>
            <button class="go-edit-btn" data-edit-id="${escapeHtml(String(o.id))}"
              data-edit-title="${escapeAttr(o.title || "")}"
              data-edit-deadline="${escapeAttr(o.deadline)}"
              type="button" aria-label="${escapeAttr(o.title || "Sammelbestellung")} bearbeiten">✏️</button>
          </div>
        </div>`;
    }).join("");
    html += "</div>";
  } else {
    html += `
      <div style="padding:32px 0;text-align:center;color:var(--muted);font-size:0.875rem;">
        Keine aktiven Sammelbestellungen.
      </div>`;
  }

  html += `
    <p class="go-section-title" style="margin-top:28px;">Neue Sammelbestellung</p>
    <div class="go-create-form">
      <div>
        <label class="go-label" for="go-supplier-select">
          Lieferant <span class="go-required">*</span>
        </label>
        <select id="go-supplier-select" class="go-input" required>
          <option value="">— wird geladen …</option>
        </select>
        <p id="go-supplier-error" class="go-error" role="alert" aria-live="polite" style="margin-top:4px;"></p>
      </div>
      <div id="go-deadline-wrap" style="opacity:0.4;pointer-events:none;">
        <label class="go-label" for="go-deadline-input">
          Deadline <span class="go-required">*</span>
        </label>
        <input type="datetime-local" id="go-deadline-input" class="go-input" required disabled>
      </div>
      <p id="go-create-error" class="go-error" role="alert" aria-live="polite"></p>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button type="button" class="go-btn-primary" id="go-create-submit-btn" disabled style="opacity:0.4;cursor:not-allowed;">
          Sammelbestellung erstellen
        </button>
      </div>
    </div>
    <p id="go-banner-error" style="margin-top:8px;font-size:0.8125rem;color:#ffaab4;"></p>`;

  body.innerHTML = html;

  // Events: Join / Undo / Edit
  body.querySelectorAll("[data-join-id]").forEach(btn => {
    btn.addEventListener("click", () => joinGroupOrder(btn.getAttribute("data-join-id")));
  });
  body.querySelectorAll("[data-undo-id]").forEach(btn => {
    btn.addEventListener("click", () => leaveGroupOrder(btn.getAttribute("data-undo-id")));
  });
  body.querySelectorAll("[data-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(
      btn.getAttribute("data-edit-id"),
      btn.getAttribute("data-edit-title"),
      btn.getAttribute("data-edit-deadline")
    ));
  });

  document.getElementById("go-create-submit-btn")
    ?.addEventListener("click", submitGroupOrder);

  // Join-Status für alle aktiven Orders laden
  orders.forEach(o => syncJoinState(o.id));

  // Supplier Dropdown laden — mit Blocked-Logik
  loadSupplierDropdown();
}

// ============================================================
// JOIN-STATE SYNC
// ============================================================

async function syncJoinState(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  const body = document.getElementById("go-panel-body");
  if (!body) return;

  const joinBtn = body.querySelector(`[data-join-id="${groupOrderId}"]`);
  const undoBtn = body.querySelector(`[data-undo-id="${groupOrderId}"]`);
  if (!joinBtn || !undoBtn) return;

  // Prüft ob diese spezifische group_order_id bereits am User hängt
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("group_order_id", groupOrderId);

  const hasJoined = (count || 0) > 0;

  joinBtn.classList.toggle("go-join-btn--active", hasJoined);
  joinBtn.textContent = hasJoined ? "Beigetreten ✓" : "Mitmachen";
  // "Austreten" nur anzeigen wenn beigetreten
  undoBtn.classList.toggle("hidden", !hasJoined);
}

// ============================================================
// JOIN / LEAVE
// ============================================================

function showBannerError(message) {
  const el = document.getElementById("go-banner-error");
  if (!el) return;
  el.textContent = message;
  setTimeout(() => { if (el) el.textContent = ""; }, 5000);
}

async function joinGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  // Doppelt-Beitreten: Diese spezifische group_order_id bereits gesetzt?
  const { count: alreadyJoined } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("group_order_id", groupOrderId);

  if ((alreadyJoined || 0) > 0) {
    showBannerError("Du nimmst bereits an dieser Sammelbestellung teil.");
    return;
  }

  // Offene pending-Order ohne Sammelbestellung vorhanden?
  const { data: pendingOrders } = await db
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .is("group_order_id", null)
    .eq("status", "pending")
    .limit(1);

  if (!pendingOrders || pendingOrders.length === 0) {
    showBannerError("Keine offene Bestellung gefunden. Bitte lege zuerst Produkte in den Warenkorb.");
    return;
  }

  // Nur die erste passende pending-Order joinen (älteste)
  const { error } = await db
    .from("orders")
    .update({ group_order_id: groupOrderId })
    .eq("id", pendingOrders[0].id);

  if (error) { showBannerError("Fehler beim Beitreten: " + error.message); return; }

  await syncJoinState(groupOrderId);
}

async function leaveGroupOrder(groupOrderId) {
  const user = await getCurrentUser();
  if (!user) return;

  // Deadline-Check: Nur Austreten bis zur Deadline erlaubt
  const order = activeGroupOrders.find(o => String(o.id) === String(groupOrderId));
  if (order && new Date(order.deadline) <= new Date()) {
    showBannerError("Die Deadline ist abgelaufen. Austreten nicht mehr möglich.");
    return;
  }

  const { error } = await db
    .from("orders")
    .update({ group_order_id: null })
    .eq("user_id", user.id)
    .eq("group_order_id", groupOrderId);

  if (error) { showBannerError("Fehler beim Austreten: " + error.message); return; }

  await syncJoinState(groupOrderId);
}

// ============================================================
// SUPPLIER DROPDOWN — mit Blocked-Validierung
// ============================================================

async function loadSupplierDropdown() {
  const select   = document.getElementById("go-supplier-select");
  const errorEl  = document.getElementById("go-supplier-error");
  if (!select) return;

  select.innerHTML = `<option value="">— wird geladen …</option>`;

  // Tabellenfeld heißt in der DB "supplier" (Tippfehler im Schema)
  const { data, error } = await db
    .from("products")
    .select("supplier")
    .eq("active", true)
    .not("supplier", "is", null);

  if (error) {
    select.innerHTML = `<option value="">Fehler beim Laden</option>`;
    return;
  }

  const suppliers = [...new Set(data.map(p => p.supplier).filter(Boolean))].sort();

  if (suppliers.length === 0) {
    select.innerHTML = `<option value="">Keine aktiven Lieferanten gefunden</option>`;
    return;
  }

  select.innerHTML = `<option value="">Bitte wählen …</option>` +
    suppliers.map(s => {
      const isBlocked = blockedSuppliers.has(s.trim().toLowerCase());
      // Geblockte Optionen disabled + Label-Hinweis
      return `<option value="${escapeAttr(s)}"${isBlocked ? " disabled class=\"go-option-blocked\"" : ""}>${escapeHtml(s)}${isBlocked ? " (bereits aktiv)" : ""}</option>`;
    }).join("");

  // onChange: Felder freischalten / sperren + sofort prüfen
  select.addEventListener("change", () => onSupplierChange(select, errorEl));
}

function onSupplierChange(select, errorEl) {
  const val       = select.value.trim();
  const deadlineWrap = document.getElementById("go-deadline-wrap");
  const deadlineInput = document.getElementById("go-deadline-input");
  const submitBtn = document.getElementById("go-create-submit-btn");
  const createError = document.getElementById("go-create-error");

  if (!val) {
    // Kein Lieferant → alles ausgegraut
    setCreateFieldsEnabled(false);
    if (errorEl) errorEl.textContent = "";
    if (createError) createError.textContent = "";
    return;
  }

  const isBlocked = blockedSuppliers.has(val.toLowerCase());

  if (isBlocked) {
    // Lieferant hat bereits aktive Bestellung → Fehlermeldung, Felder gesperrt
    setCreateFieldsEnabled(false);
    if (errorEl) errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für „${escapeHtml(val)}".`;
    if (createError) createError.textContent = "";
    return;
  }

  // Gültiger Lieferant → Felder freischalten
  setCreateFieldsEnabled(true);
  if (errorEl) errorEl.textContent = "";
  if (createError) createError.textContent = "";
}

function setCreateFieldsEnabled(enabled) {
  const deadlineWrap  = document.getElementById("go-deadline-wrap");
  const deadlineInput = document.getElementById("go-deadline-input");
  const submitBtn     = document.getElementById("go-create-submit-btn");

  if (deadlineWrap) {
    deadlineWrap.style.opacity       = enabled ? "1"   : "0.4";
    deadlineWrap.style.pointerEvents = enabled ? "auto" : "none";
  }
  if (deadlineInput) deadlineInput.disabled = !enabled;
  if (submitBtn) {
    submitBtn.disabled         = !enabled;
    submitBtn.style.opacity    = enabled ? "1"   : "0.4";
    submitBtn.style.cursor     = enabled ? "pointer" : "not-allowed";
  }
}

// ============================================================
// ERSTELLEN SUBMIT
// ============================================================

async function submitGroupOrder() {
  const supplierSelect = document.getElementById("go-supplier-select");
  const deadlineInput  = document.getElementById("go-deadline-input");
  const errorEl        = document.getElementById("go-create-error");
  if (!errorEl) return;

  const supplier = supplierSelect?.value?.trim() || "";
  const deadline = deadlineInput?.value || "";
  errorEl.textContent = "";

  if (!supplier) { errorEl.textContent = "Bitte einen Lieferanten auswählen."; return; }

  // Doppelt-Absicherung serverseitig (blockedSuppliers könnte veraltet sein)
  if (blockedSuppliers.has(supplier.toLowerCase())) {
    errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für „${escapeHtml(supplier)}".`;
    return;
  }

  if (!deadline) { errorEl.textContent = "Bitte eine Deadline angeben."; return; }

  const deadlineDate = new Date(deadline);
  if (deadlineDate <= new Date()) { errorEl.textContent = "Die Deadline muss in der Zukunft liegen."; return; }

  // DB-Check als letzte Absicherung
  const { data: existing, error: checkError } = await db
    .from("group_orders")
    .select("id")
    .eq("status", "open")
    .eq("title", supplier)
    .gt("deadline", new Date().toISOString())
    .maybeSingle();

  if (checkError) { errorEl.textContent = "Prüfungsfehler: " + checkError.message; return; }
  if (existing)   { errorEl.textContent = `Es gibt bereits eine offene Sammelbestellung für „${escapeHtml(supplier)}".`; return; }

  const user = await getCurrentUser();
  if (!user) { errorEl.textContent = "Nicht eingeloggt."; return; }

  const submitBtn = document.getElementById("go-create-submit-btn");
  if (submitBtn) submitBtn.disabled = true;

  const { error: insertError } = await db.from("group_orders").insert({
    title:      supplier,
    deadline:   deadlineDate.toISOString(),
    status:     "open",
    created_by: user.id,
  });

  if (submitBtn) { submitBtn.disabled = false; }

  if (insertError) { errorEl.textContent = "Fehler beim Erstellen: " + insertError.message; return; }

  await loadActiveGroupOrders();
  renderPanelContent();
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

  document.getElementById("go-edit-id").value = groupOrderId;
  document.getElementById("go-edit-title-display").textContent = currentTitle || "";
  document.getElementById("go-edit-error").textContent = "";

  if (currentDeadline) {
    const d     = new Date(currentDeadline);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
  if (modal) { modal.classList.add("hidden"); modal.setAttribute("aria-hidden", "true"); }
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
      <button class="go-modal-close" type="button" aria-label="Schließen" id="go-edit-close">✕</button>
      <h2 class="go-modal-title" id="go-edit-modal-title">Sammelbestellung bearbeiten</h2>
      <input type="hidden" id="go-edit-id">
      <div>
        <p class="go-label">Lieferant</p>
        <p id="go-edit-title-display" class="go-value-readonly"></p>
      </div>
      <div>
        <label class="go-label" for="go-edit-deadline-input">
          Deadline <span class="go-required">*</span>
        </label>
        <input type="datetime-local" id="go-edit-deadline-input" class="go-input" required>
      </div>
      <p id="go-edit-error" class="go-error" role="alert" aria-live="polite"></p>
      <div class="go-modal-footer">
        <button type="button" class="go-btn-secondary" id="go-edit-cancel">Abbrechen</button>
        <button type="button" class="go-btn-primary"   id="go-edit-submit">Speichern</button>
      </div>
    </div>`;

  modal.querySelector("#go-edit-backdrop").addEventListener("click", closeEditModal);
  modal.querySelector("#go-edit-close")   .addEventListener("click", closeEditModal);
  modal.querySelector("#go-edit-cancel")  .addEventListener("click", closeEditModal);
  modal.querySelector("#go-edit-submit")  .addEventListener("click", submitEditGroupOrder);

  return modal;
}

async function submitEditGroupOrder() {
  const groupOrderId = document.getElementById("go-edit-id").value;
  const deadline     = document.getElementById("go-edit-deadline-input").value;
  const errorEl      = document.getElementById("go-edit-error");
  errorEl.textContent = "";

  if (!deadline) { errorEl.textContent = "Bitte eine Deadline angeben."; return; }

  const deadlineDate = new Date(deadline);
  if (deadlineDate <= new Date()) { errorEl.textContent = "Die Deadline muss in der Zukunft liegen."; return; }

  const { error } = await db
    .from("group_orders")
    .update({ deadline: deadlineDate.toISOString() })
    .eq("id", groupOrderId)
    .eq("status", "open");

  if (error) { errorEl.textContent = "Fehler: " + error.message; return; }

  closeEditModal();
  await loadActiveGroupOrders();
  renderPanelContent();
}

// ============================================================
// HELPERS
// ============================================================

function formatDeadline(isoString) {
  return new Date(isoString).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

if (typeof escapeHtml === "undefined") {
  window.escapeHtml = function(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
}

function escapeAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
