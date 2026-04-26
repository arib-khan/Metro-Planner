// src/app/components/Navbar.jsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Calendar, Users, FileText, Bell, Settings, Menu, X,
  LogOut, Wrench, Train, User, Mail, Phone, Building2,
  Shield, Clock, ChevronRight, Camera, Check, Pencil,
  AlertCircle, ShieldCheck, ClipboardList
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';

// ── Avatar initials helper ────────────────────────────────────────────────────
const getInitials = (name, email) => {
  if (name) {
    const parts = name.trim().split(' ').filter(Boolean);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email?.[0]?.toUpperCase() || '?';
};

// ── Avatar background based on name ──────────────────────────────────────────
const getAvatarColor = (str = '') => {
  const colors = [
    'bg-violet-600', 'bg-blue-600', 'bg-emerald-600',
    'bg-amber-600', 'bg-rose-600', 'bg-indigo-600',
    'bg-cyan-600', 'bg-teal-600',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// ── Avatar component ──────────────────────────────────────────────────────────
const Avatar = ({ name, email, size = 'sm', ring = false }) => {
  const initials = getInitials(name, email);
  const color = getAvatarColor(name || email || '');
  const sizeClass = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  return (
    <div className={`${sizeClass} ${color} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0
      ${ring ? 'ring-2 ring-white ring-offset-1' : ''}`}>
      {initials}
    </div>
  );
};


// ── Main Navbar ───────────────────────────────────────────────────────────────
const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Train },
    { name: 'Scheduling', href: '/scheduling', icon: Calendar },
    { name: 'Updates', href: '/updates', icon: FileText },
    { name: 'Inspection', href: '/inspection', icon: Wrench },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Job Cards', href: '/job-card', icon: ClipboardList },
    { name: 'Stations', href: '/Stationmanagement', icon: ClipboardList },
  ];

  const isActive = (path) => path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(path);

  const handleLogout = async () => {
    try { await logout(); router.push('/'); }
    catch (e) { console.error('Logout failed:', e); }
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center">
              <img src="/KMRLXRailOptima.png" alt="KMRL & Rail Optima"
                className="h-10 w-auto object-contain" style={{ maxWidth: '200px' }} />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex space-x-1">
              {navigation.map(({ name, href, icon: Icon }) => (
                <Link key={name} href={href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors
                    ${isActive(href) ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <Icon className="h-4 w-4 mr-2" />{name}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <Link href="/notifications" className="hidden sm:flex p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">
                <Bell className="h-5 w-5" />
              </Link>

              {/* Profile button — navigates to /user page */}
              <Link
                href="/profile"
                className={`flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full border transition-all
                  ${isActive('/user') ? 'border-slate-800 bg-slate-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <Avatar name={user?.displayName} email={user?.email} size="sm" />
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-gray-900 leading-none">
                    {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">Online</p>
                </div>
              </Link>

              {/* <button onClick={handleLogout}
                className="hidden sm:flex p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition"
                title="Logout">
                <LogOut className="h-5 w-5" />
              </button> */}

              {/* Mobile menu button */}
              <button onClick={() => setIsMobileMenuOpen(o => !o)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition">
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Nav */}
          {isMobileMenuOpen && (
            <div className="md:hidden border-t border-gray-100 py-2">
              <nav className="flex flex-col space-y-0.5">
                {navigation.map(({ name, href, icon: Icon }) => (
                  <Link key={name} href={href} onClick={() => setIsMobileMenuOpen(false)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center transition-colors
                      ${isActive(href) ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                    <Icon className="h-4 w-4 mr-3" />{name}
                  </Link>
                ))}
              </nav>
              <div className="px-2 pt-3 pb-2 border-t border-gray-100 mt-2 flex items-center justify-between">
                <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 flex-1 p-2 rounded-xl hover:bg-gray-50 transition">
                  <Avatar name={user?.displayName} email={user?.email} size="sm" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">{user?.displayName || user?.email?.split('@')[0]}</p>
                    <p className="text-xs text-gray-400">{user?.email}</p>
                  </div>
                </Link>
                <button onClick={handleLogout}
                  className="p-2 rounded-xl text-gray-500 hover:text-red-500 hover:bg-red-50 transition">
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

    </>
  );
};

export default Navbar;