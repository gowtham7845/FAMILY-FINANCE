// =========================================================
// REPAYMENT MODULE (repayments.html)
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import {
  showToast, formatCurrency, formatDate, formatTime12h, initials, initMobileSidebar,
  writeAuditLog, writeTransactionRecord, isPositiveAmount, todayDateStr, nowTimeStr, confirmAction, escapeHtml
} from "./common.js";

wireLogoutButtons();
initMobileSidebar();

let CURRENT_USER = null;
let ALL_REPAYMENTS = [];
let ALL_BORROWED = [];
let EDIT_ID = null;

const listEl = document.getElementById("repayment-list");
const emptyEl = document.getElementById("repayment-empty");
const loadingEl = document.getElementById("repayment-loading");
const searchInput = document.getElementById("search-input");
const borrowedSelect = document.getElementById("f-borrowedId");
const remainingHint = document.getElementById("remaining-hint");

(async function init() {
  const { user, profile } = await requireAuth();
  CURRENT_USER = user;
  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);
  await loadAll();
})();

async function loadAll() {
  loadingEl.style.display = "block";
  listEl.innerHTML = "";
  emptyEl.style.display = "none";
  try {
    const [repaySnap, borrowedSnap] = await Promise.all([
      getDocs(collection(db, "users", CURRENT_USER.uid, "repayments")),
      getDocs(collection(db, "users", CURRENT_USER.uid, "borrowed"))
    ]);
    ALL_REPAYMENTS = repaySnap.docs.map(d => ({ id: d.id, ...d.data() }));
    ALL_BORROWED = borrowedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateBorrowedSelect();
    render();
  } catch (err) {
    console.error(err);
    showToast("Failed to load repayment records.", "error");
  } finally {
    loadingEl.style.display = "none";
  }
}

function populateBorrowedSelect() {
  const outstanding = ALL_BORROWED.filter(b => (b.remainingAmount ?? b.amount) > 0);
  if (!outstanding.length) {
    borrowedSelect.innerHTML = `<option value="">No outstanding borrowed records</option>`;
    document.getElementById("open-add-repayment").disabled = outstanding.length === 0 && ALL_BORROWED.length === 0;
    return;
  }
  borrowedSelect.innerHTML = outstanding.map(b =>
    `<option value="${b.id}">${escapeHtml(b.borrowedFrom)} — ${formatCurrency(b.remainingAmount ?? b.amount)} remaining</option>`
  ).join("");
  updateRemainingHint();
}

function updateRemainingHint() {
  const b = ALL_BORROWED.find(x => x.id === borrowedSelect.value);
  remainingHint.textContent = b ? `Outstanding: ${formatCurrency(b.remainingAmount ?? b.amount)}` : "";
}
borrowedSelect.addEventListener("change", updateRemainingHint);

function borrowedLabel(id) {
  const b = ALL_BORROWED.find(x => x.id === id);
  return b ? b.borrowedFrom : "Deleted record";
}

function render() {
  let records = [...ALL_REPAYMENTS];
  const search = searchInput.value.trim().toLowerCase();
  if (search) records = records.filter(r => borrowedLabel(r.borrowedId).toLowerCase().includes(search) || (r.notes || "").toLowerCase().includes(search));

  records.sort((a, b) => new Date(`${b.repaymentDate}T${b.repaymentTime || "00:00"}`) - new Date(`${a.repaymentDate}T${a.repaymentTime || "00:00"}`));

  if (!records.length) { listEl.innerHTML = ""; emptyEl.style.display = "block"; return; }
  emptyEl.style.display = "none";

  listEl.innerHTML = records.map(r => `
    <tr>
      <td data-label="Borrowed From">${escapeHtml(borrowedLabel(r.borrowedId))}</td>
      <td data-label="Amount" class="cell-amount repayment">${formatCurrency(r.repaymentAmount)}</td>
      <td data-label="Date">${formatDate(r.repaymentDate)}</td>
      <td data-label="Time" class="cell-muted">${formatTime12h(r.repaymentTime)}</td>
      <td data-label="Notes">${escapeHtml(r.notes || "—")}</td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn danger" data-delete="${r.id}" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
        </div>
      </td>
    </tr>
  `).join("");

  listEl.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => handleDelete(btn.dataset.delete)));
}

searchInput.addEventListener("input", render);

/* ---------------- Modal ---------------- */

const modal = document.getElementById("repayment-modal");
const form = document.getElementById("repayment-form");
const submitBtn = document.getElementById("repayment-submit");

document.getElementById("open-add-repayment").addEventListener("click", () => {
  if (!ALL_BORROWED.filter(b => (b.remainingAmount ?? b.amount) > 0).length) {
    showToast("There are no outstanding borrowed records to repay.", "info");
    return;
  }
  form.reset();
  clearErrors();
  populateBorrowedSelect();
  document.getElementById("f-repaymentDate").value = todayDateStr();
  document.getElementById("f-repaymentTime").value = nowTimeStr();
  modal.classList.add("active");
});

document.querySelectorAll("[data-modal-close]").forEach(el => el.addEventListener("click", () => modal.classList.remove("active")));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

