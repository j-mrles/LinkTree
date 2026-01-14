import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6DAhPuhdDKLTX_ksTgj5hzwNMKRUBjxI",
  authDomain: "gumgum-firebase.firebaseapp.com",
  projectId: "gumgum-firebase",
  storageBucket: "gumgum-firebase.firebasestorage.app",
  messagingSenderId: "202496100043",
  appId: "1:202496100043:web:a6cf11518e39072f643d4e",
  measurementId: "G-JMX70GTVBP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const inventoryRef = collection(db, "inventory");

const smartAddBtn = document.getElementById("smartAddBtn");
const manualAddBtn = document.getElementById("manualAddBtn");
const ebayImportBtn = document.getElementById("ebayImportBtn");
const ebayPasteBtn = document.getElementById("ebayPasteBtn");
const tableBody = document.getElementById("cardTableBody");
const totalItemsEl = document.getElementById("totalItems");
const totalQuantityEl = document.getElementById("totalQuantity");
const totalValueEl = document.getElementById("totalValue");
const lastSyncedEl = document.getElementById("lastSynced");
const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const itemForm = document.getElementById("itemForm");
const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");
const submitBtn = document.getElementById("submitBtn");
const statusToast = document.getElementById("statusToast");
const cardIdField = document.getElementById("cardId");
const cardNameField = document.getElementById("cardName");
const modalSearchSection = document.getElementById("modalSearchSection");
const ebayPasteSection = document.getElementById("ebayPasteSection");
const ebaySnippetField = document.getElementById("ebaySnippet");
const ebayPasteInput = document.getElementById("ebayPasteInput");
const copyEbaySnippetBtn = document.getElementById("copyEbaySnippetBtn");
const clearEbayPasteBtn = document.getElementById("clearEbayPasteBtn");
const closeEbayPasteBtn = document.getElementById("closeEbayPasteBtn");
const importEbayPasteBtn = document.getElementById("importEbayPasteBtn");
const cardFranchiseField = document.getElementById("cardFranchise");
const cardSetField = document.getElementById("cardSet");
const cardTypeField = document.getElementById("cardType");
const cardRarityField = document.getElementById("cardRarity");
const cardPriceField = document.getElementById("cardPrice");
const cardPricePaidField = document.getElementById("cardPricePaid");
const cardStockField = document.getElementById("cardStock");
const cardNotesField = document.getElementById("cardNotes");
const cardConditionField = document.getElementById("cardCondition");

const POKEMON_API_BASE_URL = "https://api.pokemontcg.io/v2";
const POKEMON_API_KEY = "fd8864bf-0675-46fe-942e-9c37f2983115";

const intelForm = document.getElementById("intelForm");
const intelInput = document.getElementById("intelSearchInput");
const intelResults = document.getElementById("intelResults");
const intelClearBtn = document.getElementById("intelClearBtn");
const intelSpinner = document.getElementById("intelSpinner");
const intelHistoryContainer = document.getElementById("intelHistory");

let inventoryCache = [];
let lastIntelResults = [];
let intelAbortController = null;
const intelCache = new Map();
const searchHistory = [];
const HISTORY_LIMIT = 10;
let debounceTimer = null;

const FRANCHISE_ORDER = ["pokemon", "one piece", "other"];
const CONDITION_ORDER = ["sealed", "unsealed"];

if (!isConfigProvided(firebaseConfig)) {
  renderConfigWarning();
  throw new Error(
    "Firebase configuration is missing. Update firebaseConfig in script.js with your project credentials."
  );
}

const inventoryQuery = query(inventoryRef, orderBy("name", "asc"));

onSnapshot(
  inventoryQuery,
  (snapshot) => {
    inventoryCache = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          source: (data.source ?? "").toString(),
          sku: (data.sku ?? "").toString(),
          offerId: (data.offerId ?? "").toString(),
          listingId: (data.listingId ?? "").toString(),
          url: (data.url ?? "").toString(),
          name: data.name ?? "",
          franchise: normalizeFranchise(data.franchise),
          setName: data.setName ?? "",
          type: data.type ?? "",
          condition: normalizeCondition(data.condition),
          rarity: data.rarity ?? "",
          price: safeNumber(data.price),
        pricePaid: safeNumber(data.pricePaid),
          stock: safeInteger(data.stock),
          notes: data.notes ?? "",
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null
        };
      })
      .sort(compareInventoryItems);

    renderTable(inventoryCache);
    updateSummary();
    updateLastSynced();
  },
  (error) => {
    console.error("Error listening to Firestore updates:", error);
    showToast("Realtime updates failed. Check console.", true);
  }
);


smartAddBtn?.addEventListener("click", () => openModal("create"));
manualAddBtn?.addEventListener("click", () => openModal("manual"));
ebayImportBtn?.addEventListener("click", () => importEbaySnapshot());
ebayPasteBtn?.addEventListener("click", () => openModal("ebay-paste"));
closeModalBtn.addEventListener("click", closeModal);
cancelModalBtn.addEventListener("click", closeModal);
copyEbaySnippetBtn?.addEventListener("click", copyEbaySnippet);
clearEbayPasteBtn?.addEventListener("click", () => {
  if (ebayPasteInput) ebayPasteInput.value = "";
  showToast("Cleared.", false);
});
closeEbayPasteBtn?.addEventListener("click", closeModal);
importEbayPasteBtn?.addEventListener("click", importEbayPastedJson);

modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalBackdrop.hasAttribute("hidden")) {
    closeModal();
  }
});

if (intelForm && intelInput && intelResults) {
  intelForm.addEventListener("submit", handleIntelSearch);
  intelInput.addEventListener("input", handleIntelInputDebounced);

  if (intelClearBtn) {
    intelClearBtn.addEventListener("click", () => {
      resetIntelUI();
      intelInput.focus();
    });
  }

  intelResults.addEventListener("click", async (event) => {
    const button = event.target.closest(".intel-add-btn");
    if (!button) return;

    const index = Number.parseInt(button.dataset.prefillIndex ?? "-1", 10);
    if (!Number.isFinite(index) || !lastIntelResults[index]) return;

    const card = lastIntelResults[index];
    const mode = button.dataset.mode ?? "modal";
    const pricePaidInput = intelResults.querySelector(`[data-price-paid-index="${index}"]`);
    const quantityInput = intelResults.querySelector(`[data-qty-index="${index}"]`);
    const pricePaid = safeNumber(pricePaidInput?.value);
    const quantity = Math.max(1, safeInteger(quantityInput?.value ?? 1));

    if (mode === "quick-add") {
      if (!Number.isFinite(pricePaid) || pricePaid <= 0) {
        showToast("Enter the price you paid before quick-adding.", true);
        pricePaidInput?.focus();
        return;
      }

      const success = await quickAddIntelCard(card, { pricePaid, quantity });
      if (success) {
        if (pricePaidInput) pricePaidInput.value = "";
        if (quantityInput) quantityInput.value = "1";
      }
      return;
    }

    showManualEntryFromIntel(card, { pricePaid, quantity });
  });

  if (intelHistoryContainer) {
    intelHistoryContainer.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-history]");
      if (!button || !intelInput) return;
      const query = button.dataset.history;
      if (!query) return;
      intelInput.value = query;
      intelForm?.requestSubmit();
    });
  }
}

tableBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const row = target.closest("tr[data-id]");
  if (!row) return;

  const cardId = row.dataset.id;
  const card = inventoryCache.find((item) => item.id === cardId);
  if (!card) return;

  if (target.classList.contains("edit-btn")) {
    openModal("edit", card);
  }

  if (target.classList.contains("delete-btn")) {
    const confirmed = confirm(
      `Remove “${card.name}” from inventory? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(inventoryRef, cardId));
      showToast("Card deleted.", false);
    } catch (error) {
      console.error("Failed to delete card:", error);
      showToast("Delete failed. Check console.", true);
    }
  }
});

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!itemForm.reportValidity()) {
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  const payload = buildPayloadFromForm();
  const isEdit = Boolean(cardIdField.value);

  try {
    if (isEdit) {
      const docRef = doc(inventoryRef, cardIdField.value);
      await updateDoc(docRef, { ...payload, updatedAt: serverTimestamp() });
      showToast("Card updated!", false);
    } else {
      await addDoc(inventoryRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      showToast("Card added!", false);
    }

    closeModal();
  } catch (error) {
    console.error("Failed to save card:", error);
    showToast("Save failed. Check console.", true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? "Update Card" : "Save Card";
  }
});

function renderTable(data) {
  if (!data.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="table-empty">
            <p>No cards in the inventory yet.</p>
          </div>
        </td>
      </tr>
    `;

    return;
  }

  const rows = data
    .map((item) => {
      const notesIcon = item.notes
        ? `<span class="note-indicator" title="${escapeHtml(item.notes)}">📝</span>`
        : "";
      const stockClass = item.stock <= 2 ? "stock-chip stock-low" : "stock-chip";
      const conditionClass =
        item.condition === "sealed"
          ? "condition-chip condition-sealed"
          : "condition-chip condition-unsealed";
      const pricePaidDisplay = item.pricePaid > 0 ? formatCurrency(item.pricePaid) : "—";
      return `
        <tr data-id="${item.id}">
          <td data-label="Name &amp; Set">
            <div class="cell-text">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.setName || "—")}</small>
            </div>
          </td>
          <td data-label="Franchise"><span class="cell-value">${escapeHtml(formatFranchise(item.franchise))}</span></td>
          <td data-label="Condition"><span class="${conditionClass}">${escapeHtml(formatCondition(item.condition))}</span></td>
          <td data-label="Type"><span class="cell-value">${escapeHtml(item.type || "—")}</span></td>
          <td data-label="Rarity"><span class="cell-value">${escapeHtml(item.rarity || "—")}${notesIcon}</span></td>
          <td data-label="Price (Market)"><span class="cell-value">${formatCurrency(item.price)}</span></td>
          <td data-label="Price Paid"><span class="cell-value">${pricePaidDisplay}</span></td>
          <td data-label="Stock"><span class="${stockClass}">${item.stock}</span></td>
          <td data-label="Last Updated"><span class="cell-value">${formatDate(item.updatedAt)}</span></td>
          <td class="actions" data-label="Actions">
            <button type="button" class="action-btn edit-btn">Edit</button>
            <button type="button" class="action-btn delete-btn">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tableBody.innerHTML = rows;
}

async function handleIntelSearch(event) {
  event.preventDefault();
  if (!intelInput || !intelResults) return;

  const rawQuery = intelInput.value.trim();
  if (!rawQuery) {
    console.log("[Intel] Empty query submitted.");
    renderIntelStatus("Type a Pokémon, set, or card number to begin the scan.");
    return;
  }

  const sanitizedQuery = sanitizeIntelQuery(rawQuery);
  if (!sanitizedQuery) {
    renderIntelStatus("Please enter at least two characters to scan.", true);
    return;
  }

  if (intelCache.has(sanitizedQuery)) {
    console.log("[Intel] Cache hit for query:", sanitizedQuery);
    renderIntelResults(intelCache.get(sanitizedQuery));
    if (intelClearBtn) {
      intelClearBtn.hidden = false;
    }
    addToSearchHistory(rawQuery);
    return;
  }

  if (intelAbortController) {
    console.log("[Intel] Aborting previous request.");
    intelAbortController.abort();
  }

  intelAbortController = new AbortController();
  renderIntelSkeleton();
  intelResults?.classList.add("intel-results--loading");

  try {
    console.log("[Intel] Searching Pokémon TCG API with query:", rawQuery);
    const cards = await fetchPokemonCards(sanitizedQuery, intelAbortController.signal);
    lastIntelResults = cards;
    intelCache.set(sanitizedQuery, cards);
    console.log("[Intel] API returned", cards.length, "results.");

    if (!cards.length) {
      renderIntelStatus("No matches found. Try another card name or include a set hint.");
      return;
    }

    renderIntelResults(cards);
    if (intelClearBtn) {
      intelClearBtn.hidden = false;
    }
    addToSearchHistory(rawQuery);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Pokémon TCG API search failed:", error);
    if (error instanceof TypeError) {
      renderIntelStatus("Network error: Unable to reach the Pokémon TCG API. Check your connection and try again.", true);
    } else {
      renderIntelStatus("Scan failed. The Pokémon TCG API may be busy—try again in a moment.", true);
    }
  } finally {
    intelResults?.classList.remove("intel-results--loading");
    intelSpinner?.classList.remove("is-active");
  }
}

function renderIntelLoading() {
  renderIntelStatus("Scanning official archives…", false);
}

function renderIntelPlaceholder(message) {
  if (!intelResults) return;
  intelResults.classList.remove("intel-results--loading");
  intelSpinner?.classList.remove("is-active");
  intelResults.innerHTML = `<div class="intel-placeholder">${escapeHtml(message)}</div>`;
}

function renderIntelStatus(message, isError = false) {
  if (!intelResults) return;
  intelResults.classList.remove("intel-results--loading");
  intelSpinner?.classList.remove("is-active");
  intelResults.innerHTML = `<div class="intel-status${isError ? " intel-status--error" : ""}">${escapeHtml(
    message
  )}</div>`;
}

function resetIntelUI() {
  lastIntelResults = [];
  if (intelInput) intelInput.value = "";
  if (intelClearBtn) intelClearBtn.hidden = true;
  intelSpinner?.classList.remove("is-active");
  renderIntelPlaceholder("Search for a Pokémon card to add it to your inventory.");
  renderSearchHistory();
}

function renderIntelSkeleton() {
  if (!intelResults) return;
  const skeletons = Array.from({ length: 3 })
    .map(
      () => `
      <div class="intel-skeleton">
        <div class="intel-skeleton__media"></div>
        <div class="intel-skeleton__stack">
          <div class="intel-skeleton__line"></div>
          <div class="intel-skeleton__line"></div>
          <div class="intel-skeleton__line"></div>
        </div>
        <div class="intel-skeleton__pill"></div>
      </div>
    `
    )
    .join("");
  intelResults.innerHTML = skeletons;
  intelSpinner?.classList.add("is-active");
}

function sanitizeIntelQuery(rawQuery) {
  const sanitized = rawQuery.replace(/"/g, "").replace(/\s+/g, " ").trim();
  return sanitized.length >= 2 ? sanitized.toLowerCase() : "";
}

function handleIntelInputDebounced(event) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  const value = event.target.value.trim();
  if (!value) {
    resetIntelUI();
    return;
  }

  if (intelCache.has(sanitizeIntelQuery(value))) {
    renderIntelResults(intelCache.get(sanitizeIntelQuery(value)));
    if (intelClearBtn) intelClearBtn.hidden = false;
  }

  debounceTimer = setTimeout(() => {
    intelForm?.requestSubmit();
  }, 350);
}

async function fetchPokemonCards(sanitizedQuery, signal) {
  console.log("[Intel] Sanitized query:", sanitizedQuery);
  const queryParts = [`name:${sanitizedQuery}*`];

  if (/^.+\s[a-z]{2,3}$/i.test(sanitizedQuery)) {
    const [, possibleCode] = sanitizedQuery.split(/\s+/);
    if (possibleCode) {
      queryParts.push(`set.name:${possibleCode}*`);
    }
  }

  const params = new URLSearchParams({
    q: queryParts.join(" "),
    orderBy: "-set.releaseDate",
    pageSize: "4"
  });

  console.log("[Intel] Final API query:", queryParts.join(" "), params.toString());

  const response = await fetch(`${POKEMON_API_BASE_URL}/cards?${params.toString()}`, {
    headers: {
      "X-Api-Key": POKEMON_API_KEY
    },
    signal
  });

  console.log("[Intel] API response status:", response.status);

  if (!response.ok) {
    const errorText = await safeReadError(response);
    throw new Error(
      `Pokémon TCG API responded with ${response.status}${errorText ? `: ${errorText}` : ""}`
    );
  }

  const payload = await response.json();
  const data = Array.isArray(payload?.data) ? payload.data : [];
  // Sort client-side by exact match, then by release date desc
  data.sort((a, b) => {
    const exactA = a.name?.toLowerCase() === sanitizedQuery;
    const exactB = b.name?.toLowerCase() === sanitizedQuery;
    if (exactA && !exactB) return -1;
    if (!exactA && exactB) return 1;
    const dateA = a.set?.releaseDate ? Date.parse(a.set.releaseDate) : 0;
    const dateB = b.set?.releaseDate ? Date.parse(b.set.releaseDate) : 0;
    return dateB - dateA;
  });
  console.log("[Intel] Processed payload:", data);
  return data;
}

function renderIntelResults(cards) {
  if (!intelResults) return;
  intelResults.classList.remove("intel-results--loading");
  intelSpinner?.classList.remove("is-active");

  const markup = cards
    .map((card, index) => {
      const image = card.images?.small || card.images?.large || "";
      const setName = card.set?.name ? `${card.set.name} (${card.set.series ?? "Series"})` : "Unknown Set";
      const releaseDate = card.set?.releaseDate ? `Released ${card.set.releaseDate}` : "Release date N/A";
      const rarity = card.rarity ?? "Unknown rarity";
      const supertype = card.supertype ?? "";
      const subtypes = Array.isArray(card.subtypes) ? card.subtypes.join(" • ") : "";
      const types = Array.isArray(card.types) ? card.types.join(" / ") : "";
      const price = extractMarketPrice(card);
      const priceLabel = Number.isFinite(price) ? formatCurrency(price) : "—";
      const tags = buildIntelTags({ rarity, supertype, subtypes, types });

      return `
        <article class="intel-card">
          <div class="intel-card__media">
            ${
              image
                ? `<img src="${image}" alt="${escapeHtml(card.name)} card art" loading="lazy" />`
                : `<span class="intel-placeholder">No art</span>`
            }
          </div>
          <div class="intel-card__body">
            <div class="intel-card__title">${escapeHtml(card.name)}</div>
            <div class="intel-card__meta">${escapeHtml(setName)} • ${escapeHtml(releaseDate)}</div>
            <div class="intel-card__meta">Number ${escapeHtml(card.number ?? "—")} • ${escapeHtml(rarity)}</div>
            ${
              tags.length
                ? `<div class="intel-tags">${tags
                    .map((tag) => `<span class="intel-tag">${escapeHtml(tag)}</span>`)
                    .join("")}</div>`
                : ""
            }
          </div>
          <div class="intel-card__actions">
            <span class="intel-price">Market ${priceLabel}</span>
            <label class="intel-inline-field">
              <span>Price Paid</span>
              <input type="number" min="0" step="0.01" placeholder="e.g. 80.00" data-price-paid-index="${index}" />
            </label>
            <label class="intel-inline-field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="1" data-qty-index="${index}" />
            </label>
            <div class="intel-card__buttons">
              <button type="button" class="intel-add-btn" data-mode="quick-add" data-prefill-index="${index}">Quick Add</button>
              <button type="button" class="intel-add-btn secondary" data-mode="modal" data-prefill-index="${index}">Open Modal</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  intelResults.innerHTML = markup;
}

function showManualEntryFromIntel(card, options = {}) {
  modalSearchSection?.classList.add("is-hidden");
  itemForm.classList.remove("is-hidden");
  modalTitle.textContent = "Review & Save";
  modalSubtitle.textContent = "Confirm details or adjust before saving to your inventory.";
  submitBtn.textContent = "Save Card";

  const marketPrice = extractMarketPrice(card);
  const quantity = Math.max(1, options.quantity ?? 1);
  const pricePaidValue = Number.isFinite(options.pricePaid) && options.pricePaid > 0 ? options.pricePaid : "";

  cardIdField.value = "";
  cardNameField.value = card.name ?? "";
  cardFranchiseField.value = "pokemon";
  cardSetField.value = card.set?.name ?? "";
  cardTypeField.value = Array.isArray(card.types) ? card.types.join(", ") : card.supertype ?? "";
  cardConditionField.value = "unsealed";
  cardRarityField.value = card.rarity ?? "";
  cardPriceField.value = Number.isFinite(marketPrice) ? marketPrice.toFixed(2) : "";
  cardPricePaidField.value = pricePaidValue === "" ? "" : pricePaidValue.toFixed(2);
  cardStockField.value = quantity;
  cardNotesField.value = buildIntelNotes(card);

  setTimeout(() => {
    cardPricePaidField.focus();
  }, 50);
}

async function quickAddIntelCard(card, options) {
  const marketPrice = extractMarketPrice(card);
  const cardPrice = Number.isFinite(marketPrice) ? marketPrice : options.pricePaid;
  const quantity = Math.max(1, options.quantity ?? 1);

  const payload = {
    name: card.name ?? "",
    franchise: "pokemon",
    setName: card.set?.name ?? "",
    type: Array.isArray(card.types) ? card.types.join(", ") : card.supertype ?? "",
    condition: "unsealed",
    rarity: card.rarity ?? "",
    price: Number.isFinite(cardPrice) ? cardPrice : 0,
    pricePaid: Number.isFinite(options.pricePaid) ? options.pricePaid : 0,
    stock: quantity,
    notes: buildIntelNotes(card)
  };

  try {
    await addDoc(inventoryRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    showToast(`Added ${payload.name} (x${quantity}) to inventory.`, false);
    return true;
  } catch (error) {
    console.error("Quick add failed:", error);
    showToast("Quick add failed. Check console.", true);
    return false;
  }
}

function buildIntelNotes(card) {
  const notes = [`Pokémon TCG API ID: ${card.id}`];
  if (card.set?.id) notes.push(`Set ID: ${card.set.id}`);
  if (card.artist) notes.push(`Artist: ${card.artist}`);
  if (Array.isArray(card.subtypes) && card.subtypes.length) {
    notes.push(`Subtypes: ${card.subtypes.join(", ")}`);
  }
  if (card.number) notes.push(`Card Number: ${card.number}`);
  return notes.join(" • ");
}

function addToSearchHistory(query) {
  const trimmed = query.trim();
  if (!trimmed) return;

  const existingIndex = searchHistory.findIndex((entry) => entry.toLowerCase() === trimmed.toLowerCase());
  if (existingIndex !== -1) {
    searchHistory.splice(existingIndex, 1);
  }

  searchHistory.unshift(trimmed);
  if (searchHistory.length > HISTORY_LIMIT) {
    searchHistory.length = HISTORY_LIMIT;
  }

  const historyData = JSON.stringify(searchHistory);
  try {
    localStorage.setItem("intelSearchHistory", historyData);
  } catch (error) {
    console.warn("Unable to persist search history:", error);
  }

  renderSearchHistory();
}

function loadSearchHistory() {
  try {
    const stored = localStorage.getItem("intelSearchHistory");
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      searchHistory.length = 0;
      parsed.slice(0, HISTORY_LIMIT).forEach((entry) => searchHistory.push(entry));
    }
  } catch (error) {
    console.warn("Unable to load search history:", error);
  }

  renderSearchHistory();
}

function renderSearchHistory() {
  if (!intelHistoryContainer) return;

  if (!searchHistory.length) {
    intelHistoryContainer.innerHTML = "";
    intelHistoryContainer.classList.add("is-hidden");
    return;
  }

  intelHistoryContainer.classList.remove("is-hidden");
  intelHistoryContainer.innerHTML = searchHistory
    .map(
      (entry) =>
        `<button type="button" class="history-chip" data-history="${escapeHtml(entry)}">${escapeHtml(entry)}</button>`
    )
    .join("");
}

function updateSummary() {
  const totalItems = inventoryCache.length;
  const totalQuantity = inventoryCache.reduce((sum, item) => sum + item.stock, 0);
  const totalValue = inventoryCache.reduce(
    (sum, item) => sum + item.price * item.stock,
    0
  );

  totalItemsEl.textContent = totalItems;
  totalQuantityEl.textContent = totalQuantity;
  totalValueEl.textContent = formatCurrency(totalValue);
}

function updateLastSynced() {
  const timestamp = new Date();
  lastSyncedEl.textContent = `Last synced: ${timestamp.toLocaleString()}`;
}

function openModal(mode, card = null) {
  loadSearchHistory();
  modalBackdrop.removeAttribute("hidden");
  document.body.classList.add("modal-open");
  itemForm.reset();
  cardIdField.value = "";
  cardFranchiseField.value = "other";
  cardConditionField.value = "sealed";
  cardPricePaidField.value = "";
  ebayPasteSection?.classList.add("is-hidden");

  if (mode === "ebay-paste") {
    modalSearchSection?.classList.add("is-hidden");
    itemForm.classList.add("is-hidden");
    ebayPasteSection?.classList.remove("is-hidden");
    modalTitle.textContent = "Import eBay Listings";
    modalSubtitle.textContent = "Run a snippet on your eBay listings page, then paste JSON here to import.";
    submitBtn.textContent = "Save Card";

    if (ebaySnippetField) {
      ebaySnippetField.value = getEbayDomSnippet();
    }

    setTimeout(() => {
      ebayPasteInput?.focus();
    }, 50);
  } else if (mode === "edit" && card) {
    modalSearchSection?.classList.add("is-hidden");
    itemForm.classList.remove("is-hidden");
    modalTitle.textContent = "Edit Card";
    modalSubtitle.textContent = "Update details for this inventory entry.";
    submitBtn.textContent = "Update Card";
    cardIdField.value = card.id;
    cardNameField.value = card.name;
    cardFranchiseField.value = card.franchise || "other";
    cardSetField.value = card.setName;
    cardTypeField.value = card.type;
    cardConditionField.value = card.condition || "unsealed";
    cardRarityField.value = card.rarity;
    cardPriceField.value = card.price;
    cardPricePaidField.value = Number.isFinite(card.pricePaid) && card.pricePaid > 0 ? card.pricePaid : "";
    cardStockField.value = card.stock;
    cardNotesField.value = card.notes;
    setTimeout(() => {
      cardNameField.focus();
    }, 50);
  } else if (mode === "manual") {
    modalSearchSection?.classList.add("is-hidden");
    itemForm.classList.remove("is-hidden");
    modalTitle.textContent = "Manual Entry";
    modalSubtitle.textContent = "Fill in the details below to add a card without searching.";
    submitBtn.textContent = "Save Card";
    setTimeout(() => {
      cardNameField.focus();
    }, 50);
  } else {
    modalSearchSection?.classList.remove("is-hidden");
    itemForm.classList.add("is-hidden");
    modalTitle.textContent = "Find Cards";
    modalSubtitle.textContent = "Search the Pokémon TCG database to add inventory instantly.";
    submitBtn.textContent = "Save Card";
    resetIntelUI();
    setTimeout(() => {
      intelInput?.focus();
    }, 50);
  }
}

function closeModal() {
  modalBackdrop.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
  itemForm.reset();
  cardIdField.value = "";
  itemForm.classList.add("is-hidden");
  modalSearchSection?.classList.remove("is-hidden");
  ebayPasteSection?.classList.add("is-hidden");
  resetIntelUI();
}

function buildPayloadFromForm() {
  return {
    name: cardNameField.value.trim(),
    franchise: normalizeFranchise(cardFranchiseField.value),
    setName: cardSetField.value.trim(),
    type: cardTypeField.value.trim(),
    condition: normalizeCondition(cardConditionField.value),
    rarity: cardRarityField.value.trim(),
    price: safeNumber(cardPriceField.value),
    pricePaid: safeNumber(cardPricePaidField.value),
    stock: safeInteger(cardStockField.value),
    notes: cardNotesField.value.trim()
  };
}

function safeNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  const number = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: number % 1 === 0 ? 0 : 2
  }).format(number);
}

