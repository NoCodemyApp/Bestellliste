// ============================================================
// user-dropdown.js — Dropdown-Toggle + Adressänderung
// Abhängigkeiten: auth.js (window.db, window.getCurrentUser)
//                 muss nach auth.js und app.js geladen werden.
// ============================================================

(function () {
  "use strict";

  const userMenuBtn  = document.getElementById("user-menu-btn");
  const userDropdown = document.getElementById("user-dropdown");
  const addressBtn   = document.getElementById("address-change-btn");
  const addressModal      = document.getElementById("address-modal");
  const addressModalClose = document.getElementById("address-modal-close");
  const addressForm       = document.getElementById("address-form");
  const addressMessage    = document.getElementById("address-message");
  const addressSubmitBtn  = document.getElementById("address-submit-btn");
  const fieldStreet  = document.getElementById("address-street");
  const fieldHouse  = document.getElementById("address-house");
  const fieldPostal  = document.getElementById("address-postal");
  const fieldCity    = document.getElementById("address-city");

  // ── DROPDOWN TOGGLE (aus auth.js übernommen) ──────────────
  userMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = userDropdown.classList.contains("user-dropdown--open");
    userDropdown.classList.toggle("user-dropdown--open", !isOpen);
    userMenuBtn.setAttribute("aria-expanded", String(!isOpen));
    userDropdown.setAttribute("aria-hidden", String(isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!userDropdown.contains(e.target) && !userMenuBtn.contains(e.target)) {
      userDropdown.classList.remove("user-dropdown--open");
      userMenuBtn.setAttribute("aria-expanded", "false");
      userDropdown.setAttribute("aria-hidden", "true");
    }
  });

  // ── MODAL ÖFFNEN ──────────────────────────────────────────
  async function openAddressModal() {
    userDropdown.classList.remove("user-dropdown--open");
    userMenuBtn.setAttribute("aria-expanded", "false");
    userDropdown.setAttribute("aria-hidden", "true");

    setAddressMessage("Daten werden geladen …", false);
    addressSubmitBtn.disabled = true;

    try {
      const user = await window.getCurrentUser();
      if (!user) { setAddressMessage("Kein angemeldeter Nutzer gefunden.", true); return; }

      const { data, error } = await window.db
        .from("user_addresses")
        .select("street, house_number, postal_code, city")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      fieldStreet.value = data?.street       ?? "";
      fieldHouse.value  = data?.house_number ?? "";
      fieldPostal.value = data?.postal_code  ?? "";
      fieldCity.value   = data?.city         ?? "";
      setAddressMessage("", false);
    } catch (err) {
      setAddressMessage("Fehler beim Laden: " + err.message, true);
    } finally {
      addressSubmitBtn.disabled = false;
    }

    addressModal.classList.remove("address-modal--hidden");
    addressModal.setAttribute("aria-hidden", "false");
    fieldStreet.focus();
  }

  function closeAddressModal() {
    addressModal.classList.add("address-modal--hidden");
    addressModal.setAttribute("aria-hidden", "true");
    setAddressMessage("", false);
  }

  addressBtn.addEventListener("click", openAddressModal);
  addressModalClose.addEventListener("click", closeAddressModal);
  addressModal.addEventListener("click", (e) => { if (e.target === addressModal) closeAddressModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !addressModal.classList.contains("address-modal--hidden")) closeAddressModal();
  });

  // ── ADRESSE SPEICHERN ─────────────────────────────────────
  addressForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const street        = fieldStreet.value.trim();
    const house_number  = fieldHouse.value.trim();
    const postal_code   = fieldPostal.value.trim();
    const city          = fieldCity.value.trim();

    if (!street || !house_number || !postal_code || !city) {
      setAddressMessage("Bitte alle Felder ausfüllen.", true);
      return;
    }

    addressSubmitBtn.disabled    = true;
    addressSubmitBtn.textContent = "Wird gespeichert …";

    try {
      const user = await window.getCurrentUser();
      if (!user) throw new Error("Kein angemeldeter Nutzer.");

      const { error } = await window.db
        .from("user_addresses")
        .update({ street, house_number, postal_code, city })
        .eq("user_id", user.id);

      if (error) throw error;
      setAddressMessage("Adresse erfolgreich gespeichert.", false);
      setTimeout(() => closeAddressModal(), 1200);
    } catch (err) {
      setAddressMessage("Fehler beim Speichern: " + err.message, true);
    } finally {
      addressSubmitBtn.disabled    = false;
      addressSubmitBtn.textContent = "Speichern";
    }
  });

  function setAddressMessage(text, isError) {
    addressMessage.textContent = text;
    addressMessage.className = "address-message"
      + (isError ? " address-message--error" : text ? " address-message--success" : "");
  }

})();
