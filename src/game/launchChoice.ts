/**
 * What the player picked on the launch screen (site, rail length, wind, lantern location) — carried in the
 * launch payload so Quick Retry puts the rocket back exactly where it was, not on the default pad.
 */
import { SITES, type LaunchSite } from '@/physics/flight2d';

export type SiteId = 'ground' | 'pad' | 'ramp';

export interface LaunchChoice {
  siteId: SiteId;
  /** Guide length (m), tilt (°) and crosswind (m/s) exactly as set on the sliders */
  rail: number;
  railAngleDeg: number;
  wind: number;
  /** Tier 0–1 only: Bang Fai grounds vs a Samui-area lantern site, its wind bearing, and the permit box */
  atYasothon: boolean;
  lanternSiteId: string;
  windFrom: number;
  permitted: boolean;
}

export function siteFromChoice(c: LaunchChoice): { id: SiteId; site: LaunchSite } {
  return { id: c.siteId, site: { ...SITES[c.siteId], rail: c.rail, railAngleDeg: c.railAngleDeg, wind: c.wind } };
}
