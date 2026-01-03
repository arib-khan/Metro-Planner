//src/app/scheduling/layout.jsx
'use client';

import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';

export default function SchedulingLayout({ children }) {
  return (
    <ProtectedRoute>
      <Navbar />
      {children}
    </ProtectedRoute>
  );
}