/* ================= CONFIG ================= */
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  {"inputs":[{"internalType":"address","name":"_treasury","type":"address"},{"internalType":"uint256","name":"_startFeeWei","type":"uint256"},{"internalType":"uint256","name":"_maxScorePerSubmit","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[],"name":"getTop10","outputs":[{"internalType":"address[]","name":"topPlayers","type":"address[]"},{"internalType":"uint256[]","name":"scores","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"startFeeWei","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"startGame","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"score","type":"uint256"}],"name":"submitScore","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

const SOMNIA_CHAIN_ID = "0x13a7"; 
const SOMNIA_NETWORK_CONFIG = {
  chainId: SOMNIA_CHAIN_ID,
  chainName: "Somnia Mainnet",
  nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
  rpcUrls: ["https://somnia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://explorer.somnia.network"]
};

/* ================= STATE ================= */
let provider, signer, userAddress;
let readContract, gameContract;
let startFeeWei;

/* ================= IFRAME MESSAGE LISTENER ================= */
// Memperbaiki listener agar sinkron dengan file game (submitScoreOnChain)
window.addEventListener("message", async (e) => {
  const gameFrame = document.getElementById("gameFrame");
  if (!gameFrame || e.source !== gameFrame.contentWindow) return;

  // Sesuaikan dengan event.type di file HTML game kita sebelumnya
  if (e.data?.type === "submitScoreOnChain" || e.data?.type === "submitScore") {
    await submitScoreTx(e.data.score);
  }
});

/* ================= WALLET LOGIC ================= */
async function switchNetwork() {
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId === SOMNIA_CHAIN_ID) return true;

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SOMNIA_CHAIN_ID }],
    });
    return true;
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [SOMNIA_NETWORK_CONFIG],
      });
      return true;
    }
    return false;
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("Wallet tidak terdeteksi. Gunakan OKX atau MetaMask!");
    return false;
  }

  try {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    
    userAddress = accounts[0];
    const isNetworkOk = await switchNetwork();
    if (!isNetworkOk) return false;

    signer = provider.getSigner();
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Ambil start fee dari contract
    try {
      startFeeWei = await readContract.startFeeWei();
    } catch (e) {
      startFeeWei = ethers.utils.parseEther("0.001");
    }

    // Update info ke UI
    const balance = await provider.getBalance(userAddress);
    window.postMessage({
      type: "walletInfo",
      address: userAddress,
      balance: Number(ethers.utils.formatEther(balance)).toFixed(4)
    }, "*");

    updateTopScores();
    return true;
  } catch (e) {
    console.error("Connection error:", e);
    return false;
  }
}

/* ================= GAME ACTION ================= */
async function payToPlay() {
  // 1. Pastikan wallet terkoneksi
  if (!signer) {
    const ok = await connectWallet();
    if (!ok) return;
  }

  const gameFrame = document.getElementById("gameFrame");

  try {
    // 2. Beri sinyal menunggu ke UI
    window.postMessage({ type: "showWaiting", message: "Confirming Transaction..." }, "*");

    // 3. Eksekusi Pembayaran On-Chain
    const tx = await gameContract.startGame({ value: startFeeWei });
    await tx.wait();

    // 4. Sukses! Hilangkan tunggu dan mulai musik/game
    window.postMessage({ type: "clearWaiting" }, "*");

    if (gameFrame?.contentWindow) {
      // Inisialisasi Audio (Sangat penting setelah interaksi user)
      gameFrame.contentWindow.postMessage({ type: "initAudio" }, "*");
      // Sinyal sukses untuk hilangkan overlay game dan mulai hitung mundur
      gameFrame.contentWindow.postMessage({ type: "paySuccess" }, "*");
    }

  } catch (e) {
    window.postMessage({ type: "clearWaiting" }, "*");
    console.error(e);
    alert("Pembayaran Gagal atau Dibatalkan");
  }
}

async function submitScoreTx(score) {
  if (!gameContract) {
    alert("Hubungkan wallet terlebih dahulu!");
    return;
  }

  try {
    window.postMessage({ type: "showWaiting", message: "Submitting Score to Somnia..." }, "*");
    
    const tx = await gameContract.submitScore(score);
    await tx.wait();

    alert("Skor Berhasil Disimpan On-Chain!");
    updateTopScores();
    window.postMessage({ type: "showLeaderboard" }, "*");
  } catch (e) {
    console.error(e);
    alert("Gagal menyimpan skor on-chain");
  } finally {
    window.postMessage({ type: "clearWaiting" }, "*");
  }
}

/* ================= UPDATE DATA ================= */
async function updateTopScores() {
  if (!provider || !readContract) return;

  try {
    const jackpotWei = await provider.getBalance(CONTRACT_ADDRESS);
    const [players, scores] = await readContract.getTop10();

    window.postMessage({
      type: "updateSummary",
      jackpot: Number(ethers.utils.formatEther(jackpotWei)).toFixed(4),
      topScore: scores.length ? Number(scores[0]) : 0
    }, "*");
  } catch (e) {
    console.warn("Leaderboard failed to update");
  }
}
