/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * End-to-end cryptographic and security boundary tests for KalderaShield's
 * vault-backed software WebAuthn Passkey Provider (Phase 1 / Option B).
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeVaultSession, openVaultSession } from './vaultSession';
import { base64UrlToBytes, bytesToBase64Url, derEcdsaToRaw, verifyPasskeyAssertion } from './passkeyAssertion';
import { encodeCoseP256PublicKey, encodeNoneAttestationObject, rawEcdsaToDer } from './passkeyCbor';
import {
  createSoftwarePasskey,
  findMatchingSoftwarePasskeys,
  signSoftwarePasskeyAssertion,
  validateOriginAndRpId,
} from './passkeyProvider';
import {
  PasskeyError,
  passkeyErrorCodes,
  recordToVaultFields,
  reWrapPasskeysInVaultItems,
  type PasskeyRecord,
} from './passkey';
import type { VaultItem } from '../types';

const TEST_VAULT_KEY = new Uint8Array(32).fill(0x42);

describe('passkeyCbor — deterministic CBOR/COSE and ECDSA DER encoding', () => {
  it('round-trips raw 64-byte ECDSA (r||s) signatures through ASN.1 DER including leading zeros and high bits', () => {
    const cases = [
      // Both coordinates have high bit set (requires 0x00 DER padding)
      new Uint8Array(64).fill(0xab),
      // Leading zeros in r and s
      (() => {
        const b = new Uint8Array(64);
        b[3] = 0x7f;
        b[31] = 0x01;
        b[35] = 0x80;
        b[63] = 0xff;
        return b;
      })(),
      // Minimal small integers
      (() => {
        const b = new Uint8Array(64);
        b[31] = 0x05;
        b[63] = 0x09;
        return b;
      })(),
    ];

    for (const raw of cases) {
      const der = rawEcdsaToDer(raw, 32);
      expect(der[0]).toBe(0x30);
      const back = derEcdsaToRaw(der, 32);
      expect(back).not.toBeNull();
      expect(Array.from(back!)).toEqual(Array.from(raw));
    }
  });

  it('encodes canonical CTAP2 COSE EC2 P-256 public keys and none attestationObject', () => {
    const x = new Uint8Array(32).fill(0x11);
    const y = new Uint8Array(32).fill(0x22);
    const cose = encodeCoseP256PublicKey(x, y);
    // Map of 5 entries: 0xa5, key 1 (0x01) -> 2 (0x02), key 3 (0x03) -> -7 (0x26),
    // key -1 (0x20) -> 1 (0x01), key -2 (0x21) -> 32-byte x (0x58 0x20 ...), key -3 (0x22) -> 32-byte y
    expect(cose[0]).toBe(0xa5);
    expect(Array.from(cose.subarray(1, 7))).toEqual([0x01, 0x02, 0x03, 0x26, 0x20, 0x01]);
    expect(cose.length).toBe(1 + 6 + (1 + 2 + 32) + (1 + 2 + 32));

    const authData = new Uint8Array(37).fill(0x01);
    const attestation = encodeNoneAttestationObject(authData);
    // Map of 3 entries: 0xa3, first key is shortest string "fmt" (0x63 'f' 'm' 't') -> "none"
    expect(attestation[0]).toBe(0xa3);
    expect(new TextDecoder().decode(attestation.subarray(2, 5))).toBe('fmt');
  });
});

describe('passkeyProvider — origin and RP ID validation', () => {
  it('accepts HTTPS origins, valid subdomain RP IDs, and localhost', () => {
    expect(validateOriginAndRpId('https://github.com', 'github.com')).toEqual({
      origin: 'https://github.com',
      rpId: 'github.com',
      hostname: 'github.com',
    });
    expect(validateOriginAndRpId('https://login.github.com', 'github.com')).toEqual({
      origin: 'https://login.github.com',
      rpId: 'github.com',
      hostname: 'login.github.com',
    });
    expect(validateOriginAndRpId('http://localhost:3000', 'localhost')).toEqual({
      origin: 'http://localhost:3000',
      rpId: 'localhost',
      hostname: 'localhost',
    });
  });

  it.each([
    ['http://github.com', 'github.com'],
    ['https://evil.com', 'github.com'],
    ['https://notgithub.com', 'github.com'],
    ['https://127.0.0.1', '127.0.0.1'],
    ['javascript:alert(1)', 'github.com'],
    ['file:///etc/passwd', 'localhost'],
  ])('rejects invalid or spoofed origin/rpId pair (%s, %s)', (origin, rpId) => {
    expect(() => validateOriginAndRpId(origin, rpId)).toThrowError(PasskeyError);
  });
});

