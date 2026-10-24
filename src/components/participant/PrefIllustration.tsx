/** Small neutral schematics used as visual examples for the self-rated preference items. */
const INK = "#566070";
const SOFT = "#d5dbe3";
const CARD = "#ffffff";

function Frame({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden className="block">
      <rect x="0.5" y="0.5" width="119" height="79" rx="8" fill={dark ? "#1a2028" : "#f5f6f8"} stroke={SOFT} />
      {children}
    </svg>
  );
}

const ill: Record<string, React.ReactNode> = {
  "layout.list": (
    <Frame>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="10" y={10 + i * 21} width="100" height="17" rx="3" fill={CARD} stroke={SOFT} />
          <rect x="13" y={13 + i * 21} width="15" height="11" rx="2" fill={SOFT} />
          <rect x="32" y={16 + i * 21} width="40" height="4" rx="2" fill={INK} />
        </g>
      ))}
    </Frame>
  ),
  "layout.grid2": (
    <Frame>
      {[0, 1].flatMap((r) =>
        [0, 1].map((c) => (
          <g key={`${r}${c}`}>
            <rect x={10 + c * 52} y={8 + r * 34} width="48" height="30" rx="3" fill={CARD} stroke={SOFT} />
            <rect x={13 + c * 52} y={11 + r * 34} width="42" height="15" rx="2" fill={SOFT} />
            <rect x={13 + c * 52} y={30 + r * 34} width="24" height="4" rx="2" fill={INK} />
          </g>
        )),
      )}
    </Frame>
  ),
  "layout.grid3": (
    <Frame>
      {[0, 1].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <g key={`${r}${c}`}>
            <rect x={9 + c * 35} y={8 + r * 34} width="32" height="30" rx="3" fill={CARD} stroke={SOFT} />
            <rect x={12 + c * 35} y={11 + r * 34} width="26" height="15" rx="2" fill={SOFT} />
            <rect x={12 + c * 35} y={30 + r * 34} width="16" height="4" rx="2" fill={INK} />
          </g>
        )),
      )}
    </Frame>
  ),
  "text.small": (
    <Frame>
      <text x="60" y="47" textAnchor="middle" fontSize="14" fontWeight="600" fill={INK} fontFamily="inherit">
        Aa
      </text>
    </Frame>
  ),
  "text.medium": (
    <Frame>
      <text x="60" y="50" textAnchor="middle" fontSize="20" fontWeight="600" fill={INK} fontFamily="inherit">
        Aa
      </text>
    </Frame>
  ),
  "text.large": (
    <Frame>
      <text x="60" y="54" textAnchor="middle" fontSize="28" fontWeight="600" fill={INK} fontFamily="inherit">
        Aa
      </text>
    </Frame>
  ),
  ...Object.fromEntries(
    (["lots", "some", "minimal"] as const).map((level, li) => [
      `detail.${level}`,
      <Frame key={level}>
        <rect x="30" y="8" width="60" height="64" rx="4" fill={CARD} stroke={SOFT} />
        <rect x="34" y="12" width="52" height="24" rx="2" fill={SOFT} />
        <rect x="34" y="40" width="36" height="4" rx="2" fill={INK} />
        {li <= 1 && <rect x="34" y="48" width="18" height="4" rx="2" fill={INK} />}
        {li === 0 && <rect x="34" y="56" width="48" height="3" rx="1.5" fill={SOFT} />}
        {li === 0 && <rect x="34" y="62" width="40" height="3" rx="1.5" fill={SOFT} />}
      </Frame>,
    ]),
  ),
  "theme.light": (
    <Frame>
      <rect x="10" y="10" width="100" height="12" rx="3" fill={CARD} stroke={SOFT} />
      <rect x="10" y="28" width="46" height="42" rx="3" fill={CARD} stroke={SOFT} />
      <rect x="64" y="28" width="46" height="42" rx="3" fill={CARD} stroke={SOFT} />
    </Frame>
  ),
  "theme.dark": (
    <Frame dark>
      <rect x="10" y="10" width="100" height="12" rx="3" fill="#2a323d" />
      <rect x="10" y="28" width="46" height="42" rx="3" fill="#2a323d" />
      <rect x="64" y="28" width="46" height="42" rx="3" fill="#2a323d" />
    </Frame>
  ),
  "menu.side": (
    <Frame>
      <rect x="8" y="8" width="104" height="10" rx="3" fill={CARD} stroke={SOFT} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="10" y={25 + i * 11} width="22" height="5" rx="2" fill={INK} opacity={i === 1 ? 1 : 0.45} />
      ))}
      <rect x="40" y="24" width="72" height="48" rx="3" fill={CARD} stroke={SOFT} />
    </Frame>
  ),
  "menu.dropdown": (
    <Frame>
      <rect x="8" y="8" width="104" height="10" rx="3" fill={CARD} stroke={SOFT} />
      <rect x="11" y="10" width="26" height="6" rx="2" fill={SOFT} />
      <path d="M31 12l2 2 2-2" stroke={INK} fill="none" strokeWidth="1.2" />
      <rect x="11" y="19" width="34" height="30" rx="3" fill={CARD} stroke={SOFT} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x="14" y={23 + i * 8} width="22" height="4" rx="2" fill={INK} opacity="0.6" />
      ))}
      <rect x="50" y="24" width="62" height="48" rx="3" fill={CARD} stroke={SOFT} />
    </Frame>
  ),
};

export function PrefIllustration({ id }: { id: string }) {
  return <>{ill[id] ?? null}</>;
}
