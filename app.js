// contract.js content moved here for completeness (assuming no ES6 imports)
const CONTRACT_ADDRESS="0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";

// CONTRACT_ABI LENGKAP (dari file contract.js)
const CONTRACT_ABI = [
  {"inputs":[{"internalType":"address","name":"_treasury","type":"address"},{"internalType":"uint256","name":"_startFeeWei","type":"uint256"},{"internalType":"uint256","name":"_maxScorePerSubmit","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"FeeUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"player","type":"address"},{"indexed":false,"internalType":"uint256","name":"fee","type":"uint256"}],"name":"GameStarted","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newMaxScore","type":"uint256"}],"name":"MaxScoreUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"player","type":"address"},{"indexed":false,"internalType":"uint256","name":"score","type":"uint256"}],"name":"ScoreSubmitted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdraw","type":"event"},{"inputs":[],"name":"getTop10","outputs":[{"internalType":"address[]","name":"topPlayers","type":"address[]"},{"internalType":"uint256[]","name":"scores","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxScorePerSubmit","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"players","outputs":[{"internalType":"uint256","name":"totalScore","type":"uint256"},{"internalType":"uint256","name":"lastPlayed","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"newMaxScore","type":"uint256"}],"name":"setMaxScore","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"setStartFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"startFeeWei","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"startGame","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"uint256","name":"score","type":"uint256"}],"name":"submitScore","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"top10Scores","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"top10Wallets","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"treasury","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}];

const SOMNIA_CHAIN_ID="0x13a7"; // 5031
const SOMNIA_NETWORK_CONFIG={
  chainId:SOMNIA_CHAIN_ID,
  chainName:"Somnia Mainnet",
  nativeCurrency:{name:"SOMI",symbol:"SOMI",decimals:18},
  rpcUrls:["https://somnia-rpc.publicnode.com"],
  blockExplorerUrls:["https://explorer.somnia.network"]
};

let provider,signer,userAddress,readContract,gameContract;
let startFeeWei;

// --- Fungsi untuk mengirim data Wallet ke index.html (perbaikan inti) ---
function updateWalletUI(address, balanceEth) {
    const data = {
        type: 'walletInfo',
        address: address,
        balance: balanceEth ? Number(balanceEth).toFixed(4) : '-'
    };
    // Kirim pesan ke index.html. Karena index.html adalah parent/iframe,
    // kita gunakan window.parent.postMessage jika app.js di iframe, 
    // tapi karena app.js ada di index.html, kita pakai window.postMessage.
    // Kita asumsikan app.js berjalan di konteks index.html.
    window.postMessage(data, '*');
}

async function switchNetwork(provider){
  const {chainId}=await provider.getNetwork();
  if(chainId.toString()!=="5031"){
    try{
      await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{chainId:SOMNIA_CHAIN_ID}] });
      return true;
    }catch(e){
      if(e.code===4902){
        await window.ethereum.request({ method:"wallet_addEthereumChain", params:[SOMNIA_NETWORK_CONFIG] });
        return true;
      }
      alert("Please switch to Somnia network manually.");
      return false;
    }
  }
  return true;
}

async function connectWallet(){
  if(!window.ethereum){alert("No wallet provider found.");return false;}
  
  provider=new ethers.providers.Web3Provider(window.ethereum,"any");
  
  // 1. Minta akun dan dapatkan signer
  try {
    await provider.send("eth_requestAccounts",[]);
    signer=provider.getSigner();
    userAddress=await signer.getAddress();
  } catch (e) {
    console.error("Account request rejected or failed:", e);
    alert("Wallet connection rejected or failed.");
    // Reset UI di index.html jika gagal koneksi
    updateWalletUI('-', '-'); 
    return false;
  }
  
  // 2. Cek dan Ganti Jaringan
  const ok=await switchNetwork(provider);
  if(!ok) {
    updateWalletUI(userAddress, '-'); // Tampilkan alamat tapi saldo gagal
    return false;
  }
  
  // 3. Inisialisasi Kontrak
  readContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,provider);
  gameContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
  try{startFeeWei=await readContract.startFeeWei();}catch{startFeeWei=ethers.utils.parseEther("0.001");}
  
  // 4. Ambil Saldo
  const balance=await provider.getBalance(userAddress);
  const balanceEth=ethers.utils.formatEther(balance);
  
  // 5. Update UI di index.html (PERBAIKAN UTAMA)
  updateWalletUI(userAddress, balanceEth);
  
  // 6. Ambil Top Skor/Jackpot
  updateTopScores(); 
  return true;
}

