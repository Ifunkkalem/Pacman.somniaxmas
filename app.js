// app.js (FINAL & FIXED VERSION - Mode Selection di Index.html)
// Integrasi: Koneksi Wallet, Tx Game Start/Submit, View Switcher

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

// Audio setup (simplified for brevity)
function initAudio() { /* ... logic ... */ }
async function loadBackgroundMusic() { /* ... logic ... */ }
function unlockAudioOnGesture() { /* ... logic ... */ }
function playDotSound() { /* ... logic ... */ }
function startBackgroundMusic() { /* ... logic ... */ }
function playStartSfx() { /* ... logic ... */ }
// End Audio

// Network and Wallet setup (simplified for brevity)
async function switchNetwork(provider) { /* ... logic ... */ return true; }

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

    // Kirim info wallet ke index.html
    const balWei = await provider.getBalance(userAddress);
    const balance = Number(ethers.utils.formatEther(balWei)).toFixed(6);

    window.postMessage({ 
        type: "walletInfo", 
        address: userAddress, 
        balance: balance
    }, "*"); 
    
    // Asumsi: index.html sudah memiliki logika untuk menampilkan info ini

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

// Fungsi Transaksi Khusus, dipanggil oleh Index.html
async function txStartGame(modeName, feeWeiStr, multiplier, timeLimit) {
  initAudio();
  unlockAudioOnGesture();

  if (!signer || !gameContract || !userAddress) {
    alert("Please connect wallet first.");
    return false;
  }

  const networkOk = await switchNetwork(provider);
  if (!networkOk) return false;
  
  const feeToSend = ethers.BigNumber.from(feeWeiStr);
  
  console.log("Starting BGM loading and waiting...");
  await loadBackgroundMusic(); 

  const gameFrame = $("gameFrame");
  if (gameFrame && gameFrame.contentWindow) {
      // Kirim sinyal "waitingForTx" ke iframe agar pesan di gameFrame muncul
      gameFrame.contentWindow.postMessage({ type: "waitingForTx" }, "*");
  }
  
  try {
    const bal = await provider.getBalance(userAddress);
    if (bal.lt(feeToSend)) {
      alert(`Insufficient balance to pay start fee. Need ${ethers.utils.formatEther(feeToSend)} SOMI.`);
      // Kirim sinyal bahwa Tx gagal
      if (gameFrame && gameFrame.contentWindow) gameFrame.contentWindow.postMessage({ type: "payFailed" }, "*");
      return false;
    }

    const tx = await gameContract.startGame({ value: feeToSend });
    console.log("startGame tx:", tx.hash);
    
    alert(`Transaction sent for ${modeName} Mode. Waiting for confirmation...`);
    
    await tx.wait();

    isGameActive = true;
    
    playStartSfx(); 
    startBackgroundMusic();
    
    // KIRIM SINYAL START KE GAME DENGAN PARAMETER MODE
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
    
    // Kirim sinyal bahwa Tx gagal
    if (gameFrame && gameFrame.contentWindow) gameFrame.contentWindow.postMessage({ type: "payFailed" }, "*");
    
    if (err.code !== 4001) {
        alert("Payment failed: " + (err && err.message ? err.message : String(err)));
    }
    return false;
  }
}

// submit score on-chain
async function submitScoreTx(score) {
  // ... (logic submitScoreTx) ...
  if (!gameContract || !signer || !userAddress) {
    alert("Please connect wallet before submitting score.");
    return;
  }
  if (!score || isNaN(Number(score)) || Number(score) <= 0) {
    alert("Invalid score.");
    return;
  }

  const gameFrame = $("gameFrame");
  
  try {
    if (backgroundMusic) { backgroundMusic.pause(); backgroundMusic.currentTime = 0; }
    
    // Kirim sinyal ke iframe agar pesan Waiting muncul selama submit
    if (gameFrame && gameFrame.contentWindow) gameFrame.contentWindow.postMessage({ type: "waitingForScoreTx" }, "*");
    
    const tx = await gameContract.submitScore(Number(score));
    console.log("submitScore tx:", tx.hash);
    
    alert("Score submission sent. Waiting for confirmation...");
    await tx.wait();
    
    const statusMsg = "Score submitted on-chain ✅";
    alert(statusMsg);
    console.log(statusMsg);
    
    // Kirim sinyal kembali ke game bahwa submission complete
    if (gameFrame && gameFrame.contentWindow) gameFrame.contentWindow.postMessage({ type: "scoreSubmissionComplete" }, "*");

  } catch (err) {
    console.error("submitScore error", err);
    
    // Kirim sinyal bahwa Tx gagal
    if (gameFrame && gameFrame.contentWindow) gameFrame.contentWindow.postMessage({ type: "scoreSubmissionFailed" }, "*");

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

  // Permintaan Transaksi dari Index.html (setelah tombol mode diklik)
  if (data.type === "requestStartTx") {
      const { modeName, feeEth } = data;
      let multiplier, timeLimit;
      
      // Tentukan multiplier dan timeLimit berdasarkan mode
      if (modeName === 'Classic') { multiplier = 1; timeLimit = null; }
      else if (modeName === 'TimeAttack') { multiplier = 2; timeLimit = 90; }
      else if (modeName === 'Hardcore') { multiplier = 4; timeLimit = null; }
      else { console.error("Invalid game mode requested:", modeName); return; }
      
      const feeWeiStr = ethers.utils.parseEther(feeEth).toString();
      
      await txStartGame(modeName, feeWeiStr, multiplier, timeLimit);
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
  
  // BARU: Iframe Game meminta kembali ke Home setelah Game Over/Win
  if (data.type === "returnHome") {
    try { window.parent.postMessage({ type: "forceShowLogo" }, "*"); } catch(e){}
    return;
  }

  // Menerima Jackpot/Top Score dari Leaderboard.html
  if (data.type === "leaderboardData") {
    // Forward data ke index.html untuk update Summary
    window.postMessage({ 
        type: "updateSummary", 
        jackpot: data.jackpot, 
        topScore: data.topScore 
    }, "*");
    return;
  }

});

// ---------------- DOM READY: wire UI ----------------
document.addEventListener("DOMContentLoaded", () => {
  initAudio();
  unlockAudioOnGesture();

  // (Logika connectWallet otomatis dihapus/dipersingkat)
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
      
