/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkPasswordAgainstHibp,
  getLocalHibpFilePath,
  HIBP_LOCAL_PATH_KEY,
  HIBP_STORAGE_KEY,
  isLocalHibpSupported,
  resetHibpCacheForTesting,
  scanVaultItemsAgainstHibp,
  scanVaultItemsAgainstLocalHibp,
  selectLocalHibpFile,
  setLocalHibpFilePath,
} from './hibp';
import { closeVaultSession } from './vaultSession';

describe('HIBP password checks', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    resetHibpCacheForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats empty passwords as clean without making network requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('')).resolves.toEqual({ status: 'clean', count: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores malformed range lines and non-positive counts', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => [
        'MALFORMED',
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:0',
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:not-a-number',
        '00000000000000000000000000000000000:42',
      ].join('\n'),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({ status: 'clean', count: 0 });
  });

  it('returns unavailable for non-successful HIBP responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    })));

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({
      status: 'unavailable',
      count: 0,
      reason: 'HIBP range request failed with HTTP 503.',
    });
  });

  it('returns unavailable when WebCrypto SHA-1 digest is missing', async () => {
    const originalCrypto = globalThis.crypto;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', {});

    try {
      await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({
        status: 'unavailable',
        count: 0,
        reason: 'WebCrypto SHA-1 digest is not available.',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });

  it('uses k-anonymity range lookup without sending the full password hash', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => [
        '003B7A8757C0B8D478A0F7536F36BD8A2F5:2',
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:12345',
      ].join('\r\n'),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({
      status: 'pwned',
      count: 12345,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(calls[0]![0]).not.toContain('1E4C9B93F3F0682250B6CF8331B7EE68FD8');
    expect(calls[0]![1]).toEqual(expect.objectContaining({
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        'Add-Padding': 'true',
      },
    }));
  });

  it('caches prefix responses for repeated range checks', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:99',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({ status: 'pwned', count: 99 });
    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({ status: 'pwned', count: 99 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable instead of failing open on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    await expect(checkPasswordAgainstHibp('password')).resolves.toMatchObject({
      status: 'unavailable',
      count: 0,
    });
  });

  it('evicts expired cache entries after 1 hour TTL', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:99',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3600 * 1000 + 1000);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('bounds cache size to MAX_CACHE_SIZE and evicts oldest items in FIFO order', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:99',
    }));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 101; i++) {
      await checkPasswordAgainstHibp(`different_password_${i}`);
    }

    expect(fetchMock).toHaveBeenCalledTimes(101);

    fetchMock.mockClear();

    await checkPasswordAgainstHibp('different_password_0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The breach check is opt-in.
   *
   * It used to answer yes to an installation that had never been asked
   * anything (`stored !== 'false'`), which meant opening the Security Audit
   * screen sent a request for every password in the vault. The privacy policy
   * did not describe that request, so the default and the published policy
   * disagreed about what the program does.
   */
  it('is off until the user turns it on', async () => {
    const { isHibpCheckEnabled } = await import('./hibp');
    localStorage.removeItem(HIBP_STORAGE_KEY);
    expect(isHibpCheckEnabled()).toBe(false);
  });

  it('keeps the choice an installation already made', async () => {
    const { isHibpCheckEnabled, setHibpCheckEnabled, HIBP_STORAGE_KEY } = await import('./hibp');

    setHibpCheckEnabled(false);
    expect(isHibpCheckEnabled()).toBe(false);

    setHibpCheckEnabled(true);
    expect(isHibpCheckEnabled()).toBe(true);

    // Turning it off again is remembered rather than drifting back to the
    // default, which is the whole point of storing the decision.
    setHibpCheckEnabled(false);
    expect(localStorage.getItem(HIBP_STORAGE_KEY)).toBe('false');
    expect(isHibpCheckEnabled()).toBe(false);
  });

  it('manages HIBP enabled setting state in storage', async () => {
    const { isHibpCheckEnabled, setHibpCheckEnabled } = await import('./hibp');
    setHibpCheckEnabled(true);
    expect(isHibpCheckEnabled()).toBe(true);

    setHibpCheckEnabled(false);
    expect(isHibpCheckEnabled()).toBe(false);

    setHibpCheckEnabled(true);
    expect(isHibpCheckEnabled()).toBe(true);
  });

  it('clears cached prefix buckets when the vault session closes', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:7',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    closeVaultSession(true);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('routes range lookups through Tauri Rust invoke when running inside Tauri', async () => {
    const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'fetch_hibp_range' && args?.prefix === '5BAA6') {
        return '1E4C9B93F3F0682250B6CF8331B7EE68FD8:321\r\n';
      }
      throw new Error(`unexpected command ${cmd}`);
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({
      status: 'pwned',
      count: 321,
    });
    expect(invokeMock).toHaveBeenCalledWith('fetch_hibp_range', { prefix: '5BAA6' }, undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized HIBP range payloads and honours AbortSignal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => 'A'.repeat(600 * 1024),
    })));
    await expect(checkPasswordAgainstHibp('password')).resolves.toMatchObject({
      status: 'unavailable',
      count: 0,
    });

    const controller = new AbortController();
    controller.abort();
    await expect(checkPasswordAgainstHibp('password', { signal: controller.signal })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'HIBP check aborted.',
    });
  });

  it('batch-scans items by itemId, deduplicates passwords, reports progress, and trips circuit-breaker offline', async () => {
    const progressCalls: [number, number][] = [];
    const checkPassword = vi.fn(async (pw: string) => {
      if (pw === 'leaked') return { status: 'pwned' as const, count: 88 };
      return { status: 'clean' as const, count: 0 as const };
    });

    const res = await scanVaultItemsAgainstHibp(
      [
        { id: 'a', password: 'leaked' },
        { id: 'b', password: 'leaked' },
        { id: 'c', password: 'safe' },
      ],
      {
        checkPassword,
        onProgress: (done, total) => progressCalls.push([done, total]),
      },
    );

    expect(res.status).toBe('complete');
    expect(res.pwnedByItemId.get('a')).toBe(88);
    expect(res.pwnedByItemId.get('b')).toBe(88);
    expect(res.pwnedByItemId.has('c')).toBe(false);
    expect(checkPassword).toHaveBeenCalledTimes(2);
    expect(progressCalls).toHaveLength(2);

    // Circuit-breaker trips after 2 consecutive offline failures instead of checking all 10 passwords
    const offlineCheck = vi.fn(async () => ({
      status: 'unavailable' as const,
      count: 0 as const,
      reason: 'offline',
    }));
    const offlineItems = Array.from({ length: 10 }, (_, idx) => ({
      id: `item-${idx}`,
      password: `pw-${idx}`,
    }));
    const offlineRes = await scanVaultItemsAgainstHibp(offlineItems, {
      checkPassword: offlineCheck,
      concurrency: 1,
      maxConsecutiveFailures: 2,
    });
    expect(offlineRes.status).toBe('unavailable');
    expect(offlineCheck).toHaveBeenCalledTimes(2);
  });

  it('persists local HIBP DB path and runs fully offline batch scans via Tauri IPC', async () => {
    expect(isLocalHibpSupported()).toBe(false);
    expect(getLocalHibpFilePath()).toBeNull();
    expect(await selectLocalHibpFile()).toBeNull();

    setLocalHibpFilePath('  C:\\hibp\\pwned-sha1.txt  ');
    expect(getLocalHibpFilePath()).toBe('C:\\hibp\\pwned-sha1.txt');
    expect(localStorage.getItem(HIBP_LOCAL_PATH_KEY)).toBe('C:\\hibp\\pwned-sha1.txt');

    // Without Tauri runtime, local scan fails closed as unavailable
    const noTauriRes = await scanVaultItemsAgainstLocalHibp('C:\\hibp\\pwned-sha1.txt', [
      { id: 'item-1', password: 'password' },
    ]);
    expect(noTauriRes.status).toBe('unavailable');

    // With Tauri runtime, sends only 40-char SHA-1 hashes and maps matches back to itemId
    const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'select_hibp_local_file') {
        return { path: 'C:\\hibp\\pwned-sha1.txt', fileName: 'pwned-sha1.txt', sizeBytes: 12345 };
      }
      if (cmd === 'check_hibp_local_file') {
        expect(args?.path).toBe('C:\\hibp\\pwned-sha1.txt');
        expect(args?.hashes).toEqual(['5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8']);
        return [{ hash: '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8', count: 555 }];
      }
      throw new Error(`unexpected ${cmd}`);
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: invokeMock };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(isLocalHibpSupported()).toBe(true);
    const picked = await selectLocalHibpFile();
    expect(picked?.fileName).toBe('pwned-sha1.txt');

    const localRes = await scanVaultItemsAgainstLocalHibp('C:\\hibp\\pwned-sha1.txt', [
      { id: 'a', password: 'password' },
      { id: 'b', password: 'password' },
    ]);
    expect(localRes.status).toBe('complete');
    expect(localRes.pwnedByItemId.get('a')).toBe(555);
    expect(localRes.pwnedByItemId.get('b')).toBe(555);
    expect(fetchMock).not.toHaveBeenCalled();

    setLocalHibpFilePath(null);
    expect(getLocalHibpFilePath()).toBeNull();
  });
});
