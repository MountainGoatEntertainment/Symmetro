/** Hand-made levels (levels.json, copied from the Python game) and the random shape generator. */

import { DIRECTIONS, type Mode, type Point, SegmentSet, Shape, crossingDiagonal, isMode, seg, step } from "./geometry";
import levelData from "./levels.json";

export interface Level {
  readonly id: string;
  readonly name: string;
  readonly mode: Mode;
  readonly shape: Shape;
}

interface LevelItem {
  id: string;
  name: string;
  mode: string;
  moves: string;
}

export function parseLevels(data: { levels: LevelItem[] }): Level[] {
  return data.levels.map((item) => {
    if (!isMode(item.mode)) throw new Error(`level ${item.id}: unknown mode ${JSON.stringify(item.mode)}`);
    return { id: item.id, name: item.name, mode: item.mode, shape: Shape.fromMoves(item.moves) };
  });
}

export function loadLevels(): Level[] {
  return parseLevels(levelData);
}

/** name -> box width, box height, number of segments */
export const DIFFICULTIES = {
  Easy: [3, 3, 6],
  Medium: [4, 4, 10],
  Hard: [5, 4, 15],
} as const satisfies Record<string, readonly [number, number, number]>;
export type Difficulty = keyof typeof DIFFICULTIES;
export const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as Difficulty[];

/** A random number in [0, 1), like Math.random. */
export type Rng = () => number;

/** A small seeded generator, for repeatable tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randint(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function weightedChoice<T>(rng: Rng, options: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r < 0) return options[i];
  }
  return options[options.length - 1];
}

/** Random walk inside a box, preferring new segments, never crossing diagonals. */
export function randomShape(difficulty: Difficulty, rng: Rng = Math.random): Shape {
  const [w, h, n] = DIFFICULTIES[difficulty];
  for (let attempt = 0; attempt < 500; attempt++) {
    const start: Point = [randint(rng, 0, w), randint(rng, 0, h)];
    let pos = start;
    const segments = new SegmentSet();
    for (let i = 0; i < n * 8; i++) {
      if (segments.size >= n) break;
      const options: Point[] = [];
      const weights: number[] = [];
      for (const d of DIRECTIONS.keys()) {
        const nxt = step(pos, d);
        if (!(nxt[0] >= 0 && nxt[0] <= w && nxt[1] >= 0 && nxt[1] <= h)) continue;
        const s = seg(pos, nxt);
        const cross = crossingDiagonal(s);
        if (cross && segments.has(cross)) continue;
        options.push(nxt);
        weights.push(segments.has(s) ? 1 : 6);
      }
      if (!options.length) break;
      const nxt = weightedChoice(rng, options, weights);
      segments.add(seg(pos, nxt));
      pos = nxt;
    }
    const shape = new Shape(start, segments);
    const [x0, y0, x1, y1] = shape.bbox();
    if (segments.size >= n && x1 - x0 >= 2 && y1 - y0 >= 2) return shape;
  }
  throw new Error("could not generate a shape");
}
