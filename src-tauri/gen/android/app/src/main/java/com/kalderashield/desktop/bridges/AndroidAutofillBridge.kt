package com.kalderashield.desktop.bridges

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.autofill.Dataset
import android.util.Log
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.webkit.JavascriptInterface
import android.widget.RemoteViews
import com.kalderashield.desktop.MainActivity
import com.kalderashield.desktop.model.AutofillLaunchRequest
import com.kalderashield.desktop.model.AutofillSaveCandidate
import com.kalderashield.desktop.security.AutofillResultMailbox
import com.kalderashield.desktop.security.SecureTempFileStorage
import java.nio.charset.StandardCharsets
import org.json.JSONObject

class AndroidAutofillBridge(
    private val activity: MainActivity,
    private val getPendingAutofillRequest: () -> AutofillLaunchRequest?,
    private val setPendingAutofillRequest: (AutofillLaunchRequest?) -> Unit,
    private val getPendingAutofillSaveCandidate: () -> AutofillSaveCandidate?,
    private val setPendingAutofillSaveCandidate: (AutofillSaveCandidate?) -> Unit,
) {
    @JavascriptInterface
    fun isSupported(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return activity.getSystemService(AutofillManager::class.java)?.isAutofillSupported == true
    }

    @JavascriptInterface
    fun isEnabled(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return activity.getSystemService(AutofillManager::class.java)?.hasEnabledAutofillServices() == true
    }

    @JavascriptInterface
    fun openSettings(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false

        return try {
            activity.startActivity(Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE))
            true
        } catch (_: Exception) {
            try {
                activity.startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
                true
            } catch (error: Exception) {
                Log.w(AUTOFILL_LOG_TAG, "Failed to launch Android Autofill settings intent: ${error.message}")
                false
            }
        }
    }

    @JavascriptInterface
    fun getPendingRequest(): String? {
        // K-1: freshness is enforced by AutofillRequestRegistry, which also
        // evicts the stale entry. The bridge never synthesises a request and
        // never falls back to anything the Intent claimed.
        val current = getPendingAutofillRequest() ?: return null
        return current.toJson().toString()
    }

    @JavascriptInterface
    fun clearPendingRequest(requestId: String): Boolean {
        val current = getPendingAutofillRequest() ?: return true
        if (current.requestId != requestId) {
            Log.w(
                AUTOFILL_LOG_TAG,
                "clearPendingRequest mismatch: pendingRequestId=${current.requestId}, requestedId=$requestId",
            )
            return false
        }
        AutofillResultMailbox.cancel(requestId)
        setPendingAutofillRequest(null)
        return true
    }

    /**
     * Explicit user cancellation of an in-flight Autofill session: notifies
     * [AutofillResultMailbox] and moves KalderaShield back so the relay
     * [com.kalderashield.desktop.AutofillAuthActivity] delivers RESULT_CANCELED
     * and returns the user straight to the browser without destroying our
     * Tauri WebView.
     */
    @JavascriptInterface
    fun cancelPendingRequest(requestId: String): Boolean {
        val current = getPendingAutofillRequest()
        if (current != null && current.requestId != requestId) {
            Log.w(
                AUTOFILL_LOG_TAG,
                "cancelPendingRequest mismatch: pendingRequestId=${current.requestId}, requestedId=$requestId",
            )
            return false
        }
        val shouldReturnToClient = AutofillResultMailbox.hasActiveSession()
        AutofillResultMailbox.cancel(requestId)
        setPendingAutofillRequest(null)
        if (shouldReturnToClient) {
            activity.runOnUiThread {
                activity.moveTaskToBack(true)
            }
        }
        return true
    }

    @JavascriptInterface
    fun getPendingSaveCandidate(): String? {
        return getPendingAutofillSaveCandidate()?.toJson()?.toString()
    }

    @JavascriptInterface
    fun resolveEncryptedSavePayload(requestId: String): String? {
        val current = getPendingAutofillSaveCandidate() ?: return null
        if (current.requestId != requestId) return null
        if (!current.requiresUriResolution()) {
            return current.toJson().toString()
        }

        val token = current.payloadToken ?: return null
        val plaintext = try {
            SecureTempFileStorage(activity).consume(token)
        } catch (error: Exception) {
            Log.w(AUTOFILL_LOG_TAG, "Failed to resolve encrypted save payload: ${error.message ?: "unknown"}")
            null
        }

        val resolved = if (plaintext != null) {
            try {
                val parsed = JSONObject(String(plaintext, StandardCharsets.UTF_8))
                current.copy(
                    password = parsed.optString("password", ""),
                    title = parsed.optString("title", current.title).ifBlank { current.title },
                    username = parsed.optString("username", current.username).ifBlank { current.username },
                    url = parsed.optString("url", current.url.orEmpty()).ifBlank { current.url },
                )
            } catch (error: Exception) {
                Log.w(AUTOFILL_LOG_TAG, "Decrypted payload was not valid JSON: ${error.message ?: "unknown"}")
                null
            }
        } else {
            null
        }

        if (resolved == null) {
            setPendingAutofillSaveCandidate(null)
            return null
        }

        setPendingAutofillSaveCandidate(resolved)
        return resolved.toJson().toString()
    }

    @JavascriptInterface
    fun clearPendingSaveCandidate(requestId: String): Boolean {
        val current = getPendingAutofillSaveCandidate() ?: return true
        if (current.requestId != requestId) return false
        try {
            SecureTempFileStorage(activity).purge()
        } catch (error: Exception) {
            Log.w(AUTOFILL_LOG_TAG, "Temp file purge failed: ${error.message ?: "unknown"}")
        }
        setPendingAutofillSaveCandidate(null)
        return true
    }

    @Suppress("DEPRECATION")
    @JavascriptInterface
    fun completePendingRequest(requestId: String, username: String, password: String, label: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false

        // K-1: `requestId` must resolve through the registry. A JS caller (or a
        // forged Intent that somehow reached us) cannot name a request that
        // KalderaShieldAutofillService never registered, so there is no Dataset
        // to hand back to an arbitrary caller.
        val current = getPendingAutofillRequest() ?: run {
            Log.w(
                AUTOFILL_LOG_TAG,
                "Autofill audit event [REJECTED]: completePendingRequest for unregistered requestId=$requestId",
            )
            return false
        }
        if (current.requestId != requestId) return false
        if (current.passwordIds.isEmpty() && current.usernameIds.isEmpty()) return false

        return try {
            val presentationLabel = label.ifBlank { "KalderaShield Vault" }
            val presentation = createAutofillPresentation(presentationLabel)
            val datasetBuilder = Dataset.Builder(presentation)
            var populatedFields = 0

            if (username.isNotEmpty()) {
                current.usernameIds.forEach { autofillId ->
                    datasetBuilder.setValue(autofillId, AutofillValue.forText(username), presentation)
                    populatedFields++
                }
            }
            if (password.isNotEmpty()) {
                current.passwordIds.forEach { autofillId ->
                    datasetBuilder.setValue(autofillId, AutofillValue.forText(password), presentation)
                    populatedFields++
                }
            }

            if (populatedFields == 0) {
                Log.w(
                    AUTOFILL_LOG_TAG,
                    "Autofill audit event [REJECTED]: no fillable username/password values for requestId=$requestId",
                )
                return false
            }

            val dataset = datasetBuilder.build()
            AutofillResultMailbox.complete(requestId, dataset)
            Log.i(
                AUTOFILL_LOG_TAG,
                "Autofill audit event [COMPLETED]: requestId=$requestId appPackage=${current.appPackage ?: "unknown"} " +
                    "webDomain=${current.webDomain ?: "unknown"} usernameFields=${current.usernameIds.size} " +
                    "passwordFields=${current.passwordIds.size} populatedFields=$populatedFields",
            )
            setPendingAutofillRequest(null)

            // Move MainActivity to the background on the UI thread instead of
            // calling finish(): keeping MainActivity alive avoids Tauri's
            // dead-WebView black screen on relaunch, and immediately resumes
            // AutofillAuthActivity in the client app's task so it can deliver
            // RESULT_OK + EXTRA_AUTHENTICATION_RESULT to the browser.
            activity.runOnUiThread {
                activity.moveTaskToBack(true)
            }
            true
        } catch (error: Exception) {
            Log.e(
                AUTOFILL_LOG_TAG,
                "Autofill audit event [ERROR]: completePendingRequest failed for requestId=$requestId: ${error.message}",
                error,
            )
            false
        }
    }

    private fun createAutofillPresentation(label: String): RemoteViews {
        return RemoteViews(activity.packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, label)
        }
    }

    companion object {
        private const val AUTOFILL_LOG_TAG = "KalderaShieldAutofill"
    }
}
