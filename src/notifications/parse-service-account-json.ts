export function parseServiceAccountJson(raw: string): Record<string, unknown> {
  let value = raw.trim();
  if (!value) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is empty.');
  }

  // Unwrap one layer of outer single/double quotes from .env / Vercel.
  while (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const unwrapped = value.slice(1, -1).trim();
    if (!unwrapped) break;
    value = unwrapped;
    if (value.startsWith('{') || value.startsWith('[')) break;
  }

  let parsed: unknown = JSON.parse(value);

  // Handle double-encoded JSON: "{\"type\":\"service_account\",...}"
  if (typeof parsed === 'string') {
    const inner = parsed.trim();
    if (inner.startsWith('{') || inner.startsWith('[')) {
      parsed = JSON.parse(inner);
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}
