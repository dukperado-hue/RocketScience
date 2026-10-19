/**
 * CAPCOM — Mission Control chatter.
 *
 * Five crew from the RocketScience universe comment on the flight live. Each
 * flight event maps to one speaker and a few possible lines; a small queue
 * paces them (one line per ~2.4 s of real time, zombie news and failures jump
 * the queue). Portraits load from placeholder paths; until the art exists the
 * HUD draws a coloured badge instead.
 */
import type { FlightEvent } from '@/physics/flight2d';

export type CrewId = 'lee' | 'owl' | 'tortoise' | 'capybara' | 'otter' | 'duck' | 'zombie';
/** Which face a line is said with — crew with a `faces` entry for it switch portrait */
export type Face = 'neutral' | 'happy' | 'sad' | 'serious' | 'dizzy' | 'angry';
/** A face a crew member doesn't have falls back along this chain */
const FALLBACK: Record<Face, Face[]> = { neutral: [], happy: [], sad: [], serious: [], dizzy: ['serious'], angry: ['sad'] };

export interface Crew {
  id: CrewId; name: string; nameTh: string; role: string; color: string;
  /** Placeholder art — drop the generated PNGs here (see README › Art assets) */
  img: string;
  /** Optional expression portraits; missing ones fall back to `img` */
  faces?: Partial<Record<Exclude<Face, 'neutral'>, string>>;
  initials: string;
}

export const CREW: Record<CrewId, Crew> = {
  lee: { id: 'lee', name: 'Lee', nameTh: 'ลี', role: 'Flight Director', color: '#8a5a3c', img: 'assets/capcom/capcom_lee_cat.png', initials: 'L' },
  owl: { id: 'owl', name: 'Prof. Owl', nameTh: 'ศาสตราจารย์นกฮูก', role: 'Flight Dynamics', color: '#6b5b95', img: 'assets/capcom/capcom_owl_professor.png', initials: 'O' },
  tortoise: { id: 'tortoise', name: 'Tortoise Clerk', nameTh: 'เสมียนเต่า', role: 'Range Safety & Paperwork', color: '#4f7a4a', img: 'assets/capcom/capcom_tortoise_clerk.png', initials: 'T' },
  capybara: {
    id: 'capybara', name: 'Capybara', nameTh: 'คาปิบาร่า', role: 'Recovery & Zombie Wellness', color: '#b07a45', img: 'assets/capcom/capcom_capybara_3d.png', initials: 'C',
    faces: { happy: 'assets/capcom/capcom_capybara_laughing.png', serious: 'assets/capcom/capcom_capybara_nervous.png', sad: 'assets/capcom/capcom_capybara_exhausted.png', dizzy: 'assets/capcom/capcom_capybara_dizzy.png', angry: 'assets/capcom/capcom_capybara_angry.png' },
  },
  otter: { id: 'otter', name: 'Otter', nameTh: 'นาก', role: 'Booster Engineer', color: '#3f7fb0', img: 'assets/capcom/capcom_otter.png', initials: 'Ot' },
  duck: {
    id: 'duck', name: 'Aero-Duck', nameTh: 'เป็ดแอโร', role: 'CAPCOM · Guidance', color: '#e0b100', img: 'assets/capcom/capcom_duck.png', initials: 'D',
    faces: { happy: 'assets/capcom/capcom_duck_happy.png', sad: 'assets/capcom/capcom_duck_sad.png', serious: 'assets/capcom/capcom_duck_serious.png' },
  },
  /** The island has fallen. Early missions are run by the zombies; the crew is locked in Hangar 4. */
  zombie: {
    id: 'zombie', name: 'Zombie Control', nameTh: 'ศูนย์ควบคุมซอมบี้', role: 'CAPCOM · hostile takeover', color: '#4f6b32', img: 'assets/zombie/zombie_idle.png', initials: 'Z',
    faces: { happy: 'assets/zombie/zombie_zero_g.png', sad: 'assets/zombie/zombie_pieces.png', serious: 'assets/zombie/zombie_high_g.png', dizzy: 'assets/zombie/zombie_spinning.png', angry: 'assets/zombie/zombie_high_g.png' },
  },
};

/* ---------- Zombie Control: gibberish on top, the translation underneath ---------- */

const GRUNTS = ['grr', 'brr', 'garr', 'gorr', 'uhh', 'mrr', 'hrrn', 'braa', 'gnar', 'urgh', 'rrah', 'hnn', 'aar', 'mmgh'];
const BRAIN = ['brrrain', 'braaains', 'brainzz'];
const hashStr = (w: string) => { let h = 2166136261; for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619); return h >>> 0; };

