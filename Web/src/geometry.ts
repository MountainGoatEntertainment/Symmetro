/**
 * Grid geometry: points, segments, shapes and the symmetry layouts.
 *
 * Coordinates are integer grid points with x growing to the right and
 * y growing *downwards* (screen convention).
 */

export type Point = readonly [number, number];
/** Always stored with the smaller point first. */
export type Segment = readonly [Point, Point];
export type Transform = (p: Point) => Point;

/** Numpad layout: 7 8 9 / 4 5 6 / 1 2 3  (5 is undo, not a direction). */
export const DIRECTIONS: ReadonlyMap<number, Point> = new Map<number, Point>([
  [7, [-1, -1]], [8, [0, -1]], [9, [1, -1]],
  [4, [-1, 0]], [6, [1, 0]],
  [1, [-1, 1]], [2, [0, 1]], [3, [1, 1]],
]);

export const MODES = ["copy", "mirror_v", "mirror_h", "quad", "diagonal", "rot180", "rot90"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  copy: "Copy the shape",
  mirror_v: "Mirror it across the vertical axis",
  mirror_h: "Mirror it across the horizontal axis",
  quad: "Mirror it across both axes (3 copies)",
  diagonal: "Mirror it across the diagonal",
  rot180: "Rotate it 180° around the centre",
  rot90: "Rotate it in 90° steps around the centre (3 copies)",
};

export const MODE_NAMES: Record<Mode, string> = {
  copy: "Copy",
  mirror_v: "Vertical mirror",
  mirror_h: "Horizontal mirror",
  quad: "Two axes",
  diagonal: "Diagonal mirror",
  rot180: "Rotate 180°",
  rot90: "Rotate 90°",
};

export function isMode(s: string): s is Mode {
  return (MODES as readonly string[]).includes(s);
}

function lessOrEqual(a: Point, b: Point): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
}

export function seg(a: Point, b: Point): Segment {
  return lessOrEqual(a, b) ? [a, b] : [b, a];
}

export function pointKey(p: Point): string {
  return `${p[0]},${p[1]}`;
}

export function segKey(s: Segment): string {
  return `${s[0][0]},${s[0][1]},${s[1][0]},${s[1][1]}`;
}

