import { extractRegistrableDomainFromUrl } from './psl-utils';
import { validateExtensionPasskeyOriginAndRpId } from './webauthn-bridge';

const HOST_NAME = 'com.kalderashield.desktop';

export interface ExtensionDraftCredential {
  id?: string;
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  category?: string;
}

interface NativeRequest {
  action: string;
  url?: string;
  credential?: ExtensionDraftCredential;
}

let pendingCredential: ExtensionDraftCredential | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOrigin: string | null = null;

let draftCredentials: { [tabId: number]: ExtensionDraftCredential | null } = {};
let draftCredentialTimers: { [tabId: number]: ReturnType<typeof setTimeout> } = {};

function wipeObjectCredentials(obj: ExtensionDraftCredential | null | undefined) {
  if (obj && typeof obj === 'object') {
    if (typeof obj.password === 'string') obj.password = '';
    if (typeof obj.username === 'string') obj.username = '';
  }
}

function setDraftCredential(tabId: number, cred: ExtensionDraftCredential | null) {
  if (draftCredentials[tabId]) {
    wipeObjectCredentials(draftCredentials[tabId]);
  }
  if (draftCredentialTimers[tabId]) {
    clearTimeout(draftCredentialTimers[tabId]);
  }
  draftCredentials[tabId] = cred ? { ...cred } : null;
  // Security fix O7: 10-minute TTL for draft credentials in service worker memory
  draftCredentialTimers[tabId] = setTimeout(() => {
    clearDraftCredential(tabId);
  }, 600000);
}

function clearDraftCredential(tabId: number) {
  if (draftCredentialTimers[tabId]) {
    clearTimeout(draftCredentialTimers[tabId]);
    delete draftCredentialTimers[tabId];
  }
  if (draftCredentials[tabId]) {
    wipeObjectCredentials(draftCredentials[tabId]);
    delete draftCredentials[tabId];
  }
}

function extractOrigin(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

function isValidTabUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function setPendingCredential(cred: ExtensionDraftCredential | null, originUrl?: string) {
  if (pendingCredential) {
    wipeObjectCredentials(pendingCredential);
  }
  pendingCredential = cred ? { ...cred } : null;
  pendingOrigin = extractOrigin(originUrl);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
  }
  pendingTimer = setTimeout(() => {
    clearPendingCredential();
  }, 120000); // 120s transient memory retention
}

