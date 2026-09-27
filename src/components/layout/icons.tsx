import type { SVGProps } from 'react';

/**
 * Navigation glyphs.
 *
 * Drawn rather than imported: an icon package would ship hundreds of paths to
 * a phone for the eight shapes this app uses. All are on a 24 grid with a 1.7
 * stroke so they sit at the same optical weight as the type.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h3.5v-4.2a1.5 1.5 0 0 1 3 0V20H17a1 1 0 0 0 1-1V9.8" />
    </svg>
  );
}

/** A binder: how collectors actually store what this screen lists. */
export function BinderIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4.5h12.5A1.5 1.5 0 0 1 19 6v13.5H6.5A1.5 1.5 0 0 1 5 18V4.5Z" />
      <path d="M5 16.5h14" />
      <path d="M8.5 4.5v12" />
    </svg>
  );
}

export function SetsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="6" width="7" height="12" rx="1.6" />
      <rect x="13.5" y="6" width="7" height="12" rx="1.6" />
      <path d="M6 9.5h2M16 9.5h2" />
    </svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 19.5s-7-4.4-7-9a3.9 3.9 0 0 1 7-2.4A3.9 3.9 0 0 1 19 10.5c0 4.6-7 9-7 9Z" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.6 15.6 3.4 3.4" />
    </svg>
  );
}

/** A small guide/bookmark glyph for the public tutorial. */
export function GuideIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v12.5H7a2 2 0 0 1-2-2V4.5Z" />
      <path d="M17 7h2v12.5H9" />
      <path d="M8 8h5M8 11.5h5" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

/**
 * A gear, with actual teeth.
 *
 * The previous drawing was a small circle ringed by eight straight spokes,
 * which is a sun, not a gear - and it was labelling the settings menu. The
 * outline below alternates an outer and an inner radius so the teeth read as
 * teeth even at 16px.
 */
export function GearIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.33 1.95 L14.67 1.95 L15.97 5.17 L15.91 5.14 L17.22 3.01 L20.99 6.78 L19.64 9.98 L19.62 9.92 L22.05 9.33 L22.05 14.67 L18.83 15.97 L18.86 15.91 L20.99 17.22 L17.22 20.99 L14.02 19.64 L14.08 19.62 L14.67 22.05 L9.33 22.05 L8.03 18.83 L8.09 18.86 L6.78 20.99 L3.01 17.22 L4.36 14.02 L4.38 14.08 L1.95 14.67 L1.95 9.33 L5.17 8.03 L5.14 8.09 L3.01 6.78 L6.78 3.01 L9.98 4.36 L9.92 4.38 Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 10 6 6 6-6" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 5h6v6" />
      <path d="M19 5 10 14" />
      <path d="M18 14.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7.5A1.5 1.5 0 0 1 6 6h3.5" />
    </svg>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z" />
      <path d="m3 8.5 9 4.5 9-4.5M12 13v7" />
      <path d="m7.5 6.25 9 4.5" />
    </svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function FacebookIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M14 21v-8h3l.5-3H14V8.2c0-1 .4-1.7 1.8-1.7H18V3.8c-.6-.1-1.5-.2-2.6-.2-2.7 0-4.5 1.6-4.5 4.7V10H8v3h2.9v8" /></svg>;
}

export function XIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M5 4h3.8L19 20h-3.8L5 4Zm1 16L18 4" /></svg>;
}

export function RedditIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="11" fill="#ff4500" />
      <g fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45">
        <path d="M6.3 13.2c0-2.5 2.55-4.45 5.7-4.45s5.7 1.95 5.7 4.45-2.55 4.45-5.7 4.45-5.7-1.95-5.7-4.45Z" />
        <path d="M9.25 15.2c1.35.9 4.15.9 5.5 0M12.9 8.8l.75-3.25 2.8.65" />
        <circle cx="17.45" cy="6.55" r="1.35" />
        <circle cx="5.45" cy="10.75" r="1.35" />
        <circle cx="18.55" cy="10.75" r="1.35" />
      </g>
      <circle cx="9.55" cy="12.65" r=".85" fill="white" />
      <circle cx="14.45" cy="12.65" r=".85" fill="white" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DiscordIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 7.5c3.3-1.7 6.7-1.7 10 0 1.4 2.2 2.2 4.7 2.5 7.5-2 1.5-3.6 2-5 2.3l-1.1-1.5M7 7.5C5.6 9.7 4.8 12.2 4.5 15c2 1.5 3.6 2 5 2.3l1.1-1.5" />
      <circle cx="9" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
