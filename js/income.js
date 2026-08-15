// =========================================================
// INCOME MODULE (income.html)
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import {
  showToast, formatCurrency, formatDate, formatTime12h, initials, initMobileSidebar,
  writeAuditLog, writeTransactionRecord, isPositiveAmount, todayDateStr, nowTimeStr, confirmAction, escapeHtml
} from "./common.js";

wireLogoutButtons();
initMobileSidebar();

let CURRENT_USER = null;
let ALL_RECORDS = [];
let EDIT_ID = null;

const listEl = document.getElementById("income-list");
const emptyEl = document.getElementById("income-empty");
const loadingEl = document.getElementById("income-loading");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const sourceFilter = document.getElementById("source-filter");

(async function init() {
  const { user, profile } = await requireAuth();
  CURRENT_USER = user;
  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);
  await loadIncome();
})();

async function loadIncome() {
  loadingEl.style.display = "block";
  listEl.innerHTML = "";
  emptyEl.style.display = "none";
  try {
    const snap = await getDocs(collection(db, "users", CURRENT_USER.uid, "income"));
    ALL_RECORDS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error(err);
    showToast("Failed to load income records.", "error");
  } finally {
    loadingEl.style.display = "none";
  }
}

function render() {
  let records = [...ALL_RECORDS];

  const search = searchInput.value.trim().toLowerCase();
  if (search) {
    records = records.filter(r =>
      (r.description || "").toLowerCase().includes(search) ||
      (r.source || "").toLowerCase().includes(search)
    );
  }

  const source = sourceFilter.value;
  if (source !== "all") records = records.filter(r => r.source === source);

  const sort = sortSelect.value;
  records.sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time || "00:00"}`);
    const dateB = new Date(`${b.date}T${b.time || "00:00"}`);
    if (sort === "newest") return dateB - dateA;
    if (sort === "oldest") return dateA - dateB;
    if (sort === "highest") return Number(b.amount) - Number(a.amount);
    if (sort === "lowest") return Number(a.amount) - Number(b.amount);
    return 0;
  });

  if (!records.length) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  listEl.innerHTML = records.map(r => `
    <tr>
      <td data-label="Source"><span class="badge badge-income">${escapeHtml(r.source)}</span></td>
      <td data-label="Amount" class="cell-amount income">${formatCurrency(r.amount)}</td>
      <td data-label="Description">${escapeHtml(r.description || "—")}</td>
      <td data-label="Date">${formatDate(r.date)}</td>
      <td data-label="Time" class="cell-muted">${formatTime12h(r.time)}</td>
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

[searchInput, sortSelect, sourceFilter].forEach(el => el.addEventListener("input", render));

/* ---------------- Modal (Add / Edit) ---------------- */

const modal = document.getElementById("income-modal");
const form = document.getElementById("income-form");
const modalTitle = document.getElementById("modal-title");
const submitBtn = document.getElementById("income-submit");

document.getElementById("open-add-income").addEventListener("click", () => openModal(null));
document.querySelectorAll("[data-modal-close]").forEach(el => el.addEventListener("click", closeModal));
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function openModal(id) {
  EDIT_ID = id;
  form.reset();
  clearErrors();
  if (id) {
    const rec = ALL_RECORDS.find(r => r.id === id);
    modalTitle.textContent = "Edit Income";
    document.getElementById("f-source").value = rec.source;
    document.getElementById("f-amount").value = rec.amount;
    document.getElementById("f-description").value = rec.description || "";
    document.getElementById("f-date").value = rec.date;
    document.getElementById("f-time").value = rec.time || "";
  } else {
    modalTitle.textContent = "Add Income";
    document.getElementById("f-date").value = todayDateStr();
    document.getElementById("f-time").value = nowTimeStr();
  }
  modal.classList.add("active");
}

function closeModal() { modal.classList.remove("active"); EDIT_ID = null; }

function clearErrors() {
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
}

function fieldEl(id) { return document.getElementById(id); }

function validateForm() {
  clearErrors();
  let valid = true;
  const amount = fieldEl("f-amount").value;
  const date = fieldEl("f-date").value;

  if (!isPositiveAmount(amount)) { fieldEl("f-amount").classList.add("field-error"); valid = false; }
  if (!date) { fieldEl("f-date").classList.add("field-error"); valid = false; }
  if (!fieldEl("f-source").value) { fieldEl("f-source").classList.add("field-error"); valid = false; }

  return valid;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) { showToast("Please fill in all required fields.", "error"); return; }

  submitBtn.disabled = true;
  submitBtn.querySelector(".spinner")?.classList.add("active");

  const payload = {
    source: fieldEl("f-source").value,
    amount: Number(fieldEl("f-amount").value),
    description: fieldEl("f-description").value.trim(),
    date: fieldEl("f-date").value,
    time: fieldEl("f-time").value || nowTimeStr(),
    updatedAt: serverTimestamp(),
    updatedBy: CURRENT_USER.uid
  };

  try {
    if (EDIT_ID) {
      const before = ALL_RECORDS.find(r => r.id === EDIT_ID);
      await updateDoc(doc(db, "users", CURRENT_USER.uid, "income", EDIT_ID), payload);
      await writeAuditLog({
        action: "UPDATE", targetUser: CURRENT_USER.uid, targetRecord: EDIT_ID, recordType: "income",
        oldValue: before, newValue: payload, reason: "Edited via Income module"
      });
      showToast("Income updated successfully.", "success");
    } else {
      const ref = await addDoc(collection(db, "users", CURRENT_USER.uid, "income"), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: CURRENT_USER.uid,
        userId: CURRENT_USER.uid
      });
      await writeTransactionRecord(CURRENT_USER.uid, {
        type: "INCOME", amount: payload.amount, category: payload.source, reason: payload.description,
        date: payload.date, time: payload.time, sourceCollection: "income", sourceId: ref.id
      });
      await writeAuditLog({ action: "CREATE", targetUser: CURRENT_USER.uid, targetRecord: ref.id, recordType: "income", newValue: payload });
      showToast("Income added successfully.", "success");
    }
    closeModal();
    await loadIncome();
  } catch (err) {
    console.error(err);
    showToast("Failed to save income record.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector(".spinner")?.classList.remove("active");
  }
});

async function handleDelete(id) {
  if (!confirmAction("Delete this income record? This cannot be undone.")) return;
  try {
    const before = ALL_RECORDS.find(r => r.id === id);
    await deleteDoc(doc(db, "users", CURRENT_USER.uid, "income", id));
    await writeAuditLog({ action: "DELETE", targetUser: CURRENT_USER.uid, targetRecord: id, recordType: "income", oldValue: before });
    showToast("Income record deleted.", "success");
    await loadIncome();
  } catch (err) {
    console.error(err);
    showToast("Failed to delete income record.", "error");
  }
}
