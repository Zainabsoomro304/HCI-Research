/**
 * Programmatic flat grocery illustrations: simple shapes on a category-coloured tile.
 * All tiles share the same lightness and every drawing uses the same small palette, so no category looks more
 * attractive than another. viewBox 160x120 (4:3). imageId = "<icon>--<variant>"; the variant picks the label colour.
 */
import type { Category } from "@/config/shop";

export const CATEGORY_TILE: Record<Category, string> = {
  fruitsVeg: "#E3F0D8",
  grains: "#F4EAD5",
  dairy: "#E1ECF5",
  spices: "#F7E2D6",
  tea: "#E9E3D3",
  oil: "#F5EFCB",
  bakery: "#F3E4DA",
  cleaning: "#DDEEF0",
};

/** Label colours (moderate saturation, similar lightness). */
const ACCENTS = ["#D9693F", "#2F8A6E", "#4C72C9", "#C98B23", "#8E5CB8", "#C24D6A", "#3C8DA8"] as const;

const DARK = "#3B434C";
const WHITE = "#FFFFFF";
const CREAM = "#FFF6E3";
const KRAFT = "#D9B98C";
const KRAFT_D = "#B8946A";
const STEEL = "#C9D1D9";
const LEAF = "#5E9F55";
const LEAF_D = "#447D3E";

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount))));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

interface Pal {
  a: string;
  m: string;
  s: string;
}

