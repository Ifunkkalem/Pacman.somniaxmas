import { ethers } from "ethers";
// Asumsikan Anda memiliki ABI dan Contract Address yang benar di sini
const GAME_ABI = [
    // Tambahkan hanya fungsi yang diperlukan
    "function startGame(string memory modeName) payable",
    "function submitScore(uint256 score, string memory modeName)",
    "function getJackpot() view returns (uint256)",
    "function getTopScore() view returns (uint256)",
    "function getLeaderboard() view returns (address[] memory, uint256[] memory, string[] memory)"
];
const GAME_ADDRESS = "0xYourContractAddressHere"; // GANTI DENGAN CONTRACT ADDRESS ANDA

// Network Config (Asumsi Somnia Chain/Testnet)
const SOMNIA_CHAIN_ID = 545; // ID Chain Somnia
const SOMNIA_NETWORK = {
    chainId: `0x${SOMNIA_CHAIN_ID.toString(16)}`,
    chainName: "Somnia Network",
    nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
    rpcUrls: ["https://rpc.somnianetwork.com"], // Ganti dengan RPC Somnia yang benar
    blockExplorerUrls: ["https://explorer.somnianetwork.com"] // Ganti dengan Explorer Somnia yang benar
};

let provider, signer, gameContract;
let currentAccount = null;
let isGameActive = false;

// Audio Files (Asumsi sudah ada di root atau path yang benar)
const startSfx = new Audio('start.mp3'); 
const bgm = new Audio('bgm.mp3');
bgm.loop = true;

function playStartSfx() {
    startSfx.play().catch(e => console.warn("Failed to play start SFX:", e));
}

function startBackgroundMusic() {
    bgm.play().catch(e => console.warn("Failed to play BGM:", e));
}

function stopBackgroundMusic() {
    bgm.pause();
    bgm.currentTime = 0;
}

// =========================================================
// ETHERS/METAMASK LOGIC
// =========================================================

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert("MetaMask is not installed. Please install it to continue.");
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        currentAccount = accounts[0];
        
        // Cek dan Switch Network
        await checkAndSwitchNetwork();

        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        gameContract = new ethers.Contract(GAME_ADDRESS, GAME_ABI, signer);
        
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
        
        await updateWalletInfo();
        await updateGameSummary();
        return true;

    } catch (error) {
        console.error("Connection failed:", error);
        window.postMessage({ type: "walletInfo", address: null, balance: '0.0000' }, "*");
        return false;
    }
}

async function checkAndSwitchNetwork() {
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (parseInt(currentChainId, 16) !== SOMNIA_CHAIN_ID) {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: SOMNIA_NETWORK.chainId }],
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                // Chain belum ditambahkan, tambahkan dulu
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [SOMNIA_NETWORK],
                });
            } else {
                throw new Error("Failed to switch network. Please switch to Somnia Network manually.");
            }
        }
    }
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        currentAccount = null;
        console.log('Wallet disconnected.');
    } else {
        currentAccount = accounts[0];
    }
    updateWalletInfo();
}

function handleChainChanged() {
    window.location.reload(); 
}

async function updateWalletInfo() {
    if (!currentAccount || !provider) {
        window.postMessage({ type: "walletInfo", address: null, balance: '0.0000' }, "*");
        return;
    }

    try {
        const balanceWei = await provider.getBalance(currentAccount);
        const balanceEth = ethers.utils.formatEther(balanceWei);
        
        window.postMessage({ 
            type: "walletInfo", 
            address: currentAccount, 
            balance: parseFloat(balanceEth).toFixed(4)
        }, "*");
    } catch(e) {
        console.error("Failed to update balance:", e);
        window.postMessage({ type: "walletInfo", address: currentAccount, balance: 'N/A' }, "*");
    }
}

async function updateGameSummary() {
    if (!gameContract) return;

    try {
        const jackpotWei = await gameContract.getJackpot();
        const jackpotEth = ethers.utils.formatEther(jackpotWei);
        const topScore = await gameContract.getTopScore();
        
        window.postMessage({ 
            type: "updateSummary", 
            jackpotEth: parseFloat(jackpotEth).toFixed(4), 
            topScore: topScore.toString()
        }, "*");

    } catch(e) {
        console.warn("Failed to update game summary:", e);
        window.postMessage({ type: "updateSummary", jackpotEth: 'N/A', topScore: 'N/A' }, "*");
    }
}


// =========================================================
// GAME TRANSACTION LOGIC
// =========================================================

