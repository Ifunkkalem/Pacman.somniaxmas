// app.js
// Requires ethers v5 UMD loaded in index.html

let provider, signer, userAddress;
let gameContract;    // contract instance with signer
let readContract;    // contract instance read-only
let startFeeWei;     // BigNumber

// ⚠️ WAJIB di-set dari index.html
// const CONTRACT_ADDRESS = "0xD76b767102f2610b0C97FEE84873c1fAA4c7C365";
// const CONTRACT_ABI = [...]

// ================================
// ✅ CONNECT WALLET
// ================================
async function connectWallet() {
  if (!window.ethereum) {
    alert("Wallet tidak ditemukan. Gunakan MetaMask atau wallet EVM.");
    return;
  }

  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    // ✅ Update UI
    document.getElementById("walletDisplay").innerText = userAddress;

    const balWei = await provider.getBalance(userAddress);
    document.getElementById("walletBalance").innerText =
      ethers.utils.formatEther(balWei) + " SOMI";

    // ✅ Contract instance
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // ✅ Ambil startFee dari contract
    try {
      startFeeWei = await readContract.startFeeWei();
    } catch (e) {
      console.warn("startFeeWei read failed, fallback to 0.01 SOMI");
      startFeeWei = ethers.utils.parseEther("0.01");
    }

    alert("✅ Wallet connected");

  } catch (err) {
    console.error("CONNECT ERROR:", err);
    alert("Gagal connect wallet: " + (err.message || err));
  }
}

// ================================
// ✅ PAY TO PLAY
// ================================
async function payToPlay() {
  if (!gameContract || !signer || !userAddress) {
    alert("Connect wallet dulu.");
    return;
  }

  try {
    const balWei = await provider.getBalance(userAddress);

    if (balWei.lt(startFeeWei)) {
      alert("Saldo SOMI tidak cukup untuk membayar fee.");
      return;
    }

    const tx = await gameContract.startGame({ value: startFeeWei });

    alert("⏳ Menunggu konfirmasi pembayaran...\nTX: " + tx.hash);
    await tx.wait();

    alert("✅ Payment sukses — game dapat dimulai.");

    // ✅ Notify iframe bahwa payment sukses
    const iframe = document.getElementById("gameFrame");
    iframe.contentWindow.postMessage({ type: "paySuccess" }, "*");

    // ✅ Tampilkan game
    iframe.style.display = "block";
    document.getElementById("leaderboardFrame").style.display = "none";

  } catch (err) {
    console.error("PAY ERROR:", err);

    if (err.code === 4001) {
      alert("Transaksi dibatalkan user.");
    } else {
      alert("Payment gagal: " + (err.message || err));
    }
  }
}

// ================================
// ✅ SUBMIT SCORE (AKUMULASI BENAR)
// ================================
async function submitScoreTx(latestScore) {
  if (!gameContract || !userAddress) {
    alert("Wallet belum connect.");
    return;
  }

  try {
    console.log("Submitting score:", latestScore);

    // ✅ Ambil total score sebelumnya
    const playerData = await gameContract.players(userAddress);
    const oldScore = Number(playerData.totalScore);

    const newTotal = oldScore + Number(latestScore);

    console.log("Old:", oldScore, "New:", newTotal);

    const tx = await gameContract.submitScore(newTotal);

    alert("⏳ Mengirim skor ke blockchain...\nTX: " + tx.hash);
    await tx.wait();

    alert("✅ Skor berhasil dikirim ke leaderboard!");

  } catch (err) {
    console.error("SUBMIT SCORE ERROR:", err);
    alert("❌ Gagal submit score: " + (err.message || err));
  }
}

// ================================
// ✅ LOAD LEADERBOARD IFRAME
// ================================
function loadLeaderboardFrame() {
  const lb = document.getElementById("leaderboardFrame");

  lb.src = "leaderboard.html?ts=" + Date.now();
  lb.style.display = "block";

  document.getElementById("gameFrame").style.display = "none";
}

// ================================
// ✅ LISTENER MESSAGE DARI GAME
// ================================
window.addEventListener("message", (ev) => {
  const data = ev.data || {};

  // ✅ Saat game kirim score
  if (data.type === "submitScore") {
    submitScoreTx(data.score);
  }

  // ✅ Saat game minta info start fee
  if (data.type === "requestStartFee") {
    if (startFeeWei) {
      const feeEth = ethers.utils.formatEther(startFeeWei);

      document.getElementById("gameFrame").contentWindow.postMessage(
        {
          type: "startFee",
          feeWei: startFeeWei.toString(),
          feeEth
        },
        "*"
      );
    }
  }
});
