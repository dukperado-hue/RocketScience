/** Tiny typed pub/sub so phases never import each other directly. */
import type { LawEvent } from '@/law/SpaceLawEngine';
import type { GradeId } from '@/chemistry/mixingBench';
import type { PlacedPart, Telemetry } from '@/phases/assembly/model/vehicle';

export interface GameEvents {
  'phase:request': { phase: PhaseId; payload?: unknown };
  /** A propellant grade was crafted at the Mixing Bench */
  'bench:crafted': { grade: GradeId; quality: number };
  /** A Space Law rule fired (HUD banner, legal log, career score) */
  'law:event': LawEvent;
  /** Campaign mode or progress changed (Missions tab, Factory locks re-render) */
  'campaign:changed': { mode: 'campaign' | 'sandbox' };
  /** A campaign mission was just completed */
  'campaign:complete': { id: string };
}

/** What the factory hands to the launch phase */
export interface LaunchPayload { parts: PlacedPart[]; telemetry: Telemetry; bench: { crafted: Partial<Record<GradeId, number>> } }

export type PhaseId = 'assembly' | 'launch' | 'orbit' | 'mission';

type Handler<T> = (data: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, data: GameEvents[K]): void {
    this.handlers.get(type)?.forEach((fn) => fn(data));
  }
}

export const bus = new EventBus();
