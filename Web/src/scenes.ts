/** Splash, menus, the board and the results, drawn on the canvas. */

import { type App, FLASH, GREEN, HILITE, MUTED, PAPER, PINK, type Pt, type Rect, Scene, TEXT, INK, inside } from "./app";
import splashUrl from "./assets/splash.png";
import { Board } from "./board";
import { GameEvent, Round } from "./game";
import { DIRECTIONS, type Layout, MODES, MODE_DESCRIPTIONS, MODE_NAMES, type Mode, buildLayout } from "./geometry";
import { DIFFICULTY_NAMES, type Difficulty, type Level, randomShape } from "./levels";
import { type Entry, percent } from "./scores";

const SPLASH_SECONDS = 4;

// Direction keys by physical position (KeyboardEvent.code), so the letter block
// works on QWERTZ/AZERTY keyboards too.
const DIR_CODES: Record<string, number> = {
  Numpad7: 7, Numpad8: 8, Numpad9: 9,
  Numpad4: 4, Numpad6: 6,
  Numpad1: 1, Numpad2: 2, Numpad3: 3,
  ArrowUp: 8, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 6,
  KeyQ: 7, KeyW: 8, KeyE: 9,
  KeyA: 4, KeyD: 6,
  KeyZ: 1, KeyX: 2, KeyC: 3,
};
const UNDO_CODES = new Set(["Numpad5", "Backspace", "KeyS"]);
const CONFIRM_CODES = new Set(["Enter", "NumpadEnter", "Space"]);

type Action = number | "undo";

function keyAction(code: string): Action | null {
  if (UNDO_CODES.has(code)) return "undo";
  return DIR_CODES[code] ?? null;
}

/** (dx, dy) for menu navigation, accepting arrows, numpad and the letter block. */
function menuDelta(code: string): [number, number] {
  const d = keyAction(code);
  return d === 8 ? [0, -1] : d === 2 ? [0, 1] : d === 4 ? [-1, 0] : d === 6 ? [1, 0] : [0, 0];
}

/** Direction (numpad digit) of a swipe, in 45° sectors. Screen y grows downwards. */
function swipeDirection(dx: number, dy: number): number {
  const sector = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  return [6, 3, 2, 1, 4, 7, 8, 9][sector];
}

function gutter(app: App): number {
  return Math.max(10, 24 * app.f);
}

function backSize(app: App): number {
  return Math.max(40, 44 * app.f);
}

/** The "<" button in the top left corner: the touch and mouse version of Esc. */
function backButton(app: App, action: () => Scene): Rect {
  const s = backSize(app);
  const m = Math.max(6, 10 * app.f);
  const r = { x: m, y: m, w: s, h: s };
  app.button({
    id: "back", ...r, action,
    drawContent: (b, color) => {
      const ctx = app.ctx;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx + b.w * 0.1, cy - b.h * 0.22);
      ctx.lineTo(cx - b.w * 0.12, cy);
      ctx.lineTo(cx + b.w * 0.1, cy + b.h * 0.22);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    },
  });
  return r;
}

function drawArrow(app: App, r: Rect, direction: number, color: string): void {
  const [dx, dy] = DIRECTIONS.get(direction)!;
  const n = Math.hypot(dx, dy);
  const ux = dx / n;
  const uy = dy / n;
  const len = Math.min(r.w, r.h) * 0.42;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const tx = cx + (ux * len) / 2;
  const ty = cy + (uy * len) / 2;
  const head = len * 0.42;
  const ctx = app.ctx;
  ctx.beginPath();
  ctx.moveTo(cx - (ux * len) / 2, cy - (uy * len) / 2);
  ctx.lineTo(tx, ty);
  for (const a of [Math.PI * 0.75, -Math.PI * 0.75]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + (ux * c - uy * s) * head, ty + (ux * s + uy * c) * head);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, len / 9);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

// --- splash -----------------------------------------------------------------

let splashImage: HTMLImageElement | null = null;
let splashBackground: string | null = null;

