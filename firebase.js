// Firebase initialization shared across pages.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCg41nrI9GosXvb_5vuOixSDpbzeYuct20",
  authDomain: "zeoxxyz.firebaseapp.com",
  databaseURL: "https://zeoxxyz-default-rtdb.firebaseio.com",
  projectId: "zeoxxyz",
  storageBucket: "zeoxxyz.firebasestorage.app",
  messagingSenderId: "896346061745",
  appId: "1:896346061745:web:d1fde2af1ee3eef26ddb90",
  measurementId: "G-4TB1S0J03W",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
};
