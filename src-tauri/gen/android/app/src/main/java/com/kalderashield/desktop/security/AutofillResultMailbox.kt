package com.kalderashield.desktop.security

import android.os.Parcelable

/**
 * Hand-off point between the vault UI (`MainActivity` + JS bridge) and the
 * `AutofillAuthActivity` relay that the Autofill framework actually launched.
 *
 * ## Why this exists
 *
 * The framework launches the authentication `PendingIntent` with
 * `startIntentSenderForResult` from the *client* app (Chrome, a banking app,
 * ...). Only the Activity it launched can return
 * `AutofillManager.EXTRA_AUTHENTICATION_RESULT`. `MainActivity` cannot be that
 * Activity: it is `singleTask`, so Android starts it in our own task and
 * immediately cancels the caller's result, and it hosts the single Tauri
 * WebView, so finishing it to deliver a result destroyed the WebView and left
 * the next launch on a black screen.
 *
 * So the relay stays in the client's task, the user picks a credential in
 * `MainActivity`, the bridge drops the finished `Dataset` here, moves our
 * task back, and the relay — resumed on top of the client — takes it and calls
 * `setResult`.
 *
 * ## Trust boundary (K-1)
 *
 * Purely in-process memory, keyed by the opaque 128-bit request id issued by
 * `KalderaShieldAutofillService`. Nothing here crosses an Intent. The response
 * can only leave the process through `AutofillAuthActivity`, which is
 * `exported="false"` and therefore only reachable through the system executing
 * our own `PendingIntent`.
 */
object AutofillResultMailbox {
    sealed class Outcome {
        class Completed(val response: Parcelable) : Outcome()
        object Cancelled : Outcome()
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
            pruneStaleSessionsLocked(now)
            activeSessions[requestId] = now
            while (activeSessions.size > MAX_ENTRIES) {
                val oldest = activeSessions.keys.firstOrNull() ?: break
                activeSessions.remove(oldest)
            }
        }
    }

    fun endSession(requestId: String?) {
        if (requestId.isNullOrBlank()) return
        synchronized(lock) {
            activeSessions.remove(requestId)
        }
    }

    fun hasActiveSession(now: Long = System.currentTimeMillis()): Boolean =
        synchronized(lock) {
            pruneStaleSessionsLocked(now)
            activeSessions.isNotEmpty()
        }

    fun complete(requestId: String, response: Parcelable, now: Long = System.currentTimeMillis()) =
        put(requestId, Outcome.Completed(response), now)

    fun cancel(requestId: String, now: Long = System.currentTimeMillis()) =
        put(requestId, Outcome.Cancelled, now)

    /** One-shot read: the entry is removed whether or not it is still fresh. */
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
            val iterator = entries.entries.iterator()
            while (iterator.hasNext()) {
                if (now - iterator.next().value.createdAt > MAX_AGE_MS) iterator.remove()
            }
            entries[requestId] = Entry(outcome, now)
            while (entries.size > MAX_ENTRIES) {
                val oldest = entries.keys.firstOrNull() ?: break
                entries.remove(oldest)
            }
        }
    }

    private fun pruneStaleSessionsLocked(now: Long) {
        val iterator = activeSessions.entries.iterator()
        while (iterator.hasNext()) {
            val createdAt = iterator.next().value
            if (now - createdAt !in 0..MAX_AGE_MS) {
                iterator.remove()
            }
        }
    }
}
