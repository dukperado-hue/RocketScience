/**
 * Orbital map — Three.js globe (rendering layer only).
 *
 * Consumes a frozen `SceneSnapshot` (orbit/frame3d.ts) each frame. It never sees the
 * Flight, so it cannot alter the simulation; the 2D MapView stays as the fallback
 * (no WebGL, still loading, or the player picks 2D).
 *
 *   Earth       day map + city lights across the terminator, ocean glint (water mask),
 *               fresnel limb haze and twilight band; procedural cloud layer
 *   Atmosphere  back-face shell, additive rim glow tinted by the sun
 *   Paths       Line2 (screen-space thickness): live orbit (cyan / dashed orange if it
 *               meets the ground), planned burn (dashed pink), faint 140 km rails ring
 *   Markers     Ap / Pe / node / impact spheres held at constant screen size, DOM labels
 *               projected from 3D and hidden behind the Earth; ship cone + prograde arrow
 *   Camera      OrbitControls (rotate / zoom / pan, damped); auto-frames the orbit until
 *               the player grabs it; focus Earth or ship
 *
 * Scene unit: 1000 km (see frame3d.ts). Textures: NASA Blue Marble / Black Marble
 * derivatives (public domain) via the three-globe examples; clouds generated here.
 */
import type * as TT from 'three';
import type { OrbitControls as OC } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Line2 as L2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial as LM } from 'three/examples/jsm/lines/LineMaterial.js';
import { EARTH_R, type PlaneFrame, type SceneSnapshot, type Vec3 } from '@/orbit/frame3d';
import { fmtDur } from './MapView';

type Three = typeof import('three');
interface Addons {
  OrbitControls: typeof import('three/examples/jsm/controls/OrbitControls.js').OrbitControls;
  Line2: typeof import('three/examples/jsm/lines/Line2.js').Line2;
  LineGeometry: typeof import('three/examples/jsm/lines/LineGeometry.js').LineGeometry;
  LineMaterial: typeof import('three/examples/jsm/lines/LineMaterial.js').LineMaterial;
}

const BASE: string = ((import.meta as any).env?.BASE_URL as string | undefined) ?? './';
const RAILS_R = EARTH_R + 0.14;

export type GlobeFocus = 'earth' | 'ship';

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D waterMap; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndl = dot(n, sunDir);
  float dayMix = smoothstep(-0.15, 0.25, ndl);
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  float water = texture2D(waterMap, vUv).r;
  vec3 col = day * (0.035 + 1.1 * max(ndl, 0.0));
  // city lights: only the bright parts of the night map, only on the night side
  // (the map is sRGB-decoded to linear, so the lights live at small values)
  float lum = dot(night, vec3(0.3, 0.59, 0.11));
  // the source map is blue-tinted; city lights are sodium-orange, so use brightness only
  float nightness = smoothstep(0.02, -0.18, ndl);              // lights only once the sun is well down
  col += vec3(1.0, 0.72, 0.38) * smoothstep(0.01, 0.3, lum) * lum * 1.8 * nightness;
  // sun glint on the oceans
  vec3 H = normalize(sunDir + V);
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, H), 0.0), 48.0) * water * 0.5 * smoothstep(0.0, 0.2, ndl);
  // limb haze (thin-atmosphere scattering, cheap) and a warm twilight band
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  vec3 sky = mix(vec3(0.04, 0.07, 0.18), vec3(0.35, 0.62, 1.0), smoothstep(-0.2, 0.5, ndl));
  col = mix(col, sky, fres * 0.6);
  col += vec3(1.0, 0.5, 0.2) * smoothstep(-0.12, 0.0, ndl) * smoothstep(0.12, 0.0, ndl) * (0.03 + fres * 0.18);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 sunDir; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  // back faces of a slightly larger shell: brightest just outside the limb
  float rim = pow(clamp(1.0 + dot(V, n) * 1.25, 0.0, 1.0), 3.0);
  float lit = smoothstep(-0.35, 0.45, dot(n, sunDir));
  vec3 c = mix(vec3(0.05, 0.08, 0.25), vec3(0.35, 0.65, 1.0), lit);
  gl_FragColor = vec4(c, rim * (0.25 + 0.75 * lit));
  #include <colorspace_fragment>
}`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D cloudMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float ndl = dot(n, sunDir);
  // fade toward the poles, where an equirectangular map pinches into a streak
  float a = texture2D(cloudMap, vUv).r * smoothstep(0.02, 0.14, min(vUv.y, 1.0 - vUv.y));
  float lit = 0.06 + max(ndl, 0.0) * 1.05;
  gl_FragColor = vec4(vec3(lit), a * 0.85 * (0.2 + 0.8 * smoothstep(-0.15, 0.25, ndl)));
  #include <colorspace_fragment>
}`;

