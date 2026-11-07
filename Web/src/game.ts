/** Game rules, independent of any rendering. */

import { type Layout, type Point, type Segment, SegmentSet, minMoves, seg, step } from "./geometry";

export enum GameEvent {
  /** Key had no effect (e.g. off the grid, nothing to undo). */
  None,
  Moved,
  CopyDone,
  RoundDone,
}

export class Round {
  copyIndex = 0;
  pen: Point;
  readonly drawn: SegmentSet[];
  private history: { prev: Point; added: Segment | null }[] = [];
  /** Every pen move and every undo counts. */
  moves = 0;
  undos = 0;
  /** Fewest moves that finish the round. */
  readonly minimum: number;

  constructor(readonly layout: Layout) {
    this.drawn = layout.copies.map(() => new SegmentSet());
    this.pen = layout.copies[0].start;
    // All copies are the same shape moved around, so each needs the same number.
    this.minimum = minMoves(layout.original) * layout.copies.length;
  }

  get finished(): boolean {
    return this.copyIndex >= this.layout.copies.length;
  }

  /** Minimum moves divided by moves used: 1.0 is a perfect round. */
  get ratio(): number {
    return this.minimum / Math.max(this.moves, this.minimum, 1);
  }

  get target(): SegmentSet {
    return this.layout.copies[this.copyIndex].segments;
  }

  move(direction: number): GameEvent {
    if (this.finished) return GameEvent.None;
    const nxt = step(this.pen, direction);
    if (!(nxt[0] >= 0 && nxt[0] <= this.layout.gridW && nxt[1] >= 0 && nxt[1] <= this.layout.gridH)) {
      return GameEvent.None;
    }
    const s = seg(this.pen, nxt);
    const current = this.drawn[this.copyIndex];
    const added = current.has(s) ? null : s;
    if (added) current.add(added);
    this.history.push({ prev: this.pen, added });
    this.pen = nxt;
    this.moves += 1;
    if (current.equals(this.target)) return this.completeCopy();
    return GameEvent.Moved;
  }

  undo(): GameEvent {
    const last = this.finished ? undefined : this.history.pop();
    if (!last) return GameEvent.None;
    if (last.added) this.drawn[this.copyIndex].delete(last.added);
    this.pen = last.prev;
    this.moves += 1;
    this.undos += 1;
    return GameEvent.Moved;
  }

  private completeCopy(): GameEvent {
    this.history = [];
    this.copyIndex += 1;
    if (this.finished) return GameEvent.RoundDone;
    this.pen = this.layout.copies[this.copyIndex].start;
    return GameEvent.CopyDone;
  }
}
