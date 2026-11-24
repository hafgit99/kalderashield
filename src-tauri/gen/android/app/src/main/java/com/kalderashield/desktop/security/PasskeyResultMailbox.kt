package com.kalderashield.desktop.security

/**
 * In-process hand-off mailbox between [com.kalderashield.desktop.MainActivity]
 * (WebView passkey approval) and [com.kalderashield.desktop.PasskeyProviderActivity]
 * (non-exported relay running in the calling app's task).
 */
object PasskeyResultMailbox {
    sealed class Outcome {
        class Completed(val kind: String, val responseJson: String) : Outcome()
        object Cancelled : Outcome()
        class Failed(val errorMessage: String) : Outcome()
    }

    private class Entry(val outcome: Outcome, val createdAt: Long)

    private val lock = Any()
    private val entries = LinkedHashMap<String, Entry>()
    private val activeSessions = LinkedHashMap<String, Long>()

    private const val MAX_ENTRIES = 8
    private const val MAX_AGE_MS = 2 * 60 * 1000L

    fun beginSession(requestId: String, now: Long = System.currentTimeMillis()) {
        if (requestId.isBlank()) return
        synchronized(lock) {
            pruneSessionsLocked(now)
            activeSessions[requestId] = now
            while (activeSessions.size > MAX_ENTRIES) {
                val oldest = activeSessions.keys.firstOrNull() ?: break
                activeSessions.remove(oldest)
            }
        }
    }

    fun endSession(requestId: String?) {
        if (requestId.isNullOrBlank()) return
        synchronized(lock) { activeSessions.remove(requestId) }
    }

    fun hasActiveSession(now: Long = System.currentTimeMillis()): Boolean =
        synchronized(lock) {
            pruneSessionsLocked(now)
            activeSessions.isNotEmpty()
        }

    fun complete(requestId: String, kind: String, responseJson: String, now: Long = System.currentTimeMillis()) =
        put(requestId, Outcome.Completed(kind, responseJson), now)

    fun cancel(requestId: String, now: Long = System.currentTimeMillis()) =
        put(requestId, Outcome.Cancelled, now)

    fun fail(requestId: String, errorMessage: String, now: Long = System.currentTimeMillis()) =
        put(requestId, Outcome.Failed(errorMessage), now)

    fun take(requestId: String?, now: Long = System.currentTimeMillis()): Outcome? {
        if (requestId.isNullOrBlank()) return null
        return synchronized(lock) {
            val entry = entries.remove(requestId) ?: return@synchronized null
            if (now - entry.createdAt in 0..MAX_AGE_MS) entry.outcome else null
        }
    }

    fun clear() = synchronized(lock) {
        entries.clear()
        activeSessions.clear()
    }

    private fun put(requestId: String, outcome: Outcome, now: Long) {
        if (requestId.isBlank()) return
        synchronized(lock) {
            val it = entries.entries.iterator()
            while (it.hasNext()) {
                if (now - it.next().value.createdAt > MAX_AGE_MS) it.remove()
            }
            entries[requestId] = Entry(outcome, now)
            while (entries.size > MAX_ENTRIES) {
                val oldest = entries.keys.firstOrNull() ?: break
                entries.remove(oldest)
            }
        }
    }

    private fun pruneSessionsLocked(now: Long) {
        val it = activeSessions.entries.iterator()
        while (it.hasNext()) {
            if (now - it.next().value !in 0..MAX_AGE_MS) it.remove()
        }
    }
}
