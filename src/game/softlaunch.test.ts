import { describe, it, expect, vi } from 'vitest';
import { SafeKV, loadJSON, saveJSON } from '@/core/safeStorage';
import { installAudioUnlock } from '@/audio/audioUnlock';
import { QuickRetry, type RetryHost, type LaunchContext } from './quickRetry';
import { trackMissionComplete, getTrackedEvents } from '@/core/analytics';

const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('x'); } } as unknown as Storage;
const working = (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage; })();

describe('safeStorage', () => {
  it('no localStorage → memory mode, saves survive in-session', () => {
    const kv = new SafeKV(null);
    expect(kv.memoryOnly).toBe(true);
    saveJSON(kv, 'campaign', { done: ['m1'] });
    expect(loadJSON(kv, 'campaign', {})).toEqual({ done: ['m1'] });
  });
  it('Safari private mode (setItem/getItem throw) → no crash, degrades to memory', () => {
    const kv = new SafeKV(throwing);
    expect(() => kv.setItem('settings', '{"vol":0.5}')).not.toThrow();
    expect(kv.memoryOnly).toBe(true);
    expect(kv.getItem('settings')).toBe('{"vol":0.5}');
  });
  it('corrupt JSON → defaults, no throw', () => {
    const kv = new SafeKV(working);
    kv.setItem('campaign', '{not json');
    expect(loadJSON(kv, 'campaign', { done: [] })).toEqual({ done: [] });
  });
  it('circular data → saveJSON returns false, no throw', () => {
    const a: Record<string, unknown> = {}; a.self = a;
    expect(saveJSON(new SafeKV(working), 'x', a)).toBe(false);
  });
});

describe('audioUnlock', () => {
  it('first gesture resumes a suspended context and starts silent buffer', async () => {
    let started = 0;
    const ctx = {
      state: 'suspended' as AudioContextState, destination: {},
      createBuffer: () => ({}), createBufferSource: () => ({ connect() {}, start() { started++; }, buffer: null }),
      resume() { this.state = 'running'; return Promise.resolve(); },
    };
    const target = new EventTarget();
    let unlockedCb = 0;
    const h = installAudioUnlock(() => ctx as unknown as AudioContext, { target, onUnlocked: () => unlockedCb++ });
    expect(h.unlocked).toBe(false);
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve(); await Promise.resolve();
    expect(ctx.state).toBe('running'); expect(started).toBe(1); expect(h.unlocked).toBe(true); expect(unlockedCb).toBe(1);
    // iOS interruption → re-suspended → next tap revives it
    ctx.state = 'interrupted' as AudioContextState;
    target.dispatchEvent(new Event('touchend'));
    await Promise.resolve();
    expect(ctx.state).toBe('running'); expect(unlockedCb).toBe(1);
    h.dispose();
  });
  it('lazy context: created on first tap via opts.create', async () => {
    let made = null as { state: string } | null;
    const target = new EventTarget();
    installAudioUnlock(() => made as unknown as AudioContext, {
      target,
      create: () => (made = { state: 'suspended', destination: {}, createBuffer: () => ({}), createBufferSource: () => ({ connect() {}, start() {} }), resume() { made!.state = 'running'; return Promise.resolve(); } } as unknown as AudioContext),
    });
    target.dispatchEvent(new Event('keydown'));
    await Promise.resolve();
    expect(made!.state).toBe('running');
  });
});

describe('quickRetry', () => {
  it('retry rebuilds the exact launched design, skipping factory', () => {
    let factory = { parts: [{ id: 'bamboo-tube', mat: 'bamboo' }], fuel: 1 };
    const launches: { design: unknown; ctx: LaunchContext }[] = [];
    let cleaned = 0;
    const host: RetryHost<typeof factory> = {
      serializeAssembly: () => factory,
      loadAssembly: (d) => { factory = d; },
      startFlight: (ctx) => { launches.push({ design: JSON.parse(JSON.stringify(factory)), ctx }); factory.fuel = 0; /* flight burns fuel */ },
      cleanupAfterFlight: () => { cleaned++; },
    };
    const qr = new QuickRetry(host);
    expect(qr.canRetry).toBe(false);
    const ctx: LaunchContext = { missionId: 'm2-ballistics', siteId: 'yasothon', useRail: true };
    qr.captureAtLaunch(ctx); host.startFlight(ctx);
    expect(factory.fuel).toBe(0);                       // flight mutated live state
    expect(qr.retry()).toBe(true);
    expect(qr.retry()).toBe(true);
    expect(cleaned).toBe(2);
    expect(launches[1].design).toEqual(launches[0].design);  // fuel restored to 1
    expect(launches[2].design).toEqual(launches[0].design);
    expect(qr.attempt).toBe(3);
    qr.invalidate(); expect(qr.canRetry).toBe(false);
  });
  it('host failure → retry() returns false (caller falls back to Factory)', () => {
    const qr = new QuickRetry<number>({ serializeAssembly: () => 1, loadAssembly() {}, startFlight() { throw new Error('boom'); }, cleanupAfterFlight() {} });
    qr.captureAtLaunch({ missionId: null, siteId: 'pad', useRail: false });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(qr.retry()).toBe(false);
    err.mockRestore();
    expect(qr.canRetry).toBe(true);
  });
});

describe('analytics', () => {
  it('only M1/M2/M2.5 fire; replay flagged', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    trackMissionComplete('m1-lantern'); trackMissionComplete('m3-orbit'); trackMissionComplete('m1-lantern'); trackMissionComplete('m2b-karman');
    log.mockRestore();
    const mc = getTrackedEvents().filter((e) => e.name === 'mission_complete');
    expect(mc.map((e) => [e.data.mission, e.data.replay])).toEqual([['m1-lantern', false], ['m1-lantern', true], ['m2b-karman', false]]);
  });
});
