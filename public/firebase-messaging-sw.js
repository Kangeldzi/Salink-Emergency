// ================================================================
// firebase-messaging-sw.js v3.0
// Service Worker KHUSUS FCM — Multi-Jenis Notification
// ================================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD1Z4LTTsLaeKWx-RF2wbZR7GXjqiAP3tE",
  authDomain: "salink-app.firebaseapp.com",
  projectId: "salink-app",
  storageBucket: "salink-app.firebasestorage.app",
  messagingSenderId: "619188691915",
  appId: "1:619188691915:web:291c1cc49f8a30ff090c4e"
});

const messaging = firebase.messaging();

const VIBRATE_PATTERNS = {
  'emergency_fire':     [500, 100, 500, 100, 500, 100, 1000],
  'emergency_medical':  [300, 200, 300, 200, 300, 200, 800],
  'emergency_crime':    [200, 100, 200, 100, 200, 100, 600],
  'emergency_disaster': [800, 300, 800, 300, 800, 300, 1500],
  'social_comment':     [200, 100, 200],
  'social_like':        [100, 50, 100],
  'social_post':        [200, 100, 200],
  'social_invite':      [300, 150, 300, 150, 300],
  'social_invite_accepted': [300, 150, 300, 150, 300],
  'social_message':     [300, 150, 300],
  'ecom_order_new':     [400, 200, 400, 200, 400],
  'ecom_payment_success': [300, 150, 300, 150, 300],
  'ecom_payment_confirmed': [300, 150, 300, 150, 300],
  'ecom_shipping':      [200, 100, 200],
  'ecom_received':      [200, 100, 200],
  'ecom_rating':        [200, 100, 200],
  'ecom_stock_out':     [400, 200, 400, 200, 400],
  'ecom_order_cancelled': [400, 200, 400, 200, 400]
};

messaging.onBackgroundMessage((payload) => {
  console.log('🔔 [firebase-messaging-sw v3.0] Background:', payload);

  const notification = payload.notification || {};
  const data = payload.data || {};

  const notifType = String(data.notifType || data.type || 'social_post').toLowerCase();
  const title = notification.title || '🔔 SALINK';
  const body = notification.body || 'Ada notifikasi baru';

  let vibratePattern = VIBRATE_PATTERNS[notifType] || [200, 100, 200];
  if (data.vibratePattern) {
    try {
      const parsed = JSON.parse(data.vibratePattern);
      if (Array.isArray(parsed) && parsed.length > 0) vibratePattern = parsed;
    } catch(e) {}
  }

  const notifTag = String(data.tag || 'salink-notif') + '-' + (data.emergencyId || data.postId || data.transactionId || Date.now());

  let targetUrl = '/dashboard.html';
  if (data.mapsURL) targetUrl = data.mapsURL;
  else if (data.emergencyId) targetUrl = '/detail-emergency.html?id=' + encodeURIComponent(data.emergencyId);
  else if (data.postId) targetUrl = '/dashboard.html#post-' + data.postId;
  else if (data.transactionId) targetUrl = '/dashboard.html#transactions';
  else if (data.link) targetUrl = data.link;

  const isEmergency = notifType.indexOf('emergency_') === 0;

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    requireInteraction: isEmergency || notifType === 'social_message',
    vibrate: vibratePattern,
    tag: notifTag,
    renotify: true,
    silent: false,
    data: {
      url: targetUrl,
      notifType: notifType,
      emergencyId: data.emergencyId || '',
      emergencyType: data.emergencyType || '',
      postId: data.postId || '',
      transactionId: data.transactionId || '',
      timestamp: data.timestamp || Date.now()
    },
    actions: isEmergency
      ? [{ action: 'open', title: '🔍 Lihat Detail' }, { action: 'dismiss', title: '❌ Tutup' }]
      : [{ action: 'open', title: '👁️ Buka' }, { action: 'dismiss', title: '❌ Tutup' }],
    timestamp: Date.now()
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
  console.log('👆 [firebase-messaging-sw v3.0] Notif diklik:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const targetUrl = data.url || '/dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.includes('salink') || client.url.includes('dashboard')) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            notifType: data.notifType,
            emergencyId: data.emergencyId,
            postId: data.postId,
            transactionId: data.transactionId,
            url: targetUrl
          });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

console.log('✅ [firebase-messaging-sw.js v3.0] Loaded');
console.log('📳 Vibrate patterns:', Object.keys(VIBRATE_PATTERNS).length, 'jenis notif');
