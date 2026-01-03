// server.js - Multi-User WhatsApp Integration
require('dotenv').config(); // ADD THIS LINE AT THE TOP
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Firebase Admin
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
      console.warn('⚠️ Firebase service account not found.');
    }
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
}

const db = firebaseInitialized ? admin.firestore() : null;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-frontend-url.vercel.app'],
  credentials: true
}));
app.use(express.json());

// Store multiple WhatsApp clients (one per user)
const whatsappClients = new Map(); // userId -> { client, qrCode, ready, info }

// HARDCODED PARSER
function parseTrainMessage(messageText) {
    console.log('🔍 Parsing message with hardcoded parser...');
    
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
        const trainMatch = messageText.match(/(?:train\s*(?:set|id)?[:\s]+)?(KMRC[-_]?\d+)/i);
        if (trainMatch) {
            data.train_id = trainMatch[1];
        }
    }
    
    return data;
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
    
    const priorityLevel = parsedData.branding_priority === 'High' ? 1 : 
                         parsedData.branding_priority === 'Low' ? 3 : 2;
    
    const currentMileage = parseInt(parsedData.current_mileage) || 0;
    const previousMileage = parseInt(parsedData.previous_mileage) || 0;
    const delta = currentMileage - previousMileage;
    
    return {
        date: currentDate,
        
        branding_priorities: parsedData.branding_type ? [{
            train_id: parsedData.train_id,
            priority_level: priorityLevel,
            branding_type: parsedData.branding_type,
            valid_from: currentDate,
            valid_to: currentDate,
            approved_by: "WhatsApp Submission",
            remarks: `Submitted via WhatsApp by ${senderInfo.name}`
        }] : [],
        
        cleaning_slots: parsedData.cleaning_slot ? [{
            train_id: parsedData.train_id,
            cleaning_type: parsedData.cleaning_type || 'Daily Clean',
            slot_start: slotStart,
            slot_end: slotEnd,
            assigned_team: parsedData.reported_by,
            status: "Scheduled"
        }] : [],
        
        stabling_geometry: [{
            train_id: parsedData.train_id,
            yard: parsedData.depot ? `${parsedData.depot} Depot` : 'Muttom Depot',
            track_no: parsedData.track_no || 1,
            berth: parsedData.berth || 'A1',
            orientation: parsedData.orientation || "UP",
            distance_from_buffer_m: 4.5,
            remarks: "Submitted via WhatsApp"
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
        
        // Metadata - includes user who submitted
        userId: userId,
        userName: senderInfo.userName,
        userEmail: senderInfo.userEmail,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
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

// Initialize WhatsApp client for a specific user
async function initializeUserWhatsApp(userId, userEmail, userName) {
    if (whatsappClients.has(userId)) {
        console.log(`📱 WhatsApp client already exists for user ${userEmail}`);
        return whatsappClients.get(userId);
    }

    console.log(`📱 Initializing new WhatsApp client for user ${userEmail}...`);

    const clientData = {
        client: null,
        qrCode: null,
        ready: false,
        info: null,
        userEmail: userEmail,
        userName: userName
    };

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: userId,
            dataPath: path.join(__dirname, '.wwebjs_auth')
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log(`📱 QR Code generated for ${userEmail}`);
        try {
            clientData.qrCode = await qrcode.toDataURL(qr);
        } catch (err) {
            console.error('❌ Error generating QR code:', err);
        }
    });

    client.on('ready', async () => {
        console.log(`✅ WhatsApp ready for ${userEmail}`);
        clientData.ready = true;
        clientData.qrCode = null;
        
        const info = client.info;
        clientData.info = {
            pushname: info.pushname,
            platform: info.platform,
            phone: info.wid.user
        };

        // Update user's WhatsApp connection status in Firestore
        if (db) {
            await db.collection('whatsappConnections').doc(userId).set({
                userId: userId,
                userEmail: userEmail,
                userName: userName,
                connected: true,
                connectedAt: admin.firestore.FieldValue.serverTimestamp(),
                whatsappInfo: clientData.info
            });
        }
    });

    client.on('authenticated', () => {
        console.log(`🔐 Authentication successful for ${userEmail}`);
    });

    client.on('auth_failure', (msg) => {
        console.error(`❌ Authentication failed for ${userEmail}:`, msg);
        clientData.ready = false;
    });

    client.on('disconnected', async (reason) => {
        console.log(`📴 Client disconnected for ${userEmail}:`, reason);
        clientData.ready = false;
        clientData.info = null;

        // Update connection status in Firestore
        if (db) {
            await db.collection('whatsappConnections').doc(userId).update({
                connected: false,
                disconnectedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });

    client.on('message', async (message) => {
        try {
            if (!firebaseInitialized || !db) {
                console.error('❌ Firebase not initialized');
                return;
            }

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
            if (messageText.includes('train') || messageText.includes('depot') || 
                messageText.includes('mileage') || messageText.includes('kmrc')) {
                
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
                        `Please include Train Set ID (e.g., KMRC-012)`
                    );
                }
            }
        } catch (error) {
            console.error('❌ Error processing message:', error);
        }
    });

    clientData.client = client;
    whatsappClients.set(userId, clientData);

    // Initialize the client
    await client.initialize().catch(err => {
        console.error(`❌ Failed to initialize WhatsApp for ${userEmail}:`, err);
    });

    return clientData;
}

// API Routes

// Get user's WhatsApp status
app.get('/api/whatsapp/status/:userId', (req, res) => {
    const { userId } = req.params;
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
        firebaseConnected: firebaseInitialized
    });
});

// Get user's QR code
app.get('/api/whatsapp/qr/:userId', (req, res) => {
    const { userId } = req.params;
    const clientData = whatsappClients.get(userId);

    if (!clientData) {
        return res.json({ qr: null, ready: false });
    }

    if (clientData.qrCode) {
        res.json({ qr: clientData.qrCode, ready: false });
    } else if (clientData.ready) {
        res.json({ qr: null, ready: true, info: clientData.info });
    } else {
        res.json({ qr: null, ready: false });
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
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Disconnect user's WhatsApp
app.post('/api/whatsapp/disconnect/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const clientData = whatsappClients.get(userId);

        if (!clientData) {
            return res.json({ success: false, error: 'No client found' });
        }

        if (clientData.client) {
            await clientData.client.destroy();
        }

        whatsappClients.delete(userId);

        // Update Firestore
        if (db) {
            await db.collection('whatsappConnections').doc(userId).update({
                connected: false,
                disconnectedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        res.json({ success: true, message: 'WhatsApp disconnected' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all connected users (admin only)
app.get('/api/whatsapp/connections', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Firebase not initialized' });
        }

        const snapshot = await db.collection('whatsappConnections').get();
        const connections = [];
        
        snapshot.forEach(doc => {
            connections.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({ success: true, connections });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        activeConnections: whatsappClients.size,
        firebase: firebaseInitialized ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n=================================`);
    console.log(`🚀 Multi-User WhatsApp Server`);
    console.log(`📡 Running on port ${PORT}`);
    console.log(`👥 Supports multiple user connections`);
    console.log(`=================================\n`);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    for (const [userId, clientData] of whatsappClients) {
        if (clientData.client) {
            await clientData.client.destroy();
        }
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down...');
    for (const [userId, clientData] of whatsappClients) {
        if (clientData.client) {
            await clientData.client.destroy();
        }
    }
    process.exit(0);
});