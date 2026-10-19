/**
 * safeStorage — localStorage that can never crash the game.
 *
 * Safari Private Mode, blocked cookies/site data, sandboxed iframes and
 * quota-full devices can make `window.localStorage` throw on *access*,
 * on getItem, or on setItem. Every one of those paths is caught here and
 * the game silently falls back to an in-memory Map for the session.
 *
 * Usage: replace the existing `localKV` with `safeKV` (same shape), and load
 * JSON through `loadJSON` so corrupted saves fall back to defaults too.
 */

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory fallback; lives for this page session only. */
class MemoryKV implements KV {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

function probeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const ls = window.localStorage;            // can throw (SecurityError)
    if (!ls) return null;
    const probe = '__rs_probe__';
    ls.setItem(probe, '1');                    // can throw (QuotaExceeded / private mode)
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

class SafeKV implements KV {
  private mem = new MemoryKV();
  private ls: Storage | null;
  /** true when saves will NOT survive a reload (UI can show a small notice). */
  memoryOnly: boolean;

  constructor(ls: Storage | null = probeLocalStorage()) {
    this.ls = ls;
    this.memoryOnly = ls === null;
  }

  getItem(k: string): string | null {
    if (this.ls) {
      try { return this.ls.getItem(k) ?? this.mem.getItem(k); } catch { this.degrade(); }
    }
    return this.mem.getItem(k);
  }

  setItem(k: string, v: string): void {
    this.mem.setItem(k, v);                    // always keep a memory copy
    if (!this.ls) return;
    try { this.ls.setItem(k, v); } catch { this.degrade(); }
  }

  removeItem(k: string): void {
    this.mem.removeItem(k);
    if (!this.ls) return;
    try { this.ls.removeItem(k); } catch { this.degrade(); }
  }

  private degrade() {
    if (!this.memoryOnly) console.warn('[safeKV] localStorage failed — progress will be kept for this session only.');
    this.ls = null;
    this.memoryOnly = true;
  }
}

export const safeKV = new SafeKV();
export { SafeKV, MemoryKV };

/** Parse a stored JSON value; on missing/corrupt data return `fallback` (never throws). */
export function loadJSON<T>(kv: KV, key: string, fallback: T): T {
  try {
    const raw = kv.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    console.warn(`[safeKV] corrupt save "${key}", using defaults`, e);
    return fallback;
  }
}

/** Stringify + store; returns false instead of throwing (e.g. circular data). */
export function saveJSON(kv: KV, key: string, value: unknown): boolean {
  try { kv.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn(`[safeKV] could not save "${key}"`, e); return false; }
}
