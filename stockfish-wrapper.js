// --- BOT GAME VARIABLES ---
let botGameActive = false;
let botElo = 1500;
let selectedBotLine = null;
let isBotThinking = false; // LOCK VARIABLE FOR SYNC
let botGameMoves = []; // Track moves with evaluations
let botGameEvaluations = []; // Store evaluations for each position

// --- STOCKFISH ENGINE LOGIC (SYNC FIX) ---
let engine = null;
let isEngineRunning = false;

// HARD RESET FUNCTION
function restartEngine() {
    if(engine && engine.terminate) engine.terminate();
    
    return new Promise((resolve, reject) => {
        Stockfish().then(sf => {
            engine = sf;
            
            engine.addMessageListener(line => {
                if (typeof line !== 'string') return;
                
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
                    if(best) {
                        const moveResult = game.move({ from: best.substring(0,2), to: best.substring(2,4), promotion: 'q' });
                        
                        if (moveResult) {
                            board.position(game.fen(), false);
                            
                            setTimeout(() => {
                                playSound('move');
                                highlightLastMove({ from: best.substring(0,2), to: best.substring(2,4) });
                                
                                setTimeout(() => {
                                    isBotThinking = false;
                                    updateBotStatus("Dein Zug", "neutral");
                                    
                                    if(game.game_over()) {
                                        setTimeout(() => { 
                                            showBotGameResults();
                                        }, 500);
                                    }
                                }, 150);
                            }, 100);
                        }
                    }
                }
            });
            
            engine.postMessage('uci');
            resolve();
        }).catch(reject);
    });
}

async function initEngine() {
    if(!engine) await restartEngine();
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
        if(engine) engine.postMessage('stop');
    }
}

function startEvaluation() {
    if (!isEngineRunning || !engine) return;
    engine.postMessage('stop');
    engine.postMessage('position fen ' + game.fen());
    engine.postMessage('go depth 15');
}

// --- NEUE FUNKTIONEN FÜR BOT SPIEL ---
function startBotSetup(lineId) {
    const line = repertoire[currentSide].find(l => l.id === lineId);
    if(!line) return;
    selectedBotLine = line;
    
    // Update UI immediately
    document.getElementById('bot-line-preview').innerText = line.pgn;
    document.getElementById('elo-display').innerText = botElo;
    document.getElementById('elo-slider').value = botElo;
    
    switchUI('bot-setup-mode');
    
    // FORCE RESTART ENGINE TO CLEAR OLD STATE (in background)
    restartEngine().catch(err => {
        console.error('Engine restart failed:', err);
    });
}

function updateEloDisplay(val) {
    botElo = val;
    document.getElementById('elo-display').innerText = val;
}

function launchBotGame() {
    if(!selectedBotLine) return;
    
    // Ensure engine is ready before starting
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
        engine.postMessage('ucinewgame');
        
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
    if(!botGameActive || !engine) return;
    if(game.game_over()) return;
    
    // More accurate ELO to skill level mapping
    // Based on Stockfish skill level documentation and testing
    let skill;
    if (botElo <= 800) {
        skill = 0;
    } else if (botElo <= 1100) {
        skill = Math.floor((botElo - 800) / 75); // 0-4
    } else if (botElo <= 1400) {
        skill = Math.floor(4 + (botElo - 1100) / 60); // 5-9
    } else if (botElo <= 1700) {
        skill = Math.floor(9 + (botElo - 1400) / 50); // 10-15
    } else if (botElo <= 2200) {
        skill = Math.floor(15 + (botElo - 1700) / 125); // 16-19
    } else {
        skill = 20;
    }
    
    const clampedSkill = Math.max(0, Math.min(20, skill));
    
    // Adjust move time based on strength
    // Stronger bots get more time to think
    let moveTime;
    if (botElo < 1000) {
        moveTime = 50;
    } else if (botElo < 1500) {
        moveTime = 100;
    } else if (botElo < 2000) {        moveTime = 200;
    } else if (botElo < 2200) {

        moveTime = 300;
    } else if (botElo < 2500) {
        moveTime = 500;
    } else {
        moveTime = 800;
    }
    
    engine.postMessage('stop');
    engine.postMessage(`setoption name Skill Level value ${clampedSkill}`);
    
    // Add UCI Elo option for better strength calibration
    if (botElo <= 2800) {
        engine.postMessage(`setoption name UCI_LimitStrength value true`);
        engine.postMessage(`setoption name UCI_Elo value ${botElo}`);
    } else {
        engine.postMessage(`setoption name UCI_LimitStrength value false`);
    }
    
    engine.postMessage('position fen ' + game.fen());
    engine.postMessage(`go movetime ${moveTime}`);
}

