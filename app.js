// app.js (FINAL & FIXED VERSION)
// Integrasi: Koneksi Wallet, Tx Game Start/Submit, Hardcore/Time Attack Mode Selector
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
    return new Promise((resolve) => {
        if (backgroundMusic && backgroundMusic.readyState >= 3) return resolve();
        
        try {
            backgroundMusic = new Audio(BGM_SRC);
            backgroundMusic.loop = true;
            backgroundMusic.volume = 0.35;
            
            backgroundMusic.addEventListener('canplaythrough', () => {
                console.log("BGM file loaded and ready to play (1MB).");
                resolve();
            }, { once: true });
            
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
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        } catch (switchError) {
            if (switchError.code === 4902) { 
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [SOMNIA_NETWORK_CONFIG],
                    });
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
    if (err.code !== 4001) {
        alert("Connect failed: " + (err && err.message ? err.message : String(err)));
    }
    return false;
  }
}

// FIX: payToPlay diubah menjadi mode selector
async function payToPlay() {
  initAudio();
  unlockAudioOnGesture();

  if (!signer || !gameContract || !userAddress) {
    alert("Please connect wallet first.");
    return false;
  }

  const networkOk = await switchNetwork(provider);
  if (!networkOk) return false;
  
  // Ambil biaya standar atau fallback
  if (!startFeeWei) {
    try { startFeeWei = await readContract.startFeeWei(); } catch(e){ startFeeWei = ethers.utils.parseEther("0.01"); }
  }

  // --- DEFINISI MODE BARU & BIAYA ---
  const MODES = {
      'Classic': { fee: startFeeWei, multiplier: 1, timeLimit: null, lives: 3 },
      'Hardcore': { fee: ethers.utils.parseEther("0.05"), multiplier: 4, timeLimit: null, lives: 1 }, // Biaya lebih tinggi, reward x4, 1 nyawa
      'TimeAttack': { fee: ethers.utils.parseEther("0.03"), multiplier: 2, timeLimit: 90, lives: 3 } // Biaya sedang, timer 90 detik, reward x2
  };
  
  // --- POP-UP PEMILIHAN MODE ---
  let choice = prompt(
    "Pilih Mode Permainan:\n\n" +
    `1. Classic Mode (Skor x1): Bayar ${ethers.utils.formatEther(MODES.Classic.fee)} SOMI\n` +
    `2. Hardcore Mode (1 Nyawa, Skor x4): Bayar ${ethers.utils.formatEther(MODES.Hardcore.fee)} SOMI\n` +
    `3. Time Attack (90 Detik, Skor x2): Bayar ${ethers.utils.formatEther(MODES.TimeAttack.fee)} SOMI\n\n` +
    "Masukkan nomor mode (1, 2, atau 3):"
  );
  
  let selectedMode = null;
  
  // Parsing pilihan
  if (choice) {
      choice = choice.trim();
      if (choice === '1') { selectedMode = MODES.Classic; selectedMode.name = 'Classic'; }
      else if (choice === '2') { selectedMode = MODES.Hardcore; selectedMode.name = 'Hardcore'; }
      else if (choice === '3') { selectedMode = MODES.TimeAttack; selectedMode.name = 'TimeAttack'; }
  }
  
  if (!selectedMode) {
      alert("Pilihan mode tidak valid. Permainan dibatalkan.");
      return false;
  }
  
  const feeToSend = selectedMode.fee;
  
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
    try { window.postMessage({ type: "startTxSent", txHash: tx.hash }, "*"); } catch(e){}

    alert(`Transaction sent for ${selectedMode.name} Mode. Waiting for confirmation...`);
    
    const gameFrame = $("gameFrame");
    if (gameFrame && gameFrame.contentWindow) {
      gameFrame.contentWindow.postMessage({ type: "waitingForTx" }, "*");
    }

    await tx.wait();

    isGameActive = true;
    
    playStartSfx(); 
    startBackgroundMusic();
    
    // 1. TAMPILKAN IFRAME GAME & HILANGKAN LOGO
    const logoPlaceholder = $("logoPlaceholder"); 

    if (logoPlaceholder) logoPlaceholder.style.display = "none";
    if (gameFrame) gameFrame.style.display = "block"; 

    // 2. KIRIM SINYAL START KE GAME DENGAN PARAMETER MODE
    try { 
      if (gameFrame && gameFrame.contentWindow) {
         gameFrame.contentWindow.postMessage({ 
             type: "paySuccess",
             gameMode: selectedMode.name,
             scoreMultiplier: selectedMode.multiplier,
             timeLimit: selectedMode.timeLimit 
         }, "*");
         console.log(`Sent 'paySuccess' with Mode: ${selectedMode.name}, Multiplier: x${selectedMode.multiplier}, Time Limit: ${selectedMode.timeLimit || 'None'}.`);
      }
    } catch(e){ console.warn("postMessage paySuccess failed", e); }

    try { window.postMessage({ type: "refreshSummary" }, "*"); } catch(e){}

    return true;
  } catch (err) {
    console.error("payToPlay failed", err);
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
    alert("Score submission sent. Waiting for confirmation...");
    await tx.wait();
    alert("Score submitted on-chain ✅");
    
    // Kirim sinyal ke index (wrapper) untuk update UI/Leaderboard
    try { window.postMessage({ type: "scoreSubmitted" }, "*"); } catch(e){} 
    
    const gameFrame = $("gameFrame");
    if (gameFrame && gameFrame.contentWindow) {
        gameFrame.contentWindow.postMessage({ type: "scoreSubmissionComplete" }, "*");
    }

  } catch (err) {
    console.error("submitScore error", err);
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
  
  if (data.type === 'requestGameStatus') {
      const gameFrame = $("gameFrame");
      if (gameFrame && gameFrame.contentWindow) {
          gameFrame.contentWindow.postMessage({ 
              type: 'gameStatusResponse', 
              allowLocalPlay: !!signer 
          }, ev.origin);
      }
      return;
  }
  
  // FIX FINAL: Menerima Jackpot/Top Score dari Leaderboard.html
  if (data.type === "leaderboardData") {
    const jackpotDisplay = $("poolValue"); 
    const topScoreDisplay = $("topScoreValue"); 
    
    // FIXED: Hanya masukkan nilai, TANPA label teks "Jackpot: "
    if (jackpotDisplay) {
        jackpotDisplay.textContent = parseFloat(data.jackpot).toFixed(6) + " SOMI";
    }
    // FIXED: Hanya masukkan nilai, TANPA label teks "Top: "
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

  if (btnPlay) btnPlay.addEventListener("click", async () => {
    if (!signer) {
      const ok = await connectWallet();
      if (!ok) return;
    }
    // Sekarang memanggil fungsi pemilihan mode
    await payToPlay(); 
  });

  if (btnLeaderboard) btnLeaderboard.addEventListener("click", async () => {
    const lf = $("leaderFrame") || $("leaderboardFrame");
    const gf = $("gameFrame");
    const logo = $("logoPlaceholder");

    if (logo) logo.style.display = "none";
    if (gf) gf.style.display = "none";
    
    if (lf) {
      // Reload iframe leaderboard untuk fetch data baru
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
        
