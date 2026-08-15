// =========================================================
// MASTER CONTROL (master-control.html)
//
// This page is only reachable by a UID with a document at
// authorizedAdmins/{uid} — enforced both by guard.js (redirects
// a non-master away before this file's data even loads) AND by
// firestore.rules (so a direct API call cannot bypass the guard).
// =========================================================

import { db, auth } from "./firebase-config.js";
import {
  collection, collectionGroup, getDocs, doc, getDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import {
  showToast, formatCurrency, formatDate, timestampToDateTime, initials, initMobileSidebar,
  writeAuditLog, escapeHtml, confirmAction, isPositiveAmount
} from "./common.js";

wireLogoutButtons();
initMobileSidebar();

let ALL_USERS = [];               // { id, fullName, email, phone, accountType, status, createdAt }
let USER_MAP = {};                // uid -> user object, for quick lookup
let ALL_FINANCE = [];             // normalized finance records across the whole family
let ALL_AUDIT = [];
let EDIT_FINANCE_TARGET = null;   // { uid, coll, id, record }
let EDIT_USER_TARGET = null;      // uid

/* ---------------------------- Tabs ---------------------------- */

document.querySelectorAll("[data-tab-link]").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const tab = link.getAttribute("data-tab-link");
    document.querySelectorAll("[data-tab-link]").forEach(l => l.classList.remove("active"));
    link.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
    document.getElementById(`tab-${tab}`).style.display = "block";
  });
});

/* ---------------------------- Init ---------------------------- */

(async function init() {
  const { user, profile } = await requireAuth();
  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);

  await Promise.all([loadUsers(), loadFinance(), loadAudit()]);
  renderOverview();
  renderUsers();
  renderFinance();
  renderAudit();
})();

/* ---------------------------- Data loading ---------------------------- */

async function loadUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    ALL_USERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    USER_MAP = {};
    ALL_USERS.forEach(u => USER_MAP[u.id] = u);
  } catch (err) {
    console.error(err);
    showToast("Failed to load family members. Check your Master Control authorization.", "error");
  }
}

async function loadFinance() {
  try {
    const [incomeSnap, expenseSnap, borrowedSnap, repaymentSnap] = await Promise.all([
      getDocs(collectionGroup(db, "income")),
      getDocs(collectionGroup(db, "expenses")),
      getDocs(collectionGroup(db, "borrowed")),
      getDocs(collectionGroup(db, "repayments"))
    ]);

    const fromSnap = (snap, type, amountField, dateField, descriptorField) =>
      snap.docs.map(d => {
        const data = d.data();
        const uid = d.ref.parent.parent?.id;
        return {
          type, uid, id: d.id, coll: d.ref.parent.id,
          amount: Number(data[amountField] || 0),
          descriptor: data[descriptorField] || "",
          reason: data.reason || data.notes || data.description || "",
          date: data[dateField] || "",
          raw: data
        };
      });

    ALL_FINANCE = [
      ...fromSnap(incomeSnap, "income", "amount", "date", "source"),
      ...fromSnap(expenseSnap, "expense", "amount", "date", "category"),
      ...fromSnap(borrowedSnap, "borrowed", "amount", "borrowDate", "borrowedFrom"),
      ...fromSnap(repaymentSnap, "repayment", "repaymentAmount", "repaymentDate", "")
    ];
  } catch (err) {
    console.error(err);
    showToast("Failed to load family financial records.", "error");
  }
}

async function loadAudit() {
  try {
    const snap = await getDocs(collection(db, "auditLogs"));
    ALL_AUDIT = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
  } catch (err) {
    console.error(err);
    showToast("Failed to load audit log.", "error");
  }
}

/* ---------------------------- Overview ---------------------------- */

