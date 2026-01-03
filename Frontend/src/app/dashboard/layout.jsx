// src/app/dashboard/layout.jsx
'use client';

import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';

export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute>
      <Navbar />
      {children}
    </ProtectedRoute>
  );
}