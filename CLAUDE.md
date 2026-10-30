# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript + HTML5 Canvas. No dependencies, no package.json, no bundler/transpiler, no test suite, no linter. The README and all user-facing UI strings are in Spanish; keep new UI text in Spanish.

## Running

Open `index.html` directly (`start index.html` on Windows), or serve the folder statically (recommended):

    python -m http.server 8000   # then http://localhost:8000
    npx serve .

There is nothing to build or test automatically; verify changes by playing in the browser.

## Architecture

- `game.js` is a single classic (non-module) script loaded at the end of `<body>`. It grabs DOM elements by id at the top level, so any id change in `index.html` (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`) must be mirrored in `game.js`.
- All game state is module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `lastTime`, `dropAccum`, `dropInterval`, `animId`), reset by `init()`, which is also the restart-button handler.
- Board: `ROWS × COLS` matrix; `0` = empty, `1–7` = piece type, which is also the index into `COLORS` and `PIECES` (index 0 is `null` in both). Piece shapes store their type number in their filled cells, so `merge()` copies the cell value straight into the board.
- Loop: `requestAnimationFrame` → `loop(ts)` accumulates `dropAccum` and steps gravity when it reaches `dropInterval`, then redraws everything with `draw()`. Pausing and game over cancel the loop with `cancelAnimationFrame(animId)`; unpausing restarts it by calling `loop()` directly.
- Piece lifecycle: `lockPiece()` → `merge()` → `clearLines()` (updates score, level and `dropInterval`) → `spawn()` (promotes `next`, makes a new random piece, triggers `endGame()` if the new piece collides on spawn, redraws the preview).
- The HUD is not redrawn every frame. `updateHUD()` runs after each keydown and inside `clearLines`/`softDrop`; any new code that changes score, lines or level must call it.
- The overlay (`#overlay` toggled with the `hidden` class) is shared by pause and game over; the code sets the title and score text before showing it.

## Coupled values

- Board canvas size in `index.html` must equal `COLS*BLOCK × ROWS*BLOCK` (300×600 by default).
- `drawNext()` assumes a 4×4 preview grid of 30px cells (`NB = 30`), which matches the 120×120 `#next-canvas`.
- The README documents the controls, the scoring table, the level/speed formula and the tunable constants; update it when you change any of them.
