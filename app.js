/* ================= CONFIG ================= */
const CONTRACT_ADDRESS = "0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [
    {"inputs":[{"internalType":"address","name":"_treasury","type":"address"},{"internalType":"uint256","name":"_startFeeWei","type":"uint256"},{"internalType":"uint256","name":"_maxScorePerSubmit","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
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
let startFeeWei = "1000000000000000"; // Default 0.001 SOMI

/* ================= MESSAGE HUB ================= */
// Mendengarkan pesan dari IFRAME (Pacman mengirim skor)
window.addEventListener("message", async (e) => {
    if (!e.data || !e.data.type) return;

    if (e.data.type === "submitScore" || e.data.type === "submitScoreOnChain") {
        await submitScoreTx(e.data.score);
    }
    
    // Jika tombol di index.html memicu postMessage (backup)
    if (d.type === 'requestConnectWallet') { connectWallet(); }
    if (d.type === 'requestStartGame') { payToPlay(); }
});

/* ================= WALLET FUNCTIONS ================= */
async function switchNetwork() {
    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SOMNIA_CHAIN_ID }],
        });
        return true;
    } catch (err) {
        if (err.code === 4902) {
            try {
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [SOMNIA_NETWORK_CONFIG],
                });
                return true;
            } catch (addErr) { return false; }
        }
        return false;
    }
}

async function connectWallet() {
    if (!window.ethereum) {
        alert("Gunakan OKX atau MetaMask Browser!");
        return false;
    }

    try {
        window.postMessage({ type: "showWaiting", message: "Menghubungkan Wallet..." }, "*");
        
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        userAddress = accounts[0];

        await switchNetwork();

        signer = provider.getSigner();
        readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        gameContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        // Ambil Start Fee dari Kontrak
        try {
            startFeeWei = await readContract.startFeeWei();
        } catch (e) { console.warn("Gagal ambil fee, pakai default."); }

        const balance = await provider.getBalance(userAddress);
        
        // Kirim info ke index.html UI
        window.postMessage({
            type: "walletInfo",
            address: userAddress,
            balance: Number(ethers.utils.formatEther(balance)).toFixed(4)
        }, "*");

        updateTopScores();
        window.postMessage({ type: "clearWaiting" }, "*");
        return true;
    } catch (e) {
        window.postMessage({ type: "clearWaiting" }, "*");
        console.error("Connect error:", e);
        return false;
    }
}

/* ================= GAMEPLAY FUNCTIONS ================= */
async function payToPlay() {
    if (!signer) {
        const connected = await connectWallet();
        if (!connected) return;
    }

    const gameFrame = document.getElementById("gameFrame");

    try {
        window.postMessage({ type: "showWaiting", message: "Konfirmasi Transaksi di Wallet..." }, "*");

        // Jalankan Transaksi
        const tx = await gameContract.startGame({ value: startFeeWei });
        
        window.postMessage({ type: "showWaiting", message: "Menunggu Konfirmasi Jaringan Somnia..." }, "*");
        await tx.wait();

        window.postMessage({ type: "clearWaiting" }, "*");
        
        // Beritahu Index UI dan Iframe Game
        window.postMessage({ type: "paySuccess" }, "*");
        
        if (gameFrame && gameFrame.contentWindow) {
            gameFrame.contentWindow.postMessage({ type: "paySuccess" }, "*");
        }

    } catch (e) {
        window.postMessage({ type: "clearWaiting" }, "*");
        alert("Transaksi Gagal atau Dibatalkan");
    }
}

async function submitScoreTx(score) {
    if (!gameContract) return;

    try {
        window.postMessage({ type: "showWaiting", message: "Menyimpan Skor ke Blockchain..." }, "*");

        const tx = await gameContract.submitScore(score);
        await tx.wait();

        window.postMessage({ type: "clearWaiting" }, "*");
        alert("Skor Berhasil Disimpan!");
        
        updateTopScores();
        window.postMessage({ type: "showLeaderboard" }, "*");
    } catch (e) {
        window.postMessage({ type: "clearWaiting" }, "*");
        console.error(e);
        alert("Gagal submit skor.");
    }
}

/* ================= DATA UPDATER ================= */
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

// Update data setiap 30 detik
setInterval(updateTopScores, 30000);
