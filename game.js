'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris acero)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (reto)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---- Tabla de records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

function loadRecords() {
  const data = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (raw && Array.isArray(raw.scores)) {
      data.scores = raw.scores
        .filter(e => e && Number.isFinite(e.score))
        .map(e => ({ name: String(e.name || 'Anónimo').slice(0, 12), score: e.score, lines: Number(e.lines) || 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS);
      data.bestCombo = Number(raw.bestCombo) || 0;
      data.maxLines = Number(raw.maxLines) || 0;
    }
  } catch (e) { /* datos corruptos o localStorage no disponible */ }
  return data;
}

function saveRecords(data) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(data)); } catch (e) { /* ignorar */ }
}

function qualifies(sc, data) {
  return sc > 0 && (data.scores.length < MAX_RECORDS || sc > data.scores[data.scores.length - 1].score);
}

// Posición (0-based) que ocuparía una puntuación; los empates quedan detrás de los existentes
function insertIndex(sc, scores) {
  const i = scores.findIndex(e => sc > e.score);
  return i === -1 ? scores.length : i;
}

function renderRecords(container, entries, highlightIdx) {
  const list = container.querySelector('.records-list');
  list.textContent = '';
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin records todavía';
    list.appendChild(li);
  }
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === highlightIdx) li.className = 'highlight';
    const name = document.createElement('span');
    name.textContent = `${i + 1}. ${e.name}`;
    const sc = document.createElement('span');
    sc.textContent = `${e.score.toLocaleString()} (${e.lines} L)`;
    li.append(name, sc);
    list.appendChild(li);
  });
  const stats = loadRecords();
  container.querySelector('.records-stats').textContent =
    `Mejor combo: ${stats.bestCombo} · Líneas máximas: ${stats.maxLines}`;
}

function refreshRecordViews() {
  const data = loadRecords();
  renderRecords(recordsStart, data.scores, -1);
  renderRecords(recordsOver, data.scores, -1);
}

