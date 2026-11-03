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

const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelSelect = document.getElementById('start-level');

const recordMsg = document.getElementById('record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsBox = document.getElementById('records');
const recordsList = document.getElementById('records-list');
const recordsStats = document.getElementById('records-stats');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const themeToggle = document.getElementById('theme-toggle');

// ---- Tabla de records (localStorage) ----
const STORAGE_KEY = 'tetris.records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

function emptyRecords() {
  return { entries: [], bestCombo: 0, maxLines: 0, lastName: '' };
}

function loadRecords() {
  const data = emptyRecords();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.entries)) {
        data.entries = raw.entries
          .filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score))
          .map(e => ({ name: e.name.slice(0, NAME_MAX), score: e.score }))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_RECORDS);
      }
      if (Number.isFinite(raw.bestCombo)) data.bestCombo = raw.bestCombo;
      if (Number.isFinite(raw.maxLines)) data.maxLines = raw.maxLines;
      if (typeof raw.lastName === 'string') data.lastName = raw.lastName.slice(0, NAME_MAX);
    }
  } catch (_) { /* localStorage no disponible o datos corruptos */ }
  return data;
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (_) { /* sin almacenamiento: los records solo duran la sesión */ }
}

// Posición (0-based) que ocuparía una puntuación en el top, o -1 si no entra
function recordPosition(s) {
  if (s <= 0) return -1;
  let idx = records.entries.findIndex(e => s > e.score);
  if (idx === -1) idx = records.entries.length;
  return idx < MAX_RECORDS ? idx : -1;
}

let records = loadRecords();
// Puntuación pendiente de guardar (pendingIndex >= 0) y fila a resaltar
let pendingIndex = -1, pendingScore = 0, highlightIndex = -1;

// Colores del canvas leídos de las variables CSS del tema activo
const canvasColors = { grid: '', shine: '' };

function loadCanvasColors() {
  const css = getComputedStyle(document.documentElement);
  canvasColors.grid = css.getPropertyValue('--grid').trim();
  canvasColors.shine = css.getPropertyValue('--block-shine').trim();
}

let startLevel = 1;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo = líneas consecutivas: piezas seguidas que eliminan al menos una línea
let combo, maxCombo, onStart;

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
  if (!cleared) combo = 0;
  else {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = speedFor(level);
    updateHUD();
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

function renderRecords() {
  const rows = records.entries.slice();
  if (pendingIndex >= 0) rows.splice(pendingIndex, 0, { name: 'Tú', score: pendingScore });
  recordsList.replaceChildren();
  for (let i = 0; i < MAX_RECORDS; i++) {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    const name = document.createElement('span');
    const pts = document.createElement('span');
    name.className = 'rec-name';
    rank.textContent = `${i + 1}.`;
    if (rows[i]) {
      name.textContent = rows[i].name;
      pts.textContent = rows[i].score.toLocaleString();
      if (i === highlightIndex) li.classList.add('me');
    } else {
      name.textContent = '---';
      li.classList.add('empty');
    }
    li.append(rank, name, pts);
    recordsList.append(li);
  }
  recordsStats.textContent =
    `Mejor combo: x${records.bestCombo} · Líneas máx.: ${records.maxLines}`;
}

// Muestra el overlay; con showRecords incluye la tabla (inicio y game over).
// Por defecto muestra el botón principal y oculta el menú de pausa.
function showOverlay(title, scoreText, btnText, showRecords) {
  overlayTitle.textContent = title;
  overlayScore.textContent = scoreText;
  restartBtn.textContent = btnText;
  restartBtn.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  recordsBox.classList.toggle('hidden', !showRecords);
  if (showRecords) renderRecords();
  overlay.classList.remove('hidden');
}

function updateRecordMsg() {
  const pending = pendingIndex >= 0;
  nameForm.classList.toggle('hidden', !pending);
  recordMsg.classList.toggle('hidden', !pending && highlightIndex < 0);
  if (pending) recordMsg.textContent = `¡Nuevo récord! Puesto #${pendingIndex + 1}`;
  else if (highlightIndex >= 0) recordMsg.textContent = `¡Récord guardado en el puesto #${highlightIndex + 1}!`;
}

// Guarda la puntuación pendiente con el nombre escrito (o "Anónimo")
function commitPending() {
  if (pendingIndex < 0) return;
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  records.entries.splice(pendingIndex, 0, { name, score: pendingScore });
  records.entries.length = Math.min(records.entries.length, MAX_RECORDS);
  records.lastName = name;
  saveRecords();
  highlightIndex = pendingIndex;
  pendingIndex = -1;
  updateRecordMsg();
  renderRecords();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  pendingIndex = recordPosition(score);
  pendingScore = score;
  highlightIndex = pendingIndex;
  showOverlay('GAME OVER', `Puntuación: ${score.toLocaleString()}`, 'Reiniciar', true);
  updateRecordMsg();
  if (pendingIndex >= 0) {
    nameInput.value = records.lastName;
    nameInput.focus();
    nameInput.select();
  }
}

function showStart() {
  onStart = true;
  cancelAnimationFrame(animId);
  pendingIndex = -1;
  highlightIndex = -1;
  showOverlay('NUEVA PARTIDA', '', 'Jugar', true);
  updateRecordMsg();
}

function pauseGame() {
  paused = true;
  cancelAnimationFrame(animId);
  showOverlay('PAUSA', '', 'Reiniciar', false);
  updateRecordMsg();
  restartBtn.classList.add('hidden');
  controlsList.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
  startLevelSelect.value = String(startLevel);
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function resumeGame() {
  paused = false;
  overlay.classList.add('hidden');
  // Evita que Space/Enter reactiven un botón del menú al volver al juego
  if (document.activeElement) document.activeElement.blur();
  lastTime = performance.now();
  loop(lastTime);
}

function togglePause() {
  if (gameOver || onStart) return;
  if (paused) resumeGame();
  else pauseGame();
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
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedFor(level);
  onStart = false;
  combo = 0;
  maxCombo = 0;
  pendingIndex = -1;
  highlightIndex = -1;
  updateRecordMsg();
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  if (document.activeElement) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // Con el menú abierto, game over o la pantalla de inicio el juego ignora los controles
  if (paused || gameOver || onStart) return;
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

pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resumeGame);

controlsBtn.addEventListener('click', () => {
  const show = controlsList.classList.toggle('hidden') === false;
  controlsBtn.setAttribute('aria-expanded', String(show));
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

restartBtn.addEventListener('click', () => {
  commitPending(); // no perder un record sin guardar
  init();
  restartBtn.blur(); // evita que Space vuelva a activar el botón
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPending();
  restartBtn.focus();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  records = emptyRecords();
  saveRecords();
  if (pendingIndex >= 0) {
    pendingIndex = recordPosition(pendingScore);
    highlightIndex = pendingIndex;
  } else {
    highlightIndex = -1;
  }
  updateRecordMsg();
  renderRecords();
  resetRecordsBtn.blur();
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
  draw();
  drawNext();
  // Evita que Space/Enter vuelvan a activar el botón
  themeToggle.blur();
});

loadCanvasColors();

// Pantalla de inicio: tablero preparado pero sin arrancar hasta pulsar "Jugar"
init();
showStart();
