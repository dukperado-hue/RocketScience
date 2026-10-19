/**
 * Vehicle store: the single source of truth for the factory.
 * Holds placed parts, selection, undo/redo history and a live "preview"
 * (the vehicle as it would be if the part being dragged were dropped now),
 * so telemetry can update while the player is still dragging.
 */
import { telemetry, type PlacedPart, type Telemetry } from './model/vehicle';
import { PART, type Salt } from './model/catalog';
import type { ZombieId } from '@/payload/zombies';

const KEY = 'rocketscience.factory.v2';
const MAX_HISTORY = 80;

type Listener = () => void;

export class VehicleStore {
  parts: PlacedPart[] = [];
  selected: number | null = null;
  /** Vehicle used for telemetry while dragging; null = use `parts` */
  preview: PlacedPart[] | null = null;
  telemetry: Telemetry = telemetry([]);
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners = new Set<Listener>();

  constructor() { this.load(); }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { this.listeners.forEach((f) => f()); }

  nextUid() { return this.parts.reduce((m, p) => Math.max(m, p.uid), 0) + 1; }
  get(uid: number) { return this.parts.find((p) => p.uid === uid); }

  /* ---------- Mutations (each one is undoable) ---------- */

  private commit(next: PlacedPart[]) {
    this.undoStack.push(JSON.stringify(this.parts));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.parts = next;
    this.refresh();
  }

  add(...ps: Omit<PlacedPart, 'uid'>[]): PlacedPart[] {
    let uid = this.nextUid();
    const added = ps.map((p) => ({ ...p, uid: uid++ }));
    this.commit([...this.parts, ...added]);
    return added;
  }

  move(uid: number, x: number, y: number, rot: PlacedPart['rot']) {
    this.commit(this.parts.map((p) => (p.uid === uid ? { ...p, x, y, rot } : p)));
  }

  /** Move a part and set its orientation in one undoable step */
  place(uid: number, p: Omit<PlacedPart, 'uid'>) {
    this.commit(this.parts.map((q) => {
      if (q.uid !== uid) return q;
      const next: PlacedPart = { uid, defId: q.defId, x: p.x, y: p.y, rot: p.rot };
      if (p.fx) next.fx = true;
      if (p.fy) next.fy = true;
      if (q.mat) next.mat = q.mat;
      return next;
    }));
  }

  remove(uid: number) {
    if (this.selected === uid) this.selected = null;
    this.commit(this.parts.filter((p) => p.uid !== uid));
  }

  rotate(uid: number) {
    const p = this.get(uid);
    if (p) this.move(uid, p.x, p.y, ((p.rot + 1) % 4) as PlacedPart['rot']);
  }

  /** Mirror a part in its own frame: 'x' = left↔right, 'y' = top↔bottom */
  flip(uid: number, axis: 'x' | 'y') {
    this.commit(this.parts.map((p) => {
      if (p.uid !== uid) return p;
      const q = { ...p };
      if (axis === 'x') q.fx = !p.fx; else q.fy = !p.fy;
      return q;
    }));
  }

  /** Swap one part's material — telemetry updates in the same tick */
  setMaterial(uid: number, mat: string) {
    this.commit(this.parts.map((p) => (p.uid === uid ? { ...p, mat } : p)));
  }

  /** Strap a zombie into a seat part ('empty' leaves it unoccupied) */
  setRider(uid: number, rider: ZombieId | 'empty') {
    this.commit(this.parts.map((p) => (p.uid === uid && PART[p.defId].crew ? { ...p, rider } : p)));
  }

  /** Load (or remove) a firework salt charge in a solid motor */
  setSalt(uid: number, salt: Salt | null) {
    this.commit(this.parts.map((p) => {
      if (p.uid !== uid) return p;
      const q = { ...p };
      if (salt) q.salt = salt; else delete q.salt;
      return q;
    }));
  }

  /** Swap every part of one type to a material (only where that material is allowed) */
  setMaterialForType(defId: string, mat: string) {
    if (!PART[defId].materials?.includes(mat)) return;
    this.commit(this.parts.map((p) => (p.defId === defId ? { ...p, mat } : p)));
  }

  replaceAll(parts: PlacedPart[]) {
    this.selected = null;
    this.commit(parts.map((p) => ({ ...p })));
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.parts));
    this.parts = JSON.parse(prev);
    this.selected = null;
    this.refresh();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.parts));
    this.parts = JSON.parse(next);
    this.refresh();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /* ---------- Non-history state ---------- */

  select(uid: number | null) { this.selected = uid; this.emit(); }

  setPreview(parts: PlacedPart[] | null) {
    this.preview = parts;
    this.telemetry = telemetry(parts ?? this.parts);
    this.emit();
  }

  private refresh() {
    this.preview = null;
    this.telemetry = telemetry(this.parts);
    this.save();
    this.emit();
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.parts)); } catch { /* storage unavailable */ }
  }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.parts = (JSON.parse(raw) as PlacedPart[]).filter((p) => PART[p.defId]);
    } catch { this.parts = []; }
    this.telemetry = telemetry(this.parts);
  }
}