function clearPendingCredential() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingCredential) {
    wipeObjectCredentials(pendingCredential);
    pendingCredential = null;
    pendingOrigin = null;
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Verify extension sender identity
  if (sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ error: 'unauthorized_sender_id' });
    return false;
  }

  // 2. Content script tab URL security check
  if (sender.tab && sender.tab.url && !isValidTabUrl(sender.tab.url)) {
    sendResponse({ error: 'unauthorized_tab_scheme' });
    return false;
  }

  if (request.action === 'update_draft_credential') {
    if (sender.tab && sender.tab.id) {
      setDraftCredential(sender.tab.id, request.credential);
    }
    sendResponse({ status: 'ok' });
    return false;
  }

  if (request.action === 'set_pending_credential') {
    if (sender.tab?.url && isValidTabUrl(sender.tab.url)) {
      setPendingCredential(request.credential, sender.tab.url);
      sendResponse({ status: 'ok' });
    } else {
      sendResponse({ status: 'error', error: 'invalid_origin' });
    }
    return false;
  }

  if (request.action === 'get_pending_credential') {
    // Security fix O5: Reject if pendingOrigin is missing or doesn't match sender origin
    if (!pendingCredential || !pendingOrigin) {
      sendResponse({ credential: null });
      return false;
    }
    if (sender.tab && sender.tab.url) {
      const senderOrigin = extractOrigin(sender.tab.url);
      if (!senderOrigin || senderOrigin !== pendingOrigin) {
        sendResponse({ credential: null, error: 'origin_mismatch' });
        return false;
      }
    } else {
      // Content script must have tab URL
      sendResponse({ credential: null, error: 'missing_sender_origin' });
      return false;
    }
    sendResponse({ credential: pendingCredential });
    return false;
  }

  if (request.action === 'clear_pending_credential') {
    clearPendingCredential();
    sendResponse({ status: 'ok' });
    return false;
  }

  if (request.action === 'save_new_credential') {
    // P1-7d: Validate credential payload schema before forwarding to native host
    const cred = request.credential;
    if (!cred || typeof cred !== 'object'
      || (cred.password !== undefined && typeof cred.password !== 'string')
      || (cred.username !== undefined && typeof cred.username !== 'string')
      || (cred.url !== undefined && typeof cred.url !== 'string')
      || (cred.title !== undefined && typeof cred.title !== 'string')
      || (cred.category !== undefined && typeof cred.category !== 'string')) {
      sendResponse({ error: 'invalid_credential_payload' });
      return false;
    }
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'add_credential', credential: cred },
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    clearPendingCredential();
    return true;
  }

  if (request.action === 'update_existing_credential') {
    // P1-7d: Validate update credential payload schema before forwarding to native host
    const cred = request.credential;
    if (!cred || typeof cred !== 'object'
      || typeof cred.id !== 'string' || !cred.id.trim()
      || typeof cred.password !== 'string' || !cred.password.length
      || (cred.username !== undefined && typeof cred.username !== 'string')
      || (cred.url !== undefined && typeof cred.url !== 'string')
      || (cred.title !== undefined && typeof cred.title !== 'string')
      || (cred.category !== undefined && typeof cred.category !== 'string')) {
      sendResponse({ error: 'invalid_credential_payload' });
      return false;
    }
    const sanitizedCred: ExtensionDraftCredential = {
      id: cred.id.trim(),
      title: cred.title,
      username: cred.username,
      password: cred.password,
      url: cred.url,
      category: cred.category,
    };
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'update_credential', credential: sanitizedCred },
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    clearPendingCredential();
    return true;
  }

  if (request.action === 'query_credentials') {
    // If sent from a content script tab, restrict query URL to the active tab's URL
    const targetUrl = sender.tab?.url || request.url || '';
    
    // Send message to native messaging host
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'get_credentials', url: targetUrl } as NativeRequest,
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Native messaging error:', chrome.runtime.lastError.message);
          sendResponse({ locked: true, credentials: [], error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    return true; // Keep message channel open for async response
  }

  if (request.action === 'list_credentials') {
    // Content scripts are blocked from invoking list_credentials (full vault list)
    if (sender.tab) {
      sendResponse({ locked: true, credentials: [], error: 'unauthorized_content_script_call' });
      return false;
    }

    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'list_credentials' } as NativeRequest,
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ locked: true, credentials: [], error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    return true;
  }

  if (request.action === 'is_locked') {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'is_locked' } as NativeRequest,
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ locked: true, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    return true;
  }

  if (request.action === 'focus_window') {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'focus_window' } as NativeRequest,
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    return true;
  }

  if (request.action === 'passkey_create' || request.action === 'passkey_get') {
    const senderUrl = sender.url || sender.tab?.url;
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
    const validated = validateExtensionPasskeyOriginAndRpId(
      senderUrl,
      typeof payload.rpId === 'string' ? payload.rpId : undefined,
    );
    if (!validated) {
      sendResponse({ status: 'invalid_origin', fallback: true });
      return false;
    }

    const challenge = typeof payload.challengeBase64Url === 'string' ? payload.challengeBase64Url.trim() : '';
    if (!challenge || challenge.length > 2048) {
      sendResponse({ status: 'invalid_challenge', fallback: true });
      return false;
    }

    chrome.storage.local.get(['passkeyProviderEnabled'], (res) => {
      if (res.passkeyProviderEnabled === false) {
        sendResponse({ status: 'disabled', fallback: true });
        return;
      }

      const nativePayload: Record<string, unknown> = {
        action: request.action,
        origin: validated.origin,
        rpId: validated.rpId,
        challengeBase64Url: challenge,
        crossOrigin: Boolean(payload.crossOrigin),
      };

      if (request.action === 'passkey_create') {
        nativePayload.rpName = typeof payload.rpName === 'string' ? payload.rpName.slice(0, 200) : validated.rpId;
        nativePayload.userName = typeof payload.userName === 'string' ? payload.userName.slice(0, 320) : '';
        nativePayload.userDisplayName = typeof payload.userDisplayName === 'string' ? payload.userDisplayName.slice(0, 320) : '';
        if (typeof payload.userIdBase64Url === 'string' && payload.userIdBase64Url.length <= 256) {
          nativePayload.userIdBase64Url = payload.userIdBase64Url;
        }
        if (Array.isArray(payload.pubKeyCredAlgs)) {
          nativePayload.pubKeyCredAlgs = payload.pubKeyCredAlgs
            .filter((n: unknown): n is number => typeof n === 'number' && Number.isInteger(n))
            .slice(0, 16);
        }
        if (Array.isArray(payload.excludeCredentialIds)) {
          nativePayload.excludeCredentialIds = payload.excludeCredentialIds
            .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 512)
            .slice(0, 64);
        }
      } else if (Array.isArray(payload.allowCredentialIds)) {
        nativePayload.allowCredentialIds = payload.allowCredentialIds
          .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 512)
          .slice(0, 64);
      }

      chrome.runtime.sendNativeMessage(HOST_NAME, nativePayload, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ status: 'host_unavailable', fallback: true, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response ?? { status: 'no_response', fallback: true });
        }
      });
    });
    return true;
  }

  if (request.action === 'autofill_page') {
    // Security fix Y1: Background-side domain validation (second protection layer).
    // Verify the active tab's domain matches the credential's target domain before forwarding.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        const tabUrl = activeTab.url || '';

        // Block autofill on non-HTTP pages
        if (!isValidTabUrl(tabUrl)) {
          sendResponse({ status: 'blocked', reason: 'invalid_tab_url' });
          return;
        }

        // M5: Insecure HTTP pages require explicit user confirmation — unencrypted
        // transport exposes credentials to network-level observers.
        if (tabUrl.startsWith('http://') && !request.userConfirmedMismatch) {
          console.warn(
            '[KalderaShield Security] Autofill into insecure HTTP page blocked by background service worker:',
            `tab=${tabUrl}`
          );
          sendResponse({ status: 'blocked', reason: 'insecure_connection' });
          return;
        }

        // P1-7a: Domain validation is MANDATORY — if targetDomain is missing/empty,
        // treat it as a domain mismatch (credential has no URL, user must confirm).
        const tabDomain = extractRegistrableDomainFromUrl(tabUrl);
        const credDomain = request.targetDomain || '';
        if (!credDomain || (tabDomain && credDomain && tabDomain !== credDomain)) {
            if (!request.userConfirmedMismatch) {
              console.warn(
                '[KalderaShield Security] Autofill domain mismatch blocked by background service worker:',
                `tab=${tabDomain}, credential=${credDomain || '(empty)'}`
              );
              sendResponse({ status: 'blocked', reason: 'domain_mismatch' });
              return;
            }
            console.warn(
              '[KalderaShield Security] Autofill domain mismatch allowed with explicit user confirmation:',
              `tab=${tabDomain}, credential=${credDomain || '(empty)'}`
            );
        }

        chrome.tabs.sendMessage(activeTab.id, {
          action: 'fill_inputs',
          username: request.username,
          password: request.password
        });
      }
    });
    sendResponse({ status: 'ok' });
    return false;
  }
});

// Listen for tab navigation to promote draft credentials to pending
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    const draft = draftCredentials[tabId];
    if (draft) {
      setPendingCredential(draft, tab?.url);
      clearDraftCredential(tabId);
    }
  }
});

// Clean up draft credentials when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  clearDraftCredential(tabId);
});
