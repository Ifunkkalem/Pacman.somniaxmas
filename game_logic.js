// --- Konstanta Game ---
const GRID_SIZE = 20; // Ukuran setiap kotak dalam pixel
const TILE_COUNT = 22; // Jumlah kotak di peta (22x22)
const CANVAS_SIZE = GRID_SIZE * TILE_COUNT;
const MAZE = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,1,1],
    [1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1],
    [1,0,0,0,1,1,1,1,0,1,1,1,1,1,0,1,1,1,0,0,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,1],
    [1,0,1,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,1],
    [1,1,1,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
    [1,0,1,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// --- Variabel State Game ---
let canvas;
let ctx;
let player;
let score = 0;
let pellets = [];
let gameLoopInterval = null;
let currentDirection = null;
let requestedDirection = null;
let isGameRunning = false;
let lives = 3;

// --- Warna Natal ---
const COLOR_RED = '#C91010'; // Merah Natal
const COLOR_GREEN = '#0B6623'; // Hijau Hutan
const COLOR_SNOW = '#FFFFFF'; // Putih Salju
const COLOR_GOLD = '#FFD700'; // Emas

/**
 * @description Inisialisasi game saat tombol PLAY GAME ditekan.
 */
window.initGame = () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Set ukuran canvas agar dinamis
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    resetGame();
    startGameLoop();
    isGameRunning = true;
    
    // Tampilkan nama pemain di layar game
    playerNameGameDisplay.innerText = localStorage.getItem('displayName') || "Player Anon";
};

/**
 * @description Mereset semua state game ke awal.
 */
function resetGame() {
    score = 0;
    lives = 3;
    currentDirection = null;
    requestedDirection = null;

    // Inisialisasi posisi pemain (misalnya di tengah atas maze)
    player = { x: 10 * GRID_SIZE, y: 1 * GRID_SIZE, radius: GRID_SIZE / 3, speed: 2 };
    
    // Reset pellets (hanya untuk simulasi, perlu logika yang lebih kompleks untuk maze sebenarnya)
    initializePellets();
    
    updateScoreDisplay();
}

/**
 * @description Menempatkan pellet (hadiah) di peta.
 */
function initializePellets() {
    pellets = [];
    // Dalam game nyata, ini harus membaca array MAZE
    for (let row = 1; row < TILE_COUNT - 1; row += 2) {
        for (let col = 1; col < TILE_COUNT - 1; col += 2) {
            pellets.push({ x: col * GRID_SIZE + GRID_SIZE / 2, y: row * GRID_SIZE + GRID_SIZE / 2, eaten: false });
        }
    }
}


/**
 * @description Memulai game loop utama (refresh rate).
 */
function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(updateGame, 1000 / 60); // 60 FPS
}

/**
 * @description Menghentikan game loop.
 */
window.stopGameLoop = () => {
    if (gameLoopInterval) {
        clearInterval(gameLoopInterval);
        gameLoopInterval = null;
    }
    isGameRunning = false;
}

/**
 * @description Logika update game, dipanggil setiap frame.
 */
function updateGame() {
    if (!isGameRunning) return;
    
    // 1. Pergerakan (Disimulasikan sangat sederhana)
    movePlayerLogic();
    
    // 2. Deteksi Collision (Pellet)
    checkPelletCollision();
    
    // 3. Deteksi Collision (Ghost - tidak diimplementasikan)
    // 4. Deteksi Game Over
    if (score >= 1000) { // Menang
        gameOver(true);
    }
    
    // 5. Gambar Ulang
    drawGame();
}

/**
 * @description Menggambar semua elemen game di canvas.
 */
function drawGame() {
    // Bersihkan canvas dengan warna hitam
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Gambar Maze (Simulasi menggunakan array sederhana)
    drawMaze();

    // Gambar Pellets (Hadiah)
    drawPellets();

    // Gambar Pemain (Pac-Man diganti dengan simbol Natal)
    drawPlayer();
    
    // Gambar Ghosts (tidak diimplementasikan)
    
    // Tampilkan status di canvas (opsional)
}

/**
 * @description Menggambar Peta Maze.
 */
