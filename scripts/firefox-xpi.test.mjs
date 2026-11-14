/**
 * Tests for the Firefox packaging/signing helpers.
 *
 * The interesting parts are the two that only run on a release: the check that
 * recognises "AMO already signed this version", and the JWT the AMO API
 * expects. Both fail in ways that are invisible until a release runs, which is
 * exactly when a mistake costs a version number.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createAmoJwt, isAlreadySignedError } from './firefox-xpi.cjs';

function decodeSegment(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

describe('AMO already-signed detection', () => {
  it('recognises the real conflict message', () => {
    // The exact text from the v7.0.25 run.
    expect(isAlreadySignedError('WebExtError: Submission failed (2): Conflict\n' +
      '{ "version": ["Version 7.0.25.0 already exists."] }')).toBe(true);
    expect(isAlreadySignedError('Version 7.0.25.0 already exists.')).toBe(true);
  });

  it('does not mistake other signing failures for it', () => {
    // Recovering a signed artifact only makes sense for this one conflict. Any
    // other failure must be reported as it happened.
    for (const output of [
      '',
      'WebExtError: Invalid API key',
      'WebExtError: Submission failed (401): Unauthorized',
      'WebExtError: Validation failed',
      'network timeout',
    ]) {
      expect(isAlreadySignedError(output), output).toBe(false);
    }
  });
});

describe('AMO JWT', () => {
  const apiKey = 'user:12345:678';
  const apiSecret = 'a-very-secret-value';

  it('is three base64url segments with the expected header', () => {
    const token = createAmoJwt(apiKey, apiSecret);
    const segments = token.split('.');

    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment, 'base64url alphabet only').toMatch(/^[A-Za-z0-9_-]+$/);
    }

    expect(decodeSegment(segments[0])).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('carries the issuer and a short lifetime', () => {
    const token = createAmoJwt(apiKey, apiSecret);
    const payload = decodeSegment(token.split('.')[1]);

    expect(payload.iss).toBe(apiKey);
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(8);
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(120);
  });

  it('signs the header and payload with HMAC-SHA256 of the secret', () => {
    const token = createAmoJwt(apiKey, apiSecret);
    const [header, payload, signature] = token.split('.');

    const expected = createHmac('sha256', apiSecret)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(signature).toBe(expected);
  });

  it('produces a different token each time', () => {
    // `jti` is fresh per call, which is what stops a replayed token.
    expect(createAmoJwt(apiKey, apiSecret)).not.toBe(createAmoJwt(apiKey, apiSecret));
  });
});
