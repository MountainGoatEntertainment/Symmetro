/**
 * The canvas app shell: sizing, the frame loop, text, buttons and input routing.
 * Scenes (menus, the board, ...) live in scenes.ts.
 */

import { type Level, loadLevels } from "./levels";
import { Scores } from "./scores";

export const BG = "rgb(232,234,240)";
export const PAPER = "rgb(255,255,255)";
export const BORDER = "rgb(0,0,0)";
export const GRID = "rgb(190,180,186)";
export const AXIS = "rgb(90,120,250)";
export const GREEN = "rgb(30,200,60)";
export const PINK = "rgb(240,80,150)";
export const INK = "rgb(20,105,45)"; // dark green: the copy being drawn
export const TEXT = "rgb(30,30,40)";
export const MUTED = "rgb(110,110,125)";
export const HILITE = "rgb(90,120,250)";
export const PRESSED = "rgb(214,224,255)";
export const FLASH = "rgb(225,255,230)";

const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inside(r: Rect, p: Pt): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** Like pygame's Rect anchors: where (x, y) sits on the text. */
export type Anchor = "topleft" | "topright" | "midtop" | "midleft" | "midright" | "midbottom" | "center";

export interface ButtonSpec extends Rect {
  id: string;
  /** Pad buttons act as soon as the finger lands; others on release, like a click. */
  onDown?: boolean;
  enabled?: boolean;
  action: () => Scene;
}

/** Keys the game uses; the browser's default action (scrolling, going back) is blocked for these. */
const BLOCKED_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Backspace", "Enter", "NumpadEnter",
]);

export abstract class Scene {
  constructor(readonly app: App) {}

  /** A KeyboardEvent.code (physical key position, so QWERTZ/AZERTY work too). */
  key(_code: string): Scene {
    return this;
  }

  /** Called once per frame, for time-based scene changes. */
  update(): Scene {
    return this;
  }

  abstract draw(): void;

  /** `onButton` is true when the pointer landed on a button (which handles it). */
  pointerDown(_p: Pt, _onButton: boolean): Scene {
    return this;
  }

  /** `down` is false for a mouse hovering. */
  pointerMove(_p: Pt, _down: boolean): Scene {
    return this;
  }

  pointerUp(_p: Pt): Scene {
    return this;
  }

  wheel(_dy: number): void {}
}

export class App {
  readonly ctx: CanvasRenderingContext2D;
  readonly levels: Level[] = loadLevels();
  readonly scores = new Scores();
  /** Canvas size in CSS pixels. */
  W = 0;
  H = 0;
  /** UI scale: 1 at the Python game's 1000x940 window, smaller on phones. */
  f = 1;
  /** Show touch controls; follows the last kind of pointer used. */
  touch: boolean;
  scene: Scene;

  private dpr = 1;
  private buttons: ButtonSpec[] = [];
  private pending: { button: ButtonSpec; start: Pt } | null = null;
  private pressed: { id: string; until: number } | null = null;
  private pointerIsDown = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    firstScene: (app: App) => Scene,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    this.ctx = ctx;
    this.touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.resize();
    this.scene = firstScene(this);

