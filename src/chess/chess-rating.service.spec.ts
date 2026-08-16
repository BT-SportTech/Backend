import { ChessMatchResult } from '@prisma/client';
import { ChessRatingService } from './chess-rating.service';
import {
  CHESS_DRAW_POINTS,
  CHESS_LOSS_POINTS,
  CHESS_STARTING_POINTS,
  CHESS_WIN_POINTS,
} from './chess-points';

describe('ChessRatingService', () => {
  let service: ChessRatingService;

  beforeEach(() => {
    service = new ChessRatingService(null as never);
  });

  describe('newRating', () => {
    it('adds win points on win', () => {
      const updated = service.newRating(
        CHESS_STARTING_POINTS,
        CHESS_STARTING_POINTS,
        1,
        0,
      );
      expect(updated).toBe(CHESS_STARTING_POINTS + CHESS_WIN_POINTS);
    });

    it('subtracts loss points on loss', () => {
      const updated = service.newRating(
        CHESS_STARTING_POINTS,
        CHESS_STARTING_POINTS,
        0,
        0,
      );
      expect(updated).toBe(CHESS_STARTING_POINTS + CHESS_LOSS_POINTS);
    });

    it('adds draw points on draw', () => {
      const updated = service.newRating(
        CHESS_STARTING_POINTS,
        CHESS_STARTING_POINTS,
        0.5,
        0,
      );
      expect(updated).toBe(CHESS_STARTING_POINTS + CHESS_DRAW_POINTS);
    });

    it('uses fixed deltas regardless of games played', () => {
      const rookie = service.newRating(CHESS_STARTING_POINTS, 12000, 1, 0);
      const veteran = service.newRating(CHESS_STARTING_POINTS, 12000, 1, 30);
      expect(rookie).toBe(veteran);
      expect(rookie).toBe(CHESS_STARTING_POINTS + CHESS_WIN_POINTS);
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

  describe('pointsDeltaForResult', () => {
    it('returns fixed deltas', () => {
      expect(
        service.pointsDeltaForResult(true, ChessMatchResult.WHITE_WIN),
      ).toBe(CHESS_WIN_POINTS);
      expect(
        service.pointsDeltaForResult(true, ChessMatchResult.BLACK_WIN),
      ).toBe(CHESS_LOSS_POINTS);
      expect(service.pointsDeltaForResult(true, ChessMatchResult.DRAW)).toBe(
        CHESS_DRAW_POINTS,
      );
    });
  });
});
