// app.js FINAL

// ---------------- CONFIG ----------------
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  "function startFeeWei() view returns (uint256)",
  "function startGame() payable",
  "function submitScore(uint256 _score)"
];
const SOMNIA_CHAIN_ID = "0x13a7"; // 5031
const SOMNIA_NETWORK_CONFIG = {
  chainId: SOMNIA_CHAIN_ID,
  chainName: "Somnia Mainnet",
  nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
  rpcUrls: ["https://somnia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://explorer.somnia.network"]
};

// ---------------- STATE ----------------
let provider, signer, userAddress, readContract, gameContract;
let startFeeWei;
let isGameActive = false;

// Audio
let backgroundMusic, sfxStart, sfxDot;
let audioUnlocked = false;

// ---------------- AUDIO HELPERS ----------------
function initAudio() {
  try {
    sfxStart = new Audio("assets/sfx_start.mp3");
    sfxStart.volume = 0.95;
  } catch (e) {
    console.warn("sfx_start.mp3 not found, skipping");
    sfxStart = null;
  }

  try {
    sfxDot = new Audio("assets/sfx_dot_eat.mp3");
    sfxDot.volume = 0.8;
  } catch (e) {
    console.warn("sfx_dot_eat.mp3 not found, skipping");
    sfxDot = null;
  }

  try {
    backgroundMusic = new Audio("assets/music_background.mp3");
    backgroundMusic.loop = true;
    backgroundMusic.volume = 0.35;
  } catch (e) {
    console.warn("music_background.mp3 not found, skipping");
    backgroundMusic = null;
  }
}
function unlockAudioOnGesture() {
  if (audioUnlocked) return;
  initAudio();
  const tryPlay = () => {
    if (sfxStart) {
      sfxStart.volume = 0;
      sfxStart.play().then(() => { sfxStart.volume = 0.95; audioUnlocked = true; });
    }
    audioUnlocked = true;
    window.removeEventListener("pointerdown", tryPlay);
  };
  window.addEventListener("pointerdown", tryPlay, { once: true });
}
function playDotSound() {
  if (sfxDot) { const inst = sfxDot.cloneNode(); inst.volume = sfxDot.volume; inst.play().catch(()=>{}); }
}
function startBackgroundMusic() {
  try {
    backgroundMusic = new Audio("assets/music_background.mp3");
    backgroundMusic.loop = true; backgroundMusic.volume = 0.35;
    backgroundMusic.play().catch(()=>{});
  } catch {}
}
function playStartSfx() { if (sfxStart) { sfxStart.currentTime = 0; sfxStart.play().catch(()=>{}); } }

// ---------------- WALLET & CONTRACT ----------------
async function connectWallet() {
  // Inisialisasi audio sekali
  initAudio();
  unlockAudioOnGesture();

  if (!window.ethereum) {
    alert("No wallet provider found (install MetaMask).");
    return false;
  }

  // Gunakan Web3Provider dari window.ethereum
  provider = new ethers.providers.Web3Provider(window.ethereum, "any");

  // Minta izin akun
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  userAddress = await signer.getAddress();

  // Switch ke network Somnia
  const ok = await switchNetwork(provider);
  if (!ok) return false;

  // Inisialisasi kontrak
  readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  // Ambil startFee dari kontrak
  try {
    startFeeWei = await readContract.startFeeWei();
  } catch {
    startFeeWei = ethers.utils.parseEther("0.001");
  }

  // Kirim info wallet ke parent
  const balance = await provider.getBalance(userAddress);
  const balanceEth = ethers.utils.formatEther(balance);
  window.postMessage({ type: "walletInfo", address: userAddress, balance: balanceEth }, "*");

  return true;
}

  // ---------------- NETWORK SWITCH ----------------
  async function switchNetwork(provider) {
  const { chainId } = await provider.getNetwork();
  // chainId Somnia = 5031 (hex 0x13a7)
  if (chainId.toString() !== "5031") {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13a7" }]
      });
      return true;
    } catch (e) {
      if (e.code === 4902) {
        // Chain belum ditambahkan, tambahkan dulu
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x13a7",
            chainName: "Somnia Mainnet",
            nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
            rpcUrls: ["https://somnia-rpc.publicnode.com"],
            blockExplorerUrls: ["https://explorer.somnia.network"]
          }]
        });
        return true;
      }
      alert("Please switch to Somnia network manually.");
      return false;
    }
  }
  return true;
}
async function connectWallet() {
  initAudio(); unlockAudioOnGesture();
  if (!window.ethereum) { alert("No wallet provider found."); return false; }
  provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner(); userAddress = await signer.getAddress();
  const ok = await switchNetwork(provider); if (!ok) return false;
  readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  try { startFeeWei = await readContract.startFeeWei(); } catch { startFeeWei = ethers.utils.parseEther("0.001"); }
  return true;
}

// ---------------- GAME FLOW ----------------
async function payToPlay() {
  initAudio(); unlockAudioOnGesture();
  if (!signer) { const ok = await connectWallet(); if (!ok) return; }
  const bal = await provider.getBalance(userAddress);
  if (bal.lt(startFeeWei)) { alert("Insufficient balance."); return; }
  const tx = await gameContract.startGame({ value: startFeeWei });
  await tx.wait();
  isGameActive = true;
  playStartSfx(); startBackgroundMusic();
  window.postMessage({ type: "paySuccess" }, "*");
}

async function submitScoreTx(score) {
  if (!gameContract || !signer) return;
  const tx = await gameContract.submitScore(Number(score));
  await tx.wait();
  window.postMessage({ type: "scoreSubmitted" }, "*");
}

// ---------------- MESSAGE HANDLER ----------------
window.addEventListener("message", async (ev) => {
  const d = ev.data || {}; if (!d || typeof d !== "object") return;
  if (d.type === "requestConnectWallet") { await connectWallet(); }
  if (d.type === "requestStartGame") { await payToPlay(); }
  if (d.type === "submitScore") { await submitScoreTx(d.score); }
  if (d.type === "dotEaten" && isGameActive) { playDotSound(); }
  if (d.type === "playAgain") { await payToPlay(); }
  if (d.type === "backToDashboard") { window.postMessage({ type:"forceShowLogo" },"*"); }
});

// ---------------- DOM READY ----------------
document.addEventListener("DOMContentLoaded", async () => {
  initAudio(); unlockAudioOnGesture();
  if (window.ethereum) {
    const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
    const accounts = await tempProvider.listAccounts();
    if (accounts.length > 0) { await connectWallet(); }
  }
});
