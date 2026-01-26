// --- RESIZER LOGIC ---
const resizer = document.getElementById('resizer');
const boardArea = document.getElementById('board-area');
const container = document.getElementById('main-container');
let isResizing = false;
resizer.addEventListener('mousedown', (e) => { isResizing = true; document.body.style.cursor = 'col-resize'; resizer.classList.add('dragging'); e.preventDefault(); });
document.addEventListener('mousemove', (e) => { if (!isResizing) return; const containerWidth = container.getBoundingClientRect().width; let newFlex = (e.clientX / containerWidth) * 100; if(newFlex < 30) newFlex = 30; if(newFlex > 70) newFlex = 70; boardArea.style.flex = `0 0 ${newFlex}%`; if(board) board.resize(); });
document.addEventListener('mouseup', () => { if(isResizing) { isResizing = false; document.body.style.cursor = ''; resizer.classList.remove('dragging'); if(board) board.resize(); } });

// --- AUDIO ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
function initAudio() { if (audioCtx.state === 'suspended') { audioCtx.resume(); } }

function playSound(type) {
    if(!userSettings.sound) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    if (type === 'move') { osc.type = 'sine'; osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.05); gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05); osc.start(); osc.stop(audioCtx.currentTime + 0.05); } 
    else if (type === 'capture') {
        // Deep capture: use move's base frequency as starting point, ramp down for weight
        const baseStart = 300; // match move base
        const baseEnd = 40;    // deep final frequency

        // Main thud (uses move-like start frequency, ramps down)
        const thudFilter = audioCtx.createBiquadFilter();
        thudFilter.type = 'lowpass';
        thudFilter.frequency.setValueAtTime(240, audioCtx.currentTime);

        const thud = audioCtx.createOscillator();
        const thudGain = audioCtx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(baseStart, audioCtx.currentTime);
        thud.frequency.exponentialRampToValueAtTime(baseEnd, audioCtx.currentTime + 0.18);
        thudGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
        thudGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
        thud.connect(thudFilter); thudFilter.connect(thudGain); thudGain.connect(audioCtx.destination);
        thud.start(); thud.stop(audioCtx.currentTime + 0.7);

        // Sub oscillator for depth
        const sub = audioCtx.createOscillator();
        const subGain = audioCtx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(30, audioCtx.currentTime);
        subGain.gain.setValueAtTime(0.22, audioCtx.currentTime);
        subGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
        sub.connect(subGain); subGain.connect(audioCtx.destination);
        sub.start(); sub.stop(audioCtx.currentTime + 0.9);

        // Soft bell accent (low volume)
        const bell = audioCtx.createOscillator();
        const bellGain = audioCtx.createGain();
        bell.type = 'triangle';
        bell.frequency.setValueAtTime(800, audioCtx.currentTime);
        bell.frequency.exponentialRampToValueAtTime(380, audioCtx.currentTime + 0.06);
        bellGain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        bellGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
        bell.connect(bellGain); bellGain.connect(audioCtx.destination);
        bell.start(); bell.stop(audioCtx.currentTime + 0.18);

        // Subtle click to emphasize impact
        const clickBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.02, audioCtx.sampleRate);
        const data = clickBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.005));
        const click = audioCtx.createBufferSource();
        const clickGain = audioCtx.createGain();
        click.buffer = clickBuf; click.connect(clickGain); clickGain.connect(audioCtx.destination);
        clickGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        click.start(); click.stop(audioCtx.currentTime + 0.02);
    }
    else if (type === 'error') { osc.type = 'sine'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.2); gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2); }
}

let userSettings = JSON.parse(localStorage.getItem('chessSettingsPro')) || { theme: 'dark', sound: true, coords: true, highlight: true, autoRepeat: false, animSpeed: 200, boardColor: 'green', pieceStyle: 'wikipedia', sortMode: 'similarity', treeView: false, editorOrder: ['name', 'stockfish', 'database', 'moves'], analysisOpen: false, databaseOpen: true, roundedCorners: false };

// Line statistics tracking
let lineStats = JSON.parse(localStorage.getItem('chessLineStats')) || {};

// Safety Reset for old bad settings
if(userSettings.pieceStyle === 'dubrovnik') { userSettings.pieceStyle = 'wikipedia'; localStorage.setItem('chessSettingsPro', JSON.stringify(userSettings)); }
// Migration: Convert old createModeOrder to new editorOrder array
const defaultOrder = ['name', 'stockfish', 'database', 'moves'];
if(!userSettings.editorOrder || !Array.isArray(userSettings.editorOrder)) {
    // Convert old format to new
    if(userSettings.createModeOrder === 'database-first') {
        userSettings.editorOrder = ['name', 'database', 'stockfish', 'moves'];
    } else {
        userSettings.editorOrder = defaultOrder;
    }
    delete userSettings.createModeOrder;
    localStorage.setItem('chessSettingsPro', JSON.stringify(userSettings));
}
// Migration: Remove 'notes' from editorOrder if present
if(userSettings.editorOrder && userSettings.editorOrder.includes('notes')) {
    userSettings.editorOrder = userSettings.editorOrder.filter(k => k !== 'notes');
    localStorage.setItem('chessSettingsPro', JSON.stringify(userSettings));
}

let expandedCategories = {}; 
let isPaused = false; 
let pendingNextAction = null; 
let totalTrainingLines = 0;
const REPETITION_CAT = "Wiederholung"; 
let trainingStats = {
correct: 0,
wrong: 0,
wrongLines: []
};

function updateSettingsUI() {
    document.getElementById('setting-theme-row').classList.toggle('active', userSettings.theme === 'dark'); 
    document.getElementById('setting-sound-row').classList.toggle('active', userSettings.sound);
    document.getElementById('setting-coords-row').classList.toggle('active', userSettings.coords);
    document.getElementById('setting-highlight-row').classList.toggle('active', userSettings.highlight);
    document.getElementById('setting-autorepeat-row').classList.toggle('active', userSettings.autoRepeat);
    document.getElementById('setting-treeview-row').classList.toggle('active', userSettings.treeView); //Tree
    document.getElementById('setting-rounded-row').classList.toggle('active', userSettings.roundedCorners);
    
    // Stockfish Toggle
    const engineRow = document.getElementById('setting-engine-row');
    if(engineRow) engineRow.classList.toggle('active', isEngineRunning);
    
    // Sort Mode Toggle
    const sortRow = document.getElementById('setting-sortmode-row');
    if(sortRow) sortRow.classList.toggle('active', userSettings.sortMode === 'mastery');

    document.querySelectorAll('.option-card').forEach(el => el.classList.remove('selected'));
    if(document.getElementById(`opt-anim-${userSettings.animSpeed}`)) document.getElementById(`opt-anim-${userSettings.animSpeed}`).classList.add('selected');
    if(document.getElementById(`opt-board-${userSettings.boardColor}`)) document.getElementById(`opt-board-${userSettings.boardColor}`).classList.add('selected');
    if(document.getElementById(`opt-piece-${userSettings.pieceStyle}`)) document.getElementById(`opt-piece-${userSettings.pieceStyle}`).classList.add('selected');
    
    // Render editor order list
    renderEditorOrderList();
}
function applySettings() {
    if (userSettings.theme === 'light') document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode');
    document.getElementById('board').className = `board-theme-${userSettings.boardColor}`;
    if (userSettings.roundedCorners) document.getElementById('board').classList.add('board-rounded'); else document.getElementById('board').classList.remove('board-rounded');
    if(board) initBoard();
    updateSettingsUI();
}
function toggleSetting(key) { 
    userSettings[key] = !userSettings[key]; 
    saveSettings(); 
    applySettings(); 
    
    // Re-render list immediately when treeView is toggled
    if (key === 'treeView') {
        if (mode === 'view') renderList();
        else if (mode === 'selection') renderSelectionList();
    }
}
function toggleThemeSetting() { userSettings.theme = userSettings.theme === 'light' ? 'dark' : 'light'; saveSettings(); applySettings(); }
function toggleSortMode() { 
    userSettings.sortMode = userSettings.sortMode === 'similarity' ? 'mastery' : 'similarity'; 
    saveSettings(); 
    applySettings();
    if (mode === 'view') renderList(); // Refresh the list immediately
}
function setAnimSpeed(speed) { userSettings.animSpeed = speed; saveSettings(); applySettings(); }
function setBoardColor(c) { userSettings.boardColor = c; saveSettings(); applySettings(); }
function setPieceTheme(s) { userSettings.pieceStyle = s; saveSettings(); applySettings(); }

// Move an item in the editor order list up or down
function moveOrderItem(key, direction) {
    const order = userSettings.editorOrder;
    const index = order.indexOf(key);
    if (index === -1) return;
    
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= order.length) return;
    
    // Swap elements
    [order[index], order[newIndex]] = [order[newIndex], order[index]];
    saveSettings();
    renderEditorOrderList();
}

// Render the order list in settings UI
function renderEditorOrderList() {
    const container = document.getElementById('editor-order-list');
    if (!container) return;
    
    const labels = {
        'name': 'Kategorie',
        'stockfish': 'Stockfish Analyse',
        'database': 'Datenbank',
        'moves': 'Züge'
    };
    
    container.innerHTML = userSettings.editorOrder.map(key => `
        <div class="order-item" data-key="${key}">
            <i class="fas fa-grip-lines"></i>
            <span>${labels[key]}</span>
            <div class="order-arrows">
                <button onclick="moveOrderItem('${key}', -1)"><i class="fas fa-chevron-up"></i></button>
                <button onclick="moveOrderItem('${key}', 1)"><i class="fas fa-chevron-down"></i></button>
            </div>
        </div>
    `).join('');
}

// Apply the user's preferred order to the add-mode UI
function applyCreateModeOrder() {
    const container = document.getElementById('add-mode-sections');
    const buttonsContainer = document.querySelector('.add-mode-buttons');
    if (!container) return;
    
    const order = userSettings.editorOrder;
    
    // Reorder sections based on user preference
    order.forEach(key => {
        const element = container.querySelector(`[data-element="${key}"]`);
        if (element) {
            container.appendChild(element);
        }
    });
    
    // Reorder buttons based on stockfish/database order
    if (buttonsContainer) {
        const stockfishIndex = order.indexOf('stockfish');
        const databaseIndex = order.indexOf('database');
        const btnAnalysis = document.getElementById('btn-analysis');
        const btnDatabase = document.getElementById('btn-database');
        
        if (btnAnalysis && btnDatabase) {
            if (databaseIndex < stockfishIndex) {
                buttonsContainer.insertBefore(btnDatabase, btnAnalysis);
            } else {
                buttonsContainer.insertBefore(btnAnalysis, btnDatabase);
            }
        }
    }
}
function saveSettings() { localStorage.setItem('chessSettingsPro', JSON.stringify(userSettings)); }
function openSettings() { switchUI('settings-mode'); updateSettingsUI(); }
function closeSettings() { switchUI('view-mode'); }

// Board variables are now in board.js (board, game, currentSide)

let mode = 'view'; let editingId = null; let repertoire = JSON.parse(localStorage.getItem('chessRepertoire_v3')) || { white: [], black: [] };
let currentComments = {}; 
let currentShapes = {}; 
let currentAnnotations = {}; 
let currentDisplayAnnotations = {}; 
let currentTrainingAnnotations = {}; 
let trainingQueue = []; let currentTrainLine = null; let currentMoveIndex = 0;
let addModePreviewIndex = -1; // -1 means at the end (current position)
let addModeFullHistory = []; // Store full history to enable forward navigation after going back

// Board functions (onDrop, onSnapEnd, forceboardUpdate, etc.) are now in board.js

function updateViewSearch() { const currentPgn = game.pgn(); if (!currentPgn) { resetBoardSearch(); return; } document.getElementById('search-active-banner').classList.remove('hidden'); renderList(currentPgn); }

function updateSelectionSearch() { 
    const currentPgn = game.pgn(); 
    if (!currentPgn) { 
        resetSelectionBoardSearch(); 
        return; 
    } 
    document.getElementById('selection-search-banner')?.classList.remove('hidden'); 
    renderSelectionList(currentPgn); 
}

function resetSelectionBoardSearch() {
    game.reset(); 
    board.position(game.fen()); 
    $('#board .square-55d63').removeClass('highlight-square'); 
    document.getElementById('selection-search-banner')?.classList.add('hidden'); 
    renderSelectionList();
}

function resetBoardSearch() { 
    game.reset(); board.position(game.fen()); $('#board .square-55d63').removeClass('highlight-square'); document.getElementById('search-active-banner').classList.add('hidden'); renderList(null); 
    if(isEngineRunning && engine) engine.postMessage('stop');
    document.getElementById('eval-fill').style.height = '50%';
    document.getElementById('eval-score').innerText = '0.0';
    currentTrainingAnnotations = {}; // Clear training annotations
    currentDisplayAnnotations = {}; // Clear display annotations
    drawShapes();
}

// Toggle eval bar on home screen
let evalBarActive = false;

async function toggleEvalBar() {
    evalBarActive = !evalBarActive;
    const btn = document.getElementById('btn-eval-bar');
    const evalBar = document.getElementById('eval-bar-container');
    
    if (evalBarActive) {
        btn.classList.add('active');
        evalBar.classList.remove('hidden');
        isEngineRunning = true;
        startEvaluation();
    } else {
        btn.classList.remove('active');
        evalBar.classList.add('hidden');
        isEngineRunning = false;
        await stopEngineCalculation();
        // Reset eval bar
        document.getElementById('eval-fill').style.height = '50%';
        document.getElementById('eval-score').innerText = '0.0';
    }
}