/** The colour of the picture's corner, to fill around it when it doesn't fill the window. */
function splashFill(image: HTMLImageElement): string {
  if (!splashBackground) {
    splashBackground = PAPER;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const cx = c.getContext("2d")!;
      cx.drawImage(image, 2, 2, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
      splashBackground = `rgb(${r},${g},${b})`;
    } catch {
      // keep white
    }
  }
  return splashBackground;
}

/** Start loading the splash picture (also used to preload it). */
export function splash(): HTMLImageElement {
  if (!splashImage) {
    splashImage = new Image();
    splashImage.src = splashUrl;
  }
  return splashImage;
}

/** Opening picture; any key, a tap or a few seconds lead to the main menu. */
export class Splash extends Scene {
  private readonly until = this.app.now() + SPLASH_SECONDS;

  key(): Scene {
    return new MainMenu(this.app);
  }

  pointerDown(): Scene {
    return new MainMenu(this.app);
  }

  update(): Scene {
    return this.app.now() >= this.until ? new MainMenu(this.app) : this;
  }

  draw(): void {
    const { app } = this;
    const { W, H } = app;
    const image = splash();
    if (image.complete && image.naturalWidth) {
      const iw = image.naturalWidth;
      const ih = image.naturalHeight;
      // Fill the window like the Python game, cropping a little of the plain grid
      // at the top. When that would cut into the artwork (much wider or taller
      // windows than the picture), fit the whole picture instead.
      let scale = Math.max(W / iw, H / ih);
      let y = H - ih * scale;
      if (iw * scale > W * 1.06 || ih * scale > H * 1.08) {
        scale = Math.min(W / iw, H / ih);
        y = (H - ih * scale) / 2;
        app.ctx.fillStyle = splashFill(image);
        app.ctx.fillRect(0, 0, W, H);
      }
      app.ctx.imageSmoothingQuality = "high";
      app.ctx.drawImage(image, (W - iw * scale) / 2, y, iw * scale, ih * scale);
    }
    const label = app.touch ? "Tap to start" : "Press any key";
    const pw = app.measure(label, 30) + 32;
    const ph = app.px(30) + 16;
    app.roundRect({ x: W / 2 - pw / 2, y: H - 12 - ph, w: pw, h: ph }, ph / 2, "rgba(255,255,255,0.85)", null);
    app.text(label, 30, TEXT, "center", W / 2, H - 12 - ph / 2);
  }
}

// --- menus --------------------------------------------------------------------

type Row = [left: string, right: string | string[]];

/** A vertical list, chosen with the keys, a tap or a click; long lists scroll. */
abstract class ListMenu extends Scene {
  title = "";
  leftSize = 38;
  /** Right-edge offsets of the columns (in 1000px-window units) when a row's right side is a list. */
  columns: number[] = [];
  protected scroll = 0;
  private rowH = 46;
  private visible = 1;
  private listArea: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rowRects: { r: Rect; index: number }[] = [];
  private drag: { y: number; scroll: number } | null = null;
  /** Centre the selection once the first draw knows how many rows fit. */
  private needsCentre = true;

  constructor(
    app: App,
    protected selected = 0,
  ) {
    super(app);
  }

  abstract rows(): Row[];
  abstract choose(index: number): Scene;

  back(): Scene {
    return new MainMenu(this.app);
  }

  get hasBack(): boolean {
    return true;
  }

  horizontal(_dx: number): void {}

  footer(): string {
    return "Up/Down: select    Enter: choose    Esc: back";
  }

  /** Room kept free under the list. */
  extraBottom(): number {
    return 0;
  }

  drawExtra(_listBottom: number): void {}

  private centreOn(index: number): void {
    // like the Python menu: keep the selection in the middle where possible
    this.scroll = index - Math.floor(this.visible / 2);
    this.clampScroll();
  }

  private clampScroll(): void {
    const max = Math.max(0, this.rows().length - this.visible);
    this.scroll = Math.max(0, Math.min(this.scroll, max));
  }