// Guarda la entrada pendiente del game over (si la hay) con el nombre escrito
function commitPending() {
  if (!pendingEntry) return;
  const data = loadRecords();
  const entry = { name: nameInput.value.trim().slice(0, 12) || 'Anónimo', score: pendingEntry.score, lines: pendingEntry.lines };
  const idx = insertIndex(entry.score, data.scores);
  data.scores.splice(idx, 0, entry);
  data.scores = data.scores.slice(0, MAX_RECORDS);
  saveRecords(data);
  pendingEntry = null;
  nameForm.classList.add('hidden');
  recordMsg.textContent = '¡Record guardado!';
  renderRecords(recordsOver, data.scores, idx);
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSel = document.getElementById('start-level');
// Elementos del overlay que solo se muestran en pausa (no en game over)
const pauseOnlyEls = document.querySelectorAll('#overlay .pause-only');
// Elementos del overlay que solo se muestran en game over (records)
const gameoverOnlyEls = document.querySelectorAll('#overlay .gameover-only');

const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const recordMsg = document.getElementById('record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsStart = document.getElementById('records-start');
const recordsOver = document.getElementById('records-over');

const themeToggle = document.getElementById('theme-toggle');

// Colores del canvas leídos de las variables CSS del tema activo
const canvasColors = { grid: '', shine: '' };

function loadCanvasColors() {
  const css = getComputedStyle(document.documentElement);
  canvasColors.grid = css.getPropertyValue('--grid').trim();
  canvasColors.shine = css.getPropertyValue('--block-shine').trim();
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, sessionBestCombo, pendingEntry;
let startLevel = 1;

// Teclas físicamente pulsadas, y las que siguen "bloqueadas" tras reanudar o
// reiniciar: se ignoran hasta soltarlas para no mover la pieza por accidente.
const pressedKeys = new Set();
let blockedKeys = new Set();

function speedFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    sessionBestCombo = Math.max(sessionBestCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = speedFor(level);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = canvasColors.shine;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = canvasColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function setControlsVisible(visible) {
  pauseControls.classList.toggle('hidden', !visible);
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
  controlsBtn.setAttribute('aria-expanded', String(visible));
}

// mode: 'pause' | 'gameover'. El overlay es compartido; en game over se
// ocultan Reanudar y Ver controles.
function showOverlay(mode) {
  const isPause = mode === 'pause';
  overlayTitle.textContent = isPause ? 'PAUSA' : 'GAME OVER';
  overlayScore.textContent = isPause ? '' : `Puntuación: ${score.toLocaleString()}`;
  pauseOnlyEls.forEach(el => el.classList.toggle('hidden', !isPause));
  gameoverOnlyEls.forEach(el => el.classList.toggle('hidden', isPause));
  setControlsVisible(false);
  overlay.classList.remove('hidden');
  if (isPause) resumeBtn.focus();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  const data = loadRecords();
  data.bestCombo = Math.max(data.bestCombo, sessionBestCombo);
  data.maxLines = Math.max(data.maxLines, lines);
  saveRecords(data);

  showOverlay('gameover');
  if (qualifies(score, data)) {
    pendingEntry = { score, lines };
    const idx = insertIndex(score, data.scores);
    const preview = data.scores.slice();
    preview.splice(idx, 0, { name: '???', score, lines });
    recordMsg.textContent = `¡Entras en el top ${idx + 1}!`;
    renderRecords(recordsOver, preview.slice(0, MAX_RECORDS), idx);
    nameForm.classList.remove('hidden');
    nameInput.value = '';
    nameInput.focus();
  } else {
    pendingEntry = null;
    recordMsg.textContent = '';
    nameForm.classList.add('hidden');
    renderRecords(recordsOver, data.scores, -1);
  }
  recordsStartRefresh();
}

function recordsStartRefresh() {
  renderRecords(recordsStart, loadRecords().scores, -1);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(animId);
    showOverlay('pause');
  } else {
    overlay.classList.add('hidden');
    // Quita el foco del menú para que Space/Enter no activen botones en juego
    if (document.activeElement) document.activeElement.blur();
    blockedKeys = new Set(pressedKeys);
    lastTime = performance.now();
    loop(lastTime);
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() puede ejecutarse dentro de este frame (vía lockPiece), donde
  // cancelAnimationFrame(animId) no tiene efecto: no reprogramar el bucle.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  commitPending();
  recordsStartRefresh();
  startOverlay.classList.add('hidden');
  gameoverExtra.classList.add('hidden');
  combo = 0;
  sessionBestCombo = 0;
  board = createBoard();
  score = 0;
  lines = 0;
  startLevel = Number(startLevelSel.value) || 1;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  blockedKeys = new Set(pressedKeys);
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  pressedKeys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  // Con el menú abierto o en game over, las teclas de juego no actúan
  if (paused || gameOver) return;
  if (blockedKeys.has(e.code)) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  pressedKeys.delete(e.code);
  blockedKeys.delete(e.code);
});

// Si la ventana pierde el foco no llegan los keyup: evita teclas "pegadas"
window.addEventListener('blur', () => {
  pressedKeys.clear();
  blockedKeys.clear();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
controlsBtn.addEventListener('click', () => {
  setControlsVisible(pauseControls.classList.contains('hidden'));
});

startBtn.addEventListener('click', () => { startBtn.blur(); init(); });

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPending();
  recordsStartRefresh();
  restartBtn.focus();
});

document.querySelectorAll('.reset-records-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!confirm('¿Borrar todos los records?')) return;
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* ignorar */ }
    pendingEntry = null;
    nameForm.classList.add('hidden');
    recordMsg.textContent = '';
    refreshRecordViews();
    btn.blur();
  });
});

themeToggle.addEventListener('click', () => {
  const root = document.documentElement;
  const light = root.dataset.theme !== 'light';
  if (light) root.dataset.theme = 'light';
  else delete root.dataset.theme;
  themeToggle.textContent = light ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  loadCanvasColors();
  // El bucle está cancelado en pausa/game over: redibujar explícitamente
  if (current) { draw(); drawNext(); }
  // Evita que Space/Enter vuelvan a activar el botón
  themeToggle.blur();
});

loadCanvasColors();

// Pantalla de inicio: el juego arranca al pulsar "Jugar"
board = createBoard();
gameOver = true;
pendingEntry = null;
refreshRecordViews();
