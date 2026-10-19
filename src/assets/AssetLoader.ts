/**
 * Central GLTF/GLB loader for Phases 3–4.
 *
 * NASA (science.nasa.gov/3d-resources) mostly ships .glb; ESA SciFleet models
 * are glTF/GLB too. Many are large, so we enable:
 *   - DRACO   — compressed geometry  (decoder files in /public/draco/)
 *   - KTX2    — Basis-compressed textures (transcoder in /public/basis/)
 *   - Meshopt — meshopt-compressed buffers (decoder bundled with three)
 *
 * Copy decoders once after install:
 *   cp node_modules/three/examples/jsm/libs/draco/gltf/* public/draco/
 *   cp node_modules/three/examples/jsm/libs/basis/*      public/basis/
 *
 * Models are often authored in arbitrary units and orientations; `normalize`
 * centres them and scales to a target size in metres.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MODEL_MANIFEST, type ModelId } from './modelManifest';

const BASE = import.meta.env.BASE_URL;

export interface LoadOptions {
  /** Longest dimension after normalisation, in metres (scene units). */
  targetSize?: number;
  onProgress?: (fraction: number) => void;
}

export class AssetLoader {
  private gltf: GLTFLoader;
  private cache = new Map<string, Promise<GLTF>>();

  constructor(renderer: THREE.WebGLRenderer) {
    const draco = new DRACOLoader().setDecoderPath(`${BASE}draco/`);
    const ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}basis/`).detectSupport(renderer);
    this.gltf = new GLTFLoader()
      .setDRACOLoader(draco)
      .setKTX2Loader(ktx2)
      .setMeshoptDecoder(MeshoptDecoder);
  }

  /** Load by manifest id (preferred) so credits travel with the model. */
  async loadModel(id: ModelId, opts: LoadOptions = {}): Promise<THREE.Group> {
    const entry = MODEL_MANIFEST[id];
    return this.loadUrl(`${BASE}models/${entry.file}`, { targetSize: entry.sizeMeters, ...opts });
  }

  async loadUrl(url: string, opts: LoadOptions = {}): Promise<THREE.Group> {
    if (!this.cache.has(url)) {
      this.cache.set(url, new Promise<GLTF>((resolve, reject) => {
        this.gltf.load(
          url,
          resolve,
          (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total),
          reject,
        );
      }));
    }
    const gltf = await this.cache.get(url)!;
    // Clone so the same model can appear several times (e.g. a satellite constellation).
    const root = gltf.scene.clone(true);
    return opts.targetSize ? normalize(root, opts.targetSize) : root;
  }
}

export function normalize(obj: THREE.Object3D, targetSize: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  obj.position.sub(centre);
  const wrapper = new THREE.Group();
  wrapper.add(obj);
  wrapper.scale.setScalar(targetSize / longest);
  return wrapper;
}

/** Stand-in shown while a model downloads or if the file is missing. */
export function placeholderSpacecraft(): THREE.Group {
  const g = new THREE.Group();
  const bus = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.6, roughness: 0.35 }),
  );
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b2b5a, metalness: 0.2, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.9), panelMat);
    panel.position.x = s * 1.8;
    g.add(panel);
  }
  g.add(bus);
  return g;
}
