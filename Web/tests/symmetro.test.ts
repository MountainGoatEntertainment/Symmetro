// Ported from tests/test_symmetro.py, so both versions follow the same rules.
import { describe, expect, it } from "vitest";
import { GameEvent, Round } from "../src/game";
import { MODES, Shape, buildLayout, crossingDiagonal, minMoves, pointKey } from "../src/geometry";
import { DIFFICULTIES, DIFFICULTY_NAMES, loadLevels, randomShape, seededRng } from "../src/levels";
import { type KeyValueStore, STORAGE_KEY, Scores, percent } from "../src/scores";

const ARCH = Shape.fromMoves("88963224884224");

function play(round: Round, moves: string): GameEvent {
  let result = GameEvent.None;
  for (const ch of moves) result = round.move(Number(ch));
  return result;
}

it("arch matches picture", () => {
  expect(ARCH.segments.size).toBe(14);
  expect(ARCH.bbox()).toEqual([0, -3, 3, 0]);
});

it("mirror_v start matches picture", () => {
  const lay = buildLayout("mirror_v", ARCH);
  expect(lay.axes[0][0][0]).toBe(5);
  expect(lay.copies[0].start[0]).toBe(2 * 5 - lay.original.start[0]);
});

describe.each(MODES)("layout %s", (mode) => {
  it("fits and does not touch guides", () => {
    const lay = buildLayout(mode, ARCH);
    const shapes = [lay.original, ...lay.copies];
    for (const shape of shapes) {
      const [x0, y0, x1, y1] = shape.bbox();
      expect(x0 >= 0 && x1 <= lay.gridW && y0 >= 0 && y1 <= lay.gridH).toBe(true);
      expect(shape.segments.size).toBe(ARCH.segments.size);
    }
    const pts = shapes.map((s) => new Set(s.points().map(pointKey)));
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) expect([...pts[i]].some((p) => pts[j].has(p))).toBe(false);
  });
});

it("mirror round and retracing", () => {
  const r = new Round(buildLayout("mirror_v", ARCH));
  expect(play(r, "88741226886226")).toBe(GameEvent.RoundDone);
  expect(r.finished).toBe(true);
});

it("any route counts", () => {
  const r = new Round(buildLayout("copy", Shape.fromMoves("66")));
  expect(play(r, "6")).toBe(GameEvent.Moved);
  expect(play(r, "4")).toBe(GameEvent.Moved);
  expect(r.drawn[0].size).toBe(1);
});

it("undo and wrong lines", () => {
  const r = new Round(buildLayout("copy", Shape.fromMoves("66")));
  play(r, "6");
  play(r, "8");
  expect(r.undo()).toBe(GameEvent.Moved);
  expect(r.undos).toBe(1);
  expect(play(r, "6")).toBe(GameEvent.RoundDone);
  expect([r.moves, r.minimum]).toEqual([4, 2]);
  expect(r.ratio).toBe(0.5);
});

it("quad advances through three copies", () => {
  const r = new Round(buildLayout("quad", Shape.fromMoves("6")));
  expect(play(r, "4")).toBe(GameEvent.CopyDone);
  expect(play(r, "4")).toBe(GameEvent.CopyDone);
  expect(r.undo()).toBe(GameEvent.None);
  expect(play(r, "6")).toBe(GameEvent.RoundDone);
});

it("cannot leave grid", () => {
  const r = new Round(buildLayout("copy", Shape.fromMoves("6")));
  r.pen = [0, 0];
  expect(r.move(7)).toBe(GameEvent.None);
});

it("levels load", () => {
  const levels = loadLevels();
  expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length);
  for (const lv of levels) buildLayout(lv.mode, lv.shape);
});

describe.each(DIFFICULTY_NAMES)("random shapes %s", (difficulty) => {
  it("are big enough and never cross diagonals", () => {
    const rng = seededRng(1);
    for (let i = 0; i < 50; i++) {
      const shape = randomShape(difficulty, rng);
      expect(shape.segments.size).toBeGreaterThanOrEqual(DIFFICULTIES[difficulty][2]);
      for (const s of shape.segments) {
        const c = crossingDiagonal(s);
        expect(c !== null && shape.segments.has(c)).toBe(false);
      }
    }
  });
});

it.each([
  ["66", 2],
  ["64", 1],
  ["6262", 4],
  ["6448", 4],
  ["6446822", 7],
])("min moves %s = %i", (moves, expected) => {
  expect(minMoves(Shape.fromMoves(moves))).toBe(expected);
});

it("round minimum covers every copy", () => {
  const r = new Round(buildLayout("quad", Shape.fromMoves("66")));
  expect(r.minimum).toBe(6);
  expect(play(r, "44")).toBe(GameEvent.CopyDone);
});

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

it("scores rank by ratio then time", () => {
  const store = new MemoryStore();
  const s = new Scores(store);
  expect(s.record("k", 25, 20, 5.0, 0)).toBe(1);
  expect(s.record("k", 20, 20, 9.0, 0)).toBe(1);
  expect(s.record("k", 20, 20, 7.0, 0)).toBe(1);
  expect(s.record("k", 40, 20, 1.0, 0)).toBe(4);
  // read back from storage, not the cache
  expect(new Scores(store).load().k.map((e) => e.percent)).toEqual([100, 100, 80, 50]);
  expect(percent(250, 251)).toBe(99);
});

it("scores keep five and survive bad storage", () => {
  const store = new MemoryStore();
  store.setItem(STORAGE_KEY, "not json");
  const s = new Scores(store);
  expect(s.load()).toEqual({});
  for (let i = 0; i < 6; i++) s.record("k", 20, 20, i, 0);
  expect(s.record("k", 40, 20, 1, 0)).toBeNull();
  expect(s.load().k).toHaveLength(5);
  expect(new Scores(null).record("k", 20, 20, 1, 0)).toBe(1);
});

// Grid size and minimum moves per level, as computed by the Python game.
// If levels.json changes, regenerate with:
//   uv run python -c "from symmetro.levels import load_levels; from symmetro.geometry import build_layout; from symmetro.game import Round
//   [print(lv.id, (l:=build_layout(lv.mode, lv.shape)).grid_w, l.grid_h, Round(l).minimum) for lv in load_levels()]"
const PYTHON_REFERENCE = `
corner 8 5 5
square 8 4 8
arch-copy 10 5 14
flag 8 6 8
arch-mirror 10 5 14
stairs 5 10 11
arrow 4 10 6
kite 6 10 15
arch-quad 10 10 42
boot 8 8 9
tee 8 8 6
hook 10 6 7
pinwheel 8 8 18
crown 12 8 36
arch-spin 10 10 42
plane 20 9 37
symmetro 15 12 51
`;

it("levels match the Python game", () => {
  const actual = loadLevels().map((lv) => {
    const l = buildLayout(lv.mode, lv.shape);
    return `${lv.id} ${l.gridW} ${l.gridH} ${new Round(l).minimum}`;
  });
  expect(actual).toEqual(PYTHON_REFERENCE.trim().split("\n"));
});
