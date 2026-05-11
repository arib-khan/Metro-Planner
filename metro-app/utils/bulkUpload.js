// utils/bulkUpload.js
/**
 * Bulk upload — permission-aware
 * ─────────────────────────────────────────────────────────────────────────────
 * Every exported function now accepts an `allowedSections` map:
 *
 *   {
 *     certificate: true,
 *     branding:    false,
 *     mileage:     true,
 *     cleaning:    true,
 *     stabling:    false,
 *     jobCard:     true,
 *   }
 *
 * This is the SAME object stored on users/{uid}.allowedSections in Firestore
 * and read by usePermissions.js on the mobile side.
 *
 * Rules:
 *  - saveBulkData  → only writes fields for permitted sections.
 *                    Routes master data (cert/branding) → trainMasterData
 *                    Routes daily data (cleaning/stabling/mileage/jobCard) → trainDailyData
 *                    Matching the architecture in trainDataService.js.
 *  - generateCSVTemplate → only emits columns for permitted sections.
 *  - validateCSVRows     → only validates columns for permitted sections.
 *
 * If allowedSections is omitted entirely (undefined / null), ALL sections are
 * processed — safe default for super-admin direct uploads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  MASTER_COLLECTION,
  DAILY_COLLECTION,
  dailyDocId,
} from './trainDataService';

// ── Permission helper ─────────────────────────────────────────────────────────
// Returns true when allowedSections is absent (super-admin) OR explicitly true.
const allowed = (sections, key) =>
  !sections || sections[key] === true || sections[key] === undefined;

// ── Save bulk records to Firestore ────────────────────────────────────────────
/**
 * @param {object[]} trainRecords   - Parsed CSV rows (one object per row)
 * @param {object}  [allowedSections] - Section permission map from users/{uid}
 * @param {string}  [uploadDate]    - ISO date string 'YYYY-MM-DD' for daily docs;
 *                                    defaults to today
 * @param {object}  [uploaderMeta]  - { userId, userName, userEmail } of the uploader
 *
 * @returns {{ success: boolean, results: object[], count: number, skipped: object[] }}
 */
export const saveBulkData = async (
  trainRecords,
  allowedSections,
  uploadDate,
  uploaderMeta = {}
) => {
  try {
    const date = uploadDate || new Date().toISOString().split('T')[0];

    // Firestore batch has a 500-operation limit — chunk if needed
    const CHUNK = 249; // 2 writes per record (master + daily) → safe under 500
    const allResults = [];
    const allSkipped = [];

    for (let i = 0; i < trainRecords.length; i += CHUNK) {
      const chunk = trainRecords.slice(i, i + CHUNK);
      const batch = writeBatch(db);

      for (const record of chunk) {
        if (!record.train_id) {
          allSkipped.push({ record, reason: 'Missing train_id' });
          continue;
        }

        const tid = record.train_id;

        // ── MASTER DATA ──────────────────────────────────────────────────────
        // trainMasterData/{train_id}  — same doc-ID scheme as trainDataService
        const masterData = {};

        // Certificate
        if (allowed(allowedSections, 'certificate')) {
          const hasCert =
            record.rolling_stock_certificate ||
            record.signalling_certificate ||
            record.telecom_certificate;

          if (hasCert) {
            masterData.fitness_certificates = {
              rolling_stock_validity: record.certificate_expiry || '',
              signalling_validity: record.certificate_expiry || '',
              telecom_validity: record.certificate_expiry || '',
              status: 'Fit for Service',
            };
          }
        }

        // Branding
        if (allowed(allowedSections, 'branding')) {
          const hasBranding =
            record.branding_type &&
            record.branding_type !== 'None' &&
            record.branding_valid_from &&
            record.branding_valid_to;

          masterData.branding_priorities = hasBranding
            ? [
              {
                branding_type: record.branding_type,
                priority_level: parseInt(record.priority_level) || 2,
                // CSV stores hours → convert to minutes for the schedule engine
                exposure_minutes: Math.round(
                  (parseFloat(record.exposure_minutes))
                ),
                valid_from: record.branding_valid_from,  // YYYY-MM-DD
                valid_to: record.branding_valid_to,    // YYYY-MM-DD
                approved_by: record.branding_approved_by || 'Marketing Dept',
              },
            ]
            : [];
        }

        // Write master doc if there is anything to write
        if (Object.keys(masterData).length > 0) {
          const masterRef = doc(db, MASTER_COLLECTION, tid);
          batch.set(
            masterRef,
            {
              train_id: tid,
              ...masterData,
              updatedAt: serverTimestamp(),
              updatedBy: uploaderMeta.userName || uploaderMeta.userId || 'bulk_upload',
              updatedByEmail: uploaderMeta.userEmail || '',
              batch_upload: true,
            },
            { merge: true }  // preserve existing fields not in this upload
          );
        }

        // ── DAILY DATA ───────────────────────────────────────────────────────
        // trainDailyData/{train_id}_{date}  — one doc per train per date
        const dailyData = {
          train_id: tid,
          date,
          batch_upload: true,
          updatedAt: serverTimestamp(),
          updatedBy: uploaderMeta.userName || uploaderMeta.userId || 'bulk_upload',
          updatedByEmail: uploaderMeta.userEmail || '',
        };

        // Cleaning
        if (allowed(allowedSections, 'cleaning') && record.cleaning_type) {
          dailyData.cleaning_slots = [
            {
              cleaning_type: record.cleaning_type,
              assigned_team: record.assigned_team || '',
              status: 'Scheduled',
              // CSV bulk uploads don't carry slot times — default to depot night shift
              slot_start: `${date}T23:00`,
              slot_end: `${date}T23:45`,
            },
          ];
        } else {
          dailyData.cleaning_slots = [];
        }

        // Stabling geometry
        if (allowed(allowedSections, 'stabling') && (record.track_no || record.berth)) {
          dailyData.stabling_geometry = {
            yard: record.depot || '',
            track_no: parseInt(record.track_no) || 1,
            berth: record.berth || '',
            orientation: record.orientation || 'UP',
            distance_from_buffer_m: parseFloat(record.distance_from_buffer) || 4.5,
            remarks: record.stabling_remarks || '',
          };
        } else {
          dailyData.stabling_geometry = null;
        }

        // Mileage
        if (allowed(allowedSections, 'mileage') && record.current_mileage) {
          dailyData.mileage = {
            current_mileage_km: parseInt(record.current_mileage) || 0,
            last_maintenance_mileage: parseInt(record.last_maintenance_mileage) || 0,
            daily_average_mileage: parseInt(record.daily_average_mileage) || 0,
            next_maintenance_due: record.next_maintenance_due || '',
          };
        } else {
          dailyData.mileage = null;
        }

        // Job card
        if (allowed(allowedSections, 'jobCard') && (record.job_card_number || record.job_description)) {
          dailyData.job_card_status = [
            {
              job_id: record.job_card_number || `JC-${Math.floor(Math.random() * 9000) + 1000}`,
              task: record.job_description || '',
              status: record.work_order_status || 'Open',
              priority: record.priority || 'Medium',
              assigned_team: record.assigned_team || '',
              due_date: date,
            },
          ];
        } else {
          dailyData.job_card_status = [];
        }

        const dailyRef = doc(db, DAILY_COLLECTION, dailyDocId(tid, date));
        batch.set(dailyRef, dailyData, { merge: false }); // full replace for that day

        allResults.push({ train_id: tid, date });
      }

      await batch.commit();
    }

    return {
      success: true,
      results: allResults,
      count: allResults.length,
      skipped: allSkipped,
    };
  } catch (error) {
    console.error('Error saving bulk data:', error);
    return { success: false, error: error.message };
  }
};

