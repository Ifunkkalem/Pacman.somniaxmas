/* game_logic.js */
// File ini hanya menangani rendering dan state game.
// PERUBAHAN KRITIS: Penambahan gameStartTime untuk mencegah Game Over instan.

let running = false;
let currentScore = 0; 
let gameStartTime = 0; // Tambahkan variabel waktu mulai game
const PLAYER_SPEED = 3.5; 
const GHOST_SIZE = 20; 
const PLAYER_SIZE = 30; 
const CANDY_VALUE = 10; 

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

// Player State
let x = 400; // Posisi awal di tengah
let y = 300; 
let vx = 0; 
let vy = 0; 
let currentDirection = 0; 

// --- WALL MANAGEMENT (LABYRINTH KOMPLEKS) ---
const WALL_THICKNESS = 20;

const walls = [
    // 1. Perimeter (Batas Luar)
    { x: 0, y: 0, width: canvas.width, height: WALL_THICKNESS }, // Atas
    { x: 0, y: canvas.height - WALL_THICKNESS, width: canvas.width, height: WALL_THICKNESS }, // Bawah
    { x: 0, y: 0, width: WALL_THICKNESS, height: canvas.height }, // Kiri
    { x: canvas.width - WALL_THICKNESS, y: 0, width: WALL_THICKNESS, height: canvas.height }, // Kanan
    
    // 2. Struktur Internal (Menciptakan Koridor)
    // T-Blocks
    { x: 100, y: 100, width: 20, height: 100 }, 
    { x: 100, y: 180, width: 100, height: 20 }, 
    
    { x: 500, y: 100, width: 20, height: 100 }, 
    { x: 500, y: 100, width: 100, height: 20 },
    
    // Blok Horizontal Panjang
    { x: 100, y: 380, width: 200, height: 20 },
    { x: 500, y: 380, width: 200, height: 20 },

    // Pusat Labirin (Ruangan Aman/Jalur Silang)
    { x: 300, y: 280, width: 200, height: 20 },
    { x: 300, y: 300, width: 20, height: 100 },
    { x: 480, y: 300, width: 20, height: 100 },

    // Sudut Bawah
    { x: 100, y: 500, width: 100, height: 20 },
    { x: 600, y: 500, width: 100, height: 20 },
    { x: 180, y: 400, width: 20, height: 100 },
    { x: 600, y: 400, width: 20, height: 100 },
];

/**
 * Menggambar semua dinding (Labirin).
 */
function drawWalls() {
    ctx.fillStyle = "rgba(123, 0, 255, 0.8)"; 
    for (const wall of walls) {
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    }
}

/**
 * Cek tabrakan AABB antara dua kotak.
 */
function checkAABBCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

/**
 * Mencegah Player menembus dinding.
 */
function checkPlayerWallCollision(newX, newY) {
    const playerRect = {
        x: newX - PLAYER_SIZE,
        y: newY - PLAYER_SIZE,
        width: 2 * PLAYER_SIZE,
        height: 2 * PLAYER_SIZE
    };

    for (const wall of walls) {
        if (checkAABBCollision(playerRect, wall)) {
            return true; // Tabrakan
        }
    }
    return false; // Aman
}


// --- GHOST MANAGEMENT ---
let ghosts = [];

class Ghost {
    constructor(x, y, color, behavior, speed) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.behavior = behavior;
        this.speed = speed;
        this.radius = GHOST_SIZE;
        this.randomMoveCooldown = 0;
        this.vx = 0;
        this.vy = 0;
    }
}

/**
 * Menghitung pergerakan hantu, mencegahnya menembus dinding.
 */
