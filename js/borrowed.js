// =========================================================
// BORROWED MONEY MODULE (borrowed.html)
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import {
  showToast, formatCurrency, formatDate, initials, initMobileSidebar,
  writeAuditLog, isPositiveAmount, todayDateStr, confirmAction, escapeHtml
} from "./common.js";

wireLogoutButtons();
initMobileSidebar();

let CURRENT_USER = null;
let ALL_RECORDS = [];
let EDIT_ID = null;

const listEl = document.getElementById("borrowed-list");
const emptyEl = document.getElementById("borrowed-empty");
const loadingEl = document.getElementById("borrowed-loading");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");

(async function init() {
  const { user, profile } = await requireAuth();
  CURRENT_USER = user;
  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);
  await loadBorrowed();
})();

async function loadBorrowed() {
  loadingEl.style.display = "block";
  listEl.innerHTML = "";
  emptyEl.style.display = "none";
  try {
    const snap = await getDocs(collection(db, "users", CURRENT_USER.uid, "borrowed"));
    ALL_RECORDS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error(err);
    showToast("Failed to load borrowed money records.", "error");
  } finally {
    loadingEl.style.display = "none";
  }
}

const statusBadgeClass = { Pending: "badge-pending", "Partially Paid": "badge-partial", Paid: "badge-paid" };

function render() {
  let records = [...ALL_RECORDS];

  const search = searchInput.value.trim().toLowerCase();
  if (search) records = records.filter(r => (r.borrowedFrom || "").toLowerCase().includes(search) || (r.reason || "").toLowerCase().includes(search));

  const status = statusFilter.value;
  if (status !== "all") records = records.filter(r => r.status === status);

  records.sort((a, b) => new Date(b.borrowDate) - new Date(a.borrowDate));

  if (!records.length) { listEl.innerHTML = ""; emptyEl.style.display = "block"; return; }
  emptyEl.style.display = "none";

  listEl.innerHTML = records.map(r => `
    <tr>
      <td data-label="From">${escapeHtml(r.borrowedFrom)}</td>
      <td data-label="Amount" class="cell-amount borrowed">${formatCurrency(r.amount)}</td>
      <td data-label="Remaining" class="cell-amount borrowed">${formatCurrency(r.remainingAmount ?? r.amount)}</td>
      <td data-label="Reason">${escapeHtml(r.reason || "—")}</td>
      <td data-label="Borrow Date">${formatDate(r.borrowDate)}</td>
      <td data-label="Due Date">${formatDate(r.dueDate)}</td>
      <td data-label="Status"><span class="badge ${statusBadgeClass[r.status] || "badge-pending"}">${escapeHtml(r.status)}</span></td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn" data-edit="${r.id}" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn danger" data-delete="${r.id}" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
        </div>
      </td>
    </tr>
  `).join("");

  listEl.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openModal(btn.dataset.edit)));
  listEl.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => handleDelete(btn.dataset.delete)));
}

[searchInput, statusFilter].forEach(el => el.addEventListener("input", render));

/* ---------------- Modal ---------------- */

const modal = document.getElementById("borrowed-modal");
const form = document.getElementById("borrowed-form");
const modalTitle = document.getElementById("modal-title");
const submitBtn = document.getElementById("borrowed-submit");

document.getElementById("open-add-borrowed").addEventListener("click", () => openModal(null));
document.querySelectorAll("[data-modal-close]").forEach(el => el.addEventListener("click", closeModal));
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function openModal(id) {
  EDIT_ID = id;
  form.reset();
  clearErrors();
  if (id) {
    const rec = ALL_RECORDS.find(r => r.id === id);
    modalTitle.textContent = "Edit Borrowed Money";
    document.getElementById("f-borrowedFrom").value = rec.borrowedFrom;
    document.getElementById("f-amount").value = rec.amount;
    document.getElementById("f-reason").value = rec.reason || "";
    document.getElementById("f-borrowDate").value = rec.borrowDate;
    document.getElementById("f-dueDate").value = rec.dueDate || "";
    document.getElementById("f-notes").value = rec.notes || "";
  } else {
    modalTitle.textContent = "Add Borrowed Money";
    document.getElementById("f-borrowDate").value = todayDateStr();
  }
  modal.classList.add("active");
}

