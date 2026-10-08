/* ====================================================================
 * SALINK-SOCIAL.JS v1.1 — Shared Social Library
 * ====================================================================
 * Shared library untuk 3 file:
 *   - profile-user.html
 *   - profil.html
 *   - pesan-masuk.html
 *
 * Fungsi utama:
 *   - Friend operations (invite, accept, remove, block)
 *   - Reports (laporkan user)
 *   - Helper status (areFriends, getFriendStatus, isBlocked)
 *   - ⭐ PRIVACY HELPERS (v1.1) — getPrivacy, isAllowed
 *
 * Storage keys (single source of truth):
 *   - salink_friends   : [{ id, user1, user2, status, requestedBy, timestamp, acceptedAt }]
 *                        status: 'pending' | 'accepted'
 *   - salink_blocked   : [{ blocker, blocked, timestamp }]
 *   - salink_reports   : [{ id, reporter, target, reason, timestamp }]
 *   - salink_users     : [ user object ]
 *                        user.privacy = {
 *                          allowWhatsApp: boolean (default true),
 *                          allowVoiceCall: boolean (default true),
 *                          allowVideoCall: boolean (default true),
 *                          allowPhoneCall: boolean (default false)
 *                        }
 *
 * Catatan penting:
 *   - BLOKIR hanya memblokir CHAT, TIDAK menyembunyikan postingan/notif/search/invite
 *   - Postingan Emergency & Biasa dari user yang diblokir tetap tampil
 *   - Info darurat harus tetap tersampaikan
 * ==================================================================== */