/**
 * Zombify a sentence: every word becomes a grunt of about the same length (the same word always
 * becomes the same grunt, so it reads like a language), with ellipses where zombies pause for breath
 * and the occasional "brain" for emphasis. Numbers are not spoken — that is what the translation is for.
 */
export function zombify(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  words.forEach((raw, i) => {
    const w = raw.replace(/[^\p{L}\p{N}]/gu, '');
    if (!w) return;
    const h = hashStr(w.toLowerCase());
    let g = (h % 11 === 0 && w.length > 4) ? BRAIN[h % BRAIN.length] : GRUNTS[h % GRUNTS.length];
    // stretch the last letter to roughly match the word length
    const extra = Math.max(0, Math.min(4, Math.round(w.length / 2) - 1));
    g += g[g.length - 1].repeat(extra);
    if (i === 0 || /[.!?]$/.test(words[i - 1] ?? '')) g = g[0].toUpperCase() + g.slice(1);
    const end = /[.!?]$/.test(raw) ? (raw.endsWith('?') ? '?' : raw.endsWith('!') ? '!' : '…') : /[,;:—]$/.test(raw) || (h % 4 === 0) ? '…' : '';
    out.push(g + end);
  });
  return out.join(' ').replace(/…$/, '') + (/[!?]$/.test(text.trim()) ? '' : '…');
}

/** What Zombie Control says about flight events (the translation); unknown events fall back to the crew's own line */
const ZOMBIE_ON: Record<string, string[]> = {
  liftoff: ['Liftoff. The humans on the beach are pointing at it. Point back.', 'It is moving. Up. Like a human climbing a tree to escape us. Futile.'],
  rail: ['Off the rail. No more bamboo to hold its hand.'],
  'max-q': ['Air pushing hard. We also push hard. Through doors, mostly.'],
  burnout: ['Fire out. Gravity is in charge now. Gravity is one of us.'],
  stage: ['A piece fell off. Pieces falling off is our area of expertise.'],
  karman: ['Space. No humans up here. No air either. We do not need air.'],
  apogee: ['Top of the arc. Everything that goes up comes down. Ask any human we caught.'],
  landed: ['It came down in one piece. Disappointing.'],
  impact: ['Impact. Very loud. Brains everywhere, except ours.', 'It hit the ground. The ground won. The ground usually wins.'],
  failure: ['Structural failure. It is coming apart. Relatable.'],
  tumble: ['It is spinning. Like us after the first bite.'],
  'no-liftoff': ['It does not fly. It sits. We respect sitting.'],
  'lantern-burnout': ['Candle dead. Lantern falling. Like hope. Like the humans.'],
  'lantern-fire': ['Paper on fire. Beautiful. Do it again.'],
  'lantern-ground-fire': ['It landed on a roof. Still burning. The humans are running. Excellent mission.'],
  'zombie-limb': ['An arm came off. He was not using it.'],
  'zombie-fall-apart': ['Our colleague has come apart. He will be fine. He was always like this.'],
  'zombie-survived': ['Colleague intact. Grumpy. Normal.'],
  firework: ['Pretty lights. The humans like pretty lights. They come closer. Then we eat them.'],
};
/** Altitude call-outs while Zombie Control flies (the human quip after the numbers) */
export const ZOMBIE_QUIPS = [
  'The humans are getting angry.',
  'The humans are filming it. Smile with what is left of your face.',
  'Samui Tower keeps calling. We let it ring.',
  'The animal crew is still locked in Hangar 4. They are knocking. Politely.',
  'A tourist on the beach is asking if this is part of the Full Moon Party. Yes.',
  'Someone is writing a complaint. In Thai and in English. We do not read.',
  'The village headman is shouting. We shout back. Nobody understands anybody.',
];

/** Event kind → the face it is said with */
export function faceFor(kind: string): Face {
  if (['orbit', 'zombie-sat', 'landed', 'karman', 'lap', 'firework', 'liftoff', 'reboost', 'escape', 'milestone'].includes(kind)) return 'happy';
  if (['failure', 'impact', 'burnup', 'no-liftoff'].includes(kind)) return 'sad';
  if (kind === 'zombie-jarred') return 'dizzy';
  if (kind === 'lantern-fire' || kind === 'lantern-ground-fire') return 'sad';
  if (kind === 'eva' || kind === 'eva-orbit' || kind === 'eva-escape') return 'happy';
  if (kind === 'eva-burnup' || kind === 'eva-impact' || kind === 'eva-fumble') return 'sad';
  if (['tumble', 'cartwheel'].includes(kind)) return 'dizzy';
  if (['max-q', 'decaying', 'plasma', 'gimbal', 'stall', 'reverse', 'deorbit', 'assist', 'rcs'].includes(kind) || kind === 'zombie-limb') return 'serious';
  return 'neutral';
}

