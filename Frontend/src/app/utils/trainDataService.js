// utils/trainDataService.js
/**
 * KMRL Train Data Architecture
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO Firestore collections:
 *
 * 1. `trainMasterData`  (one doc per train, keyed by train_id)
 *    Stores: fitness_certificates, branding_priorities
 *    Behavior: OVERRIDEABLE — submitting new data replaces the existing record.
 *    Doc ID: train_id  (e.g. "KMRL-1")
 *
 * 2. `trainDailyData`  (one doc per train per date)
 *    Stores: cleaning_slots, stabling_geometry, mileage, job_card_status
 *    Behavior: APPEND per day — each date gets its own document.
 *    Doc ID: "{train_id}_{date}"  (e.g. "KMRL-1_2026-02-27")
 *
 * This means:
 *  - You can update a train's fitness cert anytime; it immediately overrides.
 *  - You can enter daily ops data for any past or future date independently.
 *  - fitness_certificates show for any viewing date within their validity window.
 *  - branding_priorities show for any date within valid_from → valid_to.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Collection names ──────────────────────────────────────────────────────────
export const MASTER_COLLECTION = 'trainMasterData';
export const DAILY_COLLECTION = 'trainDailyData';

// ── Daily data doc ID ─────────────────────────────────────────────────────────
export const dailyDocId = (trainId, date) => `${trainId}_${date}`;

// ── Check expiry alerts ───────────────────────────────────────────────────────
/**
 * Returns alert objects for a fitness certificate record.
 * @param {object} cert  - { rolling_stock_validity, signalling_validity, telecom_validity }
 * @param {string} viewDate - 'YYYY-MM-DD'
 * @param {string} trainId
 * @returns {Array<{train_id, field, expiryDate, daysLeft, type: 'expired'|'warning'|'ok'}>}
 */
export const checkCertAlerts = (cert, viewDate, trainId) => {
    if (!cert) return [];
    const alerts = [];
    const checks = [
        { label: 'Rolling Stock', key: 'rolling_stock_validity' },
        { label: 'Signalling', key: 'signalling_validity' },
        { label: 'Telecom', key: 'telecom_validity' },
    ];

    const view = new Date(viewDate);

    checks.forEach(({ label, key }) => {
        const expiryDate = cert[key];
        if (!expiryDate) return;

        const expiry = new Date(expiryDate);
        const daysLeft = Math.ceil((expiry - view) / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) {
            alerts.push({
                train_id: trainId,
                field: label,
                expiryDate,
                daysLeft,
                type: 'expired',
                message: `${trainId} — ${label} certificate EXPIRED on ${expiryDate} (${Math.abs(daysLeft)} days ago)`,
            });
        } else if (daysLeft <= 7) {
            alerts.push({
                train_id: trainId,
                field: label,
                expiryDate,
                daysLeft,
                type: 'warning',
                message: `${trainId} — ${label} certificate expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiryDate})`,
            });
        }
    });

    return alerts;
};

/**
 * Check branding expiry alerts.
 */