(function(global) {
    'use strict';

    // ================================================================
    // 1. STORAGE KEYS
    // ================================================================
    var KEYS = {
        FRIENDS: 'salink_friends',
        BLOCKED: 'salink_blocked',
        REPORTS: 'salink_reports',
        USERS: 'salink_users'
    };

    // Privacy defaults
    var DEFAULT_PRIVACY = {
        allowWhatsApp: true,
        allowVoiceCall: true,
        allowVideoCall: true,
        allowPhoneCall: false
    };

    // ================================================================
    // 2. INTERNAL HELPERS
    // ================================================================
    function _safeParse(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function _safeSave(key, arr) {
        try {
            localStorage.setItem(key, JSON.stringify(arr));
            try {
                localStorage.setItem('salink_sync_trigger', JSON.stringify({
                    type: 'social_' + key,
                    timestamp: Date.now()
                }));
                setTimeout(function() {
                    try { localStorage.removeItem('salink_sync_trigger'); } catch(e) {}
                }, 100);
            } catch (e) {}
            return true;
        } catch (e) {
            console.warn('⚠️ [SalinkSocial] Gagal save ' + key + ':', e.message);
            return false;
        }
    }

    function _normalizeUsername(u) {
        if (!u) return '';
        return String(u).trim().toLowerCase();
    }

    function _areSame(uA, uB) {
        if (!uA || !uB) return false;
        return _normalizeUsername(uA) === _normalizeUsername(uB);
    }

    function _genId(prefix) {
        return (prefix || 'x') + '-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    }

    // ================================================================
    // 3. LOAD / SAVE (PUBLIC)
    // ================================================================
    function loadFriends() {
        return _safeParse(KEYS.FRIENDS, []);
    }
    function saveFriends(arr) {
        return _safeSave(KEYS.FRIENDS, Array.isArray(arr) ? arr : []);
    }

    function loadBlocked() {
        return _safeParse(KEYS.BLOCKED, []);
    }
    function saveBlocked(arr) {
        return _safeSave(KEYS.BLOCKED, Array.isArray(arr) ? arr : []);
    }

    function loadReports() {
        return _safeParse(KEYS.REPORTS, []);
    }
    function saveReports(arr) {
        return _safeSave(KEYS.REPORTS, Array.isArray(arr) ? arr : []);
    }

    function loadUsers() {
        return _safeParse(KEYS.USERS, []);
    }

    // ================================================================
    // 4. STATUS HELPERS
    // ================================================================
    function getFriendStatus(userA, userB) {
        if (!userA || !userB || _areSame(userA, userB)) return 'none';

        if (isBlocked(userA, userB)) return 'blocked';

        var friends = loadFriends();
        var normA = _normalizeUsername(userA);
        var normB = _normalizeUsername(userB);

        for (var i = 0; i < friends.length; i++) {
            var f = friends[i];
            if (!f) continue;
            var u1 = _normalizeUsername(f.user1);
            var u2 = _normalizeUsername(f.user2);
            var status = String(f.status || 'pending').toLowerCase();

            var matchDirect = (u1 === normA && u2 === normB);
            var matchReverse = (u1 === normB && u2 === normA);

            if (!matchDirect && !matchReverse) continue;

            if (status === 'accepted' || status === 'teman' || status === 'friend') {
                return 'accepted';
            }

            if (matchDirect) return 'pending_out';
            if (matchReverse) return 'pending_in';
        }

        return 'none';
    }

    function areFriends(userA, userB) {
        return getFriendStatus(userA, userB) === 'accepted';
    }

    function hasPendingInvite(userA, userB) {
        var s = getFriendStatus(userA, userB);
        return s === 'pending_out' || s === 'pending_in';
    }

    function isBlocked(userA, userB) {
        if (!userA || !userB) return false;
        var blocked = loadBlocked();
        var normA = _normalizeUsername(userA);
        var normB = _normalizeUsername(userB);
        for (var i = 0; i < blocked.length; i++) {
            var b = blocked[i];
            if (!b) continue;
            var bl = _normalizeUsername(b.blocker);
            var bd = _normalizeUsername(b.blocked);
            if (bl === normA && bd === normB) return true;
        }
        return false;
    }

    function isBlockedBy(targetUser, requesterUser) {
        if (!targetUser || !requesterUser) return false;
        var blocked = loadBlocked();
        var normTarget = _normalizeUsername(targetUser);
        var normReq = _normalizeUsername(requesterUser);
        for (var i = 0; i < blocked.length; i++) {
            var b = blocked[i];
            if (!b) continue;
            var bl = _normalizeUsername(b.blocker);
            var bd = _normalizeUsername(b.blocked);
            if (bl === normTarget && bd === normReq) return true;
        }
        return false;
    }

    // ================================================================
    // 5. FRIEND LIST
    // ================================================================
    function getFriends(username) {
        if (!username) return [];
        var normUser = _normalizeUsername(username);
        var friends = loadFriends();
        var result = [];
        var seen = {};

        friends.forEach(function(f) {
            if (!f) return;
            var u1 = _normalizeUsername(f.user1);
            var u2 = _normalizeUsername(f.user2);
            var status = String(f.status || 'pending').toLowerCase();
            if (status !== 'accepted' && status !== 'teman' && status !== 'friend') return;

            var other = null;
            if (u1 === normUser) other = u2;
            else if (u2 === normUser) other = u1;
            else return;

            if (seen[other]) return;
            seen[other] = true;

            result.push({
                username: other,
                since: f.acceptedAt || f.timestamp || null,
                friendData: f
            });
        });

        return result;
    }

    function getFollowers(username) {
        if (!username) return [];
        var normUser = _normalizeUsername(username);
        var friends = loadFriends();
        var result = [];
        friends.forEach(function(f) {
            if (!f) return;
            var u2 = _normalizeUsername(f.user2);
            var status = String(f.status || 'pending').toLowerCase();
            if (u2 !== normUser) return;
            if (status !== 'accepted' && status !== 'teman' && status !== 'friend') return;
            result.push({
                username: _normalizeUsername(f.user1),
                since: f.acceptedAt || f.timestamp || null,
                status: 'accepted'
            });
        });
        return result;
    }

    function getFollowing(username) {
        if (!username) return [];
        var normUser = _normalizeUsername(username);
        var friends = loadFriends();
        var result = [];
        friends.forEach(function(f) {
            if (!f) return;
            var u1 = _normalizeUsername(f.user1);
            var status = String(f.status || 'pending').toLowerCase();
            if (u1 !== normUser) return;
            if (status !== 'accepted' && status !== 'teman' && status !== 'friend') return;
            result.push({
                username: _normalizeUsername(f.user2),
                since: f.acceptedAt || f.timestamp || null,
                status: 'accepted'
            });
        });
        return result;
    }

    function getPendingFollowers(username) {
        if (!username) return [];
        var normUser = _normalizeUsername(username);
        var friends = loadFriends();
        var result = [];
        friends.forEach(function(f) {
            if (!f) return;
            var u2 = _normalizeUsername(f.user2);
            var status = String(f.status || 'pending').toLowerCase();
            if (u2 !== normUser) return;
            if (status === 'accepted' || status === 'teman' || status === 'friend') return;
            result.push({
                username: _normalizeUsername(f.user1),
                since: f.timestamp || null,
                status: 'pending'
            });
        });
        return result;
    }

    function getPendingFollowing(username) {
        if (!username) return [];
        var normUser = _normalizeUsername(username);
        var friends = loadFriends();
        var result = [];
        friends.forEach(function(f) {
            if (!f) return;
            var u1 = _normalizeUsername(f.user1);
            var status = String(f.status || 'pending').toLowerCase();
            if (u1 !== normUser) return;
            if (status === 'accepted' || status === 'teman' || status === 'friend') return;
            result.push({
                username: _normalizeUsername(f.user2),
                since: f.timestamp || null,
                status: 'pending'
            });
        });
        return result;
    }

    // ================================================================
    // 6. FRIEND OPERATIONS
    // ================================================================
    function sendInvite(fromUser, toUser) {
        if (!fromUser || !toUser) {
            return { ok: false, reason: 'invalid_params', data: null };
        }
        if (_areSame(fromUser, toUser)) {
            return { ok: false, reason: 'self_invite', data: null };
        }

        var normFrom = _normalizeUsername(fromUser);
        var normTo = _normalizeUsername(toUser);

        if (isBlockedBy(normTo, normFrom)) {
            return { ok: false, reason: 'blocked_by_target', data: null };
        }

        var friends = loadFriends();

        var status = getFriendStatus(normFrom, normTo);
        if (status === 'accepted') {
            return { ok: false, reason: 'already_friends', data: null };
        }
        if (status === 'pending_out') {
            return { ok: false, reason: 'already_sent', data: null };
        }

        if (status === 'pending_in') {
            for (var i = 0; i < friends.length; i++) {
                var f = friends[i];
                if (!f) continue;
                var u1 = _normalizeUsername(f.user1);
                var u2 = _normalizeUsername(f.user2);
                if (u1 === normTo && u2 === normFrom && String(f.status).toLowerCase() !== 'accepted') {
                    f.status = 'accepted';
                    f.acceptedAt = new Date().toISOString();
                    saveFriends(friends);
                    return { ok: true, reason: 'auto_accepted', data: f };
                }
            }
        }

        var invite = {
            id: _genId('invite'),
            user1: normFrom,
            user2: normTo,
            status: 'pending',
            requestedBy: normFrom,
            timestamp: new Date().toISOString(),
            acceptedAt: ''
        };
        friends.push(invite);
        saveFriends(friends);
        return { ok: true, reason: 'sent', data: invite };
    }

    function acceptInvite(userA, userB) {
        if (!userA || !userB) return { ok: false, reason: 'invalid_params' };
        var normA = _normalizeUsername(userA);
        var normB = _normalizeUsername(userB);
        var friends = loadFriends();

        for (var i = 0; i < friends.length; i++) {
            var f = friends[i];
            if (!f) continue;
            var u1 = _normalizeUsername(f.user1);
            var u2 = _normalizeUsername(f.user2);
            var match = (u1 === normA && u2 === normB) || (u1 === normB && u2 === normA);
            if (!match) continue;
            var status = String(f.status || '').toLowerCase();
            if (status === 'accepted') return { ok: false, reason: 'already_accepted' };
            f.status = 'accepted';
            f.acceptedAt = new Date().toISOString();
            saveFriends(friends);
            return { ok: true, data: f };
        }
        return { ok: false, reason: 'invite_not_found' };
    }

    function removeFriend(userA, userB) {
        if (!userA || !userB) return { ok: false, reason: 'invalid_params' };
        var normA = _normalizeUsername(userA);
        var normB = _normalizeUsername(userB);
        var friends = loadFriends();
        var before = friends.length;

        friends = friends.filter(function(f) {
            if (!f) return false;
            var u1 = _normalizeUsername(f.user1);
            var u2 = _normalizeUsername(f.user2);
            var match = (u1 === normA && u2 === normB) || (u1 === normB && u2 === normA);
            return !match;
        });

        if (friends.length === before) {
            return { ok: false, reason: 'not_found' };
        }
        saveFriends(friends);
        return { ok: true };
    }

    function blockUser(blocker, blocked) {
        if (!blocker || !blocked) return { ok: false, reason: 'invalid_params' };
        if (_areSame(blocker, blocked)) return { ok: false, reason: 'self_block' };

        var normBlocker = _normalizeUsername(blocker);
        var normBlocked = _normalizeUsername(blocked);

        var blockedList = loadBlocked();

        var exists = blockedList.some(function(b) {
            return _normalizeUsername(b.blocker) === normBlocker &&
                   _normalizeUsername(b.blocked) === normBlocked;
        });
        if (exists) return { ok: false, reason: 'already_blocked' };

        blockedList.push({
            id: _genId('block'),
            blocker: normBlocker,
            blocked: normBlocked,
            timestamp: new Date().toISOString()
        });
        saveBlocked(blockedList);

        removeFriend(normBlocker, normBlocked);

        return { ok: true };
    }

    function unblockUser(blocker, blocked) {
        if (!blocker || !blocked) return { ok: false, reason: 'invalid_params' };
        var normBlocker = _normalizeUsername(blocker);
        var normBlocked = _normalizeUsername(blocked);
        var blockedList = loadBlocked();
        var before = blockedList.length;
        blockedList = blockedList.filter(function(b) {
            return !(_normalizeUsername(b.blocker) === normBlocker &&
                     _normalizeUsername(b.blocked) === normBlocked);
        });
        if (blockedList.length === before) return { ok: false, reason: 'not_found' };
        saveBlocked(blockedList);
        return { ok: true };
    }

    function getBlockedList(username) {
        if (!username) return [];
        var normUser = _normalizeUsername(username);
        return loadBlocked().filter(function(b) {
            return _normalizeUsername(b.blocker) === normUser;
        });
    }

    // ================================================================
    // 7. REPORTS
    // ================================================================
    function reportUser(reporter, target, reason) {
        if (!reporter || !target) {
            return { ok: false, reason: 'invalid_params' };
        }
        if (_areSame(reporter, target)) {
            return { ok: false, reason: 'self_report' };
        }
        var reports = loadReports();
        var report = {
            id: _genId('report'),
            reporter: _normalizeUsername(reporter),
            target: _normalizeUsername(target),
            reason: String(reason || '').trim(),
            timestamp: new Date().toISOString()
        };
        reports.push(report);
        saveReports(reports);
        return { ok: true, data: report };
    }

    function getReportCount(username) {
        if (!username) return 0;
        var normUser = _normalizeUsername(username);
        return loadReports().filter(function(r) {
            return _normalizeUsername(r.target) === normUser;
        }).length;
    }

    function hasReported(reporter, target) {
        if (!reporter || !target) return false;
        var normRep = _normalizeUsername(reporter);
        var normTgt = _normalizeUsername(target);
        return loadReports().some(function(r) {
            return _normalizeUsername(r.reporter) === normRep &&
                   _normalizeUsername(r.target) === normTgt;
        });
    }

    // ================================================================
    // 8. USER HELPERS
    // ================================================================
    function getUserByUsername(username) {
        if (!username) return null;
        var normUser = _normalizeUsername(username);
        var users = loadUsers();
        for (var i = 0; i < users.length; i++) {
            if (_normalizeUsername(users[i].username) === normUser) return users[i];
        }
        return null;
    }

    function getUserDisplayName(username) {
        var u = getUserByUsername(username);
        if (!u) return username || 'User';
        return u.fullName || u.username || 'User';
    }

    function getUserAvatar(username) {
        var u = getUserByUsername(username);
        if (!u) return '';
        return u.profilePicture || '';
    }

    function getUserGender(username) {
        var u = getUserByUsername(username);
        if (!u) return 'male';
        return u.gender || 'male';
    }

    // ================================================================
    // 9. ⭐ PRIVACY HELPERS (v1.1)
    // ================================================================
    /**
     * Ambil pengaturan privasi user
     * @returns {Object} { allowWhatsApp, allowVoiceCall, allowVideoCall, allowPhoneCall }
     */
    function getPrivacy(username) {
        var u = getUserByUsername(username);
        if (!u) return Object.assign({}, DEFAULT_PRIVACY);
        var p = u.privacy || {};
        return {
            allowWhatsApp: p.allowWhatsApp !== false,
            allowVoiceCall: p.allowVoiceCall !== false,
            allowVideoCall: p.allowVideoCall !== false,
            allowPhoneCall: p.allowPhoneCall === true
        };
    }

    /**
     * Cek apakah user mengizinkan fitur tertentu
     * @param {string} username - target user
     * @param {string} feature - 'whatsapp' | 'voiceCall' | 'videoCall' | 'phoneCall'
     * @returns {boolean}
     */
    function isAllowed(username, feature) {
        if (!username || !feature) return false;
        var p = getPrivacy(username);
        if (feature === 'whatsapp') return p.allowWhatsApp === true;
        if (feature === 'voiceCall') return p.allowVoiceCall === true;
        if (feature === 'videoCall') return p.allowVideoCall === true;
        if (feature === 'phoneCall') return p.allowPhoneCall === true;
        return false;
    }

    /**
     * Simpan pengaturan privasi user
     * @param {string} username - user yang mengubah privasi
     * @param {Object} newPrivacy - { allowWhatsApp, allowVoiceCall, allowVideoCall, allowPhoneCall }
     * @returns {Object} { ok: boolean }
     */
    function savePrivacy(username, newPrivacy) {
        if (!username) return { ok: false, reason: 'invalid_username' };
        var users = loadUsers();
        var found = false;
        var normUser = _normalizeUsername(username);
        for (var i = 0; i < users.length; i++) {
            if (_normalizeUsername(users[i].username) === normUser) {
                var current = users[i].privacy || {};
                users[i].privacy = {
                    allowWhatsApp: newPrivacy.allowWhatsApp !== undefined ? newPrivacy.allowWhatsApp : (current.allowWhatsApp !== false),
                    allowVoiceCall: newPrivacy.allowVoiceCall !== undefined ? newPrivacy.allowVoiceCall : (current.allowVoiceCall !== false),
                    allowVideoCall: newPrivacy.allowVideoCall !== undefined ? newPrivacy.allowVideoCall : (current.allowVideoCall !== false),
                    allowPhoneCall: newPrivacy.allowPhoneCall !== undefined ? newPrivacy.allowPhoneCall : (current.allowPhoneCall === true)
                };
                found = true;
                break;
            }
        }
        if (!found) return { ok: false, reason: 'user_not_found' };
        return _safeSave(KEYS.USERS, users) ? { ok: true } : { ok: false, reason: 'save_failed' };
    }

    // ================================================================
    // 10. UTILITIES
    // ================================================================
    function isCurrentUser(username) {
        try {
            var raw = localStorage.getItem('salink_user');
            if (!raw) return false;
            var u = JSON.parse(raw);
            if (!u || !u.username) return false;
            return _normalizeUsername(u.username) === _normalizeUsername(username);
        } catch (e) {
            return false;
        }
    }

    function getCurrentUser() {
        try {
            var raw = localStorage.getItem('salink_user');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    // ================================================================
    // 11. EXPORT
    // ================================================================
    var SalinkSocial = {
        // Constants
        KEYS: KEYS,
        DEFAULT_PRIVACY: DEFAULT_PRIVACY,

        // Load/Save
        loadFriends: loadFriends,
        saveFriends: saveFriends,
        loadBlocked: loadBlocked,
        saveBlocked: saveBlocked,
        loadReports: loadReports,
        saveReports: saveReports,
        loadUsers: loadUsers,

        // Status
        getFriendStatus: getFriendStatus,
        areFriends: areFriends,
        hasPendingInvite: hasPendingInvite,
        isBlocked: isBlocked,
        isBlockedBy: isBlockedBy,

        // Lists
        getFriends: getFriends,
        getFollowers: getFollowers,
        getFollowing: getFollowing,
        getPendingFollowers: getPendingFollowers,
        getPendingFollowing: getPendingFollowing,
        getBlockedList: getBlockedList,

        // Operations
        sendInvite: sendInvite,
        acceptInvite: acceptInvite,
        removeFriend: removeFriend,
        blockUser: blockUser,
        unblockUser: unblockUser,

        // Reports
        reportUser: reportUser,
        getReportCount: getReportCount,
        hasReported: hasReported,

        // Users
        getUserByUsername: getUserByUsername,
        getUserDisplayName: getUserDisplayName,
        getUserAvatar: getUserAvatar,
        getUserGender: getUserGender,

        // Privacy (v1.1)
        getPrivacy: getPrivacy,
        isAllowed: isAllowed,
        savePrivacy: savePrivacy,

        // Utilities
        isCurrentUser: isCurrentUser,
        getCurrentUser: getCurrentUser,

        // Version
        VERSION: '1.1.0'
    };

    global.SalinkSocial = SalinkSocial;

    console.log('✅ [SalinkSocial] v' + SalinkSocial.VERSION + ' loaded');

})(typeof window !== 'undefined' ? window : this);
