import { useId } from 'react';

interface FernIconProps {
  /** Width in pixels — height scales to 1.3x */
  size?: number;
  className?: string;
  /** Show ambient radial glow behind the fern (nice at large sizes) */
  glow?: boolean;
}

/**
 * MindLog fern frond brand mark — inline SVG, no external deps.
 * Matches the mobile app icon: teal gradient, curved stem, 9 paired pinnae.
 */
export function FernIcon({ size = 48, className, glow = false }: FernIconProps) {
  const uid = useId().replace(/:/g, '');
  const gl = `${uid}fl`;
  const gr = `${uid}fr`;
  const gs = `${uid}fs`;
  const gw = `${uid}fw`;

  // Pinnae attachment points along the curved stem: [x, y, length, angleDeg]
  const pinnae: [number, number, number, number][] = [
    [95.5, 228, 60, 22],
    [94.8, 208, 56, 24],
    [94.2, 188, 51, 26],
    [93.8, 168, 45, 28],
    [94.0, 148, 39, 30],
    [94.8, 130, 33, 33],
    [96.2, 113, 27, 36],
    [98.5, 97, 20, 39],
    [101.5, 82, 13, 42],
  ];

  const f = (n: number) => n.toFixed(1);

  const makeLeaf = (
    ax: number, ay: number,
    len: number, angleDeg: number,
    side: 'left' | 'right',
  ) => {
    const a = (angleDeg * Math.PI) / 180;
    const dir = side === 'left' ? -1 : 1;
    const effLen = side === 'right' ? len * 0.9 : len;
    const w = effLen * 0.3;

    // Tip of the pinna
    const tx = ax + dir * effLen * Math.cos(a);
    const ty = ay - effLen * Math.sin(a);

    // Axis and perpendicular vectors
    const dx = tx - ax;
    const dy = ty - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / d;
    const ny = dx / d;

    // Upper bezier CPs (bulge above leaf axis)
    const uc1x = ax + 0.33 * dx + w * 0.85 * nx;
    const uc1y = ay + 0.33 * dy + w * 0.85 * ny;
    const uc2x = ax + 0.66 * dx + w * 0.55 * nx;
    const uc2y = ay + 0.66 * dy + w * 0.55 * ny;

    // Lower bezier CPs (bulge below leaf axis)
    const lc1x = ax + 0.66 * dx - w * 0.55 * nx;
    const lc1y = ay + 0.66 * dy - w * 0.55 * ny;
    const lc2x = ax + 0.33 * dx - w * 0.85 * nx;
    const lc2y = ay + 0.33 * dy - w * 0.85 * ny;

    return [
      `M ${f(ax)} ${f(ay)}`,
      `C ${f(uc1x)} ${f(uc1y)}, ${f(uc2x)} ${f(uc2y)}, ${f(tx)} ${f(ty)}`,
      `C ${f(lc1x)} ${f(lc1y)}, ${f(lc2x)} ${f(lc2y)}, ${f(ax)} ${f(ay)}`,
      'Z',
    ].join(' ');
  };

  return (
    <svg
      width={size}
      height={size * 1.3}
      viewBox="0 0 200 260"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Left pinnae gradient — darker teal */}
        <linearGradient id={gl} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#6edcd0" />
          <stop offset="50%" stopColor="#2a9d8f" />
          <stop offset="100%" stopColor="#1a7568" />
        </linearGradient>

        {/* Right pinnae gradient — lighter teal */}
        <linearGradient id={gr} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#7ae8dc" />
          <stop offset="50%" stopColor="#3ab5a8" />
          <stop offset="100%" stopColor="#2a9d8f" />
        </linearGradient>

        {/* Stem gradient */}
        <linearGradient id={gs} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#5ccec2" />
          <stop offset="100%" stopColor="#1a7568" />
        </linearGradient>

        {/* Ambient glow */}
        {glow && (
          <radialGradient id={gw} cx="50%" cy="45%" r="40%">
            <stop offset="0%" stopColor="rgba(42, 157, 143, 0.15)" />
            <stop offset="100%" stopColor="rgba(42, 157, 143, 0)" />
          </radialGradient>
        )}
      </defs>

      {/* Ambient glow ellipse */}
      {glow && <ellipse cx="100" cy="140" rx="85" ry="105" fill={`url(#${gw})`} />}

      {/* Left pinnae */}
      {pinnae.map(([ax, ay, len, angle], i) => (
        <path key={`l${i}`} d={makeLeaf(ax, ay, len, angle, 'left')} fill={`url(#${gl})`} />
      ))}

      {/* Right pinnae */}
      {pinnae.map(([ax, ay, len, angle], i) => (
        <path key={`r${i}`} d={makeLeaf(ax, ay, len, angle, 'right')} fill={`url(#${gr})`} />
      ))}

      {/* Stem — curved rightward */}
      <path
        d="M 96 245 C 94 200, 92 160, 94 130 C 96 100, 104 65, 112 35"
        stroke={`url(#${gs})`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* Fiddlehead curl + bud */}
      <path
        d="M 112 35 C 116 22, 112 15, 104 19"
        stroke="#6edcd0"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="103" cy="19" r="5" fill="#6edcd0" />
    </svg>
  );
}