const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const C = (cx: number, cy: number, r: number, fill: string, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const P = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
const S = (d: string, stroke: string, w: number) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shadow = (cx = 80, cy = 104, rx = 40) => E(cx, cy, rx, 5, "#000", 'opacity="0.08"');

/** A label band with two text lines, used on packs. */
const label = (x: number, y: number, w: number, h: number, p: Pal) =>
  R(x, y, w, h, 4, p.a) + R(x + w * 0.18, y + h * 0.3, w * 0.64, h * 0.14, 2, WHITE, 'opacity="0.9"') + R(x + w * 0.28, y + h * 0.58, w * 0.44, h * 0.12, 2, WHITE, 'opacity="0.65"');

const ICONS: Record<string, (p: Pal) => string> = {
  // ---- fruit & vegetables (natural colours; the variant tints a small leaf or tag) ----
  banana: () =>
    shadow() +
    P("M40 70c18 22 58 26 82 6 4-3 7 0 4 4-22 26-72 24-92-4-3-5 2-10 6-6Z", "#F2C94C") +
    P("M46 60c18 22 56 26 80 6 4-3 7 0 4 4-22 26-72 24-90-4-3-5 2-10 6-6Z", "#F7D766") +
    P("M118 64l8-10 4 3-6 9Z", "#7B6A3A"),
  apple: () =>
    shadow() +
    [52, 80, 108].map((x, i) => C(x, 70 - (i === 1 ? 8 : 0), 22, i === 1 ? "#D64545" : "#C93C3C") + S(`M${x} ${48 - (i === 1 ? 8 : 0)}q2-8 6-10`, "#6B4F2A", 3) + E(x + 9, 44 - (i === 1 ? 8 : 0), 7, 3.5, LEAF)).join(""),
  orange: () => shadow() + [54, 106, 80].map((x, i) => C(x, i === 2 ? 58 : 74, 22, "#F29B2E") + C(x - 6, (i === 2 ? 58 : 74) - 7, 5, "#F7B95C")).join("") + E(84, 37, 7, 3.5, LEAF),
  guava: () => shadow() + [56, 104, 80].map((x, i) => E(x, i === 2 ? 60 : 74, 21, 23, "#9CC45A") + C(x - 6, (i === 2 ? 60 : 74) - 8, 5, "#B9D87F")).join("") + P("M80 36l2-6 3 1-2 6Z", "#6B4F2A"),
  mango: () => shadow() + P("M52 52c24-18 64-10 70 22 4 22-22 32-46 24-22-8-38-30-24-46Z", "#F2B233") + P("M60 56c14-10 34-8 42 4", "none", 'stroke="#F7D07A" stroke-width="5" stroke-linecap="round"') + P("M112 50l10-8 3 3-9 8Z", LEAF_D),
  lemon: () => shadow() + [60, 100].map((x) => E(x, 72, 22, 17, "#F4D23C") + E(x - 5, 66, 6, 4, "#F9E57D")).join("") + E(82, 52, 8, 4, LEAF),
  onion: () =>
    shadow() +
    [56, 104].map((x) => P(`M${x} 46c-22 10-26 40-6 50h12c20-10 16-40-6-50Z`, "#B4466A") + S(`M${x} 52v38`, "#D879A0", 2.5) + S(`M${x} 46v-10`, "#8FA65A", 4)).join(""),
  tomato: () => shadow() + [56, 104, 80].map((x, i) => C(x, i === 2 ? 62 : 76, 21, "#E2483C") + P(`M${x - 8} ${(i === 2 ? 62 : 76) - 20}l8 5 8-5-4 8h-8Z`, LEAF)).join(""),
  potato: () => shadow() + [[58, 74], [102, 76], [80, 58]].map(([x, y]) => E(x!, y!, 24, 18, "#C9A06A") + C(x! - 7, y! - 4, 2, "#9F7A4A") + C(x! + 8, y! + 4, 2, "#9F7A4A")).join(""),
  carrot: () => shadow() + [0, 1, 2].map((i) => P(`M${48 + i * 22} 40l14 0-6 60h-2Z`, "#EE8A2E") + P(`M${50 + i * 22} 40c-4-10 4-14 6-6 2-8 10-4 6 6Z`, LEAF)).join(""),
  ginger: () => shadow() + P("M42 74c0-12 18-14 22-6 4-12 22-14 26-4 6-8 24-4 22 8 8 4 6 16-4 16H52c-12 0-16-8-10-14Z", "#D6AE6E") + S("M62 74v10M88 72v12", "#B48C52", 2.5),
  garlic: () => shadow() + [60, 100].map((x) => P(`M${x} 44c-16 12-24 30-14 46h28c10-16 2-34-14-46Z`, "#F3EEE2") + S(`M${x} 50v38M${x - 9} 56l4 32M${x + 9} 56l-4 32`, "#D9CFBC", 2) + S(`M${x} 44v-8`, "#B8AE96", 3)).join(""),
  cauliflower: () =>
    shadow() + P("M40 72c-6 16 18 30 40 30s46-14 40-30Z", LEAF) + [56, 72, 88, 104, 64, 80, 96].map((x, i) => C(x, i < 4 ? 66 : 54, 13, i % 2 ? "#F5F0DC" : "#FBF7E8")).join(""),
  // ---- packs ----
  sack: (p) => shadow() + P("M50 30h60l6 70H44Z", KRAFT) + P("M50 30l-4-6h68l-4 6Z", KRAFT_D) + label(54, 52, 52, 30, p) + S("M58 26l4 4M76 26l4 4M94 26l4 4", KRAFT_D, 2),
  pouch: (p) => shadow() + P("M56 26h48l6 74H50Z", p.s) + R(56, 26, 48, 8, 2, p.m) + label(58, 50, 44, 26, p) + R(66, 82, 28, 12, 6, "#E9C46A", 'opacity="0.9"'),
  bag: (p) => shadow() + R(54, 28, 52, 72, 6, WHITE) + R(54, 28, 52, 10, 3, p.a) + label(58, 50, 44, 28, p) + R(66, 84, 28, 6, 3, p.s),
  block: () => shadow() + R(48, 50, 64, 48, 8, "#B07A3E") + R(54, 56, 52, 10, 4, "#C99358", 'opacity="0.7"') + P("M48 58l64 0", "none", 'stroke="#8E5F2C" stroke-width="2"'),
  carton: (p) => shadow() + P("M60 32h40v68H60Z", WHITE) + P("M60 32l8-12h24l8 12Z", p.s) + R(60, 52, 40, 28, 2, p.a) + P("M72 62c4-6 12-6 16 0", "none", `stroke="${WHITE}" stroke-width="3" stroke-linecap="round"`),
  eggs: () =>
    shadow() + R(36, 66, 88, 30, 8, "#C9B697") + [48, 64, 80, 96, 112].map((x, i) => E(x, 66, 8, 11, i % 2 ? "#F4E4C8" : "#EAD3AE")).join("") + R(36, 76, 88, 4, 2, "#B5A07D"),
  butter: (p) => shadow() + R(42, 56, 76, 40, 6, "#F7E3A1") + P("M42 56l14-14h76l-14 14Z", "#FBEDBE") + R(52, 68, 48, 16, 4, p.a) + R(58, 74, 30, 4, 2, WHITE),
  tub: (p) => shadow() + P("M50 46h60l-6 52H56Z", WHITE) + R(46, 38, 68, 10, 4, p.a) + R(60, 62, 40, 18, 4, p.s) + R(68, 68, 24, 4, 2, WHITE),
  cheese: () => shadow() + P("M40 82l40-36 40 36Z", "#F2CD5D") + R(40, 82, 80, 14, 3, "#E9BC3D") + C(70, 72, 5, "#E0AE2E") + C(92, 76, 4, "#E0AE2E") + C(80, 90, 3, "#D9A425"),
  tin: (p) => shadow() + R(54, 36, 52, 62, 6, STEEL) + E(80, 36, 26, 7, "#DCE3EA") + R(54, 54, 52, 28, 0, p.a) + R(64, 62, 32, 5, 2, WHITE) + R(70, 71, 20, 4, 2, WHITE, 'opacity="0.7"'),
  bottle: (p) => shadow() + P("M72 22h16v14c10 6 12 12 12 22v38a4 4 0 0 1-4 4H64a4 4 0 0 1-4-4V58c0-10 2-16 12-22Z", "#E8F1F5") + R(72, 18, 16, 8, 2, p.m) + label(62, 58, 36, 26, p),
  spice: (p) => shadow() + R(58, 40, 44, 58, 6, "#C7563A") + R(56, 30, 48, 12, 4, p.m) + R(62, 56, 36, 24, 3, CREAM) + R(68, 62, 24, 4, 2, p.a) + R(72, 70, 16, 3, 1.5, p.a),
  salt: (p) => shadow() + R(58, 34, 44, 64, 6, WHITE) + R(58, 34, 44, 14, 6, p.a) + R(64, 58, 32, 22, 3, p.s) + C(80, 69, 5, WHITE),
  jar: (p) => shadow() + R(58, 34, 44, 10, 3, p.m) + P("M56 44h48v48a6 6 0 0 1-6 6H62a6 6 0 0 1-6-6Z", "#C2554A") + R(60, 58, 40, 22, 3, CREAM) + R(68, 64, 24, 4, 2, p.a) + R(72, 72, 16, 3, 1.5, p.a),
  packet: (p) => shadow() + P("M52 30h56l-4 68H56Z", p.a) + P("M52 30l4-6h48l4 6Z", p.m) + R(62, 46, 36, 30, 4, CREAM) + C(80, 61, 8, "#D9693F"),
  teabox: (p) => shadow() + R(46, 40, 68, 58, 4, p.a) + P("M46 40l12-12h68l-12 12Z", p.s) + P("M114 40l12-12v58l-12 12Z", p.m) + R(54, 56, 52, 26, 3, CREAM) + E(80, 69, 10, 6, LEAF),
  honey: () => shadow() + R(58, 32, 44, 10, 3, "#7A5A2E") + P("M56 42h48v50a6 6 0 0 1-6 6H62a6 6 0 0 1-6-6Z", "#E9A825") + R(62, 58, 36, 20, 3, CREAM) + P("M74 66l6-4 6 4v6l-6 4-6-4Z", "#E9A825"),
  juice: (p) => shadow() + P("M60 34h40v64H60Z", "#F6B23A") + P("M60 34l8-12h24l8 12Z", p.s) + R(60, 54, 40, 26, 2, p.a) + C(80, 67, 7, "#F6B23A"),
  can: (p) => shadow() + [60, 80, 100].map((x) => R(x - 9, 46, 18, 50, 4, p.a) + R(x - 9, 46, 18, 5, 2, STEEL) + R(x - 5, 64, 10, 12, 2, WHITE, 'opacity="0.8"')).join(""),
  oilbottle: (p) => shadow() + R(74, 20, 12, 8, 2, p.m) + P("M74 28h12l4 10c8 4 10 10 10 18v40a4 4 0 0 1-4 4H64a4 4 0 0 1-4-4V56c0-8 2-14 10-18Z", "#F4D35E") + label(62, 60, 36, 24, p),
  ghee: (p) => shadow() + R(52, 40, 56, 58, 6, "#E9C46A") + E(80, 40, 28, 7, "#F2D88A") + R(52, 56, 56, 26, 0, p.a) + E(80, 69, 12, 7, CREAM),
  bread: () => shadow() + P("M40 58c0-14 12-20 24-20h32c12 0 24 6 24 20v6H40Z", "#D9963F") + R(44, 62, 72, 34, 6, "#E8AE5F") + [58, 72, 86, 100].map((x) => S(`M${x} 66v26`, "#D9963F", 2.5)).join(""),
  rusk: () => shadow() + [0, 1, 2, 3].map((i) => R(42 + i * 20, 54 - (i % 2) * 6, 18, 42, 4, i % 2 ? "#D9A15A" : "#E4B46F") + C(51 + i * 20, 66 - (i % 2) * 6, 2, "#B97E3A")).join(""),
  biscuit: (p) => shadow() + R(40, 58, 80, 38, 18, p.a) + [56, 72, 88, 104].map((x) => C(x, 58, 12, "#E2B57A") + C(x - 3, 56, 1.5, "#B98A50") + C(x + 3, 60, 1.5, "#B98A50")).join(""),
  chips: (p) => shadow() + P("M54 30h52l-4 68H58Z", p.a) + P("M54 30l4-6h44l4 6Z", p.m) + E(80, 62, 16, 12, "#F2C14E") + E(76, 60, 6, 4, "#F7D77F"),
  cake: () => shadow() + R(44, 62, 72, 34, 6, "#B5763C") + R(44, 56, 72, 12, 6, "#F3E2C3") + [58, 76, 94].map((x, i) => C(x, 80, 3, ["#C24D6A", "#2F8A6E", "#D9693F"][i]!)).join(""),
  box: (p) => shadow() + R(52, 42, 56, 56, 4, WHITE) + P("M52 42l10-10h52l-6 10Z", p.s) + R(52, 54, 56, 26, 0, p.a) + R(62, 62, 36, 5, 2, WHITE),
  // ---- cleaning ----
  liquid: (p) => shadow() + R(70, 20, 20, 10, 3, p.m) + P("M66 30h28l6 10v54a6 6 0 0 1-6 6H66a6 6 0 0 1-6-6V40Z", p.s) + label(62, 54, 36, 28, p),
  detergent: (p) => shadow() + R(46, 34, 68, 64, 5, p.a) + R(46, 34, 68, 12, 5, p.m) + C(80, 70, 16, WHITE) + C(80, 70, 9, "#8EC5E8") + C(98, 52, 3, WHITE, 'opacity="0.8"'),
  sponge: () => shadow() + [0, 1, 2].map((i) => R(44 + i * 26, 60 - i * 4, 24, 36, 4, ["#F2C94C", "#7BC47F", "#6FA8DC"][i]!) + R(44 + i * 26, 60 - i * 4, 24, 9, 3, "#3E8E5A")).join(""),
  scrubber: () => shadow() + [60, 100].map((x) => C(x, 74, 22, STEEL) + S(`M${x - 14} ${66}q14-10 28 0M${x - 16} 76q16-10 32 0M${x - 12} 86q12-8 24 0`, "#9AA6B2", 2)).join(""),
  soap: (p) => shadow() + [0, 1, 2].map((i) => R(40 + i * 28, 66 - (i === 1 ? 8 : 0), 26, 30, 7, i === 1 ? p.a : p.s) + E(53 + i * 28, 74 - (i === 1 ? 8 : 0), 6, 3, WHITE, 'opacity="0.6"')).join(""),
  bags: (p) => shadow() + R(46, 48, 68, 46, 23, DARK) + C(80, 71, 12, "#59626C") + C(80, 71, 5, DARK) + R(100, 48, 24, 10, 3, p.a),
  spray: (p) => shadow() + P("M72 28h20l6 8H72Z", p.m) + R(66, 36, 24, 8, 2, p.m) + P("M64 44h30l4 10v40a6 6 0 0 1-6 6H66a6 6 0 0 1-6-6V54Z", "#BFE3EE") + label(62, 62, 34, 24, p),
  broom: () => shadow() + S("M96 24L72 74", "#9B6B3F", 5) + P("M64 70l20 8-14 22-28-10Z", "#D9B256") + S("M52 92l12-18M58 96l12-18M64 98l12-18", "#B8913A", 2),
  mop: () => shadow() + S("M88 22L76 72", "#8F9AA6", 5) + R(58, 70, 40, 8, 3, "#5C6670") + [0, 1, 2, 3, 4].map((i) => S(`M${62 + i * 8} 78q-2 12 0 22`, "#E5E7EA", 5)).join(""),
};

export const ICON_NAMES: readonly string[] = Object.keys(ICONS);

export function hasIcon(icon: string): boolean {
  return icon in ICONS;
}

export function renderProductSvg(imageId: string, _category: Category): string {
  const [icon, variant] = imageId.split("--");
  const draw = ICONS[icon!];
  if (!draw) throw new Error(`No illustration for ${imageId}`);
  const a = ACCENTS[(Number(variant) - 1) % ACCENTS.length]!;
  const pal: Pal = { a, m: shade(a, -0.18), s: shade(a, 0.45) };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120">${draw(pal)}</svg>\n`;
}
