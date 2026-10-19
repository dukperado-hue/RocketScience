import { describe, it, expect } from 'vitest';
import { MISSION } from '@/campaign/campaign';
import { missionCompleteTh, objectiveBannerText } from './missionBanner';

describe('mission banners are bilingual', () => {
  it('every objective of every mission has Thai and English banner text and a CAPCOM line', () => {
    for (const m of Object.values(MISSION)) for (const o of m.objectives) {
      const t = objectiveBannerText(m, o);
      expect(t.th).toMatch(/[\u0E00-\u0E7F]/);          // Thai script
      expect(t.en).toMatch(/[A-Za-z]/);
      expect(t.title).toContain('Objective done');
      expect(t.capcom).toContain(o.text);
    }
  });
  it('the Mission-complete card has a Thai title and unlock text, with and without the zombie crew', () => {
    const m = MISSION['m1-lantern'];
    for (const z of [true, false]) {
      const t = missionCompleteTh(m, z);
      expect(t.title).toContain(m.titleTh);
      expect(t.text).toContain(m.rewards.textTh);
    }
  });
});
