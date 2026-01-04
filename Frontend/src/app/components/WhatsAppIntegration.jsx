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
  const [isOnline, setIsOnline] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [allConnections, setAllConnections] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  
  const pollingIntervalRef = useRef(null);
  const lastSuccessfulFetchRef = useRef(Date.now());

  // Use environment variable with fallback
  const API_URL = process.env.NEXT_PUBLIC_WHATSAPP_API || 'http://localhost:5000';

  // Fetch with timeout and retry logic
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
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - server took too long to respond');
      }
      throw error;
    }
  }, []);

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
      setError(null);
      setRetryCount(0);
      lastSuccessfulFetchRef.current = Date.now();
      
      if (data.hasQR && !data.ready) {
        fetchQRCode();
      } else {
        setQrCode(null);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
      
      // Set user-friendly error messages
      let errorMessage = 'Unable to connect to WhatsApp server';
      
      if (error.message.includes('timeout')) {
        errorMessage = 'Server is taking too long to respond. Please try again.';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Cannot reach WhatsApp server. Check if server is running.';
      } else if (error.message.includes('Server error')) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      
      // Exponential backoff for retries
      setRetryCount(prev => prev + 1);
    }
  }, [user, isOnline, API_URL, fetchWithTimeout]);

  const fetchQRCode = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/qr/${user.uid}`,
        {},
        10000
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch QR code');
      }
      
      const data = await response.json();
      
      if (data.qr) {
        setQrCode(data.qr);
      }
    } catch (error) {
      console.error('Error fetching QR code:', error);
    }
  }, [user, API_URL, fetchWithTimeout]);

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
    } catch (error) {
      console.error('Error loading connections:', error);
      // Don't show error to user for this secondary feature
    }
  }, [API_URL, fetchWithTimeout]);

  // Smart polling with exponential backoff
  useEffect(() => {
    if (!user) return;

    checkWhatsAppStatus();
    loadAllConnections();

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Dynamic polling interval based on retry count
    const baseInterval = 10000; // 10 seconds base
    const maxInterval = 60000; // Max 60 seconds
    const interval = Math.min(baseInterval * Math.pow(1.5, retryCount), maxInterval);

    pollingIntervalRef.current = setInterval(() => {
      // Only poll if last successful fetch was recent (within 2 minutes)
      const timeSinceLastSuccess = Date.now() - lastSuccessfulFetchRef.current;
      if (timeSinceLastSuccess < 120000) {
        checkWhatsAppStatus();
        loadAllConnections();
      }
    }, interval);

    const handleOnline = () => {
      setIsOnline(true);
      setError(null);
      setRetryCount(0);
      checkWhatsAppStatus();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setError('You are offline. Please check your internet connection.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, checkWhatsAppStatus, loadAllConnections, retryCount]);

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
        30000 // 30 second timeout for initialization
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
        }, 2000);
      } else {
        setError(data.error || 'Failed to initialize WhatsApp');
      }
    } catch (error) {
      console.error('Error initializing WhatsApp:', error);
      setError(error.message || 'Failed to initialize WhatsApp. Please try again.');
    } finally {
      setInitializing(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to disconnect your WhatsApp?')) return;

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/whatsapp/disconnect/${user.uid}`,
        { method: 'POST' },
        10000
      );

      const data = await response.json();
      
      if (data.success) {
        setWhatsappStatus({ ready: false, hasQR: false, info: null });
        setQrCode(null);
        setError(null);
      } else {
        throw new Error(data.error || 'Failed to disconnect');
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      setError('Failed to disconnect WhatsApp. Please try again.');
    }
  };

  // Manual retry with reset
  const handleRetry = () => {
    setError(null);
    setRetryCount(0);
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
            <h3 className="text-lg font-semibold text-orange-900 mb-2">
              You're Offline
            </h3>
            <p className="text-sm text-orange-700 mb-4">
              Please check your internet connection to use WhatsApp features.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 mb-6">
        <div className="flex items-start">
          <AlertCircle className="h-6 w-6 text-red-600 mr-3 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-900 mb-2">
              Connection Error
            </h3>
            <p className="text-sm text-red-700 mb-4">{error}</p>
            {retryCount > 0 && (
              <p className="text-xs text-red-600 mb-4">
                Retry attempt {retryCount} - Next retry in {Math.min(10 * Math.pow(1.5, retryCount), 60)} seconds
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className="h-4 w-4 inline mr-2" />
                Retry Now
              </button>
              <a
                href={API_URL + '/health'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Check Server Status
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-6">
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
                <button
                  onClick={disconnectWhatsApp}
                  className="p-1 hover:bg-red-50 rounded-full transition-colors"
                  title="Disconnect WhatsApp"
                >
                  <LogOut className="h-4 w-4 text-red-600" />
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
{`Train Set: KMRC-012
Depot: Muttom
Current Mileage: 288650 km
Fitness Status: Fit for Service
Branding: Election Awareness (Priority: High)
Cleaning Slot: 23:00–23:45
Reported By: Ground Staff A`}
                  </pre>
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
                Tap "Link a Device" and scan this QR code
              </p>
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
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline mr-2"></div>
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
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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