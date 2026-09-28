import { describe, expect, it } from 'vitest';
import { catalogText } from '@/lib/catalog/text';

describe('catalog display text', () => {
  it('uses Pokemon spelling in English without altering native print languages', () => {
    expect(catalogText('Pokémon GO', 'en')).toBe('Pokemon GO');
    expect(catalogText('Pokémon GO', 'fr')).toBe('Pokémon GO');
    expect(catalogText('ポケモン GO', 'ja')).toBe('ポケモン GO');
  });
});