function getGroupedLines(side, filterPgn = null) { const groups = {}; repertoire[side].forEach(line => { if (filterPgn && !line.pgn.startsWith(filterPgn)) return; const cat = line.category || 'Allgemein'; if (!groups[cat]) groups[cat] = []; groups[cat].push(line); }); return groups; }
function setSide(color) { currentSide = color; $('.color-btn').removeClass('active'); $(`.color-btn:contains('${color === 'white' ? 'Weiß' : 'Schwarz'}')`).addClass('active'); board.orientation(color); resetBoardSearch(); }

// Mobile board toggle
let mobileBoardVisible = false;
function toggleMobileBoard() {
    mobileBoardVisible = !mobileBoardVisible;
    const boardArea = document.getElementById('board-area');
    const toggleBtn = document.getElementById('mobile-board-toggle');
    
    if (mobileBoardVisible) {
        boardArea.classList.add('mobile-visible');
        toggleBtn.classList.add('active');
        toggleBtn.title = 'Brett schließen';
        // Resize board after it becomes visible
        setTimeout(() => {
            if (board) board.resize();
        }, 50);
    } else {
        boardArea.classList.remove('mobile-visible');
        toggleBtn.classList.remove('active');
        toggleBtn.title = 'Brett anzeigen';
    }
}

function toggleCategory(catEscaped) {
    if (expandedCategories[catEscaped]) delete expandedCategories[catEscaped];
    else expandedCategories[catEscaped] = true;
    renderList(game.pgn());
}

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(repertoire));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "chess_repertoire_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove();
}
function importData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const newRepertoire = JSON.parse(e.target.result);
            if (newRepertoire.white && newRepertoire.black) {
                if(confirm("Warnung: Deine aktuellen Daten werden überschrieben. Fortfahren?")) { repertoire = newRepertoire; saveData(); renderList(); alert("Daten erfolgreich geladen!"); }
            } else { alert("Ungültige Datei."); }
        } catch (err) { alert("Fehler beim Lesen der Datei."); }
    };
    reader.readAsText(file);
}

// --- REPETITION LOGIC ---
function updateRepetitionButtonState() {
    const btnFooter = document.getElementById('train-toggle-btn');
    if (!currentTrainLine || !btnFooter) return;
    
    const exists = repertoire[currentSide].some(l => l.pgn === currentTrainLine.pgn && l.category === REPETITION_CAT);
    
    if (exists) {
        btnFooter.innerHTML = '<i class="fas fa-check-circle"></i> Gemeistert (Entfernen)';
        btnFooter.className = 'action-btn remove-repetition';
    } else {
        btnFooter.innerHTML = '<i class="fas fa-bookmark"></i> Wiederholung';
        btnFooter.className = 'action-btn repetition';
    }
}

function toggleRepetitionStatus() {
    const exists = repertoire[currentSide].some(l => l.pgn === currentTrainLine.pgn && l.category === REPETITION_CAT);
    
    if (exists) {
        repertoire[currentSide] = repertoire[currentSide].filter(l => !(l.pgn === currentTrainLine.pgn && l.category === REPETITION_CAT));
        saveData();
        updateRepetitionButtonState();
    } else {
        const newLine = JSON.parse(JSON.stringify(currentTrainLine));
        newLine.id = Date.now();
        // Preserve original category name for repetition entries
        newLine.originalCategory = currentTrainLine.originalCategory || currentTrainLine.category;
        newLine.category = REPETITION_CAT;
        repertoire[currentSide].unshift(newLine);
        saveData();
        updateRepetitionButtonState();
    }
}

function toggleRepetitionFromList(id) {
    const line = repertoire[currentSide].find(l => l.id === id);
    if (!line) return;
    const repIndex = repertoire[currentSide].findIndex(l => l.pgn === line.pgn && l.category === REPETITION_CAT);
    if (repIndex !== -1) { repertoire[currentSide].splice(repIndex, 1); } 
    else { const newLine = JSON.parse(JSON.stringify(line)); newLine.id = Date.now(); newLine.originalCategory = line.category; newLine.category = REPETITION_CAT; repertoire[currentSide].unshift(newLine); }
    saveData(); renderList(game.pgn());
}

function addToRepetition(line) {
    const alreadyExists = repertoire[currentSide].some(l => l.pgn === line.pgn && l.category === REPETITION_CAT);
    if (!alreadyExists) {
        const newLine = JSON.parse(JSON.stringify(line)); newLine.id = Date.now(); newLine.originalCategory = line.category; newLine.category = REPETITION_CAT;
        repertoire[currentSide].unshift(newLine); saveData();
        updateRepetitionButtonState();
    }
}

