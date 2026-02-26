// src/app/components/BiometricSettings.jsx
'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function BiometricSettings() {
  const {
    user,
    biometricAvailable,
    registerBiometric,
    isBiometricRegistered,
    removeBiometric
  } = useAuth();

  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user?.email) {
      setIsRegistered(isBiometricRegistered(user.email));
    }
  }, [user, isBiometricRegistered]);

  const handleEnableBiometric = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await registerBiometric(user.email);

      // In production, you should use secure token-based authentication
      // For demo purposes, we're storing a flag
      localStorage.setItem(`biometric_enabled_${user.email}`, 'true');

      setIsRegistered(true);
      setMessage({
        type: 'success',
        text: 'Fingerprint authentication enabled successfully!'
      });
    } catch (error) {
      console.error('Error enabling biometric:', error);

      let errorText = 'Failed to enable fingerprint authentication.';

      if (error.name === 'NotAllowedError') {
        errorText = 'Fingerprint setup was cancelled.';
      } else if (error.message.includes('not available')) {
        errorText = 'Biometric authentication is not available on this device.';
      }

      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  const handleDisableBiometric = () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      removeBiometric(user.email);
      localStorage.removeItem(`biometric_enabled_${user.email}`);
      localStorage.removeItem(`pwd_${user.email}`);

      setIsRegistered(false);
      setMessage({
        type: 'success',
        text: 'Fingerprint authentication disabled successfully.'
      });
    } catch (error) {
      console.error('Error disabling biometric:', error);
      setMessage({
        type: 'error',
        text: 'Failed to disable fingerprint authentication.'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!biometricAvailable) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <XCircle className="h-6 w-6 text-gray-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Fingerprint Authentication
            </h3>
            <p className="text-sm text-gray-600">
              Biometric authentication is not available on this device. This feature requires
              a device with fingerprint scanner, Face ID, or Windows Hello support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isRegistered ? 'bg-green-100' : 'bg-blue-100'
              }`}>
              <Fingerprint className={`h-6 w-6 ${isRegistered ? 'text-green-600' : 'text-blue-600'
                }`} />
            </div>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Fingerprint Authentication
            </h3>
            <p className="text-sm text-gray-600">
              {isRegistered
                ? 'Fingerprint login is currently enabled for your account.'
                : 'Enable fingerprint authentication for quick and secure login.'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center">
          {isRegistered ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Enabled
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Disabled
            </span>
          )}
        </div>
      </div>

      {message.text && (
        <div className={`mb-4 p-4 rounded-lg flex items-start ${message.type === 'success'
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
          }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
          )}
          <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}>
            {message.text}
          </p>
        </div>
      )}

      {!isRegistered && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-700 mb-3 font-medium">Benefits:</p>
          <ul className="text-sm text-gray-700 space-y-2">
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
              <span>Login instantly without typing your password</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
              <span>Enhanced security with biometric verification</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
              <span>Works with fingerprint, Face ID, or Windows Hello</span>
            </li>
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        {isRegistered ? (
          <button
            onClick={handleDisableBiometric}
            disabled={loading}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Disabling...' : 'Disable Fingerprint'}
          </button>
        ) : (
          <button
            onClick={handleEnableBiometric}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Fingerprint className="h-4 w-4" />
            {loading ? 'Enabling...' : 'Enable Fingerprint'}
          </button>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> Your biometric data never leaves your device and is managed
          securely by your devices operating system.
        </p>
      </div>
    </div>
  );
}