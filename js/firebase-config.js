// =========================================================
// FIREBASE CONFIGURATION — single shared initialization
// Every other module imports { app, auth, db } from here.
// Do NOT initialize Firebase anywhere else in this project.
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBjaYEorFLcka157f4dm9ifqzagI3whv9s",
  authDomain: "finance-6aec7.firebaseapp.com",
  projectId: "finance-6aec7",
  storageBucket: "finance-6aec7.firebasestorage.app",
  messagingSenderId: "287701580347",
  appId: "1:287701580347:web:d79273988084d21bca7a1e",
  measurementId: "G-R5N5S5DZ8X"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Persist session across page reloads / tabs.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});
