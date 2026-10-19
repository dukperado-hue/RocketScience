/**
 * Who gets a key press while a form control has focus. Playtest: after dragging a Launch-site slider the
 * focus stayed on it and Space/R/Esc did nothing until the player clicked elsewhere (3 of 6 personas).
 *   'control'  the control keeps the key (typing in a text field, arrows on a slider, Space on a checkbox)
 *   'release'  Esc: the control lets go of focus, and the key is consumed
 *   'game'     everything else goes to the game as if nothing were focused
 */
export interface FocusInfo { tag: string; type?: string }
export type KeyOwner = 'control' | 'release' | 'game';

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export function keyOwner(focus: FocusInfo | null, key: string): KeyOwner {
  if (!focus) return 'game';
  const tag = focus.tag.toUpperCase();
  if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return 'game';
  if (key === 'Escape') return 'release';
  if (tag === 'SELECT') return 'control';
  if (tag === 'TEXTAREA') return 'control';
  const type = (focus.type ?? 'text').toLowerCase();
  if (type === 'range') return SLIDER_KEYS.has(key) ? 'control' : 'game';
  if (type === 'checkbox' || type === 'radio') return key === ' ' || key === 'Enter' ? 'control' : 'game';
  if (type === 'button' || type === 'submit') return 'game';
  return 'control';   // text, number, search …
}
