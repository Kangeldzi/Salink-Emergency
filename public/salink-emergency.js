/* ====================================================================
 * SALINK EMERGENCY ALERT — UNIVERSAL CLIENT v3.0
 * ====================================================================
 * File ini di-include oleh 14 file HTML (kecuali dashboard.html).
 *
 * FITUR UTAMA v3.0:
 * ✅ State machine tombol grid (IDLE / TESTING_ACTIVE / EMERGENCY_ACTIVE)
 * ✅ Auto-stop timer:
 *    - Testing tombol grid: 20 detik
 *    - Notif dari user lain: 60 detik (3×20s)
 *    - Mode standby: TIDAK auto-stop (harus swipe)
 * ✅ Toast "⏱️ Auto-Stop" saat alarm berhenti otomatis
 * ✅ Cross-tab sync via BroadcastChannel (semua tab SALINK sinkron)
 * ✅ Cross-app notification (via FCM saat tab hidden)
 * ✅ Dual mode: Standby (full screen) vs Aktif (floating)
 * ✅ Efek animasi tombol grid KONSISTEN di 3 skenario:
 *    - Tap tombol grid (testing)
 *    - Setelah POSTING postingan khusus
 *    - Terima notif dari user lain
 *
 * CARA PAKAI:
 *   <script src="/salink-emergency.js"></script>
 *
 * API PUBLIK (window.SalinkEmergency):
 *   - init()                          → auto-run saat DOM ready
 *   - showAlarm(em)                   → tampilkan full screen alarm
 *   - dismissAlarm()                  → dismiss alarm
 *   - showFloating(em)                → tampilkan floating notif
 *   - handleGridButtonTap(type)       → TESTING tombol grid (audio+animasi)
 *   - dismissGridButtonAlarm()        → dismiss alarm testing
 *   - triggerGridAlarmFromPost(type)  → trigger animasi setelah POSTING
 *   - playRegular()                   → audio notif regular
 *   - playEmergency(type)             → audio emergency loop
 *   - stopEmergency()                 → stop audio emergency
 *   - isStandbyMode()                 → cek mode standby/aktif
 * ==================================================================== */

