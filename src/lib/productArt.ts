/**
 * Programmatic flat product illustrations: a category-coloured rounded tile plus a simple icon.
 * All tiles share the same lightness and the same accent palette so no category looks more attractive.
 * Output viewBox is 160x120 (4:3).
 */
import type { Category } from "@/config/shop";

export const CATEGORY_TILE: Record<Category, string> = {
  "Food & Snacks": "#FBE3D2",
  "Picnic & Outdoor": "#DCEFD8",
  "Home & Office": "#DDE7F6",
  Gifts: "#F5DFE9",
  "Sports & Fitness": "#F8EDCB",
  Kitchen: "#E7E0F4",
};

/** Accent colours (moderate saturation, similar lightness). */
const ACCENTS = ["#E07A5F", "#3D8B7D", "#5C7BD9", "#D69A35", "#9A6BC6"] as const;

const DARK = "#34404F";
const LIGHT = "#FFFFFF";
const WOOD = "#C89463";
const WOOD_DARK = "#9C6B43";
const LEAF = "#5E9F6A";
const LEAF_DARK = "#457F52";
const CHOC = "#6E4B3A";
const BISCUIT = "#E2B57A";
const STEEL = "#CDD4DC";
const FLAME = "#F2B33D";

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

interface Pal {
  a: string; // accent
  m: string; // accent, darker
  s: string; // accent, lighter
  d: string; // dark neutral
  l: string; // white
}

