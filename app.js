// app.js (FINAL & FIXED: Mengatasi SyntaxError & CALL_EXCEPTION)

// ---------------- CONFIG ----------------
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  "function startFeeWei() view returns (uint256)",
  "function startGame() payable",
  "function submitScore(uint256 _score)"
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

// audio paths
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

// 🔥 HANYA SATU DEKLARASI GLOBAL 'gameFrame'
let gameFrame = null; 

// ---------------- HELPERS ----------------
const $ = (id) => document.getElementById(id);
const safeText = (id, txt) => { const el = $(id); if(el) el.textContent = txt; };

// [Fungsi initAudio, loadBackgroundMusic, unlockAudioOnGesture, playDotSound, 
//  startBackgroundMusic, playStartSfx, showWaitingMessage, switchNetwork - (DIPERSINGKAT DI SINI UNTUK KETERBACAAN)]

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
            backgroundMusic.addEventListener('canplaythrough', () => { resolve(); }, { once: true });
            setTimeout(() => { if (!backgroundMusic || backgroundMusic.readyState < 3) resolve(); }, 10000); 
        } catch (e) { backgroundMusic = null; resolve(); }
    });
}

function unlockAudioOnGesture() {
  if (audioUnlocked) return; initAudio();
  const tryPlay = () => {
    if (sfxStart) {
        sfxStart.volume = 0; 
        sfxStart.play().then(() => { sfxStart.volume = 0.95; audioUnlocked = true; window.removeEventListener('pointerdown', tryPlay); }).catch(() => { audioUnlocked = true; window.removeEventListener('pointerdown', tryPlay); });
    } else { audioUnlocked = true; window.removeEventListener('pointerdown', tryPlay); }
  };
  window.addEventListener('pointerdown', tryPlay, { once: true });
}

function playDotSound() {
  try {
    if (!audioUnlocked) initAudio();
    if (sfxDot) { const inst = sfxDot.cloneNode(); inst.volume = sfxDot.volume; inst.play().catch(()=>{}); }
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

function showWaitingMessage(text, duration = 4000) {
    let gm = document.getElementById('__waiting_msg');
    if (!gm) {
        gm = document.createElement('div');
        gm.id = '__waiting_msg';
        gm.style.position = 'fixed';
        gm.style.left = '50%';
        gm.style.top = '70px'; 
        gm.style.transform = 'translateX(-50%)';
        gm.style.background = 'linear-gradient(90deg, #ff9800, #ff5722)';
        gm.style.color = 'white';
        gm.style.padding = '8px 15px';
        gm.style.borderRadius = '8px';
        gm.style.zIndex = '9999'; 
        document.body.appendChild(gm);
    }
    gm.textContent = text;
    gm.style.display = 'block';

    if (duration > 0) {
        setTimeout(() => {
            if (gm && gm.textContent === text) gm.style.display = 'none';
        }, duration);
    }
}

async function switchNetwork(provider) {
    try {
        const network = await provider.getNetwork();
        if (network.chainId.toString() !== '5031') {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: SOMNIA_CHAIN_ID }],
            });
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        }
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
        } else if (switchError.code === 4001) {
             console.log("User rejected network switch.");
             return false;
        } else {
             console.error("Failed to switch network", switchError);
             alert("Failed to switch to Somnia network. Please switch manually. Error code: " + switchError.code);
             return false;
        }
    }
}


// ---------------- WALLET & CONTRACT ----------------

