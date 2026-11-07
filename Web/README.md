# Symmetro for the web

The browser version of Symmetro, written in TypeScript. It is a static site with no
server code: **Best results** are stored only in the player's browser (localStorage key
`symmetro.scores`). It plays on computers (keyboard or mouse) and on phones and
tablets (touch). There is no sound yet.

It will be hosted at https://www.mgoat.us/games/Symmetro/. The build uses relative
paths, so it works from any folder.

## Relation to the Python game

The game logic is a copy of the Python code in `../src/symmetro`:

| Python          | TypeScript        |
|-----------------|-------------------|
| `geometry.py`   | `src/geometry.ts` |
| `game.py`       | `src/game.ts`     |
| `levels.py`     | `src/levels.ts`   |
| `scores.py`     | `src/scores.ts`   |
| `app.py`        | `src/app.ts`, `src/board.ts`, `src/scenes.ts` |

`src/levels.json` and `src/assets/splash.png` are copies too. **When you add levels with
the Python editor, copy `src/symmetro/levels.json` here as well**, then run `npm test`.
The test "levels match the Python game" fails until you update the reference values in
`tests/symmetro.test.ts` (the command to produce them is in the test file), which
checks that both versions agree on every level's minimum moves.

## Controls

On a computer, the keys are the same as in the Python game: numpad 1-9, Q W E / A D /
Z X C (by key position) or the arrow keys draw, and 5, S or Backspace undo. Enter goes
to the next puzzle, R retries and Esc goes back. Menus can also be clicked, and the
mouse wheel scrolls long lists.

On a touch screen, a 3×3 pad laid out like the numpad (with Undo in the middle) appears
below the board, or beside it in landscape. You can also swipe anywhere off the pad:
each swipe of about half a grid cell moves the pen one step in that direction (8
directions), so you can draw several steps in one stroke. Lists scroll by dragging, and
the < button in the top left corner goes back.

## Development

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
cd Web
npm install
npm run dev       # local server with live reload, prints the URL
npm test          # the game-logic tests (ported from tests/test_symmetro.py)
npm run build     # type-check and build the site into dist/
npm run preview   # serve dist/ locally
```

To try it on a phone, run `npm run dev -- --host` and open the printed network address
on a phone on the same Wi-Fi.

## Deploying to AWS

The S3 bucket and CloudFront distribution are set up as described in `aws-setup.txt` (your local notes in the repo root; not committed).
Then:

```sh
cp deploy.env.example deploy.env   # once; fill in the bucket and distribution ID
aws sso login --profile symmetro
./deploy.sh --dry-run              # shows what would change
./deploy.sh
```

`deploy.sh` runs the tests, builds, uploads `dist/` to `s3://<bucket>/games/Symmetro/`
and invalidates that path in CloudFront. The hashed files in `assets/` are cached for a
year, and `index.html` is always re-checked, so players get a new version right away.
