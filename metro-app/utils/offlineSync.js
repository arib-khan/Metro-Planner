//utils\offlineSync.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import { 
  collection, 
  addDoc, 
  serverTimestamp,
  updateDoc,
  doc 
} from 'firebase/firestore';
import NetInfo from '@react-native-community/netinfo';

const PENDING_SUBMISSIONS_KEY = 'pendingSubmissions';

// Check network connectivity
export const isOnline = async () => {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected;
};

// Save data locally when offline
export const saveToLocalStorage = async (data) => {
  try {
    const existingData = await AsyncStorage.getItem(PENDING_SUBMISSIONS_KEY);
    const pendingSubmissions = existingData ? JSON.parse(existingData) : [];
    
    const submissionWithId = {
      ...data,
      localId: Date.now().toString(),
      timestamp: new Date().toISOString(),
    };
    
    pendingSubmissions.push(submissionWithId);
    await AsyncStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(pendingSubmissions));
    
    return { success: true, localId: submissionWithId.localId, isOffline: true };
  } catch (error) {
    console.error('Error saving to local storage:', error);
    return { success: false, error: error.message };
  }
};

// Save data to Firestore when online
export const saveToFirestore = async (data) => {
  try {
    const submissionData = {
      ...data,
      // Ensure these fields are properly set
      userId: data.userId,
      userName: data.userName,
      userEmail: data.userEmail,
      timestamp: serverTimestamp(),
      status: 'submitted',
      syncStatus: 'synced',
    };

    const docRef = await addDoc(collection(db, 'trainInduction'), submissionData);
    
    return { 
      success: true, 
      documentId: docRef.id, 
      isOffline: false 
    };
  } catch (error) {
    console.error('Error saving to Firestore:', error);
    return { success: false, error: error.message };
  }
};

// Main function to save induction data
export const saveInductionData = async (data) => {
  const online = await isOnline();
  
  if (online) {
    return await saveToFirestore(data);
  } else {
    return await saveToLocalStorage(data);
  }
};

// Sync pending submissions when coming online
export const syncPendingSubmissions = async () => {
  try {
    const online = await isOnline();
    if (!online) return;

    const existingData = await AsyncStorage.getItem(PENDING_SUBMISSIONS_KEY);
    const pendingSubmissions = existingData ? JSON.parse(existingData) : [];
    
    if (pendingSubmissions.length === 0) return;

    const successfulSyncs = [];
    const failedSyncs = [];

    for (const submission of pendingSubmissions) {
      const result = await saveToFirestore(submission);
      
      if (result.success) {
        successfulSyncs.push(submission.localId);
      } else {
        failedSyncs.push(submission);
      }
    }

    // Remove successfully synced items
    const updatedPending = pendingSubmissions.filter(
      submission => !successfulSyncs.includes(submission.localId)
    );

    await AsyncStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(updatedPending));
    
    console.log(`Synced ${successfulSyncs.length} pending submissions`);
    return { successful: successfulSyncs.length, failed: failedSyncs.length };
  } catch (error) {
    console.error('Error syncing pending submissions:', error);
    return { successful: 0, failed: 0, error: error.message };
  }
};

// Get pending submissions count
export const getPendingSubmissionsCount = async () => {
  try {
    const existingData = await AsyncStorage.getItem(PENDING_SUBMISSIONS_KEY);
    const pendingSubmissions = existingData ? JSON.parse(existingData) : [];
    return pendingSubmissions.length;
  } catch (error) {
    console.error('Error getting pending count:', error);
    return 0;
  }
};

// Initialize network listener
export const initNetworkListener = () => {
  return NetInfo.addEventListener(state => {
    if (state.isConnected) {
      syncPendingSubmissions();
    }
  });
};