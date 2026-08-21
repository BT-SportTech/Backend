import { parseServiceAccountJson } from './parse-service-account-json';

describe('parseServiceAccountJson', () => {
  it('parses minified JSON from env', () => {
    const parsed = parseServiceAccountJson(
      '{"type":"service_account","project_id":"sportechpro-3b872"}',
    );
    expect(parsed.project_id).toBe('sportechpro-3b872');
  });

  it('parses JSON wrapped in single quotes from .env', () => {
    const parsed = parseServiceAccountJson(
      '\'{"type":"service_account","project_id":"sportechpro-3b872"}\'',
    );
    expect(parsed.project_id).toBe('sportechpro-3b872');
  });

  it('throws on empty value', () => {
    expect(() => parseServiceAccountJson('   ')).toThrow(
      'FIREBASE_SERVICE_ACCOUNT_JSON is empty.',
    );
  });
});