function drawMaze() {
    for (let r = 0; r < MAZE.length; r++) {
        for (let c = 0; c < MAZE[r].length; c++) {
            if (MAZE[r][c] === 1) {
                // Tembok (Warna Putih Salju)
                ctx.fillStyle = COLOR_SNOW;
                ctx.fillRect(c * GRID_SIZE, r * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                
                // Tambahkan border Merah untuk efek Candy Cane
                ctx.strokeStyle = COLOR_RED;
                ctx.lineWidth = 1;
                ctx.strokeRect(c * GRID_SIZE, r * GRID_SIZE, GRID_SIZE, GRID_SIZE);
            }
        }
    }
}

/**
 * @description Menggambar Pellet yang belum dimakan.
 */
function drawPellets() {
    pellets.forEach(pellet => {
        if (!pellet.eaten) {
            // Pellet (Anggap sebagai Lampu Pohon Natal)
            ctx.fillStyle = COLOR_GOLD; // Warna Emas
            ctx.beginPath();
            ctx.arc(pellet.x, pellet.y, GRID_SIZE / 8, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

/**
 * @description Menggambar Pemain.
 */
function drawPlayer() {
    // Pemain (Anggap sebagai Sinterklas/Hadiah Merah)
    ctx.fillStyle = COLOR_RED; 
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Tambahkan "mata" atau detail putih salju
    ctx.fillStyle = COLOR_SNOW;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius / 2, 0, Math.PI * 2);
    ctx.fill();
}


/**
 * @description Memperbarui posisi pemain berdasarkan arah saat ini.
 */
function movePlayerLogic() {
    // Coba ganti arah jika diminta dan bisa berbelok
    if (requestedDirection) {
        // Logika untuk mengecek apakah belokan valid di sini
        // Untuk simulasi sederhana, kita anggap belokan selalu valid
        currentDirection = requestedDirection;
        requestedDirection = null;
    }
    
    if (!currentDirection) return;

    let newX = player.x;
    let newY = player.y;

    switch (currentDirection) {
        case 'up': newY -= player.speed; break;
        case 'down': newY += player.speed; break;
        case 'left': newX -= player.speed; break;
        case 'right': newX += player.speed; break;
    }

    // Hanya untuk demo, abaikan collision tembok (MAZE)
    // Di game Pac-Man, pergerakan didasarkan pada ubin (tile-based)
    
    player.x = newX;
    player.y = newY;
}

/**
 * @description Mengatur arah yang diminta oleh pemain.
 * @param {string} direction 'up', 'down', 'left', 'right'.
 */
window.handleMovement = (direction) => {
    requestedDirection = direction;
};

/**
 * @description Menghentikan gerakan (tidak perlu untuk Pac-Man tradisional, tapi baik untuk D-pad).
 */
window.stopMovement = () => {
    // Pada Pac-Man, kita tidak benar-benar berhenti, kita menunggu tombol lain ditekan
    // currentDirection = null; // Biarkan pemain terus bergerak untuk Pac-Man
};

/**
 * @description Memeriksa apakah pemain menabrak pellet.
 */
function checkPelletCollision() {
    pellets.forEach(pellet => {
        if (!pellet.eaten) {
            const dx = player.x - pellet.x;
            const dy = player.y - pellet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < player.radius + (GRID_SIZE / 8)) {
                pellet.eaten = true;
                score += 10;
                updateScoreDisplay();
            }
        }
    });
}

/**
 * @description Memperbarui tampilan skor di UI.
 */
function updateScoreDisplay() {
    document.getElementById('scoreDisplay').innerText = score;
}

/**
 * @description Mengakhiri game.
 * @param {boolean} won Menang (true) atau Kalah (false).
 */
function gameOver(won) {
    stopGameLoop();
    isGameRunning = false;
    
    if (won) {
        window.showCustomModal("SELAMAT NATAL!", `Anda Menang! Skor Akhir: <span class="text-christmas-gold">${score}</span>. Selamat!`);
    } else {
        window.showCustomModal("GAME OVER", `Skor Anda: <span class="text-christmas-red">${score}</span>. Lebih beruntung di game berikutnya!`);
    }
    
    // Simpan skor ke database
    if (typeof window.saveScore === 'function') {
        window.saveScore(score);
    }
    
    // Kembali ke menu setelah modal ditutup
    document.getElementById('modalCloseBtn').onclick = () => {
        document.getElementById('customModal').style.display = 'none';
        document.getElementById('backMenuBtn').click(); // Kembali ke menu utama
    };
}

// --- Kontrol Keyboard ---
const KEYS_PRESSED = {};

window.handleKeyDown = (e) => {
    if (!isGameRunning) return;
    
    KEYS_PRESSED[e.key] = true;
    let direction = null;

    switch (e.key) {
        case 'ArrowUp':
        case 'w':
            direction = 'up';
            break;
        case 'ArrowDown':
        case 's':
            direction = 'down';
            break;
        case 'ArrowLeft':
        case 'a':
            direction = 'left';
            break;
        case 'ArrowRight':
        case 'd':
            direction = 'right';
            break;
    }

    if (direction) {
        handleMovement(direction);
    }
};

window.handleKeyUp = (e) => {
    delete KEYS_PRESSED[e.key];
    // Jika tidak ada tombol arah yang ditekan, kita bisa memanggil stopMovement()
    // Namun, Pac-Man terus bergerak, jadi kita biarkan saja.
};
