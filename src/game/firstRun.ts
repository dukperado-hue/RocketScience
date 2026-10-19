/**
 * First run: after the title card's "Start building" the player lands in an empty Factory with no idea
 * what to do (playtest: 3 of 6 personas, one nearly quit). The Factory loads the Khom loi blueprint for
 * Mission 1 and points at "Roll out to the pad". This is the pure rule for when that happens.
 */
export const FIRSTRUN_KEY = 'rs.firstrun.pending';
export const COACH_KEY = 'rs.coach.m1';
/** the coach is on screen and not yet acted on: it comes back if the player visits another tab and returns */
export const COACH_ACTIVE_KEY = 'rs.coach.active';

export interface FirstRunState {
  sandbox: boolean;
  /** campaign.current()?.id — the mission on offer */
  currentMissionId: string | null;
  /** parts already on the grid (a returning player's saved build is never replaced) */
  partCount: number;
  /** the coach has been shown and acted on / dismissed before */
  coached: boolean;
}

export function shouldCoachM1(s: FirstRunState): boolean {
  return !s.sandbox && s.currentMissionId === 'm1-lantern' && s.partCount === 0 && !s.coached;
}
