import type { BatchResponse, Messaging, MulticastMessage } from 'firebase-admin/messaging';

export const DEFAULT_FCM_BATCH_SIZE = 200;
export const DEFAULT_FCM_RETRY_DELAY_MS = 500;

const PERMANENT_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

const TRANSIENT_ERROR_CODES = new Set([
  'messaging/unavailable',
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/quota-exceeded',
]);

export type TokenSendFailure = {
  token: string;
  code: string;
  message: string;
};

export type BatchSendSummary = {
  total: number;
  success: number;
  failedPermanent: number;
  abandonedAfterRetry: number;
  permanentFailures: TokenSendFailure[];
  abandonedFailures: TokenSendFailure[];
};

export type MulticastPayload = Pick<
  MulticastMessage,
  'notification' | 'data' | 'android' | 'apns'
>;

export function chunkTokens(tokens: string[], batchSize: number): string[][] {
  if (tokens.length === 0) return [];
  const size = Math.max(1, batchSize);
  const batches: string[][] = [];
  for (let i = 0; i < tokens.length; i += size) {
    batches.push(tokens.slice(i, i + size));
  }
  return batches;
}

export function classifyFailureCode(code: string | undefined): 'permanent' | 'transient' | 'unknown' {
  if (!code) return 'unknown';
  if (PERMANENT_ERROR_CODES.has(code)) return 'permanent';
  if (TRANSIENT_ERROR_CODES.has(code)) return 'transient';
  return 'unknown';
}

function collectFailures(batch: string[], response: BatchResponse): TokenSendFailure[] {
  const failures: TokenSendFailure[] = [];
  response.responses.forEach((item, index) => {
    if (item.success) return;
    failures.push({
      token: batch[index]!,
      code: item.error?.code ?? 'messaging/unknown-error',
      message: item.error?.message ?? 'Unknown FCM error',
    });
  });
  return failures;
}

async function sendBatchesInParallel(
  messaging: Messaging,
  batches: string[][],
  payload: MulticastPayload,
): Promise<{ successCount: number; failures: TokenSendFailure[] }> {
  if (batches.length === 0) {
    return { successCount: 0, failures: [] };
  }

  const responses = await Promise.all(
    batches.map((tokens) =>
      messaging.sendEachForMulticast({
        ...payload,
        tokens,
      }),
    ),
  );

  let successCount = 0;
  const failures: TokenSendFailure[] = [];
  responses.forEach((response, batchIndex) => {
    successCount += response.successCount;
    failures.push(...collectFailures(batches[batchIndex]!, response));
  });

  return { successCount, failures };
}

function partitionFailures(failures: TokenSendFailure[]) {
  const permanent: TokenSendFailure[] = [];
  const retryable: TokenSendFailure[] = [];
  const abandoned: TokenSendFailure[] = [];

  for (const failure of failures) {
    const kind = classifyFailureCode(failure.code);
    if (kind === 'permanent') {
      permanent.push(failure);
    } else if (kind === 'transient') {
      retryable.push(failure);
    } else {
      abandoned.push(failure);
    }
  }

  return { permanent, retryable, abandoned };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTokensWithRetry(
  messaging: Messaging,
  tokens: string[],
  payload: MulticastPayload,
  options?: { batchSize?: number; retryDelayMs?: number },
): Promise<BatchSendSummary> {
  const batchSize = options?.batchSize ?? DEFAULT_FCM_BATCH_SIZE;
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_FCM_RETRY_DELAY_MS;
  const uniqueTokens = [...new Set(tokens.filter((token) => token.trim().length > 0))];

  if (uniqueTokens.length === 0) {
    return {
      total: 0,
      success: 0,
      failedPermanent: 0,
      abandonedAfterRetry: 0,
      permanentFailures: [],
      abandonedFailures: [],
    };
  }

  const firstWave = await sendBatchesInParallel(
    messaging,
    chunkTokens(uniqueTokens, batchSize),
    payload,
  );

  const firstPartition = partitionFailures(firstWave.failures);
  let success = firstWave.successCount;
  const permanentFailures = [...firstPartition.permanent];
  let abandonedFailures = [...firstPartition.abandoned];

  const retryTokens = firstPartition.retryable.map((item) => item.token);
  if (retryTokens.length > 0) {
    if (retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }

    const retryWave = await sendBatchesInParallel(
      messaging,
      chunkTokens(retryTokens, batchSize),
      payload,
    );
    success += retryWave.successCount;

    const retryPartition = partitionFailures(retryWave.failures);
    permanentFailures.push(...retryPartition.permanent);
    abandonedFailures = [
      ...abandonedFailures,
      ...retryPartition.abandoned,
      ...retryPartition.retryable,
    ];
  }

  return {
    total: uniqueTokens.length,
    success,
    failedPermanent: permanentFailures.length,
    abandonedAfterRetry: abandonedFailures.length,
    permanentFailures,
    abandonedFailures,
  };
}
