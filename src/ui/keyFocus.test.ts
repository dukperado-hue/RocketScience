import { describe, it, expect } from 'vitest';
import { keyOwner } from './keyFocus';

const slider = { tag: 'INPUT', type: 'range' };

describe('keys while a control has focus', () => {
  it('flight keys work straight after dragging a slider (Space, R, T, Z/X, A/D, warp)', () => {
    for (const k of [' ', 'r', 'R', 't', 'z', 'x', 'a', 'd', '1', '4', 'Tab']) expect(keyOwner(slider, k)).toBe('game');
  });
  it('arrow keys still move a focused slider (keyboard accessibility)', () => {
    expect(keyOwner(slider, 'ArrowLeft')).toBe('control');
    expect(keyOwner(slider, 'Home')).toBe('control');
  });
  it('Esc lets go of the focus instead of leaving the launch screen', () => {
    expect(keyOwner(slider, 'Escape')).toBe('release');
    expect(keyOwner({ tag: 'SELECT' }, 'Escape')).toBe('release');
    expect(keyOwner({ tag: 'INPUT', type: 'checkbox' }, 'Escape')).toBe('release');
  });
  it('typing fields and drop-downs keep their keys', () => {
    expect(keyOwner({ tag: 'INPUT', type: 'text' }, 'r')).toBe('control');
    expect(keyOwner({ tag: 'SELECT' }, ' ')).toBe('control');
  });
  it('a focused checkbox keeps Space for toggling but not the other keys', () => {
    expect(keyOwner({ tag: 'INPUT', type: 'checkbox' }, ' ')).toBe('control');
    expect(keyOwner({ tag: 'INPUT', type: 'checkbox' }, 'r')).toBe('game');
  });
  it('nothing focused, or a button: the game', () => {
    expect(keyOwner(null, ' ')).toBe('game');
    expect(keyOwner({ tag: 'BUTTON' }, ' ')).toBe('game');
  });
});
