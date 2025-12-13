// app.js (FINAL CLEANED & FIXED)
// Requires ethers v5 UMD loaded in index.html

// ---------------- CONFIG ----------------
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  "function startFeeWei() view returns (uint256)",
  "function startGame() payable",
  "function submitScore(uint256 _score)"
];

// audio paths (relative to index.html)
const SFX_START_SRC = "assets/sfx_start.mp3";
const SFX_DOT_EAT_SRC = "assets/sfx_dot_eat.mp3";
const BGM_SRC = "assets/music_background.mp3";

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

let isGameActive = false; // only true after successful on-chain start

// ---------------- HELPERS ----------------
const $ = (id) => document.getElementById(id);
const safeText = (id, txt) => { const el = $(id); if(el) el.textContent = txt; };

// graceful init audio objects (no autoplay)
function initAudio() {
  if (backgroundMusic && sfxStart && sfxDot) return;
  
  // Inisialisasi SFX yang kecil terlebih dahulu (prioritas)
  try { sfxStart = new Audio(SFX_START_SRC); sfxStart.volume = 0.95; } catch(e){ sfxStart = null; }
  try { sfxDot = new Audio(SFX_DOT_EAT_SRC); sfxDot.volume = 0.8; } catch(e){ sfxDot = null; }

  // Inisialisasi BGM (bisa jadi file besar)
  try {
    backgroundMusic = new Audio(BGM_SRC);
    backgroundMusic.loop = true;
    backgroundMusic.volume = 0.35; 
  } catch (e){ backgroundMusic = null; }
}

// unlock audio on first user gesture (best-effort)
// FIX: Membiarkan BGM berjalan senyap (volume 0) setelah unlock
// agar Audio Context tetap aktif selama konfirmasi transaksi.
function unlockAudioOnGesture() {
  if (audioUnlocked) return;
  initAudio();
  const tryPlay = () => {
    if (backgroundMusic) {
      // 1. Set volume ke 0 (senyap)
      backgroundMusic.volume = 0; 
      // 2. Coba putar. Jika berhasil, biarkan berjalan senyap
      backgroundMusic.play().then(()=> {
        audioUnlocked = true;
        window.removeEventListener('pointerdown', tryPlay);
        console.log("Audio Context unlocked and BGM running silently.");
      }).catch((e)=> { 
        // Fallback jika gagal play (kemungkinan file besar/lambat)
        audioUnlocked = true;
        window.removeEventListener('pointerdown', tryPlay);
        console.warn("BGM play failed during unlock. Check file size/loading issue.", e);
      });
    } else {
      audioUnlocked = true;
      window.removeEventListener('pointerdown', tryPlay);
    }
  };
  window.addEventListener('pointerdown', tryPlay, { once: true });
}

// safe play small SFX (handles concurrent plays)
function playDotSound() {
  try {
    if (!audioUnlocked) initAudio();
    if (sfxDot) {
      // reusing element can get cut; create temp clone for rapid repeats
      const inst = sfxDot.cloneNode();
      inst.volume = sfxDot.volume;
      inst.play().catch(()=>{});
    } else {
      const t = new Audio(SFX_DOT_EAT_SRC);
      t.volume = 0.8;
      t.play().catch(()=>{});
    }
  } catch (e) { console.warn("dot sound failed", e); }
}

// Fungsi untuk memulai BGM (setelah pay-to-play sukses)
function startBackgroundMusic() {
  try {
    if (backgroundMusic) {
      // 1. Reset waktu untuk mulai dari awal
      backgroundMusic.currentTime = 0; 
      // 2. Naikkan volume ke nilai normal
      backgroundMusic.volume = 0.35; 
      backgroundMusic.play().catch((e)=>{ console.error("Final BGM play failed:", e); }); 
    }
  } catch (e) { console.warn("bgm start failed", e); }
}

// Fungsi opsional untuk SFX start (dipisah dari BGM)
function playStartSfx() {
  try {
    if (sfxStart) { sfxStart.currentTime = 0; sfxStart.play().catch(()=>{}); }
  } catch (e) { console.warn("start sfx failed", e); }
}


