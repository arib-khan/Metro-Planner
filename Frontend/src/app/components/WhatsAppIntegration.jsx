import { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, XCircle, QrCode, Smartphone, RefreshCw, AlertCircle, Wifi, WifiOff, Users, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const WhatsAppIntegration = () => {
  const { user } = useAuth(); // Get current logged-in user
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

  const API_URL = process.env.NEXT_PUBLIC_WHATSAPP_API || 'http://localhost:5000';

  useEffect(() => {
    if (user) {
      checkWhatsAppStatus();
      loadAllConnections();
      const interval = setInterval(() => {
        checkWhatsAppStatus();
        loadAllConnections();
      }, 5000);

      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        clearInterval(interval);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, [user]);

  const checkWhatsAppStatus = async () => {
    if (!user || !isOnline) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/whatsapp/status/${user.uid}`, {
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      setWhatsappStatus(data);
      setError(null);
      
      if (data.hasQR && !data.ready) {
        fetchQRCode();
      } else {
        setQrCode(null);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const fetchQRCode = async () => {
    if (!user) return;

    try {
      const response = await fetch(`${API_URL}/api/whatsapp/qr/${user.uid}`);
      
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
  };

  const loadAllConnections = async () => {
    try {
      const response = await fetch(`${API_URL}/api/whatsapp/connections`);
      if (response.ok) {
        const data = await response.json();
        setAllConnections(data.connections || []);
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  const initializeWhatsApp = async () => {
    if (!user) return;

    setInitializing(true);
    try {
      const response = await fetch(`${API_URL}/api/whatsapp/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email,
          userName: user.displayName || user.email.split('@')[0]
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setTimeout(checkWhatsAppStatus, 2000);
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setInitializing(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to disconnect your WhatsApp?')) return;

    try {
      const response = await fetch(`${API_URL}/api/whatsapp/disconnect/${user.uid}`, {
        method: 'POST'
      });

      const data = await response.json();
      
      if (data.success) {
        setWhatsappStatus({ ready: false, hasQR: false, info: null });
        setQrCode(null);
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
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
            <button
              onClick={checkWhatsAppStatus}
              className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className="h-4 w-4 inline mr-2" />
              Retry
            </button>
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
              onClick={checkWhatsAppStatus}
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