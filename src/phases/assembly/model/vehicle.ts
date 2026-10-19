/**
 * Vehicle model for the factory — no DOM, fully testable.
 *
 *  - Parts live in world metres (+y up), rotated in 90° steps and optionally
 *    flipped. Local → world:  world = position + R(rot) · F(fx, fy) · local
 *  - Mirroring across a vertical line is a true reflection, so handed parts
 *    (fins, wings, radial tanks) come out as their mirror image:
 *        M · R(r) · F  =  R(−r) · (M·F)   →   rot' = −rot, fx' = !fx
 *  - Connections are derived from geometry: two nodes join when they coincide,
 *    face each other and fit.
 *  - Overlapping and unattached parts are flagged and left out of the stats.
 */
import {
  PART, engineStats, nodesCompatible, dryMass, partCost, propellantMass, propellantKind, integrity, materialFor,
  type AttachNode, type FactoryPartDef, type Rect, type Integrity,
} from './catalog';
import { G0 } from '@/data/parts';
import { ZOMBIES, type ZombieId } from '@/payload/zombies';
import { linearCP, type AeroBody, type AeroPanel } from '@/physics/aero';

export interface PlacedPart {
  uid: number;
  defId: string;
  x: number;
  y: number;
  rot: 0 | 1 | 2 | 3;
  /** Material id; omitted = the part's default */
  mat?: string;
  /** Mirrored left↔right / top↔bottom in the part's own frame */
  fx?: boolean;
  fy?: boolean;
  /** Seat parts only: which zombie is strapped in ('empty' = none). Omitted = standard zombie */
  rider?: ZombieId | 'empty';
  /** Solid motors only: a firework salt charge that bursts in its flame-test colour */
  salt?: import('./catalog').Salt;
}

/** The zombie in a seat part, or null */
export function riderOf(p: PlacedPart): ZombieId | null {
  if (!PART[p.defId].crew) return null;
  return p.rider === 'empty' ? null : p.rider ?? 'standard';
}
/** Dry mass of a placed part including its zombie */
export const placedDryMass = (p: PlacedPart) => dryMass(PART[p.defId], p.mat) + (riderOf(p) ? ZOMBIES[riderOf(p)!].mass : 0);

export interface WorldNode { uid: number; node: AttachNode; x: number; y: number; nx: number; ny: number }

const EPS = 1e-3;

/* ---------- Transforms ---------- */

export function rotate(x: number, y: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [-y, x];     // 90° counter-clockwise
    case 2: return [-x, -y];
    case 3: return [y, -x];
    default: return [x, y];
  }
}

/** Local → world offset (no translation): flip first, then rotate */
export function orient(p: Pick<PlacedPart, 'rot' | 'fx' | 'fy'>, x: number, y: number): [number, number] {
  return rotate(p.fx ? -x : x, p.fy ? -y : y, p.rot);
}

export function worldNodes(p: PlacedPart): WorldNode[] {
  return PART[p.defId].nodes.map((n) => {
    const [x, y] = orient(p, n.x, n.y);
    const [nx, ny] = orient(p, n.nx, n.ny);
    return { uid: p.uid, node: n, x: p.x + x, y: p.y + y, nx, ny };
  });
}

/** Axis-aligned world rects (rotations are 90° multiples, so rects stay rects) */
export function worldHull(p: PlacedPart): Rect[] {
  const def = PART[p.defId];
  const hull = def.hull ?? [{ x: 0, y: 0, w: def.w, h: def.h }];
  const swap = p.rot % 2 === 1;
  return hull.map((r) => {
    const [cx, cy] = orient(p, r.x, r.y);
    return { x: p.x + cx, y: p.y + cy, w: swap ? r.h : r.w, h: swap ? r.w : r.h };
  });
}

export function partBounds(p: PlacedPart): Rect {
  const def = PART[p.defId];
  const swap = p.rot % 2 === 1;
  return { x: p.x, y: p.y, w: swap ? def.h : def.w, h: swap ? def.w : def.h };
}