/** Seamless (in longitude) fbm value-noise cloud cover, as a single-channel canvas */
function cloudCanvas(w = 1024, h = 512, seed = 7): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const hash = (x: number, y: number, p: number) => {
    x = ((x % p) + p) % p;
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, p: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, p), b = hash(xi + 1, yi, p), c2 = hash(xi, yi + 1, p), d = hash(xi + 1, yi + 1, p);
    return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v;
  };
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI;
    const band = 0.55 + 0.45 * Math.cos(lat * 2.2) ** 2;     // more cloud in the tropics & mid-latitudes
    for (let x = 0; x < w; x++) {
      let f = 0, amp = 0.5, fr = 6;
      for (let o = 0; o < 5; o++) { f += amp * noise((x / w) * fr, (y / h) * fr * 0.5, fr); amp *= 0.5; fr *= 2; }
      const v = Math.max(0, Math.min(1, (f * band - 0.42) * 3.2));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255); img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class GlobeView {
  focus: GlobeFocus = 'earth';
  private renderer: TT.WebGLRenderer;
  private scene: TT.Scene;
  private camera: TT.PerspectiveCamera;
  private controls: OC;
  private ro: ResizeObserver;
  private disposables: { dispose(): void }[] = [];
  private clouds: TT.Mesh;
  private orbitLine: L2; private planLine: L2; private evaLine: L2;
  private orbitMat: LM; private planMat: LM; private evaMat: LM; private evaMark!: TT.Mesh;
  private markers: Record<'ap' | 'pe' | 'node' | 'impact', TT.Mesh>;
  private ship: TT.Group; private shipArrow: TT.ArrowHelper;
  private debris: TT.Points; private debrisGeo: TT.BufferGeometry;
  private labels = new Map<string, HTMLElement>();
  private userMoved = false;
  private lastSig = { orbit: '', plan: '', eva: '' };
  private tmp: TT.Vector3;
  private w = 1; private h = 1;
  private pad!: TT.Mesh; private ringGeo!: TT.BufferGeometry; private sun!: TT.Vector3;

  /** Load Three.js + addons and build the scene; null if WebGL is unavailable */
  static async create(host: HTMLElement, frame: PlaneFrame): Promise<GlobeView | null> {
    try {
      const [T, oc, l2, lg, lm] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/lines/Line2.js'),
        import('three/examples/jsm/lines/LineGeometry.js'),
        import('three/examples/jsm/lines/LineMaterial.js'),
      ]);
      return new GlobeView(T, { OrbitControls: oc.OrbitControls, Line2: l2.Line2, LineGeometry: lg.LineGeometry, LineMaterial: lm.LineMaterial }, host, frame);
    } catch (e) {
      console.warn('[RocketScience] 3D globe unavailable, using the 2D map', e);
      return null;
    }
  }

  private constructor(private T: Three, private A: Addons, private host: HTMLElement, private plane: PlaneFrame) {
    const frame = plane;
    const canvas = host.querySelector<HTMLCanvasElement>('canvas.map-gl')!;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x03050d, 1);
    this.renderer = renderer;
    this.tmp = new T.Vector3();
    const scene = (this.scene = new T.Scene());
    const camera = (this.camera = new T.PerspectiveCamera(45, 1, 0.005, 4000));
    const sun = new T.Vector3(...frame.up).multiplyScalar(0.62).add(new T.Vector3(...frame.east).multiplyScalar(0.62)).add(new T.Vector3(...frame.normal).multiplyScalar(0.48)).normalize();

    // ---------- Stars ----------
    {
      const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        pos.set([r * Math.cos(a) * 1500, u * 1500, r * Math.sin(a) * 1500], i * 3);
        const b = 0.45 + rnd() * 0.55, warm = rnd();
        col.set([b, b * (0.9 + warm * 0.1), b * (0.85 + (1 - warm) * 0.15)], i * 3);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      const m = new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
      scene.add(new T.Points(g, m)); this.disposables.push(g, m);
    }

    // ---------- Earth, clouds, atmosphere ----------
    const earth = new T.Group();
    scene.add(earth);
    const px = (r: number, g: number, b: number) => { const t = new T.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; };
    const uniforms = {
      dayMap: { value: px(30, 70, 140) as TT.Texture }, nightMap: { value: px(0, 0, 0) as TT.Texture },
      waterMap: { value: px(255, 255, 255) as TT.Texture }, sunDir: { value: sun },
    };
    const loader = new T.TextureLoader();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const load = (file: string, key: 'dayMap' | 'nightMap' | 'waterMap', srgb: boolean) => loader.load(`${BASE}assets/earth/${file}`, (t) => {
      t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.anisotropy = aniso; t.needsUpdate = true;
      uniforms[key].value = t; this.disposables.push(t);
    }, undefined, () => { /* keep the placeholder */ });
    load('earth_day.jpg', 'dayMap', true); load('earth_night.jpg', 'nightMap', true); load('earth_water.png', 'waterMap', false);
    const eg = new T.SphereGeometry(EARTH_R, 128, 64);
    const em = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: EARTH_FRAG });
    earth.add(new T.Mesh(eg, em));
    const cloudTex = new T.CanvasTexture(cloudCanvas());
    cloudTex.wrapS = T.RepeatWrapping; cloudTex.anisotropy = aniso;
    const cg = new T.SphereGeometry(EARTH_R * 1.006, 96, 48);
    const cm = new T.ShaderMaterial({ uniforms: { cloudMap: { value: cloudTex }, sunDir: { value: sun } }, vertexShader: VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false });
    this.clouds = new T.Mesh(cg, cm);
    earth.add(this.clouds);
    const ag = new T.SphereGeometry(EARTH_R * 1.028, 96, 48);
    const am = new T.ShaderMaterial({ uniforms: { sunDir: { value: sun } }, vertexShader: VERT, fragmentShader: ATMO_FRAG, side: T.BackSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    earth.add(new T.Mesh(ag, am));
    this.disposables.push(eg, em, cloudTex, cg, cm, ag, am);

    // ---------- Pad marker, rails ring (placed by setSite) ----------
    {
      this.sun = sun;
      this.pad = new T.Mesh(new T.ConeGeometry(0.03, 0.09, 12), new T.MeshBasicMaterial({ color: 0xff8a1f }));
      earth.add(this.pad); this.disposables.push(this.pad.geometry, this.pad.material as TT.Material);
      this.ringGeo = new T.BufferGeometry();
      const rm = new T.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.22 });
      scene.add(new T.Line(this.ringGeo, rm)); this.disposables.push(this.ringGeo, rm);
      this.placeSite();
    }

    // ---------- Paths ----------
    const mkLine = (color: number, width: number, dashed: boolean) => {
      const m = new A.LineMaterial({ color, linewidth: width, transparent: true, opacity: 0.95, dashed, dashSize: 0.12, gapSize: 0.08, worldUnits: false });
      const l = new A.Line2(new A.LineGeometry(), m);
      l.frustumCulled = false; l.visible = false;
      scene.add(l); this.disposables.push(m);
      return [l, m] as const;
    };
    [this.orbitLine, this.orbitMat] = mkLine(0x4fd8ff, 2.6, false);
    [this.planLine, this.planMat] = mkLine(0xff7ad9, 3, true);
    // the planned burn is DOTTED (short dash, long gap) so it never reads as the dashed impact arc
    this.planMat.dashSize = 0.03; this.planMat.gapSize = 0.075;
    [this.evaLine, this.evaMat] = mkLine(0x7cff8a, 2, false);

    // ---------- Markers ----------
    const sph = new T.SphereGeometry(1, 16, 12); this.disposables.push(sph);
    const mk = (color: number) => { const m = new T.MeshBasicMaterial({ color }); this.disposables.push(m); const o = new T.Mesh(sph, m); o.visible = false; scene.add(o); return o; };
    this.markers = { ap: mk(0xffe08a), pe: mk(0x9fe6ff), node: mk(0xff7ad9), impact: mk(0xff5a3c) };
    this.evaMark = mk(0x7cff8a);
    const ship = (this.ship = new T.Group());
    const cone = new T.Mesh(new T.ConeGeometry(0.42, 1.5, 18), new T.MeshBasicMaterial({ color: 0xffffff }));
    const halo = new T.Sprite(new T.SpriteMaterial({ map: this.glowTexture(), color: 0x9fe6ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    halo.scale.setScalar(4.5);
    ship.add(halo, cone); scene.add(ship);
    this.disposables.push(cone.geometry, cone.material as TT.Material, halo.material, (halo.material as TT.SpriteMaterial).map!);
    this.shipArrow = new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(), 1, 0x7cff8a, 0.3, 0.18);
    scene.add(this.shipArrow);
    this.debrisGeo = new T.BufferGeometry();
    const dm = new T.PointsMaterial({ color: 0xc7cdd6, size: 3, sizeAttenuation: false });
    this.debris = new T.Points(this.debrisGeo, dm); scene.add(this.debris); this.disposables.push(this.debrisGeo, dm);

    // ---------- Camera & controls ----------
    camera.position.copy(this.homeDir()).multiplyScalar(EARTH_R * 4);
    // (controls.target is set to padTarget() right after the controls exist)
    const controls = (this.controls = new A.OrbitControls(camera, canvas));
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = EARTH_R * 1.06; controls.maxDistance = EARTH_R * 80;
    controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.9; controls.screenSpacePanning = true;
    controls.addEventListener('start', () => { this.userMoved = true; });
    controls.target.copy(this.padTarget()); camera.position.add(controls.target);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  /**
   * Move the pad to another launch range (before ignition). The snapshot paths are already in
   * world coordinates for whatever PlaneFrame produced them; this only moves the decorations
   * that the globe draws from the frame itself: pad cone, 140 km rails ring and the sun angle.
   */
  setSite(frame: PlaneFrame) {
    this.plane = frame;
    this.placeSite();
    this.lastSig = { orbit: '', plan: '', eva: '' };
    this.recentre();
  }

  private placeSite() {
    const T = this.T, f = this.plane;
    const up = new T.Vector3(...f.up);
    this.pad.position.copy(up).multiplyScalar(EARTH_R + 0.03);
    this.pad.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), up);
    const ring: number[] = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; ring.push(...f.toWorld(Math.cos(a) * RAILS_R * 1e6, Math.sin(a) * RAILS_R * 1e6)); }
    this.ringGeo.setAttribute('position', new T.Float32BufferAttribute(ring, 3));
    this.ringGeo.computeBoundingSphere();
    // same morning-light angle relative to the pad at every range (one shared vector → all shaders)
    this.sun.copy(up).multiplyScalar(0.62).add(new T.Vector3(...f.east).multiplyScalar(0.62)).add(new T.Vector3(...f.normal).multiplyScalar(0.48)).normalize();
  }

  /**
   * Default viewing direction: straight down onto the launch pad, tipped 35° toward the orbit
   * normal so the orbit still reads as an ellipse rather than an edge-on line.
   */
  private homeDir() {
    const T = this.T, f = this.plane, tilt = 35 * Math.PI / 180;
    return new T.Vector3(...f.up).multiplyScalar(Math.cos(tilt)).add(new T.Vector3(...f.normal).multiplyScalar(Math.sin(tilt))).normalize();
  }

  /** Where the camera aims when framing the Earth: offset so the pad lands dead centre on screen */
  private padTarget() {
    const T = this.T, d = this.homeDir(), pad = new T.Vector3(...this.plane.up).multiplyScalar(EARTH_R);
    return pad.sub(d.multiplyScalar(pad.dot(this.homeDir())));     // the pad's component across the view axis
  }

  private glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new this.T.CanvasTexture(c);
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
    for (const m of [this.orbitMat, this.planMat, this.evaMat]) m.resolution.set(this.w, this.h);
  }

  /** Back to the auto-framed view of the whole orbit */
  recentre() { this.userMoved = false; this.focus = 'earth'; }

  /** One frame. `snap` is plain data from frame3d.snapshot(); nothing here can reach the physics. */
  frame(snap: SceneSnapshot, realDt: number) {
    const T = this.T, cam = this.camera, ctl = this.controls;
    this.clouds.rotation.y += realDt * 0.0035;

    // ---- paths ----
    const o = snap.orbit;
    this.setPath(this.orbitLine, this.orbitMat, o?.pts ?? null, !!o?.closed, 'orbit', o?.hitsGround ? 0xff9a3c : 0x4fd8ff, !!o?.hitsGround);
    const p = snap.plan;
    this.setPath(this.planLine, this.planMat, p?.pts ?? null, !!p?.closed, 'plan', 0xff7ad9, true);
    const ev = snap.eva;
    this.setPath(this.evaLine, this.evaMat, ev?.orbit?.pts ?? null, !!ev?.orbit?.closed, 'eva', 0x7cff8a, false);

    // ---- camera: auto-frame until the player takes over; follow the ship if asked ----
    const ship = new T.Vector3(...snap.vehicle.pos);
    const wantTarget = this.focus === 'ship' ? ship : this.padTarget();
    const prevTarget = ctl.target.clone();
    ctl.target.lerp(wantTarget, 1 - Math.exp(-realDt * 5));
    cam.position.add(ctl.target.clone().sub(prevTarget));         // carry the camera with its target
    if (!this.userMoved) {
      const apR = o?.ap ? Math.hypot(...o.ap.pos) : 0;
      const size = this.focus === 'ship' ? EARTH_R * 0.55 : Math.max(EARTH_R * 1.5, ship.length() * 1.3, Math.min(apR * 1.15, EARTH_R * 30));
      const dist = size / Math.tan((cam.fov * Math.PI) / 360) * (this.w < this.h ? this.h / this.w : 1);
      const want = this.homeDir().multiplyScalar(dist).add(ctl.target);
      cam.position.lerp(want, 1 - Math.exp(-realDt * 2.5));
    }
    ctl.update();

    // ---- markers at constant screen size ----
    const scaleAt = (v: TT.Vector3, px: number) => v.distanceTo(cam.position) * Math.tan((cam.fov * Math.PI) / 360) * 2 * (px / this.h);
    const place = (m: TT.Mesh, pos: Vec3 | null | undefined, px = 6) => {
      m.visible = !!pos; if (!pos) return;
      m.position.set(...pos); m.scale.setScalar(scaleAt(m.position, px));
    };
    place(this.markers.ap, o?.ap?.pos); place(this.markers.pe, o?.pe?.pos);
    place(this.markers.impact, o?.impact, 7); place(this.markers.node, p?.node, 7);
    place(this.evaMark, ev && !ev.ended ? ev.pos : null, 6);

    const flying = snap.airborne && !snap.vehicle.landed;
    this.ship.visible = flying; this.shipArrow.visible = flying && snap.vehicle.speed > 1;
    if (flying) {
      this.ship.position.copy(ship);
      const k = scaleAt(ship, 9);
      this.ship.scale.setScalar(k);
      const cone = this.ship.children[1] as TT.Mesh;
      cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...snap.vehicle.nose));
      this.shipArrow.position.copy(ship);
      this.shipArrow.setDirection(new T.Vector3(...snap.vehicle.prograde));
      const L = scaleAt(ship, 46);
      this.shipArrow.setLength(L, L * 0.3, L * 0.18);
    }
    // debris
    const d = snap.debris.flat();
    if (d.length !== (this.debrisGeo.getAttribute('position')?.count ?? 0) * 3) this.debrisGeo.setAttribute('position', new T.Float32BufferAttribute(d, 3));
    else if (d.length) { (this.debrisGeo.getAttribute('position') as TT.BufferAttribute).set(d); this.debrisGeo.getAttribute('position').needsUpdate = true; }
    this.debris.visible = d.length > 0;

    this.renderer.render(this.scene, cam);

    // ---- DOM labels (after render so the projection matches the frame) ----
    const km = (m: number) => (Number.isFinite(m) ? `${Math.round(m / 1000).toLocaleString()} km` : '∞');
    this.label('ap', o?.ap?.pos, o?.ap ? `Ap ${km(o.ap.alt)} · ${fmtDur(o.ap.t)}` : '', 'ap');
    this.label('pe', o?.pe?.pos, o?.pe ? `Pe ${o.pe.alt < 0 ? 'below ground' : km(o.pe.alt)}${Number.isFinite(o.pe.t) ? ` · ${fmtDur(o.pe.t)}` : ''}` : '', o && o.pe && o.pe.alt < 140_000 ? 'warn' : 'pe');
    this.label('impact', o?.impact, 'Impact', 'bad');
    this.label('node', p?.node, p ? `Node ${p.dv > 0 ? '+' : ''}${p.dv} m/s` : '', 'node', -24);
    // planned apsides sit one row below the live ones so the two never overlap
    this.label('newap', p?.ap?.pos, p?.ap ? `new Ap ${km(p.ap.alt)}` : '', 'node', 24);
    this.label('newpe', p?.pe?.pos, p?.pe ? `new Pe ${p.pe.alt < 0 ? 'below ground' : km(p.pe.alt)}` : '', 'node', 24);
    this.label('eva', ev && !ev.ended ? ev.pos : null, ev?.jarred ? 'Jar (adrift)' : 'Zombie (EVA)', 'eva', 22);
    this.label('ship', flying ? snap.vehicle.pos : null, `${(snap.vehicle.alt / 1000).toFixed(0)} km · ${Math.round(snap.vehicle.speed).toLocaleString()} m/s`, 'ship');
  }

  /** Rebuild a Line2 only when its points actually changed (avoids per-frame GPU churn) */
  private setPath(line: L2, mat: LM, pts: readonly Vec3[] | null, closed: boolean, key: 'orbit' | 'plan' | 'eva', color: number, dashed: boolean) {
    if (!pts || pts.length < 2) { line.visible = false; this.lastSig[key] = ''; return; }
    const a = pts[0], b = pts[pts.length - 1], m = pts[pts.length >> 1];
    const sig = `${pts.length}|${a.map((x) => x.toFixed(4))}|${m.map((x) => x.toFixed(3))}|${b.map((x) => x.toFixed(3))}|${closed}|${color}|${dashed}`;
    line.visible = true;
    if (sig === this.lastSig[key]) return;
    this.lastSig[key] = sig;
    const flat: number[] = [];
    for (const q of pts) flat.push(q[0], q[1], q[2]);
    if (closed) flat.push(pts[0][0], pts[0][1], pts[0][2]);
    const g = new this.A.LineGeometry();
    g.setPositions(flat);
    line.geometry.dispose();
    line.geometry = g;
    mat.color.setHex(color);
    if (mat.dashed !== dashed) { mat.dashed = dashed; mat.needsUpdate = true; }
    if (dashed) line.computeLineDistances();
  }

  /** Project a 3D point to a DOM label; hidden when off-screen or behind the Earth */
  private label(key: string, pos: Vec3 | null | undefined, text: string, kind: string, dy = 0) {
    let el = this.labels.get(key);
    const layer = this.host.querySelector<HTMLElement>('.map-labels');
    if (!layer) return;
    if (!el) { el = document.createElement('div'); el.className = `map-tag ${kind}`; layer.appendChild(el); this.labels.set(key, el); }
    if (!pos || !text) { el.hidden = true; return; }
    const v = this.tmp.set(...pos);
    if (this.occluded(v)) { el.hidden = true; return; }
    v.project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.hidden = true; return; }
    el.hidden = false;
    el.className = `map-tag ${kind}`;
    if (el.textContent !== text) el.textContent = text;
    el.style.transform = `translate(${((v.x + 1) / 2) * this.w + 10}px, ${((1 - v.y) / 2) * this.h - 10 + dy}px)`;
  }

  /** Is the straight line from the camera to `p` blocked by the Earth? */
  private occluded(p: TT.Vector3) {
    const c = this.camera.position;
    const d = p.clone().sub(c), L = d.length(); d.divideScalar(L);
    const b = c.dot(d), cc = c.lengthSq() - (EARTH_R * 0.995) ** 2;
    const disc = b * b - cc;
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && t < L - 1e-3;
  }

  dispose() {
    this.ro.disconnect();
    this.controls.dispose();
    this.orbitLine.geometry.dispose(); this.planLine.geometry.dispose(); this.evaLine.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    for (const el of this.labels.values()) el.remove();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