export const checkBrandingAlerts = (brandingList, viewDate, trainId) => {
    if (!brandingList?.length) return [];
    const alerts = [];
    const view = new Date(viewDate);

    brandingList.forEach((b) => {
        if (!b.valid_to) return;
        const expiry = new Date(b.valid_to);
        const daysLeft = Math.ceil((expiry - view) / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) {
            alerts.push({
                train_id: trainId,
                field: `Branding (${b.branding_type})`,
                expiryDate: b.valid_to,
                daysLeft,
                type: 'expired',
                message: `${trainId} — ${b.branding_type} branding EXPIRED on ${b.valid_to}`,
            });
        } else if (daysLeft <= 3) {
            alerts.push({
                train_id: trainId,
                field: `Branding (${b.branding_type})`,
                expiryDate: b.valid_to,
                daysLeft,
                type: 'warning',
                message: `${trainId} — ${b.branding_type} branding expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
            });
        }
    });

    return alerts;
};

// ── Save / override master data (fitness + branding) ─────────────────────────
/**
 * Saves (overrides) fitness_certificates and/or branding_priorities for a train.
 * This completely replaces the existing master record for that train.
 */
export const saveMasterData = async ({ trainId, fitness_certificates, branding_priorities, userId, userName, userEmail }) => {
    try {
        const docRef = doc(db, MASTER_COLLECTION, trainId);
        const existing = await getDoc(docRef);

        const payload = {
            train_id: trainId,
            updatedAt: serverTimestamp(),
            updatedBy: userName || userId,
            updatedByEmail: userEmail,
        };

        if (fitness_certificates) {
            payload.fitness_certificates = { ...fitness_certificates };
        } else if (existing.exists()) {
            // keep existing if not being updated
            payload.fitness_certificates = existing.data().fitness_certificates || null;
        }

        if (branding_priorities !== undefined) {
            payload.branding_priorities = branding_priorities;
        } else if (existing.exists()) {
            payload.branding_priorities = existing.data().branding_priorities || [];
        }

        await setDoc(docRef, payload, { merge: true });
        return { success: true };
    } catch (error) {
        console.error('saveMasterData error:', error);
        return { success: false, error: error.message };
    }
};

// ── Save daily data ───────────────────────────────────────────────────────────
/**
 * Saves daily ops data for a specific train + date.
 * Overwrites if a record for that train+date already exists.
 */
export const saveDailyData = async ({
    trainId,
    date,
    cleaning_slots,
    stabling_geometry,
    mileage,
    job_card_status,
    userId,
    userName,
    userEmail,
}) => {
    try {
        const id = dailyDocId(trainId, date);
        const docRef = doc(db, DAILY_COLLECTION, id);

        await setDoc(docRef, {
            train_id: trainId,
            date,
            cleaning_slots: cleaning_slots || [],
            stabling_geometry: stabling_geometry || null,
            mileage: mileage || null,
            job_card_status: job_card_status || [],
            userId,
            userName,
            userEmail,
            updatedAt: serverTimestamp(),
            status: 'submitted',
        }, { merge: false }); // full replace

        return { success: true, id };
    } catch (error) {
        console.error('saveDailyData error:', error);
        return { success: false, error: error.message };
    }
};

// ── Fetch master data for all trains ─────────────────────────────────────────
export const fetchAllMasterData = async () => {
    try {
        const snap = await getDocs(collection(db, MASTER_COLLECTION));
        const map = {};
        snap.forEach(d => { map[d.id] = d.data(); });
        return map;
    } catch (error) {
        console.error('fetchAllMasterData error:', error);
        return {};
    }
};

// ── Fetch daily data for a date range ────────────────────────────────────────
export const fetchDailyDataForDates = async (dates) => {
    if (!dates.length) return [];
    try {
        // Firestore 'in' supports up to 10 values; chunk if needed
        const chunks = [];
        for (let i = 0; i < dates.length; i += 10) chunks.push(dates.slice(i, i + 10));

        const docs = [];
        for (const chunk of chunks) {
            const q = query(collection(db, DAILY_COLLECTION), where('date', 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        }
        return docs;
    } catch (error) {
        console.error('fetchDailyDataForDates error:', error);
        return [];
    }
};

// ── Is branding active on a given date? ──────────────────────────────────────
export const isBrandingActiveOn = (branding, date) => {
    if (!branding?.valid_from || !branding?.valid_to) return false;
    return date >= branding.valid_from && date <= branding.valid_to;
};

// ── Is fitness cert valid on a given date? ───────────────────────────────────
export const isFitnessValidOn = (cert, date) => {
    if (!cert) return false;
    const { rolling_stock_validity: rs, signalling_validity: sig, telecom_validity: tel } = cert;
    return (rs && rs >= date) && (sig && sig >= date) && (tel && tel >= date);
};