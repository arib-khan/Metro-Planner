//utils/authHelpers.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
  reload,
} from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { initNetworkListener } from './offlineSync';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        initNetworkListener();
      }
    });

    return unsubscribe;
  }, []);

  const signUp = async (email, password, name) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    // FIX: Update display name and then reload so onAuthStateChanged
    // receives the user object WITH displayName already set.
    await updateProfile(result.user, { displayName: name });
    await reload(result.user);

    // Manually push the updated user into state so the UI reflects
    // the display name immediately without waiting for a second auth event.
    setUser({ ...result.user, displayName: name });

    return result;
  };

  const signIn = async (email, password) => {
    // FIX: Return the credential so callers can inspect it if needed.
    return await signInWithEmailAndPassword(auth, email, password);
  };

  // FIX: Renamed import to firebaseSignOut to avoid collision with the
  // context key name "signOut".
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