function clearErrors() { form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error")); }
function fieldEl(id) { return document.getElementById(id); }

function validateForm() {
  clearErrors();
  let valid = true;
  if (!fieldEl("f-borrowedId").value) { fieldEl("f-borrowedId").classList.add("field-error"); valid = false; }
  const amount = fieldEl("f-repaymentAmount").value;
  if (!isPositiveAmount(amount)) { fieldEl("f-repaymentAmount").classList.add("field-error"); valid = false; }
  if (!fieldEl("f-repaymentDate").value) { fieldEl("f-repaymentDate").classList.add("field-error"); valid = false; }

  const b = ALL_BORROWED.find(x => x.id === fieldEl("f-borrowedId").value);
  if (b && valid) {
    const outstanding = b.remainingAmount ?? b.amount;
    if (Number(amount) > outstanding) {
      fieldEl("f-repaymentAmount").classList.add("field-error");
      showToast(`Repayment cannot exceed the outstanding amount of ${formatCurrency(outstanding)}.`, "error");
      valid = false;
    }
  }
  return valid;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  submitBtn.disabled = true;
  submitBtn.querySelector(".spinner")?.classList.add("active");

  const borrowedId = fieldEl("f-borrowedId").value;
  const repaymentAmount = Number(fieldEl("f-repaymentAmount").value);
  const repaymentDate = fieldEl("f-repaymentDate").value;
  const repaymentTime = fieldEl("f-repaymentTime").value || nowTimeStr();
  const notes = fieldEl("f-notes").value.trim();

  try {
    // 1. Re-fetch the borrowed doc fresh to avoid stale-total race conditions.
    const borrowedRef = doc(db, "users", CURRENT_USER.uid, "borrowed", borrowedId);
    const borrowedSnap = await getDoc(borrowedRef);
    if (!borrowedSnap.exists()) throw new Error("Borrowed record no longer exists.");
    const borrowed = borrowedSnap.data();

    const currentOutstanding = borrowed.remainingAmount ?? borrowed.amount;
    if (repaymentAmount > currentOutstanding) {
      showToast(`Repayment cannot exceed the outstanding amount of ${formatCurrency(currentOutstanding)}.`, "error");
      return;
    }

    // 2. Create the repayment record.
    const repayPayload = { borrowedId, repaymentAmount, repaymentDate, repaymentTime, notes, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: CURRENT_USER.uid, userId: CURRENT_USER.uid };
    const repayRef = await addDoc(collection(db, "users", CURRENT_USER.uid, "repayments"), repayPayload);

    // 3. Recalculate the borrowed record.
    const newTotalRepaid = (borrowed.totalRepaid || 0) + repaymentAmount;
    const newRemaining = Math.max(0, borrowed.amount - newTotalRepaid);
    const newStatus = newRemaining <= 0 ? "Paid" : "Partially Paid";

    await updateDoc(borrowedRef, {
      totalRepaid: newTotalRepaid,
      remainingAmount: newRemaining,
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: CURRENT_USER.uid
    });

    // 4. Mirror into transactions feed.
    await writeTransactionRecord(CURRENT_USER.uid, {
      type: "REPAYMENT", amount: repaymentAmount, category: borrowed.borrowedFrom, reason: notes || `Repayment to ${borrowed.borrowedFrom}`,
      date: repaymentDate, time: repaymentTime, sourceCollection: "repayments", sourceId: repayRef.id
    });

    // 5. Audit trail.
    await writeAuditLog({ action: "CREATE", targetUser: CURRENT_USER.uid, targetRecord: repayRef.id, recordType: "repayments", newValue: repayPayload });
    await writeAuditLog({
      action: "UPDATE", targetUser: CURRENT_USER.uid, targetRecord: borrowedId, recordType: "borrowed",
      oldValue: { totalRepaid: borrowed.totalRepaid || 0, remainingAmount: currentOutstanding, status: borrowed.status },
      newValue: { totalRepaid: newTotalRepaid, remainingAmount: newRemaining, status: newStatus },
      reason: "Auto-updated by repayment"
    });

    showToast("Repayment added successfully.", "success");
    modal.classList.remove("active");
    await loadAll();
  } catch (err) {
    console.error(err);
    showToast("Failed to save repayment.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector(".spinner")?.classList.remove("active");
  }
});

async function handleDelete(id) {
  if (!confirmAction("Delete this repayment? The borrowed record's outstanding balance will be restored. This cannot be undone.")) return;
  try {
    const repay = ALL_REPAYMENTS.find(r => r.id === id);
    await deleteDoc(doc(db, "users", CURRENT_USER.uid, "repayments", id));

    const borrowedRef = doc(db, "users", CURRENT_USER.uid, "borrowed", repay.borrowedId);
    const borrowedSnap = await getDoc(borrowedRef);
    if (borrowedSnap.exists()) {
      const borrowed = borrowedSnap.data();
      const newTotalRepaid = Math.max(0, (borrowed.totalRepaid || 0) - repay.repaymentAmount);
      const newRemaining = Math.max(0, borrowed.amount - newTotalRepaid);
      const newStatus = newRemaining <= 0 ? "Paid" : (newTotalRepaid > 0 ? "Partially Paid" : "Pending");
      await updateDoc(borrowedRef, { totalRepaid: newTotalRepaid, remainingAmount: newRemaining, status: newStatus, updatedAt: serverTimestamp(), updatedBy: CURRENT_USER.uid });
    }

    await writeAuditLog({ action: "DELETE", targetUser: CURRENT_USER.uid, targetRecord: id, recordType: "repayments", oldValue: repay });
    showToast("Transaction deleted.", "success");
    await loadAll();
  } catch (err) {
    console.error(err);
    showToast("Failed to delete repayment.", "error");
  }
}
