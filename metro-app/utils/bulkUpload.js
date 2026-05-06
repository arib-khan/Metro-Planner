//utils/bulkUpload.js
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Save multiple train records to Firestore
export const saveBulkData = async (trainRecords) => {
  try {
    const batch = writeBatch(db);
    const results = [];

    for (const record of trainRecords) {
      const docRef = doc(collection(db, 'trainInduction'));

      // ── Branding ──────────────────────────────────────────────────────────
      // branding_valid_from + branding_valid_to are REQUIRED columns in the CSV.
      // If either is missing, branding_priorities is saved as [] and branding
      // will never appear as active on the dashboard.
      const hasBranding =
        record.branding_type &&
        record.branding_type !== 'None' &&
        record.branding_valid_from &&
        record.branding_valid_to;

      const branding_priorities = hasBranding
        ? [
          {
            branding_type: record.branding_type,
            priority_level: parseInt(record.priority_level) || 2,
            // CSV stores hours → convert to minutes for the schedule engine
            exposure_minutes: Math.round((parseFloat(record.remaining_exposure_hours) || 0) * 60),
            valid_from: record.branding_valid_from,     // YYYY-MM-DD
            valid_to: record.branding_valid_to,         // YYYY-MM-DD
            approved_by: record.branding_approved_by || 'Marketing Dept',
          },
        ]
        : [];

      // ── Fitness certificates ───────────────────────────────────────────────
      const fitness_certificates =
        record.rolling_stock_certificate ||
          record.signalling_certificate ||
          record.telecom_certificate
          ? {
            rolling_stock_validity: record.certificate_expiry || '',
            signalling_validity: record.certificate_expiry || '',
            telecom_validity: record.certificate_expiry || '',
            status: 'Fit for Service',
          }
          : undefined;

      const docData = {
        train_id: record.train_id,
        branding_priorities,
        ...(fitness_certificates && { fitness_certificates }),
        timestamp: serverTimestamp(),
        batch_upload: true,
      };

      batch.set(docRef, docData);
      results.push({ id: docRef.id, train_id: record.train_id });
    }

    await batch.commit();
    return { success: true, results, count: results.length };
  } catch (error) {
    console.error('Error saving bulk data:', error);
    return { success: false, error: error.message };
  }
};

// ── CSV Template generator ────────────────────────────────────────────────────
// branding_valid_from and branding_valid_to are NOW REQUIRED columns.
// Format must be YYYY-MM-DD. Leave both blank only when branding_type = None.
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
    'branding_valid_from',
    'branding_valid_to',
    'branding_approved_by',
    'cleaning_type',
    'assigned_team',
    'depot',
    'track_no',
    'berth',
    'job_card_number',
    'job_description',
    'work_order_status',
    'priority',
  ];

  const today = new Date().toISOString().split('T')[0];
  const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

  const sampleData = [
    'KMRL-1', 'Valid', 'Valid', 'Valid', '2026-12-31',
    '45000', '44500', '150', '2026-08-01',
    'Government Campaign', '1', '120',
    today, plus30, 'Marketing Dept',
    'Daily Clean', 'Team A', 'Muttom Depot',
    '7', 'B2', 'JC-1001', 'Brake Inspection', 'Open', 'High',
  ];

  return headers.join(',') + '\n' + sampleData.join(',');
};

// ── CSV validation helper ─────────────────────────────────────────────────────
// Call this before saveBulkData to catch problems and surface them in the UI.
export const validateCSVRows = (rows) => {
  const VALID_BRANDING = new Set([
    'None', 'Election Awareness', 'Tourism', 'Government Campaign', 'Commercial',
  ]);
  const VALID_DEPOT = new Set(['Muttom Depot', 'Kalamassery Depot']);
  const VALID_STATUS = new Set(['Open', 'Pending', 'Completed']);
  const VALID_PRIORITY = new Set(['High', 'Medium', 'Low']);
  const VALID_CLEANING = new Set(['Daily Clean', 'Detailing', 'Weekly Maintenance']);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().split('T')[0];

  const errors = [];

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const tid = row.train_id || `Row ${line}`;

    if (!row.train_id) errors.push({ line, tid, msg: 'train_id is missing' });

    if (row.branding_type && !VALID_BRANDING.has(row.branding_type)) {
      errors.push({ line, tid, msg: `branding_type '${row.branding_type}' is invalid. Use: None, Election Awareness, Tourism, Government Campaign, Commercial` });
    }

    if (row.branding_type && row.branding_type !== 'None') {
      if (!row.branding_valid_from || !DATE_RE.test(row.branding_valid_from)) {
        errors.push({ line, tid, msg: `branding_valid_from missing or not YYYY-MM-DD — branding will NOT show on dashboard` });
      }
      if (!row.branding_valid_to || !DATE_RE.test(row.branding_valid_to)) {
        errors.push({ line, tid, msg: `branding_valid_to missing or not YYYY-MM-DD — branding will NOT show on dashboard` });
      }
      if (
        row.branding_valid_from && DATE_RE.test(row.branding_valid_from) &&
        row.branding_valid_to && DATE_RE.test(row.branding_valid_to) &&
        row.branding_valid_from > row.branding_valid_to
      ) {
        errors.push({ line, tid, msg: `branding_valid_from (${row.branding_valid_from}) is after branding_valid_to (${row.branding_valid_to})` });
      }
    }

    if (row.certificate_expiry) {
      if (!DATE_RE.test(row.certificate_expiry)) {
        errors.push({ line, tid, msg: `certificate_expiry '${row.certificate_expiry}' must be YYYY-MM-DD` });
      } else if (row.certificate_expiry < today) {
        errors.push({ line, tid, msg: `certificate_expiry '${row.certificate_expiry}' is already expired` });
      }
    }

    if (row.next_maintenance_due && !DATE_RE.test(row.next_maintenance_due)) {
      errors.push({ line, tid, msg: `next_maintenance_due '${row.next_maintenance_due}' must be YYYY-MM-DD, not a mileage number` });
    }

    if (row.depot && !VALID_DEPOT.has(row.depot)) {
      errors.push({ line, tid, msg: `depot '${row.depot}' invalid. Use: Muttom Depot or Kalamassery Depot` });
    }
    if (row.work_order_status && !VALID_STATUS.has(row.work_order_status)) {
      errors.push({ line, tid, msg: `work_order_status '${row.work_order_status}' invalid. Use: Open, Pending, Completed` });
    }
    if (row.priority && !VALID_PRIORITY.has(row.priority)) {
      errors.push({ line, tid, msg: `priority '${row.priority}' invalid. Use: High, Medium, Low` });
    }
    if (row.cleaning_type && !VALID_CLEANING.has(row.cleaning_type)) {
      errors.push({ line, tid, msg: `cleaning_type '${row.cleaning_type}' invalid. Use: Daily Clean, Detailing, Weekly Maintenance` });
    }
    if (row.priority_level && !['1', '2', '3'].includes(String(row.priority_level))) {
      errors.push({ line, tid, msg: `priority_level '${row.priority_level}' invalid. Use: 1, 2, or 3` });
    }
  });

  return errors; // empty array = all good
};