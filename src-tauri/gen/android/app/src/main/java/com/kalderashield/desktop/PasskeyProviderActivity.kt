package com.kalderashield.desktop

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.PendingIntentHandler
import com.kalderashield.desktop.model.PasskeyProviderRequest
import com.kalderashield.desktop.model.PasskeyRequestParser
import com.kalderashield.desktop.security.PasskeyRequestRegistry
import com.kalderashield.desktop.security.PasskeyResultMailbox
import java.util.UUID

/**
 * Non-exported Android 14+ Credential Manager relay Activity.
 *
 * Mirrors [AutofillAuthActivity] (K-1 boundary):
 * - Runs with `android:exported="false"`, `launchMode="standard"`, `taskAffinity=""`
 *   inside the calling app's task so `setResult` reaches Credential Manager while
 *   `MainActivity` stays `singleTask` and keeps the Tauri WebView alive.
 * - Validates the 128-bit pending token issued by [KalderaShieldCredentialProviderService]
 *   AND extracts the authoritative request via Jetpack's [PendingIntentHandler].
 * - Forwards ONLY an opaque 128-bit `requestId` to [MainActivity].
 */
class PasskeyProviderActivity : Activity() {
    private var requestId: String? = null
    private var requestKind: String? = null
    private var state: Int = STATE_INITIAL
    private var resultDelivered: Boolean = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val launchWatchdog = Runnable {
        if (!resultDelivered && state == STATE_LAUNCHING_MAIN && !isFinishing) {
            Log.w(LOG_TAG, "PasskeyProviderActivity watchdog expired; cancelling requestId=$requestId")
            PasskeyRequestRegistry.consume(requestId)
            finishCancelled()
        }
    }

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            finishCancelled()
            return
        }

        if (savedInstanceState != null) {
            requestId = savedInstanceState.getString(KEY_REQUEST_ID)
            requestKind = savedInstanceState.getString(KEY_REQUEST_KIND)
            state = savedInstanceState.getInt(KEY_STATE, STATE_AWAITING_RESULT)
            if (requestId.isNullOrBlank()) {
                finishCancelled()
            }
            return
        }

        val token = intent?.getStringExtra(KalderaShieldCredentialProviderService.EXTRA_PASSKEY_PENDING_TOKEN)
        val expectedKind = PasskeyRequestRegistry.consumePendingToken(token)
        if (expectedKind == null) {
            Log.w(LOG_TAG, "Rejected unverified PasskeyProviderActivity launch (missing/unknown token)")
            finishCancelled()
            return
        }

        val parsed = extractAuthoritativeRequest(expectedKind)
        if (parsed == null) {
            Log.w(LOG_TAG, "Failed to parse authoritative Credential Manager request (kind=$expectedKind)")
            finishFailed(expectedKind, "Invalid WebAuthn credential request")
            return
        }

        PasskeyRequestRegistry.register(parsed)
        requestId = parsed.requestId
        requestKind = parsed.kind
        PasskeyResultMailbox.beginSession(parsed.requestId)
        state = STATE_LAUNCHING_MAIN

        try {
            val mainIntent = Intent(this, MainActivity::class.java).apply {
                action = KalderaShieldCredentialProviderService.ACTION_PASSKEY_REQUEST
                putExtra(KalderaShieldCredentialProviderService.EXTRA_PASSKEY_REQUEST_ID, parsed.requestId)
            }
            startActivity(mainIntent)
            overridePendingTransition(0, 0)
            mainHandler.postDelayed(launchWatchdog, LAUNCH_WATCHDOG_MS)
        } catch (error: Exception) {
            Log.e(LOG_TAG, "Failed to launch MainActivity for passkey request: ${error.message}", error)
            PasskeyRequestRegistry.consume(parsed.requestId)
            finishFailed(parsed.kind, "Failed to launch KalderaShield")
        }
    }

    private fun extractAuthoritativeRequest(expectedKind: String): PasskeyProviderRequest? {
        val currentIntent = intent ?: return null
        val newRequestId = UUID.randomUUID().toString()

        return when (expectedKind) {
            KalderaShieldCredentialProviderService.KIND_CREATE -> {
                val providerReq = PendingIntentHandler.retrieveProviderCreateCredentialRequest(currentIntent)
                    ?: return null
                val createReq = providerReq.callingRequest as? CreatePublicKeyCredentialRequest
                    ?: return null
                val callingApp = providerReq.callingAppInfo
                val origin = callingApp.origin?.takeIf { it.isNotBlank() }
                    ?: PasskeyRequestParser.originFromSigningInfo(callingApp.signingInfo)
                    ?: return null
                PasskeyRequestParser.parseCreateRequest(
                    requestId = newRequestId,
                    requestJson = createReq.requestJson,
                    origin = origin,
                    appPackage = callingApp.packageName,
                )
            }

            KalderaShieldCredentialProviderService.KIND_GET -> {
                val providerReq = PendingIntentHandler.retrieveProviderGetCredentialRequest(currentIntent)
                    ?: return null
                val getOption = providerReq.credentialOptions
                    .filterIsInstance<GetPublicKeyCredentialOption>()
                    .firstOrNull()
                    ?: return null
                val callingApp = providerReq.callingAppInfo
                val origin = callingApp.origin?.takeIf { it.isNotBlank() }
                    ?: PasskeyRequestParser.originFromSigningInfo(callingApp.signingInfo)
                    ?: return null
                PasskeyRequestParser.parseGetRequest(
                    requestId = newRequestId,
                    requestJson = getOption.requestJson,
                    origin = origin,
                    appPackage = callingApp.packageName,
                )
            }

            else -> null
        }
    }

    override fun onPause() {
        super.onPause()
        mainHandler.removeCallbacks(launchWatchdog)
        if (state == STATE_LAUNCHING_MAIN) {
            state = STATE_AWAITING_RESULT
        }
    }

    override fun onResume() {
        super.onResume()
        if (resultDelivered) return

        val currentId = requestId
        if (currentId.isNullOrBlank()) {
            finishCancelled()
            return
        }

        val outcome = PasskeyResultMailbox.take(currentId)
        if (outcome != null) {
            deliverOutcome(outcome)
            return
        }

        if (state == STATE_AWAITING_RESULT) {
            PasskeyRequestRegistry.consume(currentId)
            finishCancelled()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_REQUEST_ID, requestId)
        outState.putString(KEY_REQUEST_KIND, requestKind)
        outState.putInt(
            KEY_STATE,
            if (state == STATE_LAUNCHING_MAIN) STATE_AWAITING_RESULT else state,
        )
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(launchWatchdog)
        if (isFinishing) {
            PasskeyResultMailbox.endSession(requestId)
        }
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        PasskeyRequestRegistry.consume(requestId)
        finishCancelled()
    }

    @Suppress("DEPRECATION")
    private fun deliverOutcome(outcome: PasskeyResultMailbox.Outcome) {
        if (resultDelivered) return
        resultDelivered = true
        mainHandler.removeCallbacks(launchWatchdog)

        when (outcome) {
            is PasskeyResultMailbox.Outcome.Completed -> {
                val replyIntent = Intent()
                if (outcome.kind == KalderaShieldCredentialProviderService.KIND_CREATE) {
                    PendingIntentHandler.setCreateCredentialResponse(
                        replyIntent,
                        CreatePublicKeyCredentialResponse(outcome.responseJson),
                    )
                } else {
                    PendingIntentHandler.setGetCredentialResponse(
                        replyIntent,
                        GetCredentialResponse(PublicKeyCredential(outcome.responseJson)),
                    )
                }
                setResult(Activity.RESULT_OK, replyIntent)
            }

            is PasskeyResultMailbox.Outcome.Failed -> {
                val replyIntent = Intent()
                if (requestKind == KalderaShieldCredentialProviderService.KIND_CREATE) {
                    PendingIntentHandler.setCreateCredentialException(
                        replyIntent,
                        CreateCredentialUnknownException(outcome.errorMessage),
                    )
                } else {
                    PendingIntentHandler.setGetCredentialException(
                        replyIntent,
                        GetCredentialUnknownException(outcome.errorMessage),
                    )
                }
                setResult(Activity.RESULT_OK, replyIntent)
            }

            PasskeyResultMailbox.Outcome.Cancelled -> {
                val replyIntent = Intent()
                if (requestKind == KalderaShieldCredentialProviderService.KIND_CREATE) {
                    PendingIntentHandler.setCreateCredentialException(
                        replyIntent,
                        CreateCredentialCancellationException("Cancelled by user"),
                    )
                } else {
                    PendingIntentHandler.setGetCredentialException(
                        replyIntent,
                        GetCredentialCancellationException("Cancelled by user"),
                    )
                }
                setResult(Activity.RESULT_OK, replyIntent)
            }
        }

        PasskeyResultMailbox.endSession(requestId)
        finish()
        overridePendingTransition(0, 0)
    }

    @Suppress("DEPRECATION")
    private fun finishCancelled() {
        if (resultDelivered) return
        resultDelivered = true
        mainHandler.removeCallbacks(launchWatchdog)
        PasskeyResultMailbox.endSession(requestId)
        setResult(Activity.RESULT_CANCELED)
        finish()
        overridePendingTransition(0, 0)
    }

    @Suppress("DEPRECATION")
    private fun finishFailed(kind: String, message: String) {
        if (resultDelivered) return
        resultDelivered = true
        mainHandler.removeCallbacks(launchWatchdog)
        PasskeyResultMailbox.endSession(requestId)
        val replyIntent = Intent()
        if (kind == KalderaShieldCredentialProviderService.KIND_CREATE) {
            PendingIntentHandler.setCreateCredentialException(
                replyIntent,
                CreateCredentialUnknownException(message),
            )
        } else {
            PendingIntentHandler.setGetCredentialException(
                replyIntent,
                GetCredentialUnknownException(message),
            )
        }
        setResult(Activity.RESULT_OK, replyIntent)
        finish()
        overridePendingTransition(0, 0)
    }

    companion object {
        private const val LOG_TAG = "KalderaShieldPasskey"
        private const val KEY_REQUEST_ID = "ks_passkey_request_id"
        private const val KEY_REQUEST_KIND = "ks_passkey_request_kind"
        private const val KEY_STATE = "ks_passkey_state"
        private const val STATE_INITIAL = 0
        private const val STATE_LAUNCHING_MAIN = 1
        private const val STATE_AWAITING_RESULT = 2
        private const val LAUNCH_WATCHDOG_MS = 3500L
    }
}