function closeModal() { modal.classList.remove("active"); EDIT_ID = null; }
function clearErrors() { form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error")); }
function fieldEl(id) { return document.getElementById(id); }

function validateForm() {
  clearErrors();
  let valid = true;
  if (!fieldEl("f-borrowedFrom").value.trim()) { fieldEl("f-borrowedFrom").classList.add("field-error"); valid = false; }
  if (!isPositiveAmount(fieldEl("f-amount").value)) { fieldEl("f-amount").classList.add("field-error"); valid = false; }
  if (!fieldEl("f-borrowDate").value) { fieldEl("f-borrowDate").classList.add("field-error"); valid = false; }
  return valid;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) { showToast("Please fill in all required fields.", "error"); return; }

  submitBtn.disabled = true;
  submitBtn.querySelector(".spinner")?.classList.add("active");

  const amount = Number(fieldEl("f-amount").value);

  try {
    if (EDIT_ID) {
      const before = ALL_RECORDS.find(r => r.id === EDIT_ID);
      const totalRepaid = before.totalRepaid || 0;
      const remainingAmount = Math.max(0, amount - totalRepaid);
      const status = remainingAmount <= 0 ? "Paid" : (totalRepaid > 0 ? "Partially Paid" : "Pending");

      const payload = {
        borrowedFrom: fieldEl("f-borrowedFrom").value.trim(),
        amount, reason: fieldEl("f-reason").value.trim(),
        borrowDate: fieldEl("f-borrowDate").value,
        dueDate: fieldEl("f-dueDate").value || null,
        notes: fieldEl("f-notes").value.trim(),
        totalRepaid, remainingAmount, status,
        updatedAt: serverTimestamp(), updatedBy: CURRENT_USER.uid
      };

      await updateDoc(doc(db, "users", CURRENT_USER.uid, "borrowed", EDIT_ID), payload);
      await writeAuditLog({ action: "UPDATE", targetUser: CURRENT_USER.uid, targetRecord: EDIT_ID, recordType: "borrowed", oldValue: before, newValue: payload, reason: "Edited via Borrowed Money module" });
      showToast("Borrowed money record updated.", "success");
    } else {
      const payload = {
        borrowedFrom: fieldEl("f-borrowedFrom").value.trim(),
        amount, reason: fieldEl("f-reason").value.trim(),
        borrowDate: fieldEl("f-borrowDate").value,
        dueDate: fieldEl("f-dueDate").value || null,
        notes: fieldEl("f-notes").value.trim(),
        totalRepaid: 0, remainingAmount: amount, status: "Pending",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        createdBy: CURRENT_USER.uid, updatedBy: CURRENT_USER.uid, userId: CURRENT_USER.uid
      };
      const ref = await addDoc(collection(db, "users", CURRENT_USER.uid, "borrowed"), payload);
      await writeAuditLog({ action: "CREATE", targetUser: CURRENT_USER.uid, targetRecord: ref.id, recordType: "borrowed", newValue: payload });
      showToast("Borrowed record created.", "success");
    }
    closeModal();
    await loadBorrowed();
  } catch (err) {
    console.error(err);
    showToast("Failed to save borrowed money record.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector(".spinner")?.classList.remove("active");
  }
});

async function handleDelete(id) {
  if (!confirmAction("Delete this borrowed money record? Related repayments will remain but lose their link. This cannot be undone.")) return;
  try {
    const before = ALL_RECORDS.find(r => r.id === id);
    await deleteDoc(doc(db, "users", CURRENT_USER.uid, "borrowed", id));
    await writeAuditLog({ action: "DELETE", targetUser: CURRENT_USER.uid, targetRecord: id, recordType: "borrowed", oldValue: before });
    showToast("Borrowed money record deleted.", "success");
    await loadBorrowed();
  } catch (err) {
    console.error(err);
    showToast("Failed to delete borrowed money record.", "error");
  }
}

// Exposed so repayments.js can pull the live borrowed list for its dropdown.
export function getBorrowedRecords() { return ALL_RECORDS; }
