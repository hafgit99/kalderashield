package com.kalderashield.desktop.bridges

import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import com.kalderashield.desktop.MainActivity
import com.kalderashield.desktop.model.PasskeyProviderRequest
import com.kalderashield.desktop.security.PasskeyResultMailbox

/**
 * WebView JS bridge (`window.KalderaShieldAndroidPasskey`) connecting
 * KalderaShield's in-vault WebAuthn provider (`passkeyProvider.ts`) to
 * Android 14+ Credential Manager via [PasskeyResultMailbox].
 */
class AndroidPasskeyBridge(
    private val activity: MainActivity,
    private val getPendingPasskeyRequest: () -> PasskeyProviderRequest?,
    private val clearPendingPasskeyRequest: () -> Unit,
) {
    @JavascriptInterface
    fun isSupported(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    }

    @JavascriptInterface
    fun getPendingRequest(): String? {
        return getPendingPasskeyRequest()?.toJson()?.toString()
    }

    @JavascriptInterface
    fun completePasskeyRequest(requestId: String, responseJson: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false
        val current = getPendingPasskeyRequest() ?: return false
        if (current.requestId != requestId || responseJson.isBlank()) {
            Log.w(LOG_TAG, "completePasskeyRequest rejected: requestId mismatch or empty payload")
            return false
        }

        PasskeyResultMailbox.complete(requestId, current.kind, responseJson)
        clearPendingPasskeyRequest()
        activity.runOnUiThread {
            activity.moveTaskToBack(true)
        }
        return true
    }

    @JavascriptInterface
    fun cancelPasskeyRequest(requestId: String): Boolean {
        val current = getPendingPasskeyRequest()
        if (current != null && current.requestId != requestId) {
            return false
        }
        val shouldReturn = PasskeyResultMailbox.hasActiveSession()
        PasskeyResultMailbox.cancel(requestId)
        clearPendingPasskeyRequest()
        if (shouldReturn) {
            activity.runOnUiThread {
                activity.moveTaskToBack(true)
            }
        }
        return true
    }

    @JavascriptInterface
    fun failPasskeyRequest(requestId: String, errorMessage: String): Boolean {
        val current = getPendingPasskeyRequest()
        if (current != null && current.requestId != requestId) {
            return false
        }
        val shouldReturn = PasskeyResultMailbox.hasActiveSession()
        PasskeyResultMailbox.fail(requestId, errorMessage.ifBlank { "Passkey operation failed" })
        clearPendingPasskeyRequest()
        if (shouldReturn) {
            activity.runOnUiThread {
                activity.moveTaskToBack(true)
            }
        }
        return true
    }

    companion object {
        private const val LOG_TAG = "KalderaShieldPasskey"
    }
}
