/* ================= CONFIG ================= */

const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
  {"inputs":[{"internalType":"address","name":"_treasury","type":"address"},{"internalType":"uint256","name":"_startFeeWei","type":"uint256"},{"internalType":"uint256","name":"_maxScorePerSubmit","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"FeeUpdated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"player","type":"address"},{"indexed":false,"internalType":"uint256","name":"fee","type":"uint256"}],"name":"GameStarted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newMaxScore","type":"uint256"}],"name":"MaxScoreUpdated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"score","type":"uint256"}],"name":"ScoreSubmitted","type":"event"},
  {"inputs":[],"name":"getTop10","outputs":[{"internalType":"address[]","name":"topPlayers","type":"address[]"},{"internalType":"uint256[]","name":"scores","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"startFeeWei","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"startGame","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"score","type":"uint256"}],"name":"submitScore","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

const SOMNIA_CHAIN_ID = "0x13a7"; // 5031
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
/* ONLY accept messages from game iframe */

window.addEventListener("message", async (e) => {
  const gameFrame = document.getElementById("gameFrame");
  if (!gameFrame || e.source !== gameFrame.contentWindow) return;

  if (e.data?.type === "submitScore") {
    await submitScoreTx(e.data.score);
  }
});

/* ================= WALLET ================= */

async function switchNetwork() {
  const network = await provider.getNetwork();
  const targetChain = parseInt(SOMNIA_CHAIN_ID, 16);

  if (network.chainId === targetChain) return true;

  try {
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
    throw err;
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("Gunakan OKX / MetaMask Browser");
    return false;
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts"
  });

  userAddress = accounts[0];
  provider = new ethers.providers.Web3Provider(window.ethereum, "any");

  await switchNetwork();

  signer = provider.getSigner();
  readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  try {
    startFeeWei = await readContract.startFeeWei();
  } catch {
    startFeeWei = ethers.utils.parseEther("0.001");
  }

  const balance = await provider.getBalance(userAddress);

  window.postMessage({
    type: "walletInfo",
    address: userAddress,
    balance: Number(ethers.utils.formatEther(balance)).toFixed(4)
  }, "*");

  updateTopScores();
  return true;
}

/* ================= PLAY ================= */

async function payToPlay() {
  if (!signer) {
    const ok = await connectWallet();
    if (!ok) return;
  }

  const gameFrame = document.getElementById("gameFrame");

  /* 🔊 AUDIO UNLOCK (MUST BE USER CLICK) */
  if (gameFrame?.contentWindow) {
    gameFrame.contentWindow.postMessage(
      { type: "initAudio" },
      location.origin
    );
  }

  try {
    window.postMessage({ type: "showWaiting", message: "Processing Payment..." }, "*");

    const tx = await gameContract.startGame({ value: startFeeWei });
    await tx.wait();

    window.postMessage({ type: "clearWaiting" }, "*");

    if (gameFrame?.contentWindow) {
      gameFrame.contentWindow.postMessage(
        { type: "paySuccess" },
        location.origin
      );
    }
  } catch (e) {
    window.postMessage({ type: "clearWaiting" }, "*");
    alert("Transaction failed");
  }
}

/* ================= SCORE ================= */

async function submitScoreTx(score) {
  if (!gameContract) return;

  try {
    window.postMessage({ type: "showWaiting", message: "Saving Score..." }, "*");

    const tx = await gameContract.submitScore(score);
    await tx.wait();

    updateTopScores();
    window.postMessage({ type: "showLeaderboard" }, "*");
  } catch (e) {
    alert("Submit score failed");
  } finally {
    window.postMessage({ type: "clearWaiting" }, "*");
  }
}

/* ================= LEADERBOARD / JACKPOT ================= */

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
    console.warn("Leaderboard update failed");
  }
  }
