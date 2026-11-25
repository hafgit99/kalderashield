/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from '../environment';

export const SYNC_FETCH_TIMEOUT_MS = 30_000;

interface RustSyncHttpResponse {
  status: number;
  etag?: string | null;
  body: string;
}

export interface SyncFetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  maxResponseBytes?: number;
  timeoutMs?: number;
}

function normalizeHeadersRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

/**
 * Unified HTTP transport for E2EE Cloud Sync providers (WebDAV & S3).
 *
 * - On Tauri Desktop & Android runtimes (`isDesktopRuntime()`), routes through
 *   the Rust `sync_http_request` IPC bridge (`reqwest` + `rustls`), keeping
 *   the WebView CSP strictly air-gapped (`connect-src 'self' ipc: http://ipc.localhost`)
 *   and avoiding WebView CORS preflight rejections on WebDAV/S3 servers.
 * - On pure browser runtimes (and unit tests), falls back to `fetch()` with
 *   a 30-second `AbortSignal.timeout` guard.
 */
export async function syncFetch(url: string, options: SyncFetchOptions): Promise<Response> {
  const headersRecord = normalizeHeadersRecord(options.headers);

  if (isDesktopRuntime()) {
    const native = await invoke<RustSyncHttpResponse>('sync_http_request', {
      request: {
        url,
        method: options.method,
        headers: headersRecord,
        body: options.body ?? null,
        maxResponseBytes: options.maxResponseBytes ?? null,
      },
    });

    const responseHeaders = new Headers();
    if (native.etag) {
      responseHeaders.set('etag', native.etag);
    }

    // Response constructor forbids non-null bodies on 204/205/304 statuses.
    const body =
      native.status === 204 || native.status === 205 || native.status === 304
        ? null
        : native.body;

    return new Response(body, {
      status: native.status,
      headers: responseHeaders,
    });
  }

  const init: RequestInit = {
    method: options.method,
    headers: headersRecord,
    ...(options.body !== undefined ? { body: options.body } : {}),
  };

  const timeoutMs = options.timeoutMs ?? SYNC_FETCH_TIMEOUT_MS;
  if (
    typeof AbortSignal !== 'undefined'
    && typeof AbortSignal.timeout === 'function'
    && Number.isFinite(timeoutMs)
    && timeoutMs > 0
  ) {
    init.signal = AbortSignal.timeout(timeoutMs);
  }

  return fetch(url, init);
}
