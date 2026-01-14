// --- STOCKFISH 17.1 ENGINE INTEGRATION ---
// Uses Web Worker approach for the single-threaded WASM build

let engine = null;
let isEngineRunning = false;
let engineInitialized = false;

// --- BOT GAME VARIABLES ---
let botGameActive = false;
let botElo = 1500;
let selectedBotLine = null;
let isBotThinking = false;
let botGameMoves = [];
let botGameEvaluations = [];

// Initialize Stockfish Web Worker
async function initializeStockfish() {
    if (engineInitialized) {
        return;
    }
    
    try {
        console.log('Creating Stockfish Web Worker...');
        
        // Create a Web Worker from the Stockfish JS file
        engine = new Worker('stockfish/stockfish-17.1-single-a496a04.js');
        
        // Set up message handler
        engine.onmessage = function(event) {
            handleEngineMessage(event.data);
        };
        
        engine.onerror = function(error) {
            console.error('Stockfish Worker error:', error);
        };
        
        engineInitialized = true;
        console.log('Stockfish Worker created successfully');
        
        // Send initial UCI command
        sendEngineCommand('uci');
        
    } catch (err) {
        console.error('Failed to initialize Stockfish:', err);
        engineInitialized = false;
    }
}

// Send UCI command to engine
function sendEngineCommand(command) {
    if (!engine) {
        console.warn('Engine not initialized');
        return;
    }
    
    console.log('Sending command:', command);
    engine.postMessage(command);
}

// Handle all messages from the engine
function handleEngineMessage(line) {
    if (typeof line !== 'string') return;
    
    console.log('Engine:', line);
    
    // EVALUATION LOGIC (Only if NOT in bot mode)
    if (mode !== 'bot' && line.startsWith('info') && line.includes('score')) { 
        parseEvaluation(line); 
    }
    
    // EVALUATION TRACKING FOR BOT MODE
    if (mode === 'bot' && line.startsWith('info') && line.includes('score') && line.includes('depth')) {
        const tokens = line.split(' ');
        const depthIdx = tokens.indexOf('depth');
        const depth = depthIdx !== -1 ? parseInt(tokens[depthIdx + 1]) : 0;
        
        // Only track evaluations at reasonable depth
        if (depth >= 10) {
            const scoreIdx = tokens.indexOf('score');
            if (scoreIdx !== -1) {
                const type = tokens[scoreIdx + 1];
                let value = parseInt(tokens[scoreIdx + 2]);
                
                if (type === 'mate') {
                    value = value > 0 ? 10000 : -10000;
                }
                
                // Adjust for side to move
                if (game.turn() === 'b') value = -value;
                botGameEvaluations.push(value);
            }
        }
    }
    
    // BOT MOVE LOGIC
    if (mode === 'bot' && line.startsWith('bestmove')) {
        const best = line.split(' ')[1];
        if (best) {
            const moveResult = game.move({ 
                from: best.substring(0, 2), 
                to: best.substring(2, 4), 
                promotion: 'q' 
            });
            
            if (moveResult) {
                board.position(game.fen(), false);
                
                setTimeout(() => {
                    playSound('move');
                    highlightLastMove({ from: best.substring(0, 2), to: best.substring(2, 4) });
                    
                    setTimeout(() => {
                        isBotThinking = false;
                        updateBotStatus("Dein Zug", "neutral");
                        
                        if (game.game_over()) {
                            setTimeout(() => { 
                                showBotGameResults();
                            }, 500);
                        }
                    }, 150);
                }, 100);
            }
        }
    }
}

// Restart engine (terminate old, create new)
function restartEngine() {
    return new Promise((resolve, reject) => {
        if (engine) {
            engine.terminate();
            engine = null;
            engineInitialized = false;
        }
        
        initializeStockfish()
            .then(() => {
                // Wait a bit for engine to be ready
                setTimeout(resolve, 100);
            })
            .catch(reject);
    });
}

async function initEngine() {
    if (!engineInitialized) {
        await restartEngine();
    }
}

function toggleEngine() {
    isEngineRunning = !isEngineRunning;
    updateSettingsUI();
    const bar = document.getElementById('eval-bar-container');
    if (isEngineRunning) {
        initEngine().then(startEvaluation);
        bar.classList.remove('hidden');
    } else {
        bar.classList.add('hidden');
        sendEngineCommand('stop');
    }
}

function startEvaluation() {
    if (!isEngineRunning || !engine) return;
    sendEngineCommand('stop');
    sendEngineCommand('position fen ' + game.fen());
    sendEngineCommand('go depth 15');
}