function moveGhost(ghost) {
    let targetX = x;
    let targetY = y;
    let dx = 0;
    let dy = 0;

    // Menghitung arah ke target
    if (ghost.behavior === "chase" || ghost.behavior === "flee") {
        dx = targetX - ghost.x;
        dy = targetY - ghost.y;
        
        if (ghost.behavior === "flee") {
            dx *= -1;
            dy *= -1;
        }

        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            ghost.vx = (dx / distance) * ghost.speed;
            ghost.vy = (dy / distance) * ghost.speed;
        }
    } else if (ghost.behavior === "random") {
        ghost.randomMoveCooldown--;
        if (ghost.randomMoveCooldown <= 0) {
            ghost.vx = (Math.random() - 0.5) * ghost.speed * 2;
            ghost.vy = (Math.random() - 0.5) * ghost.speed * 2;
            ghost.randomMoveCooldown = 60; 
        }
    }
    
    // --- PENGECEKAN TABRAKAN DINDING UNTUK GHOST ---
    const newX = ghost.x + ghost.vx;
    const newY = ghost.y + ghost.vy;
    
    const ghostRect = {
        x: newX - ghost.radius,
        y: newY - ghost.radius,
        width: 2 * ghost.radius,
        height: 2 * ghost.radius
    };
    
    let collided = false;
    for (const wall of walls) {
        if (checkAABBCollision(ghostRect, wall)) {
            collided = true;
            
            // Balik arah (dan paksa arah baru untuk Random)
            if (ghost.vx !== 0) ghost.vx *= -1;
            if (ghost.vy !== 0) ghost.vy *= -1;
            
            if (ghost.behavior === "random") {
                ghost.randomMoveCooldown = 0; 
            }
            break;
        }
    }

    if (!collided) {
        ghost.x = newX;
        ghost.y = newY;
    }
}

/**
 * Menggambar Hantu (Tampilan Halloween) - (Tidak Berubah)
 */
function drawGhost(ghost) {
    const r = ghost.radius;
    
    ctx.fillStyle = ghost.color;
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y - r / 2, r, Math.PI, 0, false);
    ctx.lineTo(ghost.x + r, ghost.y + r);
    ctx.lineTo(ghost.x + r * 0.75, ghost.y + r - 5);
    ctx.lineTo(ghost.x + r * 0.5, ghost.y + r);
    ctx.lineTo(ghost.x + r * 0.25, ghost.y + r - 5);
    ctx.lineTo(ghost.x, ghost.y + r);
    ctx.lineTo(ghost.x - r * 0.25, ghost.y + r - 5);
    ctx.lineTo(ghost.x - r * 0.5, ghost.y + r);
    ctx.lineTo(ghost.x - r * 0.75, ghost.y + r - 5);
    ctx.lineTo(ghost.x - r, ghost.y + r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(ghost.x - r / 2, ghost.y - r / 2, 4, 0, 2 * Math.PI);
    ctx.arc(ghost.x + r / 2, ghost.y - r / 2, 4, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.fillStyle = "black";
    const eyeDx = (x - ghost.x) / 10;
    const eyeDy = (y - ghost.y) / 10;
    ctx.beginPath();
    ctx.arc(ghost.x - r / 2 + eyeDx, ghost.y - r / 2 + eyeDy, 2, 0, 2 * Math.PI);
    ctx.arc(ghost.x + r / 2 + eyeDx, ghost.y + r / 2 + eyeDy, 2, 0, 2 * Math.PI);
    ctx.fill();
}

function checkCollision(ghost) {
    const dx = x - ghost.x;
    const dy = y - ghost.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < PLAYER_SIZE + ghost.radius; 
}


// --- CANDY (PERMEN) MANAGEMENT ---
let candy = [];

/**
 * Menyusun permen di canvas. Memastikan permen TIDAK berada di dalam dinding.
 */
function setupCandy() {
    candy = [];
    const rows = 12; // Lebih banyak baris
    const cols = 20; // Lebih banyak kolom
    const paddingX = 40;
    const paddingY = 40;
    const spacingX = (canvas.width - 2 * paddingX) / (cols - 1);
    const spacingY = (canvas.height - 2 * paddingY) / (rows - 1);
    
    const candyRectSize = 10; 

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const candyX = paddingX + c * spacingX;
            const candyY = paddingY + r * spacingY;
            
            // Hindari menaruh permen di area start player
            if (Math.abs(candyX - 400) < 60 && Math.abs(candyY - 300) < 60) continue; 
            
            // Cek apakah permen bertabrakan dengan DINDING
            let isInsideWall = false;
            const candyRect = {
                x: candyX - candyRectSize / 2, 
                y: candyY - candyRectSize / 2, 
                width: candyRectSize, 
                height: candyRectSize
            };

            for (const wall of walls) {
                // Beri sedikit margin agar permen tidak terlalu dekat dengan dinding
                const collisionMargin = 5; 
                const wallCheck = {
                    x: wall.x - collisionMargin,
                    y: wall.y - collisionMargin,
                    width: wall.width + 2 * collisionMargin,
                    height: wall.height + 2 * collisionMargin
                };
                
                if (checkAABBCollision(candyRect, wallCheck)) {
                    isInsideWall = true;
                    break;
                }
            }

            if (!isInsideWall) {
                candy.push({ x: candyX, y: candyY });
            }
        }
    }
}