function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function escapeHtml(value) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message, isError = false) {
  statusToast.textContent = message;
  statusToast.classList.toggle("status-error", isError);
  statusToast.classList.toggle("status-success", !isError);
  statusToast.removeAttribute("hidden");

  setTimeout(() => {
    statusToast.setAttribute("hidden", "");
  }, 3200);
}

async function safeReadError(response) {
  try {
    const text = await response.text();
    return text.slice(0, 180);
  } catch (readError) {
    return "";
  }
}

function extractMarketPrice(card) {
  const tcgPrices = card?.tcgplayer?.prices;
  if (!tcgPrices) return null;

  for (const entry of Object.values(tcgPrices)) {
    const market = entry?.market ?? entry?.mid ?? entry?.directLow;
    if (Number.isFinite(market)) {
      return Number(market);
    }
  }

  return null;
}

function buildIntelTags({ rarity, supertype, subtypes, types }) {
  const tags = [];
  if (supertype) tags.push(supertype);
  if (subtypes) tags.push(subtypes);
  if (types) tags.push(types);
  if (rarity) tags.push(rarity);
  return tags.slice(0, 4);
}

function compareInventoryItems(a, b) {
  const franchiseDiff =
    getRank(FRANCHISE_ORDER, a.franchise) -
    getRank(FRANCHISE_ORDER, b.franchise);
  if (franchiseDiff !== 0) return franchiseDiff;

  const conditionDiff =
    getRank(CONDITION_ORDER, a.condition) -
    getRank(CONDITION_ORDER, b.condition);
  if (conditionDiff !== 0) return conditionDiff;

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function getRank(order, value) {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function normalizeFranchise(value) {
  const token = (value ?? "").toString().trim().toLowerCase();
  if (token === "pokémon" || token === "pokemon") return "pokemon";
  if (token === "one piece" || token === "onepiece") return "one piece";
  return "other";
}

function normalizeCondition(value) {
  const token = (value ?? "").toString().trim().toLowerCase();
  return token === "sealed" ? "sealed" : "unsealed";
}

function formatFranchise(value) {
  switch (normalizeFranchise(value)) {
    case "pokemon":
      return "Pokemon";
    case "one piece":
      return "One Piece";
    default:
      return "Other";
  }
}

function formatCondition(value) {
  return normalizeCondition(value) === "sealed" ? "Sealed" : "Unsealed";
}

function isConfigProvided(config) {
  return Boolean(
    config &&
      typeof config === "object" &&
      config.apiKey &&
      config.projectId &&
      config.appId
  );
}

function renderConfigWarning() {
  totalItemsEl.textContent = "--";
  totalQuantityEl.textContent = "--";
  totalValueEl.textContent = "--";
  lastSyncedEl.textContent =
    "Last synced: connect Firebase to enable realtime data.";

  smartAddBtn?.setAttribute("disabled", "true");
  manualAddBtn?.setAttribute("disabled", "true");

  tableBody.innerHTML = `
    <tr>
      <td colspan="10">
        <div class="table-empty">
          <p>Inventory is offline. Add your Firebase config in <code>gumgum/gumgum-inventory/main/script.js</code> to connect.</p>
        </div>
      </td>
    </tr>
  `;

  showToast("Add your Firebase config to enable the inventory.", true);
}

async function importEbaySnapshot() {
  if (!ebayImportBtn) return;
  ebayImportBtn.disabled = true;
  const originalText = ebayImportBtn.textContent;
  ebayImportBtn.textContent = "Importing…";

  try {
    const response = await fetch("./ebay-snapshot.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot fetch failed (${response.status}). Generate it first via npm run ebay:sync`);
    }
    const snapshot = await response.json();
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];

    if (!items.length) {
      showToast("No eBay items found in snapshot.", true);
      return;
    }

    let created = 0;
    let updated = 0;

    for (const item of items) {
      const sku = (item?.sku ?? "").toString();
      const listingId = (item?.listingId ?? "").toString();
      const offerId = (item?.offerId ?? "").toString();
      const url = (item?.url ?? "").toString();
      const name = (item?.title ?? sku ?? "eBay Listing").toString();
      const stock = safeInteger(item?.availableQuantity ?? 0);
      const price = safeNumber(item?.price ?? 0);

      if (!sku && !listingId) continue;

      const existing = inventoryCache.find(
        (entry) =>
          entry.source === "ebay" &&
          ((sku && entry.sku === sku) ||
            (listingId && entry.listingId === listingId))
      );

      const payload = {
        source: "ebay",
        sku,
        listingId,
        offerId,
        url,
        name,
        franchise: "other",
        setName: "eBay",
        type: "",
        condition: "unsealed",
        rarity: "",
        price,
        pricePaid: 0,
        stock,
        notes: url ? `Imported from eBay • ${url}` : "Imported from eBay"
      };

      if (existing?.id) {
        await updateDoc(doc(inventoryRef, existing.id), {
          ...payload,
          updatedAt: serverTimestamp()
        });
        updated += 1;
      } else {
        await addDoc(inventoryRef, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        created += 1;
      }
    }

    showToast(`eBay import complete: ${created} added, ${updated} updated.`, false);
  } catch (error) {
    console.error("eBay import failed:", error);
    showToast("eBay import failed. Check console.", true);
  } finally {
    ebayImportBtn.disabled = false;
    ebayImportBtn.textContent = originalText;
  }
}

function getEbayDomSnippet() {
  // NOTE: Keep this snippet ES5-ish so it runs in older browsers / webviews.
  // No optional chaining, no arrow functions, no `catch {}`, no replaceAll().
  return (
    "/* Gum-Gum eBay extract */\\n" +
    "!function(){\\n" +
    "  function cleanTitle(value){\\n" +
    "    var raw = (value == null ? '' : String(value));\\n" +
    "    raw = raw.replace(/[\\r\\n\\t]+/g,' ').replace(/Opens in a new window or tab/g,'');\\n" +
    "    raw = raw.replace(/^\\s+/,'');\\n" +
    "    if (raw.toLowerCase().indexOf('new listing') === 0) raw = raw.slice('new listing'.length);\\n" +
    "    raw = raw.replace(/^\\s+|\\s+$/g,'').replace(/\\s{2,}/g,' ');\\n" +
    "    return raw;\\n" +
    "  }\\n" +
    "  function toNumber(value){\\n" +
    "    var raw = (value == null ? '' : String(value));\\n" +
    "    var cleaned = (raw.match(/-?[0-9]+(?:\\.[0-9]+)?/)||[])[0];\\n" +
    "    var n = cleaned ? parseFloat(cleaned) : NaN;\\n" +
    "    return isFinite(n) ? n : null;\\n" +
    "  }\\n" +
    "  function listingIdFromUrl(url){\\n" +
    "    var raw = (url == null ? '' : String(url));\\n" +
    "    var m = raw.match(/\\/itm\\/(\\d+)/);\\n" +
    "    return m && m[1] ? m[1] : '';\\n" +
    "  }\\n" +
    "  function uniqueBy(list, keyFn){\\n" +
    "    var seen = {};\\n" +
    "    var out = [];\\n" +
    "    for (var i=0;i<list.length;i++){\\n" +
    "      var item = list[i];\\n" +
    "      var key = keyFn(item);\\n" +
    "      if (!key || seen[key]) continue;\\n" +
    "      seen[key] = true;\\n" +
    "      out.push(item);\\n" +
    "    }\\n" +
    "    return out;\\n" +
    "  }\\n" +
    "  function parseFromSItem(){\\n" +
    "    var nodes = Array.prototype.slice.call(document.querySelectorAll('li.s-item'));\\n" +
    "    var out = [];\\n" +
    "    for (var i=0;i<nodes.length;i++){\\n" +
    "      var node = nodes[i];\\n" +
    "      var link = node.querySelector('a.s-item__link') || node.querySelector('a[href*=\"/itm/\"]');\\n" +
    "      var titleEl = node.querySelector('.s-item__title') || node.querySelector('h3') || link;\\n" +
    "      var priceEl = node.querySelector('.s-item__price') || node.querySelector('[data-testid=\"price\"]') || node.querySelector('.x-price-primary');\\n" +
    "      var url = link && link.href ? String(link.href).trim() : '';\\n" +
    "      var title = cleanTitle(titleEl ? (titleEl.innerText || titleEl.textContent || '') : '');\\n" +
    "      var priceText = priceEl ? (priceEl.innerText || priceEl.textContent || '') : '';\\n" +
    "      var price = toNumber(String(priceText).trim());\\n" +
    "      var listingId = listingIdFromUrl(url);\\n" +
    "      if (!title || !url) continue;\\n" +
    "      if (title.toLowerCase() === 'shop on ebay') continue;\\n" +
    "      out.push({title:title,url:url,listingId:listingId,price:price});\\n" +
    "    }\\n" +
    "    return uniqueBy(out,function(it){ return it.listingId || it.url; });\\n" +
    "  }\\n" +
    "  function parseFromItmLinks(){\\n" +
    "    var anchors = Array.prototype.slice.call(document.querySelectorAll('a[href*=\"/itm/\"]'));\\n" +
    "    var out = [];\\n" +
    "    for (var i=0;i<anchors.length;i++){\\n" +
    "      var a = anchors[i];\\n" +
    "      if (!a || !a.href) continue;\\n" +
    "      var url = String(a.href).trim();\\n" +
    "      var listingId = listingIdFromUrl(url);\\n" +
    "      if (!listingId) continue;\\n" +
    "      var container = a.closest ? (a.closest('li') || a.closest('[data-testid=\"item-card\"]') || a.closest('div')) : null;\\n" +
    "      var titleEl = container ? (container.querySelector('.s-item__title') || container.querySelector('h3') || a) : a;\\n" +
    "      var title = cleanTitle(titleEl ? (titleEl.innerText || titleEl.textContent || '') : '');\\n" +
    "      if (!title || title.length < 4) continue;\\n" +
    "      if (title.toLowerCase() === 'shop on ebay') continue;\\n" +
    "      var priceEl = container ? (container.querySelector('.s-item__price') || container.querySelector('[data-testid=\"price\"]') || container.querySelector('.x-price-primary') || container.querySelector('[class*=\"price\"]')) : null;\\n" +
    "      var priceText = priceEl ? (priceEl.innerText || priceEl.textContent || '') : '';\\n" +
    "      var price = toNumber(String(priceText).trim());\\n" +
    "      out.push({title:title,url:url,listingId:listingId,price:price});\\n" +
    "    }\\n" +
    "    return uniqueBy(out,function(it){ return it.listingId; });\\n" +
    "  }\\n" +
    "  var items = parseFromSItem();\\n" +
    "  if (!items.length) items = parseFromItmLinks();\\n" +
    "  var payload = { generatedAt: new Date().toISOString(), items: items };\\n" +
    "  var text = JSON.stringify(payload, null, 2);\\n" +
    "  try {\\n" +
    "    if (typeof copy === 'function') { copy(text); }\\n" +
    "  } catch (e) {}\\n" +
    "  console.log(text);\\n" +
    "  console.log('[Gum-Gum] Extracted ' + items.length + ' items. Copy the JSON above and paste it into the Inventory importer.');\\n" +
    "}();"
  );
}

async function copyEbaySnippet() {
  const snippet = getEbayDomSnippet();
  if (ebaySnippetField) {
    ebaySnippetField.value = snippet;
  }
  const copied = await copyToClipboard(snippet);
  if (copied) {
    showToast("Snippet copied. Paste it into your browser console on eBay.", false);
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("Clipboard copy failed:", error);
    return false;
  }
}

async function importEbayPastedJson() {
  if (!importEbayPasteBtn || !ebayPasteInput) return;

  const raw = ebayPasteInput.value.trim();
  if (!raw) {
    showToast("Paste the extracted JSON first.", true);
    return;
  }

  importEbayPasteBtn.disabled = true;
  const originalText = importEbayPasteBtn.textContent;
  importEbayPasteBtn.textContent = "Importing…";

  try {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      showToast("Invalid JSON. Re-run the snippet and paste the output.", true);
      return;
    }

    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];

    if (!items.length) {
      showToast("No items found in pasted JSON.", true);
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of items) {
      const url = (item?.url ?? "").toString().trim();
      const listingId =
        (item?.listingId ?? "").toString().trim() ||
        (url.match(/\/itm\/(\d+)/) || [])[1] ||
        "";
      const title = (item?.title ?? item?.name ?? "eBay Listing").toString().trim();
      const price = safeNumber(item?.price ?? 0);
      const availableQuantityRaw = safeInteger(item?.availableQuantity ?? item?.quantity ?? 0);

      if (!listingId && !url) {
        skipped += 1;
        continue;
      }

      const existing = inventoryCache.find(
        (entry) =>
          entry.source === "ebay" &&
          ((listingId && entry.listingId === listingId) || (url && entry.url === url))
      );

      const stock =
        availableQuantityRaw > 0
          ? availableQuantityRaw
          : Number.isFinite(existing?.stock)
            ? existing.stock
            : 1;

      const payload = {
        source: "ebay",
        sku: "",
        listingId,
        offerId: "",
        url,
        name: title,
        franchise: "other",
        setName: "eBay",
        type: "",
        condition: "unsealed",
        rarity: "",
        price,
        pricePaid: Number.isFinite(existing?.pricePaid) ? existing.pricePaid : 0,
        stock,
        notes: url
          ? `Imported from eBay (manual) • ${url}`
          : "Imported from eBay (manual)"
      };

      if (existing?.id) {
        await updateDoc(doc(inventoryRef, existing.id), {
          ...payload,
          updatedAt: serverTimestamp()
        });
        updated += 1;
      } else {
        await addDoc(inventoryRef, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        created += 1;
      }
    }

    showToast(
      `eBay paste import complete: ${created} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}.`,
      false
    );
  } catch (error) {
    console.error("eBay paste import failed:", error);
    showToast("eBay paste import failed. Check console.", true);
  } finally {
    importEbayPasteBtn.disabled = false;
    importEbayPasteBtn.textContent = originalText;
  }
}
  