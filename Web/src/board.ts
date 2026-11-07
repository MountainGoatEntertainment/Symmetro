/** A grid fitted into a screen rectangle, with helpers to draw on it. */

import { AXIS, BORDER, GRID, INK, PAPER, type Rect } from "./app";
import type { Layout, Point, Segment } from "./geometry";

export class Board {
  readonly cell: number;
  readonly ox: number;
  readonly oy: number;
  readonly rect: Rect;
  readonly lineW: number;
  readonly dotR: number;

  constructor(
    readonly gridW: number,
    readonly gridH: number,
    area: Rect,
    maxCell = 72,
  ) {
    this.cell = Math.max(1, Math.min(area.w / gridW, area.h / gridH, maxCell));
    const gw = this.cell * gridW;
    const gh = this.cell * gridH;
    this.ox = Math.round(area.x + area.w / 2 - gw / 2);
    this.oy = Math.round(area.y + area.h / 2 - gh / 2);
    this.rect = { x: this.ox, y: this.oy, w: gw, h: gh };
    this.lineW = Math.max(3, Math.round(this.cell / 12));
    this.dotR = Math.max(6, this.cell / 7);
  }

  px(p: readonly [number, number]): [number, number] {
    return [this.ox + p[0] * this.cell, this.oy + p[1] * this.cell];
  }

  private line(ctx: CanvasRenderingContext2D, a: readonly [number, number], b: readonly [number, number]): void {
    const [ax, ay] = this.px(a);
    const [bx, by] = this.px(b);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }

  private circle(ctx: CanvasRenderingContext2D, p: readonly [number, number], r: number, color: string): void {
    const [x, y] = this.px(p);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawPaper(
    ctx: CanvasRenderingContext2D,
    axes: Layout["axes"] = [],
    centre: Layout["centre"] = null,
    paper = PAPER,
  ): void {
    const r = this.rect;
    ctx.fillStyle = paper;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.beginPath();
    for (let x = 0; x <= this.gridW; x++) this.line(ctx, [x, 0], [x, this.gridH]);
    for (let y = 0; y <= this.gridH; y++) this.line(ctx, [0, y], [this.gridW, y]);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    ctx.stroke();

    if (axes.length) {
      ctx.beginPath();
      for (const [a, b] of axes) this.line(ctx, a, b);
      ctx.strokeStyle = AXIS;
      ctx.lineWidth = Math.max(4, Math.round(this.cell / 7));
      ctx.stroke();
    }
    if (centre) this.circle(ctx, centre, Math.max(6, this.cell / 6), AXIS);

    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
  }

  drawSegments(ctx: CanvasRenderingContext2D, segments: Iterable<Segment>, color: string): void {
    ctx.beginPath();
    for (const [a, b] of segments) this.line(ctx, a, b);
    ctx.strokeStyle = color;
    ctx.lineWidth = this.lineW;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  drawDot(ctx: CanvasRenderingContext2D, p: Point, color: string, pen = false): void {
    if (pen) {
      this.circle(ctx, p, this.dotR * 1.15, color);
      const [x, y] = this.px(p);
      ctx.beginPath();
      ctx.arc(x, y, this.dotR * 1.15 - 1, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      this.circle(ctx, p, this.dotR, color);
    }
  }
}
