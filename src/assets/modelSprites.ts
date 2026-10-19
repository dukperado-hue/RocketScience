/**
 * 3D → 2D bridge: bakes payload models into sprites for the 2D canvases.
 *
 * Why bake instead of overlaying a live Three.js scene on the 2D view?
 *   - The 2D flight sim stays the single source of truth: mass, nodes, aero and
 *     collisions come from the part's box; the model is only its look.
 *   - Draw order stays correct — sprites sit in the same canvas as flames, smoke,
 *     slime and other parts. An overlay canvas can only be all-in-front or all-behind.
 *   - It works everywhere the 2D art works: factory grid, inventory thumbnails,
 *     launch view, map — with one WebGL context for the whole game.
 *   - Cost is paid once per (model, size bucket, roll bucket); then it's a drawImage.
 *
 * Pipeline: request(defId, px, roll) → cache hit: return the canvas; miss: queue a
 * bake → (lazy) import three → load the GLB if present, else build the primitive
 * placeholder → normalise to the part's box → render side-on with an orthographic
 * camera and toon-ish lighting → copy into a 2D canvas → notify listeners to redraw.
 */
import type { FactoryPartDef } from '@/phases/assembly/model/catalog';

type Three = typeof import('three');

const BASE: string = ((import.meta as any).env?.BASE_URL as string | undefined) ?? './';
const ROLL_STEPS = 16;

interface Baker {
  T: Three;
  renderer: import('three').WebGLRenderer;
  scene: import('three').Scene;
  camera: import('three').OrthographicCamera;
  models: Map<string, Promise<import('three').Object3D>>;
}

class ModelSprites {
  private cache = new Map<string, HTMLCanvasElement | 'pending' | 'failed'>();
  private baker: Promise<Baker | null> | null = null;
  private listeners = new Set<() => void>();
  private queue: (() => Promise<void>)[] = [];
  private busy = false;
  /** False when WebGL is unavailable: callers keep drawing the vector fallback */
  available = typeof document !== 'undefined';

  onReady(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /**
   * A baked sprite for this payload at roughly `px` pixels tall, rolled by `roll`
   * radians about its long axis — or null (draw the fallback) while it bakes.
   */
  get(def: FactoryPartDef, px: number, roll = 0): HTMLCanvasElement | null {
    if (!def.payload3d || !this.available) return null;
    // size buckets in powers of √2 between 32 and 512 px, so zooming re-bakes only now and then
    const bucket = Math.round(Math.log2(Math.min(512, Math.max(32, px))) * 2) / 2;
    const r = ((Math.round((roll / (2 * Math.PI)) * ROLL_STEPS) % ROLL_STEPS) + ROLL_STEPS) % ROLL_STEPS;
    const key = `${def.id}|${bucket}|${r}`;
    const hit = this.cache.get(key);
    if (hit instanceof HTMLCanvasElement) return hit;
    if (!hit) { this.cache.set(key, 'pending'); this.enqueue(() => this.bake(key, def, 2 ** bucket, (r / ROLL_STEPS) * 2 * Math.PI)); }
    return null;
  }

  private enqueue(job: () => Promise<void>) {
    this.queue.push(job);
    if (!this.busy) void this.pump();
  }

  private async pump() {
    this.busy = true;
    while (this.queue.length) {
      const job = this.queue.shift()!;
      try { await job(); } catch { /* keep going */ }
    }
    this.busy = false;
    this.listeners.forEach((f) => f());
  }

  private async getBaker(): Promise<Baker | null> {
    if (!this.baker) {
      this.baker = (async () => {
        try {
          const T = await import('three');
          const canvas = document.createElement('canvas');
          const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
          renderer.setClearColor(0x000000, 0);
          const scene = new T.Scene();
          scene.add(new T.HemisphereLight(0xffffff, 0x445066, 1.6));
          const key = new T.DirectionalLight(0xffffff, 2.2);
          key.position.set(-2, 3, 4);
          scene.add(key);
          const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
          camera.position.set(0, 0, 10);
          return { T, renderer, scene, camera, models: new Map() };
        } catch {
          this.available = false;
          return null;
        }
      })();
    }
    return this.baker;
  }

  private async bake(key: string, def: FactoryPartDef, px: number, roll: number) {
    const b = await this.getBaker();
    if (!b) { this.cache.set(key, 'failed'); return; }
    const model = await this.model(b, def);
    const { T, renderer, scene, camera } = b;
    const holder = new T.Group();
    holder.add(model);
    holder.rotation.y = roll;          // roll about the long (launch) axis
    scene.add(holder);
    // Fit the part's box exactly: the 2D part is w × h metres
    const aspect = def.w / def.h;
    const H = Math.max(16, Math.round(px)), W = Math.max(8, Math.round(px * aspect));
    renderer.setSize(W, H, false);
    camera.left = -def.w / 2; camera.right = def.w / 2; camera.top = def.h / 2; camera.bottom = -def.h / 2;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    out.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    scene.remove(holder);
    this.cache.set(key, out);
  }

  /** The model for a part: the GLB if it exists, else the primitive placeholder; normalised to the box */
  private model(b: Baker, def: FactoryPartDef) {
    let p = b.models.get(def.id);
    if (!p) {
      p = (async () => {
        const T = b.T;
        let obj: import('three').Object3D | null = null;
        try {
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
          const gltf = await new GLTFLoader().loadAsync(`${BASE}${def.payload3d!.model}`);
          obj = gltf.scene;
          orient(T, obj, def.payload3d!.upAxis ?? 'y');
        } catch { obj = placeholder(T, def.payload3d!.placeholder); }
        return fitToBox(T, obj, def.w, def.h);
      })();
      b.models.set(def.id, p);
    }
    return p.then((o) => o.clone());
  }
}

function orient(T: Three, o: import('three').Object3D, up: string) {
  const r: Record<string, [number, number, number]> = { y: [0, 0, 0], '-y': [Math.PI, 0, 0], x: [0, 0, Math.PI / 2], '-x': [0, 0, -Math.PI / 2], z: [-Math.PI / 2, 0, 0], '-z': [Math.PI / 2, 0, 0] };
  o.rotation.set(...(r[up] ?? r.y));
  void T;
}

/** Centre the model and scale it so its side view fits the part's w × h box */
function fitToBox(T: Three, o: import('three').Object3D, w: number, h: number) {
  const wrap = new T.Group();
  wrap.add(o);
  o.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(o);
  const size = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3());
  o.position.sub(c);
  const k = Math.min(w / Math.max(1e-6, size.x), h / Math.max(1e-6, size.y)) * 0.96;
  wrap.scale.setScalar(k);
  return wrap;
}

