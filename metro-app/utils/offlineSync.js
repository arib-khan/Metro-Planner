//utils\offlineSync.js
/**
 * Offline sync utility for KMRL Train Induction App.
 *
 * New JSON format notes:
 *  - mileage entries: { train_id, current_mileage_km }  (no previous/delta fields)
 *  - branding_priorities: include exposure_minutes, valid_from, valid_to (date-ranged)
 *  - fitness_certificates: store actual validity dates (rolling_stock_validity,
 *    signalling_validity, telecom_validity) so the dashboard can display them
 *    for any viewing date within the validity window.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import NetInfo from '@react-native-community/netinfo';

const PENDING_SUBMISSIONS_KEY = 'pendingSubmissions';

// ── Network check ─────────────────────────────────────────────────────────────
export const isOnline = async () => {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected;
};

// ── Save locally when offline ─────────────────────────────────────────────────
export const saveToLocalStorage = async (data) => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SUBMISSIONS_KEY);
    const pending = raw ? JSON.parse(raw) : [];

    const entry = {
      ...data,
      localId: Date.now().toString(),
      localTimestamp: new Date().toISOString(),
    };

    pending.push(entry);
    await AsyncStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(pending));
    return { success: true, localId: entry.localId, isOffline: true };
  } catch (error) {
    console.error('saveToLocalStorage error:', error);
    return { success: false, error: error.message };
  }
};

// ── Save to Firestore ─────────────────────────────────────────────────────────
export const saveToFirestore = async (data) => {
  try {
    const submissionData = {
      ...data,
      timestamp: serverTimestamp(),
      status: data.status || 'submitted',
      syncStatus: 'synced',
    };

    // Remove local-only fields if present
    delete submissionData.localId;
    delete submissionData.localTimestamp;

    const docRef = await addDoc(collection(db, 'trainInduction'), submissionData);
    return { success: true, documentId: docRef.id, isOffline: false };
  } catch (error) {
    console.error('saveToFirestore error:', error);
    return { success: false, error: error.message };
  }
};

// ── Main entry point ──────────────────────────────────────────────────────────
export const saveInductionData = async (data) => {
  const online = await isOnline();
  if (online) {
    return await saveToFirestore(data);
  } else {
    return await saveToLocalStorage(data);
  }
};

// ── Sync pending submissions when back online ─────────────────────────────────
export const syncPendingSubmissions = async () => {
  try {
    if (!(await isOnline())) return;

    const raw = await AsyncStorage.getItem(PENDING_SUBMISSIONS_KEY);
    const pending = raw ? JSON.parse(raw) : [];
    if (pending.length === 0) return;

    const synced = [];
    const failed = [];

    for (const submission of pending) {
      const result = await saveToFirestore(submission);
      if (result.success) synced.push(submission.localId);
      else failed.push(submission);
    }

    const remaining = pending.filter(s => !synced.includes(s.localId));
    await AsyncStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(remaining));

    console.log(`✅ Synced ${synced.length}, ❌ Failed ${failed.length}`);
    return { successful: synced.length, failed: failed.length };
  } catch (error) {
    console.error('syncPendingSubmissions error:', error);
    return { successful: 0, failed: 0, error: error.message };
  }
};

// ── Pending count ─────────────────────────────────────────────────────────────
export const getPendingSubmissionsCount = async () => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SUBMISSIONS_KEY);
    return raw ? JSON.parse(raw).length : 0;
  } catch {
    return 0;
  }
};

// ── Network listener (auto-sync on reconnect) ─────────────────────────────────
export const initNetworkListener = () => {
  return NetInfo.addEventListener(state => {
    if (state.isConnected) {
      syncPendingSubmissions();
    }
  });
};