function renderOverview() {
  const active = ALL_USERS.filter(u => u.status !== "disabled").length;
  const disabled = ALL_USERS.filter(u => u.status === "disabled").length;

  const totalIncome = sumByType("income");
  const totalExpense = sumByType("expense");
  const totalBorrowed = sumByType("borrowed");
  const totalRepayment = sumByType("repayment");

  const borrowedRecords = ALL_FINANCE.filter(f => f.type === "borrowed");
  const outstanding = borrowedRecords.reduce((s, b) => s + Number(b.raw.remainingAmount ?? b.amount), 0);

  set("mc-total-members", ALL_USERS.length);
  set("mc-active-members", active);
  set("mc-disabled-members", disabled);
  set("mc-total-income", formatCurrency(totalIncome));
  set("mc-total-expense", formatCurrency(totalExpense));
  set("mc-total-borrowed", formatCurrency(totalBorrowed));
  set("mc-total-repayment", formatCurrency(totalRepayment));
  set("mc-outstanding", formatCurrency(outstanding));
}

function sumByType(type) {
  return ALL_FINANCE.filter(f => f.type === type).reduce((s, f) => s + f.amount, 0);
}
function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

/* ---------------------------- User Management ---------------------------- */

const userSearch = document.getElementById("user-search");
userSearch.addEventListener("input", renderUsers);

