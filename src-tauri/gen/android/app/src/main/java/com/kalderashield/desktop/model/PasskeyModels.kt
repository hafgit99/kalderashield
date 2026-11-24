package com.kalderashield.desktop.model

import android.content.pm.SigningInfo
import android.os.Build
import android.util.Base64
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

/**
 * Authoritative Android 14+ Credential Manager passkey request held exclusively
 * inside [com.kalderashield.desktop.security.PasskeyRequestRegistry].
 */
data class PasskeyProviderRequest(
    val requestId: String,
    val kind: String, // "create" | "get"
    val createdAt: Long,
    val origin: String,
    val rpId: String,
    val rpName: String = "",
    val userName: String = "",
    val userDisplayName: String = "",
    val userIdBase64Url: String = "",
    val challengeBase64Url: String,
    val pubKeyCredAlgs: List<Int> = emptyList(),
    val excludeCredentialIds: List<String> = emptyList(),
    val allowCredentialIds: List<String> = emptyList(),
    val appPackage: String = "",
) {
    fun isFresh(now: Long = System.currentTimeMillis()): Boolean {
        return now - createdAt in 0..PASSKEY_REQUEST_MAX_AGE_MS
    }

    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("requestId", requestId)
            put("kind", kind)
            put("source", "android-credential-provider")
            put("createdAt", createdAt)
            put("origin", origin)
            put("rpId", rpId)
            put("rpName", rpName)
            put("userName", userName)
            put("userDisplayName", userDisplayName)
            put("userIdBase64Url", userIdBase64Url)
            put("challengeBase64Url", challengeBase64Url)
            put("pubKeyCredAlgs", JSONArray(pubKeyCredAlgs))
            put("excludeCredentialIds", JSONArray(excludeCredentialIds))
            put("allowCredentialIds", JSONArray(allowCredentialIds))
            put("appPackage", appPackage)
            put("crossOrigin", false)
        }
    }

    companion object {
        const val PASSKEY_REQUEST_MAX_AGE_MS = 2 * 60 * 1000L
    }
}

/**
 * Helpers for computing standard Android APK key-hash origins and parsing
 * WebAuthn Credential Manager JSON requests.
 */
object PasskeyRequestParser {
    fun originFromSigningCertBytes(certBytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(certBytes)
        val encoded = Base64.encodeToString(
            digest,
            Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
        )
        return "android:apk-key-hash:$encoded"
    }

    fun originFromSigningInfo(signingInfo: SigningInfo?): String? {
        if (signingInfo == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
        val signatures = if (signingInfo.hasMultipleSigners()) {
            signingInfo.apkContentsSigners
        } else {
            signingInfo.signingCertificateHistory
        }
        val first = signatures?.firstOrNull() ?: return null
        return originFromSigningCertBytes(first.toByteArray())
    }

    fun parseCreateRequest(
        requestId: String,
        requestJson: String,
        origin: String,
        appPackage: String,
        createdAt: Long = System.currentTimeMillis(),
    ): PasskeyProviderRequest? {
        return try {
            val root = JSONObject(requestJson)
            val rp = root.optJSONObject("rp") ?: return null
            val user = root.optJSONObject("user") ?: return null
            val rpId = rp.optString("id", "").trim()
            val challenge = root.optString("challenge", "").trim()
            if (rpId.isEmpty() || challenge.isEmpty()) return null

            val algs = mutableListOf<Int>()
            val pubParams = root.optJSONArray("pubKeyCredParams")
            if (pubParams != null) {
                for (i in 0 until minOf(pubParams.length(), 16)) {
                    val entry = pubParams.optJSONObject(i) ?: continue
                    if (entry.has("alg")) algs.add(entry.optInt("alg"))
                }
            }

            val excludeIds = mutableListOf<String>()
            val excludeArr = root.optJSONArray("excludeCredentials")
            if (excludeArr != null) {
                for (i in 0 until minOf(excludeArr.length(), 64)) {
                    val id = excludeArr.optJSONObject(i)?.optString("id", "").orEmpty().trim()
                    if (id.isNotEmpty()) excludeIds.add(id)
                }
            }

            PasskeyProviderRequest(
                requestId = requestId,
                kind = "create",
                createdAt = createdAt,
                origin = origin,
                rpId = rpId,
                rpName = rp.optString("name", rpId).trim().ifEmpty { rpId },
                userName = user.optString("name", "").trim(),
                userDisplayName = user.optString("displayName", "").trim(),
                userIdBase64Url = user.optString("id", "").trim(),
                challengeBase64Url = challenge,
                pubKeyCredAlgs = algs,
                excludeCredentialIds = excludeIds,
                appPackage = appPackage,
            )
        } catch (_: Exception) {
            null
        }
    }

    fun parseGetRequest(
        requestId: String,
        requestJson: String,
        origin: String,
        appPackage: String,
        createdAt: Long = System.currentTimeMillis(),
    ): PasskeyProviderRequest? {
        return try {
            val root = JSONObject(requestJson)
            val rpId = root.optString("rpId", "").trim()
            val challenge = root.optString("challenge", "").trim()
            if (rpId.isEmpty() || challenge.isEmpty()) return null

            val allowIds = mutableListOf<String>()
            val allowArr = root.optJSONArray("allowCredentials")
            if (allowArr != null) {
                for (i in 0 until minOf(allowArr.length(), 64)) {
                    val id = allowArr.optJSONObject(i)?.optString("id", "").orEmpty().trim()
                    if (id.isNotEmpty()) allowIds.add(id)
                }
            }

            PasskeyProviderRequest(
                requestId = requestId,
                kind = "get",
                createdAt = createdAt,
                origin = origin,
                rpId = rpId,
                challengeBase64Url = challenge,
                allowCredentialIds = allowIds,
                appPackage = appPackage,
            )
        } catch (_: Exception) {
            null
        }
    }
}