// --- BOT GAME FUNCTIONS ---
function startBotSetup(lineId) {
    const line = repertoire[currentSide].find(l => l.id === lineId);
    if (!line) return;
    selectedBotLine = line;
    
    // Update UI immediately
    document.getElementById('bot-line-preview').innerText = line.pgn;
    document.getElementById('elo-display').innerText = botElo;
    document.getElementById('elo-slider').value = botElo;
    
    switchUI('bot-setup-mode');
    
    // Restart engine to clear old state (in background)
    restartEngine().catch(err => {
        console.error('Engine restart failed:', err);
    });
}

function updateEloDisplay(val) {
    botElo = val;
    document.getElementById('elo-display').innerText = val;
}

function launchBotGame() {
    if (!selectedBotLine) return;
    
    const startGame = () => {
        game.load_pgn(selectedBotLine.pgn);
        board.position(game.fen());
        board.orientation(currentSide);
        document.getElementById('eval-bar-container').classList.add('hidden');
        document.getElementById('bot-play-elo').innerText = `(${botElo})`;
        mode = 'bot';
        botGameActive = true;
        isBotThinking = false;
        botGameMoves = [];
        botGameEvaluations = [];
        switchUI('bot-play-mode');
        updateBotStatus("Spiel gestartet", "neutral");
        
        // Initial configuration for the game
        sendEngineCommand('ucinewgame');
        
        if (game.turn().charAt(0) !== currentSide.charAt(0)) {
            updateBotStatus("Bot zieht...", "neutral");
            isBotThinking = true;
            setTimeout(makeBotMove, 1000);
        }
    };
    
    // If engine is not ready, initialize it first
    if (!engine) {
        updateBotStatus("Engine wird geladen...", "neutral");
        restartEngine().then(() => {
            startGame();
        }).catch(err => {
            console.error('Engine start failed:', err);
            alert('Stockfish konnte nicht geladen werden.');
        });
    } else {
        startGame();
    }
}

function makeBotMove() {
    if (!botGameActive || !engine) return;
    if (game.game_over()) return;
    
    // ELO to skill level mapping
    let skill;
    if (botElo <= 800) {
        skill = 0;
    } else if (botElo <= 1100) {
        skill = Math.floor((botElo - 800) / 75);
    } else if (botElo <= 1400) {
        skill = Math.floor(4 + (botElo - 1100) / 60);
    } else if (botElo <= 1700) {
        skill = Math.floor(9 + (botElo - 1400) / 50);
    } else if (botElo <= 2200) {
        skill = Math.floor(15 + (botElo - 1700) / 125);
    } else {
        skill = 20;
    }
    
    const clampedSkill = Math.max(0, Math.min(20, skill));
    
    // Adjust move time based on strength
    let moveTime;
    if (botElo < 1000) {
        moveTime = 50;
    } else if (botElo < 1500) {
        moveTime = 100;
    } else if (botElo < 2000) {
        moveTime = 200;
    } else if (botElo < 2200) {
        moveTime = 300;
    } else if (botElo < 2500) {
        moveTime = 500;
    } else {
        moveTime = 800;
    }
    
    sendEngineCommand('stop');
    sendEngineCommand(`setoption name Skill Level value ${clampedSkill}`);
    
    // Add UCI Elo option for better strength calibration
    if (botElo <= 2800) {
        sendEngineCommand(`setoption name UCI_LimitStrength value true`);
        sendEngineCommand(`setoption name UCI_Elo value ${botElo}`);
    } else {
        sendEngineCommand(`setoption name UCI_LimitStrength value false`);
    }
    
    sendEngineCommand('position fen ' + game.fen());
    sendEngineCommand(`go movetime ${moveTime}`);
}

function updateBotStatus(msg, type) {
    const el = document.getElementById('bot-status');
    el.innerText = msg;
    el.className = `status-badge ${type}`;
}

function stopBotGame() {
    // If game is still active, show results as draw
    if (botGameActive && !game.game_over()) {
        showBotGameResults(true);
        return;
    }
    
    botGameActive = false;
    isBotThinking = false;
    mode = 'view';
    if (isEngineRunning) document.getElementById('eval-bar-container').classList.remove('hidden');
    switchUI('view-mode');
    resetBoardSearch();
}

function parseEvaluation(line) {
    const tokens = line.split(' ');
    let scoreIdx = tokens.indexOf('score');
    if (scoreIdx !== -1) {
        let type = tokens[scoreIdx + 1];
        let value = parseInt(tokens[scoreIdx + 2]);
        if (game.turn() === 'b') value = -value; 

        let score = 0;
        if (type === 'mate') {
            score = (value > 0) ? 100 : -100;
            document.getElementById('eval-score').innerText = `M${Math.abs(value)}`;
        } else {
            score = value / 100;
            document.getElementById('eval-score').innerText = (score > 0 ? '+' : '') + score.toFixed(1);
            if (score > 5) score = 5;
            if (score < -5) score = -5;
        }
        updateEvalBar(score);
    }
}

