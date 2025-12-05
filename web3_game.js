/* web3_game.js */
// File ini menangani semua interaksi on-chain untuk halaman game.

// --- KONFIGURASI SOMNIA & KONTRAK (Sama seperti yang disepakati) ---
const LEADERBOARD_CONTRACT_ADDRESS = "0xD76b767102f2610b0C97FEE84873c1fAA4c7C365";
const START_FEE_WEI = "10000000000000000"; // 0.01 SOMI dalam Wei
const MAX_SCORE = 3000; // Batas skor maksimum yang bisa dicatat

// ABI (Hanya fungsi yang dibutuhkan di sini)
const LEADERBOARD_ABI = [
    "function startGame() payable",
    "function submitScore(uint256 score)",
    "function maxScore() view returns (uint256)",
];

// --- VARIABEL WEB3 ---
let WALLET_ADDRESS = null;
let provider = null;
let signer = null;
let leaderboardContract = null;
let gameIsReady = false; 

// --- FUNGSI UTAMA WEB3 ---

/**
 * Inisiasi Web3 saat halaman game dimuat.
 */
async function initWeb3() {
    // Check keberadaan Ethers dan Wallet
    if (!window.ethereum || typeof ethers === 'undefined') {
        alert("Ethers.js atau MetaMask tidak terdeteksi. Tidak dapat berinteraksi on-chain.");
        document.getElementById("startOnchainBtn").disabled = true;
        document.getElementById("playerName").innerText = "Web3 Error";
        return;
    }

    try {
        // Menggunakan Web3Provider dari MetaMask
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        WALLET_ADDRESS = await signer.getAddress();
        
        // Inisiasi Kontrak
        leaderboardContract = new ethers.Contract(LEADERBOARD_CONTRACT_ADDRESS, LEADERBOARD_ABI, signer);
        gameIsReady = true;

        // Ambil nama dari local storage dan update UI
        const playerName = localStorage.getItem(`name_${WALLET_ADDRESS}`) || "Player";
        document.getElementById("playerName").innerText = playerName;

        // Aktifkan tombol START
        document.getElementById("startOnchainBtn").disabled = false;


    } catch (error) {
        console.error("Inisialisasi Web3 Gagal:", error);
        alert("Gagal terhubung ke Somnia. Pastikan Anda sudah login di MetaMask.");
        document.getElementById("playerName").innerText = "Not Logged In";
    }
}


/**
 * Transaksi untuk memulai game (Membayar 0.01 SOMI).
 */
async function startOnchain() {
    if (!gameIsReady) {
        alert("Koneksi Web3 belum siap. Silakan refresh halaman.");
        return;
    }
    
    // Asumsi: Variabel 'running' ada di game_logic.js dan global
    if (typeof running !== 'undefined' && running) {
        alert("Game sudah berjalan!");
        return;
    }

    if (!confirm(`Memulai game membutuhkan biaya 0.01 SOMI. Lanjutkan?`)) return;

    try {
        const startBtn = document.getElementById("startOnchainBtn");
        startBtn.disabled = true;
        startBtn.innerText = "Sending TX...";

        // Panggil fungsi startGame() di Kontrak
        const tx = await leaderboardContract.startGame({
            value: START_FEE_WEI,
        });

        alert("Transaksi startGame terkirim. Mohon tunggu konfirmasi...");
        await tx.wait();
        
        // Panggil fungsi startGameLoop() dari game_logic.js setelah sukses
        if (typeof startGameLoop === 'function') {
            startGameLoop(); 
            // Text tombol diubah di startGameLoop
        } else {
             alert("Transaksi sukses, namun startGameLoop() tidak ditemukan.");
        }

    } catch (error) {
        console.error("Transaksi startGame Gagal:", error);
        alert("Pembayaran 0.01 SOMI gagal. Cek saldo SOMI.");
        
        const startBtn = document.getElementById("startOnchainBtn");
        startBtn.disabled = false;
        startBtn.innerText = "START GAME (0.01 SOMI)";
    }
}


/**
 * Transaksi untuk mengirim skor akhir ke kontrak.
 * Dipanggil secara otomatis oleh endGame() di game_logic.js.
 * @param {number} finalScore - Skor akhir game.
 */
async function submitFinalScore(finalScore) {
    if (!gameIsReady) {
        alert("Koneksi Web3 belum siap. Skor tidak dapat dikirim.");
        return;
    }
    
    // Cap skor (Capping)
    if (finalScore > MAX_SCORE) finalScore = MAX_SCORE;

    if (!confirm(`Skor akhir yang akan dicatat: ${finalScore}. Kirim ke Leaderboard SOMNIA?`)) return;

    try {
        const submitBtn = document.getElementById("submitScoreBtn");
        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting Score...";

        // Panggil fungsi submitScore di kontrak
        const tx = await leaderboardContract.submitScore(finalScore);
        alert(`Transaksi skor ${finalScore} terkirim. Menunggu konfirmasi...`);
        
        await tx.wait();
        alert(`Skor ${finalScore} berhasil dicatat di SOMNIA!`);
        
    } catch (error) {
        console.error("Gagal mencatat skor:", error);
        alert("Gagal mencatat skor. Cek konsol dan saldo gas.");
    } finally {
        const submitBtn = document.getElementById("submitScoreBtn");
        submitBtn.disabled = false;
        submitBtn.innerText = "SUBMIT SCORE (Auto)";
    }
}

// Inisiasi Web3 saat skrip dimuat
window.onload = initWeb3;
