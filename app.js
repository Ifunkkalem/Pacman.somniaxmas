// contract.js content moved here for completeness (assuming no ES6 imports)
const CONTRACT_ADDRESS="0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";

// CONTRACT_ABI LENGKAP (dari file contract.js)
const CONTRACT_ABI = [
  {"inputs":[{"internalType":"address","name":"_treasury","type":"address"},{"internalType":"uint256","name":"_startFeeWei","type":"uint256"},{"internalType":"uint256","name":"_maxScorePerSubmit","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"FeeUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"player","type":"address"},{"indexed":false,"internalType":"uint256","name":"fee","type":"uint256"}],"name":"GameStarted","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newMaxScore","type":"uint256"}],"name":"MaxScoreUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"score","type":"uint256"}],"name":"ScoreSubmitted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdraw","type":"event"},{"inputs":[],"name":"getTop10","outputs":[{"internalType":"address[]","name":"topPlayers","type":"address[]"},{"internalType":"uint256[]","name":"scores","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxScorePerSubmit","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"players","outputs":[{"internalType":"uint256","name":"totalScore","type":"uint256"},{"internalType":"uint256","name":"lastPlayed","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"newMaxScore","type":"uint256"}],"name":"setMaxScore","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"setStartFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"startFeeWei","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"startGame","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"uint256","name":"score","type":"uint256"}],"name":"submitScore","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"top10Scores","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"top10Wallets","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"treasury","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}];

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

function updateWalletUI(address, balanceEth) {
    const data = {
        type: 'walletInfo',
        address: address,
        balance: balanceEth ? Number(balanceEth).toFixed(4) : '-'
    };
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
  
  try {
    await provider.send("eth_requestAccounts",[]);
    signer=provider.getSigner();
    userAddress=await signer.getAddress();
  } catch (e) {
    console.error("Account request rejected or failed:", e);
    alert("Wallet connection rejected or failed.");
    updateWalletUI('-', '-'); 
    return false;
  }
  
  const ok=await switchNetwork(provider);
  if(!ok) {
    updateWalletUI(userAddress, '-'); 
    return false;
  }
  
  readContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,provider);
  gameContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
  try{startFeeWei=await readContract.startFeeWei();}catch{startFeeWei=ethers.utils.parseEther("0.001");}
  
  const balance=await provider.getBalance(userAddress);
  const balanceEth=ethers.utils.formatEther(balance);
  
  updateWalletUI(userAddress, balanceEth);
  updateTopScores(); 
  return true;
}

// Fungsi ini TIDAK diperlukan lagi karena kita postMessage langsung ke index.html
// function safeGameDoc(){
//   const gameFrame=document.getElementById("gameFrame");
//   return gameFrame&&gameFrame.contentWindow ? gameFrame.contentWindow : null;
// }

async function payToPlay(){
  if(!signer){const ok=await connectWallet();if(!ok)return;}
  
  window.postMessage({ type: 'clearWaiting' }, '*'); 

  const bal=await provider.getBalance(userAddress);
  if(bal.lt(startFeeWei)){alert("Insufficient balance.");return;}
  
  try {
    window.postMessage({ type: 'showWaiting', message: 'Requesting transaction... check wallet.' }, '*'); 
    const tx=await gameContract.startGame({value:startFeeWei});

    window.postMessage({ type: 'showWaiting', message: 'Waiting for transaction confirmation...' }, '*'); 

    await tx.wait();

    // >>> PERUBAHAN UTAMA DI SINI <<<
    // Kirim pesan paySuccess LANGSUNG ke index.html, 
    // agar index.html yang panggil showMain('gameFrame')
    window.postMessage({ type: 'paySuccess' }, '*');
    
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
    window.postMessage({ type: 'showWaiting', message: 'Submitting score to blockchain...' }, '*');
    const tx=await gameContract.submitScore(Number(score));
    
    await tx.wait();

    // Kirim pesan ke game Iframe agar tahu submission sukses (jika perlu feedback UI di game)
    const gameFrame = document.getElementById("gameFrame");
    if(gameFrame && gameFrame.contentWindow){
        gameFrame.contentWindow.postMessage({ type: 'scoreSubmittedSuccess' }, '*');
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
  if (!provider) {
    // Jika provider belum terinisialisasi (user belum connect), gunakan provider read-only
    try {
        provider = new ethers.providers.JsonRpcProvider(SOMNIA_NETWORK_CONFIG.rpcUrls[0], { chainId: 5031, name: 'somnia' });
        readContract = new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,provider);
    } catch(e) {
        console.warn("Could not create read-only provider for top scores.");
        return;
    }
  }

  try {
    const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
    const jackpot = ethers.utils.formatEther(contractBalance);

    const [topPlayers, scores] = await readContract.getTop10();
    const topScoreValue = scores.length > 0 ? Number(scores[0]) : 0;

    window.postMessage({
      type: 'updateSummary',
      jackpot: parseFloat(jackpot).toFixed(4), 
      topScore: topScoreValue
    }, '*');

  } catch (e) {
    console.error("Failed to fetch top scores:", e);
  }
}

if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
            connectWallet();
        } else {
            updateWalletUI('-', '-'); 
            alert("Wallet disconnected. Please reconnect.");
        }
    });

    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}

window.addEventListener("message",async(ev)=>{
  const d=ev.data||{}; if(!d||typeof d!=="object") return;
  
  if(d.type==="requestConnectWallet"){await connectWallet();}
  if(d.type==="requestStartGame"){await payToPlay();} 
  
  if(d.type==="submitScore"){await submitScoreTx(d.score);}
  if(d.type==="playAgain"){await payToPlay();}
  if(d.type==="backToDashboard"){window.postMessage({ type: 'forceShowLogo' }, '*');}
});

document.addEventListener("DOMContentLoaded",async()=>{
  if(window.ethereum){
    const tempProvider=new ethers.providers.Web3Provider(window.ethereum,"any");
    try {
        const accounts = await tempProvider.listAccounts();
        if(accounts.length > 0){
            await connectWallet();
        } else {
            updateWalletUI('-', '-');
        }
    } catch (e) {
        console.warn("Failed to list accounts on load:", e);
        updateWalletUI('-', '-');
    }
  }
  updateTopScores();
});
