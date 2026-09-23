// fcm-client.js
// Logika FCM Web untuk SALINK

(function() {
  'use strict';

  let _firebaseApp = null;
  let _messaging = null;
  let _currentToken = null;

  /**
   * Inisialisasi Firebase + FCM.
   * Panggil setelah user login.
   */
  async function initFCM() {
    try {
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
        console.warn('⚠️ Browser tidak support Service Worker — FCM tidak bisa jalan');
        return { ok: false, reason: 'no_service_worker' };
      }

      if (!firebase.messaging.isSupported || !firebase.messaging.isSupported()) {
        console.warn('⚠️ Browser tidak support FCM Messaging');
        return { ok: false, reason: 'no_messaging_support' };
      }

      _messaging = firebase.messaging();

      // 4. Set Service Worker
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('✅ Service Worker terdaftar:', registration.scope);

      // 5. Minta izin notifikasi
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('⚠️ User menolak izin notifikasi');
        return { ok: false, reason: 'permission_denied' };
      }

      // 6. Ambil FCM token
      _currentToken = await _messaging.getToken({
        vapidKey: BGwJ9E-bZh2QwdYIeaSyVoxSc9puUnu6mjsMeR2nr9FAUSKAaq0SIuIlBxdaUExuYTd63zriEZwOTjj6TPTlMa0,
        serviceWorkerRegistration: registration
      });

      if (!_currentToken) {
        console.warn('⚠️ Tidak dapat FCM token');
        return { ok: false, reason: 'no_token' };
      }

      console.log('🔥 FCM TOKEN:', _currentToken);
      console.log('🔥 Panjang:', _currentToken.length);

      // 7. Pasang listener untuk notif saat tab aktif (foreground)
      _messaging.onMessage((payload) => {
        console.log('🔔 [Foreground] Notif masuk:', payload);
        showForegroundNotification(payload);
      });

      return { ok: true, token: _currentToken };

    } catch (err) {
      console.error('❌ initFCM error:', err);
      return { ok: false, reason: 'error', error: err.message };
    }
  }

  /**
   * Kirim token ke backend (sheet users).
   * Panggil setelah initFCM() dan user login.
   */
  async function saveTokenToBackend(userIdentifier) {
    if (!_currentToken) {
      console.warn('⚠️ Tidak ada token untuk disimpan');
      return { ok: false, reason: 'no_token' };
    }

    try {
      const payload = {
        action: 'save_fcm_token',
        fcmToken: _currentToken
      };

      // Support: userId, username, atau email
      if (userIdentifier.userId) payload.userId = userIdentifier.userId;
      if (userIdentifier.username) payload.username = userIdentifier.username;
      if (userIdentifier.email) payload.email = userIdentifier.email;

      const response = await fetch(SALINK_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // penting untuk Apps Script
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log('📤 Save token response:', result);
      return { ok: result.status === 'success', result };
    } catch (err) {
      console.error('❌ saveTokenToBackend error:', err);
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

      // Hapus juga di Firebase (best practice)
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
      return { ok: result.status === 'success', result };
    } catch (err) {
      console.error('❌ removeTokenFromBackend error:', err);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Tampilkan notif saat tab aktif (foreground).
   * FCM tidak otomatis menampilkan notif saat tab aktif,
   * jadi kita tampilkan manual pakai Notification API.
   */
  function showForegroundNotification(payload) {
    const title = payload.notification?.title || '🚨 SALINK';
    const options = {
      body: payload.notification?.body || 'Ada peringatan darurat',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: payload.data || {},
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      tag: payload.data?.emergencyId || 'salink-emergency'
    };

    if (Notification.permission === 'granted') {
      const notif = new Notification(title, options);
      notif.onclick = (e) => {
        e.preventDefault();
        window.focus();
        const url = payload.data?.mapsURL || '/';
        window.open(url, '_blank');
      };
    }
  }

  /**
   * Helper: load script via CDN.
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
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
    getToken: () => _currentToken
  };

  console.log('✅ fcm-client.js loaded — window.SalinkFCM siap');
})();
