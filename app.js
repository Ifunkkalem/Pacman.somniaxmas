// app.js (FINAL & FIXED VERSION - LOGIC TRANSACTION DIPINDAHKAN KE IFRAME)
// Integrasi: Koneksi Wallet, Tx Game Start/Submit, Hardcore/Time Attack Mode Selector (dipicu dari iframe)
// Requires ethers v5 UMD loaded in index.html

// ---------------- CONFIG ----------------
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  "function startFeeWei() view returns (uint256)",
  "function startGame() payable",
  "function submitScore(uint256 _score)",
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
    // Logic loading music
    return new Promise((resolve) => {
        if (backgroundMusic && backgroundMusic.readyState >= 3) return resolve();
        try {
            backgroundMusic = new Audio(BGM_SRC);
            backgroundMusic.loop = true;
            backgroundMusic.volume = 0.35;
            backgroundMusic.addEventListener('canplaythrough', () => { resolve(); }, { once: true });
            setTimeout(() => { if (!backgroundMusic || backgroundMusic.readyState < 3) { resolve(); } }, 10000); 
        } catch (e) { 
            backgroundMusic = null;
            resolve();
        }
    });
}

function unlockAudioOnGesture() {
  // Logic unlocking audio
  if (audioUnlocked) return;
  initAudio();
  const tryPlay = () => {
    if (sfxStart) {
        sfxStart.volume = 0; 
        sfxStart.play().then(() => { sfxStart.volume = 0.95; audioUnlocked = true; window.removeEventListener('pointerdown', tryPlay); }).catch(() => { audioUnlocked = true; window.removeEventListener('pointerdown', tryPlay); });
    } else { audioUnlocked = true; window.removeEventListener('pointerdown', tryPlay); }
  };
  window.addEventListener('pointerdown', tryPlay, { once: true });
}

function playDotSound() { try { if (!audioUnlocked) initAudio(); if (sfxDot) { const inst = sfxDot.cloneNode(); inst.volume = sfxDot.volume; inst.play().catch(()=>{}); } } catch (e) { console.warn("dot sound failed", e); } }
function startBackgroundMusic() { try { if (backgroundMusic) { backgroundMusic.currentTime = 0; backgroundMusic.volume = 0.35; backgroundMusic.play().catch((e)=>{ console.error("Final BGM play failed:", e); }); } } catch (e) { console.warn("bgm start failed", e); } }
function playStartSfx() { try { if (sfxStart) { sfxStart.currentTime = 0; sfxStart.play().catch(()=>{}); } } catch (e) { console.warn("start sfx failed", e); } }


// ---------------- WALLET & CONTRACT ----------------
async function switchNetwork(provider) {
    // Logic switch network
    const { chainId } = await provider.getNetwork();
    if (chainId.toString() !== '5031') {
        try {
            await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SOMNIA_CHAIN_ID }] });
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        } catch (switchError) {
            if (switchError.code === 4902) { 
                try {
                    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [SOMNIA_NETWORK_CONFIG] });
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return true;
                } catch (addError) { alert("Failed to add Somnia network. Please add it manually."); return false; }
            } else { alert("Failed to switch to Somnia network. Please switch manually."); return false; }
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
    provider = new ethers.providers.Web3Provider(window.ethereum, "any"); 
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    
    const networkSwitched = await switchNetwork(provider);
    if (!networkSwitched) return false;
    
    provider = new ethers.providers.Web3Provider(window.ethereum, "any"); 
    signer = provider.getSigner();
    
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    safeText("walletAddr", "Wallet: " + userAddress.substring(0,6) + "..." + userAddress.slice(-4));
    
    try {
      const balWei = await provider.getBalance(userAddress);
      safeText("walletBal", "SOMI: " + Number(ethers.utils.formatEther(balWei)).toFixed(6));
    } catch(e){ console.warn("balance fetch failed", e); }

    try {
      startFeeWei = await readContract.startFeeWei();
    } catch (e) {
      startFeeWei = ethers.utils.parseEther("0.01");
      console.warn("failed read startFeeWei:", e);
    }
    
    // Kirim info wallet ke iframe setelah koneksi sukses
    try { 
        // Menggunakan window.postMessage di sini untuk komunikasi global (bukan hanya iframe)
        // karena status koneksi wallet juga penting di halaman utama.
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
    if (err.code !== 4001) {
        alert("Connect failed: " + (err && err.message ? err.message : String(err)));
    }
    return false;
  }
}