async function connectWallet() {
  initAudio();
  unlockAudioOnGesture();

  if (typeof window.ethereum === 'undefined') {
    alert("Wallet provider not found. Please install MetaMask or use a DApp browser.");
    return false;
  }
  
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any"); 
    await provider.send("eth_requestAccounts", []); 
    
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    
    const networkSwitched = await switchNetwork(provider);
    if (!networkSwitched) {
        signer = null; userAddress = null; provider = null;
        return false;
    }
    
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
      // Menangani error CALL_EXCEPTION jika RPC gagal membaca startFeeWei
      startFeeWei = ethers.utils.parseEther("0.01"); 
      console.warn("failed read startFeeWei (using default 0.01):", e);
    }
    
    const balData = await provider.getBalance(userAddress);
    try { 
        window.postMessage({ 
            type: "walletInfo", 
            address: userAddress, 
            balance: Number(ethers.utils.formatEther(balData)).toFixed(6)
        }, "*"); 
    } catch(e){}

    console.log("Connected to Somnia Network", userAddress);
    return true;
  } catch (err) {
    console.error("connectWallet error", err);
    if (err.code !== 4001) {
        alert("Connection Failed: " + (err && err.message ? err.message : String(err)) + " (Code: " + err.code + ")");
    } else {
        console.log("Connection Rejected by User.");
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

  const networkOk = await switchNetwork(provider);
  if (!networkOk) return false;
  
  if (!startFeeWei) {
    try { startFeeWei = await readContract.startFeeWei(); } catch(e){ startFeeWei = ethers.utils.parseEther("0.01"); }
  }
  
  console.log("Starting BGM loading (expect 1MB) and waiting...");
  await loadBackgroundMusic(); 

  try {
    const bal = await provider.getBalance(userAddress);
    if (bal.lt(startFeeWei)) {
      alert("Insufficient balance to pay start fee. Need " + ethers.utils.formatEther(startFeeWei) + " SOMI.");
      return false;
    }
    
    showWaitingMessage("📝 Requesting Game Start... Please CONFIRM the transaction in your wallet.", 0);

    // 🔥 FIX TYPO: Mengganti startFeeFee menjadi startFeeWei
    const tx = await gameContract.startGame({ value: startFeeWei });
    console.log("startGame tx:", tx.hash);
    
    showWaitingMessage("Transaction sent. Waiting for confirmation...", 0);
    await tx.wait();

    isGameActive = true;
    
    const gm = document.getElementById('__waiting_msg'); 
    if (gm) gm.remove();

    playStartSfx(); 
    startBackgroundMusic();
    
    const currentFrame = gameFrame || $("gameFrame"); 

    try { 
      window.postMessage({ type: "paySuccess" }, "*");
      
      if (currentFrame && currentFrame.contentWindow) {
         currentFrame.contentWindow.postMessage({ type: "paySuccess" }, "*");
         console.log("Sent 'paySuccess' to game iframe. D-Pad now active.");
      }
    } catch(e){ console.warn("postMessage paySuccess failed", e); }

    if ($("logoPlaceholder")) $("logoPlaceholder").style.display = "none";
    if (currentFrame) currentFrame.style.display = "block";

    try { window.postMessage({ type: "refreshSummary" }, "*"); } catch(e){}

    return true;
  } catch (err) {
    const gm = document.getElementById('__waiting_msg'); 
    if (gm) gm.remove();
    console.error("payToPlay failed", err);
    if (err.code !== 4001) {
        alert("Payment failed: " + (err && err.message ? err.message : String(err)));
    }
    return false;
  }
}

// FUNGSI KRITIS: Submit Score
async function submitScoreTx(score) {
    if (!gameContract || !signer) {
        showWaitingMessage("🚨 Error: Wallet not connected or contract failed to load.", 5000);
        if (gameFrame && gameFrame.contentWindow) {
            gameFrame.contentWindow.postMessage({ type: "scoreTxFailed" }, "*"); 
        }
        return false;
    }
    
    const currentFrame = gameFrame || $("gameFrame");

    try {
        const scoreNum = Number(score);
        if (isNaN(scoreNum)) throw new Error("Invalid score format.");

        showWaitingMessage(`📝 Submitting Score ${scoreNum}... Please CONFIRM in your wallet.`, 0); 
        
        if (backgroundMusic) { backgroundMusic.pause(); }

        const tx = await gameContract.submitScore(scoreNum); 

        showWaitingMessage("Transaction sent. Waiting for confirmation...", 0);

        const receipt = await tx.wait(); 

        if (currentFrame && currentFrame.contentWindow) {
            currentFrame.contentWindow.postMessage({ type: "scoreTxConfirmed" }, "*");
        }
        
        showWaitingMessage(`✅ Score ${scoreNum} confirmed! TX: ${receipt.transactionHash.substring(0, 8)}...`, 4000);
        
        return true;
    } catch (error) {
        const gm = document.getElementById('__waiting_msg'); 
        if (gm) gm.remove();
        console.error("Score submission failed:", error);
        
        if (currentFrame && currentFrame.contentWindow) {
            currentFrame.contentWindow.postMessage({ type: "scoreTxFailed" }, "*"); 
        }
        
        showWaitingMessage(`❌ Score submission failed: ${error.message || 'Check console.'}`, 6000);
        return false;
    }
}


// ---------------- MESSAGE HANDLER ----------------
window.addEventListener("message", async (ev) => {
  const data = ev.data || {};
  if (!data || typeof data !== "object") return;

  if (data.type === "dotEaten") {
    playDotSound();
    return;
  }

  if (data.type === "submitScore") {
    const score = data.score;
    await submitScoreTx(score); 
    return;
  }
  
  if (data.type === "forceShowLogo") {
    if (backgroundMusic) { backgroundMusic.pause(); backgroundMusic.currentTime = 0; }
    window.postMessage({ type: 'forceShowLogo' }, '*');
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

});


// ---------------- DOM READY: wire UI ----------------
document.addEventListener("DOMContentLoaded", () => {
  // 🔥 KRITIS: Hanya di sini gameFrame mendapatkan nilai.
  gameFrame = document.getElementById("gameFrame");

  initAudio();
  unlockAudioOnGesture();

  const btnConnect = $("btnConnect") || $("connectWalletBtn");
  const btnPlay = $("btnPlay") || $("playBtn");
  const btnLeaderboard = $("btnLeaderboard") || $("leaderboardBtn");

  if (btnConnect) btnConnect.addEventListener("click", async () => {
    await connectWallet();
  });

  if (btnPlay) btnPlay.addEventListener("click", async () => {
    try { window.postMessage({ type: "requestStartGame" }, "*"); } catch(e){}
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
              