function updateEvalBar(score) {
    let percent = 50;
    if (score === 100) percent = 100;
    else if (score === -100) percent = 0;
    else percent = 50 + (score * 10);
    if (percent > 100) percent = 100;
    if (percent < 0) percent = 0;

    const fill = document.getElementById('eval-fill');
    const text = document.getElementById('eval-score');
    fill.style.height = percent + '%';
    
    if (score >= 0) {
        text.style.top = 'auto';
        text.style.bottom = '5px';
        text.style.color = '#333'; 
    } else {
        text.style.top = '5px';
        text.style.bottom = 'auto';
        text.style.color = '#f8fafc'; 
    }
}

// --- BOT GAME RESULTS ---
function calculateAccuracy(evaluations, isPlayerWhite) {
    if (evaluations.length < 2) return 95;
    
    let totalLoss = 0;
    let moveCount = 0;
    
    for (let i = 1; i < evaluations.length; i++) {
        const prevEval = evaluations[i - 1];
        const currEval = evaluations[i];
        
        let loss = 0;
        if (isPlayerWhite) {
            loss = Math.max(0, prevEval - currEval);
        } else {
            loss = Math.max(0, currEval - prevEval);
        }
        
        totalLoss += loss;
        moveCount++;
    }
    
    if (moveCount === 0) return 95;
    
    const avgLoss = totalLoss / moveCount;
    let accuracy = 100 * Math.exp(-avgLoss / 150);
    accuracy = Math.max(0, Math.min(100, accuracy));
    
    return Math.round(accuracy);
}

function showBotGameResults(manualStop = false) {
    const overlay = document.getElementById('bot-results-overlay');
    const icon = document.getElementById('bot-results-icon');
    const title = document.getElementById('bot-results-title');
    const subtitle = document.getElementById('bot-results-subtitle');
    
    let iconClass = '';
    let iconHtml = '';
    
    if (manualStop) {
        title.innerText = 'Spiel unterbrochen';
        subtitle.innerText = 'Du hast das Spiel beendet';
        iconClass = 'good';
        iconHtml = '<i class="fas fa-handshake"></i>';
    } else if (game.in_checkmate()) {
        if (game.turn() === 'w') {
            if (currentSide === 'black') {
                title.innerText = 'Du hast gewonnen!';
                subtitle.innerText = 'Schachmatt! Hervorragend gespielt!';
                iconClass = 'perfect';
                iconHtml = '<i class="fas fa-trophy"></i>';
            } else {
                title.innerText = 'Bot hat gewonnen';
                subtitle.innerText = 'Schachmatt! Versuch es nochmal!';
                iconClass = 'needs-work';
                iconHtml = '<i class="fas fa-robot"></i>';
            }
        } else {
            if (currentSide === 'white') {
                title.innerText = 'Du hast gewonnen!';
                subtitle.innerText = 'Schachmatt! Hervorragend gespielt!';
                iconClass = 'perfect';
                iconHtml = '<i class="fas fa-trophy"></i>';
            } else {
                title.innerText = 'Bot hat gewonnen';
                subtitle.innerText = 'Schachmatt! Versuch es nochmal!';
                iconClass = 'needs-work';
                iconHtml = '<i class="fas fa-robot"></i>';
            }
        }
    } else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
        title.innerText = 'Remis!';
        subtitle.innerText = 'Das Spiel endet unentschieden';
        iconClass = 'good';
        iconHtml = '<i class="fas fa-handshake"></i>';
    } else {
        title.innerText = 'Spiel beendet';
        subtitle.innerText = '';
        iconClass = 'good';
        iconHtml = '<i class="fas fa-flag-checkered"></i>';
    }
    
    icon.className = `results-icon ${iconClass}`;
    icon.innerHTML = iconHtml;
    
    const isPlayerWhite = currentSide === 'white';
    const playerAccuracy = calculateAccuracy(botGameEvaluations, isPlayerWhite);
    const botAccuracy = calculateAccuracy(botGameEvaluations, !isPlayerWhite);
    
    document.getElementById('player-accuracy').innerText = playerAccuracy + '%';
    document.getElementById('bot-accuracy').innerText = botAccuracy + '%';
    
    overlay.style.display = 'flex';
}

function closeBotResults() {
    document.getElementById('bot-results-overlay').style.display = 'none';
    botGameActive = false;
    isBotThinking = false;
    mode = 'view';
    if (isEngineRunning) document.getElementById('eval-bar-container').classList.remove('hidden');
    switchUI('view-mode');
    resetBoardSearch();
}