  key(code: string): Scene {
    if (code === "Escape") return this.hasBack ? this.back() : this;
    if (CONFIRM_CODES.has(code)) return this.choose(this.selected);
    const [dx, dy] = menuDelta(code);
    if (dy) {
      const n = this.rows().length;
      this.selected = (((this.selected + dy) % n) + n) % n;
      this.centreOn(this.selected);
    }
    if (dx) this.horizontal(dx);
    return this;
  }

  pointerDown(p: Pt): Scene {
    if (inside(this.listArea, p)) this.drag = { y: p.y, scroll: this.scroll };
    return this;
  }

  pointerMove(p: Pt, down: boolean): Scene {
    if (down && this.drag) {
      this.scroll = this.drag.scroll - (p.y - this.drag.y) / this.rowH;
      this.clampScroll();
    } else if (!down && !this.app.touch) {
      const hit = this.rowRects.find((row) => inside(row.r, p));
      if (hit) this.selected = hit.index;
    }
    return this;
  }

  pointerUp(): Scene {
    this.drag = null;
    return this;
  }

  wheel(dy: number): void {
    this.scroll += dy / this.rowH;
    this.clampScroll();
  }

  draw(): void {
    const { app } = this;
    const { W, H, f, ctx } = app;
    const rows = this.rows();

    if (this.hasBack) backButton(app, () => this.back());
    const titleY = Math.max(14, 40 * f);
    app.text(this.title, 56, TEXT, "midtop", W / 2, titleY, W - 2 * (backSize(app) + 20));

    const top = titleY + app.px(56) + 28 * f;
    const footerH = app.touch ? 12 : app.px(24) + 28 * f;
    const bottom = H - footerH - this.extraBottom();
    const rowW = Math.min(W - 24, 720 * f);
    const rowX = (W - rowW) / 2;
    const textL = rowX + 25 * f;
    const textR = rowX + rowW - 25 * f;
    const hasRight = rows.some(([, right]) => right.length > 0);
    const compact = hasRight && rowW < 560;
    this.rowH = compact ? Math.max(58, 70 * f) : Math.max(46, 46 * f);
    this.visible = Math.max(1, Math.floor((bottom - top) / this.rowH));
    if (this.needsCentre) {
      this.needsCentre = false;
      this.centreOn(this.selected);
    }
    this.clampScroll();
    const boxH = this.rowH - 6;
    this.listArea = { x: rowX - 4, y: top - 4, w: rowW + 8, h: this.visible * this.rowH + 4 };

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.listArea.x, this.listArea.y, this.listArea.w, this.listArea.h);
    ctx.clip();
    this.rowRects = [];
    const first = Math.floor(this.scroll);
    for (let i = first; i < Math.min(rows.length, Math.ceil(this.scroll + this.visible)); i++) {
      const [left, right] = rows[i];
      const y = top + (i - this.scroll) * this.rowH;
      const box = { x: rowX, y, w: rowW, h: boxH };
      if (i === this.selected || app.isPressed(`row${i}`)) {
        app.roundRect(box, 8, PAPER, HILITE, 2);
      }
      if (compact) {
        app.text(left, this.leftSize, TEXT, "midleft", textL, y + boxH * 0.32, textR - textL);
        if (right.length) {
          const detail = typeof right === "string" ? right : right.join("   ");
          app.text(detail, 26, MUTED, "midleft", textL, y + boxH * 0.72, textR - textL);
        }
      } else if (typeof right === "string") {
        const rw = right ? app.measure(right, 30) : 0;
        app.text(left, this.leftSize, TEXT, "midleft", textL, y + boxH / 2, textR - textL - rw - 16);
        if (right) app.text(right, 30, MUTED, "midright", textR, y + boxH / 2);
      } else {
        const xs = this.columns.map((c) => textR - c * f);
        app.text(left, this.leftSize, TEXT, "midleft", textL, y + boxH / 2, xs[0] - 70 * f - textL);
        right.forEach((cell, c) => app.text(cell, 26, MUTED, "midright", xs[c], y + boxH / 2));
      }
      // only the visible part of a row reacts to taps
      const visTop = Math.max(y, this.listArea.y);
      const visBottom = Math.min(y + boxH, this.listArea.y + this.listArea.h);
      if (visBottom - visTop > 8) {
        const r = { x: rowX, y: visTop, w: rowW, h: visBottom - visTop };
        this.rowRects.push({ r, index: i });
        app.addButton({ id: `row${i}`, ...r, action: () => this.tap(i) });
      }
    }
    ctx.restore();

