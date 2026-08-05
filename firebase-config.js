// Firebase configuration for PropertyManager.
// IMPORTANT: Create a NEW, separate Firebase project for this app
// (do not reuse the hotel reception project's config).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============ PASTE YOUR FIREBASE CONFIG BELOW ============ */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
/* ============================================================ */

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
