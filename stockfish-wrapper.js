
// --- STOCKFISH 17.1 ENGINE INTEGRATION ---
// Uses Web Worker approach for the single-threaded WASM build

let engine = null;
let isEngineRunning = false;
let engineInitialized = false;
let engineCalculating = false; // Track if engine is currently calculating

// --- BOT GAME VARIABLES ---
let botGameActive = false;
let botElo = 1500;
let botStyle = 'neutral'; // neutral, greedy, tactical, positional
let selectedBotLine = null;
let isBotThinking = false;
let botGameMoves = [];
let botGameEvaluations = [];
let botMultiPvMoves = []; // Store candidate moves for style selection
let botWaitingForStyleMove = false; // Track if we're waiting for MultiPV results

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
    
    // Track when a 'go' command starts a calculation
    if (command.startsWith('go ')) {
        engineCalculating = true;
    }
    
    console.log('Sending command:', command);
    engine.postMessage(command);
}

// Stop any ongoing engine calculation
// Returns a promise that resolves when the engine is ready for new commands
function stopEngineCalculation() {
    return new Promise((resolve) => {
        if (!engine) {
            resolve();
            return;
        }
        
        if (!engineCalculating) {
            // No calculation in progress, resolve immediately
            resolve();
            return;
        }
        
        // Send stop command
        console.log('Stopping ongoing calculation...');
        engine.postMessage('stop');
        
        // Give the engine a brief moment to process the stop command
        // This ensures messages from the old search are flushed
        setTimeout(() => {
            engineCalculating = false;
            resolve();
        }, 50);
    });
}

