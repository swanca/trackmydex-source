import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-xl border border-hairline bg-[rgb(148_163_208/0.06)] px-3.5 text-[0.9375rem] ' +
  'text-paper placeholder:text-faint transition-colors ' +
  'hover:border-hairline-strong focus:border-[rgb(59_130_246/0.6)] focus:outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-azure focus-visible:outline-offset-2 ' +
  'disabled:opacity-50';

function Wrapper({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-medium text-muted">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[0.75rem] text-rose">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.75rem] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Wrapper id={fieldId} {...(label ? { label } : {})} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <input
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'h-11', className)}
      />
    </Wrapper>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Wrapper id={fieldId} {...(label ? { label } : {})} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <textarea
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'min-h-[88px] resize-y py-2.5', className)}
      />
    </Wrapper>
  );
}

export function Select({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Wrapper id={fieldId} {...(label ? { label } : {})} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <div className="relative">
        <select
          {...rest}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL, 'h-11 appearance-none pr-9', className)}
        >
          {children}
        </select>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-faint"
        >
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </Wrapper>
  );
}

/**
 * Horizontally scrolling segmented control.
 *
 * Used for ownership / sort / language filters. It stays on one line and scrolls
 * rather than wrapping, which keeps filter state on screen next to the content
 * it filters instead of pushing the grid below the fold.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('no-scrollbar flex gap-1.5 overflow-x-auto overscroll-x-contain', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 shrink-0 rounded-[var(--radius-pill)] px-3.5 text-[0.8125rem] font-medium transition-colors',
              active
                ? 'border border-[rgb(139_92_246/0.35)] bg-[rgb(139_92_246/0.16)] text-paper'
                : 'border border-hairline text-muted hover:text-paper',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="tnum ml-1.5 text-faint">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