describe('passkeyProvider — full W3C create + sign + verifyPasskeyAssertion round-trip', () => {
  beforeEach(() => {
    openVaultSession('test-master', 'test-master', TEST_VAULT_KEY);
  });

  afterEach(() => {
    closeVaultSession();
  });

  it('creates an ECDSA P-256 passkey and produces cryptographically valid assertions verified by verifyPasskeyAssertion', async () => {
    const createChallenge = new Uint8Array(32).fill(0xaa);
    const created = await createSoftwarePasskey({
      origin: 'https://webauthn.io',
      rpId: 'webauthn.io',
      rpName: 'WebAuthn.io',
      userName: 'alice@webauthn.io',
      challengeBase64Url: bytesToBase64Url(createChallenge),
      pubKeyCredAlgs: [-7, -257],
    });

    expect(created.record.providerKind).toBe('software');
    expect(created.record.algorithm).toBe('ES256');
    expect(created.record.rpId).toBe('webauthn.io');
    expect(created.record.signCount).toBe(0);
    expect(created.credential.type).toBe('public-key');
    expect(created.credential.response.publicKeyAlgorithm).toBe(-7);

    // Inspect clientDataJSON from create
    const createClientData = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(created.credential.response.clientDataJSON)),
    );
    expect(createClientData.type).toBe('webauthn.create');
    expect(createClientData.origin).toBe('https://webauthn.io');
    expect(createClientData.challenge).toBe(bytesToBase64Url(createChallenge));

    // Sign first assertion and verify with independent WebAuthn verifier (passkeyAssertion.ts)
    const getChallenge1 = new Uint8Array(32).fill(0x55);
    const signed1 = await signSoftwarePasskeyAssertion(created.record, {
      origin: 'https://webauthn.io',
      rpId: 'webauthn.io',
      challengeBase64Url: bytesToBase64Url(getChallenge1),
      allowCredentialIds: [created.record.credentialId],
    });

    expect(signed1.updatedRecord.signCount).toBe(1);
    const verify1 = await verifyPasskeyAssertion({
      publicKeyBase64Url: created.record.publicKey,
      rpId: 'webauthn.io',
      expectedChallenge: getChallenge1,
      expectedOrigin: 'https://webauthn.io',
      algorithm: 'ES256',
      authenticatorData: base64UrlToBytes(signed1.credential.response.authenticatorData),
      clientDataJson: base64UrlToBytes(signed1.credential.response.clientDataJSON),
      signature: base64UrlToBytes(signed1.credential.response.signature),
      previousSignCount: 0,
      userHandleBase64Url: signed1.credential.response.userHandle ?? undefined,
      expectedUserHandleBase64Url: created.record.userHandle,
    });
    expect(verify1).toEqual({ verified: true, signCount: 1 });

    // Sign second assertion and confirm signCount monotonically increases (1 -> 2)
    const getChallenge2 = new Uint8Array(32).fill(0x77);
    const signed2 = await signSoftwarePasskeyAssertion(signed1.updatedRecord, {
      origin: 'https://webauthn.io',
      rpId: 'webauthn.io',
      challengeBase64Url: bytesToBase64Url(getChallenge2),
    });

    const verify2 = await verifyPasskeyAssertion({
      publicKeyBase64Url: created.record.publicKey,
      rpId: 'webauthn.io',
      expectedChallenge: getChallenge2,
      expectedOrigin: 'https://webauthn.io',
      algorithm: 'ES256',
      authenticatorData: base64UrlToBytes(signed2.credential.response.authenticatorData),
      clientDataJson: base64UrlToBytes(signed2.credential.response.clientDataJSON),
      signature: base64UrlToBytes(signed2.credential.response.signature),
      previousSignCount: 1,
    });
    expect(verify2).toEqual({ verified: true, signCount: 2 });
  });

  it('enforces excludeCredentialIds and filters matching software passkeys', async () => {
    const created = await createSoftwarePasskey({
      origin: 'https://github.com',
      rpId: 'github.com',
      userName: 'dev@github.com',
      challengeBase64Url: bytesToBase64Url(new Uint8Array(16).fill(1)),
    });

    const item: VaultItem = {
      id: created.record.itemId,
      title: 'GitHub',
      username: 'dev@github.com',
      url: 'https://github.com',
      category: 'passkey',
      createdAt: created.record.createdAt,
      updatedAt: created.record.createdAt,
      ...recordToVaultFields(created.record),
    };

    expect(findMatchingSoftwarePasskeys([item], 'github.com')).toHaveLength(1);
    expect(findMatchingSoftwarePasskeys([item], 'gitlab.com')).toHaveLength(0);

    await expect(
      createSoftwarePasskey(
        {
          origin: 'https://github.com',
          rpId: 'github.com',
          userName: 'dev@github.com',
          challengeBase64Url: bytesToBase64Url(new Uint8Array(16).fill(2)),
          excludeCredentialIds: [created.record.credentialId],
        },
        [item],
      ),
    ).rejects.toMatchObject({ code: passkeyErrorCodes.invalidCredentialId });
  });

  it('continues signing validly after master vault key rotation via reWrapPasskeysInVaultItems', async () => {
    const created = await createSoftwarePasskey({
      origin: 'https://example.org',
      rpId: 'example.org',
      userName: 'alice@example.org',
      challengeBase64Url: bytesToBase64Url(new Uint8Array(16).fill(3)),
    });

    const newKey = new Uint8Array(32).fill(0x99);
    const items = [{ id: created.record.itemId, passkeyPrivateKeyBundle: created.record.privateKeyBundle }];
    await reWrapPasskeysInVaultItems(items, TEST_VAULT_KEY, newKey);

    openVaultSession('rotated-master', 'rotated-master', newKey);
    const rotatedRecord: PasskeyRecord = {
      ...created.record,
      privateKeyBundle: items[0]!.passkeyPrivateKeyBundle,
    };

    const challenge = new Uint8Array(32).fill(0x33);
    const signed = await signSoftwarePasskeyAssertion(rotatedRecord, {
      origin: 'https://example.org',
      rpId: 'example.org',
      challengeBase64Url: bytesToBase64Url(challenge),
    });

    const verified = await verifyPasskeyAssertion({
      publicKeyBase64Url: rotatedRecord.publicKey,
      rpId: 'example.org',
      expectedChallenge: challenge,
      expectedOrigin: 'https://example.org',
      algorithm: 'ES256',
      authenticatorData: base64UrlToBytes(signed.credential.response.authenticatorData),
      clientDataJson: base64UrlToBytes(signed.credential.response.clientDataJSON),
      signature: base64UrlToBytes(signed.credential.response.signature),
      previousSignCount: 0,
    });
    expect(verified).toEqual({ verified: true, signCount: 1 });
  });

  it('refuses to sign hardware-only passkey records as software credentials', async () => {
    const hardwareRecord: PasskeyRecord = {
      itemId: 'hw-1',
      credentialId: 'hw-cred-id',
      publicKey: 'abc',
      privateKeyBundle: { iv: '00', tag: '00', ciphertext: 'AA' },
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice',
      signCount: 0,
      algorithm: 'ES256',
      createdAt: new Date().toISOString(),
      providerKind: 'hardware',
    };

    await expect(
      signSoftwarePasskeyAssertion(hardwareRecord, {
        origin: 'https://example.com',
        rpId: 'example.com',
        challengeBase64Url: bytesToBase64Url(new Uint8Array(16).fill(9)),
      }),
    ).rejects.toMatchObject({ code: passkeyErrorCodes.unsupportedAlgorithm });
  });
});
