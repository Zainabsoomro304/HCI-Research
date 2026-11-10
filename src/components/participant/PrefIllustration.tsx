/**
 * Small neutral pictures for the self-rated preference items: one per level of each interface setting.
 * Always drawn left to right, as they show screen layouts, not text.
 */
const INK = "#4A524D";
const SOFT = "#D5DAD6";
const CARD = "#FFFFFF";
const GREEN = "#1E7552";

function Frame({ children, bg = "#F6F5F1" }: { children: React.ReactNode; bg?: string }) {
  return (
    <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden className="block" direction="ltr">
      <rect x="0.5" y="0.5" width="119" height="79" rx="8" fill={bg} stroke={SOFT} />
      {children}
    </svg>
  );
}

const button = (x: number, y: number, w: number, h: number, style: "flat" | "outlined" | "raised") =>
  style === "flat" ? (
    <g>
      <rect x={x + 6} y={y + h / 2 - 2} width={w - 12} height="4" rx="2" fill={GREEN} />
      <rect x={x + 6} y={y + h / 2 + 4} width={w - 12} height="1.5" fill={GREEN} />
    </g>
  ) : style === "outlined" ? (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="5" fill={CARD} stroke={GREEN} strokeWidth="2" />
      <rect x={x + 8} y={y + h / 2 - 2} width={w - 16} height="4" rx="2" fill={GREEN} />
    </g>
  ) : (
    <g>
      <rect x={x} y={y + 2} width={w} height={h} rx="5" fill="#0F4A33" opacity="0.35" />
      <rect x={x} y={y} width={w} height={h} rx="5" fill={GREEN} />
      <rect x={x + 8} y={y + h / 2 - 2} width={w - 16} height="4" rx="2" fill={CARD} />
    </g>
  );

const ill: Record<string, React.ReactNode> = {
  "textSize.standard": (
    <Frame>
      <text x="60" y="49" textAnchor="middle" fontSize="16" fontWeight="700" fill={INK} fontFamily="Inter Variable, sans-serif">
        Aa
      </text>
    </Frame>
  ),
  "textSize.large": (
    <Frame>
      <text x="60" y="52" textAnchor="middle" fontSize="23" fontWeight="700" fill={INK} fontFamily="Inter Variable, sans-serif">
        Aa
      </text>
    </Frame>
  ),
  "textSize.xlarge": (
    <Frame>
      <text x="60" y="56" textAnchor="middle" fontSize="31" fontWeight="700" fill={INK} fontFamily="Inter Variable, sans-serif">
        Aa
      </text>
    </Frame>
  ),
  "targetSize.standard": <Frame>{button(36, 32, 48, 16, "raised")}</Frame>,
  "targetSize.large": <Frame>{button(28, 24, 64, 30, "raised")}</Frame>,
  "buttonStyle.flat": <Frame>{button(34, 28, 52, 22, "flat")}</Frame>,
  "buttonStyle.outlined": <Frame>{button(34, 28, 52, 22, "outlined")}</Frame>,
  "buttonStyle.raised": <Frame>{button(34, 28, 52, 22, "raised")}</Frame>,
  "iconLabels.iconOnly": (
    <Frame>
      <circle cx="60" cy="40" r="13" fill={CARD} stroke={INK} strokeWidth="2" />
      <path d="M54 37h12l-1.5 8h-9Z M57 37l2-4M63 37l-2-4" fill="none" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </Frame>
  ),
  "iconLabels.iconText": (
    <Frame>
      <rect x="22" y="27" width="76" height="26" rx="13" fill={CARD} stroke={INK} strokeWidth="2" />
      <path d="M32 37h12l-1.5 8h-9Z M35 37l2-4M41 37l-2-4" fill="none" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="52" y="38" width="36" height="5" rx="2.5" fill={INK} />
    </Frame>
  ),
  "contrast.standard": (
    <Frame>
      <rect x="18" y="18" width="84" height="44" rx="5" fill={CARD} stroke="#E3E1DA" />
      <rect x="26" y="28" width="56" height="5" rx="2.5" fill="#8A8F94" />
      <rect x="26" y="40" width="40" height="5" rx="2.5" fill="#A4A8AC" />
    </Frame>
  ),
  "contrast.high": (
    <Frame bg="#FFFFFF">
      <rect x="18" y="18" width="84" height="44" rx="5" fill={CARD} stroke="#000" strokeWidth="2.5" />
      <rect x="26" y="28" width="56" height="5" rx="2.5" fill="#000" />
      <rect x="26" y="40" width="40" height="5" rx="2.5" fill="#1A1A1A" />
    </Frame>
  ),
  "layout.grid3": (
    <Frame>
      {[0, 1].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <g key={`${r}${c}`}>
            <rect x={9 + c * 35} y={8 + r * 34} width="32" height="30" rx="3" fill={CARD} stroke={SOFT} />
            <rect x={12 + c * 35} y={11 + r * 34} width="26" height="13" rx="2" fill={SOFT} />
            <rect x={12 + c * 35} y={28 + r * 34} width="16" height="4" rx="2" fill={INK} />
          </g>
        )),
      )}
    </Frame>
  ),
  "layout.grid2": (
    <Frame>
      {[0, 1].flatMap((r) =>
        [0, 1].map((c) => (
          <g key={`${r}${c}`}>
            <rect x={10 + c * 52} y={8 + r * 34} width="48" height="30" rx="3" fill={CARD} stroke={SOFT} />
            <rect x={13 + c * 52} y={11 + r * 34} width="42" height="13" rx="2" fill={SOFT} />
            <rect x={13 + c * 52} y={28 + r * 34} width="24" height="4" rx="2" fill={INK} />
          </g>
        )),
      )}
    </Frame>
  ),
  "layout.list": (
    <Frame>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="10" y={9 + i * 21} width="100" height="18" rx="3" fill={CARD} stroke={SOFT} />
          <rect x="13" y={12 + i * 21} width="18" height="12" rx="2" fill={SOFT} />
          <rect x="36" y={16 + i * 21} width="40" height="4" rx="2" fill={INK} />
          <rect x="92" y={14 + i * 21} width="14" height="8" rx="2" fill={GREEN} />
        </g>
      ))}
    </Frame>
  ),
  "guidance.none": (
    <Frame>
      <rect x="14" y="14" width="92" height="52" rx="4" fill={CARD} stroke={SOFT} />
      <rect x="22" y="24" width="50" height="5" rx="2.5" fill={INK} />
      <rect x="22" y="36" width="34" height="18" rx="3" fill={SOFT} />
      <rect x="62" y="36" width="34" height="18" rx="3" fill={SOFT} />
    </Frame>
  ),
  "guidance.hints": (
    <Frame>
      <rect x="14" y="14" width="92" height="52" rx="4" fill={CARD} stroke={SOFT} />
      <rect x="20" y="20" width="80" height="12" rx="4" fill="#E3EEF8" />
      <circle cx="27" cy="26" r="3" fill="#2C5274" />
      <rect x="34" y="24" width="56" height="4" rx="2" fill="#2C5274" />
      <rect x="22" y="38" width="34" height="18" rx="3" fill={SOFT} />
      <rect x="62" y="38" width="34" height="18" rx="3" fill={SOFT} />
    </Frame>
  ),
};

export function PrefIllustration({ id }: { id: string }) {
  return <>{ill[id] ?? null}</>;
}
