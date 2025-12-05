/* app.js: Logika Utama Menu, Koneksi Web3, dan Transisi Layar */

// --- KONFIGURASI WEB3 KONTRAK DAN JARINGAN ---
const LEADERBOARD_CONTRACT_ADDRESS = "0xD76b767102f2610b0C97FEE84873c1fAA4c7C365";
const SOMNIA_CHAIN_ID = 5031; // Chain ID untuk SOMNIA Mainnet
const SOMNIA_RPC_URL = "https://api.infra.mainnet.somnia.network";
const SOMNIA_EXPLORER_URL = "https://explorer.somnia.network";
const SOMNIA_CURRENCY_SYMBOL = "SOMI";

// ABI (Application Binary Interface) hanya untuk fungsi yang akan dipanggil di menu: startGame
const LEADERBOARD_ABI = [
    // Hanya perlu fungsi ini untuk sekarang:
    "function startGame() payable",
    "function submitScore(uint256 score)",
    "function maxScore() view returns (uint256)",
];

// --- VARIABEL GLOBAL ---
let provider = null;
let signer = null;
let WALLET_ADDRESS = null;
let DISPLAY_NAME = "Anonim";
let leaderboardContract = null;
let maxScoreLimit = 3000; // Default

// --- DOM ELEMENTS ---
const menuScreen = document.getElementById('menuScreen');
const playScreen = document.getElementById('playScreen');
const leaderboardScreen = document.getElementById('leaderboardScreen');

const walletStatusEl = document.getElementById('walletStatus');
const displayNameInputEl = document.getElementById('displayNameInput');
const connectWalletBtn = document.getElementById('connectWalletBtn');
const saveNameBtn = document.getElementById('saveNameBtn');
const playBtn = document.getElementById('playBtn');
const menuTxStatusEl = document.getElementById('menuTxStatus');

// --- UTILITY DAN UI FUNCTIONS ---

function updateUI() {
    // 1. Update Status Wallet
    if (WALLET_ADDRESS) {
        walletStatusEl.innerHTML = `Wallet: ${WALLET_ADDRESS.slice(0, 6)}...${WALLET_ADDRESS.slice(-4)}`;
        connectWalletBtn.innerText = "WALLET CONNECTED";
        connectWalletBtn.disabled = true;
    } else {
        walletStatusEl.innerHTML = `Wallet: Not Connected`;
        connectWalletBtn.innerText = "CONNECT WALLET";
        connectWalletBtn.disabled = false;
    }

    // 2. Update Display Name
    displayNameInputEl.value = DISPLAY_NAME;
    displayNameInputEl.disabled = !WALLET_ADDRESS;

    // 3. Update Status Tombol Aksi
    const isReady = WALLET_ADDRESS && DISPLAY_NAME.length > 0;
    
    saveNameBtn.disabled = !WALLET_ADDRESS;
    playBtn.disabled = !isReady;
    
    // Tombol PLAY harus diarahkan ke halaman game baru, tidak memuat iframe
    playBtn.onclick = () => {
        if (isReady) {
            // Langsung navigasi ke halaman game setelah semua ready
            window.location.href = "game.html";
        }
    };
}

function showScreen(screenId) {
    menuScreen.classList.add('hidden');
    playScreen.classList.add('hidden');
    leaderboardScreen.classList.add('hidden');

    if (screenId === 'menu') {
        menuScreen.classList.remove('hidden');
        // Saat kembali ke menu, pastikan semua data terbaru dimuat
        loadPlayerState(); 
    } else if (screenId === 'play') {
        playScreen.classList.remove('hidden');
    } else if (screenId === 'leaderboard') {
        leaderboardScreen.classList.remove('hidden');
        // Muat Leaderboard saat dibuka
        loadLeaderboard();
    }
}

// --- FUNGSI UTAMA WEB3 ---

/**
 * Memastikan MetaMask terhubung dan berada di jaringan SOMNIA.
 */
async function checkNetworkAndSwitch() {
    try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        if (parseInt(chainId, 16) !== SOMNIA_CHAIN_ID) {
            menuTxStatusEl.innerText = "Mengganti jaringan ke Somnia Mainnet...";
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: `0x${SOMNIA_CHAIN_ID.toString(16)}`,
                    chainName: 'Somnia Mainnet',
                    nativeCurrency: {
                        name: SOMNIA_CURRENCY_SYMBOL,
                        symbol: SOMNIA_CURRENCY_SYMBOL,
                        decimals: 18,
                    },
                    rpcUrls: [SOMNIA_RPC_URL],
                    blockExplorerUrls: [SOMNIA_EXPLORER_URL],
                }],
            });
            // Cek ulang setelah switch
            if (parseInt(await window.ethereum.request({ method: 'eth_chainId' }), 16) !== SOMNIA_CHAIN_ID) {
                throw new Error("Gagal terhubung ke Somnia Mainnet.");
            }
        }
        menuTxStatusEl.innerText = "Berhasil terhubung ke Somnia Mainnet.";
        return true;
    } catch (error) {
        menuTxStatusEl.innerText = `Error Jaringan: ${error.message}. Pastikan Anda di Somnia Mainnet.`;
        console.error("Kesalahan Jaringan:", error);
        return false;
    }
}