function safeGameDoc(){
  const gameFrame=document.getElementById("gameFrame");
  return gameFrame&&gameFrame.contentWindow ? gameFrame.contentWindow : null;
}

async function payToPlay(){
  if(!signer){const ok=await connectWallet();if(!ok)return;}
  
  window.postMessage({ type: 'clearWaiting' }, '*'); 

  const bal=await provider.getBalance(userAddress);
  if(bal.lt(startFeeWei)){alert("Insufficient balance.");return;}
  
  try {
    const tx=await gameContract.startGame({value:startFeeWei});
    // Kirim feedback waiting ke index.html
    window.postMessage({ type: 'showWaiting' }, '*'); 

    await tx.wait();

    const gw = safeGameDoc();
    if(gw){
      gw.postMessage({ type: 'paySuccess' }, '*'); 
    }
    // Perbarui saldo dan jackpot setelah transaksi
    await connectWallet(); 
    
  } catch (e) {
    console.error("Game start transaction failed:", e);
    alert("Transaction failed or was rejected. Check console for details.");
    window.postMessage({ type: 'clearWaiting' }, '*');
  }
}

async function submitScoreTx(score){
  if(!gameContract||!signer)return;
  
  try {
    const tx=await gameContract.submitScore(Number(score));
    // Kirim feedback waiting ke index.html
    window.postMessage({ type: 'showWaiting', message: 'Submitting score to blockchain...' }, '*');
    
    await tx.wait();

    const gw = safeGameDoc();
    if(gw){
      gw.postMessage({ type: 'scoreSubmittedSuccess' }, '*');
    }
    
    updateTopScores();
    window.postMessage({ type: 'showLeaderboard' }, '*'); 
    window.postMessage({ type: 'clearWaiting' }, '*');

  } catch(e) { 
    console.error("Score submission failed:", e);
    alert("Score submission failed. Please try again.");
    window.postMessage({ type: 'clearWaiting' }, '*');
  }
}

async function updateTopScores() {
  if (!readContract || !provider) return;

  try {
    // Ambil Jackpot (balance kontrak)
    const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
    const jackpot = ethers.utils.formatEther(contractBalance);

    // Ambil Top Score (dari kontrak)
    const [topPlayers, scores] = await readContract.getTop10();
    const topScoreValue = scores.length > 0 ? Number(scores[0]) : 0;

    // Kirim data ke index.html untuk update UI
    window.postMessage({
      type: 'updateSummary',
      jackpot: parseFloat(jackpot).toFixed(4), 
      topScore: topScoreValue
    }, '*');

  } catch (e) {
    console.error("Failed to fetch top scores:", e);
  }
}

// --- MetaMask Event Listeners (Untuk menjaga status saat wallet berubah) ---
if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        // Jika akun berubah, coba koneksi ulang untuk update UI
        if (accounts.length > 0) {
            connectWallet();
        } else {
            // Jika semua akun hilang (disconnected)
            updateWalletUI('-', '-'); 
            alert("Wallet disconnected. Please reconnect.");
        }
    });

    window.ethereum.on('chainChanged', () => {
        // Jika chain berubah, muat ulang untuk inisialisasi provider baru
        window.location.reload();
    });
}
// --------------------------------------------------------------------------

// Terima pesan dari index.html UI dan iframe game
window.addEventListener("message",async(ev)=>{
  const d=ev.data||{}; if(!d||typeof d!=="object") return;
  
  // Pesan dari index.html UI
  if(d.type==="requestConnectWallet"){await connectWallet();}
  if(d.type==="requestStartGame"){await payToPlay();} 
  
  // Pesan dari pacman_xmas.html Iframe
  if(d.type==="submitScore"){await submitScoreTx(d.score);}
  if(d.type==="playAgain"){await payToPlay();}
  if(d.type==="backToDashboard"){window.postMessage({ type: 'forceShowLogo' }, '*');}
});

document.addEventListener("DOMContentLoaded",async()=>{
  // Cek koneksi di awal (koneksi otomatis MetaMask)
  if(window.ethereum){
    const tempProvider=new ethers.providers.Web3Provider(window.ethereum,"any");
    try {
        // Cek apakah ada akun yang sudah terhubung
        const accounts = await tempProvider.listAccounts();
        if(accounts.length > 0){
            await connectWallet();
        } else {
            // Tampilkan status default jika tidak ada akun yang otomatis terhubung
            updateWalletUI('-', '-');
        }
    } catch (e) {
        console.warn("Failed to list accounts on load:", e);
        updateWalletUI('-', '-');
    }
  }
  // Ambil top score/jackpot di awal (tanpa perlu wallet terhubung)
  updateTopScores();
});
