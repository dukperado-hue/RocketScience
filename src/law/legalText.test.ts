import { describe, it, expect } from 'vitest';
import { AirspaceMonitor } from './airspaceMonitor';
import { LANTERN_SITES } from './samui';
import { MISSIONS } from '@/campaign/campaign';
import { DISCLAIMER } from '@/ui/softLaunchUI';

/**
 * Until the legal wording is reviewed (playtest/LEGAL_TEXT.md), what players see states no penalty amounts,
 * prison terms, statute numbers or treaty articles. The money value stays internal (monitor.fines).
 */
const FORBIDDEN = [/60[,_ ]?000/, /sixty thousand/i, /3 years|three years/i, /Section 44|NCPO/i, /ค่าปรับ|ปรับ\s*[\d๐-๙]|จำคุก/, /Treaty|Convention|Liability|Registration/i, /฿\s*\d/];

function playerText(): string[] {
  const m = new AirspaceMonitor(LANTERN_SITES[0], 15, false);
  const alerts = [...m.update(10, 20, 150, true), ...m.update(1500, 5200, 300, true)];
  const out: string[] = [DISCLAIMER.en, DISCLAIMER.th];
  for (const a of alerts) out.push(a.title, a.titleTh, a.detail, a.basis);
  for (const mi of MISSIONS) {
    out.push(mi.brief, mi.briefTh, mi.hint ?? '', mi.hintTh ?? '', mi.story.text, mi.story.textTh);
    for (const o of mi.objectives) out.push(o.text, o.textTh);
  }
  return out;
}

describe('legal wording shown to players is neutral', () => {
  it('no amounts, prison terms, statute or treaty citations in alerts, disclaimer, missions or story', () => {
    for (const t of playerText()) for (const re of FORBIDDEN) expect(t, `${re} in: ${t.slice(0, 80)}`).not.toMatch(re);
  });
  it('the disclaimer still says it is against the law and not legal advice (EN + TH)', () => {
    expect(DISCLAIMER.en).toMatch(/against the law/);
    expect(DISCLAIMER.en).toMatch(/not legal advice/);
    expect(DISCLAIMER.th).toMatch(/ผิดกฎหมายและมีโทษ/);
  });
  it('the internal penalty still exists for the game logic and tests (it is just not displayed)', () => {
    const m = new AirspaceMonitor(LANTERN_SITES[0], 15, false);
    m.update(10, 20, 150, true);
    expect(m.fines).toBe(60_000);
  });
});
