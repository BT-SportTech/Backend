import { ChessMatchResult } from '@prisma/client';
import { ChessRatingService } from './chess-rating.service';

describe('ChessRatingService', () => {
  let service: ChessRatingService;

  beforeEach(() => {
    service = new ChessRatingService(null as never);
  });

  describe('expectedScore', () => {
    it('returns 0.5 for equal ratings', () => {
      expect(service.expectedScore(1000, 1000)).toBeCloseTo(0.5);
    });

    it('returns higher score for higher-rated player', () => {
      expect(service.expectedScore(1200, 1000)).toBeGreaterThan(0.5);
    });
  });

  describe('newRating', () => {
    it('increases rating on win against equal opponent', () => {
      const updated = service.newRating(1000, 1000, 1, 0);
      expect(updated).toBeGreaterThan(1000);
    });

    it('decreases rating on loss against equal opponent', () => {
      const updated = service.newRating(1000, 1000, 0, 0);
      expect(updated).toBeLessThan(1000);
    });

    it('uses lower K-factor after 30 games', () => {
      const rookieChange = service.newRating(1000, 1000, 1, 0) - 1000;
      const veteranChange = service.newRating(1000, 1000, 1, 30) - 1000;
      expect(Math.abs(rookieChange)).toBeGreaterThan(Math.abs(veteranChange));
    });
  });

  describe('scoreForResult', () => {
    it('returns correct scores for white player', () => {
      expect(service.scoreForResult(true, ChessMatchResult.WHITE_WIN)).toBe(1);
      expect(service.scoreForResult(true, ChessMatchResult.BLACK_WIN)).toBe(0);
      expect(service.scoreForResult(true, ChessMatchResult.DRAW)).toBe(0.5);
    });

    it('returns correct scores for black player', () => {
      expect(service.scoreForResult(false, ChessMatchResult.BLACK_WIN)).toBe(1);
      expect(service.scoreForResult(false, ChessMatchResult.WHITE_WIN)).toBe(0);
      expect(service.scoreForResult(false, ChessMatchResult.DRAW)).toBe(0.5);
    });
  });
});
