//src/app/simulation/layout.jsx
'use client';

import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';

export default function SimulationLayout({ children }) {
  return (
    <ProtectedRoute>
      <Navbar />
      {children}
    </ProtectedRoute>
  );
}