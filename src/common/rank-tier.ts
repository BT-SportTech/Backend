export const RANK_TIERS = [
  'Rookie',
  'Intermediate',
  'Pro',
  'Elite',
  'Legend',
] as const;

export type RankTier = (typeof RANK_TIERS)[number];

/** Inclusive min / exclusive max (null = open-ended). Matches frontend rankTierFromPoints. */
export function pointsRangeForRank(rank: RankTier): {
  min: number;
  max: number | null;
} {
  switch (rank) {
    case 'Legend':
      return { min: 1000, max: null };
    case 'Elite':
      return { min: 600, max: 1000 };
    case 'Pro':
      return { min: 300, max: 600 };
    case 'Intermediate':
      return { min: 100, max: 300 };
    case 'Rookie':
    default:
      return { min: 0, max: 100 };
  }
}

export function rankMatchesPoints(rank: RankTier, points: number): boolean {
  const { min, max } = pointsRangeForRank(rank);
  if (points < min) return false;
  if (max != null && points >= max) return false;
  return true;
}