async function txStartGame(modeName, feeWeiStr, gameFile) {
    if (!gameContract) {
        if (!await connectWallet()) return false;
    }
    stopBackgroundMusic();
    
    // Convert fee string back to BigNumber
    const feeToSend = ethers.BigNumber.from(feeWeiStr); 

    try {
        // Cek kembali saldo sebelum transaksi
        const balanceWei = await provider.getBalance(currentAccount);
        if (balanceWei.lt(feeToSend)) {
             window.postMessage({ type: "payFailed", error: "Insufficient SOMI balance to cover the fee." }, "*");
             return false;
        }

        // Tampilkan pesan menunggu sebelum meminta tanda tangan
        window.postMessage({ type: "waitingForTx", message: `Awaiting signature for ${modeName} Mode...` }, "*");

        // Panggil fungsi startGame pada Smart Contract.
        // Kirim 'modeName' sebagai string dan 'value' (fee)
        const tx = await gameContract.startGame(modeName, { value: feeToSend });
        
        console.log("startGame tx sent:", tx.hash);
        
        window.postMessage({ type: "waitingForTx", message: `Transaction sent for ${modeName} Mode. Waiting for confirmation...` }, "*");
        
        await tx.wait();

        isGameActive = true;
        
        playStartSfx(); 
        startBackgroundMusic();
        
        // KIRIM SINYAL START KE INDEX.HTML dengan nama file game yang akan dimuat
        window.postMessage({ 
            type: "paySuccess",
            gameFile: gameFile // Kirim file name agar index.html bisa ubah src
        }, "*");

        // Update summary setelah jackpot berubah
        updateGameSummary(); 

        return true;
    } catch (err) {
        console.error("Transaction Error:", err);
        let errorMessage = "Payment failed. See console for details.";
        if (err.message && err.message.includes('insufficient funds')) {
             errorMessage = "Payment failed: Insufficient funds for gas or fee.";
        }
        if (err.code === 4001) { // User rejected transaction
             errorMessage = "Transaction rejected by user.";
        }
        if (err.reason === 'execution reverted') {
            errorMessage = "Transaction failed: Contract reverted. Check fee (should be 0.001 SOMI).";
        }
        
        window.postMessage({ type: "payFailed", error: errorMessage }, "*");
        return false;
    }
}

async function txSubmitScore(score, modeName) {
    if (!gameContract || !currentAccount) {
        alert("Wallet not connected. Cannot submit score.");
        return;
    }

    if (!isGameActive) {
        console.warn("Attempted to submit score when game was not active.");
        return;
    }
    
    stopBackgroundMusic(); // Hentikan BGM saat submission
    
    try {
        window.postMessage({ type: "waitingForScoreTx", message: "Awaiting signature for score submission..." }, "*");

        // Panggil fungsi submitScore pada Smart Contract
        const tx = await gameContract.submitScore(score, modeName);
        
        window.postMessage({ type: "waitingForScoreTx", message: "Transaction sent. Waiting for score confirmation..." }, "*");

        await tx.wait();
        
        console.log("Score submission tx confirmed:", tx.hash);
        window.postMessage({ type: "scoreSubmissionComplete" }, "*");
        
        isGameActive = false;
        updateGameSummary();
        updateWalletInfo();

    } catch (err) {
        console.error("Score Submission Error:", err);
        let errorMessage = "Score submission failed. See console for details.";
        if (err.code === 4001) {
            errorMessage = "Score submission rejected by user.";
        }
        window.postMessage({ type: "scoreSubmissionFailed", error: errorMessage }, "*");
    }
}

async function getLeaderboardData() {
    if (!gameContract) return;

    try {
        const [addresses, scores, modes] = await gameContract.getLeaderboard();
        
        // Format data
        const leaderboardData = addresses.map((addr, index) => ({
            address: addr,
            score: scores[index].toString(),
            mode: modes[index]
        }));
        
        window.postMessage({ type: "leaderboardData", data: leaderboardData }, "*");

    } catch (e) {
        console.error("Failed to fetch leaderboard data:", e);
        window.postMessage({ type: "leaderboardData", data: [] }, "*");
    }
}

// =========================================================
// MESSAGE HANDLER
// =========================================================

window.addEventListener("message", async (ev) => {
  const data = ev.data || {};

  if (data.type === "requestConnectWallet") {
    await connectWallet();
    return;
  }
  
  // Permintaan Transaksi dari Index.html (setelah tombol mode diklik)
  if (data.type === "requestStartTx") {
      const { modeName, feeEth, gameFile } = data; 
      
      const feeWeiStr = ethers.utils.parseEther(feeEth).toString();
      
      await txStartGame(modeName, feeWeiStr, gameFile);
      return;
  }
  
  // Permintaan Submit Score dari Iframe Game
  if (data.type === "submitScore") {
      const { score, modeName } = data;
      await txSubmitScore(score, modeName);
      return;
  }
  
  // Permintaan kembali ke Home dari Iframe Game
  if (data.type === "returnHome") {
    isGameActive = false;
    stopBackgroundMusic();
    window.postMessage({ type: "returnHome" }, "*");
    return;
  }

  // Permintaan data leaderboard dari Index.html
  if (data.type === "requestLeaderboardData") {
    await getLeaderboardData();
    return;
  }
  
  // Sinyal Dot Eaten (untuk SFX/UI di Parent, jika diperlukan)
  if(data.type === "dotEaten") {
    // Tambahkan SFX dot eaten di sini jika diinginkan
    return;
  }
});

// Inisialisasi pada startup
document.addEventListener('DOMContentLoaded', () => {
    // Cek apakah MetaMask sudah terpasang dan auto-connect
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet(); 
    } else {
        updateWalletInfo();
    }
    updateGameSummary();
});
