package com.kalderashield.desktop

import com.kalderashield.desktop.model.AutofillLaunchRequest
import com.kalderashield.desktop.model.AutofillSaveCandidate
import com.kalderashield.desktop.security.AutofillResultMailbox
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutofillModelsTest {

    @Test
    fun testAutofillLaunchRequestFreshness() {
        val now = System.currentTimeMillis()
        val freshRequest = AutofillLaunchRequest(
            requestId = "req-1",
            createdAt = now - 30_000L, // 30s ago
            appPackage = "com.example.app",
            webDomain = "example.com",
            usernameIds = arrayListOf(),
            passwordIds = arrayListOf()
        )

        assertTrue(freshRequest.isFresh(now))

        val staleRequest = AutofillLaunchRequest(
            requestId = "req-2",
            createdAt = now - (3 * 60 * 1000L), // 3 mins ago (> 2m limit)
            appPackage = "com.example.app",
            webDomain = "example.com",
            usernameIds = arrayListOf(),
            passwordIds = arrayListOf()
        )

        assertFalse(staleRequest.isFresh(now))
    }

    @Test
    fun testAutofillSaveCandidateRequiresUriResolution() {
        val candidateWithUri = AutofillSaveCandidate(
            requestId = "save-1",
            createdAt = System.currentTimeMillis(),
            title = "Test",
            username = "user",
            password = "",
            url = "https://example.com",
            appPackage = "com.example",
            webDomain = "example.com",
            payloadUri = "content://kalderashield/tmp/123",
            payloadToken = "token-123"
        )

        assertTrue(candidateWithUri.requiresUriResolution())

        val legacyCandidate = AutofillSaveCandidate(
            requestId = "save-2",
            createdAt = System.currentTimeMillis(),
            title = "Test 2",
            username = "user2",
            password = "secretpassword",
            url = "https://example.com",
            appPackage = "com.example",
            webDomain = "example.com"
        )

        assertFalse(legacyCandidate.requiresUriResolution())
    }

    @Test
    fun testAutofillResultMailboxLifecycle() {
        AutofillResultMailbox.clear()
        val now = 1_000_000L

        assertFalse(AutofillResultMailbox.hasActiveSession(now))
        AutofillResultMailbox.beginSession("req-box-1", now)
        assertTrue(AutofillResultMailbox.hasActiveSession(now + 5_000L))

        AutofillResultMailbox.cancel("req-box-1", now + 5_000L)
        val outcome = AutofillResultMailbox.take("req-box-1", now + 6_000L)
        assertTrue(outcome is AutofillResultMailbox.Outcome.Cancelled)
        // One-shot consumption: second read returns null.
        assertNull(AutofillResultMailbox.take("req-box-1", now + 6_500L))

        AutofillResultMailbox.endSession("req-box-1")
        assertFalse(AutofillResultMailbox.hasActiveSession(now + 7_000L))

        // Expired outcome is dropped.
        AutofillResultMailbox.cancel("req-box-stale", now)
        assertNull(AutofillResultMailbox.take("req-box-stale", now + 3 * 60 * 1000L))
        AutofillResultMailbox.clear()
    }
}
