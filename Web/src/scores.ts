/**
 * Best results, saved in the browser's localStorage. Nothing is sent to a server.
 *
 * A result is scored by moves: the fewest moves the drawing can take, divided by the
 * moves the player used (undos count as moves). Time only breaks ties.
 */

export const KEEP = 5;
/** Prefixed, because every game on www.mgoat.us shares the same storage. */
export const STORAGE_KEY = "symmetro.scores";

export interface Entry {
  percent: number;
  moves: number;
  min: number;
  time: number;
  undos: number;
  date: string;
}

export type ScoreData = Record<string, Entry[]>;

/** The part of the Storage API we use, so tests can pass a fake one. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // storage blocked (e.g. some private modes)
  }
}

/** Score as a whole percentage; 100 only for a perfect round. */
export function percent(minimum: number, moves: number): number {
  if (moves <= minimum) return 100;
  return Math.min(99, Math.round((100 * minimum) / moves));
}

function ratio(e: Entry): number {
  return e.min / Math.max(e.moves, e.min, 1);
}

function isEntry(e: unknown): e is Entry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return ["percent", "moves", "min", "time", "undos"].every((k) => typeof o[k] === "number") && typeof o.date === "string";
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class Scores {
  private cache: ScoreData | null = null;

  constructor(private readonly store: KeyValueStore | null = defaultStore()) {}

  load(): ScoreData {
    if (this.cache) return this.cache;
    let data: ScoreData = {};
    try {
      const parsed: unknown = JSON.parse(this.store?.getItem(STORAGE_KEY) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, entries] of Object.entries(parsed)) {
          if (Array.isArray(entries)) {
            const valid = entries.filter(isEntry);
            if (valid.length) data[key] = valid;
          }
        }
      }
    } catch {
      data = {};
    }
    this.cache = data;
    return data;
  }

  best(key: string): Entry | null {
    return this.load()[key]?.[0] ?? null;
  }

  /** Store a result; return its rank (1 = new best) or null if it didn't make the list. */
  record(key: string, moves: number, minimum: number, seconds: number, undos: number, now = new Date()): number | null {
    const data = this.load();
    const entries = (data[key] ??= []);
    const entry: Entry = {
      percent: percent(minimum, moves),
      moves,
      min: minimum,
      time: Math.round(seconds * 100) / 100,
      undos,
      date: localDate(now),
    };
    entries.push(entry);
    entries.sort((a, b) => ratio(b) - ratio(a) || a.time - b.time);
    entries.splice(KEEP);
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full or blocked: the result still counts for this visit
    }
    const rank = entries.indexOf(entry);
    return rank >= 0 ? rank + 1 : null;
  }
}
