import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyALWAuS-Fkt3-0ll6c9mx4l6gEvo1PoJ84",
  authDomain: "miturno-barberia.firebaseapp.com",
  projectId: "miturno-barberia",
  storageBucket: "miturno-barberia.firebasestorage.app",
  messagingSenderId: "1092708631070",
  appId: "1:1092708631070:web:01732b790bb32a7390a40f",
  measurementId: "G-H1JCXRRM2K"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
