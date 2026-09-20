'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { QuantityStepper } from '@/components/collection/QuantityStepper';
import { deleteEntry, saveEntry, toggleWishlist } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { CONDITION_MULTIPLIERS, applyCondition } from '@/lib/pricing/condition';
import { formatMoney } from '@/lib/pricing/money';
import type { Condition, Currency } from '@/db/schema/enums';

export interface EditorVariant {
  id: string;
  label: string;
  variantType: string;
}

export interface EditorEntry {
  id: string;
  variantId: string;
  language: string;
  condition: string;
  quantity: number;
  purchasePrice: string | null;
  purchaseCurrency: string | null;
  purchaseDate: string | null;
  notes: string | null;
}

export interface EditorLabels {
  add: string;
  edit: string;
  yourCopies: string;
  variant: string;
  language: string;
  condition: string;
  quantity: string;
  purchasePrice: string;
  purchaseDate: string;
  notes: string;
  notesPlaceholder: string;
  save: string;
  saving: string;
  remove: string;
  cancel: string;
  increment: string;
  decrement: string;
  count: string;
  wishlistAdd: string;
  wishlistRemove: string;
  conditionHelp: string;
  estimateFor: string;
  multiplier: string;
}

/**
 * Collection editor.
 *
 * The full form lives behind a bottom sheet, and the fast path never opens it:
 * each printing the user already owns has its own inline stepper, and adding a
 * first copy is one tap. The sheet exists for the details that genuinely need a
 * form - condition, what you paid, when, and why you care.
 */