function renderUsers() {
  const listEl = document.getElementById("users-list");
  const emptyEl = document.getElementById("users-empty");
  const loadingEl = document.getElementById("users-loading");
  loadingEl.style.display = "none";

  const q = userSearch.value.trim().toLowerCase();
  let users = [...ALL_USERS];
  if (q) users = users.filter(u => (u.fullName || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  users.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

  if (!users.length) { listEl.innerHTML = ""; emptyEl.style.display = "block"; return; }
  emptyEl.style.display = "none";

  listEl.innerHTML = users.map(u => `
    <tr>
      <td data-label="Name">${escapeHtml(u.fullName || "—")}</td>
      <td data-label="Email">${escapeHtml(u.email || "—")}</td>
      <td data-label="Phone">${escapeHtml(u.phone || "—")}</td>
      <td data-label="Type"><span class="badge ${u.accountType === "master" ? "badge-master" : "badge-normal"}">${escapeHtml((u.accountType || "normal").toUpperCase())}</span></td>
      <td data-label="Status"><span class="badge ${u.status === "disabled" ? "badge-disabled" : "badge-active"}">${u.status === "disabled" ? "Disabled" : "Active"}</span></td>
      <td data-label="Created">${timestampToDateTime(u.createdAt)}</td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn" data-view-user="${u.id}" aria-label="View"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="icon-btn" data-edit-user="${u.id}" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          ${u.status === "disabled"
            ? `<button class="icon-btn" data-enable-user="${u.id}" aria-label="Enable"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>`
            : `<button class="icon-btn danger" data-disable-user="${u.id}" aria-label="Disable"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M8 8l8 8"/></svg></button>`}
        </div>
      </td>
    </tr>
  `).join("");
}

document.getElementById("users-list").addEventListener("click", async (e) => {
  const viewId = e.target.closest("[data-view-user]")?.getAttribute("data-view-user");
  const editId = e.target.closest("[data-edit-user]")?.getAttribute("data-edit-user");
  const enableId = e.target.closest("[data-enable-user]")?.getAttribute("data-enable-user");
  const disableId = e.target.closest("[data-disable-user]")?.getAttribute("data-disable-user");

  if (viewId) openViewUser(viewId);
  if (editId) openEditUser(editId);
  if (enableId) await toggleUserStatus(enableId, "active");
  if (disableId) await toggleUserStatus(disableId, "disabled");
});

function openViewUser(uid) {
  const u = USER_MAP[uid];
  if (!u) return;
  const records = ALL_FINANCE.filter(f => f.uid === uid);
  const income = records.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expense = records.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const borrowed = records.filter(r => r.type === "borrowed").reduce((s, r) => s + r.amount, 0);
  const repayment = records.filter(r => r.type === "repayment").reduce((s, r) => s + r.amount, 0);

  document.getElementById("view-user-body").innerHTML = `
    <div class="reason-box">
      <div class="diff-row"><span>Full Name</span><span>${escapeHtml(u.fullName || "—")}</span></div>
      <div class="diff-row"><span>Email</span><span>${escapeHtml(u.email || "—")}</span></div>
      <div class="diff-row"><span>Phone</span><span>${escapeHtml(u.phone || "—")}</span></div>
      <div class="diff-row"><span>Account Type</span><span>${escapeHtml((u.accountType || "normal").toUpperCase())}</span></div>
      <div class="diff-row"><span>Status</span><span>${u.status === "disabled" ? "Disabled" : "Active"}</span></div>
      <div class="diff-row"><span>Created</span><span>${timestampToDateTime(u.createdAt)}</span></div>
    </div>
    <div class="reason-box" style="margin-top:12px;">
      <div class="diff-row"><span>Total Income</span><span>${formatCurrency(income)}</span></div>
      <div class="diff-row"><span>Total Expenses</span><span>${formatCurrency(expense)}</span></div>
      <div class="diff-row"><span>Total Borrowed</span><span>${formatCurrency(borrowed)}</span></div>
      <div class="diff-row"><span>Total Repayments</span><span>${formatCurrency(repayment)}</span></div>
    </div>
  `;
  openModal("view-user-modal");
}

function openEditUser(uid) {
  const u = USER_MAP[uid];
  if (!u) return;
  EDIT_USER_TARGET = uid;
  document.getElementById("eu-fullname").value = u.fullName || "";
  document.getElementById("eu-phone").value = u.phone || "";
  openModal("edit-user-modal");
}

document.getElementById("edit-user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!EDIT_USER_TARGET) return;
  const fullName = document.getElementById("eu-fullname").value.trim();
  if (!fullName) { showToast("Full name is required.", "error"); return; }
  const phone = document.getElementById("eu-phone").value.trim();
  const submitBtn = document.getElementById("edit-user-submit");
  submitBtn.disabled = true; submitBtn.querySelector(".spinner")?.classList.add("active");

  const oldValue = { fullName: USER_MAP[EDIT_USER_TARGET].fullName, phone: USER_MAP[EDIT_USER_TARGET].phone };
  try {
    await updateDoc(doc(db, "users", EDIT_USER_TARGET), { fullName, phone, updatedAt: serverTimestamp() });
    await writeAuditLog({
      action: "UPDATE", targetUser: EDIT_USER_TARGET, targetRecord: EDIT_USER_TARGET, recordType: "userProfile",
      oldValue, newValue: { fullName, phone }, reason: "Master Control profile edit"
    });
    ALL_USERS = ALL_USERS.map(u => u.id === EDIT_USER_TARGET ? { ...u, fullName, phone } : u);
    USER_MAP[EDIT_USER_TARGET] = { ...USER_MAP[EDIT_USER_TARGET], fullName, phone };
    renderUsers();
    closeModal("edit-user-modal");
    showToast("Member profile updated successfully.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to update member profile.", "error");
  } finally {
    submitBtn.disabled = false; submitBtn.querySelector(".spinner")?.classList.remove("active");
  }
});

async function toggleUserStatus(uid, newStatus) {
  const u = USER_MAP[uid];
  if (!u) return;
  const verb = newStatus === "disabled" ? "disable" : "enable";
  if (!confirmAction(`${verb === "disable" ? "Disable" : "Enable"} ${u.fullName || u.email}'s account?`)) return;

  try {
    await updateDoc(doc(db, "users", uid), { status: newStatus, updatedAt: serverTimestamp() });
    await writeAuditLog({
      action: newStatus === "disabled" ? "DISABLE_USER" : "ENABLE_USER",
      targetUser: uid, targetRecord: uid, recordType: "userStatus",
      oldValue: { status: u.status || "active" }, newValue: { status: newStatus },
      reason: `Master Control ${verb}d account`
    });
    u.status = newStatus;
    renderUsers();
    renderOverview();
    showToast(`Account ${verb}d successfully.`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Failed to ${verb} account.`, "error");
  }
}

/* ---------------------------- Finance Management ---------------------------- */

let FINANCE_TYPE = "all";
const financeSearch = document.getElementById("finance-search");
financeSearch.addEventListener("input", renderFinance);

document.getElementById("finance-type-filter").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-type]");
  if (!btn) return;
  document.querySelectorAll("#finance-type-filter button").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  FINANCE_TYPE = btn.getAttribute("data-type");
  renderFinance();
});

const TYPE_BADGE = { income: "badge-income", expense: "badge-expense", borrowed: "badge-borrowed", repayment: "badge-repayment" };

function renderFinance() {
  const listEl = document.getElementById("finance-list");
  const emptyEl = document.getElementById("finance-empty");
  const loadingEl = document.getElementById("finance-loading");
  loadingEl.style.display = "none";

  let records = [...ALL_FINANCE];
  if (FINANCE_TYPE !== "all") records = records.filter(r => r.type === FINANCE_TYPE);

  const q = financeSearch.value.trim().toLowerCase();
  if (q) {
    records = records.filter(r => {
      const memberName = (USER_MAP[r.uid]?.fullName || USER_MAP[r.uid]?.email || "").toLowerCase();
      return memberName.includes(q) || (r.descriptor || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q) || (r.date || "").toLowerCase().includes(q);
    });
  }

  records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (!records.length) { listEl.innerHTML = ""; emptyEl.style.display = "block"; return; }
  emptyEl.style.display = "none";

  listEl.innerHTML = records.map(r => {
    const member = USER_MAP[r.uid];
    return `
    <tr>
      <td data-label="Member">${escapeHtml(member?.fullName || member?.email || "Unknown")}</td>
      <td data-label="Type"><span class="badge ${TYPE_BADGE[r.type]}">${r.type.toUpperCase()}</span></td>
      <td data-label="Amount" class="cell-amount ${r.type}">${formatCurrency(r.amount)}</td>
      <td data-label="Category/Source">${escapeHtml(r.descriptor || "—")}</td>
      <td data-label="Reason/Notes">${escapeHtml(r.reason || "—")}</td>
      <td data-label="Date">${formatDate(r.date)}</td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn" data-edit-finance="${r.uid}|${r.coll}|${r.id}" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn danger" data-delete-finance="${r.uid}|${r.coll}|${r.id}" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

document.getElementById("finance-list").addEventListener("click", async (e) => {
  const editKey = e.target.closest("[data-edit-finance]")?.getAttribute("data-edit-finance");
  const delKey = e.target.closest("[data-delete-finance]")?.getAttribute("data-delete-finance");
  if (editKey) openEditFinance(editKey);
  if (delKey) await deleteFinanceRecord(delKey);
});

function findFinanceRecord(uid, coll, id) {
  return ALL_FINANCE.find(f => f.uid === uid && f.coll === coll && f.id === id);
}

const AMOUNT_FIELD = { income: "amount", expense: "amount", borrowed: "amount", repayment: "repaymentAmount" };
const DESCRIPTOR_FIELD = { income: "source", expense: "category", borrowed: "borrowedFrom", repayment: null };
const DESCRIPTOR_LABEL = { income: "Income Source", expense: "Category", borrowed: "Borrowed From", repayment: null };

function openEditFinance(key) {
  const [uid, coll, id] = key.split("|");
  const rec = findFinanceRecord(uid, coll, id);
  if (!rec) return;
  EDIT_FINANCE_TARGET = rec;

  document.getElementById("ef-title").textContent = `Edit ${rec.type.charAt(0).toUpperCase() + rec.type.slice(1)} Record`;
  document.getElementById("ef-amount").value = rec.amount;
  document.getElementById("ef-reason").value = "";
  document.getElementById("ef-diff").style.display = "none";

  const descLabel = DESCRIPTOR_LABEL[rec.type];
  const descField = document.getElementById("ef-descriptor");
  const descGroup = descField.closest(".form-group");
  if (descLabel) {
    descGroup.style.display = "";
    document.getElementById("ef-descriptor-label").textContent = descLabel;
    descField.value = rec.descriptor || "";
  } else {
    descGroup.style.display = "none";
  }

  document.getElementById("ef-original-amount").textContent = formatCurrency(rec.amount);
  openModal("edit-finance-modal");
}

document.getElementById("ef-amount").addEventListener("input", updateFinanceDiff);
function updateFinanceDiff() {
  if (!EDIT_FINANCE_TARGET) return;
  const newAmount = Number(document.getElementById("ef-amount").value);
  const changed = newAmount !== EDIT_FINANCE_TARGET.amount;
  document.getElementById("ef-diff").style.display = changed ? "block" : "none";
  document.getElementById("ef-new-amount").textContent = formatCurrency(newAmount || 0);
}

document.getElementById("edit-finance-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!EDIT_FINANCE_TARGET) return;
  const rec = EDIT_FINANCE_TARGET;

  const newAmount = Number(document.getElementById("ef-amount").value);
  const newDescriptor = document.getElementById("ef-descriptor").value.trim();
  const reason = document.getElementById("ef-reason").value.trim();

  if (!isPositiveAmount(newAmount)) { showToast("Enter a valid amount greater than 0.", "error"); return; }
  if (!reason) { showToast("A reason for this change is required.", "error"); return; }

  const submitBtn = document.getElementById("edit-finance-submit");
  submitBtn.disabled = true; submitBtn.querySelector(".spinner")?.classList.add("active");

  const amountField = AMOUNT_FIELD[rec.type];
  const descField = DESCRIPTOR_FIELD[rec.type];
  const updatePayload = { [amountField]: newAmount, updatedAt: serverTimestamp() };
  if (descField) updatePayload[descField] = newDescriptor;

  const oldValue = { [amountField]: rec.amount, ...(descField ? { [descField]: rec.descriptor } : {}) };
  const newValue = { [amountField]: newAmount, ...(descField ? { [descField]: newDescriptor } : {}) };

  try {
    await updateDoc(doc(db, "users", rec.uid, rec.coll, rec.id), updatePayload);
    await writeAuditLog({
      action: "UPDATE", targetUser: rec.uid, targetRecord: rec.id, recordType: rec.type,
      oldValue, newValue, reason
    });
    await loadFinance();
    renderFinance();
    renderOverview();
    closeModal("edit-finance-modal");
    showToast("Record updated successfully.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to update record.", "error");
  } finally {
    submitBtn.disabled = false; submitBtn.querySelector(".spinner")?.classList.remove("active");
  }
});

async function deleteFinanceRecord(key) {
  const [uid, coll, id] = key.split("|");
  const rec = findFinanceRecord(uid, coll, id);
  if (!rec) return;
  if (!confirmAction(`Delete this ${rec.type} record of ${formatCurrency(rec.amount)}? This cannot be undone.`)) return;

  try {
    await deleteDoc(doc(db, "users", uid, coll, id));
    await writeAuditLog({
      action: "DELETE", targetUser: uid, targetRecord: id, recordType: rec.type,
      oldValue: rec.raw, newValue: null, reason: "Deleted by Master Control"
    });
    ALL_FINANCE = ALL_FINANCE.filter(f => !(f.uid === uid && f.coll === coll && f.id === id));
    renderFinance();
    renderOverview();
    showToast("Record deleted.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to delete record.", "error");
  }
}

/* ---------------------------- Audit Log ---------------------------- */

function renderAudit() {
  const listEl = document.getElementById("audit-list");
  const emptyEl = document.getElementById("audit-empty");
  const loadingEl = document.getElementById("audit-loading");
  loadingEl.style.display = "none";

  if (!ALL_AUDIT.length) { listEl.innerHTML = ""; emptyEl.style.display = "block"; return; }
  emptyEl.style.display = "none";

  listEl.innerHTML = ALL_AUDIT.map(a => {
    const target = USER_MAP[a.targetUser];
    return `
    <tr>
      <td data-label="Action"><span class="badge badge-master">${escapeHtml(a.action || "—")}</span></td>
      <td data-label="Target">${escapeHtml(target?.fullName || target?.email || a.targetUser || "—")}</td>
      <td data-label="Reason">${escapeHtml(a.reason || "—")}</td>
      <td data-label="Performed By">${escapeHtml(a.performedByEmail || a.performedBy || "—")}</td>
      <td data-label="Date/Time">${timestampToDateTime(a.timestamp)}</td>
    </tr>`;
  }).join("");
}

/* ---------------------------- Modal helpers ---------------------------- */

function openModal(id) { document.getElementById(id).classList.add("active"); }
function closeModal(id) { document.getElementById(id).classList.remove("active"); }

document.querySelectorAll("[data-modal-close]").forEach(btn => {
  btn.addEventListener("click", () => btn.closest(".modal-overlay")?.classList.remove("active"));
});
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("active"); });
});