/** The portrait to show for a crew member and face */
export function portrait(who: CrewId, face: Face = 'neutral'): string {
  const c = CREW[who];
  for (const f of [face, ...FALLBACK[face]]) { const src = f !== 'neutral' ? c.faces?.[f] : undefined; if (src) return src; }
  return c.img;
}

export interface Line { who: CrewId; text: string; priority: number; at?: number; /** flight time (s) when the event happened */ simAt?: number; face?: Face;
  /** Zombie Control: what the gibberish in `text` means, shown under it in brackets */
  translation?: string }

type Pick = [CrewId, string[]][];

const pick = <T>(xs: T[], r: () => number) => xs[Math.floor(r() * xs.length)];

/** Lines per event kind. `{x}` placeholders are filled from the event text. */
const ON: Record<string, Pick> = {
  liftoff: [['duck', ['Tower clear. Guidance is go. Quack — sorry. Guidance is GO.']], ['lee', ['Liftoff! We have liftoff.', 'And the clock is running. Liftoff.']], ['otter', ['It’s going UP! That’s the correct direction!']]],
  rail: [['owl', ['Clear of the rail. From here on it’s all aerodynamics.', 'Off the ramp. Now the air decides if we were right.']]],
  'max-q': [['duck', ['Max-Q. Hold it steady, hold it steady…']], ['owl', ['Max-Q — the air is pushing hardest right now. Hold together, little rocket.', 'Through max-Q. That was the worst of the squeeze.']], ['lee', ['Through max-Q. Telemetry nominal.']]],
  stall: [['owl', ['The fins have stalled. Flow’s separated — no restoring force, I’m afraid.']]],
  reverse: [['owl', ['It’s flying backwards. Technically still flying.', 'Tail-first. The fins are now helping the wrong team.']]],
  tumble: [['lee', ['We’ve lost attitude — vehicle is tumbling!', 'Tumbling. All stations, brace for paperwork.']], ['tortoise', ['Noted. Form 12-B: Unscheduled Rotation.']]],
  cartwheel: [['otter', ['Is it supposed to spin like that?! It’s beautiful!', 'Wheeeee — sorry. Cartwheel confirmed.']]],
  stage: [['otter', ['Staging! Bye-bye, boosters!', 'Separation! Fly free, little stage!']], ['lee', ['Separation confirmed.']]],
  ignition: [['otter', ['Upper stage lit! Second wind!']]],
  karman: [['tortoise', ['We are now in outer space. Please sign here, and then here.', 'Kármán line crossed. I have stamped the space passport.']]],
  apogee: [['owl', ['Apogee. Top of the arc — gravity takes it from here.']]],
  plasma: [['owl', ['Plasma sheath! The air ahead of it is hotter than the surface of the Sun. Shield first, please.']], ['lee', ['Re-entry interface. Expect blackout.']]],
  burnup: [['lee', ['We’re losing parts to the heat!']], ['tortoise', ['Burning debris over the range. I am filing it. Under “other”.']]],
  gimbal: [['otter', ['Gimbal’s at the stops! It wants to go its own way!']]],
  rcs: [['capybara', ['RCS tanks are dry. We’re just along for the ride now.']]],
  chute: [['capybara', ['Chute’s out. Nice and slow now, buddy.']]],
  landed: [['duck', ['Touchdown! MISSION ACCOMPLISHED! Somebody get the flag!']], ['capybara', ['Touchdown. Zombie recovered. It looks… exactly the same.']], ['lee', ['Great flight, everyone. Coffee’s on Otter.']]],
  impact: [['duck', ['Loss of signal. Logging it. Then lying down.']], ['lee', ['Loss of signal.', 'That’s… a ground contact. A firm one.']], ['tortoise', ['Ground impact. Please complete forms 3, 4 and 4-B.']]],
  debris: [['tortoise', ['Spent stage down range. Someone owes a buffalo an apology.']]],
  failure: [['duck', ['…vehicle lost. I am going to lie on the floor for a minute.']], ['lee', ['Structural failure! We’ve lost the vehicle!']], ['owl', ['That part was asked to carry more than its material could bear.']]],
  orbit: [['duck', ['ORBIT CONFIRMED! I am not crying, it is the safety glasses.']], ['owl', ['Periapsis is above the air. Congratulations — you are now falling around the Earth and missing it.', 'Orbit! It’s still falling, it just keeps missing the ground.']], ['lee', ['We have a stable orbit. Well done, everyone.']]],
  'zombie-sat': [['tortoise', ['Registering one (1) zombie as a satellite. Name of launching state, please.']], ['capybara', ['Our buddy is a satellite now. I’m so proud. It looks unimpressed.']]],
  decaying: [['duck', ['Periapsis in the air. Recommend a prograde burn at apoapsis — I have the numbers ready.']], ['owl', ['Periapsis is in the upper air now. Every pass will rub a little speed off. Burn prograde at apoapsis if you want to stay up.']], ['lee', ['Orbit decaying. Not urgent — but not forever, either.']]],
  reboost: [['lee', ['Periapsis back above 140 km. Orbit restored.']], ['otter', ['We’re back up! I never doubted it. I doubted it a little.']]],
  lap: [['owl', ['Another lap. Ninety-odd minutes per sunrise — the zombie has seen more sunrises today than you have all week.']], ['otter', ['Round and round it goes! Wave as it passes!']]],
  deorbit: [['lee', ['De-orbit burn confirmed. Periapsis is in the atmosphere — we’re coming home.']], ['owl', ['Retrograde did it. Point the shield forward before the air arrives.']]],
  escape: [['owl', ['Escape velocity. Gravity will never quite bring it back. Goodbye, little zombie.']], ['tortoise', ['Filing Form 99: Permanently Departed.']]],
  firework: [['otter', ['FIREWORKS! Look at that colour! I love chemistry!']]],
  trim: [['owl', ['Carved nozzle — the old builders aimed the thrust straight through the centre of mass. Clever.']]],
  'no-liftoff': [['lee', ['Hold, hold, hold. It’s not going anywhere.']], ['otter', ['Needs more thrust. It always needs more thrust.']]],
  eva: [['otter', ['IT’S OUTSIDE! It’s outside with a fire extinguisher! This is the best day of my life!']], ['owl', ['Remember: you push the gas one way, you go the other. And the bottle is off-centre, so you will spin.']], ['tortoise', ['Unscheduled extravehicular activity. Form 11-EVA, in triplicate.']]],
  'eva-empty': [['capybara', ['That’s the last of the CO₂. Now we wait. I’m good at waiting.']]],
  'eva-fumble': [['otter', ['NOOO the extinguisher! Look at it go… it’s kind of beautiful.']], ['tortoise', ['Fire extinguisher reclassified as a space object. Another form.']]],
  'eva-orbit': [['duck', ['Confirmed: two objects in orbit now — the ship and a zombie. Logging it as a constellation.']]],
  'eva-escape': [['owl', ['A zombie on a fire extinguisher has left Earth’s gravity. I need to sit down.']]],
  'eva-deorbit': [['lee', ['The zombie is coming down. We cannot help it. It would not want our help anyway.']]],
  'eva-burnup': [['capybara', ['Shooting star. Make a wish. Mine’s a quiet afternoon.']], ['lee', ['Loss of zombie signal. Re-entry, no heat shield.']]],
  'eva-impact': [['capybara', ['I’ll get my mop.']]],
  'lantern-burnout': [['owl', ['Fuel cell out. The air inside cools, the lift goes with it. It will drift down slowly — wherever the wind decides.']]],
  'lantern-fire': [['owl', ['Paper ignites around 233 °C — Fahrenheit 451, literally. Too much heat for that envelope.']], ['capybara', ['It’s on fire. It’s a fireball now. I’ll get the bucket. The other bucket.']]],
  'lantern-ground-fire': [['lee', ['It landed still burning. That is exactly how lanterns set roofs and rice fields on fire.']], ['tortoise', ['Fire risk on landing. Filing under “why lanterns are a problem”.']]],
  'zombie-jarred': [['capybara', ['…He’s in a jar now. I’ll put him on the shelf with the others.', 'Jarred. He’s looking at me. Through the glass. He’s still looking at me.']], ['owl', ['That’s what twenty-odd g does when it arrives all at once. Compression, not separation.']], ['tortoise', ['Reclassifying payload from “passenger” to “preserved goods”. Form 7-J.']]],
  'zombie-fall-apart': [['capybara', ['The zombie… has come apart. I’ll get a bucket.', 'Zombie disassembly complete. Again.']]],
  'zombie-survived': [['capybara', ['Zombie intact and grumpy. Perfect result.']]],
  'zombie-impact': [['capybara', ['I’ll go and… collect him.']]],
};

