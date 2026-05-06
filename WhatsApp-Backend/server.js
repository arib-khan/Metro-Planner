// server.js - Multi-User WhatsApp Integration with Fixed CORS and Error Handling
require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Firebase Admin with better error handling
let firebaseInitialized = false;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        console.log('✅ Firebase initialized from environment variable');
    } else {
        console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT environment variable not found');
        const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            firebaseInitialized = true;
            console.log('✅ Firebase initialized from local file');
        } else {
            console.error('❌ Firebase service account not found - service will be limited');
        }
    }
} catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
}

const db = firebaseInitialized ? admin.firestore() : null;

// CORS configuration
const allowedOrigins = [
    'http://localhost:3000',
    'https://metro-planner.vercel.app',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS blocked origin: ${origin}`);
            callback(null, true); // Allow anyway but log it
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use((req, res, next) => {
    req.setTimeout(30000);
    res.setTimeout(30000);
    next();
});

// Store multiple WhatsApp clients (one per user)
const whatsappClients = new Map(); // userId -> { client, qrCode, ready, info }

// ─── HARDCODED PARSER ─────────────────────────────────────────────────────────

function parseTrainMessage(messageText) {
    try {
        const lines = messageText.split('\n').map(line => line.trim()).filter(line => line);
        const currentDate = new Date().toISOString().split('T')[0];

        const data = {
            train_id: '',
            depot: '',
            current_mileage: '',
            previous_mileage: '',
            fitness_status: 'Requires Check',
            branding_type: '',
            branding_priority: 'Medium',
            cleaning_slot: '',
            cleaning_type: 'Daily Clean',
            job_card_number: '',
            job_description: '',
            job_status: 'Pending',
            reported_by: 'Ground Staff',
            reported_time: currentDate,
            track_no: 1,
            berth: 'A1',
            orientation: 'UP'
        };

        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            const key = line.substring(0, colonIndex).trim().toLowerCase();
            const value = line.substring(colonIndex + 1).trim();

            if (key.includes('train') && (key.includes('set') || key.includes('id'))) {
                data.train_id = value;
            } else if (key.includes('depot')) {
                data.depot = value;
            } else if (key.includes('mileage')) {
                const mileageNum = value.replace(/[^\d]/g, '');
                data.current_mileage = mileageNum;
                data.previous_mileage = Math.max(0, parseInt(mileageNum) - 500).toString();
            } else if (key.includes('fitness')) {
                data.fitness_status = value;
            } else if (key.includes('job') && key.includes('card')) {
                const parts = value.split('–').map(s => s.trim());
                data.job_card_number = parts[0] || '';
                data.job_description = parts[1] || '';
                data.job_status = parts[2] || 'Pending';
            } else if (key.includes('branding')) {
                const priorityMatch = value.match(/\(Priority:\s*(\w+)\)/i);
                data.branding_type = value.replace(/\(Priority:.*?\)/i, '').trim();
                data.branding_priority = priorityMatch ? priorityMatch[1] : 'Medium';
            } else if (key.includes('cleaning')) {
                data.cleaning_slot = value;
            } else if (key.includes('reported') && key.includes('by')) {
                data.reported_by = value;
            } else if (key.includes('time')) {
                data.reported_time = value;
            } else if (key.includes('track')) {
                data.track_no = parseInt(value) || 1;
            } else if (key.includes('berth')) {
                data.berth = value;
            }
        }

        if (!data.train_id) {
            const trainMatch = messageText.match(/(?:train\s*(?:set|id)?[:\s]+)?(KMRL[-_]?\d+)/i);
            if (trainMatch) data.train_id = trainMatch[1];
        }

        return data;
    } catch (error) {
        console.error('❌ Error parsing message:', error);
        throw new Error('Failed to parse train message');
    }
}

function convertToFirestoreFormat(parsedData, senderInfo, userId) {
    const currentDate = new Date().toISOString().split('T')[0];

    let slotStart = `${currentDate}T23:00`;
    let slotEnd = `${currentDate}T23:45`;

    if (parsedData.cleaning_slot) {
        const timeMatch = parsedData.cleaning_slot.match(/(\d{2}:\d{2})[–-](\d{2}:\d{2})/);
        if (timeMatch) {
            slotStart = `${currentDate}T${timeMatch[1]}`;
            slotEnd = `${currentDate}T${timeMatch[2]}`;
        }
    }

    const priorityLevel = parsedData.branding_priority === 'High' ? 1
        : parsedData.branding_priority === 'Low' ? 3 : 2;

    const currentMileage = parseInt(parsedData.current_mileage) || 0;
    const previousMileage = parseInt(parsedData.previous_mileage) || 0;
    const delta = currentMileage - previousMileage;

    // BUG FIX: admin.firestore.FieldValue.serverTimestamp() throws when firebaseInitialized is false.
    // Use a plain ISO string as a safe fallback so this function works regardless.
    const serverTimestamp = firebaseInitialized
        ? admin.firestore.FieldValue.serverTimestamp()
        : new Date().toISOString();

    return {
        date: currentDate,

        branding_priorities: parsedData.branding_type ? [{
            train_id: parsedData.train_id,
            priority_level: priorityLevel,
            branding_type: parsedData.branding_type,
            valid_from: currentDate,
            valid_to: currentDate,
            approved_by: 'WhatsApp Submission',
            remarks: `Submitted via WhatsApp by ${senderInfo.name}`
        }] : [],

        cleaning_slots: parsedData.cleaning_slot ? [{
            train_id: parsedData.train_id,
            cleaning_type: parsedData.cleaning_type || 'Daily Clean',
            slot_start: slotStart,
            slot_end: slotEnd,
            assigned_team: parsedData.reported_by,
            status: 'Scheduled'
        }] : [],

        stabling_geometry: [{
            train_id: parsedData.train_id,
            yard: parsedData.depot ? `${parsedData.depot} Depot` : 'Muttom Depot',
            track_no: parsedData.track_no || 1,
            berth: parsedData.berth || 'A1',
            orientation: parsedData.orientation || 'UP',
            distance_from_buffer_m: 4.5,
            remarks: 'Submitted via WhatsApp'
        }],

        fitness_certificates: [{
            train_id: parsedData.train_id,
            rolling_stock_validity: '',
            signalling_validity: '',
            telecom_validity: '',
            status: parsedData.fitness_status
        }],

        job_card_status: parsedData.job_card_number ? [{
            train_id: parsedData.train_id,
            job_id: parsedData.job_card_number,
            task: parsedData.job_description,
            status: parsedData.job_status,
            assigned_team: parsedData.reported_by,
            due_date: currentDate,
            priority: parsedData.branding_priority
        }] : [],

        mileage: currentMileage > 0 ? [{
            train_id: parsedData.train_id,
            previous_mileage_km: previousMileage,
            current_mileage_km: currentMileage,
            delta_km: delta,
            remarks: `Reported via WhatsApp at ${parsedData.reported_time}`
        }] : [],

        userId: userId,
        userName: senderInfo.userName,
        userEmail: senderInfo.userEmail,
        timestamp: serverTimestamp,
        status: 'submitted',
        syncStatus: 'synced',
        source: 'whatsapp',
        whatsappInfo: {
            from: senderInfo.number,
            name: senderInfo.name,
            isGroup: senderInfo.isGroup,
            originalMessage: senderInfo.originalMessage
        },
        parsedData: parsedData
    };
}

// ─── WHATSAPP CLIENT INIT ──────────────────────────────────────────────────────

// BUG FIX: mutex map so concurrent /initialize calls for the same userId don't
// race past the whatsappClients.has() check before .set() completes
const initializingUsers = new Set();

// Detect OS so we can apply the right Puppeteer flags
const isWindows = process.platform === 'win32';

// Build platform-appropriate Puppeteer args
// BUG FIX: --no-zygote and --disable-gpu are Linux-specific and cause silent
// hangs / crashes on Windows after authentication succeeds
function getPuppeteerArgs() {
    const common = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
    ];
    if (!isWindows) {
        // These flags are safe on Linux/Mac but break Chrome on Windows
        common.push('--no-zygote', '--disable-gpu');
    }
    return common;
}

async function initializeUserWhatsApp(userId, userEmail, userName) {
    try {
        if (whatsappClients.has(userId)) {
            console.log(`📱 WhatsApp client already exists for user ${userEmail}`);
            return whatsappClients.get(userId);
        }

        // BUG FIX: prevent duplicate init calls racing past the has() check above
        if (initializingUsers.has(userId)) {
            console.log(`📱 Already initializing for ${userEmail}, waiting...`);
            // Wait up to 60s for the other init to finish
            await new Promise((resolve, reject) => {
                const start = Date.now();
                const poll = setInterval(() => {
                    if (whatsappClients.has(userId)) {
                        clearInterval(poll);
                        resolve();
                    } else if (!initializingUsers.has(userId)) {
                        clearInterval(poll);
                        reject(new Error('Concurrent initialization failed'));
                    } else if (Date.now() - start > 60000) {
                        clearInterval(poll);
                        reject(new Error('Initialization timeout waiting for concurrent init'));
                    }
                }, 500);
            });
            return whatsappClients.get(userId);
        }

        initializingUsers.add(userId);
        console.log(`📱 Initializing new WhatsApp client for user ${userEmail}...`);
        console.log(`🖥️  Platform: ${process.platform} — using ${isWindows ? 'Windows' : 'Linux/Mac'} Puppeteer flags`);

        const clientData = {
            client: null,
            qrCode: null,
            ready: false,
            info: null,
            userEmail: userEmail,
            userName: userName,
            lastActivity: Date.now()
        };

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: userId,
                dataPath: path.join(__dirname, '.wwebjs_auth')
            }),
            puppeteer: {
                // 'new' headless mode required for Chrome 112+ (Puppeteer 19+)
                headless: 'new',
                args: getPuppeteerArgs()
            }
        });

        client.on('qr', async (qr) => {
            console.log(`📱 QR Code generated for ${userEmail}`);
            try {
                clientData.qrCode = await qrcode.toDataURL(qr);
                clientData.lastActivity = Date.now();
            } catch (err) {
                console.error('❌ Error generating QR code:', err);
            }
        });

        client.on('ready', async () => {
            console.log(`✅ WhatsApp ready for ${userEmail}`);
            initializingUsers.delete(userId); // BUG FIX: release mutex on success
            clientData.ready = true;
            clientData.qrCode = null;
            clientData.lastActivity = Date.now();

            const info = client.info;
            clientData.info = {
                pushname: info.pushname,
                platform: info.platform,
                phone: info.wid.user
            };

            if (db) {
                try {
                    await db.collection('whatsappConnections').doc(userId).set({
                        userId: userId,
                        userEmail: userEmail,
                        userName: userName,
                        connected: true,
                        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
                        whatsappInfo: clientData.info
                    });
                } catch (error) {
                    console.error('❌ Error updating Firestore on ready:', error);
                }
            }
        });

        // Helper: wipe the LocalAuth session folder for this user so the next
        // initialize() starts fresh and generates a new QR instead of silently hanging
        function wipeAuthCache() {
            const authPath = path.join(__dirname, '.wwebjs_auth', `session-${userId}`);
            if (fs.existsSync(authPath)) {
                try {
                    fs.rmSync(authPath, { recursive: true, force: true });
                    console.log(`🗑️  Wiped stale auth cache for ${userEmail} (${authPath})`);
                } catch (e) {
                    console.error(`⚠️  Could not wipe auth cache for ${userEmail}:`, e.message);
                }
            }
        }

        client.on('authenticated', () => {
            console.log(`🔐 Authentication successful for ${userEmail}`);
        });

        // Fires when the saved session is rejected by WhatsApp (e.g. user logged out
        // from their phone, or session expired). We MUST delete the cached session here —
        // otherwise every future initialize() will re-use the dead session, skip QR
        // generation, authenticate successfully, then hang forever waiting for 'ready'.
        client.on('auth_failure', async (msg) => {
            console.error(`❌ Auth failure for ${userEmail} — session likely logged out from phone:`, msg);
            clientData.ready = false;

            // Tear down the broken client
            try { await client.destroy(); } catch (_) { }

            // Remove stale Map entries and mutex
            whatsappClients.delete(userId);
            initializingUsers.delete(userId);

            // Wipe the cached session so next init shows QR immediately
            wipeAuthCache();

            // Update Firestore so the frontend shows "Not Connected"
            if (db) {
                try {
                    await db.collection('whatsappConnections').doc(userId).update({
                        connected: false,
                        disconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
                        disconnectReason: 'auth_failure'
                    });
                } catch (_) { }
            }

            console.log(`💡 ${userEmail}: Auth cache cleared — next login will show a fresh QR code`);
        });

        client.on('disconnected', async (reason) => {
            console.log(`🔴 Client disconnected for ${userEmail}: ${reason}`);
            clientData.ready = false;
            clientData.info = null;

            // LOGOUT means the user removed this linked device from their phone.
            // Same as auth_failure — wipe cache so next init generates a new QR.
            const isLogout = reason === 'LOGOUT' || reason === 'NAVIGATION';
            if (isLogout) {
                console.log(`📵 ${userEmail} logged out from phone — clearing session cache`);
                try { await client.destroy(); } catch (_) { }
                whatsappClients.delete(userId);
                wipeAuthCache();
            }

            if (db) {
                try {
                    await db.collection('whatsappConnections').doc(userId).update({
                        connected: false,
                        disconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
                        disconnectReason: reason
                    });
                } catch (error) {
                    console.error('❌ Error updating Firestore on disconnect:', error);
                }
            }
        });

        client.on('message', async (message) => {
            try {
                if (!firebaseInitialized || !db) {
                    console.error('❌ Firebase not initialized');
                    await message.reply('❌ System error: Database not available');
                    return;
                }

                clientData.lastActivity = Date.now();

                let contactName = 'Unknown';
                let contactNumber = 'unknown';
                let isGroup = false;

                try {
                    const contact = await message.getContact();
                    contactName = contact.pushname || contact.name || contact.number || 'Unknown';
                    contactNumber = contact.number || contact.id?.user || 'unknown';
                } catch (contactError) {
                    contactNumber = message.from || 'unknown';
                    contactName = message._data?.notifyName || 'Unknown';
                }

                try {
                    const chat = await message.getChat();
                    isGroup = chat.isGroup || false;
                } catch (chatError) {
                    isGroup = message.from?.includes('@g.us') || false;
                }

                console.log(`📨 Message from ${contactName} (User: ${userEmail}): ${message.body}`);

                const messageText = message.body.toLowerCase();
                if (
                    messageText.includes('train') ||
                    messageText.includes('depot') ||
                    messageText.includes('mileage') ||
                    messageText.includes('kmrc') ||
                    // BUG FIX 3a: 'kmrl' was missing from the keyword filter — the reply
                    // message told users to send "KMRL-12" but that keyword was never matched,
                    // so those messages were silently ignored and never saved to Firestore.
                    messageText.includes('kmrl')
                ) {
                    const parsedData = parseTrainMessage(message.body);

                    if (parsedData.train_id) {
                        const firestoreData = convertToFirestoreFormat(parsedData, {
                            name: contactName,
                            number: contactNumber,
                            isGroup: isGroup,
                            originalMessage: message.body,
                            userName: userName,
                            userEmail: userEmail
                        }, userId);

                        // BUG FIX 3b: Explicitly enforce the fields the dashboard query depends on.
                        // If convertToFirestoreFormat ever fails to set these, the document would
                        // be saved but never appear on the dashboard (wrong status) or show the
                        // wrong badge (wrong source).
                        firestoreData.status = 'submitted';
                        firestoreData.source = 'whatsapp';

                        const docRef = await db.collection('trainInduction').add(firestoreData);
                        console.log(`✅ Data saved by ${userEmail}:`, docRef.id);

                        await message.reply(
                            `✅ *Train Induction Received*\n\n` +
                            `Train ID: ${parsedData.train_id}\n` +
                            `Document ID: ${docRef.id}\n` +
                            `Submitted by: ${userName}\n` +
                            `Status: Pending Approval\n\n` +
                            `Your submission will be visible to all users once approved.`
                        );
                    } else {
                        await message.reply(
                            `⚠️ *Could not process your message*\n\n` +
                            `Please include Train Set ID (e.g., KMRL-12)`
                        );
                    }
                }
            } catch (error) {
                console.error('❌ Error processing message:', error);
                try {
                    await message.reply('❌ Error processing your message. Please try again.');
                } catch (replyError) {
                    console.error('❌ Could not send error reply:', replyError);
                }
            }
        });

        clientData.client = client;

        // BUG FIX: only add to the Map AFTER initialize() succeeds.
        // Previously the entry was stored before initialize() so a failed init left a
        // zombie record that permanently blocked re-initialization for that userId.
        // 
        // BUG FIX: wrap initialize() with a 3-minute timeout so a hung Puppeteer/Chrome
        // session doesn't block the server forever with no feedback.
        await Promise.race([
            client.initialize(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(
                    'WhatsApp initialization timed out after 3 minutes. ' +
                    'This usually means Chrome/Puppeteer is hung. ' +
                    'Delete the .wwebjs_auth folder and try again.'
                )), 180000)
            )
        ]);

        whatsappClients.set(userId, clientData);
        initializingUsers.delete(userId);

        return clientData;
    } catch (error) {
        // Clean up any partial state if init fails
        whatsappClients.delete(userId);
        initializingUsers.delete(userId);
        console.error(`❌ Failed to initialize WhatsApp for ${userEmail}:`, error);
        throw error;
    }
}

// ─── STARTUP: DETECT STALE SESSIONS ───────────────────────────────────────────
// If the server was previously shut down while a session was mid-authentication
// (authenticated but not ready), the .wwebjs_auth folder will contain a session
// that WhatsApp has since invalidated. Detect this by checking Firestore for
// users whose last known state was "connected: false" but still have a local
// session folder — and wipe those folders proactively.
async function cleanStaleAuthFolders() {
    const authRoot = path.join(__dirname, '.wwebjs_auth');
    if (!fs.existsSync(authRoot)) return;

    const folders = fs.readdirSync(authRoot).filter(f => f.startsWith('session-'));
    if (folders.length === 0) return;

    console.log(`🔍 Found ${folders.length} cached session(s) — checking validity...`);

    for (const folder of folders) {
        const userId = folder.replace('session-', '');
        let shouldWipe = false;

        if (db) {
            try {
                const doc = await db.collection('whatsappConnections').doc(userId).get();
                if (doc.exists && doc.data().connected === false) {
                    console.log(`⚠️  Session folder "${folder}" belongs to a disconnected user — wiping`);
                    shouldWipe = true;
                }
            } catch (_) {
                // If we can't check, leave the folder alone
            }
        }

        if (shouldWipe) {
            const fullPath = path.join(authRoot, folder);
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
                console.log(`🗑️  Wiped stale session: ${fullPath}`);
            } catch (e) {
                console.error(`⚠️  Could not wipe ${fullPath}:`, e.message);
            }
        }
    }
}

// Run stale session cleanup before starting the HTTP server
cleanStaleAuthFolders().catch(e => console.error('⚠️  Stale session cleanup error:', e.message));



app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        activeConnections: whatsappClients.size,
        initializing: [...initializingUsers],
        firebase: firebaseInitialized ? 'connected' : 'disconnected',
        platform: process.platform,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Diagnostic endpoint — shows raw client state for debugging
app.get('/debug/status', (req, res) => {
    const clients = [];
    for (const [uid, cd] of whatsappClients) {
        clients.push({
            userId: uid,
            userEmail: cd.userEmail,
            ready: cd.ready,
            hasQR: !!cd.qrCode,
            hasInfo: !!cd.info,
            lastActivity: new Date(cd.lastActivity).toISOString(),
            clientAlive: !!cd.client
        });
    }
    res.json({
        platform: process.platform,
        isWindows: isWindows,
        puppeteerArgs: getPuppeteerArgs(),
        firebaseReady: firebaseInitialized,
        clients,
        initializing: [...initializingUsers],
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    });
});

// Get user's WhatsApp status
app.get('/api/whatsapp/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId parameter', ready: false, hasQR: false });
        }

        const clientData = whatsappClients.get(userId);

        if (!clientData) {
            return res.json({
                ready: false,
                hasQR: false,
                info: null,
                firebaseConnected: firebaseInitialized
            });
        }

        res.json({
            ready: clientData.ready,
            hasQR: clientData.qrCode !== null,
            info: clientData.info,
            firebaseConnected: firebaseInitialized,
            lastActivity: clientData.lastActivity
        });
    } catch (error) {
        console.error('❌ Error in status endpoint:', error);
        res.status(500).json({ error: 'Internal server error', ready: false, hasQR: false });
    }
});

// Get user's QR code
app.get('/api/whatsapp/qr/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const clientData = whatsappClients.get(userId);

        if (!clientData) return res.json({ qr: null, ready: false });

        if (clientData.qrCode) {
            res.json({ qr: clientData.qrCode, ready: false });
        } else if (clientData.ready) {
            res.json({ qr: null, ready: true, info: clientData.info });
        } else {
            res.json({ qr: null, ready: false });
        }
    } catch (error) {
        console.error('❌ Error in QR endpoint:', error);
        res.status(500).json({ error: 'Failed to get QR code', qr: null, ready: false });
    }
});

// Initialize WhatsApp for user
app.post('/api/whatsapp/initialize', async (req, res) => {
    try {
        const { userId, userEmail, userName } = req.body;

        if (!userId || !userEmail || !userName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, userEmail, userName'
            });
        }

        const clientData = await initializeUserWhatsApp(userId, userEmail, userName);

        res.json({
            success: true,
            message: 'WhatsApp client initialized',
            ready: clientData.ready,
            hasQR: clientData.qrCode !== null
        });
    } catch (error) {
        console.error('❌ Error initializing WhatsApp:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to initialize WhatsApp' });
    }
});

// Disconnect user's WhatsApp
app.post('/api/whatsapp/disconnect/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const clientData = whatsappClients.get(userId);

        // BUG FIX: was returning success:false when no client found.
        // Disconnect should be idempotent — if there's nothing to disconnect, that's still success.
        if (!clientData) {
            return res.json({ success: true, message: 'No active session to disconnect' });
        }

        // BUG FIX: destroy() is now wrapped in its own try/catch so a Puppeteer crash
        // doesn't prevent the Map entry from being cleaned up or the response from being sent.
        if (clientData.client) {
            try {
                await clientData.client.destroy();
            } catch (destroyError) {
                console.error('❌ Error during client.destroy():', destroyError);
                // Continue with cleanup even if destroy() throws
            }
        }

        whatsappClients.delete(userId);

        if (db) {
            try {
                await db.collection('whatsappConnections').doc(userId).update({
                    connected: false,
                    disconnectedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (dbError) {
                console.error('❌ Error updating Firestore on disconnect:', dbError);
                // Don't fail the request because of a Firestore error
            }
        }

        res.json({ success: true, message: 'WhatsApp disconnected successfully' });
    } catch (error) {
        console.error('❌ Error disconnecting WhatsApp:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to disconnect WhatsApp' });
    }
});

// Get all connected users
app.get('/api/whatsapp/connections', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ success: false, error: 'Database not available', connections: [] });
        }

        const snapshot = await db.collection('whatsappConnections').get();
        const connections = [];

        snapshot.forEach(doc => {
            connections.push({ id: doc.id, ...doc.data() });
        });

        res.json({ success: true, connections });
    } catch (error) {
        console.error('❌ Error fetching connections:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch connections', connections: [] });
    }
});

// Force-reset a user's session — clears auth cache and Map entry so next
// /initialize call will show a fresh QR code. Use this when stuck in auth loop.
app.post('/api/whatsapp/reset/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const clientData = whatsappClients.get(userId);

        // Destroy live client if present
        if (clientData?.client) {
            try { await clientData.client.destroy(); } catch (_) { }
        }
        whatsappClients.delete(userId);
        initializingUsers.delete(userId);

        // Wipe the session folder
        const authPath = path.join(__dirname, '.wwebjs_auth', `session-${userId}`);
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`🗑️  Force-reset auth cache for ${userId}`);
        }

        if (db) {
            try {
                await db.collection('whatsappConnections').doc(userId).update({
                    connected: false,
                    disconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
                    disconnectReason: 'manual_reset'
                });
            } catch (_) { }
        }

        res.json({ success: true, message: 'Session reset — initialize again to get a fresh QR code' });
    } catch (error) {
        console.error('❌ Error resetting session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── SEND WHATSAPP MESSAGE ────────────────────────────────────────────────────
// Used by the Job Cards page to notify staff about assigned job cards.
// Body: { userId, phone, message }
// userId: the logged-in web admin's uid (used to find their connected WhatsApp client)
// phone:  recipient phone number — digits only, e.g. "919876543201"
// message: text to send
app.post('/api/whatsapp/send', async (req, res) => {
    try {
        const { userId, phone, message } = req.body;

        if (!userId || !phone || !message) {
            return res.status(400).json({ success: false, error: 'userId, phone and message are required' });
        }

        // Find the sender's connected WhatsApp client
        const clientData = whatsappClients.get(userId);

        if (!clientData) {
            return res.status(404).json({ success: false, error: 'No WhatsApp client found for this user. Please connect WhatsApp first.' });
        }

        if (!clientData.ready) {
            return res.status(400).json({ success: false, error: 'WhatsApp is not ready. Please scan the QR code first.' });
        }

        // Format phone number — WhatsApp expects digits + @c.us
        const cleanPhone = phone.toString().replace(/\D/g, '');
        const chatId = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

        // Check if number exists on WhatsApp before sending
        // This resolves the "No LID for user" error for unsaved contacts
        const isRegistered = await clientData.client.isRegisteredUser(chatId);

        if (!isRegistered) {
            return res.status(400).json({
                success: false,
                error: `Phone number ${cleanPhone} is not registered on WhatsApp`
            });
        }

        // Get the number ID properly — avoids "No LID" error
        const numberId = await clientData.client.getNumberId(cleanPhone);

        if (!numberId) {
            return res.status(400).json({
                success: false,
                error: `Could not resolve WhatsApp ID for ${cleanPhone}`
            });
        }

        await clientData.client.sendMessage(numberId._serialized, message);

        console.log(`✅ Sent WhatsApp message to ${cleanPhone} via user ${userId}`);
        res.json({ success: true, message: 'Message sent successfully' });

    } catch (error) {
        console.error('❌ Error sending WhatsApp message:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to send message' });
    }
});


app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ─── START SERVER ──────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
    console.log(`\n=================================`);
    console.log(`🚀 Multi-User WhatsApp Server`);
    console.log(`📡 Running on port ${PORT}`);
    console.log(`👥 Supports multiple user connections`);
    console.log(`🔥 Firebase: ${firebaseInitialized ? 'Connected' : 'Disconnected'}`);
    console.log(`🌐 CORS enabled for: ${allowedOrigins.join(', ')}`);
    console.log(`=================================\n`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

    server.close(() => {
        console.log('📡 HTTP server closed');
    });

    for (const [userId, clientData] of whatsappClients) {
        if (clientData.client) {
            try {
                await clientData.client.destroy();
                console.log(`📱 Disconnected WhatsApp for ${clientData.userEmail}`);
            } catch (error) {
                console.error(`❌ Error disconnecting ${clientData.userEmail}:`, error);
            }
        }
    }

    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});