export function CardEntryEditor({
  cardId,
  variants,
  languages,
  conditions,
  entries,
  defaultLanguage,
  defaultCurrency,
  wishlisted,
  labels,
  locale,
  basePrices,
}: {
  cardId: string;
  variants: EditorVariant[];
  languages: Array<{ value: string; label: string }>;
  conditions: Array<{ value: string; label: string }>;
  entries: EditorEntry[];
  defaultLanguage: string;
  defaultCurrency: string;
  wishlisted: boolean;
  labels: EditorLabels;
  locale: string;
  /** Near-mint reference price per printing, for the live condition estimate. */
  basePrices: Record<string, { amount: number; currency: Currency } | null>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditorEntry | null>(null);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [onWishlist, setOnWishlist] = useState(wishlisted);

  const [form, setForm] = useState({
    variantId: variants[0]?.id ?? '',
    language: defaultLanguage,
    condition: 'near_mint',
    quantity: 1,
    purchasePrice: '',
    purchaseCurrency: defaultCurrency,
    purchaseDate: '',
    notes: '',
  });

  // Live estimate for the printing and condition currently selected.
  const base = basePrices[form.variantId] ?? null;
  const conditionEstimate = base
    ? {
        ...applyCondition(base.amount, form.condition as Condition),
        currency: base.currency,
      }
    : null;

  function openNew() {
    setEditing(null);
    setError(null);
    setForm({
      variantId: variants[0]?.id ?? '',
      language: defaultLanguage,
      condition: 'near_mint',
      quantity: 1,
      purchasePrice: '',
      purchaseCurrency: defaultCurrency,
      purchaseDate: '',
      notes: '',
    });
    setOpen(true);
  }

  function openEdit(entry: EditorEntry) {
    setEditing(entry);
    setError(null);
    setForm({
      variantId: entry.variantId,
      language: entry.language,
      condition: entry.condition,
      quantity: entry.quantity,
      purchasePrice: entry.purchasePrice ?? '',
      purchaseCurrency: entry.purchaseCurrency ?? defaultCurrency,
      purchaseDate: entry.purchaseDate ?? '',
      notes: entry.notes ?? '',
    });
    setOpen(true);
  }

  function submit() {
    setError(null);
    startSaving(async () => {
      try {
        await saveEntry({
          cardVariantId: form.variantId,
          language: form.language,
          condition: form.condition,
          quantity: form.quantity,
          purchasePrice: form.purchasePrice ? Number(form.purchasePrice.replace(',', '.')) : null,
          purchaseCurrency: form.purchasePrice ? form.purchaseCurrency : null,
          purchaseDate: form.purchaseDate || null,
          notes: form.notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to save');
      }
    });
  }

  function remove(entry: EditorEntry) {
    startSaving(async () => {
      try {
        await deleteEntry(entry.id);
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to remove');
      }
    });
  }

  function wishlist() {
    startSaving(async () => {
      try {
        const result = await toggleWishlist({
          cardVariantId: form.variantId || (variants[0]?.id ?? ''),
          language: defaultLanguage,
          remove: onWishlist,
        });
        setOnWishlist(result.wishlisted);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed');
      }
    });
  }

  return (
    <div className="space-y-4">
      {entries.length > 0 ? (
        <section>
          <p className="type-eyebrow mb-2">{labels.yourCopies}</p>
          <ul className="space-y-2">
            {entries.map((entry) => {
              const variant = variants.find((v) => v.id === entry.variantId);
              return (
                <li
                  key={entry.id}
                  className="surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(entry)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[0.8125rem] font-semibold">
                      {variant?.label ?? entry.variantId}
                    </p>
                    <p className="type-meta truncate text-[0.6875rem]">
                      {labelFor(languages, entry.language)} ·{' '}
                      {labelFor(conditions, entry.condition)}
                      {entry.purchasePrice
                        ? ` · ${entry.purchasePrice} ${entry.purchaseCurrency ?? ''}`
                        : ''}
                    </p>
                  </button>
                  <QuantityStepper
                    cardVariantId={entry.variantId}
                    language={entry.language}
                    condition={entry.condition}
                    quantity={entry.quantity}
                    size="sm"
                    labels={{
                      add: labels.increment,
                      remove: labels.decrement,
                      count: labels.count,
                    }}
                    className="w-[104px]"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={openNew} fullWidth>
          {entries.length > 0 ? labels.add : labels.add}
        </Button>
        <Button
          variant="secondary"
          onClick={wishlist}
          loading={saving}
          aria-pressed={onWishlist}
          className={cn(onWishlist && 'text-[#c4b5fd] border-[rgb(139_92_246/0.4)]')}
        >
          {onWishlist ? labels.wishlistRemove : labels.wishlistAdd}
        </Button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? labels.edit : labels.add}
        footer={
          <div className="flex gap-2">
            {editing ? (
              <Button variant="danger" onClick={() => remove(editing)} disabled={saving}>
                {labels.remove}
              </Button>
            ) : null}
            <Button onClick={submit} loading={saving} fullWidth>
              {saving ? labels.saving : labels.save}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-xl border border-[rgb(240_87_111/0.3)] bg-[rgb(240_87_111/0.08)] px-3 py-2 text-[0.8125rem] text-rose">
              {error}
            </p>
          ) : null}

          <Select
            label={labels.variant}
            value={form.variantId}
            onChange={(event) => setForm({ ...form, variantId: event.target.value })}
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={labels.language}
              value={form.language}
              onChange={(event) => setForm({ ...form, language: event.target.value })}
            >
              {languages.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </Select>

            <Select
              label={labels.condition}
              hint={labels.conditionHelp}
              value={form.condition}
              onChange={(event) => setForm({ ...form, condition: event.target.value })}
            >
              {conditions.map((condition) => (
                <option key={condition.value} value={condition.value}>
                  {condition.label}
                </option>
              ))}
            </Select>
          </div>

          {/*
            What the card is worth *in the condition being recorded*.
            The multiplier is shown alongside so the number is never a black
            box: the user can see it is a published adjustment from a near-mint
            reference, not a condition-specific market quote.
          */}
          {conditionEstimate ? (
            <div className="surface-flat flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="type-eyebrow">{labels.estimateFor}</p>
                <p className="type-meta mt-0.5 text-[0.6875rem]">
                  {labels.multiplier.replace(
                    '{value}',
                    String(CONDITION_MULTIPLIERS[form.condition as Condition] ?? 1),
                  )}
                </p>
              </div>
              <p
                className={cn(
                  'tnum shrink-0 font-display text-lg font-bold',
                  conditionEstimate.adjusted ? 'text-amber' : 'text-paper',
                )}
              >
                {conditionEstimate.adjusted ? '~' : ''}
                {formatMoney(
                  { minor: Math.round(conditionEstimate.amount * 100), currency: conditionEstimate.currency },
                  locale,
                )}
              </p>
            </div>
          ) : null}

          <Input
            label={labels.quantity}
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            value={form.quantity}
            onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
          />

          <div className="grid grid-cols-[1fr_88px] gap-3">
            <Input
              label={labels.purchasePrice}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={form.purchasePrice}
              onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })}
            />
            <Select
              label="—"
              aria-label="Currency"
              value={form.purchaseCurrency}
              onChange={(event) => setForm({ ...form, purchaseCurrency: event.target.value })}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </Select>
          </div>

          <Input
            label={labels.purchaseDate}
            type="date"
            value={form.purchaseDate}
            onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })}
          />

          <Textarea
            label={labels.notes}
            placeholder={labels.notesPlaceholder}
            value={form.notes}
            maxLength={1000}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </div>
      </Sheet>
    </div>
  );
}

function labelFor(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
