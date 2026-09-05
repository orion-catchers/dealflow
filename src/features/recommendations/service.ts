import type {
  CanonicalQuotePort, Recommendation, RecommendationPreviewPort, RevisionRequest,
} from '../../contracts/krishna';
import { rankRecommendations } from './rank';

export function createRequestKey(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export async function loadRecommendations(
  port: RecommendationPreviewPort,
  request: Parameters<RecommendationPreviewPort['preview']>[0],
): Promise<Recommendation[]> {
  // A failed live request propagates to the caller. The UI must show its error;
  // this function never substitutes a fixture or stale preview.
  const preview = await port.preview(request);
  return rankRecommendations(preview);
}

export async function addRecommendation<QuoteResult>(
  port: Pick<CanonicalQuotePort<QuoteResult, unknown, unknown>, 'addLine'>,
  request: Omit<RevisionRequest, 'requestKey'> & Pick<Recommendation, 'productId' | 'variantId' | 'quantity'>,
  requestKey = createRequestKey('recommendation-add'),
): Promise<QuoteResult> {
  return port.addLine({ ...request, requestKey });
}

export function dismissRecommendation(dismissedProductIds: readonly string[], productId: string): string[] {
  return Array.from(new Set([...dismissedProductIds, productId]));
}
