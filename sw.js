// ================================================================
// SALINK - SERVICE WORKER
// ================================================================
// Versi: 1.0.0
// Fungsi: Cache offline, notifikasi push, dan performa
// ================================================================

const CACHE_NAME = 'salink-v1.0.0';
const OFFLINE_URL = 'dashboard.html';

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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Meng-cache file...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker: Cache berhasil!');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Service Worker: Gagal cache:', error);
      })
  );
});

// ================================================================
// ACTIVATE EVENT - Hapus cache lama
// ================================================================

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('🗑️ Service Worker: Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('✅ Service Worker: Siap digunakan!');
      return self.clients.claim();
    })
  );
});

// ================================================================
// FETCH EVENT - Ambil dari cache, lalu dari network
// ================================================================

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  
  // API request - jangan di-cache (biar selalu fresh)
  if (requestUrl.hostname.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Gambar - cache dengan strategi stale-while-revalidate
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
        if (response) {
          // Kembalikan dari cache
          return response;
        }
        
        // Tidak ada di cache, ambil dari network
        return fetch(event.request)
          .then(networkResponse => {
            // Simpan ke cache untuk下次
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Jika offline dan tidak ada cache, tampilkan halaman offline
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});

// ================================================================
// PUSH NOTIFICATION - Untuk notifikasi push dari server
// ================================================================

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'SALINK';
  const options = {
    body: data.body || 'Ada notifikasi baru dari SALINK',
    icon: data.icon || 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || 'dashboard.html'
    },
    actions: [
      {
        action: 'open',
        title: '🔍 Lihat'
      },
      {
        action: 'close',
        title: '❌ Tutup'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ================================================================
// NOTIFICATION CLICK - Saat user klik notifikasi
// ================================================================

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  const url = event.notification.data?.url || 'dashboard.html';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(windowClients => {
      // Jika sudah ada tab yang terbuka, fokus ke tab itu
      for (let client of windowClients) {
        if (client.url.includes('dashboard.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Jika belum ada, buka tab baru
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ================================================================
// OFFLINE SUPPORT - Kirim pesan ke client
// ================================================================

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ================================================================
// LOG
// ================================================================

console.log('✅ Service Worker SALINK berhasil di-load!');
console.log(`📦 Cache Name: ${CACHE_NAME}`);
console.log('📱 Aplikasi siap di-install di handphone!');