// BARU: Fungsi Transaksi Khusus, dipanggil oleh Iframe Game
async function txStartGame(modeName, feeWei, multiplier, timeLimit) {
  initAudio();
  unlockAudioOnGesture();

  if (!signer || !gameContract || !userAddress) {
    alert("Please connect wallet first.");
    return false;
  }

  const networkOk = await switchNetwork(provider);
  if (!networkOk) return false;
  
  const feeToSend = ethers.BigNumber.from(feeWei);
  
  console.log("Starting BGM loading (expect 1MB) and waiting...");
  await loadBackgroundMusic(); 

  try {
    const bal = await provider.getBalance(userAddress);
    if (bal.lt(feeToSend)) {
      alert(`Insufficient balance to pay start fee. Need ${ethers.utils.formatEther(feeToSend)} SOMI.`);
      return false;
    }

    const tx = await gameContract.startGame({ value: feeToSend });
    console.log("startGame tx:", tx.hash);
    
    const gameFrame = $("gameFrame");
    if (gameFrame && gameFrame.contentWindow) {
      // Kirim sinyal "waitingForTx" ke iframe agar pesan di gameFrame muncul
      gameFrame.contentWindow.postMessage({ type: "waitingForTx" }, "*");
    }

    alert(`Transaction sent for ${modeName} Mode. Waiting for confirmation...`);
    
    await tx.wait();

    isGameActive = true;
    
    playStartSfx(); 
    startBackgroundMusic();
    
    // 1. TAMPILKAN IFRAME GAME (sudah pasti terlihat)
    
    // 2. KIRIM SINYAL START KE GAME DENGAN PARAMETER MODE
    try { 
      if (gameFrame && gameFrame.contentWindow) {
         gameFrame.contentWindow.postMessage({ 
             type: "paySuccess",
             gameMode: modeName,
             scoreMultiplier: multiplier,
             timeLimit: timeLimit 
         }, "*");
         console.log(`Sent 'paySuccess' with Mode: ${modeName}, Multiplier: x${multiplier}, Time Limit: ${timeLimit || 'None'}.`);
      }
    } catch(e){ console.warn("postMessage paySuccess failed", e); }

    try { window.postMessage({ type: "refreshSummary" }, "*"); } catch(e){}

    return true;
  } catch (err) {
    console.error("txStartGame failed", err);
    
    const gameFrame = $("gameFrame");
    if (gameFrame && gameFrame.contentWindow) {
      // Kirim sinyal bahwa Tx gagal
      gameFrame.contentWindow.postMessage({ type: "payFailed" }, "*");
    }
    
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
    if (backgroundMusic) { backgroundMusic.pause(); backgroundMusic.currentTime = 0; }
    const tx = await gameContract.submitScore(Number(score));
    console.log("submitScore tx:", tx.hash);
    
    const gameFrame = $("gameFrame");
    if (gameFrame && gameFrame.contentWindow) {
        // Kirim sinyal ke iframe agar pesan Waiting muncul selama submit
        gameFrame.contentWindow.postMessage({ type: "waitingForScoreTx" }, "*");
    }

    alert("Score submission sent. Waiting for confirmation...");
    await tx.wait();
    
    const statusMsg = "Score submitted on-chain ✅";
    alert(statusMsg);
    console.log(statusMsg);
    
    try { window.postMessage({ type: "scoreSubmitted" }, "*"); } catch(e){} 
    
    if (gameFrame && gameFrame.contentWindow) {
        gameFrame.contentWindow.postMessage({ type: "scoreSubmissionComplete" }, "*");
    }

  } catch (err) {
    console.error("submitScore error", err);
    
    const gameFrame = $("gameFrame");
    if (gameFrame && gameFrame.contentWindow) {
        // Kirim sinyal bahwa Tx gagal
        gameFrame.contentWindow.postMessage({ type: "scoreSubmissionFailed" }, "*");
    }

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
  
  // BARU: Iframe Game meminta transaksi
  if (data.type === "requestStartTx") {
      const { modeName, feeWei, multiplier, timeLimit } = data;
      await txStartGame(modeName, feeWei, multiplier, timeLimit);
      return;
  }

  if (data.type === "requestConnectWallet") {
    const ok = await connectWallet();
    // Kirim feedback status koneksi ke iframe
    if(ok) {
        const gameFrame = $("gameFrame");
        if (gameFrame && gameFrame.contentWindow) {
            gameFrame.contentWindow.postMessage({ type: "walletConnected" }, "*");
        }
    }
    return;
  }
  
  // BARU: Iframe meminta beralih ke Leaderboard
  if (data.type === "showLeaderboardView") {
    const lf = $("leaderFrame") || $("leaderboardFrame");
    const gf = $("gameFrame");
    const logo = $("logoPlaceholder");

    if (logo) logo.style.display = "none";
    if (gf) gf.style.display = "none";
    
    if (lf) {
      lf.src = "leaderboard.html?ts=" + Date.now();
      lf.style.display = "block";
    }
    return;
  }
  
  // Menerima Jackpot/Top Score dari Leaderboard.html
  if (data.type === "leaderboardData") {
    const jackpotDisplay = $("poolValue"); 
    const topScoreDisplay = $("topScoreValue"); 
    
    if (jackpotDisplay) {
        jackpotDisplay.textContent = parseFloat(data.jackpot).toFixed(6) + " SOMI";
    }
    if (topScoreDisplay) {
        topScoreDisplay.textContent = data.topScore;
    }
    
    return;
  }

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

  // Tombol Play hanya mengalihkan tampilan (View Switcher)
  if (btnPlay) btnPlay.addEventListener("click", async () => {
    const logoPlaceholder = $("logoPlaceholder");
    const gameFrame = $("gameFrame");
    const leaderboardFrame = $("leaderboardFrame");

    // Sembunyikan semua kecuali Game Iframe
    if (logoPlaceholder) logoPlaceholder.style.display = "none";
    if (leaderboardFrame) leaderboardFrame.style.display = "none";
    
    if (gameFrame) {
        gameFrame.style.display = "block"; 
        
        // --- KRITIS: Delay 300ms untuk memastikan iframe termuat sebelum mengirim sinyal ---
        await new Promise(resolve => setTimeout(resolve, 300)); 
        
        // Kirim sinyal ke iframe untuk menampilkan menu mode game
        if (gameFrame.contentWindow) {
            gameFrame.contentWindow.postMessage({ type: "showGameMenu" }, "*");
        }
    }
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

  (async ()=> {
    if (window.ethereum) {
      try {
        const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
        const accounts = await tempProvider.listAccounts();
        if (accounts && accounts.length > 0) {
          await connectWallet(); 
        }
      } catch(e){ /* ignore failures on auto-check */ }
    }
  })();
});
                                       
