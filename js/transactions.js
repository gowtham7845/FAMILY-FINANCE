// =========================================================
// TRANSACTION HISTORY (transactions.html)
// =========================================================

import { db } from "./firebase-config.js";
import { collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import {
  showToast, formatCurrency, formatDate, formatTime12h, timestampToDateTime, initials,
  initMobileSidebar, writeAuditLog, confirmAction, escapeHtml
} from "./common.js";

wireLogoutButtons();
initMobileSidebar();

let CURRENT_USER = null;
let ALL_TXNS = [];

const listEl = document.getElementById("txn-list");
const emptyEl = document.getElementById("txn-empty");
const loadingEl = document.getElementById("txn-loading");
const searchInput = document.getElementById("search-input");
const typeFilter = document.getElementById("type-filter");
const sortSelect = document.getElementById("sort-select");

const typeBadge = { INCOME: "badge-income", EXPENSE: "badge-expense", BORROWED: "badge-borrowed", REPAYMENT: "badge-repayment" };
const amountClass = { INCOME: "income", EXPENSE: "expense", BORROWED: "borrowed", REPAYMENT: "repayment" };

(async function init() {
  const { user, profile } = await requireAuth();
  CURRENT_USER = user;
  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);
  await loadTransactions();
})();

async function loadTransactions() {
  loadingEl.style.display = "block";
  listEl.innerHTML = "";
  emptyEl.style.display = "none";
  try {
    const snap = await getDocs(collection(db, "users", CURRENT_USER.uid, "transactions"));
    ALL_TXNS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error(err);
    showToast("Failed to load transaction history.", "error");
  } finally {
    loadingEl.style.display = "none";
  }
}

function render() {
  let records = [...ALL_TXNS];

  const search = searchInput.value.trim().toLowerCase();
  if (search) records = records.filter(r =>
    (r.reason || "").toLowerCase().includes(search) || (r.category || "").toLowerCase().includes(search)
  );

  const type = typeFilter.value;
  if (type !== "all") records = records.filter(r => r.type === type);

  const sort = sortSelect.value;
  records.sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time || "00:00"}`);
    const dateB = new Date(`${b.date}T${b.time || "00:00"}`);
    return sort === "oldest" ? dateA - dateB : dateB - dateA;
  });

  if (!records.length) { listEl.innerHTML = ""; emptyEl.style.display = "block"; return; }
  emptyEl.style.display = "none";

  listEl.innerHTML = records.map(r => `
    <tr>
      <td data-label="Date">${formatDate(r.date)}</td>
      <td data-label="Time" class="cell-muted">${formatTime12h(r.time)}</td>
      <td data-label="Type"><span class="badge ${typeBadge[r.type] || ""}">${r.type}</span></td>
      <td data-label="Amount" class="cell-amount ${amountClass[r.type] || ""}">${formatCurrency(r.amount)}</td>
      <td data-label="Category">${escapeHtml(r.category || "—")}</td>
      <td data-label="Reason">${escapeHtml(r.reason || "—")}</td>
      <td data-label="Created">${timestampToDateTime(r.createdAt)}</td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn danger" data-delete="${r.id}" data-source="${r.sourceCollection}" data-sourceid="${r.sourceId}" aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  listEl.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => handleDelete(btn)));
}

[searchInput, typeFilter, sortSelect].forEach(el => el.addEventListener("input", render));

async function handleDelete(btn) {
  if (!confirmAction("Delete this transaction? This removes the underlying record as well and cannot be undone.")) return;
  const txnId = btn.dataset.delete;
  const sourceCollection = btn.dataset.source;
  const sourceId = btn.dataset.sourceid;

  try {
    await deleteDoc(doc(db, "users", CURRENT_USER.uid, "transactions", txnId));
    if (sourceCollection && sourceId && sourceCollection !== "undefined") {
      await deleteDoc(doc(db, "users", CURRENT_USER.uid, sourceCollection, sourceId)).catch(() => {});
    }
    await writeAuditLog({ action: "DELETE", targetUser: CURRENT_USER.uid, targetRecord: txnId, recordType: "transactions" });
    showToast("Transaction deleted.", "success");
    await loadTransactions();
  } catch (err) {
    console.error(err);
    showToast("Failed to delete transaction.", "error");
  }
}
