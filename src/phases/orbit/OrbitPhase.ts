/**
 * Phase 3 — Orbital mechanics (stub). Proves the Three.js + GLTF pipeline:
 * renders a placeholder spacecraft, then swaps in a NASA/ESA model if present.
 *
 * Plan: patched-conics two-body propagation (Kepler elements ↔ state vectors),
 * map view with Ap/Pe markers, RCS/prograde burns, time warp.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Phase } from '@/core/PhaseManager';
import { AssetLoader, placeholderSpacecraft } from '@/assets/AssetLoader';

export class OrbitPhase implements Phase {
  private renderer!: THREE.WebGLRenderer;
  private raf = 0;
  private root!: HTMLElement;
  private ro?: ResizeObserver;

  async enter(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `<div class="three-wrap"><p class="overlay muted">Phase 3 preview · drag to orbit the camera</p></div>`;
    const wrap = root.querySelector<HTMLElement>('.three-wrap')!;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    wrap.appendChild(this.renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1e7);
    camera.position.set(6, 3, 8);
    const controls = new OrbitControls(camera, this.renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(10, 4, 6);
    scene.add(sun);

    const craft = placeholderSpacecraft();
    scene.add(craft);

    // Try a real model; keep the placeholder if the file isn't downloaded yet.
    const loader = new AssetLoader(this.renderer);
    loader.loadModel('voyager', { targetSize: 6 })
      .then((model) => { scene.remove(craft); scene.add(model); })
      .catch(() => { /* model not present — placeholder stays */ });

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      this.renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    this.ro = new ResizeObserver(resize);
    this.ro.observe(wrap);
    resize();

    const tick = () => {
      controls.update();
      this.renderer.render(scene, camera);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  exit() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.renderer.dispose();
    this.root.innerHTML = '';
  }
}
