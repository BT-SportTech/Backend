import {
  assignColors,
  bracketFor,
  effectiveRating,
  pairForRound,
  pairRound1,
  pairingCost,
  PairingPlayer,
  REMATCH_PENALTY,
} from './chess-pairing.engine';

function makePlayer(
  overrides: Partial<PairingPlayer> & { registrationId: string },
): PairingPlayer {
  return {
    userId: `user-${overrides.registrationId}`,
    rating: 10000,
    age: 20,
    gamesPlayedOnPlatform: 0,
    eventWins: 0,
    eventLosses: 0,
    eventDraws: 0,
    whiteGames: 0,
    blackGames: 0,
    opponentRegistrationIds: [],
    ...overrides,
  };
}

describe('ChessPairingEngine', () => {
  describe('effectiveRating', () => {
    it('uses platform rating for experienced players', () => {
      const player = makePlayer({
        registrationId: 'r1',
        rating: 1200,
        gamesPlayedOnPlatform: 10,
        age: 45,
      });
      expect(effectiveRating(player)).toBe(1200);
    });

    it('applies age bonus for rookies', () => {
      const young = makePlayer({ registrationId: 'r1', age: 15 });
      const older = makePlayer({ registrationId: 'r2', age: 45 });
      expect(effectiveRating(young)).toBe(10000);
      expect(effectiveRating(older)).toBe(10060);
    });
  });

  describe('pairingCost', () => {
    it('heavily penalizes rematches', () => {
      const a = makePlayer({ registrationId: 'a' });
      const b = makePlayer({
        registrationId: 'b',
        opponentRegistrationIds: ['a'],
      });
      expect(pairingCost(a, b)).toBeGreaterThanOrEqual(REMATCH_PENALTY);
    });
  });

  describe('assignColors', () => {
    it('avoids giving white when player already has 2 white games', () => {
      const a = makePlayer({ registrationId: 'a', whiteGames: 2, blackGames: 0 });
      const b = makePlayer({ registrationId: 'b', whiteGames: 0, blackGames: 0 });
      const result = assignColors(a, b);
      expect(result.white.registrationId).toBe('b');
      expect(result.black.registrationId).toBe('a');
    });

    it('avoids giving black when player already has 2 black games', () => {
      const a = makePlayer({ registrationId: 'a', blackGames: 2, whiteGames: 0 });
      const b = makePlayer({ registrationId: 'b', whiteGames: 0, blackGames: 0 });
      const result = assignColors(a, b);
      expect(result.white.registrationId).toBe('a');
      expect(result.black.registrationId).toBe('b');
    });
  });

  describe('pairRound1', () => {
    it('creates up to boardCount pairs', () => {
      const players = Array.from({ length: 10 }, (_, i) =>
        makePlayer({ registrationId: `r${i}`, age: 15 + i }),
      );
      const result = pairRound1(players, 3);
      expect(result.pairs).toHaveLength(3);
      expect(result.pairs[0].white.registrationId).not.toBe(
        result.pairs[0].black.registrationId,
      );
    });

    it('assigns bye for odd player when one slot remains', () => {
      const players = [
        makePlayer({ registrationId: 'r1' }),
        makePlayer({ registrationId: 'r2' }),
        makePlayer({ registrationId: 'r3' }),
      ];
      const result = pairRound1(players, 2);
      expect(result.pairs).toHaveLength(1);
      expect(result.byePlayer).not.toBeNull();
    });
  });

  describe('bracketFor and pairRoundN', () => {
    it('places players in winner/loser/even brackets', () => {
      expect(
        bracketFor(makePlayer({ registrationId: 'w', eventWins: 1 })),
      ).toBe('winner');
      expect(
        bracketFor(makePlayer({ registrationId: 'l', eventLosses: 1 })),
      ).toBe('loser');
      expect(
        bracketFor(makePlayer({ registrationId: 'e', eventDraws: 1 })),
      ).toBe('even');
    });

    it('pairs winners with winners in round 2', () => {
      const winners = [
        makePlayer({ registrationId: 'w1', eventWins: 1, gamesPlayedOnPlatform: 10, rating: 1100 }),
        makePlayer({ registrationId: 'w2', eventWins: 1, gamesPlayedOnPlatform: 10, rating: 1050 }),
      ];
      const losers = [
        makePlayer({ registrationId: 'l1', eventLosses: 1 }),
        makePlayer({ registrationId: 'l2', eventLosses: 1 }),
      ];
      const result = pairForRound(2, [...winners, ...losers], 2);
      expect(result.pairs).toHaveLength(2);
      const pairIds = result.pairs.map((p) => [
        p.white.registrationId,
        p.black.registrationId,
      ]);
      expect(pairIds.some(([a, b]) => a.startsWith('w') && b.startsWith('w'))).toBe(true);
      expect(pairIds.some(([a, b]) => a.startsWith('l') && b.startsWith('l'))).toBe(true);
    });

    it('pairs single leftover players across brackets', () => {
      const winner = makePlayer({ registrationId: 'w1', eventWins: 1 });
      const loser = makePlayer({ registrationId: 'l1', eventLosses: 1 });
      const result = pairForRound(2, [winner, loser], 3);
      expect(result.pairs).toHaveLength(1);
      expect(result.byePlayer).toBeNull();
    });
  });

  describe('color balance across multiple pairings', () => {
    it('does not assign same color three times when pairing sequentially', () => {
      const players = Array.from({ length: 6 }, (_, i) =>
        makePlayer({ registrationId: `r${i}` }),
      );
      const colors: Record<string, { white: number; black: number }> = {};
      for (const p of players) {
        colors[p.registrationId] = { white: 0, black: 0 };
      }

      for (let round = 0; round < 3; round++) {
        for (const p of players) {
          p.whiteGames = colors[p.registrationId].white;
          p.blackGames = colors[p.registrationId].black;
        }
        const result = pairRound1(players, 3);
        for (const pair of result.pairs) {
          colors[pair.white.registrationId].white += 1;
          colors[pair.black.registrationId].black += 1;
        }
      }

      for (const p of players) {
        expect(colors[p.registrationId].white).toBeLessThanOrEqual(2);
        expect(colors[p.registrationId].black).toBeLessThanOrEqual(2);
      }
    });
  });
});
