// src/app/signup/page.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Train, Mail, Lock, User, AlertCircle, CheckCircle, Fingerprint } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [biometricSetupLoading, setBiometricSetupLoading] = useState(false);
  const [biometricSetupComplete, setBiometricSetupComplete] = useState(false);
  const { signup, biometricAvailable, registerBiometric } = useAuth();
  const router = useRouter();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      await signup(formData.email, formData.password);
      setSuccess(true);
      
      // Show biometric setup option if available
      if (biometricAvailable) {
        setShowBiometricSetup(true);
      } else {
        // Redirect to login after 3 seconds if biometric not available
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (error) {
      let errorMessage = 'Failed to create account. Please try again.';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleBiometricSetup = async () => {
    setBiometricSetupLoading(true);
    setError('');

    try {
      await registerBiometric(formData.email);
      
      // Store password securely (in production, use secure token-based auth)
      localStorage.setItem(`pwd_${formData.email}`, formData.password);
      
      setBiometricSetupComplete(true);
      
      // Redirect after showing success message
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error) {
      console.error('Biometric setup error:', error);
      
      let errorMessage = 'Failed to set up fingerprint authentication. You can enable it later from settings.';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Fingerprint setup was cancelled. You can enable it later from settings.';
      } else if (error.message.includes('not available')) {
        errorMessage = 'Biometric authentication is not available on this device.';
      }
      
      setError(errorMessage);
      setBiometricSetupLoading(false);
      
      // Still redirect to login after error
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    }
  };

  const skipBiometricSetup = () => {
    router.push('/login');
  };

  if (success && !showBiometricSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Account Created!</h2>
          <p className="text-gray-600 mb-6">
            We've sent a verification email to <strong>{formData.email}</strong>. 
            Please check your inbox and click the verification link to activate your account.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Redirecting you to login page...
          </p>
          <Link href="/login">
            <button className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium">
              Go to Login
            </button>
          </Link>
        </div>
      </div>
    );
  }

  if (success && showBiometricSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              {biometricSetupComplete ? (
                <CheckCircle className="h-10 w-10 text-green-600" />
              ) : (
                <Fingerprint className="h-10 w-10 text-blue-600" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {biometricSetupComplete ? 'Fingerprint Enabled!' : 'Enable Fingerprint Login?'}
            </h2>
            <p className="text-gray-600">
              {biometricSetupComplete 
                ? 'You can now use your fingerprint to log in quickly and securely.'
                : 'Speed up your login process by enabling fingerprint authentication.'
              }
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!biometricSetupComplete && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <ul className="text-sm text-gray-700 space-y-2">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Quick and secure login</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                    <span>No need to remember passwords</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Enhanced security</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={handleBiometricSetup}
                disabled={biometricSetupLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Fingerprint className="h-5 w-5" />
                {biometricSetupLoading ? 'Setting up...' : 'Enable Fingerprint'}
              </button>

              <button
                onClick={skipBiometricSetup}
                disabled={biometricSetupLoading}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}

          {biometricSetupComplete && (
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-4">
                Redirecting to login page...
              </p>
              <Link href="/login">
                <button className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium">
                  Go to Login
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 py-12">
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
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h2>
          <p className="text-gray-600">Start managing your railway operations</p>
        </div>

        {/* Signup Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {biometricAvailable && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start">
              <Fingerprint className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Fingerprint authentication available! You'll be able to enable it after signing up.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Min. 6 characters"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Confirm your password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-gray-900 font-medium hover:underline">
              Sign in
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