// app.js (FINAL & PATCHED VERSION – SAFE MODE)
// Requires ethers v5 UMD loaded in index.html

// ---------------- CONFIG ----------------
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  "function startFeeWei() view returns (uint256)",
  "function startGame() payable",
  "function submitScore(uint256 _score)"
];

// Somnia Network
const SOMNIA_CHAIN_ID = "0x13a7"; // 5031
const SOMNIA_NETWORK_CONFIG = {
  chainId: SOMNIA_CHAIN_ID,
  chainName: "Somnia Mainnet",
  nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
  rpcUrls: ["https://somnia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://explorer.somnia.network"]
};

// Audio
const SFX_START_SRC = "assets/sfx_start.mp3";
const SFX_DOT_EAT_SRC = "assets/sfx_dot_eat.mp3";
const BGM_SRC = "assets/music_background.mp3";

// ---------------- STATE ----------------
let provider, signer, userAddress;
let readContract, gameContract;
let startFeeWei = null;

let backgroundMusic, sfxStart, sfxDot;
let audioUnlocked = false;
let isGameActive = false;
let isConnecting = false;
let isPaying = false;

// ---------------- HELPERS ----------------
const $ = (id) => document.getElementById(id);
const safeText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };

// ---------------- AUDIO ----------------
function initAudio() {
  if (sfxStart && sfxDot) return;
  try { sfxStart = new Audio(SFX_START_SRC); sfxStart.volume = 0.95; } catch {}
  try { sfxDot = new Audio(SFX_DOT_EAT_SRC); sfxDot.volume = 0.8; } catch {}
}

function unlockAudioOnGesture() {
  if (audioUnlocked) return;
  initAudio();
  const unlock = () => {
    if (sfxStart) {
      sfxStart.volume = 0;
      sfxStart.play().finally(() => {
        sfxStart.volume = 0.95;
        audioUnlocked = true;
      });
    } else audioUnlocked = true;
  };
  window.addEventListener("pointerdown", unlock, { once: true });
}

function playDotSound() {
  if (!audioUnlocked || !sfxDot) return;
  const s = sfxDot.cloneNode();
  s.volume = sfxDot.volume;
  s.play().catch(() => {});
}

async function loadBGM() {
  if (backgroundMusic) return;
  backgroundMusic = new Audio(BGM_SRC);
  backgroundMusic.loop = true;
  backgroundMusic.volume = 0.35;
  await new Promise(res => {
    backgroundMusic.addEventListener("canplaythrough", res, { once: true });
    setTimeout(res, 8000);
  });
}

function startBGM() {
  if (backgroundMusic) backgroundMusic.play().catch(() => {});
}

// ---------------- NETWORK ----------------
async function ensureNetwork() {
  const net = await provider.getNetwork();
  if (net.chainId === 5031) return true;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SOMNIA_CHAIN_ID }]
    });
    return true;
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [SOMNIA_NETWORK_CONFIG]
      });
      return true;
    }
    alert("Please switch to Somnia Network");
    return false;
  }
}

// ---------------- WALLET ----------------
async function connectWallet() {
  if (isConnecting) return false;
  isConnecting = true;

  initAudio();
  unlockAudioOnGesture();

  try {
    if (!window.ethereum) throw new Error("Wallet not found");

    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);

    if (!(await ensureNetwork())) return false;

    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    safeText("walletAddr", userAddress.slice(0, 6) + "..." + userAddress.slice(-4));

    const bal = await provider.getBalance(userAddress);
    safeText("walletBal", Number(ethers.utils.formatEther(bal)).toFixed(6) + " SOMI");

    startFeeWei = await readContract.startFeeWei();

    console.log("Wallet connected:", userAddress);
    return true;
  } catch (e) {
    console.error("connectWallet failed:", e);
    if (e.code !== 4001) alert(e.message);
    return false;
  } finally {
    isConnecting = false;
  }
}

// ---------------- PAY & PLAY ----------------
async function payToPlay() {
  if (isPaying) return;
  isPaying = true;

  try {
    if (!signer) {
      const ok = await connectWallet();
      if (!ok) return;
    }

    await loadBGM();

    const bal = await provider.getBalance(userAddress);
    if (bal.lt(startFeeWei)) {
      alert("Insufficient balance");
      return;
    }

    const tx = await gameContract.startGame({ value: startFeeWei });
    alert("Transaction sent, waiting confirmation...");

    const gf = $("gameFrame");
    gf?.contentWindow?.postMessage({ type: "waitingForTx" }, "*");

    await tx.wait();

    isGameActive = true;
    sfxStart?.play().catch(() => {});
    startBGM();

    $("logoPlaceholder")?.style && ($("logoPlaceholder").style.display = "none");
    gf && (gf.style.display = "block");

    gf?.contentWindow?.postMessage({ type: "paySuccess" }, "*");
  } catch (e) {
    console.error("payToPlay failed:", e);
    if (e.code !== 4001) alert(e.message);
  } finally {
    isPaying = false;
  }
}

// ---------------- SCORE ----------------
async function submitScoreTx(score) {
  if (!gameContract) return;
  try {
    backgroundMusic?.pause();
    const tx = await gameContract.submitScore(Number(score));
    await tx.wait();
    alert("Score submitted ✅");
  } catch (e) {
    if (e.code !== 4001) alert(e.message);
  }
}

// ---------------- MESSAGE HANDLER ----------------
window.addEventListener("message", async (ev) => {
  const d = ev.data || {};

  if (d.type === "dotEaten" && isGameActive) playDotSound();
  if (d.type === "submitScore") submitScoreTx(d.score);
  if (d.type === "requestConnectWallet") connectWallet();
  if (d.type === "requestStartGame") payToPlay();

  if (d.type === "leaderboardData") {
    safeText("poolValue", Number(d.jackpot).toFixed(6) + " SOMI");
    safeText("topScoreValue", d.topScore);
  }
});

// ---------------- DOM READY ----------------
document.addEventListener("DOMContentLoaded", async () => {
  initAudio();
  unlockAudioOnGesture();

  $("btnConnect")?.addEventListener("click", connectWallet);
  $("btnPlay")?.addEventListener("click", payToPlay);

  if (window.ethereum) {
    const p = new ethers.providers.Web3Provider(window.ethereum, "any");
    const acc = await p.listAccounts();
    if (acc.length) connectWallet();
  }
});
