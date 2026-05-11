// utils/usePermissions.js
/**
 * usePermissions
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the current mobile user's `allowedSections` map from their Firestore
 * `users/{uid}` document and exposes a `can(sectionKey)` helper.
 *
 * The admin sets `allowedSections` in the User Management page (page.jsx).
 * If the field is absent (old user doc), ALL sections are shown — safe default.
 *
 * Usage in any screen:
 *   const { can, loading } = usePermissions();
 *   if (!can('branding')) return null;
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Firestore schema expected on users/{uid}:
 * {
 *   allowedSections: {
 *     certificate: true,
 *     branding:    false,
 *     mileage:     true,
 *     cleaning:    true,
 *     stabling:    false,
 *     jobCard:     true,
 *   }
 * }
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './authHelpers';

// ── All known section keys ────────────────────────────────────────────────────
export const SECTION_KEYS = [
    'certificate',
    'branding',
    'mileage',
    'cleaning',
    'stabling',
    'jobCard',
];

// If a user has NO allowedSections field at all (old doc / first login),
// we default to ALLOWING everything so they are not accidentally locked out.
const ALL_ALLOWED = Object.fromEntries(SECTION_KEYS.map((k) => [k, true]));

/**
 * @returns {{
 *   can: (sectionKey: string) => boolean,
 *   allowedSections: Record<string, boolean>,
 *   loading: boolean,
 *   error: string | null,
 * }}
 */
export function usePermissions() {
    const { user } = useAuth();
    const [allowedSections, setAllowedSections] = useState(ALL_ALLOWED);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        // Real-time listener — permissions update instantly if admin changes them
        const unsub = onSnapshot(
            doc(db, 'users', user.uid),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.allowedSections && typeof data.allowedSections === 'object') {
                        // Merge with ALL_ALLOWED so any NEW keys default to true
                        setAllowedSections({ ...ALL_ALLOWED, ...data.allowedSections });
                    } else {
                        // Field not set yet — allow everything (backward compat)
                        setAllowedSections(ALL_ALLOWED);
                    }
                } else {
                    setAllowedSections(ALL_ALLOWED);
                }
                setLoading(false);
            },
            (err) => {
                console.error('usePermissions error:', err);
                setError(err.message);
                // On error: fail open — show all sections rather than lock the user out
                setAllowedSections(ALL_ALLOWED);
                setLoading(false);
            }
        );

        return unsub;
    }, [user?.uid]);

    /**
     * Returns true if the user is allowed to see/submit the given section.
     * Always returns true while loading (prevents flash of missing sections).
     */
    const can = (sectionKey) => {
        if (loading) return true;
        return allowedSections[sectionKey] === true;
    };

    return { can, allowedSections, loading, error };
}