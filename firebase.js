import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// ご提示いただいたFirebase設定
const firebaseConfig = {
  apiKey: "AIzaSyBq1IksvMVbqs_yHF9QVvA_UKYxF4befo8",
  authDomain: "project-hsfs20271.firebaseapp.com",
  projectId: "project-hsfs20271",
  storageBucket: "project-hsfs20271.firebasestorage.app",
  messagingSenderId: "722084381349",
  appId: "1:722084381349:web:cdddafae5d0b6bb4a7034c",
  measurementId: "G-H01QPE6NJQ"
};

// Firebaseの初期化
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);