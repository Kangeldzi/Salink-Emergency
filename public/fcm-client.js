// fcm-client.js v2.0
// Logika FCM Web untuk SALINK — PWA LOCK SCREEN OPTIMIZED
// Support: Android + iOS + Desktop
// Fitur: Custom sound, requireInteraction, vibrate, actions, badge

(function() {
  'use strict';

  let _firebaseApp = null;
  let _messaging = null;
  let _currentToken = null;

  // ⭐ Custom sound mapping per emergency type
  const SOUND_MAP = {
    'fire':     '/Music/Kebakaran.mp3',
    'medical':  '/Music/kematian.mp3',
    'crime':    '/Music/pencurian.mp3',
    'disaster': '/Music/bencana_tsunami.mp3'
  };
  const DEFAULT_SOUND = '/Music/smsblackber_4a537f155087133.mp3';

  /**
   * Inisialisasi Firebase + FCM.
   * Panggil setelah user login.
   */
  async function initFCM() {
    try {
      console.log('🔔 [FCM] Initializing...');

      // 1. Load Firebase SDK (compat) via CDN
      if (!window.firebase) {
        await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
      }

      // 2. Init Firebase
      if (!firebase.apps.length) {
        _firebaseApp = firebase.initializeApp(SALINK_FIREBASE_CONFIG);
      } else {
        _firebaseApp = firebase.app();
      }

      // 3. Cek dukungan browser
      if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ [FCM] Browser tidak support Service Worker');
        return { ok: false, reason: 'no_service_worker' };
      }

      if (!firebase.messaging.isSupported || !firebase.messaging.isSupported()) {
        console.warn('⚠️ [FCM] Browser tidak support FCM Messaging');
        return { ok: false, reason: 'no_messaging_support' };
      }

      _messaging = firebase.messaging();

      // 4. Set Service Worker (firebase-messaging-sw.js KHUSUS FCM)
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('✅ [FCM] Service Worker terdaftar:', registration.scope);

      // 5. Minta izin notifikasi
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('⚠️ [FCM] User menolak izin notifikasi');
        return { ok: false, reason: 'permission_denied' };
      }
      console.log('✅ [FCM] Permission granted');

      // 6. Ambil FCM token
      _currentToken = await _messaging.getToken({
        vapidKey: SALINK_VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (!_currentToken) {
        console.warn('⚠️ [FCM] Tidak dapat FCM token');
        return { ok: false, reason: 'no_token' };
      }

      console.log('🔥 [FCM] TOKEN:', _currentToken.substring(0, 30) + '...');
      console.log('🔥 [FCM] Panjang:', _currentToken.length);

      // 7. Pasang listener untuk notif saat tab aktif (foreground)
      _messaging.onMessage((payload) => {
        console.log('🔔 [FCM Foreground] Notif masuk:', payload);
        showForegroundNotification(payload);
      });

      // 8. Pasang listener untuk token refresh
      _messaging.onTokenRefresh(async () => {
        console.log('🔄 [FCM] Token refreshed');
        try {
          const newToken = await _messaging.getToken();
          _currentToken = newToken;
          console.log('🔄 [FCM] New token:', newToken.substring(0, 30) + '...');
        } catch (err) {
          console.error('❌ [FCM] Token refresh error:', err);
        }
      });

      return { ok: true, token: _currentToken };

    } catch (err) {
      console.error('❌ [FCM] initFCM error:', err);
      return { ok: false, reason: 'error', error: err.message };
    }
  }

  /**
   * Kirim token ke backend (sheet users).
   */
  async function saveTokenToBackend(userIdentifier) {
    if (!_currentToken) {
      console.warn('⚠️ [FCM] Tidak ada token untuk disimpan');
      return { ok: false, reason: 'no_token' };
    }

    try {
      const payload = {
        action: 'save_fcm_token',
        fcmToken: _currentToken
      };

      if (userIdentifier.userId) payload.userId = userIdentifier.userId;
      if (userIdentifier.username) payload.username = userIdentifier.username;
      if (userIdentifier.email) payload.email = userIdentifier.email;

      const response = await fetch(SALINK_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log('📤 [FCM] Save token response:', result);

      if (result.status === 'success') {
        // Simpan juga di localStorage
        try {
          localStorage.setItem('salink_fcm_token', _currentToken);
          localStorage.setItem('salink_fcm_saved_at', String(Date.now()));
        } catch(e) {}
      }

      return { ok: result.status === 'success', result };
    } catch (err) {
      console.error('❌ [FCM] saveTokenToBackend error:', err);
      return { ok: false, reason: 'error', error: err.message };
    }
  }

  /**
   * Hapus token dari backend (saat logout).
   */
  async function removeTokenFromBackend(userIdentifier) {
    try {
      const payload = { action: 'remove_fcm_token' };
      if (userIdentifier.userId) payload.userId = userIdentifier.userId;
      if (userIdentifier.username) payload.username = userIdentifier.username;
      if (userIdentifier.email) payload.email = userIdentifier.email;

      if (_messaging && _currentToken) {
        try { await _messaging.deleteToken(); } catch (e) {}
      }

      const response = await fetch(SALINK_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      _currentToken = null;

      try {
        localStorage.removeItem('salink_fcm_token');
        localStorage.removeItem('salink_fcm_saved_at');
      } catch(e) {}

      return { ok: result.status === 'success', result };
    } catch (err) {
      console.error('❌ [FCM] removeTokenFromBackend error:', err);
      return { ok: false, error: err.message };
    }
  }

  /**
   * ⭐ v2.0: Tampilkan notif saat tab aktif (foreground).
   * Custom sound + requireInteraction + vibrate + actions
   */
  function showForegroundNotification(payload) {
    console.log('🔔 [FCM Foreground] Payload:', payload);

    const notification = payload.notification || {};
    const data = payload.data || {};

    const title = notification.title || '🚨 SALINK EMERGENCY';
    const body = notification.body || 'Ada peringatan darurat';
    const emergencyType = String(data.emergencyType || 'fire').toLowerCase();
    const emergencyId = String(data.emergencyId || 'salink-emergency-' + Date.now());
    const soundUrl = SOUND_MAP[emergencyType] || DEFAULT_SOUND;
    const notifTag = 'salink-emergency-' + emergencyId;

    const options = {
      body: body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      image: data.imageUrl || undefined,

      // ⭐ Lock screen visibility
      requireInteraction: true,

      // ⭐ Vibrate pattern agresif
      vibrate: [500, 200, 500, 200, 500, 200, 1000],

      // ⭐ Tag + renotify (replace notif lama dengan tag sama)
      tag: notifTag,
      renotify: true,

      // ⭐ Sound = tidak silent
      silent: false,

      // ⭐ Data untuk handling click
      data: {
        url: data.mapsURL || data.url || '/dashboard.html?id=' + encodeURIComponent(emergencyId),
        emergencyId: emergencyId,
        emergencyType: emergencyType,
        latitude: data.latitude || '',
        longitude: data.longitude || '',
        sender: data.sender || '',
        timestamp: data.timestamp || Date.now()
      },

      // ⭐ Actions (Android 8+ & iOS 15+)
      actions: [
        { action: 'open',    title: '🔍 Lihat Detail' },
        { action: 'dismiss', title: '❌ Tutup' }
      ],

      timestamp: Date.now()
    };

    // ⭐ Set app badge
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(1).catch(() => {});
    }

    // ⭐ Play audio custom (fallback kalau browser tidak bisa play sound notif)
    try {
      const audio = new Audio(soundUrl);
      audio.volume = 1.0;
      audio.loop = false;
      audio.play().catch(err => {
        console.warn('⚠️ [FCM Foreground] Audio play diblokir:', err.message);
      });
    } catch(e) {
      console.warn('⚠️ [FCM Foreground] Audio error:', e.message);
    }

    // ⭐ Tampilkan notifikasi (via Service Worker — agar click handled by SW)
    if (Notification.permission === 'granted') {
      try {
        // ⭐ Coba via Service Worker dulu (lebih reliable untuk lock screen)
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, options).then(() => {
              console.log('✅ [FCM Foreground] Notif via SW:', emergencyId);
            }).catch(err => {
              console.warn('⚠️ [FCM Foreground] SW notif error:', err.message);
              // Fallback: pakai Notification API langsung
              try {
                const notif = new Notification(title, options);
                notif.onclick = handleForegroundClick.bind(null, data);
                console.log('✅ [FCM Foreground] Notif via Notification API');
              } catch (e2) {
                console.error('❌ [FCM Foreground] Fallback error:', e2);
              }
            });
          }).catch(() => {
            // Fallback kalau SW tidak ready
            try {
              const notif = new Notification(title, options);
              notif.onclick = handleForegroundClick.bind(null, data);
              console.log('✅ [FCM Foreground] Notif via Notification API (no SW)');
            } catch (e2) {
              console.error('❌ [FCM Foreground] Error:', e2);
            }
          });
        } else {
          // No SW — pakai Notification API langsung
          const notif = new Notification(title, options);
          notif.onclick = handleForegroundClick.bind(null, data);
          console.log('✅ [FCM Foreground] Notif via Notification API');
        }
      } catch (err) {
        console.error('❌ [FCM Foreground] Gagal tampil notif:', err.message);
      }
    } else {
      console.warn('⚠️ [FCM Foreground] Permission notif belum granted:', Notification.permission);
    }
  }

  /**
   * ⭐ v2.0: Handle click notif dari Notification API langsung
   */
  function handleForegroundClick(data, event) {
    if (event) event.preventDefault();
    console.log('👆 [FCM Foreground] Notif diklik:', data);

    window.focus();

    // ⭐ Trigger emergency auto alarm di halaman
    if (window.triggerEmergencyAutoAlarm && data && data.emergencyId) {
      window.triggerEmergencyAutoAlarm({
        id: data.emergencyId,
        type: data.emergencyType || 'fire',
        sender: data.sender || 'Sistem',
        location: 'Lokasi tidak diketahui',
        text: 'Emergency alert',
        timestamp: Date.now()
      });
    }

    // ⭐ Redirect ke detail emergency
    const targetUrl = data.url || ('/detail-emergency.html?id=' + encodeURIComponent(data.emergencyId));
    window.open(targetUrl, '_blank');
  }

  /**
   * Helper: load script via CDN.
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { resolve(); return; }

      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Expose ke global
  window.SalinkFCM = {
    init: initFCM,
    saveToken: saveTokenToBackend,
    removeToken: removeTokenFromBackend,
    getToken: () => _currentToken,
    soundMap: SOUND_MAP
  };

  console.log('✅ [fcm-client.js v2.0] Loaded — window.SalinkFCM siap');
  console.log('🎵 [fcm-client.js v2.0] Custom sounds:', Object.keys(SOUND_MAP).join(', '));
})();
