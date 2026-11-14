import type * as THREE_NS from 'three';
import { band } from './bands';
import { UNIT, UNIT_HEIGHT, type RoomPlan, type Slot } from './room';

type THREE = typeof THREE_NS;

/** How big one spine's label is in the atlas, and how many fit in a 2048px sheet. */
const STRIP = { w: 32, h: 256, sheet: 2048 };
const COLS = STRIP.sheet / STRIP.w;
const ROWS = STRIP.sheet / STRIP.h;
export const PER_SHEET = COLS * ROWS;
/** The band across the top of a spine, and the strip of plain colour kept clear for the other faces. */
const BAND_H = 26;
const PATCH_H = 20;

const BODY = '#2a2a2f';
/** The bookcases, the walls and the floor: a white room, as in the photograph. */
const WHITE = 0xf2f1ee;

/** Geometry built up by hand: one merged mesh per atlas beats a thousand boxes. */
interface Arrays {
  position: number[];
  normal: number[];
  uv: number[];
  colour: number[];
  index: number[];
}

const empty = (): Arrays => ({ position: [], normal: [], uv: [], colour: [], index: [] });

interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
}

/** Corners of a unit box, then the six faces as quads of those corners, outward normals in order. */
const FACES: [number[], [number, number, number]][] = [
  [[1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1], [1, 0, 0]],
  [[-1, 1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1], [-1, 0, 0]],
  [[-1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1], [0, 1, 0]],
  [[-1, -1, 1, -1, -1, -1, 1, -1, -1, 1, -1, 1], [0, -1, 0]],
  [[-1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1], [0, 0, 1]],
  [[1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1, -1], [0, 0, -1]],
];

/**
 * Adds one box, or only some of its faces. Faces keep the order +x, -x, +y, -y, +z, -z, so the front of a
 * case is face 4 and its top is face 2. A textured face takes its rectangle from `uv`; every other face is
 * painted, because a face that samples a single texel of the atlas turns to mush at the first mip level.
 */
