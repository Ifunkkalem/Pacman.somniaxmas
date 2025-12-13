// app.js (FINAL & FIXED VERSION)
// Requires ethers v5 UMD loaded in index.html

// ---------------- CONFIG ----------------
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  "function startFeeWei() view returns (uint256)",
  "function startGame() payable",
  "function submitScore(uint256 _score)",
  // <<<--- Tambahkan ABI untuk Top Score jika diperlukan (diasumsikan di tempat lain)
];

// Somnia Network Configuration (Chain ID 5031)
const SOMNIA_CHAIN_ID = '0x13a7'; // 5031 in hex
const SOMNIA_NETWORK_CONFIG = {
    chainId: SOMNIA_CHAIN_ID,
    chainName: 'Somnia Mainnet',
    nativeCurrency: { name: 'SOMI', symbol: 'SOMI', decimals: 18 },
    rpcUrls: ['https://somnia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://explorer.somnia.network']
};

// audio paths (relative to index.html)
const SFX_START_SRC = "assets/sfx_start.mp3";
const SFX_DOT_EAT_SRC = "assets/sfx_dot_eat.mp3";
const BGM_SRC = "assets/music_background.mp3"; // File 1MB Anda

// ---------------- STATE ----------------
let provider = null;
let signer = null;
let userAddress = null;
let readContract = null;
let gameContract = null;
let startFeeWei = null;

let backgroundMusic = null;
let sfxStart = null;
let sfxDot = null;
let audioUnlocked = false;
let isGameActive = false; 

// ---------------- HELPERS ----------------
const $ = (id) => document.getElementById(id);
const safeText = (id, txt) => { const el = $(id); if(el) el.textContent = txt; };

function initAudio() {
  if (sfxStart && sfxDot) return;
  try { sfxStart = new Audio(SFX_START_SRC); sfxStart.volume = 0.95; } catch(e){ sfxStart = null; }
  try { sfxDot = new Audio(SFX_DOT_EAT_SRC); sfxDot.volume = 0.8; } catch(e){ sfxDot = null; }
}

async function loadBackgroundMusic() {
    return new Promise((resolve) => {
        if (backgroundMusic && backgroundMusic.readyState >= 3) return resolve();
        
        try {
            backgroundMusic = new Audio(BGM_SRC);
            backgroundMusic.loop = true;
            backgroundMusic.volume = 0.35;
            
            // Tunggu hingga BGM siap diputar
            backgroundMusic.addEventListener('canplaythrough', () => {
                console.log("BGM file loaded and ready to play (1MB).");
                resolve();
            }, { once: true });
            
            // Fallback: Resolve setelah 10 detik, walau gagal.
            setTimeout(() => {
                if (!backgroundMusic || backgroundMusic.readyState < 3) {
                    console.warn("BGM loading timeout (10s). Proceeding without BGM.");
                    resolve();
                }
            }, 10000); 
            
        } catch (e) { 
            backgroundMusic = null;
            console.error("Failed to initialize Audio object for BGM:", e);
            resolve();
        }
    });
}

function unlockAudioOnGesture() {
  if (audioUnlocked) return;
  initAudio();
  
  const tryPlay = () => {
    if (sfxStart) {
        sfxStart.volume = 0; 
        sfxStart.play().then(() => {
            sfxStart.volume = 0.95; 
            audioUnlocked = true;
            window.removeEventListener('pointerdown', tryPlay);
            console.log("Audio Context unlocked via SFX.");
        }).catch(() => {
             audioUnlocked = true;
             window.removeEventListener('pointerdown', tryPlay);
        });
    } else {
        audioUnlocked = true;
        window.removeEventListener('pointerdown', tryPlay);
    }
  };
  window.addEventListener('pointerdown', tryPlay, { once: true });
}

function playDotSound() {
  try {
    if (!audioUnlocked) initAudio();
    if (sfxDot) {
      const inst = sfxDot.cloneNode();
      inst.volume = sfxDot.volume;
      inst.play().catch(()=>{});
    }
  } catch (e) { console.warn("dot sound failed", e); }
}

function startBackgroundMusic() {
  try {
    if (backgroundMusic) {
      backgroundMusic.currentTime = 0; 
      backgroundMusic.volume = 0.35; 
      backgroundMusic.play().catch((e)=>{ console.error("Final BGM play failed:", e); }); 
    }
  } catch (e) { console.warn("bgm start failed", e); }
}

function playStartSfx() {
  try {
    if (sfxStart) { sfxStart.currentTime = 0; sfxStart.play().catch(()=>{}); }
  } catch (e) { console.warn("start sfx failed", e); }
}


