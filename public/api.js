// ================================================================
// SALINK - API CONNECTION
// ================================================================
// Backend: Google Apps Script
// 🔥 GANTI URL INI DENGAN URL DEPLOY ANDA!
// ================================================================

const API_URL = 'const API_URL = 'https://script.google.com/macros/s/AKfycbzSxSHnPpyNi-W0p_5tXV4fCXHLpMXX3nrLVCLmiSRrpxqDNSN2CZcLlpZqThpryjPj/exec';

// ================================================================
// FUNGSI UTAMA PANGGIL API
// ================================================================

async function callAPI(action, data = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: action,
                data: data
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`📡 API [${action}]:`, result);
        return result;
    } catch (error) {
        console.error('❌ API Error:', error);
        return { sukses: false, pesan: error.message };
    }
}

// ================================================================
// FUNGSI API - PENGGUNA (USERS)
// ================================================================

// DAFTAR PENGGUNA BARU
async function apiDaftarPengguna(data) {
    return await callAPI('daftarPengguna', data);
}

// LOGIN
async function apiMasuk(namaPengguna, kataSandi) {
    return await callAPI('masuk', {
        nama_pengguna: namaPengguna,
        kata_sandi: kataSandi
    });
}

// GET PROFIL PENGGUNA
async function apiGetPengguna(idPengguna) {
    return await callAPI('getPenggunaById', { id: idPengguna });
}

// UPDATE PROFIL
async function apiUpdateProfil(idPengguna, data) {
    return await callAPI('updateProfilPengguna', {
        id: idPengguna,
        data: data
    });
}

// GET ALL PENGGUNA (untuk search/invite)
async function apiGetAllPengguna() {
    return await callAPI('getAllPengguna', {});
}

// ================================================================
// FUNGSI API - POSTINGAN (POSTS)
// ================================================================

async function apiBuatPostingan(data) {
    return await callAPI('buatPostingan', data);
}

async function apiGetAllPostingan(limit = 50) {
    return await callAPI('getAllPostingan', { limit: limit });
}

async function apiGetPostinganByPengguna(idPengguna) {
    return await callAPI('getPostinganByPengguna', { id_pengguna: idPengguna });
}

async function apiUpdatePostingan(idPostingan, field, value) {
    return await callAPI('updatePostingan', {
        id: idPostingan,
        field: field,
        value: value
    });
}

async function apiHapusPostingan(idPostingan, idPengguna) {
    return await callAPI('hapusPostingan', {
        id_postingan: idPostingan,
        id_pengguna: idPengguna
    });
}

// ================================================================
// FUNGSI API - KOMENTAR (COMMENTS)
// ================================================================

async function apiBuatKomentar(data) {
    return await callAPI('buatKomentar', data);
}

async function apiGetKomentarByPostingan(idPostingan) {
    return await callAPI('getKomentarByPostingan', { id_postingan: idPostingan });
}

async function apiTambahBalasan(idKomentar, data) {
    return await callAPI('tambahBalasan', {
        id_komentar: idKomentar,
        data: data
    });
}

async function apiHapusKomentar(idKomentar, idPengguna) {
    return await callAPI('hapusKomentar', {
        id_komentar: idKomentar,
        id_pengguna: idPengguna
    });
}

// ================================================================
// FUNGSI API - TEMAN (FRIENDS)
// ================================================================

async function apiTambahTeman(data) {
    return await callAPI('tambahTeman', data);
}

async function apiTerimaTeman(idTeman) {
    return await callAPI('terimaTeman', { id_teman: idTeman });
}

async function apiGetTemanByPengguna(idPengguna) {
    return await callAPI('getTemanByPengguna', { id_pengguna: idPengguna });
}

async function apiBlokirTeman(idTeman) {
    return await callAPI('blokirTeman', { id_teman: idTeman });
}

// ================================================================
// FUNGSI API - PRODUK (PRODUCTS)
// ================================================================

async function apiBuatProduk(data) {
    return await callAPI('buatProduk', data);
}

async function apiGetProdukByPenjual(idPenjual) {
    return await callAPI('getProdukByPenjual', { id_penjual: idPenjual });
}

async function apiUpdateProduk(idProduk, data) {
    return await callAPI('updateProduk', {
        id_produk: idProduk,
        data: data
    });
}

// ================================================================
// FUNGSI API - TRANSAKSI (TRANSACTIONS)
// ================================================================

async function apiBuatTransaksi(data) {
    return await callAPI('buatTransaksi', data);
}

async function apiGetTransaksiByPengguna(idPengguna) {
    return await callAPI('getTransaksiByPengguna', { id_pengguna: idPengguna });
}

async function apiUpdateStatusTransaksi(idTransaksi, status, waktuSelesai) {
    return await callAPI('updateStatusTransaksi', {
        id_transaksi: idTransaksi,
        status: status,
        waktu_selesai: waktuSelesai
    });
}

// ================================================================
// FUNGSI API - NOTIFIKASI (NOTIFICATIONS)
// ================================================================

async function apiBuatNotifikasi(data) {
    return await callAPI('buatNotifikasi', data);
}

async function apiGetNotifikasiByPengguna(idPengguna) {
    return await callAPI('getNotifikasiByPengguna', { id_pengguna: idPengguna });
}

async function apiTandaiNotifikasiDibaca(idNotifikasi) {
    return await callAPI('tandaiNotifikasiDibaca', { id_notifikasi: idNotifikasi });
}

async function apiTandaiSemuaNotifikasiDibaca(idPengguna) {
    return await callAPI('tandaiSemuaNotifikasiDibaca', { id_pengguna: idPengguna });
}

// ================================================================
// FUNGSI API - LAPORAN (REPORTS)
// ================================================================

async function apiBuatLaporan(data) {
    return await callAPI('buatLaporan', data);
}

async function apiGetAllLaporan() {
    return await callAPI('getAllLaporan', {});
}

async function apiGetLaporanAktif() {
    return await callAPI('getLaporanAktif', {});
}

async function apiUpdateStatusLaporan(idLaporan, status, ditanganiOleh) {
    return await callAPI('updateStatusLaporan', {
        id_laporan: idLaporan,
        status: status,
        ditangani_oleh: ditanganiOleh
    });
}

// ================================================================
// FUNGSI API - STATISTIK (STATS)
// ================================================================

async function apiGetStatistikDashboard() {
    return await callAPI('getStatistikDashboard', {});
}

async function apiGetStatistikMingguan() {
    return await callAPI('getStatistikMingguan', {});
}

async function apiGetDashboardStats() {
    return await callAPI('getDashboardStats', {});
}

// ================================================================
// FUNGSI UTILITY - CEK KONEKSI
// ================================================================

async function apiCekKoneksi() {
    try {
        const response = await fetch(API_URL);
        const text = await response.text();
        return text.includes('SALINK Backend is running');
    } catch (error) {
        console.error('❌ Koneksi gagal:', error);
        return false;
    }
}

console.log('✅ api.js loaded!');
console.log('📡 API_URL:', API_URL);