    // hints that the list scrolls
    const tri = (cy: number, up: boolean) => {
      const s = 7;
      ctx.beginPath();
      ctx.moveTo(W / 2 - s, cy + (up ? s / 2 : -s / 2));
      ctx.lineTo(W / 2 + s, cy + (up ? s / 2 : -s / 2));
      ctx.lineTo(W / 2, cy + (up ? -s / 2 : s / 2));
      ctx.fillStyle = MUTED;
      ctx.fill();
    };
    if (this.scroll > 0.01) tri(top - 14 * f, true);
    if (this.scroll < rows.length - this.visible - 0.01) tri(this.listArea.y + this.listArea.h + 8, false);

    this.drawExtra(this.listArea.y + this.listArea.h);
    if (!app.touch) app.text(this.footer(), 24, MUTED, "midbottom", W / 2, H - 16 * f, W - 24);
  }

  private tap(index: number): Scene {
    this.selected = index;
    return this.choose(index);
  }
}

export class MainMenu extends ListMenu {
  title = "SYMMETRO";
  private readonly items = ["Play levels", "Random shape", "Best results"];

  get hasBack(): boolean {
    return false;
  }

  rows(): Row[] {
    return this.items.map((item) => [item, ""]);
  }

  choose(index: number): Scene {
    const app = this.app;
    return [() => new LevelSelect(app), () => new RandomSelect(app), () => new BestResults(app)][index]();
  }

  footer(): string {
    return "Up/Down: select    Enter: choose";
  }
}

function fmtBest(app: App, key: string): string {
  const b = app.scores.best(key);
  return b ? `best ${b.percent}%` : "-";
}

function levelKey(level: Level): string {
  return `level:${level.id}`;
}

function randomKey(mode: Mode, difficulty: Difficulty): string {
  return `random:${mode}:${difficulty}`;
}

class LevelSelect extends ListMenu {
  title = "Levels";

  rows(): Row[] {
    return this.app.levels.map((lv, i) => [
      `${i + 1}. ${lv.name}`,
      `${MODE_NAMES[lv.mode]}   ${fmtBest(this.app, levelKey(lv))}`,
    ]);
  }

  choose(index: number): Scene {
    return levelPlay(this.app, index);
  }
}

function levelPlay(app: App, index: number): Scene {
  const level = app.levels[index];
  return new Play(app, buildLayout(level.mode, level.shape), {
    title: `Level ${index + 1}: ${level.name}`,
    scoreKey: levelKey(level),
    next: () => (index + 1 < app.levels.length ? levelPlay(app, index + 1) : new LevelSelect(app, index)),
    retry: () => levelPlay(app, index),
    back: () => new LevelSelect(app, index),
  });
}

/** Remembered while the page is open, like the Python class attribute. */
let difficultyIndex = 1;

class RandomSelect extends ListMenu {
  title = "Random shape";

  rows(): Row[] {
    const diff = DIFFICULTY_NAMES[difficultyIndex];
    return MODES.map((m) => [MODE_NAMES[m], fmtBest(this.app, randomKey(m, diff))]);
  }

  horizontal(dx: number): void {
    const n = DIFFICULTY_NAMES.length;
    difficultyIndex = (((difficultyIndex + dx) % n) + n) % n;
  }

  footer(): string {
    return "Up/Down: mode    Left/Right: difficulty    Enter: play    Esc: back";
  }

  extraBottom(): number {
    return Math.max(64, 90 * this.app.f);
  }

