# Task 4 report: 1-player Timed Battle

Status: DONE. Gate: pnpm test (922 passed, 2 skipped), pnpm typecheck, pnpm build green.

## Ported
- `select.ts`: `timedBattleSelect` (menus.c:678), gameplaySelect row 2 sets `timedBattleMode` (twoPlayerMode stays false; the 2P and network rows remain refused until Task 6), `newGame` timed branch. `timedBattleSelect` does not touch `initialEpisodeNum` (menus.c:846 does not; the survey text said otherwise).
- `script.ts`: `]T` and `]q`. `flow.ts`: timed battle death returns with `mainLevel = 0` before `loadGame`.
- `endlevel.ts`: time bonus line, lives animation (OPTION_SHAPES 46), +1000 per life, cubes block skipped.
- `highscores.ts`: timed variant (table `timeBattleSelection - 1`, no song 33, PIC 13, no cancel, caption). Two-player parts remain (Task 6).
- Task 3 leftovers: supermodes buffer slice 26, `SA_NORTSHIPZ` moved to world.ts, cancel test asserts.

## Goldens
`polish-timed-deliani` (seed `polish-timed`: empty timed tables so a 1000 score qualifies; fire released before the F2+F6+F7 cheat because the C blocks in `wait_noinput` on a held key and the oracle only releases keys on frame advance), `polish-timed-die`, `polish-timed-station` (dies). All match HASH/STATE2/STATE3 (and saves for deliani).

## Notes
- A natural timer win needs ~5200 frames and the idle weaving ship dies ~100 frames after the timer starts, so the win path is the cheat (timer set to 0: time bonus is 0 in the golden; the time-bonus line is covered only by reading).
- Station dies, so `polish-timed-station` does not reach the ep5 high-score path.
