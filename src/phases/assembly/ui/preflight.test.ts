import { describe, it, expect } from 'vitest';
import { checks } from './TelemetryPanel';
import { telemetry, type PlacedPart } from '../model/vehicle';
import { PRESETS } from '../model/presets';
import { MISSION } from '@/campaign/campaign';

const pre = (parts: PlacedPart[]) => checks(telemetry(parts), parts.length, () => '', parts.map((p) => p.defId));
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.build();

describe('pre-flight "will tumble" warning', () => {
  it('the LV-45 sounding rocket (gimbal engine) says SAS can steer it — the warning counts the gimbal', () => {
    const w = pre(preset('sounding')).find((c) => /Centre of pressure is/.test(c.msg));
    expect(w).toBeTruthy();
    expect(w!.msg).toMatch(/SAS/);
    expect(w!.msg).toMatch(/gimbal/);
  });
  it('a rocket with nothing to steer it keeps the plain advice (no mention of SAS)', () => {
    const w = pre(preset('bang-fai')).concat(pre(preset('wan-hu'))).find((c) => /Centre of pressure is/.test(c.msg));
    if (w) expect(w.msg).not.toMatch(/SAS/);
  });
  it('the numbers are untouched: the same telemetry as before the wording change', () => {
    const t = telemetry(preset('sounding'));
    expect(t.cpAboveCom).toBeGreaterThan(0.02);
  });
});

describe('Mission 2.5 SAS hint', () => {
  it('no longer tells the player to turn SAS on (it starts on); it says to leave it on', () => {
    const m = MISSION['m2b-karman'];
    expect(m.hint).not.toMatch(/Turn SAS on/i);
    expect(m.hint).toMatch(/starts ON/);
    expect(m.hintTh).toMatch(/เปิดอยู่แล้ว/);
  });
});