const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const C = (cx: number, cy: number, r: number, fill: string, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const P = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
const S = (d: string, stroke: string, w: number, extra = "") =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

/** Each icon draws inside roughly x 40..120, y 18..100 (centre 80,58). */
const ICONS: Record<string, (p: Pal) => string> = {
  can: (p) =>
    [55, 85]
      .map((x, i) =>
        [
          R(x - 14, 34, 28, 58, 6, i ? p.m : p.a),
          R(x - 12, 30, 24, 7, 3, STEEL),
          R(x - 14, 52, 28, 18, 0, p.l, 'opacity="0.9"'),
          C(x, 61, 5, i ? p.m : p.a),
        ].join(""),
      )
      .join(""),
  drinkbottle: (p) =>
    [62, 98]
      .map((x, i) =>
        [
          R(x - 6, 20, 12, 6, 2, p.d),
          R(x - 5, 26, 10, 12, 2, i ? p.s : p.s),
          R(x - 14, 36, 28, 60, 9, i ? p.m : p.a),
          R(x - 14, 54, 28, 20, 0, p.l, 'opacity="0.9"'),
        ].join(""),
      )
      .join(""),
  snackbox: (p) =>
    [
      C(62, 44, 9, BISCUIT),
      C(80, 40, 10, shade(BISCUIT, -0.15)),
      C(98, 45, 9, BISCUIT),
      R(44, 46, 72, 48, 6, p.a),
      P("M44 46 L34 34 L60 34 L70 46 Z", p.m),
      P("M116 46 L126 34 L100 34 L90 46 Z", p.m),
      R(58, 60, 44, 20, 4, p.l),
      C(80, 70, 5, p.a),
    ].join(""),
  chips: (p) =>
    [
      P("M52 26 h44 l-3 8 l3 8 v46 l-3 6 h-38 l-3 -6 v-46 l3 -8 z", p.a),
      S("M54 30 h40", p.m, 3),
      E(74, 62, 14, 16, p.l),
      P("M66 66 l8 -14 l8 14 z", BISCUIT),
      E(110, 84, 16, 10, p.m),
      E(110, 80, 13, 5, "#D9604A"),
    ].join(""),
  coffee: (p) =>
    [
      R(54, 24, 52, 72, 6, p.a),
      R(54, 24, 52, 12, 4, p.m),
      R(62, 48, 36, 32, 4, p.l),
      E(80, 64, 8, 11, CHOC, 'transform="rotate(25 80 64)"'),
      S("M77 56 q6 8 0 16", p.l, 2),
    ].join(""),
  teabox: (p) =>
    [
      R(46, 36, 68, 56, 5, p.a),
      R(54, 46, 52, 30, 3, p.l),
      E(80, 61, 14, 6, p.s),
      S("M106 36 v-12", p.d, 2),
      R(100, 14, 12, 10, 2, p.l, `stroke="${p.d}" stroke-width="1.5"`),
      S("M46 84 h68", p.m, 6),
    ].join(""),
  chocolate: (p) =>
    [
      R(38, 32, 84, 60, 8, p.a),
      R(46, 40, 68, 44, 5, p.l),
      ...[0, 1, 2].flatMap((c) => [0, 1].map((r) => C(60 + c * 20, 52 + r * 20, 7, CHOC))),
      R(76, 32, 8, 60, 0, p.m, 'opacity="0.9"'),
    ].join(""),
  bar: (p) =>
    [
      R(40, 40, 80, 40, 4, CHOC),
      ...[0, 1, 2, 3].map((i) => R(44 + i * 19, 44, 15, 32, 2, shade(CHOC, 0.12))),
      P("M40 40 h46 l-10 40 h-36 z", p.a),
      R(48, 52, 24, 16, 3, p.l),
      S("M86 40 l-10 40", p.m, 3),
    ].join(""),
  cookietin: (p) =>
    [
      R(42, 46, 76, 40, 4, p.a),
      E(80, 86, 38, 10, p.a),
      E(80, 46, 40, 11, p.m),
      E(80, 44, 38, 9, p.s),
      C(66, 44, 5, BISCUIT),
      C(80, 42, 5, BISCUIT),
      C(94, 44, 5, BISCUIT),
      R(42, 60, 76, 10, 0, p.l, 'opacity="0.85"'),
    ].join(""),
  cookie: (p) =>
    [
      ...[0, 1, 2].map((i) => R(48, 34 + i * 11, 64, 9, 3, i === 1 ? shade(BISCUIT, -0.08) : BISCUIT)),
      ...[0, 1, 2].flatMap((i) => [60, 76, 92].map((x) => C(x + (i % 2) * 6, 38.5 + i * 11, 1.4, shade(BISCUIT, -0.35)))),
      R(40, 58, 80, 34, 6, p.a),
      R(40, 66, 80, 14, 0, p.l, 'opacity="0.9"'),
      R(70, 69, 20, 8, 4, p.s),
    ].join(""),
  nuts: (p) =>
    [
      P("M50 30 h60 v58 q0 8 -8 8 h-44 q-8 0 -8 -8 z", p.a),
      R(50, 30, 60, 8, 2, p.m),
      E(80, 66, 18, 16, p.l),
      E(74, 62, 4, 6, BISCUIT),
      E(84, 60, 4, 6, shade(BISCUIT, -0.2)),
      E(80, 70, 4, 6, BISCUIT),
      C(88, 71, 3, CHOC),
      C(71, 71, 3, CHOC),
    ].join(""),
  blanket: (p) =>
    [
      R(36, 44, 88, 44, 8, p.a),
      ...[0, 1, 2].map((i) => R(52 + i * 24, 44, 8, 44, 0, p.l, 'opacity="0.55"')),
      R(36, 58, 88, 8, 0, p.l, 'opacity="0.55"'),
      R(36, 36, 88, 14, 7, p.m),
    ].join(""),
  mat: (p) =>
    [
      R(36, 46, 76, 32, 16, p.a),
      ...[0, 1, 2].map((i) => S(`M${52 + i * 16} 46 v32`, p.m, 3)),
      C(110, 62, 17, p.m),
      C(110, 62, 11, p.a),
      C(110, 62, 5, p.m),
    ].join(""),
  coolerbag: (p) =>
    [
      S("M60 42 q20 -26 40 0", p.d, 5),
      R(40, 40, 80, 52, 8, p.a),
      S("M44 48 h72", p.l, 2.5),
      R(54, 60, 52, 24, 5, p.m),
      R(76, 64, 8, 4, 2, p.l),
    ].join(""),
  backpack: (p) =>
    [
      S("M70 28 q10 -10 20 0", p.d, 5),
      R(52, 26, 56, 70, 16, p.a),
      R(60, 60, 40, 28, 8, p.m),
      S("M64 70 h32", p.l, 2.5),
      R(56, 40, 48, 4, 2, p.m),
    ].join(""),
  coolbox: (p) =>
    [
      R(40, 48, 80, 44, 6, p.a),
      R(36, 38, 88, 14, 5, p.l),
      R(36, 48, 88, 4, 0, shade(p.a, -0.15)),
      R(66, 60, 28, 8, 4, p.m),
      S("M64 38 v-8 h32 v8", p.d, 4),
    ].join(""),
  plates: (p) =>
    [
      C(76, 60, 32, p.l),
      C(76, 60, 32, "none", `stroke="${p.a}" stroke-width="4"`),
      C(76, 60, 20, p.s),
      S("M120 30 v60", p.d, 4),
      S("M114 30 v14 q6 6 12 0 v-14", p.d, 3),
      S("M38 32 q-6 22 0 30 v28", p.d, 4),
    ].join(""),
  bottle: (p) =>
    [
      R(70, 18, 20, 10, 3, p.d),
      R(72, 28, 16, 8, 2, p.m),
      R(60, 34, 40, 62, 12, p.a),
      R(66, 42, 6, 40, 3, p.l, 'opacity="0.45"'),
      R(60, 60, 40, 6, 0, p.m),
    ].join(""),
  towel: (p) =>
    [
      R(42, 34, 76, 56, 6, p.a),
      R(42, 34, 76, 16, 6, p.m),
      R(42, 74, 76, 6, 0, p.l, 'opacity="0.8"'),
      R(42, 82, 76, 3, 0, p.l, 'opacity="0.8"'),
    ].join(""),
  picnicbasket: (p) =>
    [
      S("M56 52 q24 -40 48 0", WOOD_DARK, 5),
      P("M40 50 h80 l-8 42 h-64 z", WOOD),
      ...[0, 1, 2].map((i) => S(`M${44 + i * 2} ${62 + i * 10} h${72 - i * 4}`, WOOD_DARK, 2.5)),
      R(36, 44, 88, 10, 4, p.a),
      ...[0, 1, 2, 3].map((i) => R(44 + i * 20, 44, 10, 10, 0, p.l, 'opacity="0.7"')),
    ].join(""),
  chair: (p) =>
    [
      S("M58 56 l40 38 M102 56 l-40 38", p.d, 4),
      R(52, 52, 56, 12, 4, p.a),
      R(56, 22, 48, 32, 5, p.m),
      S("M56 22 v34 M104 22 v34", p.d, 4),
    ].join(""),
  lantern: (p) =>
    [
      C(80, 66, 30, "#FFF4CC", 'opacity="0.7"'),
      S("M70 26 q10 -12 20 0", p.d, 4),
      R(64, 26, 32, 10, 4, p.a),
      R(66, 36, 28, 42, 6, "#FFE29A"),
      R(76, 46, 8, 22, 4, FLAME),
      S("M66 36 v42 M94 36 v42", p.m, 4),
      R(62, 78, 36, 12, 4, p.a),
    ].join(""),
  hammock: (p) =>
    [
      S("M40 30 v62 M120 30 v62", WOOD_DARK, 6),
      S("M40 40 L58 54 M120 40 L102 54", p.d, 2),
      P("M56 52 q24 34 48 0 q-24 16 -48 0 z", p.a),
      S("M56 52 q24 16 48 0", p.m, 3),
    ].join(""),
  umbrella: (p) =>
    [
      S("M80 40 v52", p.d, 4),
      P("M36 46 q44 -50 88 0 z", p.a),
      P("M66 46 q14 -48 28 0 z", p.m),
      S("M80 92 q0 6 -6 6", p.d, 4),
      E(80, 98, 30, 4, shade(p.a, 0.6)),
    ].join(""),
  flask: (p) =>
    [
      R(64, 18, 32, 16, 5, p.d),
      R(66, 34, 28, 6, 0, STEEL),
      R(64, 40, 32, 56, 10, p.a),
      R(70, 48, 6, 36, 3, p.l, 'opacity="0.45"'),
    ].join(""),
  lamp: (p) =>
    [
      E(66, 92, 22, 6, p.d),
      S("M66 90 L80 56 L104 40", p.d, 5),
      C(80, 56, 4, p.d),
      P("M96 28 l26 14 l-14 22 z", p.a),
      P("M104 58 l18 30 h-30 z", "#FFE9A8", 'opacity="0.55"'),
    ].join(""),
  notebook: (p) =>
    [
      R(50, 22, 62, 74, 6, p.a),
      R(50, 22, 12, 74, 4, p.m),
      S("M102 22 v74", p.d, 3),
      R(68, 40, 30, 14, 3, p.l),
      P("M90 96 v8 l4 -4 l4 4 v-8 z", p.m),
    ].join(""),
  notepad: (p) =>
    [
      R(56, 30, 58, 66, 4, p.a),
      R(48, 26, 58, 66, 4, p.l, `stroke="${p.a}" stroke-width="3"`),
      ...[0, 1, 2, 3, 4].map((i) => C(58 + i * 10, 26, 3.5, p.d)),
      ...[0, 1, 2, 3].map((i) => S(`M58 ${44 + i * 11} h38`, p.s, 3)),
    ].join(""),
  tray: (p) =>
    [
      R(52, 30, 6, 30, 2, p.d, 'transform="rotate(-10 55 45)"'),
      R(62, 26, 6, 34, 2, p.m, 'transform="rotate(6 65 43)"'),
      R(36, 54, 88, 36, 6, p.a),
      R(42, 58, 30, 26, 3, p.m),
      R(76, 58, 20, 26, 3, p.m),
      R(100, 58, 18, 26, 3, p.m),
      R(103, 64, 12, 10, 2, "#F6D46A"),
    ].join(""),
  pencup: (p) =>
    [
      R(66, 22, 7, 40, 2, FLAME, 'transform="rotate(-12 70 42)"'),
      R(78, 18, 7, 44, 2, p.d),
      R(90, 24, 7, 38, 2, p.s, 'transform="rotate(12 93 43)"'),
      R(58, 48, 44, 46, 6, p.a),
      ...[0, 1, 2].map((i) => S(`M58 ${60 + i * 10} h44`, p.m, 2.5)),
    ].join(""),
  plant: (p) =>
    [
      E(66, 40, 10, 20, LEAF, 'transform="rotate(-30 66 40)"'),
      E(94, 40, 10, 20, LEAF, 'transform="rotate(30 94 40)"'),
      E(80, 34, 10, 22, LEAF_DARK),
      P("M58 60 h44 l-6 34 h-32 z", p.a),
      R(54, 56, 52, 10, 4, p.m),
    ].join(""),
  cushion: (p) =>
    [
      R(36, 40, 88, 48, 22, p.a),
      R(44, 48, 72, 32, 16, "none", `stroke="${p.m}" stroke-width="2.5" stroke-dasharray="5 4"`),
      E(80, 64, 18, 8, p.s, 'opacity="0.6"'),
    ].join(""),
  clock: (p) =>
    [
      C(80, 58, 36, p.a),
      C(80, 58, 29, p.l),
      ...[0, 90, 180, 270].map((deg) => R(78, 32, 4, 7, 2, p.d, `transform="rotate(${deg} 80 58)"`)),
      S("M80 58 v-18 M80 58 l12 8", p.d, 4),
      C(80, 58, 3.5, p.m),
    ].join(""),
  monitorstand: (p) =>
    [
      R(46, 20, 68, 42, 5, p.d),
      R(51, 25, 58, 32, 2, "#BFD3F2"),
      R(76, 62, 8, 10, 0, p.d),
      R(36, 72, 88, 10, 4, p.a),
      R(40, 82, 8, 12, 2, p.m),
      R(112, 82, 8, 12, 2, p.m),
    ].join(""),
  storagebox: (p) =>
    [
      R(36, 44, 50, 48, 5, p.m),
      R(74, 38, 50, 54, 5, p.a),
      E(99, 52, 10, 4, shade(p.a, -0.3)),
      E(61, 56, 9, 4, shade(p.m, -0.3)),
      S("M74 70 h50", p.l, 2, 'opacity="0.6"'),
    ].join(""),
  pillow: (p) =>
    [
      P("M38 34 q42 10 84 0 q-8 30 0 60 q-42 -10 -84 0 q8 -30 0 -60 z", p.a),
      S("M48 42 q32 8 64 0", p.l, 2, 'opacity="0.5"'),
      C(80, 64, 4, p.m),
    ].join(""),
  basket: (p) =>
    [
      S("M50 56 q30 -52 60 0", WOOD_DARK, 5),
      P("M38 54 h84 l-10 40 h-64 z", WOOD),
      ...[0, 1, 2].map((i) => S(`M${42 + i * 3} ${64 + i * 10} h${76 - i * 6}`, WOOD_DARK, 2.5)),
      P("M44 54 q36 -18 72 0 z", p.a),
      E(80, 54, 42, 5, shade(WOOD, -0.1)),
    ].join(""),
  giftbox: (p) =>
    [
      R(46, 48, 68, 46, 4, p.a),
      R(40, 36, 80, 16, 4, p.m),
      R(74, 36, 12, 58, 0, p.l),
      P("M80 36 q-22 -20 -24 -2 q4 6 24 2 z", p.l),
      P("M80 36 q22 -20 24 -2 q-4 6 -24 2 z", p.l),
    ].join(""),
  crate: (p) =>
    [
      R(38, 40, 84, 54, 3, WOOD_DARK),
      ...[0, 1, 2].map((i) => R(38, 42 + i * 18, 84, 14, 2, WOOD)),
      R(38, 40, 10, 54, 2, shade(WOOD, -0.08)),
      R(112, 40, 10, 54, 2, shade(WOOD, -0.08)),
      S("M58 36 q-8 -10 -16 0 M118 36 q-8 -10 -16 0", p.a, 4),
      R(64, 34, 32, 8, 3, p.a),
    ].join(""),
  candle: (p) =>
    [
      C(80, 22, 10, "#FFF4CC", 'opacity="0.8"'),
      P("M80 12 q8 10 0 18 q-8 -8 0 -18 z", FLAME),
      S("M80 30 v6", p.d, 2.5),
      R(54, 36, 52, 58, 10, "#F3EEE7"),
      R(54, 48, 52, 46, 10, p.a),
      R(62, 58, 36, 20, 3, p.l),
    ].join(""),
  candletin: (p) =>
    [
      E(80, 84, 38, 10, shade(p.a, -0.15)),
      R(42, 56, 76, 28, 0, p.a),
      E(80, 56, 38, 10, STEEL),
      E(80, 56, 30, 7, "#F3EEE7"),
      S("M80 56 v-8", p.d, 2.5),
      P("M80 34 q7 8 0 14 q-7 -6 0 -14 z", FLAME),
      R(58, 64, 44, 12, 3, p.l),
    ].join(""),
  card: (p) =>
    [
      R(58, 24, 54, 70, 4, p.s, 'transform="rotate(8 85 59)"'),
      R(46, 22, 54, 70, 4, p.l, `stroke="${p.m}" stroke-width="2"`),
      C(73, 48, 12, p.a),
      S("M73 60 q-3 10 3 18", p.d, 1.5),
      C(60, 34, 3, FLAME),
      C(88, 72, 3, p.m),
      R(58, 80, 30, 4, 2, p.m),
    ].join(""),
  tree: (p) =>
    [
      E(68, 36, 22, 14, LEAF),
      E(96, 32, 18, 12, LEAF_DARK),
      E(84, 46, 18, 10, LEAF),
      S("M80 82 q-4 -16 6 -28 M84 64 q-14 -8 -18 -24", WOOD_DARK, 6),
      R(46, 80, 68, 12, 5, p.a),
      R(52, 92, 56, 4, 2, p.m),
    ].join(""),
  ringtoss: (p) =>
    [
      R(42, 84, 76, 10, 4, WOOD),
      R(76, 30, 8, 56, 3, WOOD_DARK),
      E(80, 74, 22, 7, "none", `stroke="${p.a}" stroke-width="5"`),
      E(80, 60, 18, 6, "none", `stroke="${p.m}" stroke-width="5"`),
      E(108, 46, 14, 5, "none", `stroke="${p.a}" stroke-width="5"`, ),
    ].join(""),
  frame: (p) =>
    [
      R(42, 24, 76, 70, 4, p.a),
      R(52, 34, 56, 50, 2, p.l),
      P("M52 84 l18 -24 l12 14 l8 -8 l18 18 z", p.s),
      C(96, 46, 6, FLAME),
    ].join(""),
  scarf: (p) =>
    [
      P("M50 30 h30 v52 h-30 z", p.a),
      P("M80 30 q24 0 30 18 l-14 44 h-26 l10 -40 q-2 -8 -10 -8 z", p.m),
      ...[0, 1, 2].map((i) => R(50, 40 + i * 14, 30, 5, 0, p.l, 'opacity="0.6"')),
      S("M52 82 v10 M58 82 v10 M64 82 v10 M70 82 v10 M76 82 v10", p.a, 2.5),
    ].join(""),
  puzzle: (p) =>
    [
      P("M44 46 h14 a7 7 0 1 1 14 0 h14 v13 a7 7 0 1 1 0 14 v13 h-42 z", p.a),
      P("M92 50 h32 v42 h-32 v-13 a7 7 0 1 0 0 -14 z", p.m),
      S("M50 80 h12", p.l, 2.5, 'opacity="0.6"'),
    ].join(""),
  shoe: (p) =>
    [
      P("M36 80 q0 -16 10 -24 l14 -18 q8 -6 14 4 q8 12 26 14 q22 4 24 20 v6 h-88 z", p.a),
      R(34, 80, 92, 10, 4, p.l),
      R(34, 88, 92, 4, 2, p.d, 'opacity="0.25"'),
      S("M62 48 l10 4 M58 54 l10 4 M54 60 l10 4", p.l, 2.5),
      P("M96 62 q14 2 20 12", "none", `stroke="${p.m}" stroke-width="4"`),
    ].join(""),
  sportbottle: (p) =>
    [
      P("M76 14 h8 l2 10 h-12 z", p.d),
      R(68, 24, 24, 10, 3, p.d),
      P("M62 34 h36 v20 q-6 8 0 16 v20 q0 6 -6 6 h-24 q-6 0 -6 -6 v-20 q6 -8 0 -16 z", p.a),
      R(68, 40, 6, 12, 3, p.l, 'opacity="0.45"'),
    ].join(""),
  socks: (p) =>
    [
      P("M56 24 h22 v40 l14 12 q6 8 -2 14 q-6 4 -14 -2 l-22 -18 z", p.m, 'transform="translate(-6 0)"'),
      P("M76 24 h22 v40 l14 12 q6 8 -2 14 q-6 4 -14 -2 l-22 -18 z", p.a),
      R(76, 24, 22, 10, 2, p.l),
      P("M104 80 q6 8 -2 14 q-6 4 -14 -2 z", p.s),
    ].join(""),
  armband: (p) =>
    [
      R(36, 50, 88, 20, 10, p.a),
      R(64, 28, 32, 62, 6, p.d),
      R(68, 34, 24, 46, 3, "#BFD3F2"),
      C(80, 85, 2, p.l),
      S("M44 60 h12 M104 60 h12", p.m, 3),
    ].join(""),
  belt: (p) =>
    [
      R(30, 54, 100, 16, 8, p.a),
      R(56, 46, 48, 32, 8, p.m),
      S("M62 54 h36", p.l, 2.5),
      R(76, 52, 8, 4, 2, p.l),
    ].join(""),
  frisbee: (p) =>
    [
      E(80, 64, 44, 20, p.m),
      E(80, 60, 44, 20, p.a),
      E(80, 58, 28, 11, p.s),
      E(80, 58, 14, 5, p.a),
    ].join(""),
  racket: (p) =>
    [
      E(68, 42, 20, 26, "none", `stroke="${p.d}" stroke-width="4"`),
      S("M56 32 h24 M54 42 h28 M56 52 h24 M62 20 v44 M74 20 v44", p.d, 1.2, 'opacity="0.6"'),
      S("M68 68 l12 22", p.d, 6),
      P("M104 78 l-10 -26 h20 z", p.l),
      C(104, 82, 6, p.a),
      S("M98 58 h12 M100 66 h8", p.s, 2),
    ].join(""),
  yogamat: (p) =>
    [
      R(40, 40, 70, 40, 20, p.a),
      C(110, 60, 21, p.m),
      C(110, 60, 14, p.a),
      C(110, 60, 6, p.m),
      S("M64 38 v44 M88 38 v44", p.d, 3),
    ].join(""),
  dumbbell: (p) =>
    [
      R(44, 56, 72, 8, 4, p.d),
      R(36, 40, 12, 40, 4, p.a),
      R(48, 46, 8, 28, 3, p.m),
      R(112, 40, 12, 40, 4, p.a),
      R(104, 46, 8, 28, 3, p.m),
    ].join(""),
  rope: (p) =>
    [
      S("M52 40 q-12 40 28 50 q40 -10 28 -50", p.a, 5),
      R(46, 22, 12, 24, 5, p.d),
      R(102, 22, 12, 24, 5, p.d),
    ].join(""),
  bands: (p) =>
    [
      E(66, 58, 24, 30, "none", `stroke="${p.a}" stroke-width="6"`),
      E(92, 60, 24, 28, "none", `stroke="${p.m}" stroke-width="6"`),
      E(80, 74, 30, 14, "none", `stroke="${p.s}" stroke-width="6"`),
    ].join(""),
  mug: (p) =>
    [
      S("M66 22 q-6 6 0 12 M80 18 q-6 6 0 12", p.d, 2.5, 'opacity="0.35"'),
      S("M102 50 h6 q10 0 10 12 q0 12 -10 12 h-6", p.a, 7),
      R(54, 38, 50, 56, 8, p.a),
      R(54, 54, 50, 14, 0, p.l, 'opacity="0.85"'),
    ].join(""),
  travelmug: (p) =>
    [
      R(60, 20, 40, 14, 5, p.d),
      R(76, 22, 12, 4, 2, p.l, 'opacity="0.6"'),
      P("M62 34 h36 l-4 60 h-28 z", p.a),
      R(64, 54, 32, 10, 0, p.m),
    ].join(""),
  teapot: (p) =>
    [
      S("M110 56 q14 4 10 22 q-4 10 -12 8", p.a, 6),
      P("M48 66 q-14 -10 -12 -24 l16 18 z", p.a),
      E(80, 68, 32, 26, p.a),
      E(80, 44, 18, 6, p.m),
      C(80, 36, 5, p.m),
      E(80, 70, 22, 6, p.l, 'opacity="0.5"'),
    ].join(""),
  knife: (p) =>
    [
      P("M34 72 q26 -42 72 -24 v24 z", "#B8C1CB"),
      P("M34 72 q26 -42 72 -24 v6 q-44 -10 -66 20 z", "#DDE3E9"),
      R(104, 46, 28, 26, 6, p.a),
      C(113, 59, 3, p.l),
      C(124, 59, 3, p.l),
    ].join(""),
  board: (p) =>
    [
      R(38, 30, 70, 60, 10, WOOD),
      R(108, 52, 16, 16, 6, WOOD),
      C(116, 60, 3.5, CATEGORY_TILE.Kitchen),
      R(46, 38, 54, 44, 6, "none", `stroke="${WOOD_DARK}" stroke-width="2.5"`),
      R(52, 54, 30, 10, 5, p.a),
    ].join(""),
  saucepan: (p) =>
    [
      E(70, 40, 32, 8, p.d),
      C(70, 34, 4, p.d),
      P("M38 44 h64 v38 q0 10 -10 10 h-44 q-10 0 -10 -10 z", p.a),
      R(100, 50, 30, 8, 4, p.d),
      R(38, 56, 64, 6, 0, p.m),
    ].join(""),
  bowl: (p) =>
    [
      P("M34 50 h92 q0 40 -46 40 q-46 0 -46 -40 z", p.a),
      E(80, 50, 46, 9, p.s),
      P("M50 49 h60 q0 22 -30 22 q-30 0 -30 -22 z", p.m),
      E(80, 49, 30, 6, shade(p.s, 0.3)),
    ].join(""),
  teatowel: (p) =>
    [
      S("M80 14 v10", p.d, 3),
      C(80, 12, 5, "none", `stroke="${p.d}" stroke-width="2.5"`),
      R(50, 24, 60, 70, 4, p.l),
      R(50, 34, 60, 6, 0, p.a),
      R(50, 44, 60, 3, 0, p.a),
      R(50, 76, 60, 6, 0, p.a),
      R(50, 24, 60, 70, 4, "none", `stroke="${p.s}" stroke-width="2"`),
    ].join(""),
  scale: (p) =>
    [
      R(40, 34, 80, 56, 10, p.a),
      R(46, 40, 68, 40, 6, p.l, 'opacity="0.9"'),
      R(64, 70, 32, 14, 3, p.d),
      R(68, 73, 24, 8, 2, "#9FE3B0"),
      E(80, 54, 20, 8, p.s),
    ].join(""),
};

export const ICON_NAMES: readonly string[] = Object.keys(ICONS);

export function hasIcon(icon: string): boolean {
  return icon in ICONS;
}

export function renderProductSvg(imageId: string, category: Category): string {
  const [icon, variantStr] = imageId.split("--");
  const draw = icon ? ICONS[icon] : undefined;
  if (!draw) throw new Error(`No icon drawing for imageId "${imageId}"`);
  const variant = Number(variantStr ?? 1);
  const accent = ACCENTS[(hash(icon!) + variant - 1) % ACCENTS.length]!;
  const pal: Pal = { a: accent, m: shade(accent, -0.22), s: shade(accent, 0.45), d: DARK, l: LIGHT };
  const tile = CATEGORY_TILE[category];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120" role="img">`,
    R(0, 0, 160, 120, 0, tile),
    E(80, 100, 44, 5, "#000000", 'opacity="0.07"'),
    draw(pal),
    `</svg>`,
  ].join("");
}
