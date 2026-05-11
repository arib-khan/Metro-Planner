// src/app/utils/useCleaningTeams.js
import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useCleaningTeams() {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchTeams = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'cleaningTeams'));
                const teamsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                setTeams(teamsData);
            } catch (err) {
                console.error('Failed to load cleaning teams:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchTeams();
    }, []);

    // Helper to find a team by its name (case-insensitive)
    const getTeamByName = (teamName) => {
        if (!teamName) return null;
        return teams.find(
            team => team.name?.toLowerCase() === teamName.toLowerCase()
        );
    };

    return { teams, loading, error, getTeamByName };
}