/**
 * Placeholders from Three.js primitives, in the game's palette. Metres, +y up
 * (launch direction), roughly the proportions of the part boxes.
 */
export function placeholder(T: Three, kind: 'sputnik' | 'satellite' | 'telescope') {
  const g = new T.Group();
  const metal = new T.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.85, roughness: 0.25 });
  const dark = new T.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.4, roughness: 0.6 });
  const gold = new T.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.9, roughness: 0.35 });
  const panel = new T.MeshStandardMaterial({ color: 0x2c4f9e, metalness: 0.3, roughness: 0.45, emissive: 0x0b1a3a });
  const zombie = new T.MeshStandardMaterial({ color: 0x8fbf6a, roughness: 0.8 });
  if (kind === 'sputnik') {
    const ball = new T.Mesh(new T.SphereGeometry(0.29, 40, 24), metal);
    ball.position.y = 0.12; g.add(ball);
    const port = new T.Mesh(new T.CircleGeometry(0.11, 32), zombie);   // the zombie behind the porthole
    port.position.set(0, 0.14, 0.292); g.add(port);
    const rim = new T.Mesh(new T.TorusGeometry(0.115, 0.018, 8, 32), dark);
    rim.position.copy(port.position); g.add(rim);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ant = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.8, 6), metal);
      ant.position.set(sx * 0.16, -0.22, sz * 0.12);
      ant.rotation.set(sz * 0.35, 0, sx * -0.35);
      g.add(ant);
    }
    const ring = new T.Mesh(new T.CylinderGeometry(0.2, 0.24, 0.12, 24), dark);
    ring.position.y = -0.47; g.add(ring);
  } else if (kind === 'satellite') {
    const bus = new T.Mesh(new T.BoxGeometry(0.45, 0.55, 0.45), gold);
    g.add(bus);
    for (const s of [1, -1]) {
      const arm = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.12, 6), metal);
      arm.rotation.z = Math.PI / 2; arm.position.set(s * 0.285, 0.05, 0); g.add(arm);
      const wing = new T.Mesh(new T.BoxGeometry(0.28, 0.5, 0.02), panel);
      wing.position.set(s * 0.48, 0.05, 0); g.add(wing);
    }
    const dish = new T.Mesh(new T.SphereGeometry(0.18, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3), metal);
    dish.rotation.x = Math.PI; dish.position.y = 0.42; g.add(dish);
    const adapter = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 0.12, 20), dark);
    adapter.position.y = -0.33; g.add(adapter);
  } else {
    const tube = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 2.6, 40), metal);
    tube.position.y = 0.25; g.add(tube);
    const aft = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.9, 40), gold);
    aft.position.y = -1.2; g.add(aft);
    const door = new T.Mesh(new T.CylinderGeometry(0.43, 0.43, 0.03, 40), dark);
    door.position.set(0, 1.56, 0); door.rotation.x = -0.6; g.add(door);
    for (const s of [1, -1]) {
      const arr = new T.Mesh(new T.BoxGeometry(0.02, 1.9, 0.5), panel);
      arr.position.set(s * 0.56, 0.1, 0); g.add(arr);
    }
  }
  return g;
}

export const modelSprites = new ModelSprites();
