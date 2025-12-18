const CONTRACT_ADDRESS="0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI = [{"inputs":[{"internalType":"address","name":"_treasury","type":"address"},{"internalType":"uint256","name":"_startFeeWei","type":"uint256"},{"internalType":"uint256","name":"_maxScorePerSubmit","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"FeeUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"player","type":"address"},{"indexed":false,"internalType":"uint256","name":"fee","type":"uint256"}],"name":"GameStarted","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newMaxScore","type":"uint256"}],"name":"MaxScoreUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"score","type":"uint256"}],"name":"ScoreSubmitted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdraw","type":"event"},{"inputs":[],"name":"getTop10","outputs":[{"internalType":"address[]","name":"topPlayers","type":"address[]"},{"internalType":"uint256[]","name":"scores","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxScorePerSubmit","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"players","outputs":[{"internalType":"uint256","name":"totalScore","type":"uint256"},{"internalType":"uint256","name":"lastPlayed","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"newMaxScore","type":"uint256"}],"name":"setMaxScore","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"setStartFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"startFeeWei","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"startGame","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"uint256","name":"score","type":"uint256"}],"name":"submitScore","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"top10Scores","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"top10Wallets","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"treasury","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}];

const SOMNIA_CHAIN_ID="0x13a7";
const SOMNIA_NETWORK_CONFIG={
  chainId:SOMNIA_CHAIN_ID,
  chainName:"Somnia Mainnet",
  nativeCurrency:{name:"SOMI",symbol:"SOMI",decimals:18},
  rpcUrls:["https://somnia-rpc.publicnode.com"],
  blockExplorerUrls:["https://explorer.somnia.network"]
};

let provider,signer,userAddress,readContract,gameContract;
let startFeeWei;

// Helper untuk update UI di index.html
function updateWalletUI(address, balanceEth) {
    window.postMessage({
        type: 'walletInfo',
        address: address,
        balance: balanceEth ? Number(balanceEth).toFixed(4) : '-'
    }, '*');
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
      return false;
    }
  }
  return true;
}

async function connectWallet(){
  if(!window.ethereum) return false;
  provider=new ethers.providers.Web3Provider(window.ethereum,"any");
  try {
    await provider.send("eth_requestAccounts",[]);
    signer=provider.getSigner();
    userAddress=await signer.getAddress();
    const ok=await switchNetwork(provider);
    if(!ok) return false;

    readContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,provider);
    gameContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
    try{startFeeWei=await readContract.startFeeWei();}catch{startFeeWei=ethers.utils.parseEther("0.001");}
    
    const balance=await provider.getBalance(userAddress);
    updateWalletUI(userAddress, ethers.utils.formatEther(balance));
    updateTopScores(); 
    return true;
  } catch (e) {
    return false;
  }
}

async function payToPlay(){
  if(!signer){const ok=await connectWallet(); if(!ok)return;}
  
  const bal=await provider.getBalance(userAddress);
  if(bal.lt(startFeeWei)){ alert("Insufficient balance."); return; }
  
  try {
    // 1. Beri tahu index.html untuk menunjukkan loading
    window.postMessage({ type: 'showWaiting', message: 'Confirm in Wallet...' }, '*'); 

    // 2. Kirim Transaksi
    const tx=await gameContract.startGame({value:startFeeWei});
    
    window.postMessage({ type: 'showWaiting', message: 'Confirming on Blockchain...' }, '*'); 
    await tx.wait();

    // 3. KRITIKAL: Kirim sinyal paySuccess ke DUA tempat
    // A. Ke index.html (agar showMain('gameFrame') dipanggil)
    window.postMessage({ type: 'paySuccess' }, '*');
    
    // B. Ke DALAM Iframe Game (agar overlay di dalam game hilang dan 3-2-1 mulai)
    const gameFrame = document.getElementById("gameFrame");
    if(gameFrame && gameFrame.contentWindow){
        gameFrame.contentWindow.postMessage({ type: 'paySuccess' }, '*');
    }

    await connectWallet(); 
  } catch (e) {
    alert("Transaction failed.");
    window.postMessage({ type: 'clearWaiting' }, '*');
  }
}

async function submitScoreTx(score){
  if(!gameContract||!signer)return;
  try {
    window.postMessage({ type: 'showWaiting', message: 'Submitting Score...' }, '*');
    const tx = await gameContract.submitScore(Number(score));
    await tx.wait();

    updateTopScores();
    window.postMessage({ type: 'showLeaderboard' }, '*'); 
    window.postMessage({ type: 'clearWaiting' }, '*');
  } catch(e) { 
    window.postMessage({ type: 'clearWaiting' }, '*');
  }
}

async function updateTopScores() {
  try {
    if (!readContract) return;
    const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
    const [topPlayers, scores] = await readContract.getTop10();
    const topScoreValue = scores.length > 0 ? Number(scores[0]) : 0;

    window.postMessage({
      type: 'updateSummary',
      jackpot: parseFloat(ethers.utils.formatEther(contractBalance)).toFixed(4), 
      topScore: topScoreValue
    }, '*');
  } catch (e) { console.error(e); }
}

// Global Message Listener
window.addEventListener("message",async(ev)=>{
  const d=ev.data||{}; 
  if(d.type==="requestConnectWallet") await connectWallet();
  if(d.type==="requestStartGame") await payToPlay();
  if(d.type==="submitScore") await submitScoreTx(d.score);
  if(d.type==="playAgain") await payToPlay();
});

document.addEventListener("DOMContentLoaded", () => {
    connectWallet();
    updateTopScores();
});

