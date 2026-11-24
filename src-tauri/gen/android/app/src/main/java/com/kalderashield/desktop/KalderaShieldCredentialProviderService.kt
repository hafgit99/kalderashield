package com.kalderashield.desktop

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.AuthenticationAction
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CreateEntry
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import com.kalderashield.desktop.security.PasskeyRequestRegistry
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/**
 * Android 14+ (API 34+) Credential Manager provider service exposing
 * KalderaShield's vault-backed WebAuthn Passkeys to mobile browsers and apps.
 *
 * ## Security boundary (K-1)
 *
 * Because KalderaShield keeps the vault zero-knowledge encrypted at rest, this
 * service never reads plaintext credentials from disk. Instead it registers an
 * opaque 128-bit token in [PasskeyRequestRegistry] and issues a `PendingIntent`
 * targeting the non-exported [PasskeyProviderActivity] relay. Only after the
 * user explicitly unlocks KalderaShield and approves in the in-app modal does
 * a signed passkey credential cross back into Credential Manager.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class KalderaShieldCredentialProviderService : CredentialProviderService() {

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>,
    ) {
        if (request !is BeginCreatePublicKeyCredentialRequest) {
            callback.onResult(BeginCreateCredentialResponse())
            return
        }

        try {
            val token = UUID.randomUUID().toString()
            PasskeyRequestRegistry.registerPendingToken(token, KIND_CREATE)

            val relayIntent = Intent(applicationContext, PasskeyProviderActivity::class.java).apply {
                action = ACTION_PASSKEY_CREATE
                putExtra(EXTRA_PASSKEY_PENDING_TOKEN, token)
            }
            val pendingIntent = PendingIntent.getActivity(
                applicationContext,
                pendingIntentCounter.incrementAndGet(),
                relayIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

            val entry = CreateEntry(
                accountName = getString(R.string.credential_provider_create_title),
                pendingIntent = pendingIntent,
                description = getString(R.string.credential_provider_subtitle),
            )
            callback.onResult(BeginCreateCredentialResponse(listOf(entry)))
        } catch (error: Exception) {
            Log.e(LOG_TAG, "onBeginCreateCredentialRequest failed: ${error.message}", error)
            callback.onError(CreateCredentialUnknownException("KalderaShield passkey create failed"))
        }
    }

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>,
    ) {
        val hasPasskeyOption = request.beginGetCredentialOptions.any {
            it is BeginGetPublicKeyCredentialOption
        }
        if (!hasPasskeyOption) {
            callback.onResult(BeginGetCredentialResponse())
            return
        }

        try {
            val token = UUID.randomUUID().toString()
            PasskeyRequestRegistry.registerPendingToken(token, KIND_GET)

            val relayIntent = Intent(applicationContext, PasskeyProviderActivity::class.java).apply {
                action = ACTION_PASSKEY_GET
                putExtra(EXTRA_PASSKEY_PENDING_TOKEN, token)
            }
            val pendingIntent = PendingIntent.getActivity(
                applicationContext,
                pendingIntentCounter.incrementAndGet(),
                relayIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

            val unlockAction = AuthenticationAction(
                title = getString(R.string.credential_provider_get_title),
                pendingIntent = pendingIntent,
            )
            callback.onResult(
                BeginGetCredentialResponse(
                    authenticationActions = listOf(unlockAction),
                ),
            )
        } catch (error: Exception) {
            Log.e(LOG_TAG, "onBeginGetCredentialRequest failed: ${error.message}", error)
            callback.onError(GetCredentialUnknownException("KalderaShield passkey get failed"))
        }
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>,
    ) {
        callback.onResult(null)
    }

    companion object {
        private const val LOG_TAG = "KalderaShieldPasskey"
        private val pendingIntentCounter = AtomicInteger(9000)

        const val KIND_CREATE = "create"
        const val KIND_GET = "get"
        const val ACTION_PASSKEY_CREATE = "com.kalderashield.desktop.action.PASSKEY_CREATE"
        const val ACTION_PASSKEY_GET = "com.kalderashield.desktop.action.PASSKEY_GET"
        const val ACTION_PASSKEY_REQUEST = "com.kalderashield.desktop.action.PASSKEY_REQUEST"
        const val EXTRA_PASSKEY_PENDING_TOKEN = "com.kalderashield.desktop.extra.PASSKEY_PENDING_TOKEN"
        const val EXTRA_PASSKEY_REQUEST_ID = "com.kalderashield.desktop.extra.PASSKEY_REQUEST_ID"
    }
}