const rectsOverlap = (a: Rect, b: Rect, shrink = 0.004) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w - 2 * shrink && Math.abs(a.y - b.y) * 2 < a.h + b.h - 2 * shrink;

export function partsOverlap(a: PlacedPart, b: PlacedPart): boolean {
  const ha = worldHull(a), hb = worldHull(b);
  return ha.some((ra) => hb.some((rb) => rectsOverlap(ra, rb)));
}

export function hitTest(p: PlacedPart, x: number, y: number, pad = 0): boolean {
  return worldHull(p).some((r) => Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(y - r.y) <= r.h / 2 + pad);
}

/* ---------- Joints ---------- */

export function joined(a: WorldNode, b: WorldNode): boolean {
  return a.uid !== b.uid
    && Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS
    && a.nx * b.nx + a.ny * b.ny < -0.9
    && nodesCompatible(a.node.size, b.node.size, a.ny);
}

export interface Joint { a: WorldNode; b: WorldNode }

export function joints(parts: PlacedPart[]): Joint[] {
  const all = parts.flatMap(worldNodes);
  const out: Joint[] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (joined(all[i], all[j])) out.push({ a: all[i], b: all[j] });
  return out;
}

export function freeNodes(parts: PlacedPart[]): WorldNode[] {
  const all = parts.flatMap(worldNodes);
  return all.filter((n) => !all.some((m) => joined(n, m)));
}

/* ---------- Snapping ---------- */

export interface SnapResult { x: number; y: number; from: AttachNode; to: WorldNode }

type Orientation = Pick<PlacedPart, 'rot' | 'fx' | 'fy'>;

/**
 * Best attachment for a part dragged to (x, y): the nearest free node that the
 * dragged part's nodes face and fit, within `radius`, with no resulting overlap.
 */
export function findSnap(parts: PlacedPart[], defId: string, o: Orientation, x: number, y: number, radius: number, ignoreUid = -1): SnapResult | null {
  const others = parts.filter((p) => p.uid !== ignoreUid);
  const targets = freeNodes(others);
  const probe: PlacedPart = { uid: -1, defId, x, y, ...o };
  let best: SnapResult | null = null;
  let bestD = radius;
  for (const a of worldNodes(probe)) {
    for (const t of targets) {
      if (a.nx * t.nx + a.ny * t.ny > -0.9 || !nodesCompatible(a.node.size, t.node.size, t.ny)) continue;
      const d = Math.hypot(a.x - t.x, a.y - t.y);
      if (d >= bestD) continue;
      const cand: PlacedPart = { ...probe, x: x + (t.x - a.x), y: y + (t.y - a.y) };
      if (others.some((q) => partsOverlap(cand, q))) continue;
      bestD = d;
      best = { x: cand.x, y: cand.y, from: a.node, to: t };
    }
  }
  return best;
}

export const snapToGrid = (v: number, step = 0.05) => Math.round(v / step) * step;

export function nodesCompatibleFor(defId: string, size: AttachNode['size']): boolean {
  return PART[defId].nodes.some((n) => n.size === size || n.size === 'radial' || size === 'radial');
}

/** Reflect a part across the vertical line x = axis (true mirror image). */
export function mirrored(p: PlacedPart, axis: number): Omit<PlacedPart, 'uid'> {
  return { defId: p.defId, x: 2 * axis - p.x, y: p.y, rot: ((4 - p.rot) % 4) as PlacedPart['rot'], fx: !p.fx, fy: p.fy, mat: p.mat, ...(p.rider ? { rider: p.rider } : {}), ...(p.salt ? { salt: p.salt } : {}) };
}

/* ---------- Structure ---------- */

export const partMass = (p: PlacedPart) => placedDryMass(p) + propellantMass(PART[p.defId]);

export function rootPart(parts: PlacedPart[]): PlacedPart | null {
  if (!parts.length) return null;
  return parts.find((p) => PART[p.defId].crew) ?? parts.reduce((a, b) => (partMass(a) >= partMass(b) ? a : b));
}

export interface Structure { root: PlacedPart | null; connected: Set<number>; overlapping: Set<number>; active: PlacedPart[] }

