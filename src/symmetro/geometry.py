"""Grid geometry: points, segments, shapes and the symmetry layouts.

Coordinates are integer grid points with x growing to the right and
y growing *downwards* (screen convention).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

Point = tuple[int, int]
Segment = tuple[Point, Point]  # always stored with the smaller point first
Transform = Callable[[Point], Point]

# Numpad layout: 7 8 9 / 4 5 6 / 1 2 3  (5 is undo, not a direction)
DIRECTIONS: dict[int, Point] = {
    7: (-1, -1), 8: (0, -1), 9: (1, -1),
    4: (-1, 0),              6: (1, 0),
    1: (-1, 1),  2: (0, 1),  3: (1, 1),
}

MODES = ("copy", "mirror_v", "mirror_h", "quad", "diagonal", "rot180", "rot90")

MODE_DESCRIPTIONS = {
    "copy": "Copy the shape",
    "mirror_v": "Mirror it across the vertical axis",
    "mirror_h": "Mirror it across the horizontal axis",
    "quad": "Mirror it across both axes (3 copies)",
    "diagonal": "Mirror it across the diagonal",
    "rot180": "Rotate it 180° around the centre",
    "rot90": "Rotate it in 90° steps around the centre (3 copies)",
}

MODE_NAMES = {
    "copy": "Copy",
    "mirror_v": "Vertical mirror",
    "mirror_h": "Horizontal mirror",
    "quad": "Two axes",
    "diagonal": "Diagonal mirror",
    "rot180": "Rotate 180°",
    "rot90": "Rotate 90°",
}


def seg(a: Point, b: Point) -> Segment:
    return (a, b) if a <= b else (b, a)


def step(p: Point, direction: int) -> Point:
    dx, dy = DIRECTIONS[direction]
    return (p[0] + dx, p[1] + dy)


def crossing_diagonal(s: Segment) -> Segment | None:
    """For a diagonal segment, return the other diagonal of the same cell."""
    (ax, ay), (bx, by) = s
    if ax == bx or ay == by:
        return None
    cx, cy = min(ax, bx), min(ay, by)
    d1 = seg((cx, cy), (cx + 1, cy + 1))
    d2 = seg((cx, cy + 1), (cx + 1, cy))
    return d2 if s == d1 else d1


@dataclass(frozen=True)
class Shape:
    start: Point
    segments: frozenset[Segment]

    @classmethod
    def from_moves(cls, moves: str, start: Point = (0, 0)) -> Shape:
        """Build a shape by walking numpad digits from ``start``.

        Walking over an existing segment simply moves the pen, so any
        connected shape can be written as one string.
        """
        pos = start
        segments: set[Segment] = set()
        for ch in moves:
            if ch.isspace():
                continue
            nxt = step(pos, int(ch))
            segments.add(seg(pos, nxt))
            pos = nxt
        return cls(start, frozenset(segments))

    def points(self) -> set[Point]:
        pts = {self.start}
        for a, b in self.segments:
            pts.add(a)
            pts.add(b)
        return pts

    def bbox(self) -> tuple[int, int, int, int]:
        pts = self.points()
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)

    def map(self, f: Transform) -> Shape:
        return Shape(f(self.start), frozenset(seg(f(a), f(b)) for a, b in self.segments))

    def translated(self, dx: int, dy: int) -> Shape:
        return self.map(lambda p: (p[0] + dx, p[1] + dy))

    def normalized(self) -> Shape:
        x0, y0, _, _ = self.bbox()
        return self.translated(-x0, -y0)


@dataclass(frozen=True)
class Layout:
    """A complete puzzle: grid size, the original, the copies to draw and guides."""

    mode: str
    grid_w: int
    grid_h: int
    original: Shape
    copies: tuple[Shape, ...]
    axes: tuple[tuple[Point, Point], ...]
    centre: tuple[float, float] | None = None


def build_layout(mode: str, shape: Shape, margin: int = 1) -> Layout:
    shape = shape.normalized()
    _, _, w, h = shape.bbox()
    m = margin
    W, H = w + 2 * m, h + 2 * m
    orig = shape.translated(m, m)

    if mode == "copy":
        return Layout(mode, 2 * W, H, orig, (orig.translated(W, 0),), ())
    if mode == "mirror_v":
        f = lambda p: (2 * W - p[0], p[1])
        return Layout(mode, 2 * W, H, orig, (orig.map(f),), (((W, 0), (W, H)),))
    if mode == "mirror_h":
        f = lambda p: (p[0], 2 * H - p[1])
        return Layout(mode, W, 2 * H, orig, (orig.map(f),), (((0, H), (W, H)),))
    if mode == "quad":
        fs = (
            lambda p: (2 * W - p[0], p[1]),          # top right
            lambda p: (2 * W - p[0], 2 * H - p[1]),  # bottom right
            lambda p: (p[0], 2 * H - p[1]),          # bottom left
        )
        axes = (((W, 0), (W, 2 * H)), ((0, H), (2 * W, H)))
        return Layout(mode, 2 * W, 2 * H, orig, tuple(orig.map(f) for f in fs), axes)
    if mode == "diagonal":
        # Original sits strictly below the y = x diagonal, copy above it.
        n = w + h + 1 + 2 * m
        orig = shape.translated(m, m + w + 1)
        f = lambda p: (p[1], p[0])
        return Layout(mode, n, n, orig, (orig.map(f),), (((0, 0), (n, n)),))
    if mode == "rot180":
        f = lambda p: (2 * W - p[0], H - p[1])
        return Layout(mode, 2 * W, H, orig, (orig.map(f),), (), (W, H / 2))
    if mode == "rot90":
        c = max(w, h) + 2 * m
        fs = (
            lambda p: (2 * c - p[1], p[0]),          # 90 deg clockwise
            lambda p: (2 * c - p[0], 2 * c - p[1]),  # 180 deg
            lambda p: (p[1], 2 * c - p[0]),          # 270 deg
        )
        return Layout(mode, 2 * c, 2 * c, orig, tuple(orig.map(f) for f in fs), (), (c, c))
    raise ValueError(f"unknown mode: {mode!r}")
