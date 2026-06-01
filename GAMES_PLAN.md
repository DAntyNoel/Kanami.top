# Kanami.top Static Game Plan

## Goal

Add a small static game collection next to EatKanami. Each game should live in its own directory, run from GitHub Pages without a build step, work on desktop and mobile, and reuse the site's current Kanami images where possible.

## Current Entry

- `EatKanami/` is live.
- `games/memory/`, `games/catch/`, `games/2048/`, `games/simon/`, and `games/sweeper/` are now live as self-contained static games.
- The root `index.html` now uses a game-card grid so new games can be added by inserting another card.
- Each new game directory includes a `CREDITS.md` file that thanks the original reference repository.

## Research Notes

- [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048): classic 2048 implementation, JavaScript/CSS, MIT license.
- [kubowania/memory-game](https://github.com/kubowania/memory-game): simple vanilla JavaScript memory-card game, MIT license.
- [phartenfeller/minesweeper_js](https://github.com/phartenfeller/minesweeper_js): plain JavaScript/CSS/HTML minesweeper PWA, MIT license.
- [ImKennyYip/whac-a-mole](https://github.com/ImKennyYip/whac-a-mole): HTML/CSS/JavaScript whac-a-mole tutorial project and demo.
- [he-is-talha/html-css-javascript-games](https://github.com/he-is-talha/html-css-javascript-games): MIT-licensed HTML/CSS/JS game collection with 2048, minesweeper, memory, snake, breakout, Simon, and more.
- [wavde/games](https://github.com/wavde/games): MIT-licensed no-build vanilla HTML/CSS/JS collection; useful as a structure reference.
- [js13kGames/resources](https://github.com/js13kGames/resources): reference list for tiny engines, sound tools, and pixel-art helpers.

## Build Rules

- Prefer hand-written vanilla HTML, CSS, and JavaScript.
- Avoid remote CDN dependencies in new games.
- Keep each game self-contained with `index.html`, `style.css`, and `game.js`.
- Store high scores and settings in `localStorage`.
- Reuse `res/images/stamps/` and `res/images/backgrounds/` before adding new assets.
- If code is copied or substantially adapted from a repository, include its license text in that game directory.

## Priority 1: Kanami Memory

Concept: a 4x4 card-matching game using Kanami stamps.

Core features:
- Shuffle eight image pairs.
- Track moves, elapsed time, and best result.
- Flip two cards at a time; keep matched pairs open.
- Add restart button and win summary.
- Mobile-friendly square grid.

Why first:
- Uses existing assets.
- Low implementation risk.
- Good first test for the new game entry layout.

Implementation estimate: 1 small static directory.

## Priority 2: Catch Kanami

Concept: a fast click/tap challenge inspired by whac-a-mole. Kanami appears in a grid; the player taps the correct spot before time runs out.

Core features:
- 3x3 or 4x4 grid.
- 30-second timer.
- Random target spawn interval that speeds up over time.
- Optional decoy tile that subtracts score.
- Best score saved locally.

Theme ideas:
- "点亮舞台"
- "抓住闪现时刻"
- Tap sound can be generated with Web Audio instead of adding MP3 files.

Implementation estimate: 1 small static directory.

## Priority 3: Kanami 2048

Concept: 2048-style sliding puzzle with Kanami-themed tiles.

Core features:
- 4x4 board.
- Keyboard and swipe controls.
- Score and best score.
- Undo is optional.
- Tile ladder can use text labels first, images later.

Theme ladder draft:
- `♪`
- `Soda`
- `Be Shinning`
- `Stamp`
- `Stage`
- `Kanami`
- `World`

Implementation estimate: medium; needs careful touch controls.

## Priority 4: Stage Simon

Concept: Simon-style memory sequence game with four stage lights.

Core features:
- Four color buttons.
- Generated sequence grows each round.
- Sound cues with Web Audio.
- Keyboard support for desktop.
- Best round saved locally.

Implementation estimate: small.

## Priority 5: Kanami Sweeper

Concept: minesweeper with a softer Kanami/stage theme.

Core features:
- Beginner board first.
- Tap to reveal, long-press or mode toggle to flag on mobile.
- Timer, remaining hidden markers, restart.
- Optional difficulties.

Implementation estimate: medium; mobile flagging needs care.

## Suggested Order

1. Add `games/memory/` and link it from the live grid.
2. Add `games/catch/` and link it from the live grid.
3. Add `games/2048/` after touch controls feel good.
4. Add `games/simon/` as a quick rhythm/memory filler.
5. Add `games/sweeper/` once the site has enough variety.

## Acceptance Checklist

- [x] Opens directly from `index.html` on GitHub Pages.
- [x] Works with mouse and touch.
- [x] No console errors.
- [x] Text fits on mobile width.
- [x] Has restart flow.
- [x] Stores best score locally when relevant.
- [x] Adds a root game-card link when the game becomes playable.
- [x] Keeps credits for the original reference repositories.
