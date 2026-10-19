import { describe, it, expect } from 'vitest';
import { drawSprite, ZSPR, type Sprite } from './zombieSprites';

/** A canvas stand-in that only tracks the current affine matrix and where drawImage's origin lands */
function mockCtx() {
  let m = [1, 0, 0, 1, 0, 0]; const stack: number[][] = []; const draws: number[][] = [];
  const mul = (a: number, b: number, c: number, d: number, e: number, f: number) => {
    const [A, B, C, D, E, F] = m;
    m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  };
  return {
    save: () => stack.push([...m]), restore: () => { m = stack.pop()!; },
    translate: (x: number, y: number) => mul(1, 0, 0, 1, x, y), scale: (x: number, y: number) => mul(x, 0, 0, y, 0, 0),
    rotate: (a: number) => mul(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => mul(a, b, c, d, e, f),
    drawImage: (_i: unknown, x: number, y: number) => draws.push([...m, x, y]),
    draws, at: (d: number[], u: number, v: number) => { const [A, B, C, D, E, F, x, y] = d; const X = u + x, Y = v + y; return [A * X + C * Y + E, B * X + D * Y + F]; },
  };
}
const fake = (s: Sprite, w: number, h: number): Sprite => ({ ...s, img: { naturalWidth: w, naturalHeight: h } as HTMLImageElement });

describe('zombie sprites on bones', () => {
  for (const [name, spr, w, h] of [['upper arm (vertical art)', ZSPR.upperArm, 55, 155], ['forearm (horizontal art)', ZSPR.forearm, 143, 60], ['bone (diagonal art)', ZSPR.bone, 34, 45]] as const) {
    it(`${name}: pivot lands on the joint, tip on the bone end, for any length / width / mirror`, () => {
      for (const opts of [{}, { w: 0.07 }, { mirror: true, x0: 0.02 }]) {
        const c = mockCtx(), s = fake(spr, w, h);
        drawSprite(c as unknown as CanvasRenderingContext2D, s, 0.13, opts);
        const d = c.draws[0];
        const [ax, ay] = c.at(d, s.a[0], s.a[1]); const [bx, by] = c.at(d, s.b[0], s.b[1]);
        const x0 = (opts as { x0?: number }).x0 ?? 0;
        expect(ax).toBeCloseTo(x0, 9); expect(ay).toBeCloseTo(0, 9);
        expect(bx).toBeCloseTo(x0 + 0.13, 9); expect(by).toBeCloseTo(0, 9);
      }
    });
  }
  it('art stays upright: a point to the right of the a→b axis in the picture ends up on the right of the bone', () => {
    const c = mockCtx(), s = fake(ZSPR.upperArm, 55, 155);      // a at the top, b below: the bone points down the picture
    drawSprite(c as unknown as CanvasRenderingContext2D, s, 0.1);
    // picture-right of a downward axis is the bone's LEFT? walking down the picture, image +u is to your left side
    const [, y] = c.at(c.draws[0], s.a[0] + 10, s.a[1] + 50);
    expect(y).toBeGreaterThan(0);
  });
});