export function samePoint(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function step(p: Point, direction: number): Point {
  const d = DIRECTIONS.get(direction);
  if (!d) throw new Error(`unknown direction: ${direction}`);
  return [p[0] + d[0], p[1] + d[1]];
}

/** For a diagonal segment, return the other diagonal of the same cell. */
export function crossingDiagonal(s: Segment): Segment | null {
  const [[ax, ay], [bx, by]] = s;
  if (ax === bx || ay === by) return null;
  const cx = Math.min(ax, bx);
  const cy = Math.min(ay, by);
  const d1 = seg([cx, cy], [cx + 1, cy + 1]);
  const d2 = seg([cx, cy + 1], [cx + 1, cy]);
  return segKey(s) === segKey(d1) ? d2 : d1;
}

/** A set of segments compared by value. */
export class SegmentSet implements Iterable<Segment> {
  private readonly items = new Map<string, Segment>();

  constructor(segments: Iterable<Segment> = []) {
    for (const s of segments) this.add(s);
  }

  get size(): number {
    return this.items.size;
  }

  has(s: Segment): boolean {
    return this.items.has(segKey(s));
  }

  add(s: Segment): void {
    this.items.set(segKey(s), s);
  }

  delete(s: Segment): void {
    this.items.delete(segKey(s));
  }

  equals(other: SegmentSet): boolean {
    if (other.size !== this.size) return false;
    for (const key of this.items.keys()) if (!other.items.has(key)) return false;
    return true;
  }

  [Symbol.iterator](): Iterator<Segment> {
    return this.items.values();
  }
}

export class Shape {
  constructor(
    readonly start: Point,
    readonly segments: SegmentSet,
  ) {}

  /**
   * Build a shape by walking numpad digits from `start`.
   *
   * Walking over an existing segment simply moves the pen, so any
   * connected shape can be written as one string.
   */
  static fromMoves(moves: string, start: Point = [0, 0]): Shape {
    let pos = start;
    const segments = new SegmentSet();
    for (const ch of moves) {
      if (/\s/.test(ch)) continue;
      const nxt = step(pos, Number(ch));
      segments.add(seg(pos, nxt));
      pos = nxt;
    }
    return new Shape(start, segments);
  }

  points(): Point[] {
    const pts = new Map<string, Point>([[pointKey(this.start), this.start]]);
    for (const [a, b] of this.segments) {
      pts.set(pointKey(a), a);
      pts.set(pointKey(b), b);
    }
    return [...pts.values()];
  }

  bbox(): [number, number, number, number] {
    const pts = this.points();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  map(f: Transform): Shape {
    const segments = new SegmentSet();
    for (const [a, b] of this.segments) segments.add(seg(f(a), f(b)));
    return new Shape(f(this.start), segments);
  }

  translated(dx: number, dy: number): Shape {
    return this.map((p) => [p[0] + dx, p[1] + dy]);
  }

  normalized(): Shape {
    const [x0, y0] = this.bbox();
    return this.translated(-x0, -y0);
  }

  equals(other: Shape): boolean {
    return samePoint(this.start, other.start) && this.segments.equals(other.segments);
  }
}

/** A complete puzzle: grid size, the original, the copies to draw and guides. */
export interface Layout {
  readonly mode: Mode;
  readonly gridW: number;
  readonly gridH: number;
  readonly original: Shape;
  readonly copies: readonly Shape[];
  readonly axes: readonly (readonly [Point, Point])[];
  readonly centre: readonly [number, number] | null;
}

export function buildLayout(mode: Mode, shape: Shape, margin = 1): Layout {
  shape = shape.normalized();
  const [, , w, h] = shape.bbox();
  const m = margin;
  const W = w + 2 * m;
  const H = h + 2 * m;
  let orig = shape.translated(m, m);

  switch (mode) {
    case "copy":
      return { mode, gridW: 2 * W, gridH: H, original: orig, copies: [orig.translated(W, 0)], axes: [], centre: null };
    case "mirror_v": {
      const f: Transform = (p) => [2 * W - p[0], p[1]];
      return { mode, gridW: 2 * W, gridH: H, original: orig, copies: [orig.map(f)], axes: [[[W, 0], [W, H]]], centre: null };
    }
    case "mirror_h": {
      const f: Transform = (p) => [p[0], 2 * H - p[1]];
      return { mode, gridW: W, gridH: 2 * H, original: orig, copies: [orig.map(f)], axes: [[[0, H], [W, H]]], centre: null };
    }
    case "quad": {
      const fs: Transform[] = [
        (p) => [2 * W - p[0], p[1]], // top right
        (p) => [2 * W - p[0], 2 * H - p[1]], // bottom right
        (p) => [p[0], 2 * H - p[1]], // bottom left
      ];
      const axes: [Point, Point][] = [
        [[W, 0], [W, 2 * H]],
        [[0, H], [2 * W, H]],
      ];
      return { mode, gridW: 2 * W, gridH: 2 * H, original: orig, copies: fs.map((f) => orig.map(f)), axes, centre: null };
    }
    case "diagonal": {
      // Original sits strictly below the y = x diagonal, copy above it.
      const n = w + h + 1 + 2 * m;
      orig = shape.translated(m, m + w + 1);
      const f: Transform = (p) => [p[1], p[0]];
      return { mode, gridW: n, gridH: n, original: orig, copies: [orig.map(f)], axes: [[[0, 0], [n, n]]], centre: null };
    }
    case "rot180": {
      const f: Transform = (p) => [2 * W - p[0], H - p[1]];
      return { mode, gridW: 2 * W, gridH: H, original: orig, copies: [orig.map(f)], axes: [], centre: [W, H / 2] };
    }
    case "rot90": {
      const c = Math.max(w, h) + 2 * m;
      const fs: Transform[] = [
        (p) => [2 * c - p[1], p[0]], // 90 deg clockwise
        (p) => [2 * c - p[0], 2 * c - p[1]], // 180 deg
        (p) => [p[1], 2 * c - p[0]], // 270 deg
      ];
      return { mode, gridW: 2 * c, gridH: 2 * c, original: orig, copies: fs.map((f) => orig.map(f)), axes: [], centre: [c, c] };
    }
  }
}

/**
 * Fewest pen moves that draw `shape` starting from its start point.
 *
 * Every segment is drawn once; where the shape branches, some segments have to be
 * walked again to reach the rest. This is the open Chinese postman problem with a
 * fixed start: the cheapest set of re-walks pairs up the odd-degree points (with the
 * start point flipped and a free end point added), each pair joined by its shortest
 * path along the shape. Leaving the shape would draw wrong lines, so paths stay on it.
 */
export function minMoves(shape: Shape): number {
  const neighbours = new Map<string, Point[]>();
  const link = (a: Point, b: Point) => {
    const k = pointKey(a);
    const list = neighbours.get(k);
    if (list) list.push(b);
    else neighbours.set(k, [b]);
  };
  for (const [a, b] of shape.segments) {
    link(a, b);
    link(b, a);
  }
  if (neighbours.size === 0) return 0;

  // odd-degree points, with the start point flipped; an odd number of points,
  // the free end makes it even
  const needKeys = new Set<string>();
  for (const [k, ns] of neighbours) if (ns.length % 2) needKeys.add(k);
  const startKey = pointKey(shape.start);
  if (needKeys.has(startKey)) needKeys.delete(startKey);
  else needKeys.add(startKey);
  const need = [...needKeys].sort();

  const distances = (src: string): Map<string, number> => {
    const dist = new Map<string, number>([[src, 0]]);
    let frontier = [src];
    while (frontier.length) {
      const nxt: string[] = [];
      for (const p of frontier) {
        for (const q of neighbours.get(p) ?? []) {
          const qk = pointKey(q);
          if (!dist.has(qk)) {
            dist.set(qk, dist.get(p)! + 1);
            nxt.push(qk);
          }
        }
      }
      frontier = nxt;
    }
    return dist;
  };

  const dist = need.map((p) => distances(p));
  const n = need.length;
  const memo = new Map<number, number>();

  /** Cheapest pairing of the points in bitmask `left`; one may be the free end. */
  const best = (left: number, endFree: boolean): number => {
    if (!left) return 0;
    const key = left * 2 + (endFree ? 1 : 0);
    const known = memo.get(key);
    if (known !== undefined) return known;
    const i = 31 - Math.clz32(left & -left);
    const rest = left & ~(1 << i);
    let result = Infinity;
    for (let j = i + 1; j < n; j++) {
      if ((rest >> j) & 1) {
        const d = dist[i].get(need[j]) ?? Infinity;
        result = Math.min(result, d + best(rest & ~(1 << j), endFree));
      }
    }
    if (endFree) result = Math.min(result, best(rest, false));
    memo.set(key, result);
    return result;
  };

  return shape.segments.size + best((1 << n) - 1, true);
}