// ---------------- WALLET & CONTRACT ----------------
async function switchNetwork(provider) {
    const { chainId } = await provider.getNetwork();
    if (chainId.toString() !== '5031') {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: SOMNIA_CHAIN_ID }],
            });
            // Give time for network switch to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        } catch (switchError) {
            if (switchError.code === 4902) { // Network not added
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [SOMNIA_NETWORK_CONFIG],
                    });
                    // After adding, we assume switch is automatic or next check will handle it
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return true;
                } catch (addError) {
                    console.error("Failed to add Somnia network", addError);
                    alert("Failed to add Somnia network. Please add it manually.");
                    return false;
                }
            } else {
                 console.error("Failed to switch network", switchError);
                 alert("Failed to switch to Somnia network. Please switch manually.");
                 return false;
            }
        }
    }
    return true;
}

async function connectWallet() {
  initAudio();
  unlockAudioOnGesture();

  if (!window.ethereum) {
    alert("No wallet provider found (MetaMask / WalletConnect).");
    return false;
  }
  try {
    // 1. Request accounts and initialize provider
    provider = new ethers.providers.Web3Provider(window.ethereum, "any"); 
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    
    // 2. Switch/Add Network to Somnia
    const networkSwitched = await switchNetwork(provider);
    if (!networkSwitched) return false;
    
    // After potential switch, re-initialize provider and signer
    provider = new ethers.providers.Web3Provider(window.ethereum, "any"); 
    signer = provider.getSigner();
    
    // 3. Create contract instances
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // 4. Update UI and fetch data
    safeText("walletAddr", "Wallet: " + userAddress.substring(0,6) + "..." + userAddress.slice(-4));
    
    try {
      const balWei = await provider.getBalance(userAddress);
      safeText("walletBal", "SOMI: " + Number(ethers.utils.formatEther(balWei)).toFixed(6));
    } catch(e){ console.warn("balance fetch failed", e); }

    try {
      startFeeWei = await readContract.startFeeWei();
      // Safe guard for index.html display if needed, but not critical here
    } catch (e) {
      startFeeWei = ethers.utils.parseEther("0.01");
      console.warn("failed read startFeeWei:", e);
    }
    
    // 5. Notify index (for UI update)
    try { 
        window.postMessage({ 
            type: "walletInfo", 
            address: userAddress, 
            balance: Number(ethers.utils.formatEther(await provider.getBalance(userAddress))).toFixed(6)
        }, "*"); 
    } catch(e){}

    console.log("Connected to Somnia Network", userAddress);
    return true;
  } catch (err) {
    console.error("connectWallet error", err);
    // 4001 is user rejected request
    if (err.code !== 4001) {
        alert("Connect failed: " + (err && err.message ? err.message : String(err)));
    }
    return false;
  }
}

// pay to play (on-chain) then start game
async function payToPlay() {
  initAudio();
  unlockAudioOnGesture();

  if (!signer || !gameContract || !userAddress) {
    alert("Please connect wallet first.");
    return false;
  }

  // Ensure network is still Somnia
  const networkOk = await switchNetwork(provider);
  if (!networkOk) return false;
  
  // ensure startFeeWei
  if (!startFeeWei) {
    try { startFeeWei = await readContract.startFeeWei(); } catch(e){ startFeeWei = ethers.utils.parseEther("0.01"); }
  }
  
  // 🛑 Wajib: Tunggu BGM yang besar selesai dimuat SEBELUM Transaksi
  console.log("Starting BGM loading (expect 1MB) and waiting...");
  await loadBackgroundMusic(); 

  try {
    // check balance
    const bal = await provider.getBalance(userAddress);
    if (bal.lt(startFeeWei)) {
      alert("Insufficient balance to pay start fee. Need " + ethers.utils.formatEther(startFeeWei) + " SOMI.");
      return false;
    }

    // send tx
    const tx = await gameContract.startGame({ value: startFeeWei });
    console.log("startGame tx:", tx.hash);
    try { window.postMessage({ type: "startTxSent", txHash: tx.hash }, "*"); } catch(e){}

    alert("Transaction sent. Waiting for confirmation...");
    
    // <<<--- FIX INI ---<<<
    // Mengirim sinyal "waitingForTx" ke iframe agar pesan di gameFrame muncul
    const gameFrame = $("gameFrame");
    if (gameFrame && gameFrame.contentWindow) {
      gameFrame.contentWindow.postMessage({ type: "waitingForTx" }, "*");
    }
    // <<<--- AKHIR FIX ---<<<

    await tx.wait();

    // Game is now active
    isGameActive = true;
    
    playStartSfx(); 
    startBackgroundMusic();
    
    // FIX PENTING: NOTIFIKASI IFRAME UNTUK MEMULAI GAME & MENGAKTIFKAN D-PAD
    
    try { 
      // Kirim ke index (wrapper)
      window.postMessage({ type: "paySuccess" }, "*");
      
      // <<<--- FIX INI: Kirim ke iframe game secara eksplisit (ini yang mengaktifkan allowLocalPlay) ---<<<
      if (gameFrame && gameFrame.contentWindow) {
         gameFrame.contentWindow.postMessage({ type: "paySuccess" }, "*");
         console.log("Sent 'paySuccess' to game iframe. D-Pad and Countdown now active.");
      }
      // <<<--- AKHIR FIX ---<<<
    } catch(e){ console.warn("postMessage paySuccess failed", e); }

    // Update UI
    if ($("logoPlaceholder")) $("logoPlaceholder").style.display = "none";
    if (gameFrame) gameFrame.style.display = "block";

    // refresh UI summary on index
    try { window.postMessage({ type: "refreshSummary" }, "*"); } catch(e){}

    return true;
  } catch (err) {
    console.error("payToPlay failed", err);
    // 4001 is user rejected request
    if (err.code !== 4001) {
        alert("Payment failed: " + (err && err.message ? err.message : String(err)));
    }
    return false;
  }
}

