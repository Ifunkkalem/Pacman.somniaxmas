// --- PEMBARUAN UI SINKRON H-0: GANTI PESAN DEFAULT SEBELUM OPERASI LAIN ---
// Ini harus dieksekusi segera saat modul dimuat untuk mengganti pesan error default.
if (typeof window.updateFirebaseStatusUI === 'function') {
    window.updateFirebaseStatusUI("MEMERIKSA KONFIGURASI", "Memulai otentikasi...", false);
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- REVISI KRITIS: Ambil Variabel Global dari window ---
// Variabel Global dari Lingkungan Canvas
const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'somnia-default-app-id';
// Pastikan konfigurasi diambil dengan benar dan diparse
const firebaseConfig = typeof window.__firebase_config !== 'undefined' && window.__firebase_config ? JSON.parse(window.__firebase_config) : null;
const initialAuthToken = typeof window.__initial_auth_token !== 'undefined' ? window.__initial_auth_token : null;


let app;
let db;
let auth;
let userId = null;
window.isAuthReady = false; // Dibuat global untuk pemeriksaan di UI logic
let isWalletConnected = false;
let displayName = localStorage.getItem('displayName') || "Player Anon";

// Elemen UI
const startGameBtn = document.getElementById('startGameBtn');
const saveDisplayNameBtn = document.getElementById('saveDisplayNameBtn');
const leaderboardList = document.getElementById('leaderboardList');
const modalOverlay = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');


/**
 * @description Inisialisasi Firebase dan otentikasi pengguna.
 */
async function initializeFirebase() {
    console.log("Memulai inisialisasi Firebase...");
    
    if (!firebaseConfig) {
        // Jika konfigurasi tetap null, tampilkan error kritis yang sangat spesifik
        window.updateFirebaseStatusUI(
            "[KESALAHAN KONFIGURASI KRITIS]", 
            "Variabel Firebase (__firebase_config) tidak terdefinisi.", 
            false
        );
        console.error("Kesalahan: Variabel __firebase_config hilang atau tidak valid.");
        return; // Hentikan eksekusi jika tidak ada konfigurasi
    }

    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // Logika Otentikasi
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                
                // Jika belum ada display name di localStorage, set default
                if (!localStorage.getItem('displayName')) {
                    displayName = "User#" + userId.substring(0, 6);
                    localStorage.setItem('displayName', displayName); // Simpan default
                }
                
                window.isAuthReady = true;
                console.log(`Otentikasi Berhasil. UID: ${userId}`);
                window.updateFirebaseStatusUI("KONEKSI BERHASIL", `ID Pemain: ${displayName} (${userId.substring(0, 8)}...)`, true);
                
                // Aktifkan tombol save display name
                saveDisplayNameBtn.disabled = false;
                
                // Aktifkan tombol Play Game jika Wallet sudah terhubung
                if (isWalletConnected) {
                     startGameBtn.disabled = false;
                }
                
                // Mulai listener Leaderboard
                listenToLeaderboard();
                
            } else {
                console.log("Pengguna keluar atau otentikasi gagal.");
                userId = null;
                window.isAuthReady = true; 
                window.updateFirebaseStatusUI("[Gagal Otentikasi]", "Tidak dapat masuk. Silakan muat ulang.", false);
            }
        });
        
        // Coba masuk dengan token khusus atau anonim
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

    } catch (error) {
        console.error("Gagal saat inisialisasi atau otentikasi Firebase:", error);
        window.updateFirebaseStatusUI("[ERROR KRITIS]", `Kode: ${error.code} | Pesan: ${error.message}`, false);
    }
}

/**
 * @description Mensimulasikan koneksi ke dompet Web3.
 */
window.startOnchain = () => {
    console.log("Memulai simulasi koneksi dompet...");
    // Simulasi ethers.js
    if (typeof ethers !== 'undefined' && ethers.providers) {
        // Anggap koneksi berhasil
        isWalletConnected = true;
        window.updateConnectButtonUI(true);
        console.log("Simulasi Dompet Terhubung.");
        
        // Aktifkan tombol Play Game jika Auth sudah siap
        if (window.isAuthReady) {
            startGameBtn.disabled = false;
        }
    } else {
        console.warn("Ethers.js tidak termuat atau koneksi gagal disimulasikan.");
        window.showCustomModal("Simulasi Gagal", "Ethers.js gagal dimuat. Coba muat ulang halaman.");
    }
};

/**
 * @description Menyimpan nama tampilan ke Firestore dan LocalStorage.
 */
