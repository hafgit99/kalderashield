package com.kalderashield.desktop

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import android.view.autofill.AutofillManager
import com.kalderashield.desktop.security.AutofillRequestRegistry
import com.kalderashield.desktop.security.AutofillResultMailbox
import com.kalderashield.desktop.security.AutofillSecurityLog

/**
 * Lightweight, non-exported Autofill authentication relay Activity.
 *
 * ## Why this Activity exists
 *
 * Android's Autofill Framework invokes the authentication `PendingIntent` via
 * `startIntentSenderForResult` from the client app's task (e.g. Chrome).
 *
 * 1. `MainActivity` MUST stay `launchMode="singleTask"` because it owns the
 *    process-wide Tauri `RustWebView`. Launching a `singleTask` Activity for a
 *    result causes Android's `ActivityStarter` to immediately cancel the result
 *    across tasks (`RESULT_CANCELED`).
 * 2. Calling `finish()` on `MainActivity` destroys the Tauri WebView while
 *    `KalderaShieldAutofillService` keeps the Linux process alive (Tauri
 *    #11609), leaving subsequent launches on a permanent black screen.
 *
 * `AutofillAuthActivity` runs with `launchMode="standard"` and `taskAffinity=""`
 * inside the client app's task, forwards the opaque K-1 `requestId` to
 * `MainActivity`, waits paused in the client's task while the user unlocks
 * KalderaShield and picks a card, and — as soon as `MainActivity` drops the
 * filled `Dataset` into [AutofillResultMailbox] and calls `moveTaskToBack(true)`
 * — resumes in the client's task, delivers `RESULT_OK` +
 * `AutofillManager.EXTRA_AUTHENTICATION_RESULT`, and finishes invisibly.
 *
 * ## K-1 trust boundary
 *
 * `android:exported="false"` with no `<intent-filter>`. Reads ONLY the opaque
 * routing `EXTRA_REQUEST_ID` and validates it against [AutofillRequestRegistry].
 */
class AutofillAuthActivity : Activity() {
    private var requestId: String? = null
    private var state: Int = STATE_INITIAL
    private var resultDelivered: Boolean = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val launchWatchdog = Runnable {
        if (!resultDelivered && state == STATE_LAUNCHING_MAIN && !isFinishing) {
            Log.w(
                AUTOFILL_LOG_TAG,
                "AutofillAuthActivity watchdog expired before MainActivity took focus; cancelling requestId=$requestId",
            )
            AutofillRequestRegistry.consumeFillRequest(requestId)
            finishCancelled()
        }
    }

    @Suppress("NewApi", "DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            finishCancelled()
            return
        }

        if (savedInstanceState != null) {
            requestId = savedInstanceState.getString(KEY_REQUEST_ID)
            state = savedInstanceState.getInt(KEY_STATE, STATE_AWAITING_RESULT)
            if (requestId.isNullOrBlank()) {
                finishCancelled()
            }
            return
        }

        val action = intent?.action
        val incomingRequestId = intent?.getStringExtra(KalderaShieldAutofillService.EXTRA_REQUEST_ID)
        val createdAt = intent?.getLongExtra(KalderaShieldAutofillService.EXTRA_REQUEST_CREATED_AT, 0L) ?: 0L

        if (action != KalderaShieldAutofillService.ACTION_AUTOFILL_AUTHENTICATE ||
            AutofillRequestRegistry.findFillRequest(incomingRequestId) == null
        ) {
            AutofillSecurityLog.unroutableIntent(action, incomingRequestId)
            finishCancelled()
            return
        }

        val validatedRequestId = incomingRequestId!!
        requestId = validatedRequestId
        AutofillResultMailbox.beginSession(validatedRequestId)
        state = STATE_LAUNCHING_MAIN

        try {
            val mainIntent = Intent(this, MainActivity::class.java).apply {
                this.action = KalderaShieldAutofillService.ACTION_AUTOFILL_AUTHENTICATE
                putExtra(KalderaShieldAutofillService.EXTRA_REQUEST_ID, validatedRequestId)
                putExtra(KalderaShieldAutofillService.EXTRA_REQUEST_CREATED_AT, createdAt)
            }
            startActivity(mainIntent)
            overridePendingTransition(0, 0)
            mainHandler.postDelayed(launchWatchdog, LAUNCH_WATCHDOG_MS)
        } catch (error: Exception) {
            Log.e(AUTOFILL_LOG_TAG, "Failed to launch MainActivity for autofill: ${error.message}", error)
            AutofillRequestRegistry.consumeFillRequest(validatedRequestId)
            finishCancelled()
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

        val outcome = AutofillResultMailbox.take(currentId)
        if (outcome != null) {
            deliverOutcome(outcome)
            return
        }

        if (state == STATE_AWAITING_RESULT) {
            // The user returned to the client task (e.g. Back or Recents) without
            // approving or explicitly cancelling inside MainActivity. Cleanly
            // dismiss this relay so the browser is never obscured.
            AutofillRequestRegistry.consumeFillRequest(currentId)
            finishCancelled()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_REQUEST_ID, requestId)
        outState.putInt(
            KEY_STATE,
            if (state == STATE_LAUNCHING_MAIN) STATE_AWAITING_RESULT else state,
        )
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(launchWatchdog)
        if (isFinishing) {
            AutofillResultMailbox.endSession(requestId)
        }
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        AutofillRequestRegistry.consumeFillRequest(requestId)
        finishCancelled()
    }

    @Suppress("DEPRECATION")
    private fun deliverOutcome(outcome: AutofillResultMailbox.Outcome) {
        if (resultDelivered) return
        resultDelivered = true
        mainHandler.removeCallbacks(launchWatchdog)

        when (outcome) {
            is AutofillResultMailbox.Outcome.Completed -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val replyIntent = Intent().putExtra(
                        AutofillManager.EXTRA_AUTHENTICATION_RESULT,
                        outcome.response,
                    )
                    setResult(Activity.RESULT_OK, replyIntent)
                    Log.i(AUTOFILL_LOG_TAG, "AutofillAuthActivity delivered RESULT_OK for requestId=$requestId")
                } else {
                    setResult(Activity.RESULT_CANCELED)
                }
            }
            AutofillResultMailbox.Outcome.Cancelled -> {
                setResult(Activity.RESULT_CANCELED)
                Log.i(AUTOFILL_LOG_TAG, "AutofillAuthActivity delivered RESULT_CANCELED for requestId=$requestId")
            }
        }

        AutofillResultMailbox.endSession(requestId)
        finish()
        overridePendingTransition(0, 0)
    }

    @Suppress("DEPRECATION")
    private fun finishCancelled() {
        if (resultDelivered) return
        resultDelivered = true
        mainHandler.removeCallbacks(launchWatchdog)
        AutofillResultMailbox.endSession(requestId)
        setResult(Activity.RESULT_CANCELED)
        finish()
        overridePendingTransition(0, 0)
    }

    companion object {
        private const val AUTOFILL_LOG_TAG = "KalderaShieldAutofill"
        private const val KEY_REQUEST_ID = "ks_autofill_request_id"
        private const val KEY_STATE = "ks_autofill_state"
        private const val STATE_INITIAL = 0
        private const val STATE_LAUNCHING_MAIN = 1
        private const val STATE_AWAITING_RESULT = 2
        private const val LAUNCH_WATCHDOG_MS = 3500L
    }
}