  drawExtra(listBottom: number): void {
    const { app } = this;
    const diff = DIFFICULTY_NAMES[difficultyIndex];
    const cy = listBottom + Math.max(36, 50 * app.f);
    const s = Math.max(44, 48 * app.f);
    const half = Math.max(80, 110 * app.f);
    app.text(diff, 38, HILITE, "center", app.W / 2, cy);
    app.button({ id: "diffL", x: app.W / 2 - half - s, y: cy - s / 2, w: s, h: s, label: "<", size: 38,
      action: () => (this.horizontal(-1), this) });
    app.button({ id: "diffR", x: app.W / 2 + half, y: cy - s / 2, w: s, h: s, label: ">", size: 38,
      action: () => (this.horizontal(1), this) });
  }

  choose(index: number): Scene {
    return randomPlay(this.app, MODES[index], DIFFICULTY_NAMES[difficultyIndex], index);
  }
}

function randomPlay(app: App, mode: Mode, difficulty: Difficulty, menuIndex: number): Scene {
  const layout = buildLayout(mode, randomShape(difficulty));
  return new Play(app, layout, {
    title: `Random: ${MODE_NAMES[mode]} (${difficulty})`,
    scoreKey: randomKey(mode, difficulty),
    next: () => randomPlay(app, mode, difficulty, menuIndex),
    retry: null, // Play replays the same layout
    back: () => new RandomSelect(app, menuIndex),
  });
}

class BestResults extends ListMenu {
  title = "Best results";
  leftSize = 30;
  columns = [270, 185, 105, 0]; // score, moves, time, date

  rows(): Row[] {
    const data = this.app.scores.load();
    const rows: Row[] = [];
    this.app.levels.forEach((lv, i) => {
      const entries = data[levelKey(lv)];
      if (entries?.length) rows.push([`${i + 1}. ${lv.name}`, BestResults.fmt(entries[0])]);
    });
    for (const mode of MODES) {
      for (const diff of DIFFICULTY_NAMES) {
        const entries = data[randomKey(mode, diff)];
        if (entries?.length) rows.push([`Random ${MODE_NAMES[mode]}, ${diff}`, BestResults.fmt(entries[0])]);
      }
    }
    return rows.length ? rows : [["No results yet - go play!", ""]];
  }

  private static fmt(e: Entry): string[] {
    return [`${e.percent}%`, `${e.moves}/${e.min}`, `${e.time.toFixed(1)} s`, e.date];
  }

  choose(): Scene {
    return this;
  }

  footer(): string {
    return "Up/Down: scroll    Esc: back";
  }
}

// --- the board ------------------------------------------------------------------

interface PlayOptions {
  title: string;
  scoreKey: string;
  next: () => Scene;
  retry: (() => Scene) | null;
  back: () => Scene;
}

const PAD_LAYOUT: Action[][] = [
  [7, 8, 9],
  [4, "undo", 6],
  [1, 2, 3],
];

export class Play extends Scene {
  private readonly round: Round;
  private readonly started = this.app.now();
  private elapsed: number | null = null;
  private finishedAt = 0;
  private rank: number | null = null;
  private flashUntil = 0;
  private board: Board | null = null;
  private swipe: Pt | null = null;
  private readonly retry: () => Scene;

  constructor(
    app: App,
    private readonly layout: Layout,
    private readonly opts: PlayOptions,
  ) {
    super(app);
    this.round = new Round(layout);
    this.retry = opts.retry ?? (() => new Play(app, layout, opts));
  }

  key(code: string): Scene {
    if (code === "Escape") return this.opts.back();
    if (this.round.finished) {
      if (CONFIRM_CODES.has(code)) return this.opts.next();
      if (code === "KeyR") return this.retry();
      return this;
    }
    const action = keyAction(code);
    if (action !== null) this.act(action);
    return this;
  }

  private act(action: Action): void {
    const r = this.round;
    if (r.finished) return;
    if (action === "undo") {
      r.undo();
      return;
    }
    const result = r.move(action);
    if (result === GameEvent.CopyDone) {
      this.flashUntil = this.app.now() + 0.35;
    } else if (result === GameEvent.RoundDone) {
      this.finishedAt = this.app.now();
      this.elapsed = this.finishedAt - this.started;
      this.rank = this.app.scores.record(this.opts.scoreKey, r.moves, r.minimum, this.elapsed, r.undos);
      this.swipe = null;
    }
  }

