import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

// const firebaseConfig = {
//   apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
//   authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
//   databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
//   projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
//   storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
//   messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
//   appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
//   measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
// };

const app = initializeApp(firebaseConfig);

// FIX: Wrap in try/catch — on New Architecture, initializeAuth can throw
// "already initialized" if fast-refresh re-runs the module.
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // Already initialized (e.g. hot reload) — grab the existing instance
  const { getAuth } = require('firebase/auth');
  auth = getAuth(app);
}

const db = getFirestore(app);

export { auth, db };