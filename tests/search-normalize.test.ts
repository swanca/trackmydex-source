import { describe, expect, it } from 'vitest';
import { normalizeSearchText, normalizeSearchToken, numberSearchTokens } from '@/lib/search/normalize';

describe('search normalization', () => {
  it('treats accents, spaces, hyphens and underscores as equivalent', () => {
    expect(normalizeSearchText('Mew-VMAX')).toBe('mewvmax');
    expect(normalizeSearchText('mew vmax')).toBe('mewvmax');
    expect(normalizeSearchText('MÉLANCOLUX_')).toBe('melancolux');
  });

  it('keeps number tokens comparable without leading zeroes', () => {
    expect(numberSearchTokens('01')).toEqual(['01', '1']);
    expect(numberSearchTokens('001/165')).toEqual(['001/165', '1/165', '1']);
    expect(normalizeSearchToken('TG-05')).toBe('tg05');
  });
});
