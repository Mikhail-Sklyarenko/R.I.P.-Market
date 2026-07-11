import type { WearTierKey } from './float-tier.util';
import { floatDistance, getWearTierKey, parseFloatValue } from './float-tier.util';

export type SimilarLotCandidate = {
  id: string;
  priceMinor: bigint;
  floatValue: string | number | { toString(): string } | null | undefined;
  wear: string | null | undefined;
  itemDefinitionId: string;
  marketHashName: string;
};

export type SimilarLotSource = {
  id: string;
  itemDefinitionId: string;
  marketHashName: string;
  floatValue: string | number | { toString(): string } | null | undefined;
  wear: string | null | undefined;
};

export function scoreSimilarLot(
  source: SimilarLotSource,
  candidate: SimilarLotCandidate,
): number {
  const sourceFloat = parseFloatValue(source.floatValue);
  const candidateFloat = parseFloatValue(candidate.floatValue);
  const sourceTier =
    source.wear ?? (sourceFloat !== null ? getWearTierKey(sourceFloat) : null);
  const candidateTier =
    candidate.wear ??
    (candidateFloat !== null ? getWearTierKey(candidateFloat) : null);

  let score = 0;

  if (candidate.itemDefinitionId === source.itemDefinitionId) {
    score += 1000;
  } else if (candidate.marketHashName === source.marketHashName) {
    score += 800;
  }

  if (sourceTier && candidateTier && sourceTier === candidateTier) {
    score += 200;
  }

  if (sourceFloat !== null && candidateFloat !== null) {
    const distance = floatDistance(sourceFloat, candidateFloat);
    score += Math.max(0, 120 - distance * 400);
  }

  return score;
}

export function pickSimilarLots<T extends SimilarLotCandidate>(
  source: SimilarLotSource,
  candidates: T[],
  limit: number,
): T[] {
  return candidates
    .filter((candidate) => candidate.id !== source.id)
    .map((candidate) => ({
      candidate,
      score: scoreSimilarLot(source, candidate),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return Number(a.candidate.priceMinor - b.candidate.priceMinor);
    })
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function getWearTierLabel(tier: WearTierKey | string | null | undefined): string | null {
  if (!tier) {
    return null;
  }
  return String(tier);
}