saveDisplayNameBtn.addEventListener('click', async () => {
    const input = prompt("Masukkan nama tampilan Anda (maks 15 karakter):");
    if (input && input.trim().length > 0) {
        const newName = input.trim().substring(0, 15);
        displayName = newName;
        localStorage.setItem('displayName', newName);
        
        // Update di Firestore (di koleksi publik)
        if (db && userId) {
            try {
                // Lokasi penyimpanan skor/profil publik: artifacts/{appId}/public/data/users/{userId}
                const userRef = doc(db, `artifacts/${appId}/public/data/users/${userId}`);
                await setDoc(userRef, { displayName: newName, lastUpdate: new Date().toISOString() }, { merge: true });
                console.log("Nama tampilan berhasil disimpan di Firestore.");
                window.updateFirebaseStatusUI("KONEKSI BERHASIL", `ID Pemain: ${newName} (${userId.substring(0, 8)}...)`, true);
            } catch (e) {
                console.error("Error menyimpan nama tampilan:", e);
                showCustomModal("Error", "Gagal menyimpan nama tampilan ke database.");
            }
        } else {
             window.updateFirebaseStatusUI("KONEKSI GAGAL", "Silakan coba otentikasi ulang.", false);
        }
    }
});


/**
 * @description Menampilkan modal kustom.
 * @param {string} title Judul modal.
 * @param {string} message Pesan modal.
 */
window.showCustomModal = (title, message) => {
    modalTitle.innerText = title;
    modalMessage.innerHTML = message;
    modalOverlay.style.display = 'flex';
};


/**
 * @description Menyimpan skor tertinggi pemain.
 * @param {number} score Skor yang akan disimpan.
 */
window.saveScore = async (score) => {
    if (!db || !userId) {
        console.error("Database belum siap atau UID tidak ditemukan.");
        return;
    }

    try {
        // Lokasi penyimpanan skor/profil publik: artifacts/{appId}/public/data/users/{userId}
        const userRef = doc(db, `artifacts/${appId}/public/data/users/${userId}`);
        
        // Menyimpan/memperbarui skor
        await setDoc(userRef, { 
            displayName: displayName, 
            score: score, 
            lastPlayed: new Date().toISOString() 
        }, { merge: true });
        
        console.log(`Skor ${score} berhasil disimpan.`);
        
    } catch (e) {
        console.error("Gagal menyimpan skor:", e);
        showCustomModal("Error Database", "Gagal menyimpan skor tertinggi Anda.");
    }
};


/**
 * @description Mendengarkan perubahan data Leaderboard secara real-time.
 */
function listenToLeaderboard() {
    if (!db) return;
    
    // Lokasi koleksi publik: artifacts/{appId}/public/data/users
    const leaderboardCollectionRef = collection(db, `artifacts/${appId}/public/data/users`);
    const q = query(leaderboardCollectionRef);

    onSnapshot(q, (snapshot) => {
        let scores = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Hanya ambil data yang memiliki skor
            if (data.score && typeof data.score === 'number') {
                scores.push({
                    id: doc.id,
                    name: data.displayName || `User#${doc.id.substring(0, 6)}`,
                    score: data.score
                });
            }
        });

        // Urutkan skor secara manual (descending) dan ambil 10 teratas
        scores.sort((a, b) => b.score - a.score);
        const topScores = scores.slice(0, 10);
        
        updateLeaderboardUI(topScores);
    }, (error) => {
        console.error("Error mendengarkan leaderboard:", error);
        leaderboardList.innerHTML = `<p class="text-center text-red-500">Error memuat data leaderboard: ${error.message}</p>`;
    });
}


/**
 * @description Memperbarui UI modal Leaderboard.
 * @param {Array} scores Array skor yang diurutkan.
 */
function updateLeaderboardUI(scores) {
    if (leaderboardList) {
        if (scores.length === 0) {
            leaderboardList.innerHTML = '<p class="text-center text-gray-500">Belum ada skor yang tercatat.</p>';
            return;
        }

        leaderboardList.innerHTML = scores.map((item, index) => `
            <div class="leaderboard-item">
                <span class="leaderboard-name">#${index + 1} - ${item.name}</span>
                <span class="leaderboard-score">${item.score}</span>
            </div>
        `).join('');
    }
}

// Fungsi dummy untuk dipanggil dari UI, pengerjaan sebenarnya ada di listener
window.fetchLeaderboard = () => {
    console.log("Leaderboard dipanggil. Data diperbarui melalui listener onSnapshot.");
};

// --- EKSEKUSI: Panggil inisialisasi ---
initializeFirebase();
// Juga set status awal tombol koneksi Wallet
window.updateConnectButtonUI(false); 
