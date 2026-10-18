/* ====================================================================
 * SALINK EMERGENCY ALERT — UNIVERSAL CLIENT v4.0 (SUPABASE EDITION)
 * ====================================================================
 * FITUR:
 * ✅ Anti-Autoplay Block (Paksa suara nyala saat tombol ditekan)
 * ✅ State machine tombol grid (IDLE / TESTING_ACTIVE / EMERGENCY_ACTIVE)
 * ✅ Auto-stop timer (Testing 20s, Notif User Lain 60s)
 * ✅ Animasi: Floating, Pulse, Zoom in/out, Shake, Getar
 * ✅ Swipe layar kunci (Full Screen Alarm) & Tap tombol untuk matikan
 * ✅ Koneksi Database Supabase (Notifikasi & Postingan Darurat)
 * ==================================================================== */

(function() {
    'use strict';

    // ================================================================
    // 1. KONFIGURASI
    // ================================================================
    const CONFIG = {
        // Waktu & Durasi
        POLL_INTERVAL: 15000,                       // Cek DB tiap 15 detik
        IDLE_THRESHOLD_MS: 30000,                   // 30 detik tanpa interaksi = Standby
        EMERGENCY_DURATION: 24 * 60 * 60 * 1000,    // Data darurat valid 24 jam
        
        // Durasi Auto-Stop Alarm
        TESTING_AUTO_STOP_MS: 20000,                // 20 detik (Testing Tombol)
        EMERGENCY_AUTO_STOP_MS: 60000,              // 60 detik (Dari User Lain)
        
        VIBRATE_INTERVAL_MS: 2000,                  // Getar tiap 2 detik
        SWIPE_MIN_DISTANCE: 50,                     // Minimal swipe 50px

        // Asset Audio (Pastikan file ada di folder /Music/)
        AUDIO: {
            'fire':     '/Music/Kebakaran.mp3',
            'medical':  '/Music/kematian.mp3',
            'crime':    '/Music/pencurian.mp3',
            'disaster': '/Music/bencana_tsunami.mp3'
        },
        REGULAR_AUDIO: '/Music/smsblackber_4a537f155087133.mp3',

        // Label & Warna
        LABELS: {
            'fire': '🔥 Kebakaran', 'medical': '🚑 Medis & Kematian',
            'crime': '🚓 Kriminal', 'disaster': '🌪️ Bencana Alam'
        },
        SHORT_LABELS: {
            'fire': 'KEBAKARAN', 'medical': 'MEDIS',
            'crime': 'KRIMINAL', 'disaster': 'BENCANA'
        },
        ICONS: {
            'fire': '🔥', 'medical': '🚑', 'crime': '🚓', 'disaster': '🌪️'
        },
        CSS_CLASS: {
            'fire': 'fire', 'medical': 'medical', 'crime': 'crime', 'disaster': 'disaster'
        },
        COLOR: {
            'fire': '#f85149', 'medical': '#4fc3f7', 'crime': '#f0d080', 'disaster': '#c792ea'
        }
    };

    // ================================================================
    // 2. STATE GLOBAL
    // ================================================================
    const state = {
        initialized: false,
        currentUser: null,
        
        // Audio
        audioCache: {},
        audioUnlocked: false,
        emergencyAudioLoop: null,
        
        // Timer & Vibration
        emergencyVibrateTimer: null,
        idleTimer: null,
        isIdleStandby: false,
        
        // State Alarm
        fullScreenAlarmActive: false,
        fullScreenAlarmEmergency: null,
        
        // State Grid Button
        gridButtonState: 'IDLE', // IDLE | TESTING_ACTIVE | EMERGENCY_ACTIVE
        gridButtonAlarmType: null,
        gridButtonMode: null,
        gridButtonAutoStopTimer: null,
        
        // Supabase & Sync
        syncChannel: null,
        lastEmergencyCheck: parseInt(localStorage.getItem('salink_last_emergency_check_v4') || '0')
    };

    // ================================================================
    // 3. UTILITY FUNCTIONS
    // ================================================================
    function log() { console.log.apply(console, ['🚨 [SalinkEmergency v4]'].concat(Array.from(arguments))); }
    function logWarn() { console.warn.apply(console, ['⚠️ [SalinkEmergency v4]'].concat(Array.from(arguments))); }
    
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    
    function formatDate(ts) {
        if (!ts) return '-';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // ================================================================
    // 4. AUDIO SYSTEM (ANTI-BLOKIR BROWSER)
    // ================================================================
    function unlockAudio() {
        if (state.audioUnlocked) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
            state.audioUnlocked = true;
            log('Audio Context Unlocked');
        } catch(e) { logWarn('Unlock Audio failed:', e.message); }
    }

    // Pancing unlock saat user sentuh layar
    ['click', 'touchstart', 'keydown'].forEach(evt => {
        document.addEventListener(evt, unlockAudio, { once: true, passive: true });
    });

    function preloadAllAudio() {
        Object.keys(CONFIG.AUDIO).forEach(type => {
            try {
                const audio = new Audio(CONFIG.AUDIO[type]);
                audio.preload = 'auto';
                audio.volume = 1.0;
                state.audioCache[type] = audio;
            } catch(e) {}
        });
        try {
            const regAudio = new Audio(CONFIG.REGULAR_AUDIO);
            regAudio.preload = 'auto';
            state.audioCache['regular'] = regAudio;
        } catch(e) {}
    }

    function playEmergencyLoop(type) {
        try {
            unlockAudio();
            const url = CONFIG.AUDIO[type];
            if (!url) return;

            stopEmergencyLoop();

            // Paksa putar audio baru (mengatasi cache browser)
            const audio = new Audio(url);
            audio.volume = 1.0;
            audio.loop = true;
            state.emergencyAudioLoop = audio;

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => log('Emergency audio playing:', type))
                           .catch(err => logWarn('Audio play blocked:', err.message));
            }
        } catch(e) { logWarn('playEmergencyLoop error:', e.message); }
    }

    function stopEmergencyLoop() {
        if (state.emergencyAudioLoop) {
            try {
                state.emergencyAudioLoop.pause();
                state.emergencyAudioLoop.currentTime = 0;
            } catch(e) {}
            state.emergencyAudioLoop = null;
        }
        if (state.gridButtonAutoStopTimer) {
            clearTimeout(state.gridButtonAutoStopTimer);
            state.gridButtonAutoStopTimer = null;
        }
    }

    function playRegularSound() {
        try {
            unlockAudio();
            const audio = new Audio(CONFIG.REGULAR_AUDIO);
            audio.volume = 1.0;
            audio.play().catch(() => {});
        } catch(e) {}
    }

    // ================================================================
    // 5. VIBRATE SYSTEM
    // ================================================================
    function startVibrateLoop() {
        stopVibrateLoop();
        if (!navigator.vibrate) return;
        navigator.vibrate([500, 200, 500, 200, 500]);
        state.emergencyVibrateTimer = setInterval(() => {
            if (state.gridButtonState !== 'IDLE' || state.fullScreenAlarmActive) {
                navigator.vibrate([500, 200, 500, 200, 500]);
            }
        }, CONFIG.VIBRATE_INTERVAL_MS);
    }

    function stopVibrateLoop() {
        if (state.emergencyVibrateTimer) clearInterval(state.emergencyVibrateTimer);
        if (navigator.vibrate) navigator.vibrate(0);
    }

    // ================================================================
    // 6. STANDBY MODE DETECTOR
    // ================================================================
    function isStandbyMode() {
        return document.hidden || state.isIdleStandby;
    }

    function setupIdleDetection() {
        const reset = () => {
            state.isIdleStandby = false;
            if (state.idleTimer) clearTimeout(state.idleTimer);
            state.idleTimer = setTimeout(() => { state.isIdleStandby = true; }, CONFIG.IDLE_THRESHOLD_MS);
        };
        ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'visibilitychange'].forEach(evt => {
            document.addEventListener(evt, () => { if (!document.hidden) reset(); }, { passive: true });
        });
        reset();
    }

    // ================================================================
    // 7. CSS INJECTION (ANIMASI & UI)
    // ================================================================
    function injectStyles() {
        if (document.getElementById('salink-emergency-styles')) return;
        const style = document.createElement('style');
        style.id = 'salink-emergency-styles';
        style.textContent = `
            /* === ANIMASI TOMBOL GRID === */
            .emergency-btn.grid-alarm-active {
                border-color: var(--alarm-color, #f85149) !important;
                box-shadow: 0 0 40px rgba(248, 81, 73, 0.6) !important;
                animation: salinkGridFloat 2s ease-in-out infinite, salinkGridZoom 1.2s ease-in-out infinite !important;
                z-index: 10 !important;
            }
            .emergency-btn.grid-alarm-active .btn-content {
                animation: salinkGridShake 0.6s ease-in-out infinite, salinkGridBlink 1s ease-in-out infinite !important;
            }
            .emergency-btn.grid-alarm-active .play-status {
                color: var(--alarm-color, #f85149) !important; font-weight: 800 !important;
            }
            @keyframes salinkGridFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
            @keyframes salinkGridZoom { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
            @keyframes salinkGridShake { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-2px, 2px); } 75% { transform: translate(2px, -2px); } }
            @keyframes salinkGridBlink { 0%, 100% { background-color: transparent; } 50% { background-color: rgba(248,81,73,0.15); } }

            /* === FULL SCREEN ALARM === */
            .salink-full-screen-alarm {
                position: fixed; inset: 0; background: #0d1117; z-index: 999999;
                display: none; flex-direction: column; align-items: center; justify-content: center;
                padding: 30px 20px; text-align: center; user-select: none; touch-action: none;
            }
            .salink-full-screen-alarm.active { display: flex; animation: salinkFlash 1s infinite; }
            @keyframes salinkFlash { 0%, 100% { background-color: #0d1117; } 50% { background-color: #4a0000; } }
            @keyframes salinkPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
            @keyframes salinkZoom { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
            
            .salink-full-screen-alarm .salink-alarm-icon-wrapper {
                width: 140px; height: 140px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.05); border: 3px solid var(--alarm-color, #f85149);
                box-shadow: 0 0 60px var(--alarm-color, #f85149); animation: salinkPulse 1s infinite; margin-bottom: 24px;
            }
            .salink-full-screen-alarm .salink-alarm-icon { font-size: 5rem; animation: salinkZoom 1s infinite; }
            .salink-full-screen-alarm .salink-alarm-title {
                font-size: 2.4rem; font-weight: 800; color: var(--alarm-color, #f85149); letter-spacing: 2px;
                text-shadow: 0 0 40px var(--alarm-color, #f85149); margin-bottom: 10px; text-transform: uppercase;
            }
            .salink-swipe-indicator {
                position: absolute; bottom: 40px; display: flex; flex-direction: column; align-items: center;
                padding: 18px 32px; background: rgba(255,255,255,0.06); border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);
            }

            /* === TOAST === */
            .toast-container { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 999999; max-width: 400px; width: 90%; }
            .toast {
                background: rgba(22, 27, 34, 0.98); border: 1px solid #30363d; border-radius: 12px;
                padding: 12px 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
            }
            .toast .toast-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(88,166,255,0.15); color: #58a6ff; }
            .toast .toast-content { flex: 1; }
            .toast .toast-title { font-size: 0.75rem; font-weight: 600; color: #e6edf3; }
            .toast .toast-message { font-size: 0.7rem; color: #8b949e; }
        `;
        document.head.appendChild(style);
    }

    // ================================================================
    // 8. GRID BUTTON STATE MACHINE
    // ================================================================
    function _startGridButtonAlarm(type, mode) {
        log('START grid button:', type, '| Mode:', mode);
        
        state.gridButtonState = (mode === 'emergency') ? 'EMERGENCY_ACTIVE' : 'TESTING_ACTIVE';
        state.gridButtonAlarmType = type;
        state.gridButtonMode = mode;

        const color = CONFIG.COLOR[type] || '#f85149';
        document.documentElement.style.setProperty('--alarm-color', color);

        const btnMap = { fire: 'fireBtn', medical: 'medicalBtn', crime: 'securityBtn', disaster: 'disasterBtn' };
        const btn = document.getElementById(btnMap[type]);
        if (btn) {
            btn.classList.add('grid-alarm-active');
            const st = btn.querySelector('.play-status');
            if (st) st.textContent = '🔊 Alarm Berbunyi — Tap untuk matikan';
        }

        // Bunyikan suara & getar
        playEmergencyLoop(type);
        startVibrateLoop();

        // Auto-stop Timer
        const autoStopMs = (mode === 'testing') ? CONFIG.TESTING_AUTO_STOP_MS : CONFIG.EMERGENCY_AUTO_STOP_MS;
        if (state.gridButtonAutoStopTimer) clearTimeout(state.gridButtonAutoStopTimer);
        state.gridButtonAutoStopTimer = setTimeout(() => {
            dismissGridButtonAlarm(false); // false = Auto-stop
        }, autoStopMs);

        // Toast Mode Testing
        if (mode === 'testing') {
            showToast('🧪 Mode Testing', 'Tap tombol lagi untuk stop — auto-stop ' + (autoStopMs / 1000) + 's', 'fa-flask');
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
            if (st) st.textContent = '▶ Tap untuk Alarm';
        }

        stopEmergencyLoop();
        stopVibrateLoop();

        state.gridButtonState = 'IDLE';
        state.gridButtonAlarmType = null;
        state.gridButtonMode = null;
    }

    function handleGridButtonTap(type) {
        if (state.fullScreenAlarmActive) { dismissFullScreenAlarm(true); return; }

        // Jika IDLE -> Mulai
        if (state.gridButtonState === 'IDLE') {
            _startGridButtonAlarm(type, 'testing');
            return;
        }

        // Jika Tipe SAMA -> Matikan
        if (state.gridButtonAlarmType === type) {
            dismissGridButtonAlarm(true);
            return;
        }

        // Jika Tipe BEDA -> Ganti
        _stopGridButtonAlarmInternal();
        setTimeout(() => _startGridButtonAlarm(type, 'testing'), 100);
    }

    function dismissGridButtonAlarm(userAction) {
        if (state.gridButtonState === 'IDLE') return;
        _stopGridButtonAlarmInternal();

        if (userAction === true) {
            showToast('✅ Alarm Dimatikan', 'Alarm berhasil dihentikan', 'fa-check-circle');
            setTimeout(playRegularSound, 200);
        } else if (userAction === false) {
            showToast('⏱️ Auto-Stop', 'Alarm berhenti otomatis setelah durasi selesai', 'fa-clock');
        }
    }

    function triggerGridAlarmFromPost(type, isSender) {
        if (state.gridButtonState !== 'IDLE') _stopGridButtonAlarmInternal();
        _startGridButtonAlarm(type, 'emergency');

        const label = CONFIG.LABELS[type] || 'Darurat';
        if (isSender) showToast('✅ ' + label + ' Terkirim', 'Postingan tersebar ke semua user', 'fa-check-circle');
        else showToast('🚨 ' + label, 'Emergency baru terdeteksi', 'fa-exclamation-triangle');
    }

    // ================================================================
    // 9. FULL SCREEN ALARM & SWIPE (LAYAR KUNCI)
    // ================================================================
    function ensureFullScreenAlarmDOM() {
        if (document.getElementById('salinkFullScreenAlarm')) return;
        const div = document.createElement('div');
        div.id = 'salinkFullScreenAlarm';
        div.className = 'salink-full-screen-alarm';
        div.innerHTML = `
            <div class="salink-alarm-icon-wrapper"><div class="salink-alarm-icon" id="salinkAlarmIcon">🔥</div></div>
            <div class="salink-alarm-title" id="salinkAlarmTitle">KEBAKARAN</div>
            <div style="color:#8b949e; font-size:1rem; margin-bottom:20px;" id="salinkAlarmSubtitle">⚠️ Darurat! Segera ambil tindakan</div>
            <div style="color:#fff; font-size:0.9rem; background:rgba(255,255,255,0.1); padding:10px; border-radius:10px; margin-bottom:20px;">
                Dilaporkan oleh: <strong id="salinkAlarmSender">-</strong><br>
                <span id="salinkAlarmLocation">-</span><br>
                <span id="salinkAlarmTime">-</span>
            </div>
            <div class="salink-swipe-indicator">
                <span style="color:#8b949e; font-size:0.75rem; font-weight:bold; margin-bottom:10px;">SWIPE UNTUK MEMATIKAN</span>
                <div style="display:flex; gap:20px; font-size:1.5rem; color:#8b949e;">
                    <i class="fas fa-chevron-up"></i><i class="fas fa-bell" style="color:var(--alarm-color)"></i><i class="fas fa-chevron-down"></i>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    function showFullScreenAlarm(em) {
        ensureFullScreenAlarmDOM();
        const alarm = document.getElementById('salinkFullScreenAlarm');
        if (!alarm || state.fullScreenAlarmActive) return;

        const type = em.type || 'fire';
        const icon = CONFIG.ICONS[type] || '🚨';
        
        document.getElementById('salinkAlarmIcon').textContent = icon;
        document.getElementById('salinkAlarmTitle').textContent = CONFIG.SHORT_LABELS[type] || 'DARURAT';
        document.getElementById('salinkAlarmSender').textContent = em.sender || 'User';
        document.getElementById('salinkAlarmLocation').textContent = em.location || '-';
        document.getElementById('salinkAlarmTime').textContent = formatDate(em.timestamp || Date.now());

        alarm.className = 'salink-full-screen-alarm active ' + (CONFIG.CSS_CLASS[type] || 'fire');
        alarm.style.setProperty('--alarm-color', CONFIG.COLOR[type] || '#f85149');
        
        state.fullScreenAlarmActive = true;
        state.fullScreenAlarmEmergency = em;
        document.body.style.overflow = 'hidden';

        playEmergencyLoop(type);
        startVibrateLoop();
        setupFullScreenAlarmSwipe();
    }

    function dismissFullScreenAlarm(userAction) {
        if (!state.fullScreenAlarmActive) return;
        const alarm = document.getElementById('salinkFullScreenAlarm');
        
        if (alarm) alarm.classList.remove('active');
        document.body.style.overflow = '';
        
        stopVibrateLoop();
        stopEmergencyLoop();

        state.fullScreenAlarmActive = false;
        state.fullScreenAlarmEmergency = null;

        if (userAction !== false) {
            showToast('✅ Alarm Dimatikan', 'Notifikasi darurat dikonfirmasi', 'fa-check-circle');
            setTimeout(playRegularSound, 200);
        }
    }

    function setupFullScreenAlarmSwipe() {
        const alarm = document.getElementById('salinkFullScreenAlarm');
        if (!alarm || alarm._swipeSetup) return;
        alarm._swipeSetup = true;

        let startX = 0, startY = 0, moving = false;
        alarm.addEventListener('touchstart', (e) => {
            const t = e.touches[0]; startX = t.clientX; startY = t.clientY; moving = true;
        }, { passive: true });

        alarm.addEventListener('touchend', (e) => {
            if (!moving) return; moving = false;
            const t = e.changedTouches[0];
            const dx = t.clientX - startX, dy = t.clientY - startY;
            if (Math.sqrt(dx*dx + dy*dy) > CONFIG.SWIPE_MIN_DISTANCE) {
                if (navigator.vibrate) navigator.vibrate(100);
                dismissFullScreenAlarm(true);
            }
        }, { passive: true });
    }

    // ================================================================
    // 10. TOAST UI
    // ================================================================
    function showToast(title, message, icon) {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        container.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${icon || 'fa-info-circle'}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${escapeHTML(title)}</div>
                <div class="toast-message">${escapeHTML(message)}</div>
            </div>
            <button class="toast-close" style="background:none;border:none;color:#6e7681;font-size:0.8rem;"><i class="fas fa-times"></i></button>
        `;
        toast.querySelector('.toast-close').onclick = () => toast.remove();
        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 5000);
    }

    // ================================================================
    // 11. SUPABASE INTEGRATION (POLLING DATA)
    // ================================================================
    async function checkEmergencyNow() {
        if (!window.salinkSupabase) {
            logWarn('Supabase client tidak ditemukan. Alarm tidak bisa cek data.');
            return;
        }

        try {
            // Ambil notifikasi darurat dari Supabase (15 detik terakhir)
            const { data, error } = await window.salinkSupabase
                .from('notifications')
                .select('*')
                .in('type', ['fire', 'medical', 'crime', 'disaster'])
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                const notif = data[0];
                const ts = new Date(notif.created_at).getTime();

                // Jika ini notif baru (lebih baru dari cek terakhir) & bukan dari diri sendiri
                if (ts > state.lastEmergencyCheck) {
                    const isOwn = state.currentUser && notif.sender_username === state.currentUser.username;
                    
                    if (!isOwn) {
                        log('Notif Darurat Baru dari User Lain:', notif.type);
                        
                        const em = {
                            id: notif.id,
                            type: notif.type,
                            sender: notif.sender || 'User',
                            location: notif.message || 'Lokasi tidak diketahui',
                            timestamp: ts
                        };

                        if (isStandbyMode()) {
                            showFullScreenAlarm(em);
                        } else {
                            triggerGridAlarmFromPost(notif.type, false);
                        }
                    }
                    state.lastEmergencyCheck = ts;
                    localStorage.setItem('salink_last_emergency_check_v4', ts.toString());
                }
            }
        } catch(e) {
            logWarn('Gagal polling Supabase:', e.message);
        }
    }

    function startEmergencyPolling() {
        // Cek pertama kali (jangan alarm, hanya sinkronisasi waktu)
        if (window.salinkSupabase) {
            window.salinkSupabase.from('notifications').select('created_at').order('created_at', { ascending: false }).limit(1).then(({data}) => {
                if (data && data.length > 0 && state.lastEmergencyCheck === 0) {
                    state.lastEmergencyCheck = new Date(data[0].created_at).getTime();
                    localStorage.setItem('salink_last_emergency_check_v4', state.lastEmergencyCheck.toString());
                }
            });
        }

        setInterval(() => {
            if (document.hidden) return;
            if (state.fullScreenAlarmActive || state.gridButtonState === 'EMERGENCY_ACTIVE') return;
            checkEmergencyNow();
        }, CONFIG.POLL_INTERVAL);
    }

    // ================================================================
    // 12. SETUP TOMBOL GRID DI UI
    // ================================================================
    function setupEmergencyButtons() {
        const btnMap = { 'fireBtn': 'fire', 'medicalBtn': 'medical', 'securityBtn': 'crime', 'disasterBtn': 'disaster' };
        let count = 0;
        Object.keys(btnMap).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn || btn._salinkSetupV4) return;
            btn._salinkSetupV4 = true;
            
            btn.addEventListener('click', function(e) {
                e.preventDefault(); e.stopPropagation();
                if (localStorage.getItem('salink_logged_in') !== 'true') return;
                handleGridButtonTap(btnMap[btnId]);
            });
            count++;
        });
        log('Emergency buttons setup:', count);
    }

    // ================================================================
    // 13. INISIALISASI
    // ================================================================
    function init() {
        if (state.initialized) return;
        state.initialized = true;

        log('Initializing v4.0 (Supabase Edition)...');

        try {
            const userData = localStorage.getItem('salink_user');
            if (userData) state.currentUser = JSON.parse(userData);
        } catch(e) {}

        if (localStorage.getItem('salink_logged_in') !== 'true') {
            log('User belum login — skip inisialisasi alarm');
            return;
        }

        injectStyles();
        preloadAllAudio();
        setupIdleDetection();
        setupEmergencyButtons();
        startEmergencyPolling();

        // Observer untuk SPA (jika DOM berubah)
        let obsTimeout = null;
        new MutationObserver(() => {
            if (obsTimeout) clearTimeout(obsTimeout);
            obsTimeout = setTimeout(() => { if (state.initialized) setupEmergencyButtons(); }, 500);
        }).observe(document.body, { childList: true, subtree: true });

        log('✅ SalinkEmergency v4.0 Ready!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ================================================================
    // 14. PUBLIC API
    // ================================================================
    window.SalinkEmergency = {
        init: init,
        showAlarm: showFullScreenAlarm,
        dismissAlarm: dismissFullScreenAlarm,
        handleGridButtonTap: handleGridButtonTap,
        dismissGridButtonAlarm: dismissGridButtonAlarm,
        triggerGridAlarmFromPost: triggerGridAlarmFromPost,
        playRegular: playRegularSound,
        playEmergency: playEmergencyLoop,
        stopEmergency: stopEmergencyLoop,
        isStandbyMode: isStandbyMode,
        config: CONFIG,
        state: state
    };

})();
