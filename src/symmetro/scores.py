"""Best results, saved as JSON in the user's home directory.

A result is scored by moves: the fewest moves the drawing can take, divided by the
moves the player used (undos count as moves). Time only breaks ties.
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

KEEP = 5


def scores_path() -> Path:
    override = os.environ.get("SYMMETRO_SCORES")
    return Path(override) if override else Path.home() / ".symmetro" / "scores.json"


def percent(minimum: int, moves: int) -> int:
    """Score as a whole percentage; 100 only for a perfect round."""
    if moves <= minimum:
        return 100
    return min(99, round(100 * minimum / moves))


def _sort_key(e: dict) -> tuple[float, float]:
    return (-e["min"] / max(e["moves"], e["min"], 1), e["time"])


def _retire_old_file(path: Path, data: dict) -> bool:
    """Scores saved before move scoring only have times. Keep them aside and start over."""
    old = any("moves" not in e for entries in data.values() for e in entries)
    if old:
        path.replace(path.with_name(f"{path.stem}-times{path.suffix}"))
    return old


def load() -> dict[str, list[dict]]:
    path = scores_path()
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict) or _retire_old_file(path, data):
        return {}
    return data


def best(key: str) -> dict | None:
    entries = load().get(key)
    return entries[0] if entries else None


def record(key: str, moves: int, minimum: int, seconds: float, undos: int) -> int | None:
    """Store a result; return its rank (1 = new best) or None if it didn't make the list."""
    data = load()
    entries = data.setdefault(key, [])
    entry = {
        "percent": percent(minimum, moves),
        "moves": moves,
        "min": minimum,
        "time": round(seconds, 2),
        "undos": undos,
        "date": date.today().isoformat(),
    }
    entries.append(entry)
    entries.sort(key=_sort_key)
    del entries[KEEP:]
    path = scores_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))
    for i, e in enumerate(entries):
        if e is entry:
            return i + 1
    return None