/**
 * Menggambar semua permen (labu/pumpkin) yang tersisa.
 */
function drawCandy() {
    ctx.fillStyle = "orange";
    for (const item of candy) {
        const radius = 6;
        ctx.beginPath();
        ctx.arc(item.x, item.y, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "green";
        ctx.fillRect(item.x - 1, item.y - radius - 3, 2, 3);
        ctx.fillStyle = "orange"; 
    }
}

/**
 * Cek apakah Pac-Man mengumpulkan permen.
 */
function checkCandyCollection() {
    for (let i = candy.length - 1; i >= 0; i--) {
        const item = candy[i];
        const dx = x - item.x;
        const dy = y - item.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_SIZE) {
            currentScore += CANDY_VALUE;
            candy.splice(i, 1); 

            if (candy.length === 0) {
                endGame(true); 
                return true;
            }
        }
    }
    return false;
}


// --- PLAYER CONTROL & DRAW FUNCTIONS ---

function handleKeyDown(event) {
    if (!running) return;

    vx = 0;
    vy = 0;
    
    switch (event.key) {
        case "ArrowRight":
            vx = PLAYER_SPEED;
            currentDirection = 0; 
            break;
        case "ArrowLeft":
            vx = -PLAYER_SPEED;
            currentDirection = 1; 
            break;
        case "ArrowUp":
            vy = -PLAYER_SPEED;
            currentDirection = 2; 
            break;
        case "ArrowDown":
            vy = PLAYER_SPEED;
            currentDirection = 3; 
            break;
    }
}
window.addEventListener('keydown', handleKeyDown);

function drawPacman() {
    const radius = PLAYER_SIZE;
    let startAngle = 0;
    let endAngle = 2 * Math.PI;

    const mouthOpenness = Math.sin(Date.now() / 100) * 0.2 + 0.5;
    const mouthAngle = mouthOpenness * Math.PI / 4;

    switch (currentDirection) {
        case 0: // Kanan
            startAngle = mouthAngle;
            endAngle = 2 * Math.PI - mouthAngle;
            break;
        case 1: // Kiri
            startAngle = Math.PI + mouthAngle;
            endAngle = 3 * Math.PI - mouthAngle;
            break;
        case 2: // Atas
            startAngle = 1.5 * Math.PI + mouthAngle;
            endAngle = 3.5 * Math.PI - mouthAngle;
            break;
        case 3: // Bawah
            startAngle = 0.5 * Math.PI + mouthAngle;
            endAngle = 2.5 * Math.PI - mouthAngle;
            break;
    }
    
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
}


/**
 * Game Loop Utama
 */