function renderList(filterPgn = null) {
    const list = document.getElementById('lines-list'); 
    list.innerHTML = '';
    const groups = getGroupedLines(currentSide, filterPgn);
    
    const repetitionLines = repertoire[currentSide].filter(l => l.category === REPETITION_CAT);
    const repetitionPgns = new Set(repetitionLines.map(l => l.pgn));

    const categories = Object.keys(groups).sort((a,b) => { 
        if(a === REPETITION_CAT) return -1; 
        if(b === REPETITION_CAT) return 1; 
        return a.localeCompare(b); 
    });

    if (categories.length === 0) { 
        list.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">Leer.</div>`; 
        return; 
    }
    
    categories.forEach(cat => {
        const catEscaped = cat.replace(/'/g, "\\'"); 
        const isExpanded = expandedCategories[cat]; 
        const arrowClass = isExpanded ? 'expanded' : ''; 
        const contentClass = isExpanded ? 'expanded' : '';
        const specialClass = (cat === REPETITION_CAT) ? 'special-cat' : '';

        const groupDiv = document.createElement('div'); 
        groupDiv.className = 'category-group';
        
        groupDiv.innerHTML = `
            <div class="category-header ${arrowClass} ${specialClass}" onclick="toggleCategory('${catEscaped}')">
                <div style="display:flex; align-items:center;">
                    <i class="fas fa-chevron-right"></i><span>${cat}</span>
                </div>
                <div class="cat-actions" onclick="event.stopPropagation()">
                    <button onclick="startAddingLine('${catEscaped}')"><i class="fas fa-plus"></i></button>
                    <button onclick="renameCategory('${catEscaped}')"><i class="fas fa-pen"></i></button>
                    <button class="del" onclick="deleteCategory('${catEscaped}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
            
        const contentDiv = document.createElement('div'); 
        contentDiv.className = `category-content ${contentClass}`;

        // --- TREE VIEW LOGIC ---
        if (userSettings.treeView && groups[cat].length > 0) {
            // Build and render the tree for this category
            const treeHTML = buildCategoryTree(groups[cat], repetitionPgns);
            contentDiv.innerHTML = `<div class="tree-container">${treeHTML}</div>`;
        } 
        // --- STANDARD LIST LOGIC ---
        else {
            // Your existing sorting logic
            groups[cat].sort((a, b) => {
                 if (userSettings.sortMode === 'mastery') {
                    const statsA = lineStats[a.id] || { correct: 0, wrong: 0 };
                    const statsB = lineStats[b.id] || { correct: 0, wrong: 0 };
                    const accA = (statsA.correct + statsA.wrong) > 0 ? statsA.correct / (statsA.correct + statsA.wrong) : 0;
                    const accB = (statsB.correct + statsB.wrong) > 0 ? statsB.correct / (statsB.correct + statsB.wrong) : 0;
                    return accA - accB;
                }
                return a.pgn.length - b.pgn.length; // Default simple sort
            });

            const fragment = document.createDocumentFragment();
            groups[cat].forEach(line => {
                const div = document.createElement('div'); 
                const isInRepetition = cat !== REPETITION_CAT && repetitionPgns.has(line.pgn);
                const repetitionClass = isInRepetition ? 'in-repetition' : '';
                div.className = `line-item ${repetitionClass}`;
                
                // Render individual moves for context menu support
                const movesHtml = renderLineMovesWithContextMenu(line);
                
                div.innerHTML = `
                    <span class="line-moves">${movesHtml}</span>
                    <div class="line-actions">
                        <button onclick="toggleRepetitionFromList(${line.id})" class="toggle-rep" title="Wiederholung">
                            <i class="${isInRepetition ? 'fas' : 'far'} fa-bookmark" style="${isInRepetition ? 'color:var(--warning)' : ''}"></i>
                        </button>
                        <button onclick="startBotSetup(${line.id})" title="Gegen Bot"><i class="fas fa-robot"></i></button>
                        <button onclick="editLine(${line.id})"><i class="fas fa-pen"></i></button>
                        <button class="del" onclick="deleteLine(${line.id})"><i class="fas fa-trash"></i></button>
                    </div>`;
                fragment.appendChild(div);
            });
            contentDiv.appendChild(fragment);
        }
        
        groupDiv.appendChild(contentDiv); 
        list.appendChild(groupDiv);
    });
}

// Render line moves as individual spans with context menu support
function renderLineMovesWithContextMenu(line) {
    const tempGame = new Chess();
    if (!line.pgn) return '<span class="view-move">Startposition</span>';
    
    tempGame.load_pgn(line.pgn);
    const history = tempGame.history();
    if (history.length === 0) return '<span class="view-move">Startposition</span>';
    
    let html = '';
    let moveNumber = 1;
    
    for (let i = 0; i < history.length; i++) {
        if (i % 2 === 0) {
            html += `<span class="view-move-num">${moveNumber}.</span>`;
            moveNumber++;
        }
        
        // Check if this move has an annotation
        const annotation = line.annotations && line.annotations[i] ? line.annotations[i] : '';
        const annotationHtml = annotation ? `<span style="color: var(--primary); font-weight: bold; margin-left: 2px;">${annotation}</span>` : '';
        
        html += `<span class="view-move" data-line-id="${line.id}" data-move-index="${i}" onclick="event.stopPropagation(); showPositionFromLine(${line.id}, ${i})" oncontextmenu="showViewContextMenu(event, ${line.id}, ${i})">${history[i]}</span>${annotationHtml} `;
    }
    
    return html;
}

// Find a line that starts with the given path of moves
function findLineByPath(pathMoves) {
    const lines = repertoire[currentSide] || [];
    for (const line of lines) {
        const tempGame = new Chess();
        tempGame.load_pgn(line.pgn);
        const history = tempGame.history();
        
        // Check if the line starts with (or equals) this path
        if (history.length >= pathMoves.length) {
            let matches = true;
            for (let i = 0; i < pathMoves.length; i++) {
                if (history[i] !== pathMoves[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return line;
        }
    }
    return null;
}

// --- NEW TREE HELPER FUNCTIONS ---

function buildCategoryTree(lines, repetitionSet) {
    // 1. Parse all lines into a structured tree
    const root = { children: {} };
    let moveIdCounter = 0; // Unique ID for each move span

    // Build a map of lineId -> annotations for quick lookup
    const lineAnnotationsMap = {};
    lines.forEach(line => {
        if (line.annotations) {
            lineAnnotationsMap[line.id] = line.annotations;
        }
    });

    lines.forEach(line => {
        // Use chess.js to get clean moves array
        const tempGame = new Chess();
        tempGame.load_pgn(line.pgn);
        const history = tempGame.history(); // Array of SAN moves ['e4', 'e5', 'Nf3']
        
        let currentNode = root;
        
        history.forEach((moveSan, index) => {
            if (!currentNode.children[moveSan]) {
                currentNode.children[moveSan] = { 
                    move: moveSan, 
                    children: {}, 
                    lineIds: [], // Stores IDs that end exactly here
                    ply: index + 1, // Move number logic (1=White, 2=Black)
                    annotations: {} // Store annotations by lineId
                };
            }
            // Store annotation for this move from this line
            if (line.annotations && line.annotations[index]) {
                currentNode.children[moveSan].annotations[line.id] = line.annotations[index];
            }
            currentNode = currentNode.children[moveSan];
        });
        
        // Mark the end of this specific line with the full path
        currentNode.lineIds.push({
            id: line.id,
            isRepetition: repetitionSet.has(line.pgn),
            path: history // Store the full path of moves
        });
    });

    // 2. Recursive Rendering Function
    function renderNode(node, depth, isFirstInBranch, pathSoFar = []) {
        let html = '';
        const childrenKeys = Object.keys(node.children);
        const hasChildren = childrenKeys.length > 0;
        const hasLineEnd = node.lineIds && node.lineIds.length > 0;
        
        // Move Number Logic
        const moveNum = Math.ceil(node.ply / 2);
        const isWhite = node.ply % 2 !== 0;
        const moveLabel = isWhite ? `${moveNum}. ${node.move}` : (isFirstInBranch ? `${moveNum}<span class="tree-dots" style="margin:0">...</span> ${node.move}` : node.move);

        // Current path including this move
        const currentPath = [...pathSoFar, node.move];
        const moveId = `tree-move-${moveIdCounter++}`;
        const pathAttr = currentPath.join(',');
        const escapedPath = pathAttr.replace(/'/g, "\\'");

        // Get annotation for this move (use first annotation found if multiple lines have different annotations)
        const annotationValues = Object.values(node.annotations || {});
        const annotation = annotationValues.length > 0 ? annotationValues[0] : '';
        const annotationHtml = annotation ? `<span style="color: var(--primary); font-weight: bold; margin-left: 2px;">${annotation}</span>` : '';

        // Render the Move with path data and context menu support
        html += `<span class="tree-move" id="${moveId}" data-path="${pathAttr}" onclick="showPositionFromTreePath('${escapedPath}')" oncontextmenu="showTreeMoveContextMenu(event, '${escapedPath}')">${moveLabel}</span>${annotationHtml}`;

        // Render Line Markers (Folder icons for actions)
        if (hasLineEnd) {
            node.lineIds.forEach(l => {
                const repClass = l.isRepetition ? 'repetition' : '';
                const linePath = l.path.join(',');
                // The marker allows interacting with the specific saved line
                html += `<span class="tree-line-marker ${repClass}" 
                    onclick="showTreeActions(event, ${l.id})" 
                    onmouseenter="highlightTreePath('${linePath}', ${l.isRepetition})"
                    onmouseleave="clearTreeHighlight()"
                    title="Optionen"><i class="fas fa-folder"></i></span>`;
            });
        }

        // Logic: Continue linearly or branch out?
        if (hasChildren) {
            if (childrenKeys.length === 1 && !hasLineEnd) {
                // Linear continuation (same line)
                html += ' ' + renderNode(node.children[childrenKeys[0]], depth, false, currentPath);
            } else {
                // Branching point (multiple options OR current node is an endpoint)
                html += `<span class="tree-dots">...</span>`;
                
                // Render children as new indented lines
                childrenKeys.forEach(childKey => {
                    const child = node.children[childKey];
                    // Arrows for branches
                    const arrow = `<span class="tree-arrow"></span>`;
                    
                    html += `<div class="tree-line tree-indent-level-${depth + 1}">
                                ${arrow} ${renderNode(child, depth + 1, true, currentPath)}
                             </div>`;
                });
            }
        }
        
        return html;
    }

    // Start rendering from root children
    let fullHtml = '';
    Object.keys(root.children).forEach(key => {
        fullHtml += `<div class="tree-line tree-indent-level-0">
                        ${renderNode(root.children[key], 0, true, [])}
                     </div>`;
    });
    
    return fullHtml;
}

// Helper to show context menu for tree nodes
function showTreeActions(e, id) {
    e.stopPropagation();
    
    // Remove existing menus
    document.querySelectorAll('.tree-action-menu').forEach(el => el.remove());
    
    // Check if this line is already in repetition
    const line = repertoire[currentSide].find(l => l.id === id);
    const isInRepetition = line && repertoire[currentSide].some(l => l.pgn === line.pgn && l.category === REPETITION_CAT);
    const repIcon = isInRepetition ? 'fas' : 'far';
    const repStyle = isInRepetition ? 'color:var(--warning)' : '';
    
    const menu = document.createElement('div');
    menu.className = 'tree-action-menu';
    menu.innerHTML = `
        <button class="tree-action-btn" onclick="loadLinePreview(${id}); removeTreeMenu()"><i class="fas fa-eye"></i></button>
        <button class="tree-action-btn rep" onclick="toggleRepetitionFromList(${id}); removeTreeMenu()" title="Wiederholung"><i class="${repIcon} fa-bookmark" style="${repStyle}"></i></button>
        <button class="tree-action-btn bot" onclick="startBotSetup(${id}); removeTreeMenu()"><i class="fas fa-robot"></i></button>
        <button class="tree-action-btn edit" onclick="editLine(${id}); removeTreeMenu()"><i class="fas fa-pen"></i></button>
        <button class="tree-action-btn del" onclick="deleteLine(${id}); removeTreeMenu()"><i class="fas fa-trash"></i></button>
    `;
    
    menu.style.left = (e.pageX + 10) + 'px';
    menu.style.top = (e.pageY - 10) + 'px';
    
    document.body.appendChild(menu);
    
    // Close menu when clicking elsewhere
    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function removeTreeMenu() {
    document.querySelectorAll('.tree-action-menu').forEach(el => el.remove());
}

// Highlight all moves in a path when hovering over a line marker
function highlightTreePath(pathStr, isRepetition = false) {
    const pathMoves = pathStr.split(',');
    const highlightClass = isRepetition ? 'tree-move-highlighted-rep' : 'tree-move-highlighted';
    
    // Find all tree-move elements and check if their path is a prefix of the target path
    document.querySelectorAll('.tree-move[data-path]').forEach(el => {
        const elPath = el.getAttribute('data-path').split(',');
        
        // Check if this element's path is a prefix of the target path
        let isInPath = true;
        for (let i = 0; i < elPath.length; i++) {
            if (elPath[i] !== pathMoves[i]) {
                isInPath = false;
                break;
            }
        }
        
        if (isInPath && elPath.length <= pathMoves.length) {
            el.classList.add(highlightClass);
        }
    });
}

function clearTreeHighlight() {
    document.querySelectorAll('.tree-move-highlighted, .tree-move-highlighted-rep').forEach(el => {
        el.classList.remove('tree-move-highlighted');
        el.classList.remove('tree-move-highlighted-rep');
    });
}

// Show position from tree path (comma-separated moves)
function showPositionFromTreePath(path) {
    const moves = path.split(',');
    game.reset();
    let lastMove = null;
    for (const moveSan of moves) {
        lastMove = game.move(moveSan);
    }
    board.position(game.fen());
    if (lastMove) highlightLastMove(lastMove);
    updateViewSearch();
    if (isEngineRunning) startEvaluation();
}

// Show position from a stored line at specific move index
function showPositionFromLine(lineId, moveIndex) {
    const line = repertoire[currentSide].find(l => l.id === lineId);
    if (!line) return;
    
    const tempGame = new Chess();
    tempGame.load_pgn(line.pgn);
    const history = tempGame.history({ verbose: true });
    
    game.reset();
    let lastMove = null;
    for (let i = 0; i <= moveIndex && i < history.length; i++) {
        lastMove = game.move(history[i]);
    }
    board.position(game.fen());
    if (lastMove) highlightLastMove(lastMove);
    updateViewSearch();
    if (isEngineRunning) startEvaluation();
}

// Show position from import line at specific move index
function showPositionFromImportLine(lineIndex, moveIndex) {
    const pgn = parsedImportLines[lineIndex];
    if (!pgn) return;
    
    const tempGame = new Chess();
    try {
        tempGame.load_pgn(pgn);
    } catch (e) {
        return;
    }
    const history = tempGame.history({ verbose: true });
    
    game.reset();
    let lastMove = null;
    for (let i = 0; i <= moveIndex && i < history.length; i++) {
        lastMove = game.move(history[i]);
    }
    board.position(game.fen());
    if (lastMove) highlightLastMove(lastMove);
    
    // Show filter banner and filter import lines
    document.getElementById('import-filter-banner').classList.remove('hidden');
    renderImportLinesList(game.pgn());
    
    if (isEngineRunning) startEvaluation();
}

function renameCategory(oldName) { const newName = prompt("Neuer Name:", oldName); if (newName && newName.trim() !== "" && newName !== oldName) { repertoire[currentSide].forEach(line => { if (line.category === oldName) line.category = newName.trim(); }); saveData(); renderList(game.pgn()); } }
function deleteCategory(catName) { if(confirm(`"${catName}" löschen?`)) { repertoire[currentSide] = repertoire[currentSide].filter(line => line.category !== catName); saveData(); renderList(game.pgn()); } }

function loadLinePreview(id) { 
    const line = repertoire[currentSide].find(l => l.id === id); 
    if(line) { 
        game.load_pgn(line.pgn); board.position(game.fen()); 
        const history = game.history({verbose:true}); if(history.length) highlightLastMove(history[history.length-1]); 
        updateViewSearch(); 
        // Only analyze if engine is on (Performance Fix)
        if (isEngineRunning) startEvaluation();
        drawShapes(); // Shapes laden
    } 
}

function deleteLine(id) { if(confirm('Löschen?')) { repertoire[currentSide] = repertoire[currentSide].filter(l => l.id !== id); saveData(); renderList(game.pgn()); } }
function startAddingLine(preselectedCat) { resetBoardSearch(); editingId = null; let cat = (typeof preselectedCat === 'string') ? preselectedCat : ""; prepareEditor("Neue Variante", "", cat, {}, {}, {}); }
function editLine(id) { const line = repertoire[currentSide].find(l => l.id === id); if (!line) return; editingId = id; prepareEditor("Bearbeiten", line.pgn, line.category, line.comments || {}, line.shapes || {}, line.annotations || {}); }

// UPDATED PREPARE EDITOR (ACCEPTS SHAPES)
function prepareEditor(title, pgn, category, commentsData, shapesData, annotationsData) { 
    mode = 'add'; switchUI('add-mode'); 
    
    // Apply user's preferred section order
    applyCreateModeOrder();
    
    document.getElementById('category-input').value = category; 
    currentComments = JSON.parse(JSON.stringify(commentsData)); 
    currentShapes = JSON.parse(JSON.stringify(shapesData || {})); // Shapes laden
    currentAnnotations = JSON.parse(JSON.stringify(annotationsData || {})); // Annotations laden
    currentDisplayAnnotations = {}; // Reset display annotations
    
    // Restore analysis and database panel states from settings
    const btnAnalysis = document.getElementById('btn-analysis');
    const btnDatabase = document.getElementById('btn-database');
    const evalBar = document.getElementById('eval-bar-container');
    
    // Restore Stockfish analysis state
    analysisActive = userSettings.analysisOpen || false;
    if (analysisActive) {
        document.getElementById('analysis-section').classList.remove('hidden');
        if (btnAnalysis) btnAnalysis.classList.add('active');
        evalBar.classList.remove('hidden');
        runStockfishAnalysis();
    } else {
        document.getElementById('analysis-section').classList.add('hidden');
        if (btnAnalysis) btnAnalysis.classList.remove('active');
        // Hide eval bar only if engine is not running globally
        if (!isEngineRunning) {
            evalBar.classList.add('hidden');
        }
    }
    
    // Restore database state
    databaseActive = userSettings.databaseOpen !== undefined ? userSettings.databaseOpen : true;
    if (databaseActive) {
        document.getElementById('explorer-section').classList.remove('hidden');
        if (btnDatabase) btnDatabase.classList.add('active');
    } else {
        document.getElementById('explorer-section').classList.add('hidden');
        if (btnDatabase) btnDatabase.classList.remove('active');
    }
    
    const datalist = document.getElementById('category-datalist'); datalist.innerHTML = ''; Object.keys(getGroupedLines(currentSide)).forEach(cat => { const opt = document.createElement('option'); opt.value = cat; datalist.appendChild(opt); }); game.reset(); if (pgn) game.load_pgn(pgn); board.position(game.fen()); board.orientation(currentSide); const history = game.history({verbose:true}); 
    
    // Initialize keyboard navigation state
    addModeFullHistory = history.slice(); // Copy the history
    addModePreviewIndex = history.length > 0 ? history.length - 1 : -1;
    
    // Build display annotations from loaded annotations
    Object.keys(currentAnnotations).forEach(index => {
        const moveIndex = parseInt(index);
        if (history[moveIndex]) {
            currentDisplayAnnotations[history[moveIndex].to] = currentAnnotations[index];
        }
    });
    
    if(history.length) highlightLastMove(history[history.length-1]); else $('#board .square-55d63').removeClass('highlight-square'); updatePgnDisplay(); loadNoteForCurrentPos(); 
    drawShapes();
    updateOpeningExplorer(); // Load opening explorer for initial position
}

function updatePgnDisplay() { 
    const pgnEl = document.getElementById('pgn-display'); 
    pgnEl.innerHTML = ''; // Clear content
    
    // Use full history in add mode (to preserve moves after going back)
    const history = (mode === 'add' && addModeFullHistory.length > 0) 
        ? addModeFullHistory 
        : game.history({ verbose: true });
    
    if (history.length === 0) {
        pgnEl.innerText = "Züge spielen...";
        return;
    }

    let moveNumber = 1;
    for (let i = 0; i < history.length; i++) {
        const move = history[i];
        if (i % 2 === 0) {
            const numSpan = document.createElement('span');
            numSpan.innerText = moveNumber + ". ";
            numSpan.style.color = "var(--text-muted)";
            pgnEl.appendChild(numSpan);
            moveNumber++;
        }
        
        const moveSpan = document.createElement('span');
        moveSpan.innerText = move.san;
        moveSpan.className = 'move-span';
        if (i === addModePreviewIndex) moveSpan.classList.add('active-move');
        moveSpan.dataset.index = i;
        // Left-click: preview board position after this move in add mode
        moveSpan.addEventListener('click', () => {
            if (mode !== 'add') return;
            previewToMoveIndex(i, addModeFullHistory);
        });
        moveSpan.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, i);
        });
        pgnEl.appendChild(moveSpan);

        if (currentAnnotations[i]) {
            const annSpan = document.createElement('span');
            annSpan.innerText = currentAnnotations[i];
            annSpan.style.color = "var(--primary)";
            annSpan.style.fontWeight = "bold";
            annSpan.style.marginLeft = "2px";
            pgnEl.appendChild(annSpan);
        }
        
        pgnEl.appendChild(document.createTextNode(" "));
    }
    pgnEl.scrollTop = pgnEl.scrollHeight; 
}

// Jump the game/board to the position after the given move index (0-based)
function previewToMoveIndex(index, movesList) {
    if (!Array.isArray(movesList) || movesList.length === 0) return;
    // Track the preview index
    addModePreviewIndex = index;
    // Reset and replay up to and including the selected move
    game.reset();
    for (let j = 0; j <= index && j < movesList.length; j++) {
        game.move(movesList[j]);
    }
    // Update board instantly, highlight last move
    const lastMove = movesList[Math.min(index, movesList.length - 1)];
    board.position(game.fen(), false);
    if (lastMove) highlightLastMove(lastMove);
    
    // Show note and only the annotation for this specific move (if present)
    currentDisplayAnnotations = {};
    if (currentAnnotations && currentAnnotations[index] && lastMove) {
        currentDisplayAnnotations[lastMove.to] = currentAnnotations[index];
    }
    loadNoteForCurrentPos();
    drawShapes();
    
    // Update PGN display to highlight active move
    updatePgnDisplay();
    
    // Optional: engine evaluation if running and not in bot/train
    if (isEngineRunning && mode !== 'bot' && mode !== 'train') {
        setTimeout(startEvaluation, 50);
    }
    
    // Update analysis if active
    if (analysisActive) {
        runStockfishAnalysis();
    }
}

// Navigate to start position (before any moves)
function goToStartPosition() {
    if (mode !== 'add') return;
    addModePreviewIndex = -1;
    game.reset();
    board.position(game.fen(), false);
    $('#board .square-55d63').removeClass('highlight-square');
    currentDisplayAnnotations = {};
    loadNoteForCurrentPos();
    drawShapes();
    updatePgnDisplay();
    if (isEngineRunning) setTimeout(startEvaluation, 50);
    if (analysisActive) runStockfishAnalysis();
}

// Navigate to end position (latest move)
function goToEndPosition(movesList) {
    if (mode !== 'add' || !Array.isArray(movesList) || movesList.length === 0) return;
    previewToMoveIndex(movesList.length - 1, movesList);
}

// --- UNDO FUNCTION ---
function undoLastMove() {
    // Get the move that will be undone
    const historyBefore = game.history({verbose: true});
    const moveToUndo = historyBefore[historyBefore.length - 1];
    
    // Remove last move from game
    const move = game.undo();
    if (move) {
        // Remove annotation for the undone move
        const undoneIndex = historyBefore.length - 1;
        delete currentAnnotations[undoneIndex];
        if (moveToUndo) {
            delete currentDisplayAnnotations[moveToUndo.to];
        }
        
        // Update Board
        board.position(game.fen());
        
        // Highlight the move before the one we just undid (if any)
        const history = game.history({verbose:true});
        if (history.length > 0) {
            highlightLastMove(history[history.length-1]);
        } else {
            $('#board .square-55d63').removeClass('highlight-square');
        }
        
        // Update UI components
        updatePgnDisplay();
        loadNoteForCurrentPos(); // Re-load notes/shapes for the previous position
        
        playSound('move');
        
        // Update analysis if in add mode
        updateAnalysisIfActive();
    }
}

function saveLine() { 
    const pgn = game.pgn(); if (pgn.trim() === '') { alert("Keine Züge."); return; } 
    const catInput = document.getElementById('category-input').value.trim(); 
    const category = catInput || "Allgemein"; 
    const moves = game.history({ verbose: true }); 
    
    // Save Shapes too!
    const lineData = { id: editingId || Date.now(), pgn, category, moves, comments: currentComments, shapes: currentShapes, annotations: currentAnnotations }; 
    
    if (editingId) { const index = repertoire[currentSide].findIndex(l => l.id === editingId); if (index !== -1) repertoire[currentSide][index] = lineData; } else repertoire[currentSide].push(lineData); saveData(); cancelAdd(); 
}
function cancelAdd() { 
    mode = 'view'; 
    editingId = null; 
    currentComments = {}; 
    currentShapes = {}; 
    currentAnnotations = {}; 
    currentDisplayAnnotations = {}; 
    // Reset analysis when leaving add mode
    if (analysisActive) {
        analysisActive = false;
        document.getElementById('analysis-section').classList.add('hidden');
        sendEngineCommand('stop');
        sendEngineCommand('setoption name MultiPV value 1');
    }
    // Always hide eval bar when leaving add mode (unless engine setting is on)
    if (!isEngineRunning) {
        document.getElementById('eval-bar-container').classList.add('hidden');
    }
    // Reset button states
    const btns = document.querySelectorAll('.analyze-btn');
    if (btns[0]) btns[0].classList.remove('active');
    if (btns[1]) btns[1].classList.remove('active');
    
    // Disable arrow draw mode when leaving add mode
    if (arrowDrawModeActive) {
        arrowDrawModeActive = false;
        arrowDrawFirstSquare = null;
        clearArrowDrawHighlight();
        const arrowBtn = document.getElementById('btn-arrow-draw');
        if (arrowBtn) arrowBtn.classList.remove('active');
        document.getElementById('arrow-color-popup')?.classList.add('hidden');
    }
    
    // Disable circle draw mode when leaving add mode
    if (circleDrawModeActive) {
        circleDrawModeActive = false;
        const circleBtn = document.getElementById('btn-circle-draw');
        if (circleBtn) circleBtn.classList.remove('active');
        document.getElementById('circle-color-popup')?.classList.add('hidden');
    }
    
    switchUI('view-mode'); 
    resetBoardSearch(); 
}
function annotateMove(annotation) {
    const history = game.history({ verbose: true });
    if (history.length === 0) return;
    const lastMoveIndex = history.length - 1;
    currentAnnotations[lastMoveIndex] = annotation;
    // Clear previous display annotations and add only the current one
    currentDisplayAnnotations = {};
    const lastMove = history[lastMoveIndex];
    currentDisplayAnnotations[lastMove.to] = annotation;
    updatePgnDisplay(); // Refresh the PGN display to show annotations
    drawShapes(); // Update the board display
}
function openSelectionMode() { if (repertoire[currentSide].length === 0) { alert("Nichts zum Üben."); return; } mode = 'selection'; switchUI('selection-mode'); resetSelectionBoardSearch(); }

function renderSelectionList(pgnFilter = null) {
    const list = document.getElementById('selection-list'); list.innerHTML = '';
    const groups = getGroupedLines(currentSide);
    const term = document.getElementById('search-input').value.toLowerCase();
    
    // Get repetition PGNs for tree highlighting
    const repetitionLines = repertoire[currentSide].filter(l => l.category === REPETITION_CAT);
    const repetitionPgns = new Set(repetitionLines.map(l => l.pgn));
    
    Object.keys(groups).sort().forEach(cat => {
        let lines = groups[cat].filter(l => l.pgn.toLowerCase().includes(term) || cat.toLowerCase().includes(term));
        
        // Additional filter by board position if pgnFilter is provided
        if (pgnFilter) {
            lines = lines.filter(l => l.pgn.startsWith(pgnFilter));
        }
        
        if (lines.length > 0) {
            const catClean = cat.replace(/[^a-zA-Z0-9]/g, '_');
            const header = document.createElement('div'); header.className = 'category-header'; 
            header.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><input type="checkbox" checked onchange="toggleAllSelection(this, '${catClean}')" onclick="event.stopPropagation()"><span>${cat}</span></div>`;
            list.appendChild(header);
            const contentDiv = document.createElement('div'); contentDiv.style.paddingLeft = "15px";
            
            // Use tree view if enabled
            if (userSettings.treeView && lines.length > 0) {
                const treeHTML = buildSelectionTree(lines, repetitionPgns, catClean);
                contentDiv.innerHTML = `<div class="tree-container selection-tree">${treeHTML}</div>`;
            } else {
                lines.forEach(l => {
                    const isInRepetition = repetitionPgns.has(l.pgn);
                    const repClass = isInRepetition ? 'repetition' : '';
                    const div = document.createElement('label'); div.className = `line-item selection-item ${repClass}`; 
                    div.innerHTML = `<div style="display:flex; align-items:center;">
                        <span class="selection-checkbox ${repClass}">
                            <input type="checkbox" value="${l.id}" checked class="chk-${catClean}">
                            <i class="fas fa-check-square"></i>
                        </span>
                        <span>${l.pgn}</span>
                    </div>`; 
                    contentDiv.appendChild(div);
                });
            }
            list.appendChild(contentDiv);
        }
    });
}

