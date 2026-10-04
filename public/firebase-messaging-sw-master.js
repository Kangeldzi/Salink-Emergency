// firebase-messaging-sw.js
// Service Worker FCM Web Push SALINK
// WAJIB di public/ supaya bisa diakses di /firebase-messaging-sw.js

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

// Notif saat tab/browser di background
messaging.onBackgroundMessage((payload) => {
  console.log('🔔 [SW] Background:', payload);

  const title = (payload.notification && payload.notification.title) || '🚨 SALINK DARURAT';
  const options = {
    body: (payload.notification && payload.notification.body) || 'Ada peringatan darurat di sekitar Anda',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: payload.data || {},
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    tag: (payload.data && payload.data.emergencyId) || 'salink-emergency'
  };

  return self.registration.showNotification(title, options);
});

// Klik notif
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && (event.notification.data.mapsURL || event.notification.data.url)) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
