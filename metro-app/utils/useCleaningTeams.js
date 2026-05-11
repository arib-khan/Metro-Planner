// utils/useCleaningTeams.js
/**
 * useCleaningTeams
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches all cleaning teams created by the admin from Firestore.
 * Used in InductionForm so the leader can pick a team from a dropdown
 * instead of typing a name manually.
 *
 * Each team doc (cleaningTeams/{id}):
 * {
 *   name:        string,          // "TEAM-A"
 *   color:       string,
 *   leaderId:    string,          // uid of the app user who leads this team
 *   leaderName:  string,
 *   leaderPhone: string,
 *   members: [                    // plain members — name + phone only
 *     { id, name, phone }
 *   ]
 * }
 *
 * Usage:
 *   const { teams, loading } = useCleaningTeams();
 *   // teams is an array — pass as `options` to a FormSection select field
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * @returns {{
 *   teams: Array<{id, name, leaderId, leaderName, leaderPhone, members, color}>,
 *   teamNames: string[],           // just names — for select dropdowns
 *   getTeamByName: (name) => object|undefined,
 *   loading: boolean,
 *   error: string|null,
 * }}
 */
export function useCleaningTeams() {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        getDocs(query(collection(db, 'cleaningTeams'), orderBy('name')))
            .then(snap => {
                if (cancelled) return;
                setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            })
            .catch(err => {
                if (cancelled) return;
                console.error('useCleaningTeams error:', err);
                setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    const teamNames = teams.map(t => t.name);

    const getTeamByName = (name) => teams.find(t => t.name === name);

    return { teams, teamNames, getTeamByName, loading, error };
}