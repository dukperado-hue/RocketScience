/**
 * Owns the single active phase. Phases are lazy-loaded so the Three.js
 * bundle is only downloaded when the player first reaches orbit.
 */
import { bus, type PhaseId } from './EventBus';

export interface Phase {
  enter(root: HTMLElement, payload?: unknown): void | Promise<void>;
  exit(): void;
}

const loaders: Record<PhaseId, () => Promise<Phase>> = {
  assembly: async () => new (await import('@/phases/assembly/FactoryPhase')).FactoryPhase(),
  launch: async () => new (await import('@/phases/launch/LaunchPhase')).LaunchPhase(),
  orbit: async () => new (await import('@/phases/orbit/OrbitPhase')).OrbitPhase(),
  mission: async () => new (await import('@/phases/mission/MissionPhase')).MissionPhase(),
};

export class PhaseManager {
  private current: Phase | null = null;
  private currentId: PhaseId | null = null;

  constructor(private root: HTMLElement) {
    bus.on('phase:request', ({ phase, payload }) => void this.go(phase, payload));
  }

  get active() { return this.currentId; }

  async go(id: PhaseId, payload?: unknown) {
    this.current?.exit();
    this.root.dataset.phase = id;
    this.currentId = id;
    this.current = await loaders[id]();
    await this.current.enter(this.root, payload);
    document.querySelectorAll<HTMLElement>('[data-goto]').forEach((el) => {
      el.setAttribute('aria-current', String(el.dataset.goto === id));
    });
  }
}