export function analyse(parts: PlacedPart[]): Structure {
  const overlapping = new Set<number>();
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    if (partsOverlap(parts[i], parts[j])) overlapping.add(parts[j].uid);  // later part "doesn't fit"
  }
  const usable = parts.filter((p) => !overlapping.has(p.uid));
  const root = rootPart(usable);
  const connected = new Set<number>();
  if (root) {
    const adj = new Map<number, number[]>();
    for (const j of joints(usable)) {
      adj.set(j.a.uid, [...(adj.get(j.a.uid) ?? []), j.b.uid]);
      adj.set(j.b.uid, [...(adj.get(j.b.uid) ?? []), j.a.uid]);
    }
    const queue = [root.uid];
    connected.add(root.uid);
    while (queue.length) {
      const u = queue.shift()!;
      for (const v of adj.get(u) ?? []) if (!connected.has(v)) { connected.add(v); queue.push(v); }
    }
  }
  return { root, connected, overlapping, active: usable.filter((p) => connected.has(p.uid)) };
}

/* ---------- Telemetry ---------- */

export interface PartIntegrity extends Integrity { uid: number; loadN: number }

export interface Telemetry {
  wetMass: number;
  dryMass: number;
  propellant: number;
  cost: number;            // ฿
  thrust: number;
  twr: number;
  isp: number;
  deltaV: number;
  burnTime: number;
  smoke: number;
  com: { x: number; y: number } | null;
  cot: { x: number; y: number } | null;
  thrustDir: { x: number; y: number } | null;
  thrustOffset: number;
  torque: number;
  height: number;
  width: number;
  engines: number;
  crew: boolean;
  /** The zombie test payload (first seat), if any */
  rider: { uid: number; zombie: ZombieId } | null;
  loose: number[];
  overlapping: number[];
  blocked: number[];
  /** Per-part structural check at liftoff */
  integrity: Map<number, PartIntegrity>;
  weakest: PartIntegrity | null;
  atRisk: number[];        // safety factor < 1
  /** Centre of pressure height (side-area centroid) minus CoM height, metres. > 0 = CP above CoM → unstable in fast air */
  cpAboveCom: number;
  /** Same, at Mach 3 with the tanks empty — fins lose lift supersonically while the CoM slides aft */
  cpAboveComLate: number;
  /** Thrust ÷ dry weight: the g-load the crew feels at burnout, ignoring drag */
  burnoutG: number;
}