// ---------------- WALLET & CONTRACT ----------------
async function connectWallet() {
  initAudio();
  unlockAudioOnGesture();

  if (!window.ethereum) {
    alert("No wallet provider found (MetaMask / WalletConnect).");
    return false;
  }
  try {
    // FIX: Menggunakan ethers.providers.Web3Provider untuk v5
    provider = new ethers.providers.Web3Provider(window.ethereum, "any"); 
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    // create contract instances
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    // Pastikan jaringan sudah di Somnia Mainnet (Chain ID 1729)
    const { chainId } = await provider.getNetwork();
    if (chainId.toString() !== '5031') {
        const somniaConfig = {
            chainId: '0x13a7', // 1729 dalam heksa
            chainName: 'Somnia Mainnet',
            nativeCurrency: { name: 'SOMI', symbol: 'SOMI', decimals: 18 },
            rpcUrls: ['https://somnia-json-rpc.stakely.io'],
            blockExplorerUrls: ['https://explorer.somnia.network']
        };
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: somniaConfig.chainId }],
            });
        } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [somniaConfig],
                    });
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


    // update UI (if elements exist)
    safeText("walletAddr", "Wallet: " + userAddress.substring(0,6) + "..." + userAddress.slice(-4));
    try {
      // FIX: Menggunakan ethers.utils.formatEther untuk v5
      const balWei = await provider.getBalance(userAddress);
      safeText("walletBal", "SOMI: " + Number(ethers.utils.formatEther(balWei)).toFixed(6));
    } catch(e){ console.warn("balance fetch failed", e); }

    // read start fee (best-effort)
    try {
      startFeeWei = await readContract.startFeeWei();
      safeText("feeDisplay", ethers.utils.formatEther(startFeeWei));
    } catch (e) {
      startFeeWei = ethers.utils.parseEther("0.01");
      safeText("feeDisplay", "0.01 (fallback)");
      console.warn("failed read startFeeWei:", e);
    }

    // enable play button UI if exists
    const playBtn = $("btnPlay") || $("playBtn");
    if (playBtn) playBtn.style.display = "block";

    // notify index (if index wants this)
    try { window.postMessage({ type: "walletInfo", address: userAddress }, "*"); } catch(e){}

    console.log("Connected", userAddress);
    return true;
  } catch (err) {
    console.error("connectWallet error", err);
    alert("Connect failed: " + (err && err.message ? err.message : String(err)));
    return false;
  }
}

// pay to play (on-chain) then start game
async function payToPlay() {
  initAudio();
  unlockAudioOnGesture();

  if (!signer || !gameContract || !userAddress) {
    alert("Please connect wallet first.");
    return;
  }

  // ensure startFeeWei
  if (!startFeeWei) {
    try { startFeeWei = await readContract.startFeeWei(); } catch(e){ startFeeWei = ethers.utils.parseEther("0.01"); }
  }

  try {
    // check balance
    const bal = await provider.getBalance(userAddress);
    if (bal.lt(startFeeWei)) {
      alert("Insufficient balance to pay start fee.");
      return;
    }

    // send tx
    const tx = await gameContract.startGame({ value: startFeeWei });
    console.log("startGame tx:", tx.hash);
    // optional notify index
    try { window.postMessage({ type: "startTxSent", txHash: tx.hash }, "*"); } catch(e){}

    await tx.wait();

    // mark game active and play audio
    isGameActive = true;
    
    // PANGGIL FUNGSI YANG DIPISAHKAN
    playStartSfx(); // Mainkan SFX startup (jika ada)
    startBackgroundMusic(); // Mainkan BGM

    // notify iframe and index
    try { 
      window.postMessage({ type: "paySuccess" }, "*");
      const gf = $("gameFrame");
      if (gf && gf.contentWindow) gf.contentWindow.postMessage({ type: "paySuccess" }, "*");
    } catch(e){ console.warn("postMessage paySuccess failed", e); }

    // show game iframe if index expects
    const gf = $("gameFrame");
    if (gf) { gf.style.display = "block"; }
    const logo = $("logoPlaceholder");
    if (logo) logo.style.display = "none";

    // refresh UI summary on index
    try { window.postMessage({ type: "refreshSummary" }, "*"); } catch(e){}

    return true;
  } catch (err) {
    console.error("payToPlay failed", err);
    alert("Payment failed: " + (err && err.message ? err.message : String(err)));
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
    await tx.wait();
    alert("Score submitted on-chain ✅");
    // ask index to show leaderboard
    try { window.postMessage({ type: "scoreSubmitted" }, "*"); } catch(e){}
  } catch (err) {
    console.error("submitScore error", err);
    alert("Submit score failed: " + (err && err.message ? err.message : String(err)));
  }
}

