import { describe, it, expect } from 'vitest';
import { CATALOG } from '@/phases/assembly/model/catalog';
import { MissionManager } from '@/campaign/missionManager';
import { EARLY_ACCESS } from '@/core/earlyAccess';
import { gradeLock, lockForPart, type LockContext } from './lockInfo';

const kv = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), del: (k: string) => void m.delete(k) }; };
const ctxOf = (mm: MissionManager): LockContext => ({ comingSoon: (id) => mm.comingSoon(id), unlockedBy: (id) => mm.unlockedBy(id), cap: mm.cap });
const THAI = /[฀-๿]/;

describe('every lock says where to unlock it', () => {
  for (const mode of ['campaign', 'sandbox'] as const) {
    it(`${mode}: every locked part has Thai + English text and a destination`, () => {
      const mm = new MissionManager(kv(), { maxTier: 2, finale: 'm2b-karman', label: EARLY_ACCESS.label, labelTh: 'x' } as never);
      mm.setMode(mode);
      let locked = 0;
      for (const def of CATALOG) {
        const info = lockForPart(def, ctxOf(mm), {});
        if (!info) continue;
        locked++;
        expect(['bench', 'missions', 'space-age']).toContain(info.where);
        expect(info.en.length).toBeGreaterThan(20);
        expect(info.th).toMatch(THAI);
        expect(info.en).toContain(def.name);
        if (info.where === 'bench') expect(info.grade).toBeTruthy();
        if (info.where === 'missions') expect(info.en).toMatch(/Mission \S+ ·/);
      }
      expect(locked).toBeGreaterThan(0);
    });
  }

  it('a powder part is unlocked once its grade is crafted, and the bench message names the grade', () => {
    const mm = new MissionManager(kv(), null);
    mm.setMode('sandbox');
    const solid = CATALOG.find((d) => d.engine?.kind === 'solid')!;
    const before = lockForPart(solid, ctxOf(mm), {});
    expect(before?.where).toBe('bench');
    expect(before!.en).toMatch(/Mixing bench/);
    expect(lockForPart(solid, ctxOf(mm), { [before!.grade!]: 0.5 })).toBeNull();
  });

  it('in Sandbox no part is locked by a mission, only by the Early Access cap or a missing grade', () => {
    const mm = new MissionManager(kv(), { maxTier: 2, finale: 'm2b-karman', label: 'Coming Soon', labelTh: 'x' } as never);
    mm.setMode('sandbox');
    for (const def of CATALOG) expect(lockForPart(def, ctxOf(mm), {})?.where).not.toBe('missions');
    expect(gradeLock('Bang Fai tube', 'slow-powder').th).toMatch(THAI);
  });
});
