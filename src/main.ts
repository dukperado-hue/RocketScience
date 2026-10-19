import { initStory } from './story/story';
import './ui/styles.css';
import { PhaseManager } from '@/core/PhaseManager';
import { bus, type PhaseId } from '@/core/EventBus';
import { applyEarlyAccessShell } from '@/ui/earlyAccess';

applyEarlyAccessShell();
const app = document.getElementById('app')!;
const phases = new PhaseManager(app);

document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => bus.emit('phase:request', { phase: btn.dataset.goto as PhaseId }));
});

void phases.go('assembly');

initStory();