export function telemetry(parts: PlacedPart[]): Telemetry {
  const st = analyse(parts);
  const active = st.active;
  let dry = 0, prop = 0, liquidProp = 0, mx = 0, my = 0, cost = 0;
  const massOf = new Map<number, number>();
  for (const p of active) {
    const d = PART[p.defId];
    const dm = placedDryMass(p), pm = propellantMass(d);
    massOf.set(p.uid, dm + pm);
    dry += dm; prop += pm; cost += partCost(d, p.mat);
    if (propellantKind(d) === 'liquid') liquidProp += pm;
    mx += (dm + pm) * p.x; my += (dm + pm) * p.y;
  }
  const wet = dry + prop;

  const liquidEngines = active.filter((p) => PART[p.defId].engine?.kind === 'liquid');
  const liquidFlow = liquidEngines.reduce((s, p) => { const e = PART[p.defId].engine as { thrustSL: number; ispSL: number }; return s + e.thrustSL / (e.ispSL * G0); }, 0);
  const liquidBurn = liquidFlow > 0 ? liquidProp / liquidFlow : 0;

  let fx = 0, fy = 0, sumF = 0, cx = 0, cy = 0, flow = 0, smoke = 0, burn = 0, engines = 0;
  const blocked: number[] = [];
  const ownThrust = new Map<number, number>();
  for (const p of active) {
    const def = PART[p.defId];
    const es = engineStats(def, liquidBurn);
    if (!es) continue;
    engines++;
    ownThrust.set(p.uid, es.thrust);
    const [dx, dy] = orient(p, 0, 1);               // thrust pushes toward the part's top
    const [ox, oy] = orient(p, 0, -def.h / 2);      // nozzle at the part's bottom
    const nx = p.x + ox, ny = p.y + oy;
    fx += es.thrust * dx; fy += es.thrust * dy;
    sumF += es.thrust; cx += es.thrust * nx; cy += es.thrust * ny;
    flow += es.thrust / es.isp;
    smoke += es.thrust * es.smoke;
    burn = Math.max(burn, es.burnTime);
    if (exhaustBlocked(p, def, active)) blocked.push(p.uid);
  }

  const com = wet > 0 ? { x: mx / wet, y: my / wet } : null;
  const cot = sumF > 0 ? { x: cx / sumF, y: cy / sumF } : null;
  const thrust = Math.hypot(fx, fy);
  const dir = thrust > 0 ? { x: fx / thrust, y: fy / thrust } : null;
  let torque = 0, offset = 0;
  if (com && cot && dir) {
    const rx = cot.x - com.x, ry = cot.y - com.y;
    torque = rx * fy - ry * fx;
    offset = Math.abs(rx * dir.y - ry * dir.x);
  }
  const isp = flow > 0 ? sumF / flow : 0;
  const twr = wet > 0 ? (dir ? fy : 0) / (wet * G0) : 0;

  // Structural loads at liftoff: everything above a part presses on it at n g
  const n = Math.max(1, twr);
  const integ = new Map<number, PartIntegrity>();
  for (const p of active) {
    let above = 0;
    for (const q of active) if (q.uid !== p.uid && q.y > p.y + 1e-6) above += massOf.get(q.uid)!;
    const loadN = Math.max(n * G0 * above, ownThrust.get(p.uid) ?? 0);
    integ.set(p.uid, { uid: p.uid, loadN, ...integrity(PART[p.defId], p.mat, loadN) });
  }
  const list = [...integ.values()];
  const weakest = list.length ? list.reduce((a, b) => (b.safetyFactor < a.safetyFactor ? b : a)) : null;

  // Aerodynamic stability: small-angle centre of pressure from the same 360° model the flight uses
  const body = active.length && com ? aeroBody(active, com.x) : null;
  const cp = body && com ? linearCP(body, com.y) : null;
  const cpAboveCom = com && cp !== null ? cp - com.y : 0;
  let dmy = 0;
  for (const p of active) dmy += placedDryMass(p) * p.y;
  const dryComY = dry > 0 ? dmy / dry : 0;
  const cpLate = body && engines > 0 ? linearCP(body, dryComY, 100 / 3) : null;   // V = 100 m/s at a = 33 m/s → Mach 3
  const cpAboveComLate = cpLate !== null ? cpLate - dryComY : 0;

  const xs = active.flatMap((p) => { const b = partBounds(p); return [b.x - b.w / 2, b.x + b.w / 2]; });
  const ys = active.flatMap((p) => { const b = partBounds(p); return [b.y - b.h / 2, b.y + b.h / 2]; });

  return {
    wetMass: wet, dryMass: dry, propellant: prop, cost,
    thrust, twr, isp,
    deltaV: isp > 0 && dry > 0 && wet > dry ? isp * G0 * Math.log(wet / dry) : 0,
    burnTime: burn,
    smoke: sumF > 0 ? smoke / sumF : 0,
    com, cot, thrustDir: dir, thrustOffset: offset, torque,
    height: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
    width: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    engines,
    crew: active.some((p) => PART[p.defId].crew),
    rider: (() => { const p = active.find((q) => riderOf(q)); return p ? { uid: p.uid, zombie: riderOf(p)! } : null; })(),
    loose: parts.filter((p) => !st.overlapping.has(p.uid) && !st.connected.has(p.uid)).map((p) => p.uid),
    overlapping: [...st.overlapping],
    blocked,
    integrity: integ,
    weakest,
    atRisk: list.filter((i) => i.safetyFactor < 1).map((i) => i.uid),
    cpAboveCom,
    cpAboveComLate,
    burnoutG: dry > 0 ? thrust / (dry * G0) : 0,
  };
}

