// app.js
// Requires ethers v5 UMD loaded in index.html

let provider, signer, userAddress;
let gameContract;    // contract instance with signer
let readContract;    // contract instance read-only
let startFeeWei;     // BigNumber

// --- KONTROL AUDIO BARU ---
// Pastikan file suara ini ada di lokasi yang benar
const gameStartSound = new Audio('assets/sfx_start.mp3'); 
const dotEatSound = new Audio('assets/sfx_dot_eat.mp3'); 
dotEatSound.volume = 0.5; // Contoh set volume 50%
const backgroundMusic = new Audio('assets/music_background.mp3');
backgroundMusic.loop = true;

// Variabel untuk melacak status game (digunakan untuk mencegah sound autoplay)
let isGameActive = false;


// ================================
// ✅ CONNECT WALLET
// ================================
async function connectWallet() {
  if (!window.ethereum) {
    alert("Wallet tidak ditemukan. Gunakan MetaMask atau wallet EVM.");
    return;
  }

  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    // ✅ Update UI
    document.getElementById("walletDisplay").innerText = userAddress;

    const balWei = await provider.getBalance(userAddress);
    document.getElementById("walletBalance").innerText =
      ethers.utils.formatEther(balWei) + " SOMI";

    // ✅ Contract instance
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // ✅ Ambil startFee dari contract
    try {
      startFeeWei = await readContract.startFeeWei();
    } catch (e) {
      console.warn("startFeeWei read failed, fallback to 0.01 SOMI");
      startFeeWei = ethers.utils.parseEther("0.01");
    }

    alert("✅ Wallet connected");
    
    // Play sound on user interaction (connect) to enable audio context
    backgroundMusic.play().catch(e => console.log("Background music blocked:", e));


  } catch (err) {
    console.error("CONNECT ERROR:", err);
    alert("Gagal connect wallet: " + (err.message || err));
  }
}

// ================================
// ✅ PAY TO PLAY / START GAME
// ================================
async function payToPlay() {
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

    const tx = await gameContract.startGame({ value: startFeeWei });

    alert("⏳ Menunggu konfirmasi pembayaran...\nTX: " + tx.hash);
    await tx.wait();

    alert("✅ Payment sukses — game dapat dimulai.");
    
    // --- INTEGRASI SUARA: Game Start ---
    gameStartSound.play();
    isGameActive = true;

    // ✅ Notify iframe bahwa payment sukses
    const iframe = document.getElementById("gameFrame");
    iframe.contentWindow.postMessage({ type: "paySuccess" }, "*");

    // ✅ Tampilkan game
    iframe.style.display = "block";
    document.getElementById("leaderboardFrame").style.display = "none";

  } catch (err) {
    console.error("PAY ERROR:", err);

    if (err.code === 4001) {
      alert("Transaksi dibatalkan user.");
    } else {
      alert("Payment gagal: " + (err.message || err));
    }
  }
}

// ================================
// ✅ SUBMIT SCORE (DIPERBAIKI UNTUK V2.0)
// ================================
async function submitScoreTx(latestScore) {
  if (!gameContract || !userAddress) {
    alert("Wallet belum connect.");
    return;
  }

  try {
    console.log("Submitting score:", latestScore);

    // ⚠️ PERUBAHAN V2.0: Kontrak Solidity yang menghitung total score akumulasi.
    // Kita HANYA mengirimkan score yang didapatkan Sesi ini.
    const tx = await gameContract.submitScore(latestScore); 

    alert("⏳ Mengirim skor ke blockchain...\nTX: " + tx.hash);
    await tx.wait();

    alert("✅ Skor berhasil dikirim ke leaderboard!");
    isGameActive = false; // Game selesai
    
  } catch (err) {
    console.error("SUBMIT SCORE ERROR:", err);
    alert("❌ Gagal submit score: " + (err.message || err));
  }
}

// ================================
// ✅ LOAD LEADERBOARD IFRAME
// ================================
function loadLeaderboardFrame() {
  const lb = document.getElementById("leaderboardFrame");

  lb.src = "leaderboard.html?ts=" + Date.now();
  lb.style.display = "block";

  document.getElementById("gameFrame").style.display = "none";
}

// ================================
// ✅ LISTENER MESSAGE DARI GAME
// ================================
window.addEventListener("message", (ev) => {
  const data = ev.data || {};

  // ✅ Saat game kirim score
  if (data.type === "submitScore") {
    submitScoreTx(data.score);
  }
  
  // --- INTEGRASI SUARA: Makan Dot ---
  if (data.type === "dotEaten" && isGameActive) {
      // Reset waktu putar agar suara bisa diulang cepat (untuk efek Pac-Man makan)
      dotEatSound.currentTime = 0;
      dotEatSound.play().catch(e => console.log("Dot sound failed:", e)); 
  }

  // ✅ Saat game minta info start fee
  if (data.type === "requestStartFee") {
    if (startFeeWei) {
      const feeEth = ethers.utils.formatEther(startFeeWei);

      document.getElementById("gameFrame").contentWindow.postMessage(
        {
          type: "startFee",
          feeWei: startFeeWei.toString(),
          feeEth
        },
        "*"
      );
    }
  }
});

// ================================
// ✅ LOGIKA KONTROL MOBILE (D-PAD) BARU
// ================================

// Fungsi yang mengirimkan input ke iframe game
function sendInputToGame(direction) {
    const iframe = document.getElementById("gameFrame");
    if (iframe && isGameActive) {
        // Asumsi game di dalam iframe mendengarkan event ini
        iframe.contentWindow.postMessage({ 
            type: "mobileInput", 
            direction: direction 
        }, "*");
    }
}

// Tambahkan event listener saat DOM fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const controlButtons = document.querySelectorAll('#mobile-controls button');
    
    controlButtons.forEach(button => {
        const direction = button.getAttribute('data-direction');

        // Menggunakan touchstart dan touchend untuk responsif di HP
        button.addEventListener('touchstart', (event) => {
            event.preventDefault(); // Mencegah scrolling/zoom
            sendInputToGame(direction);
            button.style.backgroundColor = '#8b0000'; // Umpan balik visual
        });

        button.addEventListener('touchend', (event) => {
            event.preventDefault();
            sendInputToGame("STOP"); // Opsional: Kirim sinyal stop atau null
            button.style.backgroundColor = '#ff0000'; // Kembalikan warna
        });
        
        // Tambahkan listeners mouseup/mousedown untuk dukungan PC/Click
        button.addEventListener('mousedown', () => {
            sendInputToGame(direction);
        });
        button.addEventListener('mouseup', () => {
            sendInputToGame("STOP");
        });
    });
});
    