// Build tree for selection mode with checkboxes
function buildSelectionTree(lines, repetitionSet, catClass) {
    const root = { children: {} };
    let moveIdCounter = 0;

    lines.forEach(line => {
        const tempGame = new Chess();
        tempGame.load_pgn(line.pgn);
        const history = tempGame.history();
        
        let currentNode = root;
        
        history.forEach((moveSan, index) => {
            if (!currentNode.children[moveSan]) {
                currentNode.children[moveSan] = { 
                    move: moveSan, 
                    children: {}, 
                    lineIds: [],
                    ply: index + 1
                };
            }
            currentNode = currentNode.children[moveSan];
        });
        
        currentNode.lineIds.push({
            id: line.id,
            isRepetition: repetitionSet.has(line.pgn),
            path: history
        });
    });

    function renderNode(node, depth, isFirstInBranch, pathSoFar = []) {
        let html = '';
        const childrenKeys = Object.keys(node.children);
        const hasChildren = childrenKeys.length > 0;
        const hasLineEnd = node.lineIds && node.lineIds.length > 0;
        
        const moveNum = Math.ceil(node.ply / 2);
        const isWhite = node.ply % 2 !== 0;
        const moveLabel = isWhite ? `${moveNum}. ${node.move}` : (isFirstInBranch ? `${moveNum}<span class="tree-dots" style="margin:0">...</span> ${node.move}` : node.move);

        const currentPath = [...pathSoFar, node.move];
        const moveId = `sel-tree-move-${moveIdCounter++}`;
        const pathAttr = currentPath.join(',');

        html += `<span class="tree-move" id="${moveId}" data-path="${pathAttr}">${moveLabel}</span>`;

        // Render checkboxes for line endings
        if (hasLineEnd) {
            node.lineIds.forEach(l => {
                const repClass = l.isRepetition ? 'repetition' : '';
                html += `<label class="tree-line-checkbox ${repClass}" 
                    onmouseenter="highlightTreePath('${l.path.join(',')}', ${l.isRepetition})"
                    onmouseleave="clearTreeHighlight()">
                    <input type="checkbox" value="${l.id}" checked class="chk-${catClass}">
                    <i class="fas fa-check-square"></i>
                </label>`;
            });
        }

        if (hasChildren) {
            if (childrenKeys.length === 1 && !hasLineEnd) {
                html += ' ' + renderNode(node.children[childrenKeys[0]], depth, false, currentPath);
            } else {
                html += `<span class="tree-dots">...</span>`;
                
                childrenKeys.forEach(childKey => {
                    const child = node.children[childKey];
                    const arrow = `<span class="tree-arrow"></span>`;
                    
                    html += `<div class="tree-line tree-indent-level-${depth + 1}">
                                ${arrow} ${renderNode(child, depth + 1, true, currentPath)}
                             </div>`;
                });
            }
        }
        
        return html;
    }

    let fullHtml = '';
    Object.keys(root.children).forEach(key => {
        fullHtml += `<div class="tree-line tree-indent-level-0">
                        ${renderNode(root.children[key], 0, true, [])}
                     </div>`;
    });
    
    return fullHtml;
}
function toggleAllSelection(source, catClass) { document.querySelectorAll(`.chk-${catClass}`).forEach(cb => cb.checked = source.checked); }
function startTrainingFromSelection() { 
    const checked = document.querySelectorAll('#selection-list input[type="checkbox"]:not([onchange]):checked'); 
    if (checked.length === 0) return; 
    trainingStats = { correct: 0, wrong: 0, wrongLines: [] };

    // Build selection, avoiding duplicates between natural and repetition entries
    const selectedLines = Array.from(checked).map(c => repertoire[currentSide].find(x => x.id == c.value)).filter(Boolean).map(l => JSON.parse(JSON.stringify(l)));

    // Group by PGN and prefer natural category entries over Wiederholung when both selected
    const byPgn = {};
    selectedLines.forEach(l => {
        if (!byPgn[l.pgn]) byPgn[l.pgn] = [];
        byPgn[l.pgn].push(l);
    });

    const finalList = [];
    Object.keys(byPgn).forEach(pgn => {
        const group = byPgn[pgn];
        const natural = group.filter(x => x.category !== REPETITION_CAT);
        if (natural.length > 0) {
            // use natural entries only
            natural.forEach(n => finalList.push(n));
        } else {
            // only repetition entries selected
            group.forEach(r => {
                // try to find the line's original category in the full repertoire
                const orig = repertoire[currentSide].find(x => x.pgn === r.pgn && x.category !== REPETITION_CAT);
                if (orig) r.originalCategory = orig.category; 
                finalList.push(r);
            });
        }
    });

    trainingQueue = finalList.sort(() => Math.random() - 0.5);
    totalTrainingLines = trainingQueue.length;
    mode = 'train'; switchUI('train-mode'); nextTrainingLine(); 
}

function continueFromNote() { $('#training-note-display').fadeOut(); isPaused = false; if (pendingNextAction) { const action = pendingNextAction; pendingNextAction = null; action(); } }
function processGameStep(nextAction) { 
    const fen = getCleanFen(); 
    const note = currentTrainLine.comments[fen]; 
    
    // Load shapes for this step
    if(currentTrainLine.shapes && currentTrainLine.shapes[fen]) {
        currentShapes = {[fen]: currentTrainLine.shapes[fen]}; 
    } else {
        currentShapes = {};
    }
    drawShapes();

    if (note) { $('#note-text').text(note); $('#training-note-display').css('display', 'flex').hide().fadeIn(); isPaused = true; pendingNextAction = nextAction; } else { $('#training-note-display').hide(); if (nextAction) nextAction(); } 
}

