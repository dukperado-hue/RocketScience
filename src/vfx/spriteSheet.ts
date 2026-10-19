/**
 * Sprite-sheet animator. A sheet is ONE image with N equal frames side by side in a single row
 * (left → right), transparent background. Missing file → `loadSheet` resolves null and the caller
 * falls back to its procedural rig.
 *
 *   capybara_mop_sheet.png   4 frames, facing RIGHT, the mop held out in front
 *                            (frame 1 push · 2 pull · 3 push · 4 pull, legs mid-stride in each)
 */
export class SpriteSheet {
  constructor(readonly img: HTMLImageElement, readonly frames: number, readonly fps: number) {}

  get frameW() { return this.img.naturalWidth / this.frames; }
  get frameH() { return this.img.naturalHeight; }
  /** width / height of one frame */
  get aspect() { return this.frameW / this.frameH; }
  frameAt(t: number) { return Math.floor(t * this.fps) % this.frames; }

  /** Draw the frame for time t into the box (x, y, w, h); flip mirrors it horizontally */
  draw(ctx: CanvasRenderingContext2D, t: number, x: number, y: number, w: number, h: number, flip = false) {
    const i = this.frameAt(t), fw = this.frameW;
    ctx.save();
    if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(this.img, i * fw, 0, fw, this.frameH, 0, 0, w, h); }
    else ctx.drawImage(this.img, i * fw, 0, fw, this.frameH, x, y, w, h);
    ctx.restore();
  }
}

export function loadSheet(src: string, frames: number, fps: number): Promise<SpriteSheet | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth >= frames ? new SpriteSheet(img, frames, fps) : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
