//src/app/inspection/layout.jsx
'use client';

import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import CleaningTasksPage from './cleaningTasks';

export default function cleaningTeams({ children }) {
    return (
        <ProtectedRoute>
            <Navbar />
            {children}
            <CleaningTasksPage />
        </ProtectedRoute>
    );
}