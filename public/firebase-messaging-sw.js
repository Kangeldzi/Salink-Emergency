// ================================================================
// firebase-messaging-sw.js
// Service Worker KHUSUS FCM (dipanggil oleh Firebase SDK)
// ================================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ⭐ Config Firebase (SAMA dengan firebase-config.js)
firebase.initializeApp({
  apiKey: "AIzaSyD1Z4LTTsLaeKWx-RF2wbZR7GXjqiAP3tE",
  authDomain: "salink-app.firebaseapp.com",
  projectId: "salink-app",
  storageBucket: "salink-app.firebasestorage.app",
  messagingSenderId: "619188691915",
  appId: "1:619188691915:web:291c1cc49f8a30ff090c4e"
});

const messaging = firebase.messaging();

// ⭐ Custom sound mapping
const SOUND_MAP = {
  'fire':     '/Music/Kebakaran.mp3',
  'medical':  '/Music/kematian.mp3',
  'crime':    '/Music/pencurian.mp3',
  'disaster': '/Music/bencana_tsunami.mp3'
};

// ================================================================
// BACKGROUND MESSAGE HANDLER
// (Dipanggil saat tab TIDAK aktif / HP standby)
// ================================================================
messaging.onBackgroundMessage((payload) => {
  console.log('🔔 [firebase-messaging-sw] Background message:', payload);

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || '🚨 SALINK EMERGENCY';
  const body = notification.body || 'Ada peringatan darurat';
  const emergencyType = String(data.emergencyType || 'fire').toLowerCase();
  const emergencyId = String(data.emergencyId || 'salink-emergency-' + Date.now());

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: data.imageUrl || undefined,

    // ⭐ Lock screen visibility
    requireInteraction: true,

    // ⭐ Vibrate pattern
    vibrate: [500, 200, 500, 200, 500, 200, 1000],

    // ⭐ Tag + renotify
    tag: 'salink-emergency-' + emergencyId,
    renotify: true,

    // ⭐ Silent = false
    silent: false,

    data: {
      url: data.mapsURL || data.url || '/dashboard.html?id=' + encodeURIComponent(emergencyId),
      emergencyId: emergencyId,
      emergencyType: emergencyType,
      sender: data.sender || '',
      timestamp: data.timestamp || Date.now()
    },

    actions: [
      { action: 'open',    title: '🔍 Lihat Detail' },
      { action: 'dismiss', title: '❌ Tutup' }
    ],

    timestamp: Date.now()
  };

  return self.registration.showNotification(title, options);
});

// ================================================================
// NOTIFICATION CLICK HANDLER
// ================================================================
self.addEventListener('notificationclick', event => {
  console.log('👆 [firebase-messaging-sw] Notif diklik:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const targetUrl = data.url || '/dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.includes('salink') || client.url.includes('dashboard')) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

console.log('✅ [firebase-messaging-sw.js] Loaded — v2.0');
