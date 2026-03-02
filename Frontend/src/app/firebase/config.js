// src/app/firebase/config.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// ── Singleton app ─────────────────────────────────────────────────────────────
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ── Auth ──────────────────────────────────────────────────────────────────────
const auth = getAuth(app);

// ── Firestore singleton ───────────────────────────────────────────────────────
const FIRESTORE_GLOBAL_KEY = '__kmrl_db__';

function getOrCreateDb() {
  if (typeof window === 'undefined') return null;
  if (globalThis[FIRESTORE_GLOBAL_KEY]) return globalThis[FIRESTORE_GLOBAL_KEY];

  try {
    const instance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
    globalThis[FIRESTORE_GLOBAL_KEY] = instance;
    return instance;
  } catch {
    const instance = getFirestore(app);
    globalThis[FIRESTORE_GLOBAL_KEY] = instance;
    return instance;
  }
}

const db = getOrCreateDb();

// ── waitForAuthReady ──────────────────────────────────────────────────────────
// Resolves with the current user once Firebase Auth finishes restoring the
// persisted session from IndexedDB. Must be awaited before any Firestore query
// or the security rule check sees request.auth == null → permissions error.
//
// Uses onAuthStateChanged which fires exactly once on startup with the
// restored user (or null if logged out), then we immediately unsubscribe.
// This is different from currentUser which may be null during the brief
// async restore window even when the user IS logged in.
export const waitForAuthReady = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    // onAuthStateChanged is already imported at the top of this file (ESM).
    // Previous version used require() inside the Promise which fails in ESM.
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub(); // unsubscribe immediately after first emission
      resolve(user);
    });
  });

export { app, auth, db };