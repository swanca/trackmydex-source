'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Theme control.
 *
 * Three themes, each answering a real situation rather than offering variety:
 * the default midnight navy, true black for OLED phones (where black pixels are
 * switched off, so it saves battery and maximises contrast), and light for
 * bright daylight, where a dark UI washes out.
 *
 * The choice is per-device, not per-account: the same person wants black on
 * their phone at night and light on a laptop by a window. So it lives in
 * localStorage and never syncs.
 */

export const THEMES = ['midnight', 'black', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'trackmydex.theme';

/**
 * Applied before first paint by an inline script in the document head, so the
 * page never flashes the default theme before switching. Kept as a string so
 * the same source is used by both the script and this component.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='black'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'midnight') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  // Keep the browser UI (status bar, address bar) in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  const colour = theme === 'light' ? '#f6f7fb' : theme === 'black' ? '#000000' : '#05070f';
  if (meta) meta.setAttribute('content', colour);
}

export function ThemeSwitcher({
  labels,
  className,
}: {
  labels: { label: string; midnight: string; black: string; light: string };
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>('midnight');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (stored && (THEMES as readonly string[]).includes(stored)) setTheme(stored);
    } catch {
      // Blocked storage: the default theme is a perfectly good outcome.
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }

  const options: Array<{ value: Theme; label: string; swatch: string; ring: string }> = [
    { value: 'midnight', label: labels.midnight, swatch: '#0b0f1a', ring: '#8b5cf6' },
    { value: 'black', label: labels.black, swatch: '#000000', ring: '#3f3f46' },
    { value: 'light', label: labels.light, swatch: '#f6f7fb', ring: '#cbd2e4' },
  ];

  return (
    <div role="radiogroup" aria-label={labels.label} className={cn('grid gap-2', className)}>
      {options.map((option) => {
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(option.value)}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
              active
                ? 'border-[rgb(139_92_246/0.45)] bg-[rgb(139_92_246/0.12)]'
                : 'border-hairline hover:bg-[rgb(148_163_208/0.07)]',
            )}
          >
            <span
              aria-hidden
              className="size-6 shrink-0 rounded-full border"
              style={{ background: option.swatch, borderColor: option.ring }}
            />
            <span className="flex-1 text-[0.875rem] font-medium text-paper">{option.label}</span>
            {active ? (
              <svg viewBox="0 0 20 20" aria-hidden className="size-4 text-[#c4b5fd]">
                <path
                  d="m4.5 10.5 3.5 3.5 7.5-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
