import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCwMc902nBIKhgkEmpQMLXzcNGmrbEe98A",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "nongwuaso-classcheck.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "nongwuaso-classcheck",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "nongwuaso-classcheck.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "987815430382",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:987815430382:web:b1433ab5254deb75374bff",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let db: Firestore | null = null;

if (typeof window !== "undefined" && isFirebaseConfigured) {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
    });
  } catch (error) {
    console.warn("initializeFirestore with ignoreUndefinedProperties fallback:", error);
    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      db = getFirestore(app);
    } catch (e) {
      console.error("Failed to initialize Firestore:", e);
    }
  }
}

export { db };