(function() {
    'use strict';

    // ================================================================
    // KONFIGURASI
    // ================================================================
    const CONFIG = {
        API_URL: 'https://script.google.com/macros/s/AKfycbzSxSHnPpyNi-W0p_5tXV4fCXHLpMXX3nrLVCLmiSRrpxqDNSN2CZcLlpZqThpryjPj/exec',
        POLL_INTERVAL: 15000,                       // 15 detik polling
        IDLE_THRESHOLD_MS: 30000,                   // 30 detik → standby
        EMERGENCY_DURATION: 24 * 60 * 60 * 1000,    // 24 jam data emergency

        // ✅ v3.0: DURASI AUTO-STOP
        TESTING_AUTO_STOP_MS: 20000,                // 20 detik — untuk testing tombol grid
        EMERGENCY_AUTO_STOP_MS: 60000,              // 60 detik (3×20s) — untuk notif dari user lain

        VIBRATE_INTERVAL_MS: 2000,                  // 2 detik vibrate interval
        SWIPE_MIN_DISTANCE: 50,                     // 50 px minimum swipe

        AUDIO: {
            'fire':     '/Music/Kebakaran.mp3',
            'medical':  '/Music/kematian.mp3',
            'crime':    '/Music/pencurian.mp3',
            'disaster': '/Music/bencana_tsunami.mp3'
        },
        REGULAR_AUDIO: '/Music/smsblackber_4a537f155087133.mp3',

        LABELS: {
            'fire': '🔥 Kebakaran',
            'medical': '🚑 Medis & Kematian',
            'crime': '🚓 Kriminal',
            'disaster': '🌪️ Bencana Alam'
        },
        ICONS: {
            'fire': '🔥',
            'medical': '🚑',
            'crime': '🚓',
            'disaster': '🌪️'
        },
        CSS_CLASS: {
            'fire': 'fire',
            'medical': 'medical',
            'crime': 'crime',
            'disaster': 'disaster'
        },
        SHORT_LABELS: {
            'fire': 'KEBAKARAN',
            'medical': 'MEDIS',
            'crime': 'KRIMINAL',
            'disaster': 'BENCANA'
        },
        COLOR: {
            'fire': '#f85149',
            'medical': '#4fc3f7',
            'crime': '#f0d080',
            'disaster': '#c792ea'
        }
    };

    // ================================================================
    // STATE
    // ================================================================
    const state = {
        // Init
        initialized: false,
        currentUser: null,

        // Notifications
        readNotifs: {},
        dismissedEmergencies: {},
        emergencyPollTimer: null,
        lastNotifCheck: 0,

        // Idle
        idleTimer: null,
        isIdleStandby: false,

        // Audio
        audioCache: {},
        audioContext: null,
        audioUnlocked: false,
        emergencyAudioLoop: null,

        // Vibrate
        emergencyVibrateTimer: null,

        // Full screen alarm
        fullScreenAlarmActive: false,
        fullScreenAlarmEmergency: null,

        // ✅ v3.0: Grid button state machine
        gridButtonState: 'IDLE',                    // IDLE | TESTING_ACTIVE | EMERGENCY_ACTIVE
        gridButtonAlarmType: null,
        gridButtonAlarmStartTime: 0,
        gridButtonAutoStopTimer: null,
        gridButtonMode: null,                       // 'testing' | 'emergency'

        // Cross-tab
        syncChannel: null,
        broadcastLock: false                        // Prevent loop
    };

    // ================================================================
    // UTILS
    // ================================================================
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeAttr(str) {
        if (!str) return '';
        return String(str)
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function formatDate(ts) {
        if (!ts) return '-';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '-';
        const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' • ' +
               String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    function log() {
        const args = Array.prototype.slice.call(arguments);
        console.log.apply(console, ['🚨 [SalinkEmergency]'].concat(args));
    }
    function logWarn() {
        const args = Array.prototype.slice.call(arguments);
        console.warn.apply(console, ['⚠️ [SalinkEmergency]'].concat(args));
    }
    function logError() {
        const args = Array.prototype.slice.call(arguments);
        console.error.apply(console, ['❌ [SalinkEmergency]'].concat(args));
    }

    // ================================================================
    // STORAGE
    // ================================================================
    function loadReadNotifs() {
        try {
            state.readNotifs = JSON.parse(localStorage.getItem('salink_read_notifs') || '{}');
        } catch(e) {
            state.readNotifs = {};
        }
    }

    function saveReadNotifs() {
        try {
            localStorage.setItem('salink_read_notifs', JSON.stringify(state.readNotifs));
        } catch(e) {}
    }

    function loadDismissed() {
        try {
            state.dismissedEmergencies = JSON.parse(localStorage.getItem('salink_dismissed_emergencies') || '{}');
        } catch(e) {
            state.dismissedEmergencies = {};
        }
        // Cleanup expired
        const now = Date.now();
        let cleaned = false;
        Object.keys(state.dismissedEmergencies).forEach(id => {
            if (now - state.dismissedEmergencies[id] > CONFIG.EMERGENCY_DURATION) {
                delete state.dismissedEmergencies[id];
                cleaned = true;
            }
        });
        if (cleaned) saveDismissed();
    }

    function saveDismissed() {
        try {
            localStorage.setItem('salink_dismissed_emergencies', JSON.stringify(state.dismissedEmergencies));
        } catch(e) {}
    }

    function isDismissed(id) {
        return state.dismissedEmergencies[id] !== undefined;
    }

    function dismissEmergency(id) {
        if (!id) return;
        state.dismissedEmergencies[id] = Date.now();
        saveDismissed();
    }

    function getAllEmergencies() {
        try {
            return JSON.parse(localStorage.getItem('salink_emergencies') || '[]');
        } catch(e) {
            return [];
        }
    }

    function getActiveEmergencies() {
        const all = getAllEmergencies();
        return all.filter(e => {
            const exp = e.expiresAt || (new Date(e.timestamp).getTime() + CONFIG.EMERGENCY_DURATION);
            return exp > Date.now();
        });
    }

    // ================================================================
    // AUDIO SYSTEM
    // ================================================================
    function unlockAudio() {
        if (state.audioUnlocked) return;
        try {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const buffer = state.audioContext.createBuffer(1, 1, 22050);
            const source = state.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(state.audioContext.destination);
            source.start(0);
            if (state.audioContext.state === 'suspended') {
                state.audioContext.resume().catch(() => {});
            }
            state.audioUnlocked = true;
            log('Audio unlocked');
        } catch(e) {
            logWarn('Unlock failed:', e.message);
        }
    }

    // Unlock pada interaksi pertama
    ['click', 'touchstart', 'keydown'].forEach(evt => {
        document.addEventListener(evt, unlockAudio, { once: true, passive: true });
    });

    function preloadAllAudio() {
        log('Preloading audio...');
        Object.keys(CONFIG.AUDIO).forEach(type => {
            try {
                const audio = new Audio();
                audio.preload = 'auto';
                audio.src = CONFIG.AUDIO[type];
                audio.volume = 1.0;
                audio.load();
                state.audioCache[type] = audio;
            } catch(e) {
                logWarn('Preload ' + type + ':', e.message);
            }
        });
        try {
            const regAudio = new Audio();
            regAudio.preload = 'auto';
            regAudio.src = CONFIG.REGULAR_AUDIO;
            regAudio.volume = 1.0;
            regAudio.load();
            state.audioCache['regular'] = regAudio;
        } catch(e) {
            logWarn('Preload regular:', e.message);
        }
        log('Audio preloaded');
    }

    function playRegularSound() {
        try {
            unlockAudio();
            const cached = state.audioCache['regular'];
            if (cached) {
                cached.currentTime = 0;
                cached.volume = 1.0;
                const p = cached.play();
                if (p !== undefined) {
                    p.catch(() => {
                        try {
                            new Audio(CONFIG.REGULAR_AUDIO).play().catch(() => {});
                        } catch(e) {}
                    });
                }
            } else {
                new Audio(CONFIG.REGULAR_AUDIO).play().catch(() => {});
            }
        } catch(e) {
            logWarn('playRegularSound:', e.message);
        }
    }

    function playEmergencyLoop(type) {
        try {
            unlockAudio();
            const url = CONFIG.AUDIO[type];
            if (!url) return null;

            stopEmergencyLoop();

            const cached = state.audioCache[type];
            const audio = cached || new Audio(url);
            audio.currentTime = 0;
            audio.volume = 1.0;
            audio.loop = true;
            state.emergencyAudioLoop = audio;

            const p = audio.play();
            if (p !== undefined) {
                p.then(() => log('Emergency loop playing:', type))
                 .catch(err => {
                    logWarn('Emergency play failed:', err.message);
                    // Fallback: buat baru
                    try {
                        const fb = new Audio(url);
                        fb.volume = 1.0;
                        fb.loop = true;
                        state.emergencyAudioLoop = fb;
                        fb.play().catch(() => {});
                    } catch(e) {}
                 });
            }
            return audio;
        } catch(e) {
            logWarn('playEmergencyLoop:', e.message);
            return null;
        }
    }

    function stopEmergencyLoop() {
        if (state.emergencyAudioLoop) {
            try {
                state.emergencyAudioLoop.pause();
                state.emergencyAudioLoop.currentTime = 0;
                state.emergencyAudioLoop.loop = false;
            } catch(e) {}
            state.emergencyAudioLoop = null;
        }
        // Clear auto-stop timer
        if (state.gridButtonAutoStopTimer) {
            clearTimeout(state.gridButtonAutoStopTimer);
            state.gridButtonAutoStopTimer = null;
        }
    }

    // ================================================================
    // VIBRATE SYSTEM
    // ================================================================
    function startVibrateLoop(callback) {
        stopVibrateLoop();
        if (!navigator.vibrate) return;
        navigator.vibrate([500, 200, 500, 200, 500, 200]);
        state.emergencyVibrateTimer = setInterval(() => {
            if (typeof callback === 'function' && callback()) {
                navigator.vibrate([500, 200, 500, 200, 500, 200]);
            }
        }, CONFIG.VIBRATE_INTERVAL_MS);
    }

    function stopVibrateLoop() {
        if (state.emergencyVibrateTimer) {
            clearInterval(state.emergencyVibrateTimer);
            state.emergencyVibrateTimer = null;
        }
        if (navigator.vibrate) navigator.vibrate(0);
    }

    // ================================================================
    // AUTO-PAUSE AUDIO SAAT TAB HIDDEN
    // ================================================================
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Pause audio (hemat baterai)
            if (state.emergencyAudioLoop && !state.emergencyAudioLoop.paused) {
                try { state.emergencyAudioLoop.pause(); } catch(e) {}
            }
        } else {
            // Resume jika alarm masih aktif
            const isAlarmActive = state.fullScreenAlarmActive ||
                (state.gridButtonState === 'TESTING_ACTIVE') ||
                (state.gridButtonState === 'EMERGENCY_ACTIVE');
            if (state.emergencyAudioLoop && state.emergencyAudioLoop.paused && isAlarmActive) {
                try { state.emergencyAudioLoop.play().catch(() => {}); } catch(e) {}
            }
        }
    });

    // ================================================================
    // DUAL MODE DETECTION
    // ================================================================
    function isStandbyMode() {
        if (document.hidden) return true;
        if (state.isIdleStandby) return true;
        return false;
    }

    function resetIdleTimer() {
        state.isIdleStandby = false;
        if (state.idleTimer) clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(() => {
            state.isIdleStandby = true;
        }, CONFIG.IDLE_THRESHOLD_MS);
    }

    function setupIdleDetection() {
        ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'visibilitychange'].forEach(evt => {
            document.addEventListener(evt, () => {
                if (document.visibilityState === 'visible') resetIdleTimer();
            }, { passive: true });
        });
        resetIdleTimer();
    }

    // ================================================================
    // CROSS-TAB SYNC VIA BROADCASTCHANNEL
    // ================================================================
    function setupCrossTabSync() {
        try {
            state.syncChannel = new BroadcastChannel('salink_emergency_sync');
            state.syncChannel.onmessage = (event) => {
                handleCrossTabMessage(event.data);
            };
            log('Cross-tab sync ready');
        } catch(e) {
            logWarn('BroadcastChannel not supported:', e.message);
        }
    }

    function handleCrossTabMessage(data) {
        if (!data || !data.type) return;
        if (state.broadcastLock) return; // Prevent loop
        log('Cross-tab message:', data.type);

        switch(data.type) {
            case 'grid_alarm_start':
                // Tab lain mulai alarm → ikut nyalakan
                if (state.gridButtonState === 'IDLE') {
                    _startGridButtonAlarm(data.alarmType, data.mode, true);
                }
                break;

            case 'grid_alarm_stop':
                // Tab lain stop alarm → ikut stop
                if (state.gridButtonState !== 'IDLE') {
                    _stopGridButtonAlarmInternal();
                }
                break;

            case 'full_screen_dismiss':
                // Tab lain dismiss full screen → ikut dismiss
                if (state.fullScreenAlarmActive) {
                    _dismissFullScreenAlarmInternal();
                }
                break;

            case 'emergency_notification':
                // Tab lain terima notif → trigger di sini juga
                if (data.emergency) {
                    triggerEmergencyFromNotification(data.emergency);
                }
                break;
        }
    }

    function broadcastEmergency(type, data) {
        if (!state.syncChannel) return;
        try {
            state.broadcastLock = true;
            state.syncChannel.postMessage(Object.assign({ type: type }, data || {}));
            setTimeout(() => { state.broadcastLock = false; }, 100);
        } catch(e) {
            state.broadcastLock = false;
        }
    }

    // ================================================================
    // CSS INJECTION (v3.0 — dengan animasi lengkap)
    // ================================================================
    function injectStyles() {
        if (document.getElementById('salink-emergency-styles')) return;

        const style = document.createElement('style');
        style.id = 'salink-emergency-styles';
        style.textContent = `
            /* ============ FULL SCREEN ALARM ============ */
            .salink-full-screen-alarm {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                width: 100vw; height: 100vh; height: 100dvh;
                background: #0d1117; z-index: 999999;
                display: none; flex-direction: column; align-items: center; justify-content: center;
                padding: 30px 20px; text-align: center;
                user-select: none; -webkit-user-select: none;
                touch-action: none; overflow: hidden;
            }
           .salink-full-screen-alarm .salink-btn-detail {
    position: absolute;
    bottom: 155px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 32px;
    background: linear-gradient(135deg, var(--alarm-color, #f85149), rgba(248,81,73,0.7));
    color: #fff;
    border: 2px solid rgba(255,255,255,0.3);
    border-radius: 14px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 25px rgba(0,0,0,0.4), 0 0 30px var(--alarm-color, #f85149);
    z-index: 10;
    font-family: 'Poppins', sans-serif;
    transition: all 0.3s ease;
    animation: salinkPulse 2s ease-in-out infinite;
    letter-spacing: 0.5px;
}
.salink-full-screen-alarm .salink-btn-detail:hover {
    transform: translateX(-50%) scale(1.05);
    box-shadow: 0 12px 35px rgba(0,0,0,0.5), 0 0 50px var(--alarm-color, #f85149);
}
.salink-full-screen-alarm .salink-btn-detail:active {
    transform: translateX(-50%) scale(0.95);
}
.salink-full-screen-alarm .salink-btn-detail i {
    font-size: 1.2rem;
} 
            .salink-full-screen-alarm.active {
                display: flex;
                animation: salinkFullScreenFlash 1s ease-in-out infinite;
            }
            .salink-full-screen-alarm.fire { --alarm-color: #f85149; }
            .salink-full-screen-alarm.medical { --alarm-color: #4fc3f7; }
            .salink-full-screen-alarm.crime { --alarm-color: #f0d080; }
            .salink-full-screen-alarm.disaster { --alarm-color: #c792ea; }

            @keyframes salinkFullScreenFlash {
                0%, 100% { background-color: #0d1117; }
                50% { background-color: #4a0000; }
            }
            @keyframes salinkPulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 60px var(--alarm-color, #f85149); }
                50% { transform: scale(1.08); box-shadow: 0 0 120px var(--alarm-color, #f85149); }
            }
            @keyframes salinkZoom {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.15); }
            }
            @keyframes salinkSwipeHint {
                0%, 100% { opacity: 0.5; transform: translateY(0); }
                50% { opacity: 1; transform: translateY(-12px); }
            }
            @keyframes salinkShakeX {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-8px); }
                75% { transform: translateX(8px); }
            }
            @keyframes salinkDirPulse {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.2); }
            }
            @keyframes salinkRingIcon {
                0%, 100% { transform: scale(1) rotate(-15deg); }
                25% { transform: scale(1.1) rotate(15deg); }
                50% { transform: scale(1.15) rotate(-15deg); }
                75% { transform: scale(1.1) rotate(15deg); }
            }

            /* ============ GRID BUTTON ANIMATIONS ============ */
            @keyframes salinkGridFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-12px); }
            }
            @keyframes salinkGridZoom {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.08); }
            }
            @keyframes salinkGridShake {
                0%, 100% { transform: translate(0, 0) rotate(0deg); }
                10% { transform: translate(-2px, -2px) rotate(-1deg); }
                20% { transform: translate(2px, 2px) rotate(1deg); }
                30% { transform: translate(-2px, 2px) rotate(-1deg); }
                40% { transform: translate(2px, -2px) rotate(1deg); }
                50% { transform: translate(-2px, 0) rotate(0deg); }
                60% { transform: translate(2px, 0) rotate(0deg); }
                70% { transform: translate(0, -2px) rotate(-1deg); }
                80% { transform: translate(0, 2px) rotate(1deg); }
                90% { transform: translate(0, -1px) rotate(0deg); }
            }
            @keyframes salinkGridPulse {
                0%, 100% { box-shadow: 0 0 20px rgba(248,81,73,0.3); }
                50% { box-shadow: 0 0 40px rgba(248,81,73,0.6); }
            }
            @keyframes salinkGridBlink {
                0%, 100% { background-color: transparent; }
                50% { background-color: rgba(248,81,73,0.15); }
            }
            @keyframes salinkGridRing {
                0%, 100% { transform: rotate(0deg); }
                25% { transform: rotate(3deg); }
                75% { transform: rotate(-3deg); }
            }

            /* ============ GRID BUTTON ACTIVE STATE ============ */
            .emergency-btn.grid-alarm-active {
                border-color: var(--alarm-color, #f85149) !important;
                box-shadow: 0 0 40px rgba(248, 81, 73, 0.6) !important;
                animation:
                    salinkGridFloat 2s ease-in-out infinite,
                    salinkGridZoom 1.2s ease-in-out infinite !important;
                z-index: 10 !important;
            }
            .emergency-btn.grid-alarm-active .btn-content {
                animation:
                    salinkGridShake 0.6s ease-in-out infinite,
                    salinkGridRing 0.5s ease-in-out infinite,
                    salinkGridBlink 1s ease-in-out infinite !important;
                border-color: var(--alarm-color, #f85149) !important;
            }
            .emergency-btn.grid-alarm-active .play-status {
                color: var(--alarm-color, #f85149) !important;
                font-weight: 700 !important;
                animation: salinkZoom 0.8s ease-in-out infinite;
            }
            .emergency-btn.grid-alarm-active::after {
                content: '';
                position: absolute;
                top: -15px; right: -15px;
                width: 30px; height: 30px;
                border-radius: 50%;
                background: var(--alarm-color, #f85149);
                animation: salinkGridPulse 0.8s ease-in-out infinite;
                box-shadow: 0 0 20px var(--alarm-color, #f85149);
                z-index: 11;
            }
            .emergency-btn.grid-alarm-active::before {
                content: '🔔';
                position: absolute;
                top: -22px; right: -22px;
                font-size: 1rem;
                z-index: 12;
                animation: salinkRingIcon 1s ease-in-out infinite;
            }

            /* ============ FULL SCREEN ALARM ELEMENTS ============ */
            .salink-full-screen-alarm .salink-alarm-badge {
                position: absolute; top: 30px; left: 50%; transform: translateX(-50%);
                padding: 6px 20px; background: rgba(248,81,73,0.25);
                border: 1px solid rgba(248,81,73,0.4); border-radius: 20px;
                font-size: 0.7rem; font-weight: 700; color: #f85149;
                text-transform: uppercase; letter-spacing: 2px;
                animation: salinkPulse 1.2s ease-in-out infinite;
            }
            .salink-full-screen-alarm .salink-alarm-audio-indicator {
                position: absolute; top: 80px; left: 50%; transform: translateX(-50%);
                display: flex; align-items: center; gap: 8px;
                font-size: 0.75rem; color: var(--alarm-color, #f85149);
                font-weight: 700; animation: salinkPulse 0.8s ease-in-out infinite;
            }
            .salink-full-screen-alarm .salink-alarm-icon-wrapper {
                width: 140px; height: 140px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin-bottom: 24px; background: rgba(255,255,255,0.05);
                border: 3px solid var(--alarm-color, #f85149);
                box-shadow: 0 0 60px var(--alarm-color, #f85149), inset 0 0 40px rgba(255,255,255,0.1);
                animation: salinkPulse 1s ease-in-out infinite, salinkShakeX 0.6s ease-in-out infinite;
                cursor: pointer;
            }
            .salink-full-screen-alarm .salink-alarm-icon {
                font-size: 5rem; line-height: 1;
                animation: salinkZoom 1s ease-in-out infinite;
            }
            .salink-full-screen-alarm .salink-alarm-title {
                font-size: 2.4rem; font-weight: 800;
                color: var(--alarm-color, #f85149);
                text-shadow: 0 0 40px var(--alarm-color, #f85149), 0 0 80px var(--alarm-color, #f85149);
                margin-bottom: 8px;
                animation: salinkZoom 1.2s ease-in-out infinite;
                font-family: 'Poppins', sans-serif;
                letter-spacing: 2px; text-transform: uppercase;
            }
            .salink-full-screen-alarm .salink-alarm-subtitle {
                font-size: 1rem; color: #8b949e; margin-bottom: 20px; font-weight: 500;
            }
            .salink-full-screen-alarm .salink-alarm-info {
                display: flex; flex-direction: column; gap: 8px;
                margin-bottom: 24px; max-width: 500px; width: 100%;
            }
            .salink-full-screen-alarm .salink-alarm-info-item {
                display: flex; align-items: center; justify-content: center; gap: 8px;
                font-size: 0.8rem; color: #8b949e;
                padding: 8px 14px; background: rgba(255,255,255,0.03);
                border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);
            }
            .salink-full-screen-alarm .salink-alarm-info-item strong { color: #e6edf3; font-weight: 700; }
            .salink-full-screen-alarm .salink-alarm-info-item i { color: var(--alarm-color, #f85149); }
            .salink-full-screen-alarm .salink-alarm-instruction {
                position: absolute; bottom: 140px; left: 50%; transform: translateX(-50%);
                font-size: 0.65rem; color: #6e7681; text-align: center;
                max-width: 300px; line-height: 1.5;
            }
            .salink-full-screen-alarm .salink-swipe-indicator {
                position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
                display: flex; flex-direction: column; align-items: center; gap: 14px;
                padding: 18px 32px; background: rgba(255,255,255,0.06);
                border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);
                animation: salinkSwipeHint 1.5s ease-in-out infinite;
                pointer-events: none;
            }
            .salink-full-screen-alarm .salink-swipe-text {
                font-size: 0.75rem; color: #8b949e; font-weight: 600;
                text-transform: uppercase; letter-spacing: 1px;
            }
            .salink-full-screen-alarm .salink-swipe-arrows {
                position: relative; width: 80px; height: 80px;
                display: flex; align-items: center; justify-content: center;
            }
            .salink-full-screen-alarm .salink-swipe-arrows i {
                position: absolute; font-size: 1.6rem; color: #8b949e;
                animation: salinkDirPulse 1.5s ease-in-out infinite;
            }
            .salink-full-screen-alarm .salink-swipe-arrows i:nth-child(1) { top: 0; left: 50%; transform: translateX(-50%); animation-delay: 0s; }
            .salink-full-screen-alarm .salink-swipe-arrows i:nth-child(2) { bottom: 0; left: 50%; transform: translateX(-50%); animation-delay: 0.4s; }
            .salink-full-screen-alarm .salink-swipe-arrows i:nth-child(3) { left: 0; top: 50%; transform: translateY(-50%); animation-delay: 0.8s; }
            .salink-full-screen-alarm .salink-swipe-arrows i:nth-child(4) { right: 0; top: 50%; transform: translateY(-50%); animation-delay: 1.2s; }
            .salink-full-screen-alarm .salink-swipe-arrows .salink-center-icon {
                position: static; font-size: 1.8rem;
                color: var(--alarm-color, #f85149);
                animation: salinkRingIcon 1.5s ease-in-out infinite;
            }
            .salink-full-screen-alarm .salink-swipe-feedback {
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                font-size: 6rem; color: var(--alarm-color, #f85149);
                opacity: 0; pointer-events: none;
                transition: opacity 0.2s;
                text-shadow: 0 0 40px var(--alarm-color, #f85149);
            }
            .salink-full-screen-alarm .salink-swipe-feedback.active {
                opacity: 1; animation: salinkZoom 0.4s ease-in-out;
            }

            /* ============ FLOATING NOTIFICATION ============ */
            .salink-floating-notification {
                position: fixed; top: 70px; left: 10px; right: 10px;
                max-width: 500px; margin: 0 auto;
                background: rgba(22, 27, 34, 0.98);
                backdrop-filter: blur(15px);
                border: 1px solid #58a6ff; border-radius: 12px;
                padding: 12px 14px; z-index: 99998;
                display: none; align-items: center; gap: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.4);
                cursor: pointer;
                animation: salinkSlideDown 0.5s ease;
            }
            .salink-floating-notification.active { display: flex; }
            .salink-floating-notification.hide { animation: salinkSlideUp 0.5s ease forwards; }
            .salink-floating-notification.emergency-notif {
                border-color: #f85149;
                box-shadow: 0 0 30px rgba(248,81,73,0.5);
            }
            @keyframes salinkSlideDown {
                from { transform: translateY(-100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes salinkSlideUp {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(-100px); opacity: 0; }
            }
            .salink-floating-notification .salink-notif-icon {
                width: 36px; height: 36px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0; font-size: 1rem;
                background: rgba(88,166,255,0.15); color: #58a6ff;
            }
            .salink-floating-notification .salink-notif-icon.emergency {
                background: rgba(248,81,73,0.2); color: #f85149;
                animation: salinkPulse 0.5s ease-in-out infinite;
            }
            .salink-floating-notification .salink-notif-content { flex: 1; min-width: 0; }
            .salink-floating-notification .salink-notif-title {
                font-size: 0.8rem; font-weight: 600; color: #e6edf3;
            }
            .salink-floating-notification .salink-notif-message {
                font-size: 0.65rem; color: #8b949e;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .salink-floating-notification .salink-notif-subtitle {
                font-size: 0.55rem; color: #6e7681;
            }
            .salink-floating-notification .salink-notif-action {
                padding: 4px 16px; border-radius: 5px;
                border: 1px solid #58a6ff;
                background: rgba(88,166,255,0.15); color: #58a6ff;
                font-size: 0.7rem; font-weight: 600; cursor: pointer;
                white-space: nowrap;
            }
            .salink-floating-notification .salink-notif-close {
                background: none; border: none; color: #6e7681;
                cursor: pointer; font-size: 0.8rem; padding: 4px;
            }

            /* ============ TOAST ============ */
            .toast-container {
                position: fixed; bottom: 80px; left: 50%;
                transform: translateX(-50%);
                z-index: 3000; max-width: 400px; width: 90%;
            }
            .toast {
                background: rgba(22, 27, 34, 0.98);
                border: 1px solid #30363d; border-radius: 12px;
                padding: 12px 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
                display: flex; align-items: center; gap: 12px;
                margin-bottom: 8px;
                animation: salinkSlideDown 0.4s ease;
            }
            .toast .toast-icon {
                width: 32px; height: 32px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
                background: rgba(88,166,255,0.15); color: #58a6ff;
            }
            .toast .toast-content { flex: 1; }
            .toast .toast-title { font-size: 0.75rem; font-weight: 600; color: #e6edf3; }
            .toast .toast-message { font-size: 0.7rem; color: #8b949e; }
            .toast .toast-close {
                background: none; border: none; color: #6e7681;
                cursor: pointer; font-size: 0.8rem; padding: 4px;
            }
            .toast.active { display: flex; }
            .toast:not(.active) { display: none; }
        `;
        document.head.appendChild(style);
    }

     // ================================================================
    // ✅ v3.0: GRID BUTTON STATE MACHINE
    // ================================================================
    // State: IDLE | TESTING_ACTIVE | EMERGENCY_ACTIVE
    //
    // Transisi:
    // IDLE → TESTING_ACTIVE       (user tap tombol, mode testing)
    // IDLE → EMERGENCY_ACTIVE     (notif emergency / setelah POSTING)
    // TESTING_ACTIVE → IDLE       (user tap lagi / auto-stop 20s)
    // EMERGENCY_ACTIVE → IDLE     (user tap lagi / auto-stop 60s)
    // TESTING_ACTIVE → EMERGENCY_ACTIVE (upgrade ke emergency mode)
    // EMERGENCY_ACTIVE → TESTING_ACTIVE (downgrade, tipe berbeda)
    // ================================================================

    function _startGridButtonAlarm(type, mode, fromBroadcast) {
        // mode: 'testing' | 'emergency'
        // fromBroadcast: true kalau dari tab lain (jangan broadcast ulang)

        if (!type || !CONFIG.AUDIO[type]) {
            logWarn('Invalid type:', type);
            return;
        }

        log('START grid button alarm:', type, 'mode:', mode, 'fromBroadcast:', fromBroadcast);

        // Set state
        state.gridButtonState = (mode === 'emergency') ? 'EMERGENCY_ACTIVE' : 'TESTING_ACTIVE';
        state.gridButtonAlarmType = type;
        state.gridButtonAlarmStartTime = Date.now();
        state.gridButtonMode = mode;

        // Clear timer lama
        if (state.gridButtonAutoStopTimer) {
            clearTimeout(state.gridButtonAutoStopTimer);
            state.gridButtonAutoStopTimer = null;
        }

        // Set CSS variable untuk warna
        const color = CONFIG.COLOR[type] || '#f85149';
        document.documentElement.style.setProperty('--alarm-color', color);

        // Cari tombol grid
        const btnMap = { fire: 'fireBtn', medical: 'medicalBtn', crime: 'securityBtn', disaster: 'disasterBtn' };
        const btn = document.getElementById(btnMap[type]);

        if (btn) {
            btn.classList.add('grid-alarm-active');
            const st = btn.querySelector('.play-status');
            if (st) st.textContent = '🔊 Alarm Berbunyi — Tap untuk matikan';
        } else {
            log('Button tidak ditemukan untuk type:', type, '(mungkin di halaman tanpa grid)');
        }

        // Play audio loop
        playEmergencyLoop(type);

        // Start vibrate loop
        startVibrateLoop(() => {
            return state.gridButtonState === 'TESTING_ACTIVE' || state.gridButtonState === 'EMERGENCY_ACTIVE';
        });

        // ✅ Auto-stop timer
        // - Testing: 20 detik
        // - Emergency: 60 detik (3×20s)
        const autoStopMs = (mode === 'testing')
            ? CONFIG.TESTING_AUTO_STOP_MS
            : CONFIG.EMERGENCY_AUTO_STOP_MS;

        state.gridButtonAutoStopTimer = setTimeout(() => {
            log('AUTO-STOP triggered after', autoStopMs / 1000, 's');
            dismissGridButtonAlarm(false); // false = auto (bukan user tap)
        }, autoStopMs);

        // Broadcast ke tab lain
        if (!fromBroadcast) {
            broadcastEmergency('grid_alarm_start', { alarmType: type, mode: mode });
        }

        // Toast
        if (!fromBroadcast) {
            if (mode === 'testing') {
                showToast('🧪 Mode Testing', 'Tap tombol lagi untuk stop — auto-stop ' + (autoStopMs / 1000) + 's', 'fa-flask');
            }
            // Emergency mode: tidak ada toast karena sudah ada notif sendiri
        }
    }

    function _stopGridButtonAlarmInternal() {
        if (state.gridButtonState === 'IDLE') return;

        const type = state.gridButtonAlarmType;
        const btnMap = { fire: 'fireBtn', medical: 'medicalBtn', crime: 'securityBtn', disaster: 'disasterBtn' };
        const btn = type ? document.getElementById(btnMap[type]) : null;

        if (btn) {
            btn.classList.remove('grid-alarm-active');
            const st = btn.querySelector('.play-status');
            if (st) {
                // Update status text berdasarkan jumlah emergency aktif
                const ems = getActiveEmergencies();
                const count = ems.filter(e => e.type === type).length;
                st.textContent = count > 0 ? '🔔 ' + count + ' Notifikasi' : '▶ Tap untuk Alarm';
            }
        }

        // Stop audio
        stopEmergencyLoop();

        // Stop vibrate
        stopVibrateLoop();

        // Clear auto-stop timer
        if (state.gridButtonAutoStopTimer) {
            clearTimeout(state.gridButtonAutoStopTimer);
            state.gridButtonAutoStopTimer = null;
        }

        // Reset state
        state.gridButtonState = 'IDLE';
        state.gridButtonAlarmType = null;
        state.gridButtonAlarmStartTime = 0;
        state.gridButtonMode = null;
    }

    /**
     * Handle tap tombol grid (dipanggil dari dashboard.html / halaman lain)
     * - Tap 1x → mulai alarm testing
     * - Tap 2x → stop alarm
     * - Tap tipe beda → ganti tipe
     */
    function handleGridButtonTap(type) {
        log('handleGridButtonTap:', type, 'current state:', state.gridButtonState, 'active type:', state.gridButtonAlarmType);

        // CASE 1: IDLE → mulai testing
        if (state.gridButtonState === 'IDLE') {
            _startGridButtonAlarm(type, 'testing', false);
            return;
        }

        // CASE 2: Aktif dengan TIPE SAMA → dismiss (user tap 2x)
        if (state.gridButtonState !== 'IDLE' && state.gridButtonAlarmType === type) {
            log('Same type → dismiss');
            dismissGridButtonAlarm(true); // true = manual tap
            return;
        }

        // CASE 3: Aktif dengan TIPE BEDA → ganti tipe
        if (state.gridButtonState !== 'IDLE' && state.gridButtonAlarmType !== type) {
            log('Different type → switch from', state.gridButtonAlarmType, 'to', type);
            // Stop yang lama
            _stopGridButtonAlarmInternal();
            // Mulai yang baru (mode mengikuti state sebelumnya)
            setTimeout(() => {
                const newMode = (state.gridButtonMode === 'emergency') ? 'emergency' : 'testing';
                _startGridButtonAlarm(type, newMode, false);
            }, 100);
            return;
        }
    }

    /**
     * Dismiss alarm grid
     * @param {boolean} userAction - true kalau user tap, false kalau auto-stop
     */
    function dismissGridButtonAlarm(userAction) {
        if (state.gridButtonState === 'IDLE') return;

        log('dismissGridButtonAlarm - userAction:', userAction, 'type:', state.gridButtonAlarmType);

        const type = state.gridButtonAlarmType;

        // Stop internal
        _stopGridButtonAlarmInternal();

        // Broadcast ke tab lain
        broadcastEmergency('grid_alarm_stop', { alarmType: type });

        // Toast
        if (userAction === true) {
            showToast('✅ Alarm Dimatikan', 'Alarm berhasil dihentikan', 'fa-check-circle');
        } else if (userAction === false) {
            // Auto-stop
            showToast('⏱️ Auto-Stop', 'Alarm berhenti otomatis setelah durasi selesai', 'fa-clock');
        }

        // Play regular sound sebagai feedback
        if (userAction === true) {
            setTimeout(() => playRegularSound(), 200);
        }
    }

    /**
     * Trigger alarm grid setelah POSTING postingan khusus
     * Mode: emergency (60 detik)
     */
    function triggerGridAlarmFromPost(type, isSender) {
        log('triggerGridAlarmFromPost:', type, 'isSender:', isSender);

        if (!type || !CONFIG.AUDIO[type]) {
            logWarn('Invalid type for post trigger:', type);
            return;
        }

        // Kalau mode standby → full screen alarm (skip grid button)
        if (isStandbyMode() && !state.fullScreenAlarmActive) {
            const em = {
                id: 'post-' + Date.now(),
                type: type,
                sender: (state.currentUser && state.currentUser.fullName) || 'Anda',
                location: isSender ? 'Postingan Anda' : 'Lokasi tidak diketahui',
                address: '',
                coords: '',
                timestamp: Date.now()
            };
            showFullScreenAlarm(em);
            return;
        }

        // Mode aktif → grid button alarm dengan mode 'emergency'
        // Kalau ada alarm testing aktif → stop dulu
        if (state.gridButtonState !== 'IDLE') {
            _stopGridButtonAlarmInternal();
        }

        // Start emergency mode
        _startGridButtonAlarm(type, 'emergency', false);

        // Toast
        const label = CONFIG.LABELS[type] || 'Darurat';
        if (isSender) {
            showToast('✅ ' + label + ' Terkirim', 'Postingan Anda tersebar ke semua user', 'fa-check-circle');
        } else {
            showToast('🚨 ' + label, 'Emergency baru terdeteksi', 'fa-exclamation-triangle');
        }
    }

    // ================================================================
    // FULL SCREEN ALARM
    // ================================================================
    function ensureFullScreenAlarmDOM() {
        if (document.getElementById('salinkFullScreenAlarm')) return;

        const div = document.createElement('div');
        div.id = 'salinkFullScreenAlarm';
        div.className = 'salink-full-screen-alarm';
        div.innerHTML = `
            <div class="salink-alarm-badge">🚨 LIVE EMERGENCY</div>
            <div class="salink-alarm-audio-indicator">
                <i class="fas fa-volume-up"></i>
                <span>ALARM AKTIF — Swipe untuk mematikan</span>
            </div>
            <div class="salink-alarm-icon-wrapper">
                <div class="salink-alarm-icon" id="salinkAlarmIcon">🔥</div>
            </div>
            <div class="salink-alarm-title" id="salinkAlarmTitle">KEBAKARAN</div>
            <div class="salink-alarm-subtitle" id="salinkAlarmSubtitle">⚠️ Darurat! Segera ambil tindakan</div>
            <div class="salink-alarm-info">
                <div class="salink-alarm-info-item"><i class="fas fa-user"></i><span>Dilaporkan oleh: <strong id="salinkAlarmSender">-</strong></span></div>
                <div class="salink-alarm-info-item"><i class="fas fa-map-marker-alt"></i><span id="salinkAlarmLocation">-</span></div>
                <div class="salink-alarm-info-item" id="salinkAlarmAddressRow" style="display:none;"><i class="fas fa-map-pin"></i><span id="salinkAlarmAddress">-</span></div>
                <div class="salink-alarm-info-item" id="salinkAlarmCoordsRow" style="display:none;"><i class="fas fa-crosshairs"></i><span id="salinkAlarmCoords">-</span></div>
                <div class="salink-alarm-info-item"><i class="fas fa-clock"></i><span id="salinkAlarmTime">-</span></div>
            </div>
            <div class="salink-alarm-instruction">Alarm berbunyi terus menerus.<br>Swipe ke arah manapun untuk mematikan.</div>
            <button class="salink-btn-detail" id="salinkAlarmDetailBtn">
                   <i class="fas fa-info-circle"></i>
                   <span>Detail Emergency</span>
            </button>
            <div class="salink-swipe-indicator">
                <span class="salink-swipe-text">Swipe untuk mematikan</span>
                <div class="salink-swipe-arrows">
                    <i class="fas fa-chevron-up"></i>
                    <i class="fas fa-chevron-down"></i>
                    <i class="fas fa-chevron-left"></i>
                    <i class="fas fa-chevron-right"></i>
                    <i class="fas fa-bell salink-center-icon"></i>
                </div>
            </div>
            <div class="salink-swipe-feedback" id="salinkSwipeFeedback"></div>
        `;
        document.body.appendChild(div);
    }

    function showFullScreenAlarm(em) {
        ensureFullScreenAlarmDOM();
        const alarm = document.getElementById('salinkFullScreenAlarm');
        if (!alarm) return;
        if (isDismissed(em.id)) return;
        if (state.fullScreenAlarmActive) return;

        const type = em.type || 'fire';
        const icon = CONFIG.ICONS[type] || '🚨';
        const label = CONFIG.LABELS[type] || 'DARURAT';
        const cssClass = CONFIG.CSS_CLASS[type] || 'fire';

        document.getElementById('salinkAlarmIcon').textContent = icon;
        document.getElementById('salinkAlarmTitle').textContent = CONFIG.SHORT_LABELS[type] || 'DARURAT';
        document.getElementById('salinkAlarmSender').textContent = em.sender || 'User';
        document.getElementById('salinkAlarmLocation').textContent = em.location || '-';
        document.getElementById('salinkAlarmTime').textContent = formatDate(em.timestamp || Date.now());

        const addrRow = document.getElementById('salinkAlarmAddressRow');
        const addrEl = document.getElementById('salinkAlarmAddress');
        if (em.address && em.address !== em.location) {
            addrRow.style.display = 'flex';
            addrEl.textContent = em.address;
        } else {
            addrRow.style.display = 'none';
        }

        const coordsRow = document.getElementById('salinkAlarmCoordsRow');
        const coordsEl = document.getElementById('salinkAlarmCoords');
        if (em.coords) {
            coordsRow.style.display = 'flex';
            coordsEl.textContent = em.coords;
        } else {
            coordsRow.style.display = 'none';
        }

        alarm.className = 'salink-full-screen-alarm active ' + cssClass;
        state.fullScreenAlarmActive = true;
        state.fullScreenAlarmEmergency = em;
        alarm.dataset.emergencyId = em.id || '';
        document.body.style.overflow = 'hidden';

        playEmergencyLoop(type);
        startVibrateLoop(() => state.fullScreenAlarmActive);

        setupFullScreenAlarmSwipe();

        // ✅ Tombol Detail Emergency
const detailBtn = document.getElementById('salinkAlarmDetailBtn');
if (detailBtn) {
    detailBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (em.id) {
            // Simpan ID, tutup alarm, lalu redirect
            const targetUrl = 'detail-emergency.html?id=' + encodeURIComponent(em.id);
            console.log('🔗 [FullScreenAlarm] Redirect ke:', targetUrl);
            window.location.href = targetUrl;
        } else {
            showToast('⚠️ Error', 'ID emergency tidak tersedia', 'fa-exclamation-triangle');
        }
    };
}
        if (em.id) {
            state.readNotifs[em.id] = true;
            saveReadNotifs();
        }

        log('Full screen alarm ACTIVE:', type, em.id);
    }

    function dismissFullScreenAlarm(userAction) {
        if (!state.fullScreenAlarmActive) return;

        const alarm = document.getElementById('salinkFullScreenAlarm');
        const emergencyId = alarm ? alarm.dataset.emergencyId : null;

        if (emergencyId) dismissEmergency(emergencyId);

        if (alarm) {
            alarm.classList.remove('active', 'fire', 'medical', 'crime', 'disaster');
            alarm.dataset.emergencyId = '';
        }

        document.body.style.overflow = '';
        stopVibrateLoop();
        stopEmergencyLoop();
        hideFloatingNotification();

        state.fullScreenAlarmActive = false;
        state.fullScreenAlarmEmergency = null;

        // Broadcast ke tab lain
        broadcastEmergency('full_screen_dismiss', { id: emergencyId });

        if (userAction !== false) {
            showToast('✅ Alarm Dimatikan', 'Anda telah mengonfirmasi notifikasi darurat', 'fa-check-circle');
            setTimeout(() => playRegularSound(), 200);
        }

        log('Full screen alarm dismissed');
    }

    function _dismissFullScreenAlarmInternal() {
        // Internal dismiss tanpa broadcast (untuk terima broadcast dari tab lain)
        if (!state.fullScreenAlarmActive) return;

        const alarm = document.getElementById('salinkFullScreenAlarm');
        const emergencyId = alarm ? alarm.dataset.emergencyId : null;
        if (emergencyId) dismissEmergency(emergencyId);

        if (alarm) {
            alarm.classList.remove('active', 'fire', 'medical', 'crime', 'disaster');
            alarm.dataset.emergencyId = '';
        }
        document.body.style.overflow = '';
        stopVibrateLoop();
        stopEmergencyLoop();
        hideFloatingNotification();
        state.fullScreenAlarmActive = false;
        state.fullScreenAlarmEmergency = null;
    }

    function setupFullScreenAlarmSwipe() {
        const alarm = document.getElementById('salinkFullScreenAlarm');
        if (!alarm || alarm._swipeSetup) return;
        alarm._swipeSetup = true;

        const feedback = document.getElementById('salinkSwipeFeedback');
        let startX = 0, startY = 0, moving = false;

        const showFeedback = (dir) => {
            if (!feedback) return;
            const icons = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
            feedback.textContent = icons[dir] || '✅';
            feedback.classList.add('active');
            setTimeout(() => feedback.classList.remove('active'), 300);
        };

        alarm.addEventListener('touchstart', (e) => {
            if (!state.fullScreenAlarmActive) return;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            moving = true;
        }, { passive: true });

        alarm.addEventListener('touchmove', (e) => {
            if (!moving || !state.fullScreenAlarmActive) return;
            e.preventDefault();
        }, { passive: false });

        alarm.addEventListener('touchend', (e) => {
            if (!moving || !state.fullScreenAlarmActive) return;
            moving = false;
            const t = e.changedTouches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < CONFIG.SWIPE_MIN_DISTANCE) return;

            let dir = 'up';
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
            else dir = dy > 0 ? 'down' : 'up';

            showFeedback(dir);
            if (navigator.vibrate) navigator.vibrate(100);
            setTimeout(() => dismissFullScreenAlarm(true), 150);
        }, { passive: true });

        // Mouse (desktop)
        let md = false, mx = 0, my = 0;
        alarm.addEventListener('mousedown', (e) => {
            if (!state.fullScreenAlarmActive) return;
            md = true; mx = e.clientX; my = e.clientY;
        });
        alarm.addEventListener('mouseup', (e) => {
            if (!md || !state.fullScreenAlarmActive) return;
            md = false;
            const dx = e.clientX - mx, dy = e.clientY - my;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < CONFIG.SWIPE_MIN_DISTANCE) return;
            let dir = 'up';
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
            else dir = dy > 0 ? 'down' : 'up';
            showFeedback(dir);
            setTimeout(() => dismissFullScreenAlarm(true), 150);
        });

        // Tap icon wrapper juga dismiss
        const iconWrapper = document.querySelector('#salinkFullScreenAlarm .salink-alarm-icon-wrapper');
        if (iconWrapper) {
            iconWrapper.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.fullScreenAlarmActive) dismissFullScreenAlarm(true);
            });
        }
    }

    // ================================================================
    // FLOATING NOTIFICATION
    // ================================================================
    function ensureFloatingNotificationDOM() {
        if (document.getElementById('salinkFloatingNotification')) return;

        const div = document.createElement('div');
        div.id = 'salinkFloatingNotification';
        div.className = 'salink-floating-notification';
        div.innerHTML = `
            <div class="salink-notif-icon" id="salinkFloatingIcon"><i class="fas fa-bell"></i></div>
            <div class="salink-notif-content">
                <div class="salink-notif-title" id="salinkFloatingTitle">SALINK</div>
                <div class="salink-notif-message" id="salinkFloatingMessage">Emergency Alert System</div>
                <div class="salink-notif-subtitle" id="salinkFloatingSubtitle"></div>
            </div>
            <button class="salink-notif-action" id="salinkFloatingAction">Lihat</button>
            <button class="salink-notif-close" id="salinkFloatingClose"><i class="fas fa-times"></i></button>
        `;
        document.body.appendChild(div);
    }

    function showFloatingNotification(type, title, message, subtitle, actionText, actionCallback) {
        ensureFloatingNotificationDOM();
        const notif = document.getElementById('salinkFloatingNotification');
        const icon = document.getElementById('salinkFloatingIcon');
        if (!notif) return;

        icon.className = 'salink-notif-icon ' + type;
        if (type === 'emergency') icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        else if (type === 'install') icon.innerHTML = '<i class="fas fa-download"></i>';
        else icon.innerHTML = '<i class="fas fa-bell"></i>';

        document.getElementById('salinkFloatingTitle').textContent = title;
        document.getElementById('salinkFloatingMessage').textContent = message;
        document.getElementById('salinkFloatingSubtitle').textContent = subtitle ||
            new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        const actionBtn = document.getElementById('salinkFloatingAction');
        if (actionText && actionCallback) {
            actionBtn.style.display = 'block';
            actionBtn.textContent = actionText;
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                actionCallback();
            };
        } else {
            actionBtn.style.display = 'none';
        }

        document.getElementById('salinkFloatingClose').onclick = (e) => {
            e.stopPropagation();
            hideFloatingNotification();
        };

        if (type === 'emergency') {
            notif.classList.add('emergency-notif');
        } else {
            notif.classList.remove('emergency-notif');
        }

        notif.onclick = () => {
            if (actionCallback) actionCallback();
        };

        notif.classList.add('active');
    }

    function hideFloatingNotification() {
        const notif = document.getElementById('salinkFloatingNotification');
        if (notif) {
            notif.classList.remove('active');
            notif.classList.add('hide');
            setTimeout(() => notif.classList.remove('hide'), 500);
        }
    }

    function showFloatingEmergency(em) {
        const type = em.type || 'fire';
        const icon = CONFIG.ICONS[type] || '🚨';
        const label = CONFIG.LABELS[type] || 'DARURAT';

        showFloatingNotification('emergency',
            icon + ' ' + label,
            (em.sender || 'User') + ' melaporkan darurat',
            '📍 ' + (em.location || 'Lokasi tidak diketahui'),
            'Lihat',
            () => {
                if (em.id) {
                    window.location.href = 'detail-emergency.html?id=' + encodeURIComponent(em.id);
                }
            }
        );

        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);
        showToast('🚨 ' + label, (em.sender || 'User') + ' melaporkan darurat!', 'fa-exclamation-triangle');
    }

    function dismissFloatingEmergency() {
        stopButtonLoopInternal();
        hideFloatingNotification();
        if (navigator.vibrate) navigator.vibrate(0);
    }

    // Helper: cleanup button loop (legacy compat)
    function stopButtonLoopInternal() {
        if (state.gridButtonState !== 'IDLE') {
            _stopGridButtonAlarmInternal();
        }
    }

    // ================================================================
    // TOAST
    // ================================================================
    function showToast(title, message, icon) {
        icon = icon || 'fa-info-circle';

        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Remove existing toasts
        container.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = 'toast active';
        toast.innerHTML =
            '<div class="toast-icon"><i class="fas ' + icon + '"></i></div>' +
            '<div class="toast-content">' +
                '<div class="toast-title">' + escapeHTML(title) + '</div>' +
                '<div class="toast-message">' + escapeHTML(message) + '</div>' +
            '</div>' +
            '<button class="toast-close"><i class="fas fa-times"></i></button>';

        toast.querySelector('.toast-close').onclick = () => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 400);
        };

        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 400);
        }, 5000);
    }

    // ================================================================
    // API CALL
    // ================================================================
    async function apiCall(action, data) {
        data = data || {};
        try {
            if (action.indexOf('get_') === 0) {
                const params = new URLSearchParams(Object.assign({ action: action, timestamp: Date.now() }, data));
                const response = await fetch(CONFIG.API_URL + '?' + params.toString(), {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store'
                });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return await response.json();
            } else {
                const response = await fetch(CONFIG.API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: action, data: data, timestamp: Date.now() })
                });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return await response.json();
            }
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    async function apiGetNotifications() {
        const r = await apiCall('get_notifications');
        return r.status === 'success' && Array.isArray(r.data) ? r.data.map(adaptNotification) : [];
    }

    function adaptNotification(n) {
        return {
            id: n.id || 'notif-' + Date.now(),
            type: n.type || 'info',
            title: n.title || 'Notifikasi',
            message: n.message || n.text || '',
            sender: n.sender || 'Sistem',
            senderUsername: n.senderUsername || '',
            link: n.link || '',
            postId: n.postId || '',
            timestamp: n.timestamp ? new Date(n.timestamp).getTime() : Date.now(),
            read: n.read === 'TRUE' || n.read === true || n.read === 'true',
            soundKey: n.soundKey || ''
        };
    }

    // ================================================================
    // TRIGGER EMERGENCY FROM NOTIFICATION
    // ================================================================
    function triggerEmergencyFromNotification(notif) {
        if (!notif) return;
        if (isDismissed(notif.id)) return;

        const em = {
            id: notif.id,
            type: notif.type,
            sender: notif.sender || 'User',
            senderUsername: notif.senderUsername || '',
            location: notif.message || 'Lokasi tidak diketahui',
            address: notif.message || '',
            text: notif.message || '',
            mapsURL: '',
            coords: '',
            timestamp: notif.timestamp,
            expiresAt: notif.timestamp + CONFIG.EMERGENCY_DURATION
        };

        // Simpan ke localStorage
        let ems = JSON.parse(localStorage.getItem('salink_emergencies') || '[]');
        if (!ems.find(e => e.id === em.id)) {
            ems.unshift(em);
            try {
                localStorage.setItem('salink_emergencies', JSON.stringify(ems));
            } catch(e) {}
        }

        // ✅ PILIH MODE
        if (isStandbyMode()) {
            log('STANDBY → full screen alarm');
            showFullScreenAlarm(em);
        } else {
            log('AKTIF → floating + grid alarm');
            // Tampilkan floating notif
            showFloatingEmergency(em);
            // Trigger grid alarm mode emergency (60 detik)
            triggerGridAlarmFromPost(notif.type, false);
        }
    }

    function detectNewEmergencyNotifications(notifs) {
        if (!notifs || notifs.length === 0) return null;

        const lastCheck = parseInt(localStorage.getItem('salink_last_emergency_check_global') || '0');
        const now = Date.now();

        const newEmergencyNotifs = notifs.filter(n => {
            const isEmergencyType = ['fire', 'medical', 'crime', 'disaster'].indexOf(n.type) !== -1;
            if (!isEmergencyType) return false;
            if (state.readNotifs[n.id]) return false;
            if (isDismissed(n.id)) return false;
            return (n.timestamp || 0) > lastCheck;
        });

        if (newEmergencyNotifs.length === 0) {
            localStorage.setItem('salink_last_emergency_check_global', String(now));
            return null;
        }

        newEmergencyNotifs.sort((a, b) => b.timestamp - a.timestamp);
        const latest = newEmergencyNotifs[0];

        // Skip kalau user sendiri yang posting
        if (state.currentUser && latest.senderUsername === state.currentUser.username) {
            state.readNotifs[latest.id] = true;
            saveReadNotifs();
            localStorage.setItem('salink_last_emergency_check_global', String(now));
            return null;
        }

        localStorage.setItem('salink_last_emergency_check_global', String(now));
        return latest;
    }

    // ================================================================
    // POLLING
    // ================================================================
    function startEmergencyPolling() {
        if (state.emergencyPollTimer) clearInterval(state.emergencyPollTimer);

        // Cek langsung saat init
        checkEmergencyNow();

        state.emergencyPollTimer = setInterval(() => {
            // Skip saat alarm aktif
            if (state.fullScreenAlarmActive) return;
            if (state.gridButtonState === 'EMERGENCY_ACTIVE') return;
            if (document.hidden) return;
            checkEmergencyNow();
        }, CONFIG.POLL_INTERVAL);

        log('Emergency polling started (' + (CONFIG.POLL_INTERVAL / 1000) + 's)');
    }

    async function checkEmergencyNow() {
        try {
            const notifs = await apiGetNotifications();
            if (notifs && notifs.length > 0) {
                const newEmergency = detectNewEmergencyNotifications(notifs);
                if (newEmergency) {
                    log('New emergency detected:', newEmergency.type, newEmergency.id);
                    triggerEmergencyFromNotification(newEmergency);
                }
            }
        } catch(e) {
            logWarn('Polling error:', e.message);
        }
    }

    // ================================================================
    // VISIBILITY DETECTION
    // ================================================================
    function setupVisibilityDetection() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                resetIdleTimer();

                // Cek emergency yang belum di-dismiss saat tab kembali visible
                const ems = getActiveEmergencies();
                const undismissed = ems.find(e => !isDismissed(e.id) && !state.readNotifs[e.id]);
                if (undismissed && !state.fullScreenAlarmActive) {
                    setTimeout(() => showFullScreenAlarm(undismissed), 500);
                }
            } else {
                state.isIdleStandby = true;
            }
        });
    }

    // ================================================================
    // EMERGENCY BUTTONS SETUP
    // ================================================================
    function setupEmergencyButtons() {
        const btnMap = {
            'fireBtn': 'fire',
            'medicalBtn': 'medical',
            'securityBtn': 'crime',
            'disasterBtn': 'disaster'
        };

        let count = 0;
        Object.keys(btnMap).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn) return;

            // Skip kalau sudah ada handler dari dashboard.html
            if (btn._salinkEmergencySetup) return;
            btn._salinkEmergencySetup = true;

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                // Cek login
                if (localStorage.getItem('salink_logged_in') !== 'true') {
                    showToast('🔒 Login Diperlukan', 'Silakan login dulu untuk mengakses alarm', 'fa-lock');
                    return;
                }

                const type = btnMap[btnId];

                // Kalau full screen alarm aktif → dismiss
                if (state.fullScreenAlarmActive) {
                    dismissFullScreenAlarm(true);
                    return;
                }

                // Handle tap grid button (state machine)
                handleGridButtonTap(type);
            });

            count++;
        });

        log('Emergency buttons setup:', count);
    }

    // ================================================================
    // INIT
    // ================================================================
    function init() {
        if (state.initialized) return;
        state.initialized = true;

        log('Initializing...');

        // Load user
        try {
            const userData = localStorage.getItem('salink_user');
            if (userData) state.currentUser = JSON.parse(userData);
        } catch(e) {}

        // Cek login
        const isLoggedIn = localStorage.getItem('salink_logged_in') === 'true';
        if (!isLoggedIn || !state.currentUser) {
            log('User belum login — skip emergency polling');
            return;
        }

        // Inject styles
        injectStyles();

        // Load storage
        loadReadNotifs();
        loadDismissed();

        // Preload audio
        preloadAllAudio();

        // Setup detection
        setupIdleDetection();
        setupVisibilityDetection();

        // Setup cross-tab sync
        setupCrossTabSync();

        // Setup emergency buttons
        setupEmergencyButtons();

        // Start polling
        startEmergencyPolling();

        state.lastNotifCheck = parseInt(localStorage.getItem('salink_last_emergency_check_global') || '0');

        log('✅ Initialized — polling every ' + (CONFIG.POLL_INTERVAL / 1000) + 's');
        log('   Testing auto-stop: ' + (CONFIG.TESTING_AUTO_STOP_MS / 1000) + 's');
        log('   Emergency auto-stop: ' + (CONFIG.EMERGENCY_AUTO_STOP_MS / 1000) + 's');
    }

    // Auto-init saat DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-setup saat DOM berubah (untuk SPA / dynamic content)
    let setupTimeout = null;
    const observer = new MutationObserver(() => {
        if (setupTimeout) clearTimeout(setupTimeout);
        setupTimeout = setTimeout(() => {
            if (state.initialized) setupEmergencyButtons();
        }, 500);
    });
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            observer.observe(document.body, { childList: true, subtree: true });
        }, 1000);
    });

    // ================================================================
    // EXPOSE PUBLIC API
    // ================================================================
    window.SalinkEmergency = {
        // Core
        init: init,
        showAlarm: showFullScreenAlarm,
        dismissAlarm: dismissFullScreenAlarm,
        showFloating: showFloatingEmergency,
        dismissFloating: dismissFloatingEmergency,

        // Grid button
        handleGridButtonTap: handleGridButtonTap,
        dismissGridButtonAlarm: dismissGridButtonAlarm,
        triggerGridAlarmFromPost: triggerGridAlarmFromPost,

        // Audio
        playRegular: playRegularSound,
        playEmergency: playEmergencyLoop,
        stopEmergency: stopEmergencyLoop,

        // Utils
        isStandbyMode: isStandbyMode,
        config: CONFIG,
        state: state
    };

    log('✅ Script loaded — Public API: window.SalinkEmergency');
    log('   Grid tap: SalinkEmergency.handleGridButtonTap(type)');
    log('   Post trigger: SalinkEmergency.triggerGridAlarmFromPost(type, isSender)');
    log('   Dismiss: SalinkEmergency.dismissGridButtonAlarm(true)');
})();
