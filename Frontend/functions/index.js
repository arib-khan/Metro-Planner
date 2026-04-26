// functions/index.js
// Firebase Cloud Functions — Deploy with: firebase deploy --only functions
//
// This function watches the `notifications` collection.
// When a new doc is created with a `toUserId`, it fetches that user's FCM token
// from their `users` doc and sends a push notification.
//
// Setup:
//   npm install -g firebase-tools
//   firebase init functions  (choose JavaScript, install dependencies)
//   Replace this file content, then: firebase deploy --only functions

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Triggered when a new document is added to the `notifications` collection.
 * Sends a Firebase Cloud Messaging push to the assigned mobile user.
 */
exports.sendTrainNotification = functions.firestore
    .document('notifications/{notifId}')
    .onCreate(async (snap, context) => {
        const notif = snap.data();

        if (!notif.toUserId) {
            console.log('No toUserId on notification, skipping FCM send.');
            return null;
        }

        try {
            // Fetch the target user's FCM token
            const userDoc = await db.collection('users').doc(notif.toUserId).get();
            if (!userDoc.exists) {
                console.log(`User ${notif.toUserId} not found`);
                return null;
            }

            const userData = userDoc.data();
            const fcmToken = userData.fcmToken;

            if (!fcmToken) {
                console.log(`No FCM token for user ${notif.toUserId}. They may not have opened the app yet.`);
                // Update notification to indicate delivery failure
                await snap.ref.update({ deliveryStatus: 'no_token', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                return null;
            }

            // Build the notification payload
            const notifPayload = buildNotificationPayload(notif, fcmToken);

            // Send via FCM
            const response = await admin.messaging().send(notifPayload);
            console.log(`FCM sent successfully. Message ID: ${response}`);

            // Mark as delivered
            await snap.ref.update({
                deliveryStatus: 'sent',
                fcmMessageId: response,
                deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return { success: true };
        } catch (error) {
            console.error('Error sending FCM notification:', error);
            await snap.ref.update({
                deliveryStatus: 'failed',
                deliveryError: error.message,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }
    });

function buildNotificationPayload(notif, fcmToken) {
    const typeConfig = {
        train_conflict: {
            title: `⚠️ Conflict: ${notif.trainId}`,
            body: notif.message || `A conflict has been reported on ${notif.trainId}`,
            color: '#FF4444',
            sound: 'conflict_alert',
        },
        train_assigned: {
            title: `🚆 Train Assigned: ${notif.trainId}`,
            body: notif.message || `You have been assigned ${notif.trainId}`,
            color: '#2196F3',
            sound: 'default',
        },
        train_reassigned: {
            title: `🔄 Train Reassigned: ${notif.trainId}`,
            body: notif.message || `${notif.trainId} has been reassigned`,
            color: '#FF9800',
            sound: 'default',
        },
    };

    const config = typeConfig[notif.type] || {
        title: 'Railway System Alert',
        body: notif.message || 'You have a new notification',
        color: '#607D8B',
        sound: 'default',
    };

    return {
        token: fcmToken,
        notification: {
            title: config.title,
            body: config.body,
        },
        data: {
            type: notif.type || 'general',
            trainId: notif.trainId || '',
            conflictId: notif.conflictId || '',
            notifId: notif.notifId || '',
            priority: notif.priority || 'normal',
            // All data values must be strings for FCM
        },
        android: {
            priority: notif.priority === 'high' ? 'high' : 'normal',
            notification: {
                color: config.color,
                sound: config.sound,
                channelId: notif.type === 'train_conflict' ? 'conflicts' : 'general',
                priority: notif.priority === 'high' ? 'PRIORITY_HIGH' : 'PRIORITY_DEFAULT',
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: config.sound === 'conflict_alert' ? 'conflict_alert.caf' : 'default',
                    badge: 1,
                    'content-available': 1,
                    'mutable-content': 1,
                },
            },
        },
    };
}

/**
 * Callable function to allow admins to send manual notifications.
 * Call from web: functions.httpsCallable('sendManualNotification')({...})
 */
exports.sendManualNotification = functions.https.onCall(async (data, context) => {
    // Verify caller is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    // Verify caller is admin
    const callerDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
    }

    const { toUserId, type, trainId, message } = data;

    await db.collection('notifications').add({
        type: type || 'general',
        trainId: trainId || '',
        toUserId,
        fromUserId: context.auth.uid,
        message,
        read: false,
        priority: type === 'train_conflict' ? 'high' : 'normal',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});