/* ---------- Aerodynamic panels (for physics/aero.ts) ---------- */

const CONE_SHAPES = new Set(['nose', 'nose-ogive', 'fairing']);
/** Fin CP, fraction of root chord from the top (leading) edge: [attached (Barrowman), separated (area centroid)] */
const FIN_CP: Record<string, [number, number]> = {
  fin: [0.42, 0.55], 'fin-swept': [0.5, 0.6], 'fin-delta': [0.5, 0.667], wing: [0.35, 0.5], 'wing-delta': [0.45, 0.6], kite: [0.3, 0.5],
};

/**
 * Build the aerodynamic model of a vehicle: one panel per part, in the
 * vehicle's frame (identical to world at build time, +y = nose).
 * Fins, wings and the kite are flat plates; everything else is a body.
 */
export function aeroBody(active: PlacedPart[], rollAxisX = 0): AeroBody {
  const panels: AeroPanel[] = [];
  let top = -Infinity, bottom = Infinity, topPart: PlacedPart | null = null, bottomPart: PlacedPart | null = null;
  let sideA = 0, sideAX = 0;
  const xs: number[] = [];
  for (const p of active) {
    const d = PART[p.defId];
    const b = partBounds(p);
    const [ax, ay] = orient(p, 0, 1);
    const plate = !!d.aero || d.shape === 'kite';
    const hullArea = d.hull ? d.hull.reduce((s, r) => s + r.w * r.h, 0) : d.w * d.h;
    const area = plate && d.structure.kind === 'plate' ? d.structure.area
      : plate ? d.w * d.h * 0.8
      : CONE_SHAPES.has(d.shape) ? 0.6 * d.w * d.h
      : d.shape === 'pod' ? 0.75 * d.w * d.h
      : hullArea;
    const span = d.structure.kind === 'plate' ? d.structure.span : d.w;
    panels.push({
      uid: p.uid, kind: plate ? 'plate' : 'body', x: p.x, y: p.y, ax, ay, area, chord: d.h,
      aspect: plate ? (span * span) / Math.max(1e-6, area) : 0,
      // Canted fins are made as rotated copies (same screw sense), so every one adds roll the same way
      cant: ((d.cantDeg ?? 0) * Math.PI) / 180,
      rollArm: Math.max(0.05, Math.abs(p.x - rollAxisX)),
      xcpAtt: FIN_CP[d.shape]?.[0] ?? 0.25, xcpSep: FIN_CP[d.shape]?.[1] ?? 0.5,
      interference: plate ? (() => { const R = Math.max(0, Math.abs(p.x - rollAxisX) - span / 2); return 1 + R / (span + R); })() : 1,
    });
    sideA += area; sideAX += area * p.x;
    if (!plate) xs.push(b.x - b.w / 2, b.x + b.w / 2);   // frontal area: bodies only, fins are edge-on
    // A packed parachute rides inside the nose: look past it when deciding what the nose is
    const stowed = d.shape === 'chute' || d.shape === 'chute-radial';
    if (!stowed && b.y + b.h / 2 > top) { top = b.y + b.h / 2; topPart = p; }
    if (b.y - b.h / 2 < bottom) { bottom = b.y - b.h / 2; bottomPart = p; }
  }
  const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const topShape = topPart ? PART[topPart.defId].shape : '';
  const pointsUp = (p: PlacedPart | null) => !!p && orient(p, 0, 1)[1] > 0.5;
  const pointsDown = (p: PlacedPart | null) => !!p && orient(p, 0, 1)[1] < -0.5;
  const topCone = topPart && CONE_SHAPES.has(topShape) && pointsUp(topPart) ? PART[topPart.defId].h
    : topShape === 'pod' && pointsUp(topPart) ? PART[topPart!.defId].h * 0.5 : 0;
  const bottomCone = bottomPart && CONE_SHAPES.has(PART[bottomPart.defId].shape) && pointsDown(bottomPart) ? PART[bottomPart.defId].h : 0;
  return {
    panels,
    frontArea: width * Math.min(width, 1.25) * (Math.PI / 4),
    frontX: sideA > 0 ? sideAX / sideA : 0,
    cdFwd: topCone && topShape !== 'pod' ? 0.35 : topShape === 'pod' ? 0.5 : topShape === 'chair' ? 0.9 : 0.8,
    cdAft: bottomCone ? 0.4 : 1.0,
    topY: top, bottomY: bottom, topCone, bottomCone,
  };
}

