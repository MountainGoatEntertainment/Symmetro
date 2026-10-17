"""Best times, saved as JSON in the user's home directory."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

KEEP = 5


def scores_path() -> Path:
    override = os.environ.get("SYMMETRO_SCORES")
    return Path(override) if override else Path.home() / ".symmetro" / "scores.json"


def load() -> dict[str, list[dict]]:
    try:
        return json.loads(scores_path().read_text())
    except (OSError, ValueError):
        return {}


def best(key: str) -> dict | None:
    entries = load().get(key)
    return entries[0] if entries else None


def record(key: str, seconds: float, undos: int) -> int | None:
    """Store a result; return its rank (1 = new best) or None if it didn't make the list."""
    data = load()
    entries = data.setdefault(key, [])
    entry = {"time": round(seconds, 2), "undos": undos, "date": date.today().isoformat()}
    entries.append(entry)
    entries.sort(key=lambda e: (e["time"], e["undos"]))
    del entries[KEEP:]
    path = scores_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))
    for i, e in enumerate(entries):
        if e is entry:
            return i + 1
    return None