// Handle all messages from the engine
function handleEngineMessage(line) {
    if (typeof line !== 'string') return;
    
    // --- FIX START: Configure Engine Memory on Startup ---
    // This intercepts the 'uciok' signal to set safe memory limits immediately.
    // Without this, Stockfish 17 tries to allocate too much RAM and crashes WASM.
    if (line === 'uciok') {
        console.log('Configuring Stockfish memory...');
        sendEngineCommand('setoption name Threads value 1'); // Ensure single thread
        sendEngineCommand('setoption name Hash value 256'); // Limit to 16MB (Safe for web)
        sendEngineCommand('isready');
        return;
    }
    // --- FIX END ---

    // Track when calculation stops (bestmove signals end of calculation)
    if (line.startsWith('bestmove')) {
        engineCalculating = false;
    }

    // ANALYSIS MODE - handle MultiPV results
    if (analysisActive && line.startsWith('info') && line.includes(' pv ')) {
        handleAnalysisMessage(line);
    }
    
    // EVALUATION LOGIC (Only if NOT in bot mode and not in analysis)
    // Updates the evaluation bar during normal board usage
    if (!analysisActive && mode !== 'bot' && line.startsWith('info') && line.includes('score')) { 
        parseEvaluation(line); 
    }
    
    // EVALUATION TRACKING FOR BOT MODE
    // Captures evaluation history to calculate accuracy at end of game
    if (mode === 'bot' && line.startsWith('info') && line.includes('score') && line.includes('depth')) {
        const tokens = line.split(' ');
        const depthIdx = tokens.indexOf('depth');
        const depth = depthIdx !== -1 ? parseInt(tokens[depthIdx + 1]) : 0;
        
        // Only track evaluations at reasonable depth (>= 10) to avoid noise
        if (depth >= 10) {
            const scoreIdx = tokens.indexOf('score');
            if (scoreIdx !== -1) {
                const type = tokens[scoreIdx + 1];
                let value = parseInt(tokens[scoreIdx + 2]);
                
                if (type === 'mate') {
                    value = value > 0 ? 10000 : -10000;
                }
                
                // Adjust score for side to move so the graph/stats are consistent
                if (game.turn() === 'b') value = -value;
                botGameEvaluations.push(value);
            }
        }
    }
    
    // BOT STYLE - Collect MultiPV candidates
    if (mode === 'bot' && botWaitingForStyleMove && line.startsWith('info') && line.includes(' pv ')) {
        const tokens = line.split(' ');
        const multipvIdx = tokens.indexOf('multipv');
        const pvIdx = tokens.indexOf('pv');
        const scoreIdx = tokens.indexOf('score');
        
        if (multipvIdx !== -1 && pvIdx !== -1 && scoreIdx !== -1) {
            const pvNum = parseInt(tokens[multipvIdx + 1]);
            const move = tokens[pvIdx + 1];
            const scoreType = tokens[scoreIdx + 1];
            let scoreValue = parseInt(tokens[scoreIdx + 2]);
            
            if (scoreType === 'mate') {
                scoreValue = scoreValue > 0 ? 10000 : -10000;
            }
            
            // Store move with its info
            botMultiPvMoves[pvNum - 1] = {
                move: move,
                score: scoreValue,
                isCapture: isCaptureMove(move),
                isCheck: isCheckMove(move)
            };
        }
    }
    
    // BOT MOVE LOGIC
    // Detects when the bot has finished thinking and plays the move
    if (mode === 'bot' && line.startsWith('bestmove')) {
        let selectedMove;
        
        if (botWaitingForStyleMove && botMultiPvMoves.length > 0) {
            // Select move based on style
            selectedMove = selectMoveByStyle(botMultiPvMoves, line.split(' ')[1]);
            botWaitingForStyleMove = false;
            botMultiPvMoves = [];
        } else {
            selectedMove = line.split(' ')[1];
        }
        
        if (selectedMove) {
            const moveResult = game.move({ 
                from: selectedMove.substring(0, 2), 
                to: selectedMove.substring(2, 4), 
                promotion: selectedMove.length > 4 ? selectedMove[4] : 'q' 
            });
            
            if (moveResult) {
                board.position(game.fen(), false);
                
                setTimeout(() => {
                    if (moveResult.captured) playSound('capture');
                    else playSound('move');
                    highlightLastMove({ from: selectedMove.substring(0, 2), to: selectedMove.substring(2, 4) });
                    
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

// Check if a UCI move is a capture (by checking if target square has a piece)
function isCaptureMove(uciMove) {
    const to = uciMove.substring(2, 4);
    const piece = game.get(to);
    return piece !== null;
}

// Check if a move gives check (simple heuristic)
function isCheckMove(uciMove) {
    // We can't easily check without making the move, so we return false
    // The engine's evaluation already considers this
    return false;
}

// Select move based on bot style from MultiPV candidates
function selectMoveByStyle(candidates, bestMove) {
    // Filter valid candidates (non-null)
    const validCandidates = candidates.filter(c => c && c.move);
    if (validCandidates.length === 0) return bestMove;
    
    const topScore = validCandidates[0].score;
    
    // Define acceptable score loss based on skill (weaker bots can deviate more)
    let maxScoreLoss;
    if (botElo < 1200) {
        maxScoreLoss = 150; // Can play moves up to 1.5 pawns worse
    } else if (botElo < 1600) {
        maxScoreLoss = 80;  // Up to 0.8 pawns worse
    } else if (botElo < 2000) {
        maxScoreLoss = 40;  // Up to 0.4 pawns worse
    } else {
        maxScoreLoss = 20;  // Only 0.2 pawns worse for strong bots
    }
    
    // Filter candidates within acceptable score range
    const acceptableMoves = validCandidates.filter(c => 
        (topScore - c.score) <= maxScoreLoss
    );
    
    if (acceptableMoves.length <= 1) {
        return acceptableMoves[0]?.move || bestMove;
    }
    
    switch (botStyle) {
        case 'greedy': {
            // Prefer captures, especially winning ones
            const captures = acceptableMoves.filter(c => c.isCapture);
            if (captures.length > 0) {
                // Sort by score (best capture)
                captures.sort((a, b) => b.score - a.score);
                return captures[0].move;
            }
            // No captures available, play the safest (best scored) move
            return acceptableMoves[0].move;
        }
        
        case 'tactical': {
            // Prefer captures and active moves, willing to sacrifice
            const captures = acceptableMoves.filter(c => c.isCapture);
            if (captures.length > 0) {
                // Pick a capture, even if slightly worse (within limits)
                return captures[Math.floor(Math.random() * Math.min(2, captures.length))].move;
            }
            // Add some randomness among top moves to create "chaos"
            const topMoves = acceptableMoves.slice(0, Math.min(3, acceptableMoves.length));
            return topMoves[Math.floor(Math.random() * topMoves.length)].move;
        }
        
        case 'positional': {
            // Avoid captures when possible, prefer quiet moves
            const quietMoves = acceptableMoves.filter(c => !c.isCapture);
            if (quietMoves.length > 0) {
                // Play the best quiet move
                return quietMoves[0].move;
            }
            // Must capture, play the best one
            return acceptableMoves[0].move;
        }
        
        default:
            // Neutral: just play the best move
            return acceptableMoves[0].move;
    }
}

// Restart engine (terminate old, create new)
function restartEngine() {
    return new Promise((resolve, reject) => {
        if (engine) {
            engine.terminate();
            engine = null;
            engineInitialized = false;
            engineCalculating = false; // Reset calculation flag
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
        stopEngineCalculation();
    }
}

async function startEvaluation() {
    // If full analysis (MultiPV) is active, do not start the simple evaluation
    // as it will interrupt the analysis 'go' command and prevent results.
    if (analysisActive) {
        console.log('startEvaluation skipped because analysisActive is true');
        return;
    }

    if (!isEngineRunning || !engine) return;
    
    // Stop any ongoing calculation before starting new one
    await stopEngineCalculation();
    
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

function selectBotStyle(style) {
    botStyle = style;
    
    // Update button states
    document.querySelectorAll('.bot-style-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === style);
    });
    
    // Update description with concrete behaviors
    const descriptions = {
        'neutral': 'Ausgewogener Spielstil. Spielt den objektiv besten Zug.',
        'greedy': 'Schlägt gerne Figuren und vermeidet Abtäusche bei Materialvorteil. Nimmt selten Opfer an.',
        'tactical': 'Sucht Schachs, Angriffe und Opfer. Bevorzugt offene Linien und aktive Figuren.',
        'positional': 'Vermeidet Schlagzüge wenn möglich. Baut langsam auf und verbessert Figurenstellung.'
    };
    document.getElementById('bot-style-description').innerText = descriptions[style] || descriptions['neutral'];
}

function launchBotGame() {
    if (!selectedBotLine) return;
    
    const styleNames = {
        'neutral': '',
        'greedy': 'Materialist',
        'tactical': 'Taktiker',
        'positional': 'Stratege'
    };
    
    const startGame = () => {
        game.load_pgn(selectedBotLine.pgn);
        board.position(game.fen());
        board.orientation(currentSide);
        document.getElementById('eval-bar-container').classList.add('hidden');
        document.getElementById('bot-play-elo').innerText = `(${botElo})`;
        document.getElementById('bot-play-style').innerText = styleNames[botStyle] || '';
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

async function makeBotMove() {
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
    
    // Stop any ongoing calculation before starting bot move calculation
    await stopEngineCalculation();
    
    sendEngineCommand(`setoption name Skill Level value ${clampedSkill}`);
    
    // Add UCI Elo option for better strength calibration
    if (botElo <= 2800) {
        sendEngineCommand(`setoption name UCI_LimitStrength value true`);
        sendEngineCommand(`setoption name UCI_Elo value ${botElo}`);
    } else {
        sendEngineCommand(`setoption name UCI_LimitStrength value false`);
    }
    
    // Apply style-specific UCI options
    switch (botStyle) {
        case 'greedy':
            sendEngineCommand('setoption name Contempt value 50');
            break;
        case 'tactical':
            sendEngineCommand('setoption name Contempt value -30');
            break;
        case 'positional':
            sendEngineCommand('setoption name Contempt value 20');
            break;
        default:
            sendEngineCommand('setoption name Contempt value 0');
    }
    
    sendEngineCommand('position fen ' + game.fen());
    
    // For non-neutral styles, use MultiPV to get candidate moves for style-based selection
    if (botStyle !== 'neutral') {
        botMultiPvMoves = [];
        botWaitingForStyleMove = true;
        sendEngineCommand('setoption name MultiPV value 5');
        sendEngineCommand(`go movetime ${moveTime}`);
    } else {
        // Neutral style: just play the engine's best move
        botWaitingForStyleMove = false;
        sendEngineCommand('setoption name MultiPV value 1');
        sendEngineCommand(`go movetime ${moveTime}`);
    }
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
