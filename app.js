const CONTRACT_ADDRESS="0x35a7f3eE9A2b5fdEE717099F9253Ae90e1248AE3";
const CONTRACT_ABI=[
  "function startFeeWei() view returns (uint256)",
  "function startGame() payable",
  "function submitScore(uint256 _score)"
];
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
  if(walletBalEl){walletBalEl.textContent=balanceEth+" SOMI";walletBalEl.title=balanceEth+" SOMI";}
  return true;
}

function safeGameDoc(){
  const gameFrame=document.getElementById("gameFrame");
  return gameFrame&&gameFrame.contentWindow ? gameFrame.contentWindow : null;
}

async function payToPlay(){
  if(!signer){const ok=await connectWallet();if(!ok)return;}
  const bal=await provider.getBalance(userAddress);
  if(bal.lt(startFeeWei)){alert("Insufficient balance.");return;}
  const tx=await gameContract.startGame({value:startFeeWei});
  await tx.wait();

  const gw = safeGameDoc();
  if(gw){
    try{
      if(typeof gw.resetGame==="function") gw.resetGame();
      if(typeof gw.startCountdown==="function") gw.startCountdown();
      gw.allowLocalPlay = true; // aktifkan PAD
      const gm=gw.document.getElementById("game-message");
      if(gm){gm.textContent="PAYMENT SUCCESS! Starting Game...";gm.style.display="block";}
    }catch(e){console.warn("DOM control error:",e);}
  }
  showMain("gameFrame");
}

async function submitScoreTx(score){
  if(!gameContract||!signer)return;
  const tx=await gameContract.submitScore(Number(score));
  await tx.wait();

  const gw = safeGameDoc();
  if(gw){
    try{
      if(typeof gw.resetGame==="function") gw.resetGame();
      gw.allowLocalPlay=false; // kunci PAD lagi
      const gm=gw.document.getElementById("game-message");
      if(gm){gm.textContent="Score submitted! Pay again to play.";gm.style.display="block";}
    }catch(e){console.warn("DOM control error:",e);}
  }
  showMain("gameFrame");
}

// Terima pesan dari iframe game (dotEaten / submitScore)
window.addEventListener("message",async(ev)=>{
  const d=ev.data||{}; if(!d||typeof d!=="object") return;
  if(d.type==="requestConnectWallet"){await connectWallet();}
  if(d.type==="requestStartGame"){await payToPlay();}
  if(d.type==="dotEaten"){ /* opsional: bisa update UI jackpot lokal */ }
  if(d.type==="submitScore"){await submitScoreTx(d.score);}
  if(d.type==="playAgain"){await payToPlay();}
  if(d.type==="backToDashboard"){showMain("logoPlaceholder");}
});

document.addEventListener("DOMContentLoaded",async()=>{
  if(window.ethereum){
    const tempProvider=new ethers.providers.Web3Provider(window.ethereum,"any");
    const accounts=await tempProvider.listAccounts();
    if(accounts.length>0){await connectWallet();}
  }
});
