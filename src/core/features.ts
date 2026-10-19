/**
 * Feature flags. Each defaults to the shipped behaviour; a player (or a test page) can
 * switch one off with localStorage `rs.flag.<name>` = 'off'.
 */
const read = (name: string, dflt: boolean) => { try { const v = localStorage.getItem(`rs.flag.${name}`); return v === 'off' ? false : v === 'on' ? true : dflt; } catch { return dflt; } };

export const FEATURES = {
  /** J2: craters change the ground the physics collides with (Flight `terrain` option) */
  terrainCollision: read('terrain', true),
  /** J1: hit-stop and slow motion on impacts */
  timeFx: read('timefx', true),
};
