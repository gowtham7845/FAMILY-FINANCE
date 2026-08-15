// =========================================================
// COMMON UTILITIES — shared across every page
// =========================================================

import { db, auth } from "./firebase-config.js";
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* ---------------- Toast notifications ---------------- */

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

const ICONS = {
  success: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  error: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  info: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
};

export function showToast(message, type = "info", duration = 4000) {
  const container = getToastContainer();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${ICONS[type] || ICONS.info}<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 260);
  }, duration);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

/* ---------------- Firebase error mapping ---------------- */

export function friendlyAuthError(error) {
  console.error("Auth error:", error);
  const code = error && error.code ? error.code : "";
  const map = {
    "auth/invalid-email": "Invalid email address.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/user-disabled": "This account has been disabled. Contact your family administrator.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network connection problem. Check your internet connection.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/missing-password": "Please enter a password."
  };
  return map[code] || "Something went wrong. Please try again.";
}

/* ---------------- Formatting helpers ---------------- */

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime12h(timeStr) {
  if (!timeStr) return "—";
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

export function todayDateStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function timestampToDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

/* ---------------- Audit logging ---------------- */

export async function writeAuditLog({ action, targetUser, targetRecord, recordType, oldValue, newValue, reason }) {
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, "auditLogs"), {
      action,
      targetUser: targetUser || (user ? user.uid : null),
      targetRecord: targetRecord || null,
      recordType: recordType || null,
      oldValue: oldValue !== undefined ? oldValue : null,
      newValue: newValue !== undefined ? newValue : null,
      reason: reason || null,
      performedBy: user ? user.uid : null,
      performedByEmail: user ? user.email : null,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

/* ---------------- Transaction mirror ---------------- */
// Every income/expense/borrowed/repayment write also creates a
// row in users/{uid}/transactions so transactions.html has a single feed.

export async function writeTransactionRecord(uid, { type, amount, category, reason, date, time, sourceCollection, sourceId }) {
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, "users", uid, "transactions"), {
      type,
      amount,
      category: category || null,
      reason: reason || null,
      date,
      time,
      sourceCollection,
      sourceId,
      createdBy: user ? user.uid : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to write transaction record:", err);
  }
}

/* ---------------- Validation helpers ---------------- */

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isPositiveAmount(value) {
  const n = Number(value);
  return !isNaN(n) && n > 0;
}

/* ---------------- Mobile sidebar toggle ---------------- */

export function initMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const openBtn = document.querySelector("[data-sidebar-open]");
  const closeBtn = document.querySelector("[data-sidebar-close]");
  const backdrop = document.querySelector(".sidebar-backdrop");
  if (!sidebar) return;
  const open = () => { sidebar.classList.add("open"); backdrop?.classList.add("active"); };
  const close = () => { sidebar.classList.remove("open"); backdrop?.classList.remove("active"); };
  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
}

/* ---------------- Ambient particle background (auth pages) ---------------- */

export function spawnParticles(container, count = 18) {
  const colors = ["#7c5cff", "#22d3ee", "#a78bfa"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = 3 + Math.random() * 7;
    p.style.width = size + "px";
    p.style.height = size + "px";
    p.style.left = Math.random() * 100 + "%";
    p.style.bottom = -20 - Math.random() * 40 + "px";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = 10 + Math.random() * 14 + "s";
    p.style.animationDelay = Math.random() * 10 + "s";
    container.appendChild(p);
  }
}

/* ---------------- Confirm modal helper ---------------- */

export function confirmAction(message) {
  return window.confirm(message);
}