function nextTrainingLine() { 

    if (trainingQueue.length === 0) { 
        showTrainingResults(); // Changed from stopTraining()
        return; 
    }

    if (trainingQueue.length === 0) { stopTraining(); return; } 
    updateProgress();
    currentTrainLine = trainingQueue[0]; 
    
    // When practicing a repetition entry, show its natural/original category if available
    const displayCat = (currentTrainLine.category === REPETITION_CAT && currentTrainLine.originalCategory) ? currentTrainLine.originalCategory : currentTrainLine.category;
    document.getElementById('train-category-display').innerText = displayCat; 
    updateRepetitionButtonState();
    
    $('#training-note-display').hide(); isPaused = false;
    
    let tGame = new Chess(); tGame.load_pgn(currentTrainLine.pgn); 
    currentTrainLine.moveHistory = tGame.history({ verbose: true }); 
    game.reset(); board.position(game.fen()); board.orientation(currentSide); currentMoveIndex = 0; 
    
    // Reset Visuals
    $('#board .square-55d63').removeClass('highlight-square'); 
    currentShapes = {}; 
    currentTrainingAnnotations = {}; 
    drawShapes();

    updateTrainStatus("Dein Zug", "neutral"); 
    processGameStep(() => { if (currentSide === 'black') playBotMove(); });
}

function updateProgress() {
    const remaining = trainingQueue.length;
    const done = totalTrainingLines - remaining;
    const percent = (done / totalTrainingLines) * 100;
    document.getElementById('progress-fill').style.width = percent + '%';
    document.getElementById('progress-text-right').innerText = `${done} / ${totalTrainingLines}`;
}

    function handleTrainingMove(move) { 
        const expected = currentTrainLine.moveHistory[currentMoveIndex]; 
        if (!expected || (move.from === expected.from && move.to === expected.to)) { 
            // Clear previous annotations and add only the current one
            currentTrainingAnnotations = {};
            const hasAnnotation = currentTrainLine.annotations && currentTrainLine.annotations[currentMoveIndex];
            if (hasAnnotation) {
                currentTrainingAnnotations[expected.to] = currentTrainLine.annotations[currentMoveIndex];
            }
            currentMoveIndex++; 
            setTimeout(() => {
                processGameStep(() => {
                    if (!expected || currentMoveIndex >= currentTrainLine.moveHistory.length) { 
                        successLine(); 
                    } 
                    else { 
                        // Add extra delay if user's move had an annotation
                        const delay = hasAnnotation ? 1200 : 400;
                        setTimeout(playBotMove, delay); 
                    }
                });
            }, 100);
        } else { 
            playSound('error'); 
            updateTrainStatus("FALSCH!", "error"); 
            
            // Track wrong move in line statistics
            if (!lineStats[currentTrainLine.id]) {
                lineStats[currentTrainLine.id] = { correct: 0, wrong: 0 };
            }
            lineStats[currentTrainLine.id].wrong++;
            localStorage.setItem('chessLineStats', JSON.stringify(lineStats));
            
            // Track wrong move
            if (!trainingStats.wrongLines.some(l => l.id === currentTrainLine.id)) {
                trainingStats.wrongLines.push({
                    id: currentTrainLine.id,
                    pgn: currentTrainLine.pgn,
                    category: currentTrainLine.category
                });
            }
            
            // IMMEDIATE RESET FOR WRONG MOVES
            setTimeout(() => { 
                game.undo(); 
                board.position(game.fen(), false);
                setTimeout(() => {
                    updateTrainStatus("Dein Zug", "neutral"); 
                    drawShapes(); 
                }, 100);
            }, 500); 
        } 
    }

function playBotMove() { 
    if (currentMoveIndex < currentTrainLine.moveHistory.length) { 
        const botMove = currentTrainLine.moveHistory[currentMoveIndex]; 
        game.move(botMove); 
        
        board.position(game.fen(), false);
        
        setTimeout(() => {
            playSound('move'); 
            highlightLastMove(botMove); 
            // Clear previous annotations and add only the current one
            currentTrainingAnnotations = {};
            if (currentTrainLine.annotations && currentTrainLine.annotations[currentMoveIndex]) {
                currentTrainingAnnotations[botMove.to] = currentTrainLine.annotations[currentMoveIndex];
            }
            currentMoveIndex++; 
            
            setTimeout(() => {
                processGameStep(() => { 
                    if (currentMoveIndex >= currentTrainLine.moveHistory.length) {
                        successLine(); 
                    }
                });
                if(isEngineRunning) setTimeout(startEvaluation, 300);
            }, 100);
        }, 50);
    } 
}

function successLine() { 
    // Track correct line completion in statistics
    if (!lineStats[currentTrainLine.id]) {
        lineStats[currentTrainLine.id] = { correct: 0, wrong: 0 };
    }
    lineStats[currentTrainLine.id].correct++;
    localStorage.setItem('chessLineStats', JSON.stringify(lineStats));
    
    if (!trainingStats.wrongLines.some(l => l.id === currentTrainLine.id)) {
        trainingStats.correct++;
    }
    playSound('capture'); 
    trainingQueue.shift(); 
    const boardEl = document.getElementById('board'); 
    boardEl.style.boxShadow = "0 0 20px var(--success)"; 
    updateTrainStatus("RICHTIG!", "success"); 
    setTimeout(() => { boardEl.style.boxShadow = "var(--shadow)"; 
    updateTrainStatus("...", "neutral"); nextTrainingLine(); 
    }, 800);
}

function updateTrainStatus(t, className) { const e = document.getElementById('train-status'); e.innerText = t; e.className = `status-badge ${className}`; }
function repeatLater() { trainingQueue.push(trainingQueue.shift()); nextTrainingLine(); }
function stopTraining() { mode = 'view'; switchUI('view-mode'); resetBoardSearch(); isPaused = false; }
function switchUI(id) { 
    document.querySelectorAll('.controls-area > div').forEach(d => d.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        // Reset internal scroll so the menu content is visible top-aligned
        try { el.scrollTop = 0; } catch (e) {}
        const dash = el.querySelector('.training-dashboard'); if (dash) dash.scrollTop = 0;
    }
    if(id === 'view-mode' || id === 'settings-mode') document.querySelector('.header-row').classList.remove('hidden'); else document.querySelector('.header-row').classList.add('hidden');
    setTimeout(() => board.resize(), 200);
}
function saveData() { localStorage.setItem('chessRepertoire_v3', JSON.stringify(repertoire)); }

// --- PGN IMPORT WITH VARIATIONS ---
let parsedImportLines = [];
let importLineAnnotations = {}; // Track annotations for import lines: { lineIndex: { moveIndex: 'annotation' } }

function openImportPgn() {
    mode = 'import';
    switchUI('import-pgn-mode');
    // Clear previous data
    document.getElementById('import-category-input').value = '';
    document.getElementById('import-pgn-input').value = '';
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-execute-btn').disabled = true;
    parsedImportLines = [];
    importLineAnnotations = {};
    
    // Set up live parsing on input
    document.getElementById('import-pgn-input').oninput = debounce(parseImportPgn, 300);
}

function cancelImportPgn() {
    mode = 'view';
    parsedImportLines = [];
    importLineAnnotations = {};
    
    // Reset board to starting position
    game.reset();
    board.position(game.fen());
    $('#board .square-55d63').removeClass('highlight-square');
    
    // Hide filter banner
    document.getElementById('import-filter-banner').classList.add('hidden');
    
    switchUI('view-mode');
}

// Reset import filter and show all lines
function resetImportFilter() {
    game.reset();
    board.position(game.fen());
    $('#board .square-55d63').removeClass('highlight-square');
    document.getElementById('import-filter-banner').classList.add('hidden');
    renderImportLinesList();
}

// Debounce helper for live parsing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Parse PGN with variations and extract all lines
function parseImportPgn() {
    const pgnInput = document.getElementById('import-pgn-input').value.trim();
    const preview = document.getElementById('import-preview');
    const linesList = document.getElementById('import-lines-list');
    const countEl = document.getElementById('import-lines-count');
    const executeBtn = document.getElementById('import-execute-btn');
    
    if (!pgnInput) {
        preview.classList.add('hidden');
        executeBtn.disabled = true;
        parsedImportLines = [];
        return;
    }
    
    // Extract all lines from PGN with variations
    parsedImportLines = extractLinesFromPgn(pgnInput);
    
    if (parsedImportLines.length === 0) {
        preview.classList.add('hidden');
        executeBtn.disabled = true;
        return;
    }
    
    // Show preview
    preview.classList.remove('hidden');
    executeBtn.disabled = false;
    
    // Render preview list
    renderImportLinesList();
}

function renderImportLinesList(filterPgn = null) {
    const linesList = document.getElementById('import-lines-list');
    linesList.innerHTML = '';
    
    // Get filter moves if filtering
    let filterMoves = [];
    if (filterPgn) {
        const filterGame = new Chess();
        filterGame.load_pgn(filterPgn);
        filterMoves = filterGame.history();
    }
    
    parsedImportLines.forEach((line, lineIndex) => {
        // If filtering, check if line starts with filter moves
        if (filterPgn) {
            const tempGame = new Chess();
            try {
                tempGame.load_pgn(line);
            } catch (e) {
                return; // Skip invalid lines
            }
            const lineMoves = tempGame.history();
            
            // Check if line starts with filter moves
            let matches = true;
            for (let i = 0; i < filterMoves.length; i++) {
                if (lineMoves[i] !== filterMoves[i]) {
                    matches = false;
                    break;
                }
            }
            if (!matches) return; // Skip non-matching lines
        }
        
        const div = document.createElement('div');
        div.className = 'line-item import-line-item';
        div.dataset.index = lineIndex;
        
        // Format moves like home page with context menu support
        const movesHtml = formatImportLineMoves(line, lineIndex);
        
        div.innerHTML = `
            <span class="line-moves" id="import-line-pgn-${lineIndex}">${movesHtml}</span>
            <div class="line-actions">
                <button onclick="editImportLine(${lineIndex})" title="Bearbeiten"><i class="fas fa-pen"></i></button>
                <button class="del" onclick="deleteImportLine(${lineIndex})" title="Löschen"><i class="fas fa-trash"></i></button>
            </div>
        `;
        linesList.appendChild(div);
    });
}

function formatImportLineMoves(pgn, lineIndex) {
    if (!pgn || pgn.trim() === '') return '<span class="view-move">Startposition</span>';
    
    const tempGame = new Chess();
    try {
        tempGame.load_pgn(pgn);
    } catch (e) {
        return pgn; // Return raw if can't parse
    }
    
    const history = tempGame.history();
    if (history.length === 0) return '<span class="view-move">Startposition</span>';
    
    // Get annotations for this line
    const lineAnnotations = importLineAnnotations[lineIndex] || {};
    
    let html = '';
    let moveNumber = 1;
    
    for (let i = 0; i < history.length; i++) {
        if (i % 2 === 0) {
            html += `<span class="view-move-num">${moveNumber}.</span>`;
        }
        const annotation = lineAnnotations[i] || '';
        const annotationHtml = annotation ? `<span style="color: var(--primary); font-weight: bold; margin-left: 2px;">${annotation}</span>` : '';
        html += `<span class="view-move" onclick="showPositionFromImportLine(${lineIndex}, ${i})" oncontextmenu="showImportContextMenu(event, ${lineIndex}, ${i})">${history[i]}</span>${annotationHtml} `;
        if (i % 2 === 1) moveNumber++;
    }
    
    return html.trim();
}

function editImportLine(index) {
    const pgnSpan = document.getElementById(`import-line-pgn-${index}`);
    const currentPgn = parsedImportLines[index];
    
    // Replace span with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'import-line-edit-input';
    input.value = currentPgn;
    input.dataset.index = index;
    
    // Handle save on enter or blur
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            saveImportLineEdit(index, input.value);
        } else if (e.key === 'Escape') {
            renderImportLinesList(); // Cancel edit
        }
    };
    input.onblur = () => {
        saveImportLineEdit(index, input.value);
    };
    
    pgnSpan.replaceWith(input);
    input.focus();
    input.select();
}

function saveImportLineEdit(index, newPgn) {
    // Validate the PGN using chess.js
    const tempGame = new Chess();
    try {
        if (tempGame.load_pgn(newPgn)) {
            parsedImportLines[index] = tempGame.pgn();
        } else if (newPgn.trim() === '') {
            // Empty = will be filtered out on import
            parsedImportLines[index] = '';
        } else {
            // Try to validate moves manually
            const validated = validateAndFormatPgn(newPgn);
            parsedImportLines[index] = validated || newPgn;
        }
    } catch (e) {
        parsedImportLines[index] = newPgn;
    }
    
    renderImportLinesList();
}

function validateAndFormatPgn(pgn) {
    const tempGame = new Chess();
    // Try to parse moves from the string
    const moves = pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/);
    for (const move of moves) {
        if (!move) continue;
        try {
            const result = tempGame.move(move);
            if (!result) return null;
        } catch (e) {
            return null;
        }
    }
    return tempGame.pgn();
}

function deleteImportLine(index) {
    parsedImportLines.splice(index, 1);
    
    // Re-index annotations: shift all indices after the deleted one
    const newAnnotations = {};
    for (const lineIdx in importLineAnnotations) {
        const idx = parseInt(lineIdx);
        if (idx < index) {
            newAnnotations[idx] = importLineAnnotations[idx];
        } else if (idx > index) {
            newAnnotations[idx - 1] = importLineAnnotations[idx];
        }
        // idx === index is skipped (deleted)
    }
    importLineAnnotations = newAnnotations;
    
    renderImportLinesList();
    
    // Disable import button if no lines left
    if (parsedImportLines.length === 0) {
        document.getElementById('import-execute-btn').disabled = true;
        document.getElementById('import-preview').classList.add('hidden');
    }
}

// Core parser: extract all main lines from PGN with variations
function extractLinesFromPgn(pgn) {
    // Clean up PGN: remove headers, comments, result markers
    let cleaned = pgn
        .replace(/\[.*?\]/g, '')           // Remove headers [Event "..."]
        .replace(/\{[^}]*\}/g, '')         // Remove comments {comment}
        .replace(/\$\d+/g, '')             // Remove NAG annotations $1, $2, etc.
        .replace(/\s*1-0\s*$/, '')         // Remove result 1-0
        .replace(/\s*0-1\s*$/, '')         // Remove result 0-1
        .replace(/\s*1\/2-1\/2\s*$/, '')   // Remove result 1/2-1/2
        .replace(/\s*\*\s*$/, '')          // Remove unfinished marker *
        .replace(/\?\!|\!\?|\?\?|\!\!|\?|\!/g, '') // Remove move annotations
        .replace(/\s+/g, ' ')              // Normalize whitespace
        .trim();
    
    if (!cleaned) return [];
    
    // Parse the moves recursively, handling variations
    const lines = [];
    parseVariations(cleaned, [], lines);
    
    // Convert move arrays to PGN strings
    return lines.map(movesToPgn).filter(pgn => pgn.length > 0);
}

// Recursively parse variations and collect all lines
function parseVariations(text, currentMoves, allLines) {
    let pos = 0;
    let moves = [...currentMoves];
    
    while (pos < text.length) {
        // Skip whitespace
        while (pos < text.length && /\s/.test(text[pos])) pos++;
        if (pos >= text.length) break;
        
        // Check for variation start
        if (text[pos] === '(') {
            // Find matching closing parenthesis
            let depth = 1;
            let varStart = pos + 1;
            pos++;
            while (pos < text.length && depth > 0) {
                if (text[pos] === '(') depth++;
                else if (text[pos] === ')') depth--;
                pos++;
            }
            let varEnd = pos - 1;
            let varText = text.substring(varStart, varEnd);
            
            // Parse variation from the parent position (before last move)
            let parentMoves = moves.slice(0, -1);
            parseVariations(varText, parentMoves, allLines);
            continue;
        }
        
        // Check for variation end (shouldn't happen at top level)
        if (text[pos] === ')') {
            pos++;
            continue;
        }
        
        // Parse move number (e.g., "1.", "1...", "12.")
        let moveNumMatch = text.substring(pos).match(/^(\d+\.+\s*)/);
        if (moveNumMatch) {
            pos += moveNumMatch[0].length;
            continue;
        }
        
        // Parse move (e.g., "e4", "Nf3", "O-O", "exd5", "Qxf7+")
        let moveMatch = text.substring(pos).match(/^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O-O|O-O)/);
        if (moveMatch) {
            moves.push(moveMatch[1]);
            pos += moveMatch[0].length;
            continue;
        }
        
        // Skip any unrecognized character
        pos++;
    }
    
    // Add this line if it has moves
    if (moves.length > 0) {
        allLines.push([...moves]);
    }
}

// Convert array of moves to PGN string
function movesToPgn(moves) {
    // Use chess.js to validate and format moves
    const tempGame = new Chess();
    let validMoves = [];
    
    for (let move of moves) {
        try {
            const result = tempGame.move(move);
            if (result) {
                validMoves.push(result.san);
            } else {
                break; // Stop at first invalid move
            }
        } catch (e) {
            break;
        }
    }
    
    return tempGame.pgn();
}

// Execute the import: add all parsed lines to repertoire
function executeImportPgn() {
    const category = document.getElementById('import-category-input').value.trim() || 'Importiert';
    
    if (parsedImportLines.length === 0) {
        alert('Keine gültigen Linien gefunden.');
        return;
    }
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < parsedImportLines.length; i++) {
        const pgn = parsedImportLines[i];
        
        // Check if this line already exists
        const exists = repertoire[currentSide].some(l => l.pgn === pgn);
        if (exists) {
            skippedCount++;
            continue;
        }
        
        // Create line data
        const tempGame = new Chess();
        tempGame.load_pgn(pgn);
        const moves = tempGame.history({ verbose: true });
        
        // Get annotations for this line
        const lineAnnotations = importLineAnnotations[i] || {};
        
        const lineData = {
            id: Date.now() + addedCount, // Ensure unique IDs
            pgn: pgn,
            category: category,
            moves: moves,
            comments: {},
            shapes: {},
            annotations: { ...lineAnnotations }
        };
        
        repertoire[currentSide].push(lineData);
        addedCount++;
    }
    
    saveData();
    
    // Show result message
    let message = `${addedCount} Linie${addedCount !== 1 ? 'n' : ''} importiert`;
    if (skippedCount > 0) {
        message += ` (${skippedCount} bereits vorhanden)`;
    }
    alert(message);
    
    // Return to view mode and refresh
    cancelImportPgn();
    renderList();
}

function loadNoteForCurrentPos() {
    const fen = getCleanFen();
    const noteEl = document.getElementById('move-note-input');
    if(noteEl) noteEl.value = currentComments[fen] || "";
    drawShapes();
}
const noteInputEl = document.getElementById('move-note-input');
if (noteInputEl) {
    noteInputEl.addEventListener('input', function() {
        const fen = getCleanFen();
        if(this.value.trim() === "") delete currentComments[fen];
        else currentComments[fen] = this.value;
    });
}

// Arrow drawing logic is now in board.js

// Keyboard shortcut: Shift+Z clears all arrows for current position
document.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if ((e.key === 'Z' || e.key === 'z') && e.shiftKey) {
        clearShapesForCurrentPos();
        // brief visual cue on the board
        const boardEl = document.getElementById('board');
        if (boardEl) {
            boardEl.classList.add('flash-clear-shapes');
            setTimeout(() => boardEl.classList.remove('flash-clear-shapes'), 220);
        }
        e.preventDefault();
        return;
    }
    
    // Arrow key navigation in add mode
    if (mode === 'add') {
        const fullHistory = addModeFullHistory;
        
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (fullHistory.length === 0) return;
            
            // If at start, stay at start
            if (addModePreviewIndex === -1) return;
            
            // If at position 0, go to start
            if (addModePreviewIndex === 0) {
                goToStartPosition();
            } else {
                // Go one move back
                previewToMoveIndex(addModePreviewIndex - 1, fullHistory);
            }
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (fullHistory.length === 0) return;
            
            // If at start (-1), go to first move
            if (addModePreviewIndex === -1) {
                previewToMoveIndex(0, fullHistory);
            } else if (addModePreviewIndex < fullHistory.length - 1) {
                // Go one move forward
                previewToMoveIndex(addModePreviewIndex + 1, fullHistory);
            }
        }
    }
});

// --- CONTEXT MENU LOGIC ---
let contextMenuTargetIndex = null;
let viewModeEditLineId = null; // Track which line is being edited in view mode
let treeMoveContextPath = null; // Track path for tree move context menu
let importModeLineIndex = null; // Track which import line is being edited

function showContextMenu(x, y, index) {
    contextMenuTargetIndex = index;
    viewModeEditLineId = null; // Reset view mode editing
    treeMoveContextPath = null; // Reset tree path
    importModeLineIndex = null; // Reset import mode
    const menu = document.getElementById('move-context-menu');
    // Reset submenu visibility each time
    const submenu = document.getElementById('annotation-submenu');
    if (submenu) submenu.classList.add('hidden');
    // Show delete option in add mode
    const deleteItem = document.getElementById('ctx-delete-move');
    if (deleteItem) deleteItem.classList.remove('hidden');
    // Show annotation option in add mode
    const addItem = document.getElementById('ctx-add-annotation');
    if (addItem) addItem.classList.remove('hidden');
    // Hide view position in add mode (not needed there)
    const viewPosItem = document.getElementById('ctx-view-position');
    if (viewPosItem) viewPosItem.classList.add('hidden');
    
    // Position menu, adjusting if it would go off-screen
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.remove('hidden');
    
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalX = x;
    let finalY = y;
    
    // Adjust horizontal position if menu would go off-screen
    if (x + menuRect.width > viewportWidth) {
        finalX = viewportWidth - menuRect.width - 10;
    }
    
    // Adjust vertical position if menu would go off-screen
    if (y + menuRect.height > viewportHeight) {
        finalY = viewportHeight - menuRect.height - 10;
    }
    
    // Ensure menu doesn't go above or left of viewport
    if (finalX < 10) finalX = 10;
    if (finalY < 10) finalY = 10;
    
    menu.style.left = finalX + 'px';
    menu.style.top = finalY + 'px';
}

// Show context menu for view mode (list of openings)
function showViewContextMenu(e, lineId, moveIndex) {
    e.preventDefault();
    e.stopPropagation();
    
    contextMenuTargetIndex = moveIndex;
    viewModeEditLineId = lineId;
    treeMoveContextPath = null; // Reset tree path
    importModeLineIndex = null; // Reset import mode
    
    const menu = document.getElementById('move-context-menu');
    const submenu = document.getElementById('annotation-submenu');
    if (submenu) submenu.classList.add('hidden');
    
    // Show delete option in view mode
    const deleteItem = document.getElementById('ctx-delete-move');
    if (deleteItem) deleteItem.classList.remove('hidden');
    
    // Show annotation option in view mode too
    const addItem = document.getElementById('ctx-add-annotation');
    if (addItem) addItem.classList.remove('hidden');
    
    // Show view position option in view mode
    const viewPosItem = document.getElementById('ctx-view-position');
    if (viewPosItem) viewPosItem.classList.remove('hidden');
    
    // Position menu
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.remove('hidden');
    
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalX = e.clientX;
    let finalY = e.clientY;
    
    if (e.clientX + menuRect.width > viewportWidth) {
        finalX = viewportWidth - menuRect.width - 10;
    }
    if (e.clientY + menuRect.height > viewportHeight) {
        finalY = viewportHeight - menuRect.height - 10;
    }
    if (finalX < 10) finalX = 10;
    if (finalY < 10) finalY = 10;
    
    menu.style.left = finalX + 'px';
    menu.style.top = finalY + 'px';
}

// Show context menu for import mode moves
function showImportContextMenu(e, lineIndex, moveIndex) {
    e.preventDefault();
    e.stopPropagation();
    
    contextMenuTargetIndex = moveIndex;
    viewModeEditLineId = null; // Reset view mode
    treeMoveContextPath = null; // Reset tree path
    importModeLineIndex = lineIndex; // Track import line
    
    const menu = document.getElementById('move-context-menu');
    const submenu = document.getElementById('annotation-submenu');
    if (submenu) submenu.classList.add('hidden');
    
    // Show view position option in import mode
    const viewPosItem = document.getElementById('ctx-view-position');
    if (viewPosItem) viewPosItem.classList.remove('hidden');
    
    // Show delete option in import mode
    const deleteItem = document.getElementById('ctx-delete-move');
    if (deleteItem) deleteItem.classList.remove('hidden');
    
    // Show annotation option in import mode
    const addItem = document.getElementById('ctx-add-annotation');
    if (addItem) addItem.classList.remove('hidden');
    
    // Position menu
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.remove('hidden');
    
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalX = e.clientX;
    let finalY = e.clientY;
    
    if (e.clientX + menuRect.width > viewportWidth) {
        finalX = viewportWidth - menuRect.width - 10;
    }
    if (e.clientY + menuRect.height > viewportHeight) {
        finalY = viewportHeight - menuRect.height - 10;
    }
    if (finalX < 10) finalX = 10;
    if (finalY < 10) finalY = 10;
    
    menu.style.left = finalX + 'px';
    menu.style.top = finalY + 'px';
}

// Show context menu for tree view moves
function showTreeMoveContextMenu(e, path) {
    e.preventDefault();
    e.stopPropagation();
    
    treeMoveContextPath = path; // Store the path for viewing position
    importModeLineIndex = null; // Reset import mode
    
    // Find the first line that matches this path for delete/annotation operations
    const pathMoves = path.split(',');
    const matchingLine = findLineByPath(pathMoves);
    
    if (matchingLine) {
        viewModeEditLineId = matchingLine.id;
        contextMenuTargetIndex = pathMoves.length - 1; // Index of the clicked move
    } else {
        viewModeEditLineId = null;
        contextMenuTargetIndex = null;
    }
    
    const menu = document.getElementById('move-context-menu');
    const submenu = document.getElementById('annotation-submenu');
    if (submenu) submenu.classList.add('hidden');
    
    // Show all options (delete and annotation work on the first matching line)
    const deleteItem = document.getElementById('ctx-delete-move');
    if (deleteItem) deleteItem.classList.toggle('hidden', !matchingLine);
    const addItem = document.getElementById('ctx-add-annotation');
    if (addItem) addItem.classList.toggle('hidden', !matchingLine);
    
    // Show view position option
    const viewPosItem = document.getElementById('ctx-view-position');
    if (viewPosItem) viewPosItem.classList.remove('hidden');
    
    // Position menu
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.remove('hidden');
    
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalX = e.clientX;
    let finalY = e.clientY;
    
    if (e.clientX + menuRect.width > viewportWidth) {
        finalX = viewportWidth - menuRect.width - 10;
    }
    if (e.clientY + menuRect.height > viewportHeight) {
        finalY = viewportHeight - menuRect.height - 10;
    }
    if (finalX < 10) finalX = 10;
    if (finalY < 10) finalY = 10;
    
    menu.style.left = finalX + 'px';
    menu.style.top = finalY + 'px';
}

function executeDeleteMove() {
    if (contextMenuTargetIndex !== null) {
        if (importModeLineIndex !== null) {
            // Import mode: edit the import line
            deleteMoveFromImportLine(importModeLineIndex, contextMenuTargetIndex);
        } else if (viewModeEditLineId !== null) {
            // View mode: edit the stored line directly
            deleteMoveFromLine(viewModeEditLineId, contextMenuTargetIndex);
        } else {
            // Add mode: edit current game
            deleteMoveFrom(contextMenuTargetIndex);
        }
    }
    document.getElementById('move-context-menu').classList.add('hidden');
}

// Delete move from import line
function deleteMoveFromImportLine(lineIndex, moveIndex) {
    const pgn = parsedImportLines[lineIndex];
    if (!pgn) return;
    
    const tempGame = new Chess();
    try {
        tempGame.load_pgn(pgn);
    } catch (e) {
        return;
    }
    
    const history = tempGame.history();
    
    // Rebuild game up to the deleted move
    tempGame.reset();
    for (let i = 0; i < moveIndex; i++) {
        tempGame.move(history[i]);
    }
    
    // Update the import line
    parsedImportLines[lineIndex] = tempGame.pgn();
    
    // Re-render
    renderImportLinesList();
}

// View position after a specific move (view mode or tree mode)
function executeViewPosition() {
    // Handle import mode context menu
    if (importModeLineIndex !== null && contextMenuTargetIndex !== null) {
        const pgn = parsedImportLines[importModeLineIndex];
        if (!pgn) {
            document.getElementById('move-context-menu').classList.add('hidden');
            return;
        }
        
        const tempGame = new Chess();
        tempGame.load_pgn(pgn);
        const history = tempGame.history({ verbose: true });
        
        // Update the main board to show this position
        game.reset();
        for (let i = 0; i <= contextMenuTargetIndex && i < history.length; i++) {
            game.move(history[i]);
        }
        board.position(game.fen());
        
        // Highlight the last move
        if (history[contextMenuTargetIndex]) {
            highlightLastMove(history[contextMenuTargetIndex]);
        }
        
        // Show filter banner and filter import lines
        document.getElementById('import-filter-banner').classList.remove('hidden');
        renderImportLinesList(game.pgn());
        
        // Run engine evaluation if enabled
        if (isEngineRunning) startEvaluation();
        
        document.getElementById('move-context-menu').classList.add('hidden');
        return;
    }
    
    // Handle tree view context menu
    if (treeMoveContextPath !== null) {
        const moves = treeMoveContextPath.split(',');
        game.reset();
        let lastMove = null;
        for (const moveSan of moves) {
            lastMove = game.move(moveSan);
        }
        board.position(game.fen());
        if (lastMove) highlightLastMove(lastMove);
        updateViewSearch();
        if (isEngineRunning) startEvaluation();
        document.getElementById('move-context-menu').classList.add('hidden');
        return;
    }
    
    // Handle normal list view context menu
    if (viewModeEditLineId === null || contextMenuTargetIndex === null) return;
    
    const line = repertoire[currentSide].find(l => l.id === viewModeEditLineId);
    if (!line) return;
    
    const tempGame = new Chess();
    tempGame.load_pgn(line.pgn);
    const history = tempGame.history({ verbose: true });
    
    // Update the main board to show this position
    game.reset();
    for (let i = 0; i <= contextMenuTargetIndex && i < history.length; i++) {
        game.move(history[i]);
    }
    board.position(game.fen());
    
    // Highlight the last move
    if (history[contextMenuTargetIndex]) {
        highlightLastMove(history[contextMenuTargetIndex]);
    }
    
    // Update view search to show matching lines
    updateViewSearch();
    
    // Run engine evaluation if enabled
    if (isEngineRunning) startEvaluation();
    
    document.getElementById('move-context-menu').classList.add('hidden');
}

// Delete move from a stored line (view mode)
function deleteMoveFromLine(lineId, index) {
    const line = repertoire[currentSide].find(l => l.id === lineId);
    if (!line) return;
    
    const tempGame = new Chess();
    tempGame.load_pgn(line.pgn);
    const history = tempGame.history({ verbose: true });
    
    // Rebuild game up to the deleted move
    tempGame.reset();
    for (let i = 0; i < index; i++) {
        tempGame.move(history[i]);
    }
    
    // Update line PGN
    line.pgn = tempGame.pgn();
    
    // Clean up annotations for deleted moves
    if (line.annotations) {
        const newAnnotations = {};
        for (let i = 0; i < index; i++) {
            if (line.annotations[i]) {
                newAnnotations[i] = line.annotations[i];
            }
        }
        line.annotations = newAnnotations;
    }
    
    // Clean up comments for positions that no longer exist
    if (line.comments) {
        const newComments = {};
        tempGame.reset();
        for (let i = 0; i <= index && i < history.length; i++) {
            const fen = tempGame.fen().split(' ').slice(0, 4).join(' ');
            if (line.comments[fen]) {
                newComments[fen] = line.comments[fen];
            }
            if (history[i]) tempGame.move(history[i]);
        }
        line.comments = newComments;
    }
    
    saveData();
    renderList(game.pgn());
    playSound('move');
}

function deleteMoveFrom(index) {
    const history = game.history({verbose: true});
    // Reset game and replay moves up to index-1
    game.reset();
    for (let i = 0; i < index; i++) {
        game.move(history[i]);
    }
    
    // Clean up annotations for deleted moves
    for (let i = index; i < history.length; i++) {
        delete currentAnnotations[i];
    }
    
    board.position(game.fen());
    updatePgnDisplay();
    loadNoteForCurrentPos();
    drawShapes();
    playSound('move');
}

// Hide context menu on global click
document.addEventListener('click', (e) => {
    const menu = document.getElementById('move-context-menu');
    if (menu && !menu.classList.contains('hidden')) {
        // Don't close if clicking inside the menu
        if (menu.contains(e.target)) return;
        menu.classList.add('hidden');
    }
});

// Allow scrolling inside the context menu
document.addEventListener('wheel', (e) => {
    const menu = document.getElementById('move-context-menu');
    if (menu && menu.contains(e.target)) {
        e.stopPropagation();
    }
}, { passive: true });

// --- Annotation add flow via context menu ---
function executeAddAnnotation() {
    const submenu = document.getElementById('annotation-submenu');
    const menu = document.getElementById('move-context-menu');
    if (submenu) {
        submenu.classList.remove('hidden');
        
        // Reposition menu after submenu is shown to keep it on screen
        if (menu) {
            const menuRect = menu.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            let newTop = menuRect.top;
            let newLeft = menuRect.left;
            
            // If menu now extends beyond viewport bottom, move it up
            if (menuRect.bottom > viewportHeight - 10) {
                newTop = Math.max(10, viewportHeight - menuRect.height - 10);
            }
            
            // If menu extends beyond viewport right, move it left
            if (menuRect.right > viewportWidth - 10) {
                newLeft = Math.max(10, viewportWidth - menuRect.width - 10);
            }
            
            menu.style.top = newTop + 'px';
            menu.style.left = newLeft + 'px';
        }
    }
}

function pickAnnotation(symbol) {
    if (contextMenuTargetIndex === null) return;
    
    if (importModeLineIndex !== null) {
        // Import mode: add annotation to import line
        annotateImportLineMove(importModeLineIndex, contextMenuTargetIndex, symbol);
    } else if (viewModeEditLineId !== null) {
        // View mode: edit the stored line directly
        annotateLineMove(viewModeEditLineId, contextMenuTargetIndex, symbol);
    } else if (mode === 'add') {
        // Add mode: edit current game
        annotateMoveAtIndex(contextMenuTargetIndex, symbol);
    }
    
    const menu = document.getElementById('move-context-menu');
    if (menu) menu.classList.add('hidden');
}

// Add annotation to import line move
function annotateImportLineMove(lineIndex, moveIndex, annotation) {
    const pgn = parsedImportLines[lineIndex];
    if (!pgn) return;
    
    // Initialize annotation storage for this line if needed
    if (!importLineAnnotations[lineIndex]) {
        importLineAnnotations[lineIndex] = {};
    }
    
    // Toggle annotation if same one is clicked again
    if (importLineAnnotations[lineIndex][moveIndex] === annotation) {
        delete importLineAnnotations[lineIndex][moveIndex];
    } else {
        importLineAnnotations[lineIndex][moveIndex] = annotation;
    }
    
    // Re-render
    renderImportLinesList();
}

// Add annotation to a stored line (view mode)
function annotateLineMove(lineId, index, annotation) {
    const line = repertoire[currentSide].find(l => l.id === lineId);
    if (!line) return;
    
    if (!line.annotations) line.annotations = {};
    
    // Toggle annotation if same one is clicked again
    if (line.annotations[index] === annotation) {
        delete line.annotations[index];
    } else {
        line.annotations[index] = annotation;
    }
    
    saveData();
    renderList(game.pgn());
}

function annotateMoveAtIndex(index, annotation) {
    const history = game.history({ verbose: true });
    if (!history[index]) return;
    currentAnnotations[index] = annotation;
    // Display only this annotation for add-mode
    currentDisplayAnnotations = {};
    const mv = history[index];
    currentDisplayAnnotations[mv.to] = annotation;
    updatePgnDisplay();
    drawShapes();
}


    function showTrainingResults() {
    const total = trainingStats.correct + trainingStats.wrongLines.length;
    const accuracy = total > 0 ? Math.round((trainingStats.correct / total) * 100) : 0;
    
    // Update stats
    document.getElementById('stat-correct').innerText = trainingStats.correct;
    document.getElementById('stat-wrong').innerText = trainingStats.wrongLines.length;
    document.getElementById('stat-accuracy').innerText = accuracy + '%';
    
    // Determine performance level
    const icon = document.getElementById('results-icon');
    const title = document.getElementById('results-title');
    const subtitle = document.getElementById('results-subtitle');
    
    if (accuracy === 100) {
        icon.className = 'results-icon perfect';
        icon.innerHTML = '<i class="fas fa-trophy"></i>';
        title.innerText = 'Perfekt!';
        subtitle.innerText = 'Du hast alle Varianten gemeistert!';
    } else if (accuracy >= 70) {
        icon.className = 'results-icon good';
        icon.innerHTML = '<i class="fas fa-star"></i>';
        title.innerText = 'Gut gemacht!';
        subtitle.innerText = 'Starke Leistung, weiter so!';
    } else {
        icon.className = 'results-icon needs-work';
        icon.innerHTML = '<i class="fas fa-chart-line"></i>';
        title.innerText = 'Training abgeschlossen';
        subtitle.innerText = 'Übung macht den Meister!';
    }
    
    // Handle wrong lines section
    const container = document.getElementById('wrong-lines-container');
    const actionsDiv = document.getElementById('results-actions');
    
    if (trainingStats.wrongLines.length > 0) {
        container.innerHTML = `
            <div class="wrong-lines-section">
                <div class="wrong-lines-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>Fehlerhafte Varianten (${trainingStats.wrongLines.length})</span>
                </div>
                <div class="wrong-lines-list">
                    ${trainingStats.wrongLines.map(line => `
                        <div class="wrong-line-item">${line.pgn}</div>
                    `).join('')}
                </div>
            </div>
            <div class="results-question">
                <i class="fas fa-bookmark" style="color: var(--warning); margin-right: 8px;"></i>
                Diese Varianten zur Wiederholung hinzufügen?
            </div>
        `;
        
        actionsDiv.innerHTML = `
            <button class="results-btn primary" onclick="addWrongLinesToRepetition()">
                <i class="fas fa-check"></i> Ja, hinzufügen
            </button>
            <button class="results-btn secondary" onclick="closeTrainingResults()">
                <i class="fas fa-times"></i> Nein, danke
            </button>
        `;
    } else {
        container.innerHTML = `
            <div class="no-wrong-lines">
                <i class="fas fa-check-circle"></i>
                <p>Keine Fehler!</p>
                <span>Du hast alle Varianten perfekt gespielt.</span>
            </div>
        `;
        
        actionsDiv.innerHTML = `
            <button class="results-btn secondary" onclick="closeTrainingResults()">
                <i class="fas fa-times"></i> Schließen
            </button>
        `;
    }
    
    // Show overlay
    document.getElementById('training-results-overlay').style.display = 'flex';
}

function addWrongLinesToRepetition() {
    trainingStats.wrongLines.forEach(wrongLine => {
        const alreadyExists = repertoire[currentSide].some(l => 
            l.pgn === wrongLine.pgn && l.category === REPETITION_CAT
        );
        
        if (!alreadyExists) {
            const newLine = JSON.parse(JSON.stringify(
                repertoire[currentSide].find(l => l.id === wrongLine.id)
            ));
            newLine.id = Date.now() + Math.random(); // Unique ID
            newLine.category = REPETITION_CAT;
            repertoire[currentSide].unshift(newLine);
        }
    });
    
    saveData();
    closeTrainingResults();
}

function closeTrainingResults() {
    document.getElementById('training-results-overlay').style.display = 'none';
    stopTraining();
}

// --- STOCKFISH ANALYSIS MENU ---
let analysisActive = false;
let analysisResults = [];
let currentAnalysisFen = '';
let analysisDepth = 20;
let analysisLines = 5;

// --- DATABASE MENU ---
let databaseActive = true; // Default to shown

function toggleDatabaseMenu() {
    databaseActive = !databaseActive;
    const section = document.getElementById('explorer-section');
    const btn = document.getElementById('btn-database');
    
    // Save state to settings
    userSettings.databaseOpen = databaseActive;
    localStorage.setItem('chessSettingsPro', JSON.stringify(userSettings));
    
    if (databaseActive) {
        section.classList.remove('hidden');
        btn.classList.add('active');
        updateOpeningExplorer();
    } else {
        section.classList.add('hidden');
        btn.classList.remove('active');
    }
}

async function toggleAnalysisMenu() {
    analysisActive = !analysisActive;
    const section = document.getElementById('analysis-section');
    const btn = document.getElementById('btn-analysis');
    const evalBar = document.getElementById('eval-bar-container');
    
    // Save state to settings
    userSettings.analysisOpen = analysisActive;
    localStorage.setItem('chessSettingsPro', JSON.stringify(userSettings));
    
    if (analysisActive) {
        section.classList.remove('hidden');
        btn.classList.add('active');
        evalBar.classList.remove('hidden');
        runStockfishAnalysis();
    } else {
        section.classList.add('hidden');
        btn.classList.remove('active');
        // Hide eval bar only if engine evaluation is not running
        if (!isEngineRunning) {
            evalBar.classList.add('hidden');
        }
        // Stop any ongoing calculation
        await stopEngineCalculation();
        // Reset MultiPV to 1 for normal evaluation
        sendEngineCommand('setoption name MultiPV value 1');
    }
}

function updateAnalysisDepth(value) {
    analysisDepth = parseInt(value);
    // Re-run analysis with new depth if active
    if (analysisActive) {
        runStockfishAnalysis();
    }
}

function updateAnalysisLines(value) {
    analysisLines = parseInt(value);
    // Clear old results and re-run analysis with new lines count if active
    if (analysisActive) {
        analysisResults = [];
        runStockfishAnalysis();
    }
}

async function runStockfishAnalysis() {
    if (!analysisActive) return;
    
    const container = document.getElementById('analysis-moves');
    const depthSpan = document.getElementById('analysis-depth');
    
    container.innerHTML = '<div class="explorer-loading"><i class="fas fa-spinner fa-spin"></i> Analysiere...</div>';
    depthSpan.innerText = '';
    
    const fen = game.fen();
    currentAnalysisFen = fen;
    analysisResults = [];
    
    // Ensure engine is initialized
    await initEngine();
    
    // Stop any ongoing calculation before starting new analysis
    await stopEngineCalculation();
    
    // Configure and start analysis with MultiPV
    sendEngineCommand(`setoption name MultiPV value ${analysisLines}`);
    sendEngineCommand(`position fen ${fen}`);
    
    // Use selected depth (99 = infinite)
    if (analysisDepth >= 99) {
        sendEngineCommand('go infinite');
    } else {
        sendEngineCommand(`go depth ${analysisDepth}`);
    }
}

// Called from handleEngineMessage in stockfish-wrapper.js
function handleAnalysisMessage(line) {
    if (!analysisActive) return;
    
    const tokens = line.split(' ');
    
    const depthIdx = tokens.indexOf('depth');
    const depth = depthIdx !== -1 ? parseInt(tokens[depthIdx + 1]) : 0;
    
    // Only process if depth is reasonable
    if (depth < 1) return;
    
    const multipvIdx = tokens.indexOf('multipv');
    const multipv = multipvIdx !== -1 ? parseInt(tokens[multipvIdx + 1]) : 1;
    
    const scoreIdx = tokens.indexOf('score');
    let score = null;
    let isMate = false;
    if (scoreIdx !== -1) {
        const type = tokens[scoreIdx + 1];
        const value = parseInt(tokens[scoreIdx + 2]);
        if (type === 'mate') {
            score = value;
            isMate = true;
        } else if (type === 'cp') {
            score = value / 100;
        }
    }
    
    const pvIdx = tokens.indexOf('pv');
    const pvMoves = pvIdx !== -1 ? tokens.slice(pvIdx + 1) : [];
    
    if (pvMoves.length > 0) {
        // Convert UCI move to SAN
        const uciMove = pvMoves[0];
        let sanMove = uciToSan(uciMove, currentAnalysisFen);
        
        // Convert full PV to SAN
        let pvSan = convertPvToSan(pvMoves, currentAnalysisFen);
        
        // Update results for this multipv line
        analysisResults[multipv - 1] = {
            move: sanMove,
            uci: uciMove,
            score: score,
            isMate: isMate,
            depth: depth,
            pv: pvMoves.slice(0, 16),
            pvSan: pvSan
        };
        
        // Update display
        renderAnalysisMoves();
        if (analysisActive) {
            document.getElementById('analysis-depth').innerText = `Tiefe ${depth}`;
        }
        
        // Update eval bar with best line (multipv 1)
        if (multipv === 1 && score !== null) {
            let evalScore = score;
            // Adjust for side to move
            if (game.turn() === 'b') evalScore = -evalScore;
            
            if (isMate) {
                evalScore = evalScore > 0 ? 100 : -100;
                document.getElementById('eval-score').innerText = `M${Math.abs(score)}`;
            } else {
                document.getElementById('eval-score').innerText = (evalScore > 0 ? '+' : '') + evalScore.toFixed(1);
                if (evalScore > 5) evalScore = 5;
                if (evalScore < -5) evalScore = -5;
            }
            updateEvalBar(evalScore);
        }
    }
}

function uciToSan(uci, fen) {
    // Create a temporary game to convert UCI to SAN
    const tempGame = new Chess(fen);
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    
    try {
        const move = tempGame.move({ from, to, promotion });
        return move ? move.san : uci;
    } catch (e) {
        return uci;
    }
}

function convertPvToSan(pvMoves, startFen) {
    const tempGame = new Chess(startFen);
    const sanMoves = [];
    
    for (let i = 0; i < Math.min(pvMoves.length, 16); i++) {
        const uci = pvMoves[i];
        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        
        try {
            const move = tempGame.move({ from, to, promotion });
            if (move) {
                sanMoves.push(move.san);
            } else {
                break;
            }
        } catch (e) {
            break;
        }
    }
    
    return sanMoves;
}

function renderAnalysisMoves() {
    // Render to standard analysis section if active
    if (analysisActive) {
        renderAnalysisToContainer('analysis-moves', 'analysis-depth');
    }
}

function renderAnalysisToContainer(containerId, depthSpanId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const turn = game.turn(); // 'w' or 'b'
    
    if (analysisResults.length === 0) {
        container.innerHTML = '<div class="explorer-placeholder">Keine Analyse verfügbar</div>';
        return;
    }
    
    container.innerHTML = '';
    
    // Only show up to analysisLines results
    analysisResults.filter(r => r).slice(0, analysisLines).forEach((result, index) => {
        if (!result) return;
        
        // Adjust score for black's perspective
        let displayScore = result.score;
        if (turn === 'b' && displayScore !== null) {
            displayScore = -displayScore;
        }
        
        let evalText, evalClass;
        if (result.isMate) {
            evalText = displayScore > 0 ? `M${Math.abs(result.score)}` : `-M${Math.abs(result.score)}`;
            evalClass = displayScore > 0 ? 'positive' : 'negative';
        } else if (displayScore !== null) {
            evalText = displayScore > 0 ? `+${displayScore.toFixed(1)}` : displayScore.toFixed(1);
            evalClass = displayScore > 0.3 ? 'positive' : displayScore < -0.3 ? 'negative' : 'neutral';
        } else {
            evalText = '?';
            evalClass = 'neutral';
        }
        
        // Build PV string (skip first move as it's already shown)
        const pvLine = result.pvSan ? result.pvSan.slice(1).join(' ') : '';
        
        const moveDiv = document.createElement('div');
        moveDiv.className = 'explorer-move analysis-line';
        moveDiv.onclick = () => playAnalysisMove(result.uci);
        
        moveDiv.innerHTML = `
            <div class="explorer-move-san">${result.move}</div>
            <div class="analysis-move-eval ${evalClass}">${evalText}</div>
            <div class="analysis-pv">${pvLine}</div>
        `;
        
        container.appendChild(moveDiv);
    });
}

function playAnalysisMove(uci) {
    try {
        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        
        const move = game.move({ from, to, promotion });
        if (!move) return;
        
        board.position(game.fen(), false);
        if (move.captured) playSound('capture');
        else playSound('move');
        highlightLastMove(move);
        
        currentDisplayAnnotations = {};
        updatePgnDisplay();
        loadNoteForCurrentPos();
        updateOpeningExplorer();
        
        // Re-run analysis for new position
        if (analysisActive) {
            runStockfishAnalysis();
        }
        
        if (isEngineRunning && mode !== 'bot' && mode !== 'train') {
            setTimeout(startEvaluation, 50);
        }
    } catch (e) {
        console.error('Failed to play analysis move:', e);
    }
}

// Update analysis when position changes in add mode
function updateAnalysisIfActive() {
    if (analysisActive && mode === 'add') {
        runStockfishAnalysis();
    }
}

// --- LICHESS OPENING EXPLORER ---
let explorerCache = {};

async function updateOpeningExplorer() {
    if (mode !== 'add') return;
    
    const fen = game.fen();
    const container = document.getElementById('explorer-moves');
    const stats = document.getElementById('explorer-stats');
    
    // Check cache first
    if (explorerCache[fen]) {
        renderExplorerMoves(explorerCache[fen]);
        return;
    }
    
    // Show loading
    container.innerHTML = '<div class="explorer-loading"><i class="fas fa-spinner fa-spin"></i> Lade Datenbank...</div>';
    stats.innerText = '';
    
    try {
        // Lichess Opening Explorer API
        const response = await fetch(`https://explorer.lichess.ovh/lichess?variant=standard&speeds[]=blitz&speeds[]=rapid&speeds[]=classical&ratings[]=2000&ratings[]=2200&ratings[]=2500&fen=${encodeURIComponent(fen)}`);
        
        if (!response.ok) throw new Error('API Error');
        
        const data = await response.json();
        explorerCache[fen] = data;
        renderExplorerMoves(data);
        
    } catch (error) {
        container.innerHTML = '<div class="explorer-error"><i class="fas fa-exclamation-triangle"></i> Datenbank nicht verfügbar</div>';
        stats.innerText = '';
    }
}

function renderExplorerMoves(data) {
    const container = document.getElementById('explorer-moves');
    const stats = document.getElementById('explorer-stats');
    
    if (!data || !data.moves || data.moves.length === 0) {
        container.innerHTML = '<div class="explorer-placeholder">Keine Züge in der Datenbank</div>';
        stats.innerText = '';
        return;
    }
    
    // Total games
    const totalGames = data.white + data.draws + data.black;
    stats.innerText = `${totalGames.toLocaleString()} Partien`;
    
    // Sort moves by popularity
    const moves = data.moves.sort((a, b) => {
        const totalA = a.white + a.draws + a.black;
        const totalB = b.white + b.draws + b.black;
        return totalB - totalA;
    });
    
    container.innerHTML = '';
    
    moves.forEach(moveData => {
        const total = moveData.white + moveData.draws + moveData.black;
        const whitePercent = (moveData.white / total) * 100;
        const drawPercent = (moveData.draws / total) * 100;
        const blackPercent = (moveData.black / total) * 100;
        
        const moveDiv = document.createElement('div');
        moveDiv.className = 'explorer-move';
        moveDiv.onclick = () => playExplorerMove(moveData.san);
        
        // Only show percentage text if segment is wide enough (>15%)
        const whiteText = whitePercent >= 15 ? `${Math.round(whitePercent)}%` : '';
        const drawText = drawPercent >= 15 ? `${Math.round(drawPercent)}%` : '';
        const blackText = blackPercent >= 15 ? `${Math.round(blackPercent)}%` : '';
        
        moveDiv.innerHTML = `
            <div class="explorer-move-san">${moveData.san}</div>
            <div class="explorer-move-bar">
                <div class="explorer-bar-segment explorer-bar-white" style="width: ${whitePercent}%">${whiteText}</div>
                <div class="explorer-bar-segment explorer-bar-draw" style="width: ${drawPercent}%">${drawText}</div>
                <div class="explorer-bar-segment explorer-bar-black" style="width: ${blackPercent}%">${blackText}</div>
            </div>
            <div class="explorer-move-stats">
                <span class="explorer-move-games">${total.toLocaleString()}</span>
            </div>
        `;
        
        container.appendChild(moveDiv);
    });
}

function playExplorerMove(san) {
    try {
        const move = game.move(san);
        if (!move) return;
        
        board.position(game.fen(), false);
        if (move.captured) playSound('capture');
        else playSound('move');
        highlightLastMove(move);
        
        currentDisplayAnnotations = {};
        updatePgnDisplay();
        loadNoteForCurrentPos();
        updateOpeningExplorer();
        
        if (isEngineRunning && mode !== 'bot' && mode !== 'train') {
            setTimeout(startEvaluation, 50);
        }
    } catch (e) {
        console.error('Failed to play move:', e);
    }
}

applySettings(); initBoard(); setSide('white'); window.onresize = board.resize;

document.body.addEventListener('mousedown', initAudio);
