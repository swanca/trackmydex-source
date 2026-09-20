'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { updatePreferences } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';

/**
 * Preferences.
 *
 * Three independent settings, presented as three independent controls with
 * their own explanations. Conflating "my app is in French" with "I collect
 * French cards" is the single most common way a tracker gets this wrong, so
 * the copy under each field says exactly what it does and does not change.
 */
export function PreferencesForm({
  initial,
  uiLocales,
  cardLanguages,
  labels,
}: {
  initial: {
    uiLocale: string;
    defaultCardLanguage: string;
    displayCurrency: string;
    weeklyDigest: boolean;
  };
  uiLocales: Array<{ value: string; label: string }>;
  cardLanguages: Array<{ value: string; label: string }>;
  labels: {
    uiLanguage: string;
    uiLanguageHelp: string;
    defaultCardLanguage: string;
    defaultCardLanguageHelp: string;
    displayCurrency: string;
    displayCurrencyHelp: string;
    save: string;
    saving: string;
    saved: string;
    signOut: string;
    weeklyDigest: string;
    weeklyDigestHelp: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    start(async () => {
      await updatePreferences(form);
      setSaved(true);
      // The UI locale lives in the URL, so a change means a real navigation.
      if (form.uiLocale !== initial.uiLocale) {
        const rest = window.location.pathname.split('/').slice(2).join('/');
        window.location.href = `/${form.uiLocale}/${rest}`;
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Select
        label={labels.uiLanguage}
        hint={labels.uiLanguageHelp}
        value={form.uiLocale}
        onChange={(event) => setForm({ ...form, uiLocale: event.target.value })}
      >
        {uiLocales.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Select
        label={labels.defaultCardLanguage}
        hint={labels.defaultCardLanguageHelp}
        value={form.defaultCardLanguage}
        onChange={(event) => setForm({ ...form, defaultCardLanguage: event.target.value })}
      >
        {cardLanguages.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Select
        label={labels.displayCurrency}
        hint={labels.displayCurrencyHelp}
        value={form.displayCurrency}
        onChange={(event) => setForm({ ...form, displayCurrency: event.target.value })}
      >
        <option value="EUR">EUR €</option>
        <option value="USD">USD $</option>
      </Select>

      {/* Opt-in, and off by default: an unsolicited weekly email is the
          fastest way to be marked as spam, which then costs deliverability
          for the mail that matters, like a password reset. */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline px-3.5 py-3">
        <input
          type="checkbox"
          checked={form.weeklyDigest}
          onChange={(event) => setForm({ ...form, weeklyDigest: event.target.checked })}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-violet)]"
        />
        <span className="min-w-0">
          <span className="block text-[0.875rem] font-medium text-paper">
            {labels.weeklyDigest}
          </span>
          <span className="block text-[0.75rem] text-muted">{labels.weeklyDigestHelp}</span>
        </span>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={save} loading={pending}>
          {pending ? labels.saving : labels.save}
        </Button>
        {saved ? <span className="text-[0.8125rem] text-mint">{labels.saved}</span> : null}
      </div>

      <Button
        variant="ghost"
        onClick={() =>
          authClient.signOut().then(() => {
            router.push('/');
            router.refresh();
          })
        }
      >
        {labels.signOut}
      </Button>
    </div>
  );
}