function loop() {
    requestAnimationFrame(loop);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!running) {
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "30px 'Trebuchet MS', sans-serif";
        ctx.fillText("Click START to Pay and Play!", canvas.width / 2, canvas.height / 2);
        
        // GAMBAR DINDING (LABIRIN) agar terlihat saat menunggu
        drawWalls(); 
        
        return;
    }
    
    // 1. GAMBAR DINDING (LABIRIN)
    drawWalls();

    // 2. UPDATE POSISI PLAYER & BATAS
    const newX = x + vx;
    const newY = y + vy;

    // Cek tabrakan dinding sebelum bergerak (X)
    if (!checkPlayerWallCollision(newX, y)) {
        x = newX;
    } else {
        vx = 0; // Hentikan pergerakan X jika menabrak
    }
    
    // Cek tabrakan dinding sebelum bergerak (Y)
    if (!checkPlayerWallCollision(x, newY)) {
        y = newY;
    } else {
        vy = 0; // Hentikan pergerakan Y jika menabrak
    }

    // Batas Dinding Canvas (Perimeter)
    const perimeterMargin = WALL_THICKNESS + PLAYER_SIZE;
    if (x < perimeterMargin) { x = perimeterMargin; vx = 0; }
    if (x > canvas.width - perimeterMargin) { x = canvas.width - perimeterMargin; vx = 0; }
    if (y < perimeterMargin) { y = perimeterMargin; vy = 0; }
    if (y > canvas.height - perimeterMargin) { y = canvas.height - perimeterMargin; vy = 0; }
    
    // 3. GAMBAR PACMAN
    drawPacman();
    
    // 4. GAMBAR DAN CEK PENGUMPULAN PERMEN
    drawCandy();
    checkCandyCollection();
    
    // 5. UPDATE DAN GAMBAR GHOSTS + CEK COLLISION
    for (const ghost of ghosts) {
        moveGhost(ghost);
        drawGhost(ghost);

        if (checkCollision(ghost)) {
            endGame(false); // Game Over karena tabrakan
            return; 
        }
    }
    
    // 6. Update Score UI
    scoreEl.innerText = currentScore;
}

/**
 * Dipanggil oleh web3_game.js setelah transaksi startGame berhasil.
 */
function startGameLoop() {
    if (running) return;
    running = true;
    currentScore = 0;
    
    // --- KRITIS: SETEL WAKTU MULAI GAME ---
    gameStartTime = Date.now(); 
    // -------------------------------------
    
    // INISIASI 3 GHOST (Dimulai dari sudut luar)
    ghosts = [
        new Ghost(40, 40, "#FF0000", "chase", 2.0),       // Merah (Chaser)
        new Ghost(760, 40, "#00FFFF", "random", 2.0),    // Cyan (Randomizer)
        new Ghost(760, 560, "#FF69B4", "flee", 1.5)       // Pink (Evader)
    ];
    
    // SETUP CANDY (Permen)
    setupCandy();

    // Reset posisi dan kecepatan player (Tengah)
    x = 400; 
    y = 300;
    vx = 0;
    vy = 0;
    currentDirection = 0;
    
    scoreEl.innerText = currentScore; 
    document.getElementById("startOnchainBtn").disabled = true;
    document.getElementById("startOnchainBtn").innerText = "GAME RUNNING...";
}

/**
 * Dipanggil ketika game over/win.
 * @param {boolean} isWin - True jika menang (kumpulkan semua permen).
 */
function endGame(isWin) {
    if (!running) return;
    
    // --- KRITIS: PEMERIKSAAN WAKTU DAN SKOR MINIMUM ---
    const timeElapsed = Date.now() - gameStartTime;
    
    if (timeElapsed < 1000 && currentScore === 0 && !isWin) {
        // Jika Game Over dalam 1 detik pertama dengan skor 0 (panggilan instan yang tidak disengaja)
        console.warn("endGame diabaikan: Panggilan terjadi terlalu cepat (<1 detik) saat inisialisasi.");
        running = false; // Pastikan loop berhenti
        // Reset Tombol UI:
        document.getElementById("startOnchainBtn").disabled = false;
        document.getElementById("startOnchainBtn").innerText = "START GAME (0.01 SOMI)";
        return; 
    }
    // --------------------------------------------------
    
    running = false; // Hentikan loop game
    
    if (isWin) {
        alert(`CONGRATULATIONS! Anda memenangkan permainan dengan skor penuh: ${currentScore}`);
    } else {
        alert(`GAME OVER! Final Score: ${currentScore}`);
    }
    
    if (typeof submitFinalScore === 'function') {
        // Panggil fungsi submit ke kontrak dari web3_game.js
        submitFinalScore(currentScore); 
    } else {
        console.error("submitFinalScore tidak ditemukan. Transaksi skor tidak dikirim.");
    }
    
    // Reset UI setelah modal ditutup/proses submit selesai
    document.getElementById("startOnchainBtn").disabled = false;
    document.getElementById("startOnchainBtn").innerText = "START GAME (0.01 SOMI)";
}

/**
 * Navigasi kembali ke menu (index.html).
 */
function backMenu() {
  window.location.href = "index.html";
}

// Mulai loop awal (menampilkan pesan "Click Start")
loop();
