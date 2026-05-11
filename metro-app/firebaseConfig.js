import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCcVhosoXL1ZPNI_IUPgL6IrNtWkRPgxl0",
  authDomain: "kochi-metro-innov8ors.firebaseapp.com",
  databaseURL: "https://kochi-metro-innov8ors-default-rtdb.firebaseio.com",
  projectId: "kochi-metro-innov8ors",
  storageBucket: "kochi-metro-innov8ors.firebasestorage.app",
  messagingSenderId: "73502437370",
  appId: "1:73502437370:web:07a81bff2cf73df51e7e43",
  measurementId: "G-KM4ZZYF42F"
};

const app = initializeApp(firebaseConfig);

// Auth — guard against hot-reload double init
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  const { getAuth } = require('firebase/auth');
  auth = getAuth(app);
}

// Firestore — FIX: replace getFirestore() with initializeFirestore()
// getFirestore() uses IndexedDB persistence by default. React Native has no
// IndexedDB, so Firestore uses a shared lock that throws:
//   "Failed to obtain primary lease for action 'Backfill Indexes'"
// initializeFirestore() with experimentalForceLongPolling skips IndexedDB
// entirely — no lease conflict on any React Native / Expo build.
let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  });
} catch (e) {
  // Already initialized on hot reload — grab existing instance
  db = getFirestore(app);
}

export { auth, db };