const LIMB_LINES = [
  'We lost the zombie’s {limb}… again.',
  'Copy, one less {limb}. Adding it to the debris list.',
  'The {limb} has left the vehicle. Somebody tell the {limb}.',
];

/**
 * A line is only worth saying while it is still true: older than this (in FLIGHT seconds, so time-warp
 * counts) it is dropped. Urgent lines (priority >= 3: alerts, failures, impact) skip the pacing gap.
 */
export const CAPCOM_STALE_S = 1;
const GAP_MS = 900, GAP_URGENT_MS = 400;

export class Capcom {
  private queue: Line[] = [];
  /** Flight time now (s); LaunchPhase sets it after each physics batch so new lines are stamped with when they happened */
  private simNow = 0;
  /** Wall clock; replaceable in tests */
  clock: () => number = () => performance.now();
  setSim(t: number) { this.simNow = t; }
  private lastAt = -1e9;
  private seed = 1;
  /** Zombie Control has the microphone: every line is grunted, with the meaning as a translation */
  zombieControl = false;
  /** Called with each line as it is spoken */
  onSay: (line: Line) => void = () => {};

  private rand = () => { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; };

  reset() { this.queue = []; this.lastAt = -1e9; }
  /** Drop queued chatter (below `keep` priority): the end-of-flight beats get the microphone */
  hush(keep = 4) { this.queue = this.queue.filter((l) => l.priority >= keep); }

