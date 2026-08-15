// =========================================================
// PROFILE PAGE (profile.html)
//
// Normal users may update fullName and phone only.
// accountType and status are intentionally NEVER sent in the
// update payload from this page — even if someone tampers with
// the DOM/JS in devtools, firestore.rules independently blocks
// any write that touches those two fields from a non-master UID.
// =========================================================

import { auth, db } from "./firebase-config.js";
import { sendPasswordResetEmail, updateProfile as updateAuthProfile } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import { showToast, friendlyAuthError, initials, initMobileSidebar, timestampToDateTime } from "./common.js";

wireLogoutButtons();
initMobileSidebar();

let CURRENT_USER = null;

const form = document.getElementById("profile-form");
const nameInput = document.getElementById("p-fullname");
const emailInput = document.getElementById("p-email");
const phoneInput = document.getElementById("p-phone");
const submitBtn = document.getElementById("profile-submit");

(async function init() {
  const { user, profile } = await requireAuth();
  CURRENT_USER = user;

  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);

  nameInput.value = profile?.fullName || "";
  emailInput.value = user.email || "";
  phoneInput.value = profile?.phone || "";

  document.getElementById("profile-account-type").textContent =
    (profile?.accountType || "normal").toUpperCase() + " ACCOUNT";
  const statusEl = document.getElementById("profile-status");
  statusEl.textContent = profile?.status === "disabled" ? "Disabled" : "Active";
  statusEl.className = "badge " + (profile?.status === "disabled" ? "badge-disabled" : "badge-active");
  document.getElementById("profile-created").textContent = timestampToDateTime(profile?.createdAt);
})();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fullName = nameInput.value.trim();
  if (!fullName) { showToast("Full name is required.", "error"); return; }

  submitBtn.disabled = true;
  submitBtn.querySelector(".spinner")?.classList.add("active");

  try {
    // Only fullName + phone + updatedAt are ever written from this page.
    await updateDoc(doc(db, "users", CURRENT_USER.uid), {
      fullName,
      phone: phoneInput.value.trim(),
      updatedAt: serverTimestamp()
    });
    await updateAuthProfile(CURRENT_USER, { displayName: fullName });

    document.getElementById("sidebar-name").textContent = fullName;
    document.getElementById("sidebar-avatar").textContent = initials(fullName);
    showToast("Profile updated successfully.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to update profile. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector(".spinner")?.classList.remove("active");
  }
});

document.getElementById("send-reset-link").addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, CURRENT_USER.email);
    showToast("Password reset link sent successfully.", "success");
  } catch (err) {
    showToast(friendlyAuthError(err), "error");
  }
});
