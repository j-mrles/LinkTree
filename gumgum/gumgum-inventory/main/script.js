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

const searchBar = document.getElementById("searchBar");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const addItemBtn = document.getElementById("addItemBtn");
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
const cardFranchiseField = document.getElementById("cardFranchise");
const cardSetField = document.getElementById("cardSet");
const cardTypeField = document.getElementById("cardType");
const cardRarityField = document.getElementById("cardRarity");
const cardPriceField = document.getElementById("cardPrice");
const cardStockField = document.getElementById("cardStock");
const cardNotesField = document.getElementById("cardNotes");
const cardConditionField = document.getElementById("cardCondition");

let inventoryCache = [];

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
          name: data.name ?? "",
          franchise: normalizeFranchise(data.franchise),
          setName: data.setName ?? "",
          type: data.type ?? "",
          condition: normalizeCondition(data.condition),
          rarity: data.rarity ?? "",
          price: safeNumber(data.price),
          stock: safeInteger(data.stock),
          notes: data.notes ?? "",
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null
        };
      })
      .sort(compareInventoryItems);

    renderTable(filterInventory(searchBar.value));
    updateSummary();
    updateLastSynced();
  },
  (error) => {
    console.error("Error listening to Firestore updates:", error);
    showToast("Realtime updates failed. Check console.", true);
  }
);

searchBar.addEventListener("input", (event) => {
  const filtered = filterInventory(event.target.value);
    renderTable(filtered);
  });
  
clearSearchBtn.addEventListener("click", () => {
  searchBar.value = "";
  renderTable(inventoryCache);
  searchBar.focus();
});

addItemBtn.addEventListener("click", () => openModal("create"));
closeModalBtn.addEventListener("click", closeModal);
cancelModalBtn.addEventListener("click", closeModal);

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

function filterInventory(inputValue) {
  const queryValue = (inputValue ?? "").trim().toLowerCase();
  if (!queryValue) return [...inventoryCache];

  return inventoryCache.filter((item) => {
    const haystack = [
      item.name,
      item.franchise,
      formatFranchise(item.franchise),
      item.setName,
      item.type,
      item.condition,
      formatCondition(item.condition),
      item.rarity,
      item.notes
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(queryValue);
  });
}

function renderTable(data) {
  if (!data.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="table-empty">
            <p>No cards match that search.</p>
            <button type="button" class="secondary-btn" id="resetSearchBtn">Reset search</button>
          </div>
        </td>
      </tr>
    `;

    const resetButton = document.getElementById("resetSearchBtn");
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        searchBar.value = "";
        renderTable(inventoryCache);
        searchBar.focus();
      });
    }

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
      return `
        <tr data-id="${item.id}">
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.setName || "—")}</small>
          </td>
          <td>${escapeHtml(formatFranchise(item.franchise))}</td>
          <td><span class="${conditionClass}">${escapeHtml(formatCondition(item.condition))}</span></td>
          <td>${escapeHtml(item.type || "—")}</td>
          <td>${escapeHtml(item.rarity || "—")}${notesIcon}</td>
          <td>${formatCurrency(item.price)}</td>
          <td><span class="${stockClass}">${item.stock}</span></td>
          <td>${formatDate(item.updatedAt)}</td>
          <td class="actions">
            <button type="button" class="action-btn edit-btn">Edit</button>
            <button type="button" class="action-btn delete-btn">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tableBody.innerHTML = rows;
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
  modalBackdrop.removeAttribute("hidden");
  document.body.classList.add("modal-open");
  itemForm.reset();
  cardIdField.value = "";
  cardFranchiseField.value = "other";
  cardConditionField.value = "sealed";

  if (mode === "edit" && card) {
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
    cardStockField.value = card.stock;
    cardNotesField.value = card.notes;
  } else {
    modalTitle.textContent = "Add Card";
    modalSubtitle.textContent = "Create a new entry for your inventory.";
    submitBtn.textContent = "Save Card";
  }

  setTimeout(() => {
    cardNameField.focus();
  }, 50);
}

function closeModal() {
  modalBackdrop.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
  itemForm.reset();
  cardIdField.value = "";
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

  addItemBtn.disabled = true;
  addItemBtn.title = "Configure Firebase to enable inventory management.";
  searchBar.disabled = true;
  clearSearchBtn.disabled = true;

  tableBody.innerHTML = `
    <tr>
      <td colspan="9">
        <div class="table-empty">
          <p>Inventory is offline. Add your Firebase config in <code>gumgum/gumgum-inventory/main/script.js</code> to connect.</p>
        </div>
      </td>
    </tr>
  `;

  showToast("Add your Firebase config to enable the inventory.", true);
}
  