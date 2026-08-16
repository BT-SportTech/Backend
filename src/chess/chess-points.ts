/** Career chess score: start at 10,000; apply these deltas after every game. */
export const CHESS_STARTING_POINTS = 10000;
export const CHESS_WIN_POINTS = 100;
export const CHESS_LOSS_POINTS = -50;
export const CHESS_DRAW_POINTS = 50;

export function chessPointsDelta(outcome: 'win' | 'loss' | 'draw'): number {
  if (outcome === 'win') return CHESS_WIN_POINTS;
  if (outcome === 'loss') return CHESS_LOSS_POINTS;
  return CHESS_DRAW_POINTS;
}