function exhaustBlocked(p: PlacedPart, def: FactoryPartDef, parts: PlacedPart[]): boolean {
  // An upper-stage engine sitting on an interstage decoupler fires only after that stage has dropped
  const nozzleNode = worldNodes(p).find((n) => n.node.id === 'bottom');
  if (nozzleNode && parts.some((o) => PART[o.defId].shape === 'decoupler' && worldNodes(o).some((n) => joined(nozzleNode, n)))) return false;
  const len = Math.max(1, def.h * 2);
  const [px, py] = orient(p, 0, -def.h / 2 - len / 2);
  const swap = p.rot % 2 === 1;
  const plume: Rect = { x: p.x + px, y: p.y + py, w: swap ? len : def.w * 0.8, h: swap ? def.w * 0.8 : len };
  // An interstage decoupler under an upper-stage engine drops away before that engine lights
  return parts.some((o) => o.uid !== p.uid && PART[o.defId].shape !== 'decoupler' && worldHull(o).some((r) => rectsOverlap(plume, r)));
}

/* ---------- Placement helpers ---------- */

/** Tap-to-add: first free compatible node, scanning from the root outward. */
export function autoAttach(parts: PlacedPart[], defId: string, mat?: string): Omit<PlacedPart, 'uid'> | null {
  const base = mat ? { mat } : {};
  if (!parts.length) return { defId, x: 0, y: 0, rot: 0, ...base };
  const st = analyse(parts);
  const order = [...st.active, ...parts.filter((p) => !st.connected.has(p.uid))];
  const free = freeNodes(parts).sort((a, b) => order.findIndex((p) => p.uid === a.uid) - order.findIndex((p) => p.uid === b.uid));
  const def = PART[defId];
  // Prefer: as drawn → flipped → upside down → sideways
  for (const rot of [0, 2, 1, 3] as const) {
    for (const fxFlag of [false, true]) {
      const o = { rot, fx: fxFlag };
      for (const t of free) {
        for (const nd of def.nodes) {
          const [ax, ay] = orient(o, nd.x, nd.y);
          const [nx, ny] = orient(o, nd.nx, nd.ny);
          if (nx * t.nx + ny * t.ny > -0.9 || !nodesCompatible(nd.size, t.node.size, t.ny)) continue;
          const cand: PlacedPart = { uid: -1, defId, x: t.x - ax, y: t.y - ay, ...o };
          if (!parts.some((q) => partsOverlap(cand, q))) return { defId, x: cand.x, y: cand.y, rot, ...(fxFlag ? { fx: true } : {}), ...base };
        }
      }
    }
  }
  return null;
}

/** Attach a new part so that its node `via` meets node `at` on part `to`. */
export function attach(parts: PlacedPart[], defId: string, to: PlacedPart, at: string, via: string, o: Partial<Orientation> & { mat?: string } = {}): PlacedPart {
  const target = worldNodes(to).find((nd) => nd.node.id === at);
  const src = PART[defId].nodes.find((nd) => nd.id === via);
  if (!target || !src) throw new Error(`No node ${at} on ${to.defId} or ${via} on ${defId}`);
  const or = { rot: o.rot ?? 0, fx: o.fx, fy: o.fy };
  const [sx, sy] = orient(or, src.x, src.y);
  const uid = parts.reduce((m, q) => Math.max(m, q.uid), 0) + 1;
  const p: PlacedPart = { uid, defId, x: target.x - sx, y: target.y - sy, rot: or.rot as PlacedPart['rot'] };
  if (or.fx) p.fx = true;
  if (or.fy) p.fy = true;
  if (o.mat) p.mat = o.mat;
  parts.push(p);
  return p;
}

export { materialFor };
