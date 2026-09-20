import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { LANGUAGE_SHORT } from '@/lib/catalog/eras';
import type { CardLanguage, PriceConfidence, VariantType } from '@/db/schema/enums';

type Tone = 'neutral' | 'accent' | 'holo' | 'positive' | 'warning';

const TONES: Record<Tone, string> = {
  neutral: 'bg-[rgb(148_163_208/0.1)] text-muted border border-hairline',
  accent: 'bg-[rgb(139_92_246/0.14)] text-[#c4b5fd] border border-[rgb(139_92_246/0.3)]',
  holo: 'holo text-paper',
  positive: 'bg-[rgb(52_211_153/0.12)] text-mint border border-[rgb(52_211_153/0.28)]',
  warning: 'bg-[rgb(245_181_68/0.12)] text-amber border border-[rgb(245_181_68/0.28)]',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  mono,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[0.6875rem] leading-5 font-medium',
        mono && 'font-mono tracking-[0.04em]',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Printed language.
 *
 * A two-letter tag rather than a flag emoji: languages are not countries
 * (Spanish prints are not Spain-only), and flags render inconsistently across
 * the Android and iOS devices this app targets.
 */
export function LanguageChip({
  language,
  label,
  className,
}: {
  language: CardLanguage;
  label?: string;
  className?: string;
}) {
  return (
    <span
      title={label ?? language}
      aria-label={label ?? language}
      className={cn(
        'inline-flex h-5 min-w-[26px] items-center justify-center rounded-md px-1',
        'border border-hairline bg-[rgb(148_163_208/0.08)]',
        'font-mono text-[0.625rem] leading-none font-semibold tracking-[0.06em] text-muted',
        className,
      )}
    >
      {LANGUAGE_SHORT[language]}
    </span>
  );
}

/** Holo and reverse printings get the sheen; plain printings stay quiet. */
export function VariantChip({
  variant,
  label,
  className,
}: {
  variant: VariantType;
  label: string;
  className?: string;
}) {
  const shiny = variant === 'holo' || variant === 'reverse' || variant === 'firstEditionHolo';
  const notable = variant === 'firstEdition' || variant === 'firstEditionHolo';
  return (
    <Badge tone={shiny ? 'holo' : notable ? 'accent' : 'neutral'} className={className}>
      {label}
    </Badge>
  );
}

/**
 * Marks a value the app cannot vouch for exactly.
 *
 * The brief is explicit that an approximate cross-language or cross-variant
 * match must never read as an exact market valuation, so every estimated number
 * carries this glyph and a reason on hover/focus.
 */
export function ConfidenceMark({
  confidence,
  reason,
  className,
}: {
  confidence: PriceConfidence | null;
  reason?: string;
  className?: string;
}) {
  if (confidence !== 'approximate') return null;
  return (
    <span
      title={reason}
      aria-label={reason}
      className={cn('ml-0.5 align-super text-[0.6875rem] leading-none text-amber', className)}
    >
      ~
    </span>
  );
}
