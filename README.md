🌟 PACMAN XMAS: SANTA'S SOMNIA CHALLENGE! 🎅

🚀 WELCOME TO THE SOMNIA CHRISTMAS CARNIVAL! 🎡
Prepare for a CLASSIC challenge re-imagined for the BLOCKCHAIN AGE! SANTA vs REINDEER drops you right into the FESTIVE CHAOS of the Somnia Carnival. Your WALLET is connected, your SOMI is ready, and CHRISTMAS DEPENDS on your speed!
🎁 The MISSION: SAVE THE GIFTS!
The NAUGHTY REINDEER 🦌 (our colorful ghosts) have stolen ESSENTIAL CHRISTMAS GIFTS (the dots) and scattered them throughout a giant maze—styled like a GLOWING GIFT BOX! As SANTA CLAUS, you must navigate the labyrinth, collect EVERY LAST GIFT, and submit your LEGENDARY HIGH SCORE to the SOMNIA LEADERBOARD!
> 🚨 SANTA CLAUS IS COMING TO TOWN... AND HE'S READY FOR A HIGH-SCORE BATTLE! 🚨
> 
✨ FEATURES THAT SHINE
 * 🟢 Web3 INTEGRATED: 🤝 Seamless iFrame communication for SECURE score submission and MANDATORY Game Activation checks. PLAY-TO-EARN READY!
 * 🔴 FULLY RESPONSIVE: 📱 Optimized controls for both DESKTOP (Arrow Keys) and MOBILE (D-Pad). Smooth gameplay is GUARANTEED.
 * 🟡 AUDIT-APPROVED SECURITY (V32): 🛡️ Utilizing STRICT TRUSTED_ORIGIN validation to ensure every score submission is GENUINE and safe from injection attacks.
 * 🟣 LOW-LATENCY CANVAS: ⚡️ Pure HTML5/JS implementation ensures MAXIMUM PERFORMANCE and minimal load times.
 * ⭐ FESTIVE VIBE: Unique SANTA and REINDEER sprites, combined with a striking RED-AND-GOLD maze design.
🛠️ INTEGRATION GUIDE (FOR DEVELOPERS)
This project is a single-file HTML/JS game designed to run as a SECURE IFRAME.
1. 🔑 SET YOUR TRUST ORIGIN (CRITICAL!)
For the Web3 integration to work and remain secure, you MUST update the TRUSTED_ORIGIN inside the game's <script> tag to match your Parent Application's domain precisely:
// --- L O C A T E   T H I S   L I N E ---
const TRUSTED_ORIGIN = "**https://pacman-somniaxmasv1.vercel.app**"; 
// ^^^ ENSURE THIS MATCHES YOUR PARENT DOMAIN! ^^^

2. 🔌 GAME ACTIVATION (THE PAYWALL)
The game requires the parent DApp to signal a successful connection or payment before the countdown starts.
> Parent App Logic (Example):
> // Run this after wallet connection and payment verification:
> iframe.contentWindow.postMessage(
>     { type: "paySuccess" }, 
>     "**https://pacman-somniaxmasv1.vercel.app**" 
> );
> 
> 
3. 🥇 SCORE HANDLING
Scores are sent SECURELY upon Game Over or Game Win via postMessage.
> Parent App Listener:
> window.addEventListener("message", (event) => {
>     // 1. MUST verify the source for security!
>     if (event.origin !== "**https://pacman-somniaxmasv1.vercel.app**") return; 
> 
> 
> if (event.data?.type === "submitScore") {
>     const **finalScore** = event.data.score;
>     console.log(`[SOMNIA LEDGER] Score Received: ${finalScore}`);
>     // --- YOUR SMART CONTRACT / LEADERBOARD LOGIC HERE ---
> }
> 
> });
> 
> 
© CREDITS
DEVELOPED BY: [IFUNKKALEM]

LICENSE: [MIT/PROPRIETARY] 📜

