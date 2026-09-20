/**
 * Browser-side API calls.
 *
 * Mutations go through route handlers rather than server actions so that the
 * quantity stepper can be optimistic with a real rollback: a server action's
 * revalidation round-trip is too slow for a control the user taps repeatedly
 * while working through a binder.
 */

export interface ApiError {
  error: string;
  status: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    const error = new Error(message) as Error & ApiError;
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

export interface QuantityResponse {
  /** The stack that was touched: this variant, language and condition. */
  quantity: number;
  /** Every copy of the card, across languages and conditions. */
  cardTotal: number;
  cardId: string;
  removed: boolean;
}

export function adjustQuantity(body: {
  cardVariantId: string;
  language: string;
  condition?: string;
  delta: number;
}): Promise<QuantityResponse> {
  return request<QuantityResponse>('/api/collection/quantity', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function saveEntry(body: {
  cardVariantId: string;
  language: string;
  condition: string;
  quantity: number;
  purchasePrice?: number | null;
  purchaseCurrency?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
}): Promise<QuantityResponse> {
  return request<QuantityResponse>('/api/collection/entry', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteEntry(entryId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/collection/entry/${entryId}`, { method: 'DELETE' });
}

export function toggleWishlist(body: {
  cardVariantId: string;
  language: string;
  targetPrice?: number | null;
  targetCurrency?: string | null;
  priority?: number;
  remove?: boolean;
}): Promise<{ wishlisted: boolean }> {
  return request<{ wishlisted: boolean }>('/api/wishlist', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePreferences(body: {
  weeklyDigest?: boolean;
  uiLocale?: string;
  defaultCardLanguage?: string;
  displayCurrency?: string;
}): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/profile/preferences', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Sealed has no `cardId` to return, so it gets its own response shape. */
export interface SealedQuantityResponse {
  quantity: number;
  removed: boolean;
}

export function adjustSealedQuantity(body: {
  sealedProductId: string;
  state: string;
  delta: number;
}): Promise<SealedQuantityResponse> {
  return request<SealedQuantityResponse>('/api/sealed/quantity', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function saveSealedEntry(body: {
  sealedProductId: string;
  state: string;
  quantity: number;
  purchasePrice?: number | null;
  purchaseCurrency?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
}): Promise<{ id: string }> {
  return request<{ id: string }>('/api/sealed/entry', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteSealedEntry(entryId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/sealed/entry/${entryId}`, { method: 'DELETE' });
}

export function triggerSync(kind: 'catalog' | 'translations' | 'prices' | 'snapshot' | 'sealed') {
  return request<{ started: boolean; message: string }>('/api/admin/sync', {
    method: 'POST',
    body: JSON.stringify({ kind }),
  });
}

export function saveMapping(body: {
  cardVariantId: string;
  cardmarketProductId: number | null;
  tcgplayerProductId: number | null;
}) {
  return request<{ ok: true }>('/api/admin/mapping', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