/**
 * Dipanggil saat tombol CONNECT WALLET ditekan.
 */
async function connectWallet() {
    if (!window.ethereum) {
        alert("MetaMask atau dompet berbasis Ethereum lainnya tidak ditemukan.");
        return;
    }

    try {
        menuTxStatusEl.innerText = "Menghubungkan dompet...";
        
        // 1. Meminta koneksi (jika belum terhubung)
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        WALLET_ADDRESS = accounts[0];

        // 2. Memeriksa dan mengganti jaringan (Jika perlu)
        if (!(await checkNetworkAndSwitch())) {
            WALLET_ADDRESS = null; // Gagal switch, reset status
            updateUI();
            return;
        }

        // 3. Inisiasi Ethers dan Kontrak
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        leaderboardContract = new ethers.Contract(LEADERBOARD_CONTRACT_ADDRESS, LEADERBOARD_ABI, signer);

        // 4. Memuat data pemain dan skor max
        await loadPlayerState();
        
        menuTxStatusEl.innerText = "Koneksi berhasil! Siap bermain.";

    } catch (error) {
        console.error("Koneksi Wallet Gagal:", error);
        menuTxStatusEl.innerText = "Koneksi dompet gagal. " + error.message;
        WALLET_ADDRESS = null;
    }
    updateUI();
}

/**
 * Mengambil nama pemain dari Local Storage dan Max Score dari Kontrak.
 */
async function loadPlayerState() {
    if (!WALLET_ADDRESS) return;

    // 1. Muat Display Name dari Local Storage
    const savedName = localStorage.getItem(`name_${WALLET_ADDRESS}`);
    if (savedName) {
        DISPLAY_NAME = savedName;
    } else {
        // Jika belum ada, gunakan default (Anonim)
        DISPLAY_NAME = "Anonim";
    }

    // 2. Muat Max Score dari Kontrak (Opsional, tapi bagus untuk sinkronisasi)
    if (leaderboardContract) {
         try {
            // Panggil fungsi maxScore()
            const maxScoreFromContract = await leaderboardContract.maxScore();
            maxScoreLimit = maxScoreFromContract.toNumber();
            console.log("Max Score dari Kontrak:", maxScoreLimit);
        } catch (e) {
            console.warn("Gagal mendapatkan maxScore dari kontrak, menggunakan default:", maxScoreLimit);
        }
    }
    
    updateUI();
}

/**
 * Menyimpan nama pemain ke Local Storage.
 */
function saveName() {
    const newName = displayNameInputEl.value.trim().substring(0, 12);
    if (!newName) {
        alert("Nama tampilan tidak boleh kosong!");
        return;
    }
    if (!WALLET_ADDRESS) {
        alert("Harap hubungkan dompet terlebih dahulu.");
        return;
    }

    DISPLAY_NAME = newName;
    localStorage.setItem(`name_${WALLET_ADDRESS}`, newName);
    alert(`Nama Anda (${newName}) berhasil disimpan secara lokal.`);
    updateUI();
}

/**
 * Navigasi ke halaman game.html.
 */
function openPlay() {
    // Fungsi ini akan dipanggil oleh event listener di updateUI()
    // Logika utama hanya redirect, karena Web3 handling ada di game.html
    window.location.href = "game.html"; 
}

/**
 * Menampilkan leaderboard.
 */
function openLeaderboard() {
    window.location.href = "leaderboard.html"; 
}

/**
 * Menutup jendela.
 */
function quitApp() {
    window.open("about:blank", "_self"); 
    window.close();
}


// --- INITIATOR DAN EVENT LISTENERS ---

// Listener untuk perubahan status akun/jaringan MetaMask
window.onload = () => {
    // 1. Coba koneksi otomatis saat halaman dimuat
    if (window.ethereum) {
        // Coba inisiasi jika MetaMask sudah terhubung
        window.ethereum.on('accountsChanged', (accounts) => {
            WALLET_ADDRESS = accounts.length > 0 ? accounts[0] : null;
            loadPlayerState();
        });
        window.ethereum.on('chainChanged', () => {
            // Refresh jika jaringan berubah
            window.location.reload(); 
        });
        
        // Coba koneksi segera setelah onload (tanpa meminta izin lagi)
        if (window.ethereum.selectedAddress) {
            connectWallet();
        }
    }
    
    // 2. Hubungkan Tombol dengan Fungsi
    connectWalletBtn.addEventListener('click', connectWallet);
    saveNameBtn.addEventListener('click', saveName);
    playBtn.addEventListener('click', openPlay); // Logika redirect ada di updateUI
    document.getElementById('leaderboardBtn').addEventListener('click', openLeaderboard);
    document.getElementById('quitBtn').addEventListener('click', quitApp);

    // 3. Muat status awal
    updateUI();
};

