// Firebase configuration for PropertyManager.
// IMPORTANT: Create a NEW, separate Firebase project for this app
// (do not reuse the hotel reception project's config).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============ PASTE YOUR FIREBASE CONFIG BELOW ============ */
const firebaseConfig = {

  apiKey: "AIzaSyD_ha2S7AcZHH_zNCruVc9cYpC3hrfDA4Y",

  authDomain: "shopmanage-c77a1.firebaseapp.com",

  projectId: "shopmanage-c77a1",

  storageBucket: "shopmanage-c77a1.firebasestorage.app",

  messagingSenderId: "830639386929",

  appId: "1:830639386929:web:0e142acfe30fc1bbe88010",

  measurementId: "G-MXTM2LKCDT"

};

/* ============================================================ */

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
