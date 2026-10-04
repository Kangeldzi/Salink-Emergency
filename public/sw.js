// ================================================================
// SALINK - SERVICE WORKER
// Versi: 3.0.0
// Fungsi: Cache offline + push handler + multi-jenis notif
// ================================================================

const CACHE_VERSION = 'salink-v3.0.0';
const CACHE_NAME = CACHE_VERSION;
const OFFLINE_URL = 'dashboard.html';

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

const urlsToCache = [
  'dashboard.html',
  'api.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
  console.log('📦 [SW v3.0] Installing...', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
      .catch(error => console.error('❌ [SW v3.0] Cache error:', error))
  );
});

self.addEventListener('activate', event => {
  console.log('🔧 [SW v3.0] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ [SW v3.0] Delete old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.hostname.includes('script.google.com') ||
      requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('gstatic')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match(OFFLINE_URL);
      });
    })
  );
});

self.addEventListener('push', event => {
  console.log('🔔 [SW v3.0] Push event');

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'SALINK', body: 'Ada notifikasi baru' };
  }

  const notification = data.notification || {};
  const dataPayload = data.data || {};

  const notifType = String(dataPayload.notifType || dataPayload.type || 'social_post').toLowerCase();
  const title = notification.title || '🔔 SALINK';
  const body = notification.body || 'Ada notifikasi baru';

  let vibratePattern = VIBRATE_PATTERNS[notifType] || [200, 100, 200];
  if (dataPayload.vibratePattern) {
    try {
      const parsed = JSON.parse(dataPayload.vibratePattern);
      if (Array.isArray(parsed) && parsed.length > 0) vibratePattern = parsed;
    } catch(e) {}
  }

  const notifTag = String(dataPayload.tag || 'salink-notif') + '-' + (dataPayload.emergencyId || dataPayload.postId || dataPayload.transactionId || Date.now());
  const isEmergency = notifType.indexOf('emergency_') === 0;

  let targetUrl = '/dashboard.html';
  if (dataPayload.mapsURL) targetUrl = dataPayload.mapsURL;
  else if (dataPayload.emergencyId) targetUrl = '/detail-emergency.html?id=' + encodeURIComponent(dataPayload.emergencyId);
  else if (dataPayload.postId) targetUrl = '/dashboard.html#post-' + dataPayload.postId;
  else if (dataPayload.transactionId) targetUrl = '/dashboard.html#transactions';
  else if (dataPayload.link) targetUrl = dataPayload.link;

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    requireInteraction: isEmergency || notifType === 'social_message',
    vibrate: vibratePattern,
    tag: notifTag,
    renotify: true,
    silent: false,
    data: { url: targetUrl, notifType: notifType, emergencyId: dataPayload.emergencyId || '' },
    actions: [{ action: 'open', title: '👁️ Buka' }, { action: 'dismiss', title: '❌ Tutup' }],
    timestamp: Date.now()
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.includes('salink') || client.url.includes('dashboard')) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

console.log('✅ [SW v3.0] Loaded — Multi-jenis notification support');
