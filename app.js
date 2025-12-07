// app.js
// Requires ethers v5 UMD loaded in index.html

// =======================================================
// 1. KONFIGURASI KONTRAK (HARUS DIGANTI)
// =======================================================
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3"; 
const CONTRACT_ABI = [ 
    "function startFeeWei() view returns (uint256)",
    "function startGame() payable",
    "function submitScore(uint256 _score)",
    // Tambahkan ABI lain yang diperlukan
];

// Path audio (RELATIF DARI index.html)
const SFX_START_SRC = 'pacman/assets/sfx_start.mp3';
const SFX_DOT_EAT_SRC = 'pacman/assets/sfx_dot_eat.mp3';
const BGM_SRC = 'pacman/assets/music_background.mp3';

// =======================================================
// 2. VARIABEL GLOBAL & KONTROL AUDIO
// =======================================================
let provider, signer, userAddress;
let gameContract;    
let readContract;    
let startFeeWei;     
let isAudioInitialized = false;

let gameStartSound, dotEatSound, backgroundMusic;
let isGameActive = false;

/**
 * Mengaktifkan Audio Context dan menginisialisasi objek audio.
 */
function initializeAudio() {
    if (isAudioInitialized) return;
    
    try {
        gameStartSound = new Audio(SFX_START_SRC); 
        dotEatSound = new Audio(SFX_DOT_EAT_SRC); 
        backgroundMusic = new Audio(BGM_SRC);
        
        dotEatSound.volume = 0.5; 
        backgroundMusic.loop = true;
        backgroundMusic.volume = 0.35;
        
        // Memaksa aktivasi Audio Context dengan pemutaran senyap pertama
        backgroundMusic.play().catch(e => console.log('Audio Context activated on first user click.'));
        backgroundMusic.pause();

        isAudioInitialized = true;
        console.log("Audio Context Activated.");
    } catch (e) {
        console.error("Error initializing audio elements:", e);
    }
}

// =======================================================
// 3. FUNGSI WALLET & UI
// =======================================================
async function connectWallet() {
    initializeAudio(); 

    if (!window.ethereum) {
        alert("Wallet tidak ditemukan. Gunakan MetaMask atau wallet EVM.");
        return;
    }

    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();

        // Update UI Wallet
        document.getElementById("walletDisplay").innerText = userAddress.substring(0, 6) + '...' + userAddress.substring(userAddress.length - 4);
        
        const balWei = await provider.getBalance(userAddress);
        document.getElementById("walletBalance").innerText = ethers.utils.formatEther(balWei) + " SOMI";

        // Contract instance
        readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        // Ambil startFee
        try {
            startFeeWei = await readContract.startFeeWei();
            const feeEth = ethers.utils.formatEther(startFeeWei);
            document.getElementById("feeDisplay").innerText = feeEth;
        } catch (e) {
            console.warn("startFeeWei read failed, fallback to 0.01 SOMI");
            startFeeWei = ethers.utils.parseEther("0.01");
            document.getElementById("feeDisplay").innerText = "0.01 (Fallback)";
        }
        
        document.getElementById("playBtn").style.display = 'block'; 
        document.getElementById("connectWalletBtn").style.display = 'none'; 
        document.getElementById("gameMessage").innerText = 'Siap bermain! Bayar Fee untuk memulai.';

    } catch (err) {
        console.error("CONNECT ERROR:", err);
        alert("Gagal connect wallet: " + (err.message || err.reason || err));
    }
}

// =======================================================
// 4. PAY TO PLAY / START GAME
// =======================================================
async function payToPlay() {
    initializeAudio(); 

    if (!gameContract || !signer || !userAddress) {
        alert("Connect wallet dulu.");
        return;
    }

    try {
        const balWei = await provider.getBalance(userAddress);
        if (balWei.lt(startFeeWei)) {
            alert("Saldo SOMI tidak cukup untuk membayar fee.");
            return;
        }
        
        document.getElementById("gameMessage").innerText = 'Memproses transaksi...';
        const tx = await gameContract.startGame({ value: startFeeWei });
        
        await tx.wait(); 

        document.getElementById("gameMessage").innerText = 'Pembayaran sukses! Pilih level Anda.';

        // --- INTEGRASI SUARA: BGM dan Game Start ---
        backgroundMusic.currentTime = 0;
        backgroundMusic.play().catch(e => console.warn("BGM play failed, maybe still blocked.", e));
        gameStartSound.currentTime = 0; 
        gameStartSound.play();
        
        isGameActive = true;

        // Notify iframe bahwa payment sukses
        const iframe = document.getElementById("gameFrame");
        iframe.contentWindow.postMessage({ type: "paySuccess" }, "*");

        // Tampilkan game
        iframe.style.display = "block";
        document.getElementById("leaderboardFrame").style.display = "none";

    } catch (err) {
        console.error("PAY ERROR:", err);
        document.getElementById("gameMessage").innerText = 'Gagal membayar fee.';
        if (err.code === 4001) {
            alert("Transaksi dibatalkan user.");
        } else {
            alert("Payment gagal: " + (err.message || err.reason || err));
        }
    }
}