  // Swiping anywhere off the buttons moves the pen one step per swipe distance.
  pointerDown(p: Pt, onButton: boolean): Scene {
    this.swipe = onButton || this.round.finished ? null : p;
    return this;
  }

  pointerMove(p: Pt, down: boolean): Scene {
    if (!down || !this.swipe) return this;
    const dx = p.x - this.swipe.x;
    const dy = p.y - this.swipe.y;
    const threshold = Math.min(44, Math.max(16, (this.board?.cell ?? 40) * 0.55));
    if (Math.hypot(dx, dy) >= threshold) {
      this.act(swipeDirection(dx, dy));
      this.swipe = this.round.finished ? null : p;
    }
    return this;
  }

  pointerUp(): Scene {
    this.swipe = null;
    return this;
  }

  // --- drawing ---------------------------------------------------------------

  draw(): void {
    const { app } = this;
    const { W, H, f } = app;
    const pad = gutter(app);
    const hudH = this.drawHud();

    let area: Rect;
    let controls: Rect | null = null;
    if (app.touch) {
      if (H >= W * 1.05) {
        // portrait: the pad sits under the board
        const size = Math.min(W - 2 * pad, (H - hudH) * 0.38, 320);
        controls = { x: (W - size) / 2, y: H - pad - size, w: size, h: size };
        area = { x: pad, y: hudH, w: W - 2 * pad, h: controls.y - pad - hudH };
      } else {
        // landscape: the pad sits to the right of the board
        const size = Math.min(H - hudH - pad, W * 0.32, 320);
        controls = { x: W - pad - size, y: hudH + (H - hudH - pad - size) / 2, w: size, h: size };
        area = { x: pad, y: hudH, w: controls.x - 2 * pad, h: H - hudH - pad };
      }
    } else {
      const footerH = app.px(24) + 28 * f;
      area = { x: pad, y: hudH, w: W - 2 * pad, h: H - hudH - footerH };
    }

    this.drawBoard(area);
    if (controls) {
      if (this.round.finished) this.drawFinishedButtons(controls, true);
      else this.drawPad(controls);
    } else if (this.round.finished) {
      const footerH = app.px(24) + 28 * f;
      this.drawFinishedButtons({ x: pad, y: H - footerH, w: W - 2 * pad, h: footerH }, false);
    } else {
      const hint = "Numpad 1-9 or Q W E / A D / Z X C: draw     5 or S: undo     Esc: back";
      app.text(hint, 24, MUTED, "midbottom", W / 2, H - 14 * f, W - 2 * pad);
    }
  }

  private drawBoard(area: Rect): void {
    const { app, round: r, layout: lay } = this;
    const ctx = app.ctx;
    const board = new Board(lay.gridW, lay.gridH, area, 72 * Math.max(1, app.f));
    this.board = board;
    const flashing = app.now() < this.flashUntil;
    board.drawPaper(ctx, lay.axes, lay.centre, flashing ? FLASH : PAPER);
    board.drawSegments(ctx, lay.original.segments, GREEN);
    lay.copies.forEach((_, i) => {
      if (i < r.copyIndex) board.drawSegments(ctx, r.drawn[i], GREEN);
      else if (i === r.copyIndex) board.drawSegments(ctx, r.drawn[i], INK);
    });
    board.drawDot(ctx, lay.original.start, PINK);
    for (let i = r.copyIndex + 1; i < lay.copies.length; i++) board.drawDot(ctx, lay.copies[i].start, PINK);
    if (!r.finished) board.drawDot(ctx, r.pen, GREEN, true);
  }

