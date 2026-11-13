/**
 * Katie's rig geometry and palette, in rig units (source pixels of the 652 x 673 art, y down).
 * Mirrors docs/katie-art/rig.json; see docs/KATIE-ART.md for how each number was measured.
 * Where a value differs from rig.json it is marked "tuned" with the reason.
 */

export type Vec = readonly [number, number]

export const VIEW_W = 652
export const VIEW_H = 1544
export const GROUND = 1544
/** Feet centre at rest: the point the stage anchors on the floor and the facing flip mirrors about. */
export const FEET: Vec = [310, GROUND]

export const INK = '#1b1b1e'
/** Silhouette, interior and fine-seam stroke widths (KATIE-ART.md section 2). */
export const SW = 4.5
export const SW_IN = 3
export const SW_SEAM = 2

/** Stored-byte palette sampled from the art; shoe colours are proposed (not in the art). */
export const COLOR = {
  scrubLit: '#668bc1',
  scrubShade: '#46699d',
  scrubHighlight: '#8db3dc',
  skin: '#fbaf85',
  skinShade: '#d78064',
  skinLens: '#f5c8b3',
  shoe: '#fdfdfd',
  shoeShade: '#d9dee6',
  sole: '#eef0f4',
} as const

export type Side = 'L' | 'R'

/** Rest-pose joint centres. L / R = screen left / right with the rig facing right (rig.json sL / sR). */
export const JOINT = {
  neck: [322, 352] as Vec,
  shoulder: { L: [170, 440] as Vec, R: [482, 440] as Vec },
  elbow: { L: [143, 655] as Vec, R: [506, 655] as Vec },
  wrist: { L: [150, 845] as Vec, R: [500, 845] as Vec },
  hip: { L: [250, 800] as Vec, R: [370, 800] as Vec },
  knee: { L: [250, 1150] as Vec, R: [370, 1150] as Vec },
  ankle: { L: [250, 1478] as Vec, R: [370, 1478] as Vec },
} as const

/**
 * Outer widths (outline included) and hand length. tuned: the arms follow the art below the
 * sleeve hems (skin 116-175 and 471-540 at y 618, about 66 and 76 outer) rather than rig.json's
 * 58 / 66, so the drawn arm is as thick as the arm the raster lost; the hands are a little
 * longer than rig.json's 110 x 46 / 50 so they read at 96 px.
 */
export const ARM = {
  L: { elbow: 64, wrist: 46, handL: 110 },
  R: { elbow: 70, wrist: 50, handL: 114 },
} as const

export const LEG = {
  thighHip: 124,
  thighKnee: 100, // the shin starts at the same width, so the knee disc joins them
  shinHem: 94,
  pantsHemY: 1470,
  hemBand: 18,
} as const

export const SHOE = {
  heel: 40, // behind the ankle
  toe: 112, // ahead of the ankle (rig.json 116)
  sole: 16,
} as const

/** Lower scrub top: hidden top edge (50 units of overlap behind the raster), hem, hem band. */
export const TOP = {
  from: 620,
  hemY: 772,
  hemCentreY: 778,
  band: 18,
  /** Centre of the raster's side line per row (sampled from the torso layer), then the hem corner. */
  sideL: [[178.5, 620], [181.5, 640], [182.5, 650], [183, 660], [183.5, 671], [180, 772]] as Vec[],
  sideR: [[443.5, 620], [439, 640], [437, 650], [435.5, 660], [435.5, 671], [440, 772]] as Vec[],
} as const

export const PELVIS = { top: 740, crotchY: 846 } as const
