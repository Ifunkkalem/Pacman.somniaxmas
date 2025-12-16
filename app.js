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
  await provider.send("eth_requestAccounts",[]);
  signer=provider.getSigner();
  userAddress=await signer.getAddress();
  const ok=await switchNetwork(provider);
  if(!ok) return false;
  readContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,provider);
  gameContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
  try{startFeeWei=await readContract.startFeeWei();}catch{startFeeWei=ethers.utils.parseEther("0.001");}
  const balance=await provider.getBalance(userAddress);
  const balanceEth=ethers.utils.formatEther(balance);
  const walletAddrEl=document.getElementById("walletAddr");
  const walletBalEl=document.getElementById("walletBal");
  if(walletAddrEl){walletAddrEl.textContent="Wallet: "+userAddress.substring(0,6)+"..."+userAddress.slice(-4);walletAddrEl.title=userAddress;}
  if(walletBalEl){walletBalEl.textContent=Number(balanceEth).toFixed(4)+" SOMI";walletBalEl.title=balanceEth+" SOMI";}
  
  updateTopScores(); // Ambil skor setelah koneksi
  return true;
}

function safeGameDoc(){
  const gameFrame=document.getElementById("gameFrame");
  return gameFrame&&gameFrame.contentWindow ? gameFrame.contentWindow : null;
}

async function payToPlay(){
  if(!signer){const ok=await connectWallet();if(!ok)return;}
  
  // Hapus feedback waiting lama dari index.html
  window.postMessage({ type: 'clearWaiting' }, '*'); 

  const bal=await provider.getBalance(userAddress);
  if(bal.lt(startFeeWei)){alert("Insufficient balance.");return;}
  
  try {
    // 1. Kirim transaksi
    const tx=await gameContract.startGame({value:startFeeWei});
    await tx.wait();

    // 2. Kirim sinyal sukses ke iframe (pacman_xmas.html)
    const gw = safeGameDoc();
    if(gw){
      gw.postMessage({ type: 'paySuccess' }, '*'); 
    }
    // Perbarui saldo dan jackpot setelah transaksi
    await connectWallet(); 
    
  } catch (e) {
    console.error("Game start transaction failed:", e);
    alert("Transaction failed or was rejected. Check console for details.");
  }
}

async function submitScoreTx(score){
  if(!gameContract||!signer)return;
  
  try {
    const tx=await gameContract.submitScore(Number(score));
    await tx.wait();

    // 1. Kirim sinyal sukses ke iframe
    const gw = safeGameDoc();
    if(gw){
      gw.postMessage({ type: 'scoreSubmittedSuccess' }, '*');
    }
    
    // 2. Perbarui Leaderboard di index.html dan refresh leaderFrame
    updateTopScores();
    window.postMessage({ type: 'showLeaderboard' }, '*'); 

  } catch(e) { 
    console.error("Score submission failed:", e);
    alert("Score submission failed. Please try again.");
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

// Terima pesan dari iframe game (dotEaten / submitScore)
window.addEventListener("message",async(ev)=>{
  const d=ev.data||{}; if(!d||typeof d!=="object") return;
  
  // Pesan dari index.html UI
  if(d.type==="requestConnectWallet"){await connectWallet();}
  if(d.type==="requestStartGame"){await payToPlay();} 
  
  // Pesan dari pacman_xmas.html Iframe
  if(d.type==="submitScore"){await submitScoreTx(d.score);}
  if(d.type==="playAgain"){await payToPlay();}
  if(d.type==="backToDashboard"){showMain("logoPlaceholder");}
  if(d.type==="dotEaten"){ /* opsional: bisa update UI jackpot lokal */ }
});

document.addEventListener("DOMContentLoaded",async()=>{
  if(window.ethereum){
    const tempProvider=new ethers.providers.Web3Provider(window.ethereum,"any");
    const accounts=await tempProvider.listAccounts();
    if(accounts.length>0){await connectWallet();}
  }
  // Ambil top score/jackpot di awal
  updateTopScores();
});