  /** Top bar; the result appears here so the board stays visible. Returns its height. */
  private drawHud(): number {
    const { app, round: r } = this;
    const { W, f } = app;
    const pad = gutter(app);
    const n = this.layout.copies.length;
    const back = backButton(app, () => this.opts.back());
    const left = back.x + back.w + 12;
    const y1 = Math.max(back.y + back.h / 2 - app.px(38) / 2, 18 * f);
    const y2 = Math.max(y1 + app.px(38) + 8, 54 * f);
    const narrow = W < 640;

    let big: string;
    let bigColor: string;
    let small: string;
    let note: string;
    let noteColor: string;
    if (r.finished) {
      if (this.rank === 1) [note, noteColor] = ["Done!  New best!", GREEN];
      else if (this.rank) [note, noteColor] = [`Done!  #${this.rank} on your list`, TEXT];
      else [note, noteColor] = [`Done!  (${fmtBest(app, this.opts.scoreKey)})`, MUTED];
      big = `${percent(r.minimum, r.moves)}%`;
      bigColor = GREEN;
      small = `${r.moves}/${r.minimum} moves    ${(this.elapsed ?? 0).toFixed(1)} s`;
    } else {
      note = MODE_DESCRIPTIONS[this.layout.mode];
      noteColor = MUTED;
      big = `${r.moves}/${r.minimum}`;
      bigColor = TEXT;
      small = `Copy ${r.copyIndex + 1}/${n}    ${Math.round(app.now() - this.started)} s`;
    }

    const bigRect = app.text(big, 56, bigColor, "topright", W - pad, y1 - 4 * f);
    const smallW = app.measure(small, 30);
    app.text(small, 30, MUTED, "topright", W - pad, y2);
    app.text(this.opts.title, 38, TEXT, "topleft", left, y1, W - pad - bigRect.w - 16 - left);
    let bottom = y2 + app.px(30);
    if (narrow && !r.finished) {
      // not enough room next to the numbers: the description gets its own line
      const y3 = bottom + 8;
      app.text(note, 26, noteColor, "topleft", pad, y3, W - 2 * pad);
      bottom = y3 + app.px(26);
    } else {
      app.text(note, 30, noteColor, "topleft", narrow ? pad : left, y2, W - pad - smallW - 16 - (narrow ? pad : left));
      if (narrow) bottom += 8 + app.px(26); // same height as while playing, so the board doesn't jump
    }
    return bottom + Math.max(10, 16 * f);
  }

  private drawPad(r: Rect): void {
    const { app } = this;
    const gap = r.w * 0.05;
    const cw = (r.w - 2 * gap) / 3;
    PAD_LAYOUT.forEach((row, j) =>
      row.forEach((action, i) => {
        const cell = { x: r.x + i * (cw + gap), y: r.y + j * (cw + gap), w: cw, h: cw };
        app.button({
          id: `pad${action}`, ...cell, onDown: true,
          label: action === "undo" ? "Undo" : undefined, size: 34,
          drawContent: action === "undo" ? undefined : (b, color) => drawArrow(app, b, action, color),
          action: () => (this.act(action), this),
        });
      }),
    );
  }

  private drawFinishedButtons(r: Rect, stacked: boolean): void {
    const { app } = this;
    // a short pause, so a fast tap on the pad doesn't skip the result
    const enabled = app.now() - this.finishedAt > 0.4;
    const items: [string, string, () => Scene][] = stacked
      ? [["next", "Next", () => this.opts.next()], ["retry", "Retry", () => this.retry()], ["done", "Back", () => this.opts.back()]]
      : [["next", "Enter: next", () => this.opts.next()], ["retry", "R: retry", () => this.retry()], ["done", "Esc: back", () => this.opts.back()]];
    if (stacked) {
      const gap = r.h * 0.06;
      const h = Math.min(72, (r.h - 2 * gap) / 3);
      const y0 = r.y + (r.h - 3 * h - 2 * gap) / 2;
      items.forEach(([id, label, action], i) =>
        app.button({ id, x: r.x, y: y0 + i * (h + gap), w: r.w, h, label, size: 38, enabled, action }),
      );
    } else {
      const w = Math.min(170 * app.f, (r.w - 40) / 3);
      const h = Math.min(r.h - 10, 40);
      const gap = 20;
      const x0 = r.x + (r.w - 3 * w - 2 * gap) / 2;
      items.forEach(([id, label, action], i) =>
        app.button({ id, x: x0 + i * (w + gap), y: r.y + (r.h - h) / 2, w, h, label, size: 26, enabled, action }),
      );
    }
  }
}
