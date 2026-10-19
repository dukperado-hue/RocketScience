/**
 * Early Access / Demo build scope (v0.22). One switch, read by the campaign, the Factory and the
 * shell: Tier 0–2 only (lanterns → Bang Fai → liquid sounding rockets), the campaign ends at
 * Mission 2.5 (the Kármán line), and everything orbital waits for the Space Age Update.
 *
 * The Tier 3–4 parts, Mission 3 and the orbit view are all still in the code — EA only hides and
 * locks them, so turning `on` off restores the full game.
 */
import type { MissionId, Tier } from '@/campaign/campaign';

export interface EarlyAccessCap { maxTier: Tier; finale: MissionId; label: string; labelTh: string }

export const EARLY_ACCESS: EarlyAccessCap & { on: boolean } = {
  on: true,
  maxTier: 2,
  finale: 'm2b-karman',
  label: 'Coming Soon in the Space Age Update',
  labelTh: 'เร็ว ๆ นี้ ในอัปเดตยุคอวกาศ',
};

export const eaCap = (): EarlyAccessCap | null => (EARLY_ACCESS.on ? EARLY_ACCESS : null);
