/**
 * One place to register every external 3D model and its credit line.
 * Download the .glb files yourself into /public/models/ — they're large and
 * shouldn't live in git history (use Git LFS or a release asset if needed).
 *
 * NASA media is generally not copyrighted, but NASA asks for credit and
 * forbids implying endorsement. ESA models carry their own terms — check
 * each model page before shipping and record the licence here.
 */
export interface ModelEntry {
  file: string;          // path under /public/models/
  sizeMeters: number;    // real-world longest dimension, used for scaling
  credit: string;
  source: string;        // URL of the model page
  licence: string;
}

export const MODEL_MANIFEST = {
  // Fill these in as you download models. Examples of the shape:
  'voyager': {
    file: 'nasa/voyager.glb',
    sizeMeters: 13,      // magnetometer boom tip-to-tip is longer; adjust per model
    credit: 'NASA/JPL-Caltech',
    source: 'https://science.nasa.gov/3d-resources/',
    licence: 'NASA media usage guidelines',
  },
  'dart': {
    file: 'nasa/dart.glb',
    sizeMeters: 19,      // with ROSA solar arrays deployed
    credit: 'NASA/Johns Hopkins APL',
    source: 'https://science.nasa.gov/3d-resources/',
    licence: 'NASA media usage guidelines',
  },
  'rosetta': {
    file: 'esa/rosetta.glb',
    sizeMeters: 32,
    credit: 'ESA',
    source: 'https://scifleet.esa.int/',
    licence: 'Check model page',
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelId = keyof typeof MODEL_MANIFEST;