// ── CSV Template generator ────────────────────────────────────────────────────
/**
 * Returns a CSV string with only the columns relevant to the given allowedSections.
 * Call this to generate the template the user downloads before filling in data.
 *
 * @param {object} [allowedSections]
 * @returns {string}  CSV text (headers + one sample row)
 */
export const generateCSVTemplate = (allowedSections) => {
  const today = new Date().toISOString().split('T')[0];
  const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

  // Always-present columns
  const headers = ['train_id'];
  const sample = ['KMRL-1'];

  const add = (cols) => {
    headers.push(...cols.map((c) => c[0]));
    sample.push(...cols.map((c) => c[1]));
  };

  if (allowed(allowedSections, 'certificate')) {
    add([
      ['rolling_stock_certificate', 'Valid'],
      ['signalling_certificate', 'Valid'],
      ['telecom_certificate', 'Valid'],
      ['certificate_expiry', '2026-12-31'],
    ]);
  }

  if (allowed(allowedSections, 'mileage')) {
    add([
      ['current_mileage', '45000'],
      ['last_maintenance_mileage', '44500'],
      ['daily_average_mileage', '150'],
      ['next_maintenance_due', '2026-08-01'],
    ]);
  }

  if (allowed(allowedSections, 'branding')) {
    add([
      ['branding_type', 'Government Campaign'],
      ['priority_level', '1'],
      ['remaining_exposure_hours', '120'],
      ['branding_valid_from', today],
      ['branding_valid_to', plus30],
      ['branding_approved_by', 'Marketing Dept'],
    ]);
  }

  if (allowed(allowedSections, 'cleaning')) {
    add([
      ['cleaning_type', 'Daily Clean'],
      ['assigned_team', 'Team A'],
    ]);
  }

  if (allowed(allowedSections, 'stabling')) {
    add([
      ['depot', 'Muttom Depot'],
      ['track_no', '7'],
      ['berth', 'B2'],
      ['orientation', 'UP'],
      ['distance_from_buffer', '4.5'],
      ['stabling_remarks', ''],
    ]);
  }

  if (allowed(allowedSections, 'jobCard')) {
    add([
      ['job_card_number', 'JC-1001'],
      ['job_description', 'Brake Inspection'],
      ['work_order_status', 'Open'],
      ['priority', 'High'],
    ]);
  }

  return headers.join(',') + '\n' + sample.join(',');
};

