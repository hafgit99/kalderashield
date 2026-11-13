package com.kalderashield.desktop.bridges

import android.content.Intent
import android.net.Uri
import android.util.Log
import android.webkit.JavascriptInterface
import com.kalderashield.desktop.MainActivity

/**
 * Opens an external HTTPS URL in the system browser.
 *
 * This exists for the app-update flow. The Tauri updater plugin does not
 * support Android (`updater_os()` returns `None` there), so an Android build
 * cannot install an update itself. What it can do is tell the user that a
 * newer version exists and open the APK download in the browser; Android then
 * performs an in-place update, because the new APK carries the same release
 * keystore and a higher `versionCode`.
 *
 * The Tauri `opener` plugin was not used for this: its underlying `open`
 * crate resolves URLs through `xdg-open`, which does not exist on Android, and
 * adding it would also have pulled a D-Bus dependency tree into the mobile
 * build for a single Intent.
 *
 * The URL is not taken on trust from the web layer. It must be HTTPS and its
 * host must be on [ALLOWED_HOSTS]; anything else is refused. A compromised
 * renderer must not be able to turn this bridge into "open any URL the user
 * sees", which is a phishing primitive.
 */
class AndroidUpdateBridge(
    private val activity: MainActivity,
) {
    @JavascriptInterface
    fun openExternalUrl(url: String): Boolean {
        val uri = try {
            Uri.parse(url)
        } catch (_: Exception) {
            return false
        }

        if (!"https".equals(uri.scheme, ignoreCase = true)) {
            Log.w(LOG_TAG, "Refused to open a non-HTTPS URL from the update bridge.")
            return false
        }

        val host = uri.host?.lowercase() ?: return false
        if (host !in ALLOWED_HOSTS) {
            Log.w(LOG_TAG, "Refused to open an update URL from an unexpected host: $host")
            return false
        }

        return try {
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            true
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to open the update URL: ${error.message}")
            false
        }
    }

    companion object {
        private const val LOG_TAG = "KalderaShieldUpdate"

        /**
         * Hosts the update flow is allowed to open.
         *
         * `github.com` serves the release assets; the asset host it redirects
         * to is followed by the browser, not by this bridge, so it does not
         * need to be listed.
         */
        private val ALLOWED_HOSTS = setOf(
            "github.com",
            "www.github.com",
        )
    }
}
