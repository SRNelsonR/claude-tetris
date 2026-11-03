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
const startLevelSelect = document.getElementById('start-level-select');

const themeToggle = document.getElementById('theme-toggle');

const gameoverExtra = document.getElementById('gameover-extra');
const newRecordMsg = document.getElementById('new-record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const overlayRecords = document.getElementById('overlay-records');
const overlayStats = document.getElementById('overlay-stats');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const startScreen = document.getElementById('start-screen');
const startRecords = document.getElementById('start-records');
const startStats = document.getElementById('start-stats');
const startResetBtn = document.getElementById('start-reset-btn');
const startBtn = document.getElementById('start-btn');

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

function loadRecords() {
  const empty = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.top)) return empty;
    const num = v => (Number.isFinite(v) && v >= 0 ? v : 0);
    const top = data.top
      .filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score))
      .map(e => ({
        name: e.name.slice(0, 12), score: num(e.score), lines: num(e.lines),
        level: num(e.level), date: typeof e.date === 'string' ? e.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    return { top, bestCombo: num(data.bestCombo), maxLines: num(data.maxLines) };
  } catch (err) {
    return empty;
  }
}

function saveRecords(rec) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch (err) {
    // Sin almacenamiento disponible: se ignora
  }
}

// Construye la tabla con DOM (textContent) para no interpretar HTML del nombre
function renderRecords(container, statsEl, highlight) {
  const rec = loadRecords();
  container.replaceChildren();
  if (rec.top.length === 0) {
    const p = document.createElement('p');
    p.className = 'records-empty';
    p.textContent = 'Aún no hay records';
    container.appendChild(p);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    const head = table.createTHead().insertRow();
    ['#', 'Nombre', 'Puntos', 'Líneas', 'Nivel', 'Fecha'].forEach((t, i) => {
      const th = document.createElement('th');
      th.textContent = t;
      if (i === 1) th.className = 'col-name';
      head.appendChild(th);
    });
    rec.top.forEach((e, i) => {
      const tr = table.insertRow();
      const d = e.date ? new Date(e.date) : null;
      const date = d && !isNaN(d) ? d.toLocaleDateString('es') : '';
      [i + 1, e.name, e.score.toLocaleString(), e.lines, e.level, date].forEach((v, j) => {
        const td = tr.insertCell();
        td.textContent = v;
        if (j === 1) td.className = 'col-name';
      });
      if (highlight && e.date === highlight.date && e.name === highlight.name && e.score === highlight.score) {
        tr.className = 'highlight';
      }
    });
    container.appendChild(table);
  }
  statsEl.textContent = `Mejor combo: ${rec.bestCombo} · Líneas máximas: ${rec.maxLines}`;
}

function renderAllRecords(highlight) {
  renderRecords(startRecords, startStats, highlight);
  renderRecords(overlayRecords, overlayStats, highlight);
}

function resetRecords() {
  if (!confirm('¿Borrar todos los records?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (err) {
    // Se ignora
  }
  newRecordMsg.classList.add('hidden');
  nameForm.classList.add('hidden');
  renderAllRecords();
}

function qualifiesForTop(rec) {
  return score > 0 && (rec.top.length < MAX_RECORDS || score > rec.top[rec.top.length - 1].score);
}

function saveName() {
  if (nameForm.classList.contains('hidden')) return;
  const rec = loadRecords();
  const entry = {
    name: nameInput.value.trim().slice(0, 12) || 'Anónimo',
    score, lines, level, date: new Date().toISOString(),
  };
  rec.top.push(entry);
  rec.top.sort((a, b) => b.score - a.score);
  rec.top = rec.top.slice(0, MAX_RECORDS);
  saveRecords(rec);
  nameForm.classList.add('hidden');
  renderAllRecords(entry);
}

// Colores del canvas leídos de las variables CSS del tema activo
const canvasColors = { grid: '', shine: '' };

function loadCanvasColors() {
  const css = getComputedStyle(document.documentElement);
  canvasColors.grid = css.getPropertyValue('--grid').trim();
  canvasColors.shine = css.getPropertyValue('--block-shine').trim();
}

// Nivel con el que arranca la próxima partida (se elige en el menú de pausa)
let startLevel = 1;
// Nivel inicial de la partida en curso (copia de startLevel al hacer init)
let gameStartLevel = 1;
// Instante hasta el que se ignoran las teclas de juego tras reanudar/reiniciar
let inputBlockedUntil = 0;
const RESUME_GRACE_MS = 150;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo; // combo = piezas seguidas fijadas que limpian al menos una línea
let started = false; // el juego no arranca hasta pulsar "Jugar"

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
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(gameStartLevel, Math.floor(lines / 10) + 1);
    dropInterval = speedFor(level);
    updateHUD();
  }
  return cleared;
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
  if (clearLines()) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  // Mejor combo y líneas máximas se guardan siempre; el top solo al enviar el nombre
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);

  const isRecord = qualifiesForTop(rec);
  newRecordMsg.classList.toggle('hidden', !isRecord);
  nameForm.classList.toggle('hidden', !isRecord);
  nameInput.value = '';
  gameoverExtra.classList.remove('hidden');
  renderAllRecords();
  overlay.classList.remove('hidden');
  if (isRecord) nameInput.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    inputBlockedUntil = performance.now() + RESUME_GRACE_MS;
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    controlsList.classList.add('hidden');
    controlsBtn.setAttribute('aria-expanded', 'false');
    pauseMenu.classList.remove('hidden');
    resumeBtn.focus();
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
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  gameoverExtra.classList.add('hidden');
  dropInterval = speedFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  inputBlockedUntil = performance.now() + RESUME_GRACE_MS;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Escribir en el campo de nombre no debe disparar controles del juego
  if (e.target instanceof HTMLInputElement) return;
  if (!started) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  if (paused) {
    // Menú abierto: las teclas de juego no actúan; solo se navega por el menú
    if (e.target === startLevelSelect) return;
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      const items = [...pauseMenu.querySelectorAll('button, select')]
        .filter(el => el.offsetParent !== null);
      const i = items.indexOf(document.activeElement);
      const d = e.code === 'ArrowDown' ? 1 : -1;
      items[i < 0 ? 0 : (i + d + items.length) % items.length].focus();
    }
    return;
  }
  if (gameOver) return;
  // Descarta teclas pulsadas justo tras reanudar o reiniciar
  if (performance.now() < inputBlockedUntil) {
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

// Si queda un récord sin guardar, se guarda con el nombre escrito (o 'Anónimo')
restartBtn.addEventListener('click', () => {
  saveName();
  init();
});
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', init);

controlsBtn.addEventListener('click', () => {
  const open = !controlsList.classList.toggle('hidden');
  controlsBtn.setAttribute('aria-expanded', String(open));
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  saveName();
  document.activeElement.blur();
});
resetRecordsBtn.addEventListener('click', () => {
  resetRecords();
  resetRecordsBtn.blur();
});
startResetBtn.addEventListener('click', () => {
  resetRecords();
  startResetBtn.blur();
});
startBtn.addEventListener('click', () => {
  started = true;
  startBtn.blur();
  startScreen.classList.add('hidden');
  init();
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
  if (started) {
    draw();
    drawNext();
  }
  // Evita que Space/Enter vuelvan a activar el botón
  themeToggle.blur();
});

loadCanvasColors();

// Pantalla de inicio: init() se llama al pulsar "Jugar"
renderAllRecords();