  /** `own`: the speaker keeps their own voice even while Zombie Control holds the microphone */
  say(who: CrewId, text: string, priority = 1, face: Face = 'neutral', own = false) {
    if (who === 'zombie' || (this.zombieControl && !own)) { this.queue.push({ who: 'zombie', text: zombify(text), translation: text, priority, at: this.clock(), simAt: this.simNow, face }); }
    else this.queue.push({ who, text, priority, at: this.clock(), simAt: this.simNow, face });
    this.queue.sort((a, b) => b.priority - a.priority);
    if (this.queue.length > 4) this.queue.length = 4;
  }

  /** Feed a flight event */
  event(e: FlightEvent) {
    if (this.zombieControl) {
      const z = ZOMBIE_ON[e.kind];
      if (z) { this.say('zombie', pick(z, this.rand), e.kind.startsWith('zombie') || ['impact', 'failure', 'lantern-fire'].includes(e.kind) ? 3 : 2, faceFor(e.kind)); return; }
      if (e.kind === 'ignition' || e.kind === 'burnout') return;
    }
    if (e.kind === 'zombie-limb') {
      const limb = /(left arm|right arm|left leg|right leg|head)/i.exec(e.text)?.[1]?.toLowerCase() ?? 'arm';
      this.say('capybara', pick(LIMB_LINES, this.rand).replace(/\{limb\}/g, limb), 3, 'serious');
      return;
    }
    if (e.kind === 'zombie-gloat' && /crispy/.test(e.text)) { this.say('capybara', 'Is it… crispy? It smells like grilled moo ping.', 3, 'happy'); return; }
    if (e.kind === 'chute' && /shredded/.test(e.text)) { this.say('capybara', '…that was the parachute. That was our only parachute.', 3, 'angry'); return; }
    if (e.kind === 'burnout' && !/Solid|Bang Fai/.test(e.text)) { this.say('lee', 'Engine cut-off.', 0); return; }
    if (e.kind === 'ignition' && !/^Upper stage/.test(e.text)) return;
    const opts = ON[e.kind];
    if (!opts) return;
    const [who, lines] = pick(opts, this.rand);
    const pri = e.kind.startsWith('zombie') || ['failure', 'burnup', 'impact', 'tumble'].includes(e.kind) ? 3 : ['landed', 'karman', 'stage', 'orbit', 'deorbit', 'escape', 'decaying'].includes(e.kind) ? 2 : 1;
    this.say(who, pick(lines, this.rand), pri, faceFor(e.kind));
  }

  /** Call every frame with real time (ms); speaks the next queued line when it is due */
  tick(now: number, simT?: number) {
    if (simT !== undefined) this.simNow = simT;
    // stale news is no news: a line older than a second of flight time no longer matches the HUD, so it is dropped
    // (real-time limits stay for a paused or pre-launch screen where the flight clock does not move)
    this.queue = this.queue.filter((l) => this.simNow - (l.simAt ?? this.simNow) <= CAPCOM_STALE_S && now - (l.at ?? now) < (l.priority >= 3 ? 12_000 : 6000));
    if (!this.queue.length) return;
    const urgent = this.queue[0].priority >= 3;
    if (now - this.lastAt < (urgent ? GAP_URGENT_MS : GAP_MS)) return;
    const line = this.queue.shift()!;
    this.lastAt = now;
    this.onSay(line);
  }
}
