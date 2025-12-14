🚀 PACMAN XMAS: SANTA'S SOMNIA CHALLENGE 🎅

🕹️ Welcome to the Somnia Christmas Carnival!
Prepare for a classic challenge re-imagined for the blockchain age! Santa vs Reindeer drops you right into the festive chaos of the Somnia Carnival. Your wallet is connected, your SOMI is ready, and Christmas depends on your speed!
The Mission: Save the Gifts!
The naughty Reindeer 🦌 (our colorful ghosts) have stolen essential Christmas gifts (the dots) and scattered them throughout a giant maze—styled like a glowing gift box! As Santa Claus, you must navigate the labyrinth, collect every last gift, and submit your legendary high score to the Somnia Leaderboard before the clock runs out.
> Santa Claus is coming to town... and he's not afraid of a good high-score battle!
> 
✨ Features That Shine
 * Web3 Integrated: Seamless iFrame communication for secure score submission and mandatory Game Activation checks. Play-to-Earn ready!
 * Fully Responsive: Optimized controls for both desktop (Arrow Keys) and mobile (D-Pad). Smooth gameplay is guaranteed.
 * Audit-Approved Security (V32): Utilizing strict TRUSTED_ORIGIN validation to ensure every score submission is genuine and secure against injection attacks.
 * Low-Latency Canvas: Pure HTML5/JS implementation ensures maximum performance and minimal load times.
 * Festive Vibe: Unique Santa and Reindeer sprites, combined with a striking red-and-gold maze design.

🛠️ Integration Guide (For Developers)
This project is a single-file HTML/JS game designed to run as a Secure iFrame.
1. 🔑 Set Your Trust Origin (Crucial Security Step)
For the Web3 integration to work and remain secure, you must update the TRUSTED_ORIGIN inside the game's <script> tag to match your Parent Application's domain precisely:
// --- Located near the top of the <script> block ---
const TRUSTED_ORIGIN = "https://pacman-somniaxmasv1.vercel.app"; // <-- GANTI DENGAN DOMAIN FINAL ANDA!

2. 🔌 Game Activation (The "Paywall" Bypass)
The game requires the parent DApp to signal a successful connection or payment before the countdown starts.
Parent App Logic (Example):
// Run this function after wallet connection and payment/ticket verification:

function activateGame(iframeId, targetOrigin) {
    const iframe = document.getElementById(iframeId); 
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
            { type: "paySuccess" }, 
            targetOrigin // e.g., "https://pacman-somniaxmasv1.vercel.app"
        );
    }
}

3. 🥇 Score Handling
Scores are sent securely upon Game Over or Game Win via postMessage.
Parent App Listener:
window.addEventListener("message", (event) => {
    // 1. MUST verify the source for security!
    if (event.origin !== "https://pacman-somniaxmasv1.vercel.app") return; 

    if (event.data?.type === "submitScore") {
        const finalScore = event.data.score;
        console.log(`[SOMNIA] High Score Received: ${finalScore}`);
        
        // --- YOUR WEB3 SUBMISSION LOGIC HERE ---
        // (e.g., Calling smart contract function to update leaderboard)
    }

    // Optional: Listener for every dot eaten
    if (event.data?.type === "dotEaten") {
        // Use this for micro-animations or live scoring updates on the parent page.
    }
});

© Credits
Developed by: [ifunkkalem]
License: [MIT/Proprietary]

