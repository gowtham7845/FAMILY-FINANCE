// =========================================================
// LOGIN PAGE LOGIC (index.html)
// =========================================================

import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { showToast, friendlyAuthError, isValidEmail, spawnParticles } from "./common.js";
import { isAuthorizedMaster, getUserProfile } from "./guard.js";

spawnParticles(document.querySelector(".auth-particles"), 20);

// If already logged in, skip straight to the right dashboard.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isMaster = await isAuthorizedMaster(user.uid);
    window.location.href = isMaster ? "./master-control.html" : "./dashboard.html";
  }
});

const params = new URLSearchParams(window.location.search);
if (params.get("disabled") === "1") {
  showToast("This account has been disabled. Contact your family administrator.", "error", 6000);
}
if (params.get("registered") === "1") {
  showToast("Account created successfully. Please sign in.", "success");
}

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const submitBtn = document.getElementById("login-submit");
const spinner = submitBtn.querySelector(".spinner");
const submitLabel = submitBtn.querySelector(".btn-label");

document.getElementById("toggle-password").addEventListener("click", () => {
  const isPw = passwordInput.type === "password";
  passwordInput.type = isPw ? "text" : "password";
  document.getElementById("eye-open").style.display = isPw ? "none" : "block";
  document.getElementById("eye-closed").style.display = isPw ? "block" : "none";
});

function setFieldError(input, message) {
  const hint = input.closest(".field-group").querySelector(".field-hint-error");
  if (message) {
    input.classList.add("field-error");
    hint.textContent = message;
  } else {
    input.classList.remove("field-error");
    hint.textContent = "";
  }
}

function validate() {
  let valid = true;
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) { setFieldError(emailInput, "Email address is required."); valid = false; }
  else if (!isValidEmail(email)) { setFieldError(emailInput, "Enter a valid email address."); valid = false; }
  else setFieldError(emailInput, "");

  if (!password) { setFieldError(passwordInput, "Password is required."); valid = false; }
  else setFieldError(passwordInput, "");

  return valid;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  submitBtn.disabled = true;
  spinner.classList.add("active");
  submitLabel.textContent = "Signing in...";

  try {
    const cred = await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    const profile = await getUserProfile(cred.user.uid);

    if (profile && profile.status === "disabled") {
      await auth.signOut();
      showToast("This account has been disabled. Contact your family administrator.", "error", 6000);
      return;
    }

    const isMaster = await isAuthorizedMaster(cred.user.uid);
    window.location.href = isMaster ? "./master-control.html" : "./dashboard.html";
  } catch (err) {
    showToast(friendlyAuthError(err), "error");
  } finally {
    submitBtn.disabled = false;
    spinner.classList.remove("active");
    submitLabel.textContent = "Sign In";
  }
});

/* ---------------- Forgot password modal ---------------- */

const modal = document.getElementById("forgot-modal");
const forgotForm = document.getElementById("forgot-form");
const forgotEmail = document.getElementById("forgot-email");
const forgotFeedback = document.getElementById("forgot-feedback");
const forgotBtn = document.getElementById("forgot-submit");

document.getElementById("open-forgot").addEventListener("click", (e) => {
  e.preventDefault();
  modal.classList.add("active");
  forgotEmail.value = emailInput.value.trim();
  forgotFeedback.className = "modal-feedback";
  forgotFeedback.textContent = "";
});

document.querySelectorAll("[data-modal-close]").forEach((el) => {
  el.addEventListener("click", () => modal.classList.remove("active"));
});
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = forgotEmail.value.trim();
  if (!isValidEmail(email)) {
    forgotFeedback.className = "modal-feedback error";
    forgotFeedback.textContent = "Enter a valid email address.";
    return;
  }

  forgotBtn.disabled = true;
  forgotBtn.querySelector(".spinner").classList.add("active");

  try {
    await sendPasswordResetEmail(auth, email);
    forgotFeedback.className = "modal-feedback success";
    forgotFeedback.textContent = "Password reset link sent successfully.";
  } catch (err) {
    forgotFeedback.className = "modal-feedback error";
    forgotFeedback.textContent = friendlyAuthError(err);
  } finally {
    forgotBtn.disabled = false;
    forgotBtn.querySelector(".spinner").classList.remove("active");
  }
});
