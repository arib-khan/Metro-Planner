//src/app/updates/layout.jsx
'use client';

import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';

export default function UpdatesLayout({ children }) {
  return (
    <ProtectedRoute>
      <Navbar />
      {children}
    </ProtectedRoute>
  );
}