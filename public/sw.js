// ================================================================
// SALINK - SERVICE WORKER
// Versi: 2.0.0
// Fungsi: Cache offline, notifikasi push, dan performa
// NEW v2.0: PWA Lock Screen Optimized — custom sound, actions, badge
// ================================================================

const CACHE_VERSION = 'salink-v2.0.0';
const CACHE_NAME = CACHE_VERSION;
const OFFLINE_URL = 'dashboard.html';

// ⭐ Custom sound mapping
const SOUND_MAP = {
  'fire':     '/Music/Kebakaran.mp3',
  'medical':  '/Music/kematian.mp3',
  'crime':    '/Music/pencurian.mp3',
  'disaster': '/Music/bencana_tsunami.mp3'
};

// ================================================================
// FILE YANG DI-CACHE (Agar bisa offline)
// ================================================================
const urlsToCache = [
  'dashboard.html',
  'api.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'
];

// ================================================================
// INSTALL EVENT - Cache semua file
// ================================================================
self.addEventListener('install', event => {
  console.log('📦 [SW] Installing...', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 [SW] Meng-cache file...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ [SW] Cache berhasil!');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ [SW] Gagal cache:', error);
      })
  );
});

// ================================================================
// ACTIVATE EVENT - Hapus cache lama
// ================================================================
self.addEventListener('activate', event => {
  console.log('🔧 [SW] Activating...', CACHE_VERSION);
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('🗑️ [SW] Hapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('✅ [SW] Siap digunakan!');
      return self.clients.claim();
    })
  );
});

// ================================================================
// FETCH EVENT - Ambil dari cache, lalu dari network
// ================================================================
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // API request - jangan di-cache
  if (requestUrl.hostname.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // FCM / Firebase — jangan di-cache
  if (requestUrl.hostname.includes('firebase') || requestUrl.hostname.includes('gstatic')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Gambar - stale-while-revalidate
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

  // HTML, CSS, JS - cache dulu, fallback ke offline
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;

        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});

// ================================================================
// PUSH NOTIFICATION — v2.0 LOCK SCREEN OPTIMIZED
// ================================================================
self.addEventListener('push', event => {
  console.log('🔔 [SW] Push event diterima');

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('❌ [SW] Push data bukan JSON:', e);
    data = { title: 'SALINK', body: 'Ada notifikasi baru' };
  }

  console.log('🔔 [SW] Push payload:', data);

  const notification = data.notification || {};
  const dataPayload = data.data || {};

  const title = notification.title || '🚨 SALINK EMERGENCY';
  const body = notification.body || 'Ada peringatan darurat';
  const emergencyType = String(dataPayload.emergencyType || 'fire').toLowerCase();
  const emergencyId = String(dataPayload.emergencyId || 'salink-emergency-' + Date.now());
  const soundUrl = SOUND_MAP[emergencyType] || '/Music/smsblackber_4a537f155087133.mp3';

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    image: dataPayload.imageUrl || undefined,

    // ⭐ Lock screen visibility
    requireInteraction: true,

    // ⭐ Vibrate pattern agresif
    vibrate: [500, 200, 500, 200, 500, 200, 1000],

    // ⭐ Tag + renotify
    tag: 'salink-emergency-' + emergencyId,
    renotify: true,

    // ⭐ Silent = false
    silent: false,

    // ⭐ Data untuk handling click
    data: {
      url: dataPayload.mapsURL || dataPayload.url || '/dashboard.html?id=' + encodeURIComponent(emergencyId),
      emergencyId: emergencyId,
      emergencyType: emergencyType,
      latitude: dataPayload.latitude || '',
      longitude: dataPayload.longitude || '',
      sender: dataPayload.sender || '',
      timestamp: dataPayload.timestamp || Date.now()
    },

    // ⭐ Actions
    actions: [
      { action: 'open',    title: '🔍 Lihat Detail' },
      { action: 'dismiss', title: '❌ Tutup' }
    ],

    timestamp: Date.now()
  };

  event.waitUntil(
    (async () => {
      try {
        // ⭐ Tampilkan notifikasi
        await self.registration.showNotification(title, options);
        console.log('✅ [SW] Notif ditampilkan:', emergencyId);

        // ⭐ Set app badge
        if ('setAppBadge' in self.navigator) {
          await self.navigator.setAppBadge(1).catch(() => {});
        }

        // ⭐ Kirim pesan ke semua client SALINK yang aktif
        const allClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        allClients.forEach(client => {
          client.postMessage({
            type: 'EMERGENCY_PUSH_RECEIVED',
            emergency: {
              id: emergencyId,
              type: emergencyType,
              sender: dataPayload.sender || 'Sistem',
              location: dataPayload.location || dataPayload.address || 'Lokasi tidak diketahui',
              text: body,
              timestamp: Date.now()
            }
          });
        });

        console.log('✅ [SW] Broadcast ke', allClients.length, 'clients');
      } catch (err) {
        console.error('❌ [SW] Push handler error:', err);
      }
    })()
  );
});

// ================================================================
// NOTIFICATION CLICK — v2.0
// ================================================================
self.addEventListener('notificationclick', event => {
  console.log('👆 [SW] Notif diklik:', event.action, event.notification.data);
  event.notification.close();

  // ⭐ Handle dismiss
  if (event.action === 'dismiss') {
    console.log('❌ [SW] User dismiss notif');
    return;
  }

  const data = event.notification.data || {};
  const targetUrl = data.url || '/dashboard.html';
  const emergencyId = data.emergencyId;

  event.waitUntil(
    (async () => {
      try {
        const allClients = await clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        // ⭐ Cari tab SALINK yang sudah terbuka
        for (let client of allClients) {
          if (client.url.includes('salink') || client.url.includes('dashboard')) {
            await client.focus();

            client.postMessage({
              type: 'EMERGENCY_NOTIFICATION_CLICK',
              emergencyId: emergencyId,
              emergencyType: data.emergencyType,
              url: targetUrl
            });

            console.log('✅ [SW] Fokus ke tab existing');
            return;
          }
        }

        // ⭐ Buka tab baru
        if (clients.openWindow) {
          await clients.openWindow(targetUrl);
          console.log('✅ [SW] Buka tab baru:', targetUrl);
        }
      } catch (err) {
        console.error('❌ [SW] Notification click error:', err);
      }
    })()
  );
});

// ================================================================
// NOTIFICATION CLOSE — v2.0
// ================================================================
self.addEventListener('notificationclose', event => {
  console.log('🔕 [SW] Notif ditutup tanpa tap');
});

// ================================================================
// MESSAGE HANDLER — v2.0
// ================================================================
self.addEventListener('message', event => {
  const data = event.data || {};
  console.log('📨 [SW] Message dari client:', data.type || data);

  if (data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ================================================================
// LOG
// ================================================================
console.log('✅ [SW] Service Worker SALINK v2.0.0 loaded');
console.log('📦 [SW] Cache:', CACHE_VERSION);
console.log('🚨 [SW] Emergency push handler aktif');
console.log('🎵 [SW] Custom sounds:', Object.keys(SOUND_MAP).join(', '));
