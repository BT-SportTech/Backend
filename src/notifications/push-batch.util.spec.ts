import type { BatchResponse } from 'firebase-admin/messaging';
import {
  chunkTokens,
  classifyFailureCode,
  sendTokensWithRetry,
} from './push-batch.util';

describe('push-batch.util', () => {
  describe('chunkTokens', () => {
    it('chunks tokens into batches of the given size', () => {
      expect(chunkTokens(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e'],
      ]);
    });
  });

  describe('classifyFailureCode', () => {
    it('marks invalid registration tokens as permanent', () => {
      expect(
        classifyFailureCode('messaging/registration-token-not-registered'),
      ).toBe('permanent');
    });

    it('marks unavailable errors as transient', () => {
      expect(classifyFailureCode('messaging/unavailable')).toBe('transient');
    });
  });

  describe('sendTokensWithRetry', () => {
    it('retries transient failures once and abandons tokens that fail again', async () => {
      const sendEachForMulticast = jest
        .fn()
        .mockResolvedValueOnce({
          successCount: 1,
          failureCount: 2,
          responses: [
            { success: true },
            {
              success: false,
              error: { code: 'messaging/unavailable', message: 'down' },
            },
            {
              success: false,
              error: {
                code: 'messaging/registration-token-not-registered',
                message: 'gone',
              },
            },
          ],
        } satisfies BatchResponse)
        .mockResolvedValueOnce({
          successCount: 0,
          failureCount: 1,
          responses: [
            {
              success: false,
              error: { code: 'messaging/internal-error', message: 'still down' },
            },
          ],
        } satisfies BatchResponse);

      const summary = await sendTokensWithRetry(
        { sendEachForMulticast } as never,
        ['ok', 'retry-me', 'dead'],
        { notification: { title: 'Hi', body: 'There' } },
        { batchSize: 200, retryDelayMs: 0 },
      );

      expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
      expect(summary.total).toBe(3);
      expect(summary.success).toBe(1);
      expect(summary.failedPermanent).toBe(1);
      expect(summary.abandonedAfterRetry).toBe(1);
      expect(summary.abandonedFailures[0]?.token).toBe('retry-me');
    });
  });
});