// ── CSV validation helper ─────────────────────────────────────────────────────
/**
 * Validates only the columns relevant to allowedSections.
 * Call this before saveBulkData to surface errors in the UI.
 *
 * @param {object[]} rows
 * @param {object}  [allowedSections]
 * @returns {{ line: number, tid: string, msg: string }[]}  Empty = all good.
 */
export const validateCSVRows = (rows, allowedSections) => {
  const VALID_BRANDING = new Set(['None', 'Election Awareness', 'Tourism', 'Government Campaign', 'Commercial']);
  const VALID_DEPOT = new Set(['Muttom Depot', 'Kalamassery Depot']);
  const VALID_STATUS = new Set(['Open', 'Pending', 'Completed']);
  const VALID_PRIORITY = new Set(['High', 'Medium', 'Low']);
  const VALID_CLEANING = new Set(['Daily Clean', 'Detailing', 'Weekly Maintenance']);
  const VALID_ORIENT = new Set(['UP', 'DN']);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().split('T')[0];

  const errors = [];

  rows.forEach((row, idx) => {
    const line = idx + 2; // row 1 = headers
    const tid = row.train_id || `Row ${line}`;

    // train_id is always required
    if (!row.train_id) {
      errors.push({ line, tid, msg: 'train_id is missing' });
    }

    // ── Certificate ───────────────────────────────────────────────────────────
    if (allowed(allowedSections, 'certificate')) {
      if (row.certificate_expiry) {
        if (!DATE_RE.test(row.certificate_expiry)) {
          errors.push({ line, tid, msg: `certificate_expiry '${row.certificate_expiry}' must be YYYY-MM-DD` });
        } else if (row.certificate_expiry < today) {
          errors.push({ line, tid, msg: `certificate_expiry '${row.certificate_expiry}' is already expired` });
        }
      }
    }

    // ── Branding ──────────────────────────────────────────────────────────────
    if (allowed(allowedSections, 'branding')) {
      if (row.branding_type && !VALID_BRANDING.has(row.branding_type)) {
        errors.push({
          line, tid,
          msg: `branding_type '${row.branding_type}' is invalid. Use: None, Election Awareness, Tourism, Government Campaign, Commercial`,
        });
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
          errors.push({
            line, tid,
            msg: `branding_valid_from (${row.branding_valid_from}) is after branding_valid_to (${row.branding_valid_to})`,
          });
        }
        if (row.priority_level && !['1', '2', '3'].includes(String(row.priority_level))) {
          errors.push({ line, tid, msg: `priority_level '${row.priority_level}' invalid. Use: 1, 2, or 3` });
        }
      }
    }

    // ── Mileage ───────────────────────────────────────────────────────────────
    if (allowed(allowedSections, 'mileage')) {
      if (row.next_maintenance_due && !DATE_RE.test(row.next_maintenance_due)) {
        errors.push({
          line, tid,
          msg: `next_maintenance_due '${row.next_maintenance_due}' must be YYYY-MM-DD, not a mileage number`,
        });
      }
      if (row.current_mileage && isNaN(Number(row.current_mileage))) {
        errors.push({ line, tid, msg: `current_mileage '${row.current_mileage}' must be a number` });
      }
    }

    // ── Cleaning ──────────────────────────────────────────────────────────────
    if (allowed(allowedSections, 'cleaning')) {
      if (row.cleaning_type && !VALID_CLEANING.has(row.cleaning_type)) {
        errors.push({
          line, tid,
          msg: `cleaning_type '${row.cleaning_type}' invalid. Use: Daily Clean, Detailing, Weekly Maintenance`,
        });
      }
    }

    // ── Stabling ──────────────────────────────────────────────────────────────
    if (allowed(allowedSections, 'stabling')) {
      if (row.depot && !VALID_DEPOT.has(row.depot)) {
        errors.push({ line, tid, msg: `depot '${row.depot}' invalid. Use: Muttom Depot or Kalamassery Depot` });
      }
      if (row.orientation && !VALID_ORIENT.has(row.orientation)) {
        errors.push({ line, tid, msg: `orientation '${row.orientation}' invalid. Use: UP or DN` });
      }
      if (row.track_no && isNaN(Number(row.track_no))) {
        errors.push({ line, tid, msg: `track_no '${row.track_no}' must be a number` });
      }
    }

    // ── Job card ──────────────────────────────────────────────────────────────
    if (allowed(allowedSections, 'jobCard')) {
      if (row.work_order_status && !VALID_STATUS.has(row.work_order_status)) {
        errors.push({
          line, tid,
          msg: `work_order_status '${row.work_order_status}' invalid. Use: Open, Pending, Completed`,
        });
      }
      if (row.priority && !VALID_PRIORITY.has(row.priority)) {
        errors.push({ line, tid, msg: `priority '${row.priority}' invalid. Use: High, Medium, Low` });
      }
    }
  });

  return errors; // empty array = all good
};