/**
 * Generated avatars, rendered as inline SVG.
 *
 * No external service (Gravatar etc.) so nothing about the user's email leaves
 * the app, and no extra network request per avatar. The style and colour are
 * assigned server-side at signup and stored on the user.
 */

const PALETTE = {
  indigo: ['#5b6ef5', '#2f3bb3'],
  teal: ['#2bb6a3', '#127d70'],
  amber: ['#f5a524', '#c97a06'],
  rose: ['#f2557f', '#c02255'],
  violet: ['#9b5bf5', '#6a2fb3'],
  lime: ['#7cc133', '#4d8618'],
  cyan: ['#28b3d4', '#0d7a96'],
  coral: ['#f9523d', '#c3301e'],
};

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Decorative geometry per style. Purely visual, marked aria-hidden. */
function Ornament({ style, light }) {
  const common = { fill: 'none', stroke: light, strokeWidth: 2.5, opacity: 0.55 };

  switch (style) {
    case 'orbit':
      return (
        <>
          <circle cx="34" cy="34" r="26" {...common} />
          <circle cx="34" cy="8" r="4" fill={light} opacity="0.9" stroke="none" />
        </>
      );
    case 'wave':
      return <path d="M-2 46 Q 12 30 26 46 T 54 46 T 82 46" {...common} />;
    case 'grid':
      return (
        <>
          <path d="M0 22 H68 M0 46 H68" {...common} />
          <path d="M22 0 V68 M46 0 V68" {...common} />
        </>
      );
    case 'burst':
      return (
        <>
          <path d="M34 2 V16 M34 52 V66 M2 34 H16 M52 34 H66" {...common} />
          <path d="M11 11 L21 21 M47 47 L57 57 M57 11 L47 21 M21 47 L11 57" {...common} />
        </>
      );
    case 'arc':
      return (
        <>
          <path d="M6 56 A 28 28 0 0 1 62 56" {...common} />
          <path d="M18 62 A 16 16 0 0 1 50 62" {...common} />
        </>
      );
    case 'stack':
    default:
      return (
        <>
          <rect x="10" y="10" width="48" height="48" rx="12" {...common} />
          <rect x="20" y="20" width="28" height="28" rx="8" {...common} />
        </>
      );
  }
}

export default function Avatar({ user, size = 36, className = '' }) {
  const [dark, light] = PALETTE[user?.avatarColor] || PALETTE.indigo;
  const gradientId = `ls-av-${user?.avatarColor || 'indigo'}-${user?.avatarStyle || 'stack'}`;

  return (
    <span
      className={`ls-avatar-wrap ${className}`}
      style={{ width: size, height: size }}
      title={user?.name}
    >
      <svg
        viewBox="0 0 68 68"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={dark} />
            <stop offset="100%" stopColor={light} />
          </linearGradient>
        </defs>
        <rect width="68" height="68" rx="34" fill={`url(#${gradientId})`} />
        <Ornament style={user?.avatarStyle} light="#ffffff" />
        <text
          x="34"
          y="34"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize="25"
          fontWeight="800"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          letterSpacing="-0.5"
        >
          {initials(user?.name)}
        </text>
      </svg>
    </span>
  );
}

export { PALETTE as AVATAR_PALETTE };
