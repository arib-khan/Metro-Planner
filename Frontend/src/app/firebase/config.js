// src/app/firebase/config.js
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };