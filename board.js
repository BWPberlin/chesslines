// --- CHESS BOARD MODULE ---
// This file contains all chess board related functionality

let board = null;
let game = new Chess();
let currentSide = 'white';

// --- DRAG HANDLER STATE ---
let dragSourceSquare = null;
let lastHoverSquare = null;

// --- ARROW DRAWING STATE ---
const boardWrapper = document.getElementById('board-wrapper');
const svgOverlay = document.getElementById('arrow-overlay');
// Detect touch devices (phone/tablet)
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
let isDrawing = false;
let startSquare = null;

// --- MOBILE ARROW DRAWING MODE ---
let arrowDrawModeActive = false;
let arrowDrawFirstSquare = null;
let arrowDrawColor = 'green';

// --- MOBILE CIRCLE DRAWING MODE ---
let circleDrawModeActive = false;
let circleDrawColor = 'green';

function toggleArrowDrawMode() {
    // Turn off circle mode if active
    if (circleDrawModeActive) {
        circleDrawModeActive = false;
        document.getElementById('btn-circle-draw')?.classList.remove('active');
        document.getElementById('circle-color-popup')?.classList.add('hidden');
    }
    
    arrowDrawModeActive = !arrowDrawModeActive;
    const btn = document.getElementById('btn-arrow-draw');
    const colorPopup = document.getElementById('arrow-color-popup');
    
    if (arrowDrawModeActive) {
        btn.classList.add('active');
        if (colorPopup) colorPopup.classList.remove('hidden');
        arrowDrawFirstSquare = null;
        // Disable piece dragging
        if (board) {
            board.draggable = false;
        }
    } else {
        btn.classList.remove('active');
        if (colorPopup) colorPopup.classList.add('hidden');
        arrowDrawFirstSquare = null;
        clearArrowDrawHighlight();
        // Re-enable piece dragging
        if (board) {
            board.draggable = true;
        }
    }
}

function toggleCircleDrawMode() {
    // Turn off arrow mode if active
    if (arrowDrawModeActive) {
        arrowDrawModeActive = false;
        arrowDrawFirstSquare = null;
        clearArrowDrawHighlight();
        document.getElementById('btn-arrow-draw')?.classList.remove('active');
        document.getElementById('arrow-color-popup')?.classList.add('hidden');
    }
    
    circleDrawModeActive = !circleDrawModeActive;
    const btn = document.getElementById('btn-circle-draw');
    const colorPopup = document.getElementById('circle-color-popup');
    
    if (circleDrawModeActive) {
        btn.classList.add('active');
        if (colorPopup) colorPopup.classList.remove('hidden');
        // Disable piece dragging
        if (board) {
            board.draggable = false;
        }
    } else {
        btn.classList.remove('active');
        if (colorPopup) colorPopup.classList.add('hidden');
        // Re-enable piece dragging
        if (board) {
            board.draggable = true;
        }
    }
}

function setArrowColor(color) {
    arrowDrawColor = color;
    document.querySelectorAll('#arrow-color-popup .arrow-color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
}

function setCircleColor(color) {
    circleDrawColor = color;
    document.querySelectorAll('#circle-color-popup .arrow-color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
}

function clearArrowDrawHighlight() {
    document.querySelectorAll('.arrow-draw-start').forEach(el => el.classList.remove('arrow-draw-start'));
}

function handleArrowDrawClick(e) {
    if (mode !== 'add') return;
    if (!arrowDrawModeActive && !circleDrawModeActive) return;
    
    // Get coordinates from touch or mouse event
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    const square = getSquareFromCoords(clientX, clientY);
    
    if (!square) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Circle drawing mode - single tap draws a circle
    if (circleDrawModeActive) {
        addShape(square, square, circleDrawColor);
        return;
    }
    
    // Arrow drawing mode - two taps
    if (arrowDrawModeActive) {
        if (!arrowDrawFirstSquare) {
            // First square selected
            arrowDrawFirstSquare = square;
            clearArrowDrawHighlight();
            const squareEl = document.querySelector(`#board .square-${square}`);
            if (squareEl) squareEl.classList.add('arrow-draw-start');
        } else {
            // Second square selected - draw arrow
            if (arrowDrawFirstSquare !== square) {
                addShape(arrowDrawFirstSquare, square, arrowDrawColor);
            }
            arrowDrawFirstSquare = null;
            clearArrowDrawHighlight();
        }
    }
}

// Add click/touch listeners for arrow drawing mode
boardWrapper.addEventListener('click', (e) => {
    if ((arrowDrawModeActive || circleDrawModeActive) && mode === 'add') {
        handleArrowDrawClick(e);
    }
}, true);

boardWrapper.addEventListener('touchend', (e) => {
    if ((arrowDrawModeActive || circleDrawModeActive) && mode === 'add') {
        // Use the last touch position
        if (e.changedTouches && e.changedTouches[0]) {
            handleArrowDrawClick({
                clientX: e.changedTouches[0].clientX,
                clientY: e.changedTouches[0].clientY,
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            });
        }
    }
}, { passive: false });

// --- MOVE HIGHLIGHTING ---
function highlightLastMove(move) {
    if(!userSettings.highlight) return;
    $('#board .square-55d63').removeClass('highlight-square');
    if(move) { $('#board .square-' + move.from).addClass('highlight-square'); $('#board .square-' + move.to).addClass('highlight-square'); }
}

// FORCE IMMEDIATE VISUAL UPDATE FOR POSITION CHANGES
function updateBoardDisplay(fen) {
    board.position(fen, false); // false = no animation
}

// --- PIECE THEME URL ---
function pieceThemeUrl(piece) {
    const style = userSettings.pieceStyle || 'wikipedia';
    const base = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/';
    
    if (style === 'blindfold') return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    if (style === 'wikipedia') return base + 'cburnett/' + piece + '.svg';
    if (style === 'alpha') return base + 'alpha/' + piece + '.svg';
    if (style === 'uscf') return base + 'california/' + piece + '.svg';
    if (style === 'merida') return base + 'merida/' + piece + '.svg';
    if (style === 'maestro') return base + 'maestro/' + piece + '.svg';
    if (style === 'leipzig') return base + 'leipzig/' + piece + '.svg';
    if (style === 'tatiana') return base + 'tatiana/' + piece + '.svg';
    if (style === 'cardinal') return base + 'cardinal/' + piece + '.svg';
    
    return base + 'cburnett/' + piece + '.svg'; 
}

// --- SQUARE COORDINATE UTILITIES ---
function getSquareFromPoint(x, y) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return null;
    const rect = boardEl.getBoundingClientRect();
    const squareSize = rect.width / 8;
    const relX = x - rect.left;
    const relY = y - rect.top;
    if (relX < 0 || relX >= rect.width || relY < 0 || relY >= rect.height) return null;
    let col = Math.floor(relX / squareSize);
    let row = Math.floor(relY / squareSize);
    // Adjust for board orientation
    const isFlipped = currentSide === 'black';
    if (isFlipped) {
        col = 7 - col;
        row = 7 - row;
    }
    const files = 'abcdefgh';
    const ranks = '87654321';
    return files[col] + ranks[row];
}

function getSquareFromCoords(clientX, clientY) {
    const rect = boardWrapper.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const squareSize = rect.width / 8;
    
    let col = Math.floor(x / squareSize);
    let row = Math.floor(y / squareSize);
    
    if(currentSide === 'black') {
        col = 7 - col;
        row = 7 - row;
    }
    
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    
    if(col >= 0 && col <= 7 && row >= 0 && row <= 7) {
        return files[col] + ranks[row];
    }
    return null;
}

function getSquareCenter(sq) {
    const boardEl = document.getElementById('board');
    const boardRect = boardEl.getBoundingClientRect();
    const boardWrapperRect = boardWrapper.getBoundingClientRect();
    const size = boardRect.width / 8;
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];
    
    let col = files.indexOf(sq.charAt(0));
    let row = ranks.indexOf(sq.charAt(1));
    
    if(currentSide === 'black') {
        col = 7 - col;
        row = 7 - row;
    }
    
    // Calculate position relative to boardWrapper (SVG coordinate system)
    const offsetX = boardRect.left - boardWrapperRect.left;
    const offsetY = boardRect.top - boardWrapperRect.top;
    
    return {
        x: col * size + size / 2 + offsetX,
        y: row * size + size / 2 + offsetY
    };
}

function getCleanFen() { return game.fen().split(' ').slice(0, 4).join(' '); }

