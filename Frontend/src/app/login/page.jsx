// src/app/login/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Train, Mail, Lock, AlertCircle, Fingerprint } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showBiometricOption, setShowBiometricOption] = useState(false);
  const { login, biometricAvailable, authenticateWithBiometric, isBiometricRegistered } = useAuth();
  const router = useRouter();

  // Check if biometric is registered for the entered email
  useEffect(() => {
    if (email && biometricAvailable) {
      setShowBiometricOption(isBiometricRegistered(email));
    } else {
      setShowBiometricOption(false);
    }
  }, [email, biometricAvailable, isBiometricRegistered]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await login(email, password);

      if (!userCredential.user.emailVerified) {
        setError('Please verify your email before logging in. Check your inbox for the verification link.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch (error) {
      let errorMessage = 'Failed to log in. Please check your credentials.';

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setError('');
    setBiometricLoading(true);

    try {
      // Authenticate with biometric
      await authenticateWithBiometric(email);

      // Get stored password (in production, use secure token-based auth)
      const storedPassword = localStorage.getItem(`pwd_${email}`);

      if (!storedPassword) {
        setError('Biometric login not properly configured. Please log in with password.');
        setBiometricLoading(false);
        return;
      }

      // Log in with stored credentials
      const userCredential = await login(email, storedPassword);

      if (!userCredential.user.emailVerified) {
        setError('Please verify your email before logging in.');
        setBiometricLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch (error) {
      console.error('Biometric login error:', error);

      let errorMessage = 'Biometric authentication failed. Please try logging in with your password.';

      if (error.message.includes('not available')) {
        errorMessage = 'Biometric authentication is not available on this device.';
      } else if (error.message.includes('not found')) {
        errorMessage = 'No biometric credential found. Please log in with password and enable fingerprint.';
      } else if (error.name === 'NotAllowedError') {
        errorMessage = 'Biometric authentication was cancelled.';
      }

      setError(errorMessage);
      setBiometricLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center mb-4 cursor-pointer">
              <Train className="h-10 w-10 text-gray-900" />
              <div className="ml-3 text-left">
                <h1 className="text-xl font-semibold text-gray-900">Railway System</h1>
                <p className="text-xs text-gray-500">Induction & Monitoring</p>
              </div>
            </div>
          </Link>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
          <p className="text-gray-600">Sign in to access your dashboard</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Show fingerprint button if available for this email */}
            {showBiometricOption && (
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={biometricLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-blue-200"
                >
                  <Fingerprint className="h-5 w-5" />
                  {biometricLoading ? 'Authenticating...' : 'Login with Fingerprint'}
                </button>
              </div>
            )}

            {showBiometricOption && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or continue with password</span>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link href="/signup" className="text-gray-900 font-medium hover:underline">
              Sign up
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}