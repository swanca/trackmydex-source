import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { collectionShare, user } from '@/db/schema';
import type { Currency } from '@/db/schema/enums';
import { createShareToken, isShareToken } from '@/lib/collection-share';
import type { Money } from '@/lib/pricing/money';
import { LOCALE_DEFAULT_CARD_LANGUAGE, toUiLocale } from '@/lib/catalog/languages';
import { getPortfolioSummary } from './portfolio';
import { listCollectionBySet } from './collection-groups';

export interface CollectionShareState {
  publicToken: string;
  showValue: boolean;
}

export interface PublicCollectionView {
  showValue: boolean;
  currency: Currency;
  summary: {
    uniqueCards: number;
    totalCards: number;
    setCount: number;
    totalValue: Money | null;
  };
  sets: Array<{
    id: string;
    name: string;
    owned: number;
    total: number;
    completion: number;
  }>;
  highlights: Array<{
    cardId: string;
    name: string;
    localId: string;
    imageBaseUrl: string | null;
    value: Money | null;
  }>;
}

interface PublicViewInput {
  showValue: boolean;
  summary: {
    currency: Currency;
    uniqueCards: number;
    totalCards: number;
    totalValue: Money;
    topCards: Array<{
      cardId: string;
      name: string;
      localId: string;
      imageBaseUrl: string | null;
      total: Money;
    }>;
  };
  groups: Array<{
    setId: string;
    setName: string;
    uniqueCards: number;
    setSize: number;
  }>;
}

export function buildPublicCollectionView({
  showValue,
  summary,
  groups,
}: PublicViewInput): PublicCollectionView {
  return {
    showValue,
    currency: summary.currency,
    summary: {
      uniqueCards: summary.uniqueCards,
      totalCards: summary.totalCards,
      setCount: groups.length,
      totalValue: showValue ? summary.totalValue : null,
    },
    sets: groups.map((group) => ({
      id: group.setId,
      name: group.setName,
      owned: group.uniqueCards,
      total: group.setSize || group.uniqueCards,
      completion: group.setSize > 0
        ? Math.round((group.uniqueCards / group.setSize) * 1_000) / 10
        : 100,
    })),
    highlights: summary.topCards.slice(0, 8).map((card) => ({
      cardId: card.cardId,
      name: card.name,
      localId: card.localId,
      imageBaseUrl: card.imageBaseUrl,
      value: showValue ? card.total : null,
    })),
  };
}

export async function getCollectionShare(userId: string): Promise<CollectionShareState | null> {
  const [row] = await db
    .select({ publicToken: collectionShare.publicToken, showValue: collectionShare.showValue })
    .from(collectionShare)
    .where(eq(collectionShare.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function createCollectionShare(userId: string): Promise<CollectionShareState> {
  const existing = await getCollectionShare(userId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicToken = createShareToken();
    const [created] = await db
      .insert(collectionShare)
      .values({ userId, publicToken })
      .onConflictDoNothing()
      .returning({ publicToken: collectionShare.publicToken, showValue: collectionShare.showValue });
    if (created) return created;

    const raced = await getCollectionShare(userId);
    if (raced) return raced;
  }
  throw new Error('Could not create collection share');
}

export async function setCollectionShareValueVisibility(
  userId: string,
  showValue: boolean,
): Promise<CollectionShareState | null> {
  const [row] = await db
    .update(collectionShare)
    .set({ showValue, updatedAt: new Date() })
    .where(eq(collectionShare.userId, userId))
    .returning({ publicToken: collectionShare.publicToken, showValue: collectionShare.showValue });
  return row ?? null;
}

export async function revokeCollectionShare(userId: string): Promise<void> {
  await db.delete(collectionShare).where(eq(collectionShare.userId, userId));
}

export async function getPublicCollection(
  token: string,
  locale: string,
): Promise<PublicCollectionView | null> {
  if (!isShareToken(token)) return null;

  const [owner] = await db
    .select({
      userId: collectionShare.userId,
      showValue: collectionShare.showValue,
      displayCurrency: user.displayCurrency,
    })
    .from(collectionShare)
    .innerJoin(user, and(eq(user.id, collectionShare.userId)))
    .where(eq(collectionShare.publicToken, token))
    .limit(1);
  if (!owner) return null;

  const displayLanguage = LOCALE_DEFAULT_CARD_LANGUAGE[toUiLocale(locale)];
  const [summary, grouped] = await Promise.all([
    getPortfolioSummary(owner.userId, owner.displayCurrency),
    listCollectionBySet(owner.userId, displayLanguage, owner.displayCurrency),
  ]);

  return buildPublicCollectionView({
    showValue: owner.showValue,
    summary,
    groups: [...grouped.main, ...grouped.asian],
  });
}
