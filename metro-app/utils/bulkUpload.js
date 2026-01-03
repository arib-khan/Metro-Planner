//utils\bulkUpload.js
import { collection, addDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Save multiple train records to Firestore
export const saveBulkData = async (trainRecords) => {
  try {
    const batch = writeBatch(db);
    const results = [];

    for (const record of trainRecords) {
      const docRef = doc(collection(db, 'trainInduction'));
      batch.set(docRef, {
        ...record,
        timestamp: serverTimestamp(),
        batch_upload: true
      });
      results.push({ id: docRef.id, train_id: record.branding_priorities?.[0]?.train_id });
    }

    await batch.commit();
    return { success: true, results, count: results.length };
  } catch (error) {
    console.error('Error saving bulk data:', error);
    return { success: false, error: error.message };
  }
};

// CSV Template generator
export const generateCSVTemplate = () => {
  const headers = [
    'train_id',
    'rolling_stock_certificate',
    'signalling_certificate',
    'telecom_certificate',
    'certificate_expiry',
    'current_mileage',
    'last_maintenance_mileage',
    'daily_average_mileage',
    'next_maintenance_due',
    'branding_type',
    'priority_level',
    'remaining_exposure_hours',
    'cleaning_type',
    'assigned_team',
    'depot',
    'track_no',
    'berth',
    'job_card_number',
    'job_description',
    'work_order_status',
    'priority'
  ];

  const sampleData = [
    'KMRC-001', 'Valid', 'Valid', 'Valid', '2025-12-31', '45000', '44500', '150', '50000',
    'Gold', '1', '120', 'Deep', 'Team A', 'Muttom', '7', 'B2', 'JC-1001', 'Brake Inspection', 'Open', 'High'
  ];

  return headers.join(',') + '\n' + sampleData.join(',');
};