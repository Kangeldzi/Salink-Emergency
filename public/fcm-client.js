// fcm-client.js v3.0
// Logika FCM Web untuk SALINK — Multi-Jenis Notification
// Support: Emergency + Sosial + E-Commerce
// Fitur: Custom sound, requireInteraction, vibrate, actions, badge

(function() {
  'use strict';

  let _firebaseApp = null;
  let _messaging = null;
  let _currentToken = null;

  // ⭐ Custom sound mapping (foreground only)
  const SOUND_MAP = {
    'emergency_fire':     '/Music/Kebakaran.mp3',
    'emergency_medical':  '/Music/kematian.mp3',
    'emergency_crime':    '/Music/pencurian.mp3',
    'emergency_disaster': '/Music/bencana_tsunami.mp3'
  };
  const DEFAULT_SOUND = '/Music/smsblackber_4a537f155087133.mp3';

  // ⭐ Vibrate pattern fallback per jenis
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

  async function initFCM() {
    try {
      console.log('🔔 [FCM v3.0] Initializing...');

      if (!window.firebase) {
        await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
      }

      if (!firebase.apps.length) {
        _firebaseApp = firebase.initializeApp(SALINK_FIREBASE_CONFIG);
      } else {
        _firebaseApp = firebase.app();
      }

      if (!('serviceWorker' in navigator)) {
        return { ok: false, reason: 'no_service_worker' };
      }

      if (!firebase.messaging.isSupported || !firebase.messaging.isSupported()) {
        return { ok: false, reason: 'no_messaging_support' };
      }

      _messaging = firebase.messaging();

      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('✅ [FCM v3.0] SW terdaftar:', registration.scope);

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { ok: false, reason: 'permission_denied' };
      }

      _currentToken = await _messaging.getToken({
        vapidKey: SALINK_VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (!_currentToken) return { ok: false, reason: 'no_token' };

      console.log('🔥 [FCM v3.0] TOKEN:', _currentToken.substring(0, 30) + '...');

      _messaging.onMessage((payload) => {
        console.log('🔔 [FCM v3.0 Foreground] Notif masuk:', payload);
        showForegroundNotification(payload);
      });

      _messaging.onTokenRefresh(async () => {
        try {
          _currentToken = await _messaging.getToken();
          console.log('🔄 [FCM v3.0] Token refreshed');
        } catch (err) {}
      });

      return { ok: true, token: _currentToken };
    } catch (err) {
      console.error('❌ [FCM v3.0] initFCM error:', err);
      return { ok: false, reason: 'error', error: err.message };
    }
  }

  async function saveTokenToBackend(userIdentifier) {
    if (!_currentToken) return { ok: false, reason: 'no_token' };
    try {
      const payload = { action: 'save_fcm_token', fcmToken: _currentToken };
      if (userIdentifier.userId) payload.userId = userIdentifier.userId;
      if (userIdentifier.username) payload.username = userIdentifier.username;
      if (userIdentifier.email) payload.email = userIdentifier.email;

      const response = await fetch(SALINK_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      console.log('📤 [FCM v3.0] Save token response:', result);
      if (result.status === 'success') {
        try {
          localStorage.setItem('salink_fcm_token', _currentToken);
          localStorage.setItem('salink_fcm_saved_at', String(Date.now()));
        } catch(e) {}
      }
      return { ok: result.status === 'success', result };
    } catch (err) {
      return { ok: false, reason: 'error', error: err.message };
    }
  }

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
      return { ok: false, error: err.message };
    }
  }

  /**
   * ⭐ v3.0: Foreground notification — Handle semua jenis notif
   */
  function showForegroundNotification(payload) {
    console.log('🔔 [FCM v3.0 Foreground] Payload:', payload);

    const notification = payload.notification || {};
    const data = payload.data || {};

    const notifType = String(data.notifType || data.type || 'social_post').toLowerCase();
    const title = notification.title || '🔔 SALINK';
    const body = notification.body || 'Ada notifikasi baru';

    // ⭐ Sound URL
    let soundUrl = SOUND_MAP[notifType] || DEFAULT_SOUND;

    // ⭐ Vibrate pattern
    let vibratePattern = VIBRATE_PATTERNS[notifType] || [200, 100, 200];
    if (data.vibratePattern) {
      try {
        const parsed = JSON.parse(data.vibratePattern);
        if (Array.isArray(parsed) && parsed.length > 0) vibratePattern = parsed;
      } catch(e) {}
    }

    // ⭐ Tag unik
    const notifTag = String(data.tag || 'salink-notif') + '-' + (data.emergencyId || data.postId || data.transactionId || Date.now());

    // ⭐ Build URL target berdasarkan jenis
    let targetUrl = '/dashboard.html';
    if (data.mapsURL) targetUrl = data.mapsURL;
    else if (data.emergencyId) targetUrl = '/detail-emergency.html?id=' + encodeURIComponent(data.emergencyId);
    else if (data.postId) targetUrl = '/dashboard.html#post-' + data.postId;
    else if (data.transactionId) targetUrl = '/dashboard.html#transactions';
    else if (data.link) targetUrl = data.link;

    const options = {
      body: body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      requireInteraction: notifType.indexOf('emergency_') === 0 || notifType === 'social_message',
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
      actions: notifType.indexOf('emergency_') === 0
        ? [{ action: 'open', title: '🔍 Lihat Detail' }, { action: 'dismiss', title: '❌ Tutup' }]
        : [{ action: 'open', title: '👁️ Buka' }, { action: 'dismiss', title: '❌ Tutup' }],
      timestamp: Date.now()
    };

    // ⭐ Badge
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(1).catch(() => {});
    }

    // ⭐ Play sound (foreground only)
    try {
      const audio = new Audio(soundUrl);
      audio.volume = 1.0;
      audio.play().catch(err => {
        console.warn('⚠️ [FCM v3.0] Audio play diblokir:', err.message);
      });
    } catch(e) {}

    // ⭐ Tampilkan notif
    if (Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, options).then(() => {
              console.log('✅ [FCM v3.0] Notif via SW:', notifType);
            }).catch(err => {
              showNotifFallback(title, options, data);
            });
          }).catch(() => showNotifFallback(title, options, data));
        } else {
          showNotifFallback(title, options, data);
        }
      } catch (err) {}
    }
  }

  function showNotifFallback(title, options, data) {
    try {
      const notif = new Notification(title, options);
      notif.onclick = (e) => {
        e.preventDefault();
        window.focus();

        // ⭐ Trigger emergency alarm kalau emergency
        if (data.notifType && data.notifType.indexOf('emergency_') === 0 && window.triggerEmergencyAutoAlarm) {
          window.triggerEmergencyAutoAlarm({
            id: data.emergencyId,
            type: data.emergencyType || 'fire',
            sender: 'Sistem',
            location: 'Lokasi tidak diketahui',
            text: 'Emergency alert',
            timestamp: Date.now()
          });
        }

        window.open(options.data.url || '/dashboard.html', '_blank');
      };
      console.log('✅ [FCM v3.0] Notif via Notification API');
    } catch (e) {}
  }

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

  window.SalinkFCM = {
    init: initFCM,
    saveToken: saveTokenToBackend,
    removeToken: removeTokenFromBackend,
    getToken: () => _currentToken,
    soundMap: SOUND_MAP,
    vibrateMap: VIBRATE_PATTERNS
  };

  console.log('✅ [fcm-client.js v3.0] Loaded — Multi-jenis notification support');
  console.log('🎵 Sound map:', Object.keys(SOUND_MAP).join(', '));
  console.log('📳 Vibrate patterns:', Object.keys(VIBRATE_PATTERNS).length, 'jenis');
})();