// submit score on-chain
async function submitScoreTx(score) {
  if (!gameContract || !signer || !userAddress) {
    alert("Please connect wallet before submitting score.");
    return;
  }
  if (!score || isNaN(Number(score)) || Number(score) <= 0) {
    alert("Invalid score.");
    return;
  }

  try {
    // pause bgm
    if (backgroundMusic) { backgroundMusic.pause(); backgroundMusic.currentTime = 0; }
    const tx = await gameContract.submitScore(Number(score));
    console.log("submitScore tx:", tx.hash);
    alert("Score submission sent. Waiting for confirmation...");
    await tx.wait();
    alert("Score submitted on-chain ✅");
    // ask index to show leaderboard
    try { window.postMessage({ type: "scoreSubmitted" }, "*"); } catch(e){}
  } catch (err) {
    console.error("submitScore error", err);
    // 4001 is user rejected request
    if (err.code !== 4001) {
        alert("Submit score failed: " + (err && err.message ? err.message : String(err)));
    }
  }
}

// ---------------- MESSAGE HANDLER ----------------
window.addEventListener("message", async (ev) => {
  const data = ev.data || {};
  if (!data || typeof data !== "object") return;

  if (data.type === "dotEaten") {
    if (isGameActive) playDotSound();
    return;
  }

  if (data.type === "submitScore") {
    await submitScoreTx(data.score);
    return;
  }

  if (data.type === "requestConnectWallet") {
    await connectWallet();
    return;
  }

  if (data.type === "requestStartGame") {
    if (!signer) {
      const ok = await connectWallet();
      if (!ok) return;
    }
    await payToPlay();
    return;
  }
  
  // <<<--- FIX INI: Listener untuk merespons permintaan status dari iframe ---<<<
  if (data.type === 'requestGameStatus') {
      const gameFrame = $("gameFrame");
      if (gameFrame && gameFrame.contentWindow) {
          // Mengirim status koneksi/kesiapan kembali ke iframe
          gameFrame.contentWindow.postMessage({ 
              type: 'gameStatusResponse', 
              // Jika signer ada, asumsikan sudah siap bermain (atau sudah pernah bayar)
              allowLocalPlay: !!signer 
          }, ev.origin);
          console.log("Responded to 'requestGameStatus' from iframe.");
      }
      return;
  }
  // <<<--- AKHIR FIX ---<<<

});

// ---------------- DOM READY: wire UI ----------------
document.addEventListener("DOMContentLoaded", () => {
  initAudio();
  unlockAudioOnGesture();

  const btnConnect = $("btnConnect") || $("connectWalletBtn");
  const btnPlay = $("btnPlay") || $("playBtn");
  const btnLeaderboard = $("btnLeaderboard") || $("leaderboardBtn");

  if (btnConnect) btnConnect.addEventListener("click", async () => {
    await connectWallet();
  });

  if (btnPlay) btnPlay.addEventListener("click", async () => {
    if (!signer) {
      const ok = await connectWallet();
      if (!ok) return;
    }
    await payToPlay();
  });

  if (btnLeaderboard) btnLeaderboard.addEventListener("click", async () => {
    const lf = $("leaderFrame") || $("leaderboardFrame");
    const gf = $("gameFrame");
    const logo = $("logoPlaceholder");

    if (logo) logo.style.display = "none";
    if (gf) gf.style.display = "none";
    
    if (lf) {
      lf.src = "leaderboard.html?ts=" + Date.now();
      lf.style.display = "block";
    }
  });

  // Check connection status on load (best effort)
  (async ()=> {
    if (window.ethereum) {
      try {
        const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
        const accounts = await tempProvider.listAccounts();
        if (accounts && accounts.length > 0) {
          // If already connected, run a soft connect to populate UI
          await connectWallet(); 
        }
      } catch(e){ /* ignore failures on auto-check */ }
    }
  })();
});
                        
