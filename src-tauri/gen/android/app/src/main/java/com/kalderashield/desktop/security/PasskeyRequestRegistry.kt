package com.kalderashield.desktop.security

import com.kalderashield.desktop.model.PasskeyProviderRequest

/**
 * Process-global, bounded, synchronized registry for Android 14+ Credential
 * Manager passkey requests (K-1 trust boundary equivalent for passkeys).
 *
 * Ensures Intents carry ONLY opaque 128-bit tokens/request IDs — never
 * attacker-modifiable WebAuthn origin, rpId, or challenge payloads.
 */
object PasskeyRequestRegistry {
    private val lock = Any()
    private const val MAX_ENTRIES = 8
    private const val PENDING_TOKEN_MAX_AGE_MS = 2 * 60 * 1000L

    private class PendingToken(val kind: String, val createdAt: Long)

    private val pendingTokens = LinkedHashMap<String, PendingToken>()
    private val requests = LinkedHashMap<String, PasskeyProviderRequest>()

    fun registerPendingToken(token: String, kind: String, now: Long = System.currentTimeMillis()) {
        if (token.isBlank()) return
        synchronized(lock) {
            evictExpiredTokensLocked(now)
            pendingTokens[token] = PendingToken(kind, now)
            while (pendingTokens.size > MAX_ENTRIES) {
                val oldest = pendingTokens.keys.firstOrNull() ?: break
                pendingTokens.remove(oldest)
            }
        }
    }

    fun consumePendingToken(token: String?, now: Long = System.currentTimeMillis()): String? {
        if (token.isNullOrBlank()) return null
        return synchronized(lock) {
            val entry = pendingTokens.remove(token) ?: return@synchronized null
            if (now - entry.createdAt in 0..PENDING_TOKEN_MAX_AGE_MS) entry.kind else null
        }
    }

    fun register(request: PasskeyProviderRequest): String {
        synchronized(lock) {
            evictExpiredRequestsLocked(request.createdAt)
            requests[request.requestId] = request
            while (requests.size > MAX_ENTRIES) {
                val oldest = requests.keys.firstOrNull() ?: break
                requests.remove(oldest)
            }
        }
        return request.requestId
    }

    fun find(requestId: String?, now: Long = System.currentTimeMillis()): PasskeyProviderRequest? {
        if (requestId.isNullOrBlank()) return null
        return synchronized(lock) {
            val request = requests[requestId] ?: return@synchronized null
            if (!request.isFresh(now)) {
                requests.remove(requestId)
                return@synchronized null
            }
            request
        }
    }

    fun consume(requestId: String?): Boolean {
        if (requestId.isNullOrBlank()) return false
        return synchronized(lock) { requests.remove(requestId) != null }
    }

    fun clear() {
        synchronized(lock) {
            pendingTokens.clear()
            requests.clear()
        }
    }

    private fun evictExpiredTokensLocked(now: Long) {
        val it = pendingTokens.entries.iterator()
        while (it.hasNext()) {
            if (now - it.next().value.createdAt > PENDING_TOKEN_MAX_AGE_MS) it.remove()
        }
    }

    private fun evictExpiredRequestsLocked(now: Long) {
        val it = requests.entries.iterator()
        while (it.hasNext()) {
            if (!it.next().value.isFresh(now)) it.remove()
        }
    }
}
