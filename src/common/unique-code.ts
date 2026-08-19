export const UNIQUE_CODE_LENGTH = 8;

export const UNIQUE_CODE_MIN = 0;
export const UNIQUE_CODE_MAX = 99_999_999;

const NUMERIC_CODE_PATTERN = /^\d{8}$/;

/** Zero-pad a numeric value to 8 digits for storage/display. */
export function formatUniqueCodeForStorage(
  value: number | string,
): string {
  const n =
    typeof value === 'number'
      ? value
      : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < UNIQUE_CODE_MIN || n > UNIQUE_CODE_MAX) {
    throw new RangeError(
      `Unique code must be an integer from ${UNIQUE_CODE_MIN} to ${UNIQUE_CODE_MAX}.`,
    );
  }
  return String(n).padStart(UNIQUE_CODE_LENGTH, '0');
}

/** True when value is exactly 8 decimal digits. */
export function isValidUniqueCode(value: string): boolean {
  return NUMERIC_CODE_PATTERN.test(value.trim());
}