// =======================================================
// 5. SUBMIT SCORE
// =======================================================
async function submitScoreTx(latestScore) {
  if (!gameContract || !userAddress || latestScore <= 0) {
    alert("Wallet belum connect atau skor tidak valid.");
    return;
  }
  
  // Hentikan musik latar
  backgroundMusic.pause();
  backgroundMusic.currentTime = 0; 

  try {
    document.getElementById("gameMessage").innerText = `Mengirim skor ${latestScore} ke Leaderboard...`;

    const tx = await gameContract.submitScore(latestScore); 

    await tx.wait();

    document.getElementById("gameMessage").innerText = 'Skor berhasil di-submit.';
    alert("✅ Skor berhasil dikirim ke leaderboard!");
    isGameActive = false; 
    loadLeaderboardFrame(); 

  } catch (err) {
    console.error("SUBMIT SCORE ERROR:", err);
    document.getElementById("gameMessage").innerText = 'Gagal submit skor.';
    
    // Penanganan Error Execution Reverted yang lebih spesifik
    let errMsg = "Gagal submit score. Error umum.";
    if (err.reason && err.reason.includes("execution reverted")) {
         errMsg = "❌ Error: Transaksi ditolak oleh kontrak (Execution Reverted). Cek batas skor atau status pembayaran.";
    } else if (err.message) {
         errMsg = "❌ Gagal submit: " + err.message;
    }
    alert(errMsg);
  }
}

// =======================================================
// 6. LOAD LEADERBOARD
// =======================================================
function loadLeaderboardFrame() {
  document.getElementById("gameFrame").style.display = "none";

  const lb = document.getElementById("leaderboardFrame");
  lb.src = "leaderboard.html?ts=" + Date.now();
  lb.style.display = "block";
}

// =======================================================
// 7. LISTENER MESSAGE DARI GAME (IFRAME)
// =======================================================
window.addEventListener("message", (ev) => {
  const data = ev.data || {};

  // Saat game kirim score
  if (data.type === "submitScore") {
    submitScoreTx(data.score);
  }
  
  // --- INTEGRASI SUARA: Makan Dot (FIX) ---
  if (data.type === "dotEaten" && isGameActive) {
      if (dotEatSound) {
          // Solusi: Reset dan Putar Cepat untuk menghindari pemotongan
          dotEatSound.currentTime = 0;
          dotEatSound.play().catch(e => {
              console.warn("Dot sound failed on reset play, trying fresh instance.");
              // Fallback: Buat objek audio baru
              const freshDot = new Audio(SFX_DOT_EAT_SRC);
              freshDot.volume = 0.5;
              freshDot.play().catch(e => console.warn("Fresh dot sound failed.", e));
          });
      }
  }

  // Saat game minta info start fee
  if (data.type === "requestStartFee") {
    if (startFeeWei) {
      const feeEth = ethers.utils.formatEther(startFeeWei);
      document.getElementById("gameFrame").contentWindow.postMessage(
        { type: "startFee", feeEth: feeEth }, "*");
    }
  }
});

// =======================================================
// 8. LOGIKA KONTROL MOBILE (D-PAD)
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    // Tombol utama
    document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);
    document.getElementById('playBtn').addEventListener('click', payToPlay);
    document.getElementById('leaderboardBtn').addEventListener('click', loadLeaderboardFrame);

    const gameFrame = document.getElementById("gameFrame");
    const dpadContainer = document.getElementById('dpad-container-cross'); // Menggunakan ID baru
    
    // Fungsi yang mengirimkan input ke iframe game
    function sendInputToGame(direction) {
        if (gameFrame && isGameActive) {
            gameFrame.contentWindow.postMessage({ 
                type: "mobileInput", 
                direction: direction 
            }, "*");
        }
    }

    // Event listeners untuk D-PAD
    dpadContainer.querySelectorAll('button').forEach(button => {
        const direction = button.getAttribute('data-direction');

        // TouchStart/MouseDown: Kirim arah
        const startEvent = (event) => {
            event.preventDefault();
            sendInputToGame(direction);
            button.style.backgroundColor = '#8b0000'; 
        };

        // TouchEnd/MouseUp/MouseLeave: Kirim STOP
        const endEvent = (event) => {
            event.preventDefault();
            sendInputToGame("STOP");
            button.style.backgroundColor = '#ef4444'; 
        };

        button.addEventListener('touchstart', startEvent);
        button.addEventListener('mousedown', startEvent);
        
        button.addEventListener('touchend', endEvent);
        button.addEventListener('mouseup', endEvent);
        button.addEventListener('mouseleave', (e) => {
            if (e.buttons === 1) endEvent(e);
        });
    });
});
          
