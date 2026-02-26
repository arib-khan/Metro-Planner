// src/app/context/AuthContext.js
'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthContextProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user document exists, create if not
        await ensureUserDocument(user);
        // Update last login
        await updateLastLogin(user.uid);
      }
      setUser(user);
      setLoading(false);
    });

    // Check if biometric authentication is available
    checkBiometricAvailability();

    return () => unsubscribe();
  }, []);

  // Ensure user document exists in Firestore
  const ensureUserDocument = async (user) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // Create user document if it doesn't exist
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || null,
          emailVerified: user.emailVerified,
          isBlocked: false,
          role: 'user',
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          metadata: {
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime
          }
        });
        console.log('User document created for:', user.email);
      }
    } catch (error) {
      console.error('Error ensuring user document:', error);
    }
  };

  // Update last login timestamp
  const updateLastLogin = async (uid) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, {
        lastLoginAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  };

  const checkBiometricAvailability = async () => {
    if (window.PublicKeyCredential) {
      try {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setBiometricAvailable(available);
      } catch (error) {
        console.error('Error checking biometric availability:', error);
        setBiometricAvailable(false);
      }
    }
  };

  const signup = async (email, password, displayName = null) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Create user document in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: email,
        displayName: displayName,
        emailVerified: false,
        isBlocked: false,
        role: 'user',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        metadata: {
          creationTime: userCredential.user.metadata.creationTime,
          lastSignInTime: userCredential.user.metadata.lastSignInTime
        }
      });

      // Send email verification
      await sendEmailVerification(userCredential.user);

      return userCredential;
    } catch (error) {
      console.error('Error during signup:', error);
      throw error;
    }
  };

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Check if user is blocked
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && userDoc.data().isBlocked === true) {
        await signOut(auth);
        throw new Error('Your account has been blocked. Please contact support.');
      }

      return userCredential;
    } catch (error) {
      console.error('Error during login:', error);
      throw error;
    }
  };

  const logout = () => {
    return signOut(auth);
  };

  // Register biometric credential for a user
  const registerBiometric = async (email) => {
    if (!biometricAvailable) {
      throw new Error('Biometric authentication is not available on this device');
    }

    try {
      // Generate a challenge (in production, this should come from your server)
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // Create credential options
      const publicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: "Railway System",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(email),
          name: email,
          displayName: email,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },  // ES256
          { alg: -257, type: "public-key" } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
        attestation: "none"
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      });

      // Store credential in localStorage (in production, store on server)
      const credentialData = {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
        email: email
      };

      localStorage.setItem(`biometric_${email}`, JSON.stringify(credentialData));

      return credential;
    } catch (error) {
      console.error('Error registering biometric:', error);
      throw error;
    }
  };

  // Authenticate using biometric
  const authenticateWithBiometric = async (email) => {
    if (!biometricAvailable) {
      throw new Error('Biometric authentication is not available on this device');
    }

    try {
      // Check if credential exists
      const storedCredential = localStorage.getItem(`biometric_${email}`);
      if (!storedCredential) {
        throw new Error('No biometric credential found for this email');
      }

      const credentialData = JSON.parse(storedCredential);

      // Generate a challenge (in production, this should come from your server)
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // Get credential options
      const publicKeyCredentialRequestOptions = {
        challenge,
        allowCredentials: [{
          id: new Uint8Array(credentialData.rawId),
          type: 'public-key',
          transports: ['internal']
        }],
        timeout: 60000,
        userVerification: "required"
      };

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      });

      return assertion;
    } catch (error) {
      console.error('Error authenticating with biometric:', error);
      throw error;
    }
  };

  // Check if biometric is registered for email
  const isBiometricRegistered = (email) => {
    return localStorage.getItem(`biometric_${email}`) !== null;
  };

  // Remove biometric credential
  const removeBiometric = (email) => {
    localStorage.removeItem(`biometric_${email}`);
  };

  return (
    <AuthContext.Provider value={{
      user,
      signup,
      login,
      logout,
      loading,
      biometricAvailable,
      registerBiometric,
      authenticateWithBiometric,
      isBiometricRegistered,
      removeBiometric
    }}>
      {children}
    </AuthContext.Provider>
  );
};
