/**
 * Each platform's colours, as on its boxes; used for the spines on the Shelf view and the now-playing card.
 * The band at the top of each platform's spines: its case or banner colour, the label colour, and the label,
 * as on the platforms' boxes (black PlayStation banners, the PS2's blue case, white Nintendo cases, blue PS4 and Vita, green Xbox).
 */
export const BANDS: Record<string, [string, string, string]> = {
  PS1: ['#111111', '#ffffff', 'PS'],
  PS2: ['#2340a8', '#ffffff', 'PS2'],
  PS3: ['#111111', '#ffffff', 'PS3'],
  PS4: ['#0f5fa8', '#ffffff', 'PS4'],
  PSP: ['#111111', '#ffffff', 'PSP'],
  VITA: ['#2a6bc0', '#ffffff', 'VITA'],
  NDS: ['#ececec', '#4a4a4a', 'DS'],
  '3DS': ['#ececec', '#d4111b', '3DS'],
  Wii: ['#ececec', '#8a8a8a', 'Wii'],
  GCN: ['#111111', '#c9c9cf', 'GC'],
  GBA: ['#3d3a92', '#ffffff', 'GBA'],
  X360: ['#5ba52b', '#ffffff', '360'],
  XBOX: ['#2f7a1f', '#ffffff', 'XB'],
  Dreamcast: ['#e2572b', '#ffffff', 'DC'],
  Famicom: ['#b3202a', '#ffffff', 'FC'],
  PC: ['#1c1c1f', '#ffffff', 'PC'],
};
export const band = (platform: string): [string, string, string] => BANDS[platform] ?? ['#3a3a40', '#ffffff', platform.slice(0, 3)];
