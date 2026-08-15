// =========================================================
// REGISTER PAGE LOGIC (register.html)
// =========================================================

import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { showToast, friendlyAuthError, isValidEmail, spawnParticles } from "./common.js";

spawnParticles(document.querySelector(".auth-particles"), 20);

const form = document.getElementById("register-form");
const fields = {
  name: document.getElementById("reg-name"),
  email: document.getElementById("reg-email"),
  phone: document.getElementById("reg-phone"),
  password: document.getElementById("reg-password"),
  confirm: document.getElementById("reg-confirm")
};
const submitBtn = document.getElementById("register-submit");
const spinner = submitBtn.querySelector(".spinner");
const submitLabel = submitBtn.querySelector(".btn-label");

[fields.password, fields.confirm].forEach((input, idx) => {
  const toggleId = idx === 0 ? "toggle-password" : "toggle-confirm";
  const btn = document.getElementById(toggleId);
  btn.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    btn.classList.toggle("revealed");
  });
});

function setFieldError(input, message) {
  const hint = input.closest(".field-group").querySelector(".field-hint-error");
  if (message) { input.classList.add("field-error"); hint.textContent = message; }
  else { input.classList.remove("field-error"); hint.textContent = ""; }
}

function validate() {
  let valid = true;

  if (!fields.name.value.trim()) { setFieldError(fields.name, "Full name is required."); valid = false; }
  else setFieldError(fields.name, "");

  const email = fields.email.value.trim();
  if (!email) { setFieldError(fields.email, "Email is required."); valid = false; }
  else if (!isValidEmail(email)) { setFieldError(fields.email, "Enter a valid email address."); valid = false; }
  else setFieldError(fields.email, "");

  if (!fields.phone.value.trim()) { setFieldError(fields.phone, "Phone number is required."); valid = false; }
  else setFieldError(fields.phone, "");

  if (!fields.password.value || fields.password.value.length < 6) {
    setFieldError(fields.password, "Password must be at least 6 characters."); valid = false;
  } else setFieldError(fields.password, "");

  if (fields.confirm.value !== fields.password.value || !fields.confirm.value) {
    setFieldError(fields.confirm, "Passwords do not match."); valid = false;
  } else setFieldError(fields.confirm, "");

  return valid;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  submitBtn.disabled = true;
  spinner.classList.add("active");
  submitLabel.textContent = "Creating account...";

  try {
    const cred = await createUserWithEmailAndPassword(auth, fields.email.value.trim(), fields.password.value);

    await updateProfile(cred.user, { displayName: fields.name.value.trim() });

    // Firestore user profile — accountType is ALWAYS "normal" here.
    // There is no UI path anywhere in this app that lets a user set
    // themselves as Master Control. See js/guard.js for how Master
    // Control is actually authorized.
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      fullName: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      accountType: "normal",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    window.location.href = "./index.html?registered=1";
  } catch (err) {
    showToast(friendlyAuthError(err), "error");
  } finally {
    submitBtn.disabled = false;
    spinner.classList.remove("active");
    submitLabel.textContent = "Create Account";
  }
});
