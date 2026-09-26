import { describe, expect, it } from 'vitest';
import {
  buildShareDestinations,
  createShareToken,
  isShareToken,
} from '@/lib/collection-share';
import { buildPublicCollectionView } from '@/server/services/collection-share';

describe('collection share tokens', () => {
  it('creates 32-character base64url tokens', () => {
    const token = createShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(isShareToken(token)).toBe(true);
  });

  it('rejects malformed tokens', () => {
    expect(isShareToken('short')).toBe(false);
    expect(isShareToken('a'.repeat(31) + '!')).toBe(false);
  });
});

describe('public collection DTO', () => {
  it('hides values and never carries owner-private fields', () => {
    const view = buildPublicCollectionView({
      showValue: false,
      summary: {
        currency: 'EUR',
        uniqueCards: 1,
        totalCards: 2,
        totalValue: { minor: 1_500, currency: 'EUR' },
        topCards: [{
          cardId: 'swsh3-136',
          name: 'Fouinar',
          localId: '136',
          imageBaseUrl: null,
          total: { minor: 1_500, currency: 'EUR' },
        }],
      },
      groups: [{
        setId: 'swsh3',
        setName: 'Darkness Ablaze',
        uniqueCards: 1,
        setSize: 201,
      }],
    });

    expect(view.summary.totalValue).toBeNull();
    expect(view.highlights[0]?.value).toBeNull();
    expect(view.sets[0]?.completion).toBe(0.5);
    const serialized = JSON.stringify(view);
    for (const forbidden of ['email', 'notes', 'purchasePrice', 'purchaseDate', 'userId', 'entryId']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('collection share destinations', () => {
  it('encodes the public URL and message for supported destinations', () => {
    const destinations = buildShareDestinations({
      url: 'https://trackmydex.com/fr/shared/a_b-c',
      title: 'Ma collection Pokémon',
      text: 'Découvre ma collection & mes séries',
    });

    expect(destinations.map((destination) => destination.id)).toEqual([
      'email',
      'facebook',
      'x',
      'reddit',
    ]);
    for (const destination of destinations) {
      expect(destination.href).not.toContain('Découvre ma collection');
      expect(destination.href).toContain('trackmydex.com');
    }
  });
});
