/**
 * Milestone log — the player's lifetime achievements, kept per browser.
 *
 * Flight events with a matching id unlock a milestone the first time they fire.
 * Storage can be missing or throw (private mode); then milestones still unlock for
 * this session, they just don't persist.
 */
export interface Milestone { id: string; title: string; text: string }

export const MILESTONES: Milestone[] = [
  { id: 'liftoff', title: 'It moves', text: 'Leave the ground under your own power.' },
  { id: 'karman', title: 'Space passport', text: 'Cross the Kármán line (100 km).' },
  { id: 'orbit', title: 'Falling and missing', text: 'Reach a stable orbit (periapsis above 140 km — out of the air).' },
  { id: 'zombie-sat', title: 'Zombie-Sat', text: 'Put a zombie in a stable orbit (Pe above 140 km), in one piece.' },
  { id: 'lap', title: 'Around the world', text: 'Complete a full lap of the Earth.' },
  { id: 'deorbit', title: 'Coming home', text: 'Lower your periapsis back into the air from orbit.' },
  { id: 'escape', title: 'Goodbye, Earth', text: 'Reach escape velocity.' },
  { id: 'zombie-jarred', title: 'Preserves', text: 'Compress a zombie into a jar with one savage g-spike.' },
  { id: 'eva', title: 'One small push', text: 'Take a zombie on a spacewalk.' },
  { id: 'eva-orbit', title: 'Freelance satellite', text: 'Put a spacewalking zombie in a stable orbit of its own.' },
  { id: 'eva-burnup', title: 'Make a wish', text: 'A spacewalking zombie re-enters as a shooting star.' },
  { id: 'airspace', title: 'Hello, Samui Tower', text: 'Drift a sky lantern into controlled airspace. (Please don’t, in real life.)' },
  { id: 'lantern-fire', title: 'Fahrenheit 451', text: 'Overheat a paper lantern until it catches fire.' },
  { id: 'lantern-burnout', title: 'Floating lantern', text: 'Fly a sky lantern until its fuel cell burns out.' },
  { id: 'palate', title: 'Palate cleanser', text: 'Crash so hard Capybara has to mop the screen.' },
];

const KEY = 'rocketscience.milestones.v1';
let mem: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { mem = {}; }
  return mem!;
}

/** Unlock `id` if it is a milestone not yet earned; returns it when newly unlocked */
export function unlock(id: string, when = Date.now()): Milestone | null {
  const m = MILESTONES.find((x) => x.id === id);
  if (!m) return null;
  const got = load();
  if (got[id]) return null;
  got[id] = when;
  try { localStorage.setItem(KEY, JSON.stringify(got)); } catch { /* session only */ }
  return m;
}

export function earned(): { m: Milestone; at: number }[] {
  const got = load();
  return MILESTONES.filter((m) => got[m.id]).map((m) => ({ m, at: got[m.id] }));
}

/** Tests only */
export function _resetMilestones() { mem = {}; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
