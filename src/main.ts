import { initStory } from './story/story';
import './ui/styles.css';
import { PhaseManager } from '@/core/PhaseManager';
import { bus, type PhaseId } from '@/core/EventBus';
import { applyEarlyAccessShell } from '@/ui/earlyAccess';

import { safeKV } from '@/core/safeStorage';
import { sfx } from '@/juice/proceduralAudio';
import { installAudioUnlock } from '@/audio/audioUnlock';
import { SOFT_LAUNCH_CSS, mountSessionOnlyNotice } from '@/ui/softLaunchUI';

// soft launch: iOS-safe audio unlock, the disclaimer/retry styles, and a notice when saves are session-only
installAudioUnlock(() => sfx.context, { create: () => sfx.ensureContext() });
const softCss = document.createElement('style');
softCss.textContent = SOFT_LAUNCH_CSS;
document.head.appendChild(softCss);
if (safeKV.memoryOnly) mountSessionOnlyNotice(document.body);

applyEarlyAccessShell();
const app = document.getElementById('app')!;
const phases = new PhaseManager(app);

document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => bus.emit('phase:request', { phase: btn.dataset.goto as PhaseId }));
});

void phases.go('assembly');

initStory();