// ---------------- MESSAGE HANDLER ----------------
window.addEventListener("message", async (ev) => {
  const data = ev.data || {};
  if (!data || typeof data !== "object") return;

  // iframe requests the start fee
  if (data.type === "requestStartFee") {
    try {
      if (!readContract) {
        // FIX: Menggunakan JsonRpcProvider untuk v5
        const rp = provider || new ethers.providers.JsonRpcProvider('https://rpc.somnia.network'); 
        readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rp);
      }
      let fee = startFeeWei;
      if (!fee) {
        fee = await readContract.startFeeWei();
        startFeeWei = fee;
      }
      const feeEth = ethers.utils.formatEther(fee);
      // reply to iframe
      try {
        const gf = $("gameFrame");
        if (gf && gf.contentWindow) gf.contentWindow.postMessage({ type: "startFee", feeWei: fee.toString(), feeEth }, "*");
      } catch(e){}
    } catch(e) { console.warn("requestStartFee failed", e); }
    return;
  }

  // game sends dotEaten -> play sfx
  if (data.type === "dotEaten") {
    if (isGameActive) playDotSound();
    return;
  }

  // game asks to submit score
  if (data.type === "submitScore") {
    await submitScoreTx(data.score);
    return;
  }

  // index asks to request wallet connect (from overlay)
  if (data.type === "requestConnectWallet") {
    await connectWallet();
    return;
  }

  // index asks to start (it wants to ensure on-chain flow)
  if (data.type === "requestStartGame") {
    if (!signer) {
      const ok = await connectWallet();
      if (!ok) return;
    }
    await payToPlay();
    return;
  }
});

// ---------------- DOM READY: wire UI ----------------
document.addEventListener("DOMContentLoaded", () => {
  // init audio hook
  initAudio();
  unlockAudioOnGesture();

  // wire buttons if exist
  const btnConnect = $("btnConnect") || $("connectWalletBtn");
  const btnPlay = $("btnPlay") || $("playBtn");
  const btnLeaderboard = $("btnLeaderboard") || $("leaderboardBtn");

  if (btnConnect) btnConnect.addEventListener("click", async () => {
    await connectWallet();
  });

  if (btnPlay) btnPlay.addEventListener("click", async () => {
    // ensure wallet
    if (!signer) {
      const ok = await connectWallet();
      if (!ok) return;
    }
    await payToPlay();
  });

  if (btnLeaderboard) btnLeaderboard.addEventListener("click", async () => {
    const lf = $("leaderFrame") || $("leaderboardFrame");
    if (lf) {
      lf.src = "leaderboard.html?ts=" + Date.now();
      lf.style.display = "block";
    }
    const gf = $("gameFrame");
    if (gf) gf.style.display = "none";
    
    // Optional: Refresh summary or leaderboard data
    if (!readContract) { 
        // We need to initialize contract for reading if not connected
        try {
           const rp = provider || new ethers.providers.JsonRpcProvider('https://rpc.somnia.network'); 
           readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rp);
        } catch(e){ console.warn("Leaderboard init error", e); }
    }
  });

  // mobile pad container (if you implemented dpad in index)
  const dpad = $("dpad-container-cross");
  if (dpad) {
    dpad.querySelectorAll("button").forEach(btn => {
      const dir = btn.getAttribute("data-direction");
      if (!dir) return;
      const send = () => {
        const gf = $("gameFrame");
        if (gf && gf.contentWindow && isGameActive) {
          gf.contentWindow.postMessage({ type: "mobileInput", direction: dir }, "*");
        }
      };
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); send(); }, { passive:false });
      btn.addEventListener("mousedown", send);
    });
  }

  // try notify index if already connected (hot reload case)
  (async ()=> {
    if (window.ethereum && !provider) {
      // we don't auto-connect, but if permissions already granted this returns quickly
      try {
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        const accounts = await provider.listAccounts();
        if (accounts && accounts.length > 0) {
          // populate info (but do not force user to re-approve)
          signer = provider.getSigner();
          userAddress = await signer.getAddress();
          safeText("walletAddr", "Wallet: " + userAddress.substring(0,6) + "..." + userAddress.slice(-4));
          try {
            const bal = await provider.getBalance(userAddress);
            safeText("walletBal", "SOMI: " + Number(ethers.utils.formatEther(bal)).toFixed(6));
          } catch(e){}
        }
      } catch(e){ /* ignore */ }
    }
  })();
});
      
