"""Hand-made levels (levels.json) and the random shape generator."""

from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass
from pathlib import Path

from .geometry import DIRECTIONS, MODES, Segment, Shape, crossing_diagonal, seg, step


@dataclass(frozen=True)
class Level:
    id: str
    name: str
    mode: str
    shape: Shape


LEVELS_PATH = Path(__file__).with_name("levels.json")


def load_levels(path: Path = LEVELS_PATH) -> list[Level]:
    data = json.loads(path.read_text())
    levels = []
    for item in data["levels"]:
        if item["mode"] not in MODES:
            raise ValueError(f"level {item['id']}: unknown mode {item['mode']!r}")
        levels.append(Level(item["id"], item["name"], item["mode"], Shape.from_moves(item["moves"])))
    return levels


def save_level(name: str, mode: str, moves: str, path: Path = LEVELS_PATH) -> str:
    """Append a level to levels.json and return its new id."""
    if mode not in MODES:
        raise ValueError(f"unknown mode: {mode!r}")
    data = json.loads(path.read_text())
    ids = {item["id"] for item in data["levels"]}
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "level"
    level_id, n = base, 2
    while level_id in ids:
        level_id, n = f"{base}-{n}", n + 1
    data["levels"].append({"id": level_id, "name": name, "mode": mode, "moves": moves})
    # one level per line keeps the file easy to read and edit by hand
    lines = [json.dumps(item, ensure_ascii=False) for item in data["levels"]]
    header = {k: v for k, v in data.items() if k != "levels"}
    body = "".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n" for k, v in header.items())
    body += '  "levels": [\n    ' + ",\n    ".join(lines) + "\n  ]\n"
    path.write_text("{\n" + body + "}\n")
    return level_id


# name -> (box width, box height, number of segments)
DIFFICULTIES: dict[str, tuple[int, int, int]] = {
    "Easy": (3, 3, 6),
    "Medium": (4, 4, 10),
    "Hard": (5, 4, 15),
}


def random_shape(difficulty: str, rng: random.Random | None = None) -> Shape:
    """Random walk inside a box, preferring new segments, never crossing diagonals."""
    rng = rng or random.Random()
    w, h, n = DIFFICULTIES[difficulty]
    for _ in range(500):
        start = (rng.randint(0, w), rng.randint(0, h))
        pos = start
        segments: set[Segment] = set()
        for _ in range(n * 8):
            if len(segments) >= n:
                break
            options, weights = [], []
            for d in DIRECTIONS:
                nxt = step(pos, d)
                if not (0 <= nxt[0] <= w and 0 <= nxt[1] <= h):
                    continue
                s = seg(pos, nxt)
                if crossing_diagonal(s) in segments:
                    continue
                options.append(nxt)
                weights.append(1 if s in segments else 6)
            if not options:
                break
            nxt = rng.choices(options, weights)[0]
            segments.add(seg(pos, nxt))
            pos = nxt
        shape = Shape(start, frozenset(segments))
        x0, y0, x1, y1 = shape.bbox()
        if len(segments) >= n and x1 - x0 >= 2 and y1 - y0 >= 2:
            return shape
    raise RuntimeError("could not generate a shape")