    window.addEventListener("keydown", (e) => this.onKey(e));
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointercancel", () => this.cancelPointer());
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? this.H : 1;
        this.scene.wheel(e.deltaY * scale);
      },
      { passive: false },
    );
    requestAnimationFrame(() => this.frame());
  }

  /** Seconds, for timers. */
  now(): number {
    return performance.now() / 1000;
  }

  private resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.f = Math.min(1.15, Math.max(0.75, Math.min(W / 760, H / 720)));
  }

  private setScene(next: Scene): void {
    if (next !== this.scene) {
      this.scene = next;
      this.pending = null;
    }
  }

  private frame(): void {
    this.resize();
    this.setScene(this.scene.update());
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.W, this.H);
    this.buttons = [];
    this.scene.draw();
    requestAnimationFrame(() => this.frame());
  }

  // --- input -------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
    const code = e.code || e.key;
    if (BLOCKED_KEYS.has(code)) e.preventDefault();
    if (e.repeat) return; // like the Python game: one move per key press
    this.setScene(this.scene.key(code));
  }

  private pos(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private hit(p: Pt): ButtonSpec | undefined {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      if (inside(this.buttons[i], p)) return this.buttons[i];
    }
    return undefined;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === "touch" || e.pointerType === "pen") this.touch = true;
    else if (e.pointerType === "mouse") this.touch = false;
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    this.canvas.focus();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // not fatal: moves outside the canvas are just missed
    }
    this.pointerIsDown = true;
    const p = this.pos(e);
    const b = this.hit(p);
    if (b && b.enabled !== false) {
      if (b.onDown) {
        this.pressed = { id: b.id, until: this.now() + 0.12 };
        this.setScene(b.action());
        return;
      }
      this.pending = { button: b, start: p };
      this.pressed = { id: b.id, until: Infinity };
    }
    this.setScene(this.scene.pointerDown(p, b !== undefined));
  }

  private onPointerMove(e: PointerEvent): void {
    if (!e.isPrimary) return;
    const p = this.pos(e);
    if (this.pending && Math.hypot(p.x - this.pending.start.x, p.y - this.pending.start.y) > 10) {
      // it's a drag (scrolling a list), not a click
      this.pending = null;
      this.pressed = null;
    }
    this.setScene(this.scene.pointerMove(p, this.pointerIsDown));
  }

  private onPointerUp(e: PointerEvent): void {
    if (!e.isPrimary || !this.pointerIsDown) return;
    this.pointerIsDown = false;
    const p = this.pos(e);
    const pending = this.pending;
    this.pending = null;
    this.setScene(this.scene.pointerUp(p));
    if (pending && inside(pending.button, p)) {
      this.pressed = { id: pending.button.id, until: this.now() + 0.1 };
      this.setScene(pending.button.action());
    } else if (this.pressed?.until === Infinity) {
      this.pressed = null;
    }
  }

  private cancelPointer(): void {
    this.pointerIsDown = false;
    this.pending = null;
    this.pressed = null;
  }

  // --- drawing helpers ---------------------------------------------------

  /** Font size in CSS px for a pygame font size (pygame's default font renders at ~0.69 x size). */
  px(size: number): number {
    return Math.max(11, Math.round(size * 0.69 * this.f));
  }

  font(px: number): string {
    return `600 ${px}px ${FONT_FAMILY}`;
  }

  measure(s: string, size: number): number {
    this.ctx.font = this.font(this.px(size));
    return this.ctx.measureText(s).width;
  }

  /** Draw text anchored like a pygame Rect; shrinks it to fit `maxW` if given. */
  text(s: string, size: number, color: string, anchor: Anchor, x: number, y: number, maxW?: number): Rect {
    const ctx = this.ctx;
    let px = this.px(size);
    ctx.font = this.font(px);
    let w = ctx.measureText(s).width;
    if (maxW !== undefined && w > maxW && w > 0) {
      px = Math.max(9, Math.floor((px * maxW) / w));
      ctx.font = this.font(px);
      w = ctx.measureText(s).width;
    }
    const h = px;
    const left = anchor === "topleft" || anchor === "midleft" ? x
      : anchor === "topright" || anchor === "midright" ? x - w
      : x - w / 2;
    const top = anchor === "topleft" || anchor === "topright" || anchor === "midtop" ? y
      : anchor === "midbottom" ? y - h
      : y - h / 2;
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, left, top + h / 2 + px * 0.04);
    return { x: left, y: top, w, h };
  }

  roundRect(r: Rect, radius: number, fill: string | null, stroke: string | null, lineWidth = 2): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  isPressed(id: string): boolean {
    return this.pressed !== null && this.pressed.id === id && this.now() < this.pressed.until;
  }

  /** Register a tappable/clickable area for this frame (drawing is up to the caller). */
  addButton(spec: ButtonSpec): void {
    this.buttons.push(spec);
  }

  /** A standard button: rounded box with a label (or custom content). */
  button(spec: ButtonSpec & { label?: string; size?: number; drawContent?: (r: Rect, color: string) => void }): void {
    const enabled = spec.enabled !== false;
    const pressed = enabled && this.isPressed(spec.id);
    this.roundRect(spec, Math.min(12, spec.h / 4), pressed ? PRESSED : PAPER, enabled ? HILITE : GRID, 2);
    const color = enabled ? TEXT : MUTED;
    if (spec.label) {
      this.text(spec.label, spec.size ?? 30, color, "center", spec.x + spec.w / 2, spec.y + spec.h / 2, spec.w - 12);
    }
    spec.drawContent?.(spec, color);
    this.addButton(spec);
  }
}
