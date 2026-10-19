import { describe, it, expect } from 'vitest';
import { portrait, faceFor, CREW } from './capcom';

describe('CAPCOM faces', () => {
  it('picks the expression portrait, falling back along dizzy → serious and angry → sad', () => {
    expect(portrait('capybara', 'dizzy')).toBe('assets/capcom/capcom_capybara_dizzy.png');
    expect(portrait('duck', 'dizzy')).toBe('assets/capcom/capcom_duck_serious.png');
    expect(portrait('duck', 'angry')).toBe('assets/capcom/capcom_duck_sad.png');
    expect(portrait('lee', 'happy')).toBe(CREW.lee.img);
    expect(portrait('owl', 'angry')).toBe(CREW.owl.img);
  });
  it('maps flight events to faces', () => {
    expect(faceFor('zombie-sat')).toBe('happy');
    expect(faceFor('tumble')).toBe('dizzy');
    expect(faceFor('impact')).toBe('sad');
    expect(faceFor('decaying')).toBe('serious');
    expect(faceFor('stage')).toBe('neutral');
  });
});
