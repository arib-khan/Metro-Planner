// utils/authHelpers.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
  reload,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { initNetworkListener } from './offlineSync';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Update last login time on every sign-in
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            await updateDoc(userDocRef, {
              lastLoginAt: new Date(),
            });
          }
        } catch (e) {
          console.error('Error updating last login:', e);
        }

        initNetworkListener();
      }

      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUp = async (email, password, name) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    // Update display name on the Firebase Auth profile
    await updateProfile(result.user, { displayName: name });
    await reload(result.user);

    // Create the user document in Firestore, tagged as a mobile user
    // so the web dashboard can filter and show ONLY mobile users
    await setDoc(doc(db, 'users', result.user.uid), {
      uid: result.user.uid,
      email: email,
      displayName: name,
      role: 'user',
      appType: 'mobile',      // ← KEY FLAG: identifies this as a mobile app user
      isBlocked: false,
      emailVerified: false,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });

    // Reflect the updated displayName immediately in local state
    setUser({ ...result.user, displayName: name });

    return result;
  };

  const signIn = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);

    // Check if the user is blocked before allowing access
    const userDocRef = doc(db, 'users', result.user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists() && userDoc.data().isBlocked === true) {
      await firebaseSignOut(auth);
      throw new Error('Your account has been blocked. Please contact your supervisor.');
    }

    return result;
  };

  const logout = async () => {
    return await firebaseSignOut(auth);
  };

  const value = {
    user,
    signUp,
    signIn,
    signOut: logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}