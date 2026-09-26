export function collectionCardHref(cardId: string, language: string): string {
  const params = new URLSearchParams({ lang: language });
  return `/cards/${encodeURIComponent(cardId)}?${params}`;
}