function pushBox(
  a: Arrays,
  box: Box,
  uv: [number, number, number, number][] | null,
  colour?: [number, number, number] | ((face: number) => [number, number, number]),
  only?: number[],
  turn?: boolean,
) {
  const yaw = box.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const half = [box.w / 2, box.h / 2, box.d / 2];
  FACES.forEach((face, f) => {
    if (only && !only.includes(f)) return;
    const [corners, n] = face;
    const paint = typeof colour === 'function' ? colour(f) : colour;
    const base = a.position.length / 3;
    for (let c = 0; c < 4; c++) {
      const lx = corners[c * 3] * half[0];
      const ly = corners[c * 3 + 1] * half[1];
      const lz = corners[c * 3 + 2] * half[2];
      a.position.push(box.x + lx * cos + lz * sin, box.y + ly, box.z - lx * sin + lz * cos);
      a.normal.push(n[0] * cos + n[2] * sin, n[1], -n[0] * sin + n[2] * cos);
      if (paint) a.colour.push(paint[0], paint[1], paint[2]);
    }
    if (uv) {
      const [u0, v0, u1, v1] = uv[0];
      // A box on its side reads along its length, left to right, with the title the right way up.
      if (turn) a.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      else a.uv.push(u0, v1, u0, v0, u1, v0, u1, v1);
    }
    a.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
}

function geometry(three: THREE, a: Arrays, withUv: boolean, withColour: boolean): THREE_NS.BufferGeometry {
  const g = new three.BufferGeometry();
  g.setAttribute('position', new three.Float32BufferAttribute(a.position, 3));
  g.setAttribute('normal', new three.Float32BufferAttribute(a.normal, 3));
  if (withUv) g.setAttribute('uv', new three.Float32BufferAttribute(a.uv, 2));
  if (withColour) g.setAttribute('color', new three.Float32BufferAttribute(a.colour, 3));
  g.setIndex(a.index);
  return g;
}

/** Fits a title into the height of a spine, cutting it short the way a real spine does. */
function fit(ctx: CanvasRenderingContext2D, title: string, max: number): string {
  if (ctx.measureText(title).width <= max) return title;
  let cut = title;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trim()}…`;
}

/** One sheet of spine labels: a band of the platform's colour, the title down the spine, nothing else. */
function drawSheet(spines: { title: string; platform: string }[], from: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = STRIP.sheet;
  canvas.height = STRIP.sheet;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BODY;
  ctx.fillRect(0, 0, STRIP.sheet, STRIP.sheet);
  for (let i = 0; i < PER_SHEET && from + i < spines.length; i++) {
    const spine = spines[from + i];
    const [bandColour, labelColour, label] = band(spine.platform);
    const x = (i % COLS) * STRIP.w;
    const y = Math.floor(i / COLS) * STRIP.h;
    ctx.fillStyle = BODY;
    ctx.fillRect(x, y, STRIP.w, STRIP.h);
    // The same rounded shading the flat shelf uses, so a run of boxes reads as boxes and not as stripes.
    const shade = ctx.createLinearGradient(x, 0, x + STRIP.w, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.42)');
    shade.addColorStop(0.45, 'rgba(255,255,255,0.07)');
    shade.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, STRIP.w, STRIP.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, 1, STRIP.h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x + STRIP.w - 1, y, 1, STRIP.h);
    ctx.fillStyle = bandColour;
    ctx.fillRect(x + 1, y, STRIP.w - 2, BAND_H);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 1, y + BAND_H - 1, STRIP.w - 2, 1);
    ctx.save();
    ctx.translate(x + STRIP.w / 2, y + BAND_H / 2);
    ctx.fillStyle = labelColour;
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0.5, STRIP.w - 4);
    ctx.restore();
    ctx.save();
    // The title reads bottom to top, as it does on a shelf.
    ctx.translate(x + STRIP.w / 2, y + STRIP.h - PATCH_H - 6);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#f4f2ed';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, spine.title, STRIP.h - BAND_H - PATCH_H - 14), 0, 0);
    ctx.restore();
  }
  return canvas;
}

export interface Fixture {
  kind: 'console' | 'crate';
  index: number;
}

export interface Built {
  /** The label faces, one mesh per atlas sheet: two triangles each, so a hit's face index halves into `slots`. */
  labels: { mesh: THREE_NS.Mesh; from: number; slots: Slot[] }[];
  /** Every other face of every box, painted rather than textured: ten triangles each. */
  bodies: THREE_NS.Mesh;
  slots: Slot[];
  furniture: THREE_NS.Mesh;
  /** The consoles and the crates of loose games: pickable, twelve triangles each. */
  fixtures: { mesh: THREE_NS.Mesh; items: Fixture[] };
  textures: THREE_NS.Texture[];
}

/** Where a spine's label sits in its sheet. */
function rect(i: number): [number, number, number, number] {
  const slot = i % PER_SHEET;
  const cx = (slot % COLS) * STRIP.w;
  const cy = Math.floor(slot / COLS) * STRIP.h;
  const u = (px: number) => px / STRIP.sheet;
  // Flipped on v, as texture space runs up from the bottom.
  const v = (px: number) => 1 - px / STRIP.sheet;
  return [u(cx + 0.5), v(cy + STRIP.h - 0.5), u(cx + STRIP.w - 0.5), v(cy + 0.5)];
}

export function buildScene(three: THREE, scene: THREE_NS.Scene, plan: RoomPlan): Built {
  const spines = plan.slots.map((s) => ({ title: s.title, platform: s.game.platform }));
  const sheets = Math.max(1, Math.ceil(spines.length / PER_SHEET));
  const textures: THREE_NS.Texture[] = [];
  const labels: Built['labels'] = [];
  const dark = new three.Color(BODY);
  const body = empty();

  for (let sheet = 0; sheet < sheets; sheet++) {
    const texture = new three.CanvasTexture(drawSheet(spines, sheet * PER_SHEET));
    texture.colorSpace = three.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    const a = empty();
    const mine: Slot[] = [];
    plan.slots.forEach((slot, i) => {
      if (Math.floor(i / PER_SHEET) !== sheet) return;
      pushBox(a, slot, [rect(i)], undefined, [4], slot.flat);
      mine.push(slot);
    });
    const mesh = new three.Mesh(geometry(three, a, true, false), new three.MeshLambertMaterial({ map: texture }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    labels.push({ mesh, from: sheet * PER_SHEET, slots: mine });
  }

  for (const slot of plan.slots) {
    const top = new three.Color(band(slot.game.platform)[0]);
    pushBox(
      body,
      slot,
      null,
      // The top of a case shows its platform's colour; the rest is the dark of the case itself.
      (face) => (face === 2 ? [top.r, top.g, top.b] : [dark.r * 0.8, dark.g * 0.8, dark.b * 0.8]),
      [0, 1, 2, 3, 5],
    );
  }
  const bodies = new three.Mesh(geometry(three, body, false, true), new three.MeshLambertMaterial({ vertexColors: true }));
  bodies.frustumCulled = false;
  scene.add(bodies);

  // Room and bookcases, all one mesh: nothing here needs its own material.
  const f = empty();
  const { width, depth, height } = plan.room;
  const grey = (v: number): [number, number, number] => [v, v, v];
  const hex = (h: string): [number, number, number] => {
    const c = new three.Color(h);
    return [c.r, c.g, c.b];
  };
  const white = new three.Color(WHITE);
  const board: [number, number, number] = [white.r, white.g, white.b];
  const shade: [number, number, number] = [white.r * 0.84, white.g * 0.84, white.b * 0.84];

  pushBox(f, { x: 0, y: -0.05, z: 0, w: width, h: 0.1, d: depth }, null, grey(0.52));
  pushBox(f, { x: 0, y: height + 0.05, z: 0, w: width, h: 0.1, d: depth }, null, grey(0.9));
  for (const wall of [
    { x: 0, y: height / 2, z: -depth / 2 - 0.05, w: width + 0.2, h: height, d: 0.1 },
    { x: 0, y: height / 2, z: depth / 2 + 0.05, w: width + 0.2, h: height, d: 0.1 },
    { x: -width / 2 - 0.05, y: height / 2, z: 0, w: 0.1, h: height, d: depth },
    { x: width / 2 + 0.05, y: height / 2, z: 0, w: 0.1, h: height, d: depth },
  ]) {
    pushBox(f, wall, null, grey(0.86));
  }

  const inner = UNIT.width - UNIT.panel * 2;
  plan.units.forEach((unit, i) => {
    const side = (dir: number) =>
      pushBox(
        f,
        { x: unit.x + dir * (UNIT.width / 2 - UNIT.panel / 2), y: UNIT_HEIGHT / 2, z: unit.z, w: UNIT.panel, h: UNIT_HEIGHT, d: UNIT.depth },
        null,
        board,
      );
    // Units stand flush against each other, so only the ends of the run show a side panel.
    side(-1);
    if (i === plan.units.length - 1) side(1);
    pushBox(f, { x: unit.x, y: UNIT_HEIGHT / 2, z: unit.z - UNIT.depth / 2 + UNIT.back / 2, w: inner, h: UNIT_HEIGHT, d: UNIT.back }, null, shade);
    pushBox(f, { x: unit.x, y: UNIT.plinth / 2, z: unit.z, w: inner, h: UNIT.plinth, d: UNIT.depth }, null, shade);
    pushBox(f, { x: unit.x, y: UNIT_HEIGHT - UNIT.panel / 2, z: unit.z, w: inner, h: UNIT.panel, d: UNIT.depth }, null, board);
    // The seam where the extension unit sits on the bookcase.
    pushBox(f, { x: unit.x, y: UNIT.body + UNIT.panel / 2, z: unit.z, w: inner, h: UNIT.panel, d: UNIT.depth }, null, shade);
    for (const y of unit.shelves) {
      pushBox(f, { x: unit.x, y: y + UNIT.panel / 2, z: unit.z, w: inner, h: UNIT.panel, d: UNIT.depth - UNIT.back }, null, board);
    }
  });

  const furniture = new three.Mesh(geometry(three, f, false, true), new three.MeshLambertMaterial({ vertexColors: true }));
  furniture.frustumCulled = false;
  scene.add(furniture);

  // The consoles and the crates are their own mesh so a ray can tell which one it hit.
  const fix = empty();
  const items: Fixture[] = [];
  plan.consoles.forEach((c, i) => {
    pushBox(fix, { x: c.x, y: c.y + c.h / 2, z: c.z, w: c.w, h: c.h, d: c.d }, null, hex(band(c.name)[0]));
    items.push({ kind: 'console', index: i });
  });
  plan.crates.forEach((c, i) => {
    const colour = new three.Color(c.colour);
    pushBox(fix, { x: c.x, y: c.y, z: c.z, w: c.w, h: c.h, d: c.d }, null, (face) =>
      // Open at the top, so it reads as a box of loose games rather than another case.
      face === 2 ? [colour.r * 0.35, colour.g * 0.35, colour.b * 0.35] : [colour.r * 0.9 + 0.1, colour.g * 0.9 + 0.1, colour.b * 0.9 + 0.1],
    );
    items.push({ kind: 'crate', index: i });
  });
  const fixtures = {
    mesh: new three.Mesh(geometry(three, fix, false, true), new three.MeshLambertMaterial({ vertexColors: true })),
    items,
  };
  fixtures.mesh.frustumCulled = false;
  scene.add(fixtures.mesh);

  return { labels, bodies, slots: plan.slots, furniture, fixtures, textures };
}
