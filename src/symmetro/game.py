"""Game rules, independent of any rendering."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto

from .geometry import Layout, Point, Segment, seg, step


class Event(Enum):
    NONE = auto()       # key had no effect (e.g. off the grid, nothing to undo)
    MOVED = auto()
    COPY_DONE = auto()
    ROUND_DONE = auto()


@dataclass
class Round:
    layout: Layout
    copy_index: int = 0
    pen: Point = (0, 0)
    drawn: list[set[Segment]] = field(default_factory=list)
    history: list[tuple[Point, Segment | None]] = field(default_factory=list)
    moves: int = 0
    undos: int = 0

    def __post_init__(self) -> None:
        self.drawn = [set() for _ in self.layout.copies]
        self.pen = self.layout.copies[0].start

    @property
    def finished(self) -> bool:
        return self.copy_index >= len(self.layout.copies)

    @property
    def target(self) -> frozenset[Segment]:
        return self.layout.copies[self.copy_index].segments

    def move(self, direction: int) -> Event:
        if self.finished:
            return Event.NONE
        nxt = step(self.pen, direction)
        if not (0 <= nxt[0] <= self.layout.grid_w and 0 <= nxt[1] <= self.layout.grid_h):
            return Event.NONE
        s = seg(self.pen, nxt)
        current = self.drawn[self.copy_index]
        added = s if s not in current else None
        if added:
            current.add(added)
        self.history.append((self.pen, added))
        self.pen = nxt
        self.moves += 1
        if current == self.target:
            return self._complete_copy()
        return Event.MOVED

    def undo(self) -> Event:
        if self.finished or not self.history:
            return Event.NONE
        prev, added = self.history.pop()
        if added:
            self.drawn[self.copy_index].discard(added)
        self.pen = prev
        self.undos += 1
        return Event.MOVED

    def _complete_copy(self) -> Event:
        self.history.clear()
        self.copy_index += 1
        if self.finished:
            return Event.ROUND_DONE
        self.pen = self.layout.copies[self.copy_index].start
        return Event.COPY_DONE
