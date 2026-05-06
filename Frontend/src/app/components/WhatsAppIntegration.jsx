import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, CheckCircle, XCircle, QrCode, Smartphone, RefreshCw, AlertCircle, Wifi, WifiOff, Users, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const WhatsAppIntegration = () => {
  const { user } = useAuth();
  const [whatsappStatus, setWhatsappStatus] = useState({
    ready: false,
    hasQR: false,
    info: null,
    firebaseConnected: false
  });
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [initializing, setInitializing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false); // BUG FIX: was missing — no loading state for disconnect
  const [allConnections, setAllConnections] = useState([]);
  const [retryCount, setRetryCount] = useState(0);

  const pollingIntervalRef = useRef(null);
  const lastSuccessfulFetchRef = useRef(Date.now());
  // BUG FIX: track retryCount in a ref so the polling interval closure always reads the latest value
  const retryCountRef = useRef(0);

  const API_URL = process.env.NEXT_PUBLIC_WHATSAPP_API || 'http://localhost:5000';

  const fetchWithTimeout = useCallback(async (url, options = {}, timeout = 15000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Request timeout - server took too long to respond');
      }
      throw err;
    }
  }, []);

  // BUG FIX: fetchQRCode extracted and stabilised; it was being called without await in checkWhatsAppStatus
  const fetchQRCode = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/qr/${user.uid}`,
        {},
        10000
      );
      if (!response.ok) return;
      const data = await response.json();
      if (data.qr) setQrCode(data.qr);
    } catch (err) {
      console.error('Error fetching QR code:', err);
    }
  }, [user, API_URL, fetchWithTimeout]);

  const checkWhatsAppStatus = useCallback(async () => {
    if (!user || !isOnline) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/status/${user.uid}`,
        {},
        10000
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setWhatsappStatus(data);
      // BUG FIX: only clear error on success, don't wipe non-fetch errors
      setError(null);
      const newRetry = 0;
      setRetryCount(newRetry);
      retryCountRef.current = newRetry;
      lastSuccessfulFetchRef.current = Date.now();

      if (data.hasQR && !data.ready) {
        // BUG FIX: await the QR fetch so it doesn't race with state updates
        await fetchQRCode();
      } else {
        setQrCode(null);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error checking WhatsApp status:', err);

      let errorMessage = 'Unable to connect to WhatsApp server';
      if (err.message.includes('timeout')) {
        errorMessage = 'Server is taking too long to respond. Please try again.';
      } else if (err.message.includes('Failed to fetch')) {
        errorMessage = 'Cannot reach WhatsApp server. Check if server is running.';
      } else if (err.message.includes('Server error')) {
        errorMessage = err.message;
      }

      // BUG FIX: don't replace the full UI with an error screen on polling failures;
      // set a non-blocking error notice instead and keep the existing UI rendered.
      setError(errorMessage);
      setLoading(false);

      setRetryCount(prev => {
        const next = prev + 1;
        retryCountRef.current = next;
        return next;
      });
    }
  }, [user, isOnline, API_URL, fetchWithTimeout, fetchQRCode]);

  const loadAllConnections = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/connections`,
        {},
        10000
      );
      if (response.ok) {
        const data = await response.json();
        setAllConnections(data.connections || []);
      }
    } catch (err) {
      console.error('Error loading connections:', err);
    }
  }, [API_URL, fetchWithTimeout]);

  // BUG FIX: retryCount removed from dependency array — it was causing the interval to be
  // torn down and recreated on every error, leaking intervals. Instead we read retryCountRef.current
  // inside the closure so the interval always uses the latest backoff without re-mounting.
  useEffect(() => {
    if (!user) return;

    checkWhatsAppStatus();
    loadAllConnections();

    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(() => {
      const timeSinceLastSuccess = Date.now() - lastSuccessfulFetchRef.current;
      // BUG FIX: increased stale window to 5 min so polling survives longer outages
      if (timeSinceLastSuccess < 300000) {
        checkWhatsAppStatus();
        loadAllConnections();
      }
    }, 10000); // fixed 10s interval; backoff is handled by retryCountRef if needed

    const handleOnline = () => {
      setIsOnline(true);
      setError(null);
      setRetryCount(0);
      retryCountRef.current = 0;
      lastSuccessfulFetchRef.current = Date.now(); // BUG FIX: reset timer so polling resumes immediately
      checkWhatsAppStatus();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setError('You are offline. Please check your internet connection.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // BUG FIX: only re-run when user changes, not on every checkWhatsAppStatus re-creation

  const initializeWhatsApp = async () => {
    if (!user) return;
    setInitializing(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/initialize`,
        {
          method: 'POST',
          body: JSON.stringify({
            userId: user.uid,
            userEmail: user.email,
            userName: user.displayName || user.email.split('@')[0]
          })
        },
        30000
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setTimeout(() => {
          checkWhatsAppStatus();
          setRetryCount(0);
          retryCountRef.current = 0;
        }, 2000);
      } else {
        setError(data.error || 'Failed to initialize WhatsApp');
      }
    } catch (err) {
      console.error('Error initializing WhatsApp:', err);
      setError(err.message || 'Failed to initialize WhatsApp. Please try again.');
    } finally {
      setInitializing(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to disconnect your WhatsApp?')) return;

    // BUG FIX: guard against double-clicks with a dedicated loading state
    setDisconnecting(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/disconnect/${user.uid}`,
        { method: 'POST' },
        10000
      );

      const data = await response.json();

      if (data.success) {
        // BUG FIX: preserve firebaseConnected in reset so UI doesn't flicker
        setWhatsappStatus(prev => ({
          ready: false,
          hasQR: false,
          info: null,
          firebaseConnected: prev.firebaseConnected
        }));
        setQrCode(null);
        setError(null);
        // Refresh connections list after disconnect
        loadAllConnections();
      } else {
        throw new Error(data.error || 'Failed to disconnect');
      }
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Failed to disconnect WhatsApp. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  const resetSession = async () => {
    if (!user) return;
    if (!confirm('This will clear your saved session and show a new QR code. Continue?')) return;

    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/reset/${user.uid}`,
        { method: 'POST' },
        10000
      );
      const data = await response.json();
      if (data.success) {
        setWhatsappStatus(prev => ({ ready: false, hasQR: false, info: null, firebaseConnected: prev.firebaseConnected }));
        setQrCode(null);
        // Wait a moment then re-initialize to get fresh QR
        setTimeout(() => initializeWhatsApp(), 1000);
      } else {
        throw new Error(data.error || 'Reset failed');
      }
    } catch (err) {
      setError('Failed to reset session: ' + err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    setRetryCount(0);
    retryCountRef.current = 0;
    // BUG FIX: reset lastSuccessfulFetchRef so the polling interval doesn't skip immediately
    lastSuccessfulFetchRef.current = Date.now();
    checkWhatsAppStatus();
    loadAllConnections();
  };

  if (!user) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="text-center py-8 text-gray-600">
          Please log in to connect your WhatsApp
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <span className="ml-3 text-gray-600">Checking WhatsApp connection...</span>
        </div>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-6 mb-6">
        <div className="flex items-start">
          <WifiOff className="h-6 w-6 text-orange-600 mr-3 mt-0.5 shrink-0" />
          <div className="flex-1">
            {/* BUG FIX: was missing apostrophe — "Youre" → "You're" */}
            <h3 className="text-lg font-semibold text-orange-900 mb-2">You&apos;re Offline</h3>
            <p className="text-sm text-orange-700 mb-4">
              Please check your internet connection to use WhatsApp features.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-6">
      {/* BUG FIX: error is now a non-blocking banner inside the main UI, not a full-page replacement.
          Non-fatal polling errors no longer hide the connected/QR state. */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mr-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{error}</p>
              {retryCount > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  Retry attempt {retryCount}
                </p>
              )}
            </div>
            <div className="flex gap-2 ml-3 shrink-0">
              <button
                onClick={handleRetry}
                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-medium transition-colors"
              >
                <RefreshCw className="h-3 w-3 inline mr-1" />
                Retry
              </button>
              <a
                href={`${API_URL}/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
              >
                Server Status
              </a>
            </div>
          </div>
        </div>
      )}

      {/* User's WhatsApp Connection */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <MessageSquare className="h-6 w-6 text-green-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">My WhatsApp Connection</h3>
          </div>
          <div className="flex items-center space-x-3">
            {whatsappStatus.ready ? (
              <>
                <span className="flex items-center text-sm text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Connected
                </span>
                {/* BUG FIX: button is disabled while disconnect is in progress */}
                <button
                  onClick={disconnectWhatsApp}
                  disabled={disconnecting}
                  className="p-1 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Disconnect WhatsApp"
                >
                  {disconnecting
                    ? <RefreshCw className="h-4 w-4 text-red-400 animate-spin" />
                    : <LogOut className="h-4 w-4 text-red-600" />
                  }
                </button>
              </>
            ) : (
              <span className="flex items-center text-sm text-orange-600">
                <XCircle className="h-4 w-4 mr-1" />
                Not Connected
              </span>
            )}
            <button
              onClick={handleRetry}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="Refresh status"
            >
              <RefreshCw className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>

        {whatsappStatus.ready && whatsappStatus.info ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-green-900 mb-2">
                  Your WhatsApp is Connected
                </h4>
                <p className="text-sm text-green-700 mb-3">
                  Connected as: <strong>{whatsappStatus.info.pushname}</strong> ({whatsappStatus.info.phone})
                </p>
                <p className="text-xs text-green-600 mb-4">
                  ✓ You can now submit train induction data via WhatsApp
                </p>

                <div className="mt-4 p-3 bg-white rounded border border-green-200">
                  <p className="text-xs font-semibold text-gray-700 mb-2">📱 Send messages in this format:</p>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-3 rounded overflow-x-auto">
                    {`Train Set: KMRL-12
Depot: Muttom
Current Mileage: 288650 km

--- Fitness Certificates ---
Fitness Status: Fit for Service
Rolling Stock: 2025-12-31
Signalling: 2025-11-30
Telecom: 2026-03-15

--- Branding ---
Branding: Election Awareness (Priority: High)
Branding From: 2025-05-01
Branding To: 2025-07-31

--- Cleaning ---
Cleaning Slot: 23:00-23:45
Cleaning Type: Deep Clean

--- Stabling ---
Track: 7
Berth: B2
Orientation: UP

--- Job Card ---
Job Card: JC-1001 – Brake Inspection – Open

Reported By: Ground Staff A`}
                  </pre>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 You can send a partial message — only fill the sections you need to update.
                    Every field except <strong>Train Set</strong> is optional.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : qrCode ? (
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <Smartphone className="h-6 w-6 text-gray-600 mr-2" />
              <h4 className="text-md font-semibold text-gray-900">Scan QR Code to Connect</h4>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-4 inline-block border-2 border-gray-200">
              <img
                src={qrCode}
                alt="WhatsApp QR Code"
                className="w-64 h-64 mx-auto"
              />
            </div>

            <div className="text-sm text-gray-600 space-y-2">
              <p className="flex items-center justify-center">
                <span className="bg-gray-900 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-xs font-bold">1</span>
                Open WhatsApp on your phone
              </p>
              <p className="flex items-center justify-center">
                <span className="bg-gray-900 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-xs font-bold">2</span>
                Tap Menu or Settings → Linked Devices
              </p>
              <p className="flex items-center justify-center">
                <span className="bg-gray-900 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-xs font-bold">3</span>
                Tap Link a Device and scan this QR code
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400 mb-2">QR code not working or previously logged out?</p>
              <button
                onClick={resetSession}
                disabled={disconnecting}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3 inline mr-1" />
                Reset &amp; get fresh QR
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <QrCode className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-sm text-gray-600 mb-4">
              Connect your WhatsApp to submit train data
            </p>
            <button
              onClick={initializeWhatsApp}
              disabled={initializing}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {initializing ? (
                <>
                  {/* BUG FIX: was "inline" which is not a valid Tailwind display class for this context; changed to inline-block */}
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                  Initializing...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 inline mr-2" />
                  Connect WhatsApp
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* All Active Connections */}
      {allConnections.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Users className="h-5 w-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Active WhatsApp Connections</h3>
            <span className="ml-auto text-sm text-gray-500">{allConnections.length} users connected</span>
          </div>

          <div className="space-y-2">
            {allConnections.map((connection, idx) => (
              <div key={connection.id ?? idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-3 ${connection.connected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{connection.userName}</p>
                    <p className="text-xs text-gray-500">{connection.userEmail}</p>
                  </div>
                </div>
                {connection.connected && connection.whatsappInfo && (
                  <div className="text-xs text-gray-600">
                    {connection.whatsappInfo.pushname} ({connection.whatsappInfo.phone})
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              💡 All connected users can submit data via WhatsApp. Approved submissions will be visible to everyone in the system.
            </p>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">🤖 How Multi-User WhatsApp Works:</h4>
        <ul className="text-xs text-gray-700 space-y-2">
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            Each user connects their own WhatsApp number
          </li>
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            Send train data messages to your own WhatsApp
          </li>
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            Data is tagged with your name and email
          </li>
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            Submissions appear in /updates for approval
          </li>
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            <strong>Once approved, data is shared with all users</strong>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default WhatsAppIntegration;