function updateBotStatus(msg, type) {
    const el = document.getElementById('bot-status');
    el.innerText = msg;
    el.className = `status-badge ${type}`;
}

function stopBotGame() {
    // If game is still active, show results as draw
    if (botGameActive && !game.game_over()) {
        showBotGameResults(true); // Pass true to indicate manual stop
        return;
    }
    
    botGameActive = false;
    isBotThinking = false;
    mode = 'view';
    if(isEngineRunning) document.getElementById('eval-bar-container').classList.remove('hidden');
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
            if (score > 5) score = 5; if (score < -5) score = -5;
        }
        updateEvalBar(score);
    }
}

function updateEvalBar(score) {
    let percent = 50;
    if (score === 100) percent = 100; else if (score === -100) percent = 0;
    else percent = 50 + (score * 10);
    if (percent > 100) percent = 100; if (percent < 0) percent = 0;

    const fill = document.getElementById('eval-fill');
    const text = document.getElementById('eval-score');
    fill.style.height = percent + '%';
    
    if (score >= 0) {
        text.style.top = 'auto'; text.style.bottom = '5px'; text.style.color = '#333'; 
    } else {
        text.style.top = '5px'; text.style.bottom = 'auto'; text.style.color = '#f8fafc'; 
    }
}

// --- BOT GAME RESULTS ---
function calculateAccuracy(evaluations, isPlayerWhite) {
    if (evaluations.length < 2) return 95;
    
    let totalLoss = 0;
    let moveCount = 0;
    
    // Analyze consecutive moves to calculate centipawn loss
    for (let i = 1; i < evaluations.length; i++) {
        const prevEval = evaluations[i - 1];
        const currEval = evaluations[i];
        
        // Calculate eval loss from perspective
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
    
    // Stricter accuracy calculation using exponential decay
    // This penalizes mistakes more heavily
    // avgLoss ~25 = ~85%, ~50 = ~71%, ~100 = ~51%, ~200 = ~26%, ~300 = ~13%
    let accuracy = 100 * Math.exp(-avgLoss / 150);
    
    // Clamp between 0 and 100
    accuracy = Math.max(0, Math.min(100, accuracy));
    
    return Math.round(accuracy);
}

function showBotGameResults(manualStop = false) {
    const overlay = document.getElementById('bot-results-overlay');
    const icon = document.getElementById('bot-results-icon');
    const title = document.getElementById('bot-results-title');
    const subtitle = document.getElementById('bot-results-subtitle');
    
    // Determine winner
    let winner = '';
    let iconClass = '';
    let iconHtml = '';
    
    if (manualStop) {
        // Game was manually stopped - show as draw
        title.innerText = 'Spiel unterbrochen';
        subtitle.innerText = 'Du hast das Spiel beendet';
        iconClass = 'good';
        iconHtml = '<i class="fas fa-handshake"></i>';
    } else if (game.in_checkmate()) {
        if (game.turn() === 'w') {
            winner = 'Schwarz gewinnt!';
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
            winner = 'Weiß gewinnt!';
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
    
    // Calculate accuracies
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
    if(isEngineRunning) document.getElementById('eval-bar-container').classList.remove('hidden');
    switchUI('view-mode');
    resetBoardSearch();
}
