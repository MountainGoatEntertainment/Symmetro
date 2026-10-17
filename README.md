# Symmetro

Copy geometric shapes on a grid as fast as you can, sometimes mirrored or rotated.

```sh
uv run symmetro
```

## How to play

The green shape is the original. Its pink dot shows where the original starts.
Your pen is the green dot. Draw the copy one grid step at a time:

| Numpad | Letters (by key position) | Direction |
|--------|---------------------------|-----------|
| 7 8 9  | Q W E                     | ↖ ↑ ↗     |
| 4 5 6  | A S D                     | ← undo →  |
| 1 2 3  | Z X C                     | ↙ ↓ ↘     |

The arrow keys and Backspace work too.

- Wrong lines are drawn just like right ones. Undo (5 / S) takes back your last pen move.
- Moving along a line you already drew only moves the pen, so you can reach branches.
- A copy is done as soon as your lines exactly match the target. The pen then jumps
  to the next pink dot.
- The clock runs until every copy is done. Your five best times per level are saved in
  `~/.symmetro/scores.json` (you can change the path with `SYMMETRO_SCORES`).

Modes: copy, vertical mirror, horizontal mirror, two axes (3 copies), diagonal mirror,
rotate 180° and rotate 90° (3 copies).

## Designing levels

```sh
uv run symmetro-editor
```

Move the cursor with the drawing keys, press **Space** to put the pen down, then draw
with the same keys as in the game (5 / S undoes a step). **N** starts a new drawing.
Press **Enter**, then type a name, choose the mode with Left/Right (a preview of the
finished puzzle is shown), and press **Enter** again. The level is added to the end of
`src/symmetro/levels.json`.

You can also edit `src/symmetro/levels.json` by hand. A shape is written as numpad moves from its start point:

```json
{"id": "arch-mirror", "name": "Arch mirror", "mode": "mirror_v", "moves": "88963224884224"}
```

The game builds the grid around the shape automatically. `Random shape` in the menu
makes new shapes for any mode at three difficulty levels.

## Development

```sh
uv run pytest
```