// --- DRAG HANDLERS ---
function onDragMove(e) {
    if (!dragSourceSquare) return;
    const x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
    const y = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);
    if (x === undefined || y === undefined) return;
    const square = getSquareFromPoint(x, y);
    if (square !== lastHoverSquare) {
        if (lastHoverSquare) {
            $(`#board .square-${lastHoverSquare}`).removeClass('drag-hover');
        }
        if (square && square !== dragSourceSquare) {
            $(`#board .square-${square}`).addClass('drag-hover');
        }
        lastHoverSquare = square;
    }
}

function onDragStart (source, piece) { 
    // Block dragging if arrow draw mode is active
    if (arrowDrawModeActive) return false;
    
    // Generelle Checks
    if (isPaused) return false; 
    if (game.game_over()) return false; 
    if (isBotThinking) return false; // LOCK BOARD IF BOT IS THINKING

    // Regel 1: Man darf immer nur die Farbe ziehen, die gerade am Zug ist
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }

    // Regel 2: Im TRAINING und BOT Modus darf man NIEMALS die gegnerischen Figuren anfassen.
    if (mode === 'train' || mode === 'bot') {
        if ((currentSide === 'white' && piece.search(/^b/) !== -1) || 
            (currentSide === 'black' && piece.search(/^w/) !== -1)) {
            return false;
        }
    }
    
    // Highlight the source square and mark board as dragging
    dragSourceSquare = source;
    lastHoverSquare = null;
    $('#board').addClass('is-dragging');
    $(`#board .square-${source}`).addClass('drag-source');
    
    // Add mouse/touch move listeners for hover tracking
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove);
    
    setTimeout(() => {
        const draggedPieces = document.querySelectorAll('img[src*="piece"]');
        draggedPieces.forEach(el => {
            el.style.visibility = 'visible !important'; 
            el.style.opacity = '1 !important';
            el.style.zIndex = '999999';
        });
    }, 0);

    return true; 
}

function onMouseoverSquare(square, piece) {
    // Only highlight if we're dragging a piece
    if (dragSourceSquare) {
        $(`#board .square-${square}`).addClass('drag-hover');
    }
}

function onMouseoutSquare(square, piece) {
    $(`#board .square-${square}`).removeClass('drag-hover');
}

function onDrop (source, target) {
    // Clear drag highlights and remove listeners
    $('#board').removeClass('is-dragging');
    $('#board .square-55d63').removeClass('drag-source drag-hover');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('touchmove', onDragMove);
    dragSourceSquare = null;
    lastHoverSquare = null;
    
    let moveObj = { from: source, to: target, promotion: 'q' }; 
    let move = game.move(moveObj);
    if (move === null) return 'snapback';
    
    if(move.captured) playSound('capture'); 
    else playSound('move'); 
    highlightLastMove(move);
    
    return new Promise((resolve) => {
        setTimeout(() => {
            if (mode === 'add') { 
                currentDisplayAnnotations = {}; // Clear annotations when making a new move
                // Update full history and reset preview index to end
                addModeFullHistory = game.history({ verbose: true });
                addModePreviewIndex = addModeFullHistory.length - 1;
                updatePgnDisplay(); 
                loadNoteForCurrentPos();
                updateOpeningExplorer(); // Update explorer with new position
                updateAnalysisIfActive(); // Update analysis if enabled
            } 
            else if (mode === 'train') { 
                handleTrainingMove(move); 
            } 
            else if (mode === 'bot') { 
                // Check if game ended after player's move
                if(game.game_over()) {
                    setTimeout(() => { 
                        showBotGameResults();
                    }, 500);
                } else {
                    updateBotStatus("Bot denkt nach...", "neutral");
                    isBotThinking = true;
                    setTimeout(makeBotMove, 500);
                }
            }
            else if (mode === 'view') { 
                updateViewSearch(); 
            }
            else if (mode === 'selection') {
                updateSelectionSearch();
            }
            
            if (isEngineRunning && mode !== 'bot' && mode !== 'train') {
                setTimeout(startEvaluation, 50);
            }
            resolve();
        }, 50);
    });
}

function onSnapEnd () { 
    setTimeout(() => {
        board.position(game.fen(), false);
    }, 10);
}

function forceboardUpdate(fen, callback) {
    board.position(fen, false);
    setTimeout(() => {
        if (callback) callback();
    }, 100);
}

// --- BOARD INITIALIZATION ---
function initBoard() {
    const config = { 
        draggable: true, 
        position: game.fen(), 
        onDragStart: onDragStart, 
        onDrop: onDrop, 
        onSnapEnd: onSnapEnd,
        onMouseoverSquare: onMouseoverSquare,
        onMouseoutSquare: onMouseoutSquare,
        pieceTheme: pieceThemeUrl,
        moveSpeed: userSettings.animSpeed, 
        snapSpeed: userSettings.animSpeed, 
        showNotation: userSettings.coords, 
        orientation: currentSide 
    };
    if(board) board.destroy(); $('#board').empty(); board = Chessboard('board', config);
    // Ensure touch interactions work on mobile: prevent native touch scrolling inside the board
    const boardEl = document.getElementById('board');
    if (boardEl) {
        boardEl.addEventListener('touchstart', (ev) => { if (window.innerWidth <= 768) ev.preventDefault(); }, { passive: false });
    }
    const history = game.history({verbose:true}); if(history.length > 0) highlightLastMove(history[history.length-1]);
    setTimeout(() => { board.resize(); drawShapes(); }, 100);
}

// --- ARROW/SHAPE DRAWING ---
function getColorCode(c) {
    if(c === 'green') return '#22c55e';
    if(c === 'red') return '#ef4444';
    if(c === 'blue') return '#3b82f6';
    if(c === 'yellow') return '#eab308';
    return '#22c55e';
}

function drawArrow(from, to, color) {
    const start = getSquareCenter(from);
    const end = getSquareCenter(to);
    
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
    line.setAttribute("stroke", getColorCode(color));
    line.setAttribute("stroke-width", "5");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("opacity", "0.8");
    line.setAttribute("marker-end", `url(#arrowhead-${color})`);
    
    svgOverlay.appendChild(line);
}

function drawCircle(sq, color) {
    const center = getSquareCenter(sq);
    const rect = boardWrapper.getBoundingClientRect();
    const size = rect.width / 8;
    
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", center.x);
    circle.setAttribute("cy", center.y);
    circle.setAttribute("r", size / 2.2); 
    circle.setAttribute("stroke", getColorCode(color));
    circle.setAttribute("stroke-width", "4");
    circle.setAttribute("fill", "none");
    circle.setAttribute("opacity", "0.8");
    
    svgOverlay.appendChild(circle);
}

function drawAnnotation(sq, annotation) {
    const center = getSquareCenter(sq);
    const boardEl = document.getElementById('board');
    const rect = boardEl.getBoundingClientRect();
    const size = rect.width / 8;
    
    // Position proportionally to square size for consistent placement on all screen sizes
    const offsetX = size * 0.2; // 20% of square size from right edge
    const offsetY = size * 0.2; // 20% of square size from top edge (moved closer to top)
    
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", center.x + size / 2 - offsetX);
    text.setAttribute("y", center.y - size / 2 + offsetY);
    text.setAttribute("font-size", Math.max(14, size * 0.25)); // Scale font size with square size, min 14px
    text.setAttribute("font-weight", "bold");
    // Set text color based on annotation
    let textColor = "#000"; // default black
    if (annotation === "??" || annotation === "?" || annotation === "?!" || annotation === "∓" || annotation === "−+") {
        textColor = "#fff"; // white for dark backgrounds
    }
    text.setAttribute("fill", textColor);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle"); // Center vertically
    text.textContent = annotation;
    
    // Add background circle for visibility with color based on annotation
    let bgColor = "rgba(255,255,255,0.8)"; // default white
    if (annotation === "??") bgColor = "rgba(239, 68, 68, 0.9)"; // red for blunder
    else if (annotation === "?") bgColor = "rgba(249, 115, 22, 0.9)"; // orange for mistake
    else if (annotation === "?!") bgColor = "rgba(234, 179, 8, 0.9)"; // yellow for dubious
    else if (annotation === "∓") bgColor = "rgba(0,0,0,0.8)"; // black for black much better
    else if (annotation === "±") bgColor = "rgba(255,255,255,0.9)"; // white for white much better
    else if (annotation === "−+") bgColor = "rgba(0,0,0,0.8)"; // black for black slightly better
    else if (annotation === "+−") bgColor = "rgba(255,255,255,0.9)"; // white for white slightly better
    else if (annotation === "=") bgColor = "rgba(255,255,255,0.9)"; // white for equal
    
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bg.setAttribute("cx", center.x + size / 2 - offsetX);
    bg.setAttribute("cy", center.y - size / 2 + offsetY);
    bg.setAttribute("r", Math.max(10, size * 0.2)); // Scale circle size with square size, min 10px
    bg.setAttribute("fill", bgColor);
    
    // Add black border for white circles
    if (bgColor.includes("255,255,255")) {
        bg.setAttribute("stroke", "#000");
        bg.setAttribute("stroke-width", "1");
    }
    
    svgOverlay.appendChild(bg);
    svgOverlay.appendChild(text);
}

function drawShapes() {
    const fen = getCleanFen();
    const shapes = currentShapes[fen] || [];
    svgOverlay.innerHTML = ''; 
    
    // Define smooth arrow markers
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    ['green', 'red', 'blue', 'yellow'].forEach(c => {
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", `arrowhead-${c}`);
        marker.setAttribute("markerWidth", "5");
        marker.setAttribute("markerHeight", "5"); 
        marker.setAttribute("refX", "2.5");
        marker.setAttribute("refY", "2.5");
        marker.setAttribute("orient", "auto");
        
        // Use path for smoother curves
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M 0 0.5 Q 1 2.5 0 4.5 L 5 2.5 Z"); // Curved arrowhead
        path.setAttribute("fill", getColorCode(c));
        
        marker.appendChild(path);
        defs.appendChild(marker);
    });
    svgOverlay.appendChild(defs);

    shapes.forEach(shape => {
        if(shape.from === shape.to) {
            drawCircle(shape.from, shape.color);
        } else {
            drawArrow(shape.from, shape.to, shape.color);
        }
    });

    // Draw annotations based on mode
    let annotationsToDraw = {};
    if (mode === 'train') {
        annotationsToDraw = currentTrainingAnnotations;
    } else if (mode === 'add') {
        annotationsToDraw = currentDisplayAnnotations;
    }
    
    Object.keys(annotationsToDraw).forEach(sq => {
        drawAnnotation(sq, annotationsToDraw[sq]);
    });
}

function addShape(from, to, color) {
    const fen = getCleanFen();
    if(!currentShapes[fen]) currentShapes[fen] = [];
    
    const existingIdx = currentShapes[fen].findIndex(s => s.from === from && s.to === to);
    
    if (existingIdx !== -1) {
        currentShapes[fen].splice(existingIdx, 1);
    } else {
        currentShapes[fen].push({ from, to, color });
    }
    drawShapes();
}

function clearShapesForCurrentPos() {
    const fen = getCleanFen();
    delete currentShapes[fen];
    drawShapes();
}

// --- ARROW DRAWING EVENT LISTENERS ---
// UPDATED: Use Capture phase to ensure right-click works on all squares including pieces
boardWrapper.addEventListener('mousedown', (e) => {
    // Disable drawing on touch devices (phones/tablets)
    if (isTouchDevice) return;
    if(e.button === 2) { // Right Click
        isDrawing = true;
        startSquare = getSquareFromCoords(e.clientX, e.clientY);
        e.preventDefault(); // Prevent any default behavior on right-click
        e.stopPropagation(); // Stop event from reaching piece handlers
    }
}, true); // Use capture phase

// Add this to prevent default context menu on the board
boardWrapper.addEventListener('contextmenu', (e) => { e.preventDefault(); return false; }, true);

boardWrapper.addEventListener('mouseup', (e) => {
    if (isTouchDevice) return;
    if(isDrawing && e.button === 2) {
        const endSquare = getSquareFromCoords(e.clientX, e.clientY);
        if(startSquare && endSquare) {
            let color = 'green';
            if(e.shiftKey) color = 'red';
            else if(e.altKey) color = 'blue';
            else if(e.ctrlKey) color = 'yellow';

            addShape(startSquare, endSquare, color);
        }
        isDrawing = false;
        startSquare = null;
        e.preventDefault();
        e.stopPropagation();
    }
}, true); // Use capture phase

// If on touch device, hide the clear-shapes buttons (all) because drawing is disabled
if (isTouchDevice) {
    document.querySelectorAll('.clear-shapes-btn').forEach(btn => btn.classList.add('hidden'));
}

// --- RESIZE HANDLER ---
window.addEventListener('resize', () => {
    board.resize();
    setTimeout(drawShapes, 50);
});
