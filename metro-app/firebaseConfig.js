// // // ⚡️ Instructions:
// // // 1. Visit https://console.firebase.google.com, create a new project, enable Firestore, Storage, and Anonymous Auth.
// // // 2. Replace each placeholder below with your actual Firebase config values.
// // // 3. In Firestore & Storage, go to Rules and for development use only set:
// // //    Firestore: service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if true } } }
// // //    Storage:   service firebase.storage { match /b/{bucket}/o { match /{allPaths=**} { allow read, write: if true } } }
// // //    ⚠️ Before production, **restrict these rules**!

// // import { initializeApp, getApps } from "firebase/app";
// // import { getFirestore } from "firebase/firestore";
// // import { getStorage } from "firebase/storage";
// // import { getAuth } from "firebase/auth";

// // // const firebaseConfig = {
// // //   apiKey: "FIREBASE_API_KEY",
// // //   authDomain: "FIREBASE_AUTH_DOMAIN",
// // //   projectId: "FIREBASE_PROJECT_ID",
// // //   storageBucket: "FIREBASE_STORAGE_BUCKET",
// // //   messagingSenderId: "FIREBASE_MSGID",
// // //   appId: "FIREBASE_APPID",
// // // };

// // const firebaseConfig = {
// //   apiKey: "AIzaSyCcVhosoXL1ZPNI_IUPgL6IrNtWkRPgxl0",
// //   authDomain: "kochi-metro-innov8ors.firebaseapp.com",
// //   databaseURL: "https://kochi-metro-innov8ors-default-rtdb.firebaseio.com",
// //   projectId: "kochi-metro-innov8ors",
// //   storageBucket: "kochi-metro-innov8ors.firebasestorage.app",
// //   messagingSenderId: "73502437370",
// //   appId: "1:73502437370:web:07a81bff2cf73df51e7e43",
// //   measurementId: "G-KM4ZZYF42F"
// // };

// // const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// // const db = getFirestore(app);
// // const storage = getStorage(app);
// // const auth = getAuth(app);

// // export { db, storage, auth };



// import { initializeApp, getApps } from 'firebase/app';
// import { getFirestore } from 'firebase/firestore';
// import { getStorage } from 'firebase/storage';
// import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
// import AsyncStorage from '@react-native-async-storage/async-storage';

// // const firebaseConfig = {
// //   apiKey: "FIREBASE_API_KEY",
// //   authDomain: "FIREBASE_AUTH_DOMAIN",
// //   projectId: "FIREBASE_PROJECT_ID",
// //   storageBucket: "FIREBASE_STORAGE_BUCKET",
// //   messagingSenderId: "FIREBASE_MSGID",
// //   appId: "FIREBASE_APPID",
// // };

// const firebaseConfig = {
//   apiKey: "AIzaSyCcVhosoXL1ZPNI_IUPgL6IrNtWkRPgxl0",
//   authDomain: "kochi-metro-innov8ors.firebaseapp.com",
//   databaseURL: "https://kochi-metro-innov8ors-default-rtdb.firebaseio.com",
//   projectId: "kochi-metro-innov8ors",
//   storageBucket: "kochi-metro-innov8ors.firebasestorage.app",
//   messagingSenderId: "73502437370",
//   appId: "1:73502437370:web:07a81bff2cf73df51e7e43",
//   measurementId: "G-KM4ZZYF42F"
// };

// // Only initialize app once
// const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
// const db = getFirestore(app);
// const storage = getStorage(app);

// // Use getReactNativePersistence for Auth <---
// const auth = initializeAuth(app, {
//   persistence: getReactNativePersistence(AsyncStorage),
// });

// export { db, storage, auth };

import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your web app's Firebase configuration
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

// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Firestore
const db = getFirestore(app);

export { auth, db };