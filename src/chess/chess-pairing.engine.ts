export const ROOKIE_GAMES_THRESHOLD = 5;
export const REMATCH_PENALTY = 10000;

export interface PairingPlayer {
  registrationId: string;
  userId: string;
  rating: number;
  age: number;
  gamesPlayedOnPlatform: number;
  eventWins: number;
  eventLosses: number;
  eventDraws: number;
  whiteGames: number;
  blackGames: number;
  opponentRegistrationIds: string[];
}

export interface PairingAssignment {
  white: PairingPlayer;
  black: PairingPlayer;
}

export interface PairingResult {
  pairs: PairingAssignment[];
  byePlayer: PairingPlayer | null;
  unpairedPlayers: PairingPlayer[];
}

export function effectiveRating(player: PairingPlayer): number {
  if (player.gamesPlayedOnPlatform >= ROOKIE_GAMES_THRESHOLD) {
    return player.rating;
  }
  const ageBonus = Math.min(Math.max((player.age - 15) * 2, 0), 60);
  return 1000 + ageBonus;
}

export function pairingCost(a: PairingPlayer, b: PairingPlayer): number {
  let cost =
    Math.abs(effectiveRating(a) - effectiveRating(b)) * 10;

  const eitherRookie =
    a.gamesPlayedOnPlatform < ROOKIE_GAMES_THRESHOLD ||
    b.gamesPlayedOnPlatform < ROOKIE_GAMES_THRESHOLD;
  if (eitherRookie) {
    cost += Math.abs(a.age - b.age) * 2;
  }

  if (
    a.opponentRegistrationIds.includes(b.registrationId) ||
    b.opponentRegistrationIds.includes(a.registrationId)
  ) {
    cost += REMATCH_PENALTY;
  }

  return cost;
}

export function eventRecord(player: PairingPlayer): number {
  return player.eventWins - player.eventLosses;
}

export type Bracket = 'winner' | 'loser' | 'even';

export function bracketFor(player: PairingPlayer): Bracket {
  const record = eventRecord(player);
  if (record > 0) return 'winner';
  if (record < 0) return 'loser';
  return 'even';
}

export function assignColors(
  a: PairingPlayer,
  b: PairingPlayer,
): PairingAssignment {
  const mustAWhite = a.blackGames >= 2;
  const mustABlack = a.whiteGames >= 2;
  const mustBWhite = b.blackGames >= 2;
  const mustBBlack = b.whiteGames >= 2;

  if (mustAWhite && mustBWhite) {
    return assignByBalance(a, b);
  }
  if (mustABlack && mustBBlack) {
    return assignByBalance(a, b);
  }
  if (mustAWhite) return { white: a, black: b };
  if (mustABlack) return { white: b, black: a };
  if (mustBWhite) return { white: b, black: a };
  if (mustBBlack) return { white: a, black: b };

  return assignByBalance(a, b);
}

function assignByBalance(
  a: PairingPlayer,
  b: PairingPlayer,
): PairingAssignment {
  const aBalance = a.whiteGames - a.blackGames;
  const bBalance = b.whiteGames - b.blackGames;

  if (aBalance < bBalance) return { white: a, black: b };
  if (bBalance < aBalance) return { white: b, black: a };

  if (effectiveRating(a) >= effectiveRating(b)) {
    return { white: a, black: b };
  }
  return { white: b, black: a };
}

function pairPool(
  players: PairingPlayer[],
  boardCount: number,
): PairingResult {
  const sorted = [...players].sort(
    (x, y) => effectiveRating(y) - effectiveRating(x),
  );
  const unpaired = new Set(sorted.map((p) => p.registrationId));
  const pairs: PairingAssignment[] = [];

  while (pairs.length < boardCount && unpaired.size >= 2) {
    const anchorId = [...unpaired][0];
    const anchor = sorted.find((p) => p.registrationId === anchorId)!;
    unpaired.delete(anchorId);

    let bestOpponent: PairingPlayer | null = null;
    let bestCost = Infinity;

    for (const candidateId of unpaired) {
      const candidate = sorted.find((p) => p.registrationId === candidateId)!;
      const cost = pairingCost(anchor, candidate);
      if (cost < bestCost) {
        bestCost = cost;
        bestOpponent = candidate;
      }
    }

    if (!bestOpponent) break;

    unpaired.delete(bestOpponent.registrationId);
    pairs.push(assignColors(anchor, bestOpponent));
  }

  const remaining = sorted.filter((p) => unpaired.has(p.registrationId));
  let byePlayer: PairingPlayer | null = null;
  if (remaining.length === 1 && pairs.length < boardCount) {
    byePlayer = remaining[0];
    remaining.pop();
  }

  return { pairs, byePlayer, unpairedPlayers: remaining };
}

export function pairRound1(
  players: PairingPlayer[],
  boardCount: number,
): PairingResult {
  return pairPool(players, boardCount);
}

export function pairRoundN(
  players: PairingPlayer[],
  boardCount: number,
): PairingResult {
  const winnerBracket = players.filter((p) => bracketFor(p) === 'winner');
  const loserBracket = players.filter((p) => bracketFor(p) === 'loser');
  const evenBracket = players.filter((p) => bracketFor(p) === 'even');

  const allPairs: PairingAssignment[] = [];
  const spillover: PairingPlayer[] = [];
  let boardsLeft = boardCount;

  for (const bracket of [winnerBracket, loserBracket, evenBracket]) {
    if (boardsLeft <= 0 || bracket.length === 0) continue;
    const result = pairPool(bracket, boardsLeft);
    allPairs.push(...result.pairs);
    boardsLeft -= result.pairs.length;
    if (result.byePlayer) {
      spillover.push(result.byePlayer);
    }
    spillover.push(...result.unpairedPlayers);
  }

  let byePlayer: PairingPlayer | null = null;

  if (boardsLeft > 0 && spillover.length >= 2) {
    const result = pairPool(spillover, boardsLeft);
    allPairs.push(...result.pairs);
    boardsLeft -= result.pairs.length;
    if (result.byePlayer) {
      byePlayer = result.byePlayer;
    }
    return {
      pairs: allPairs,
      byePlayer,
      unpairedPlayers: result.unpairedPlayers,
    };
  }

  if (spillover.length === 1 && allPairs.length < boardCount) {
    byePlayer = spillover[0];
    spillover.length = 0;
  }

  return {
    pairs: allPairs,
    byePlayer,
    unpairedPlayers: spillover,
  };
}

export function pairForRound(
  roundNumber: number,
  players: PairingPlayer[],
  boardCount: number,
): PairingResult {
  if (roundNumber <= 1) {
    return pairRound1(players, boardCount);
  }
  return pairRoundN(players, boardCount);
}

export function ageFromDateOfBirth(dob: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}
