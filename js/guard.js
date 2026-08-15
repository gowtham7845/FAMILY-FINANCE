// =========================================================
// AUTH GUARD — protects every internal page
//
// MASTER CONTROL AUTHORIZATION MODEL:
// A user is Master Control if, and only if, a document exists at
// authorizedAdmins/{uid}. That collection is NOT writable from the
// frontend (see firestore.rules) — it can only be created by a
// trusted administrator directly in the Firebase Console or via
// the Admin SDK in a secure environment. This means a normal user
// can never promote themselves, regardless of any value they can
// edit on their own users/{uid} profile document.
// =========================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const PAGE = document.body.getAttribute("data-page") || "";
const REQUIRES_MASTER = document.body.hasAttribute("data-requires-master");

function redirectToLogin() {
  window.location.href = "./index.html";
}

export async function isAuthorizedMaster(uid) {
  try {
    const snap = await getDoc(doc(db, "authorizedAdmins", uid));
    return snap.exists();
  } catch (err) {
    console.error("Failed to check master authorization:", err);
    return false;
  }
}

export async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("Failed to load user profile:", err);
    return null;
  }
}

// Resolves with { user, profile, isMaster } once auth state + authorization are known.
// Automatically redirects if unauthenticated, disabled, or lacking master access on a
// master-only page. Use on every protected page.
export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        redirectToLogin();
        return;
      }

      const [profile, isMaster] = await Promise.all([
        getUserProfile(user.uid),
        isAuthorizedMaster(user.uid)
      ]);

      if (profile && profile.status === "disabled") {
        await signOut(auth);
        window.location.href = "./index.html?disabled=1";
        return;
      }

      if (REQUIRES_MASTER && !isMaster) {
        // A normal user tried to open master-control.html directly.
        window.location.href = "./dashboard.html";
        return;
      }

      resolve({ user, profile, isMaster });
    });
  });
}

export async function doLogout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Logout error:", err);
  } finally {
    window.location.href = "./index.html";
  }
}

export function wireLogoutButtons() {
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", doLogout);
  });
}
