package com.nuvio.app.features.iptv

import com.nuvio.app.features.addons.httpRequestRaw
import io.ktor.http.encodeURLParameter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray

/**
 * Minimal Stalker / Ministra portal client (MAG STB API).
 *
 * Flow: detect entrypoint → handshake → get_profile → get_genres → get_all_channels.
 * Playback resolves via create_link using the channel cmd.
 */
internal class StalkerPortalClient(
    portalUrl: String,
    macAddress: String,
) {
    private val mac = normalizeMac(macAddress)
    private val portalBase = normalizePortalBase(portalUrl)
    private val json = Json { ignoreUnknownKeys = true }

    private var entryPointType: Int = -1
    private var token: String = ""

    suspend fun loadChannels(sourceId: String): List<IptvChannel> {
        ensureAuthenticated()
        val genres = fetchGenres().associateBy { it.id }
        val payload = apiGet(type = "itv", action = "get_all_channels", includeTokenCookie = true)
        val data = payload["data"]?.asArrayOrNull().orEmpty()
        return data.mapNotNull { element ->
            val obj = element.asObjectOrNull() ?: return@mapNotNull null
            val id = obj.string("id") ?: return@mapNotNull null
            val name = obj.string("name")?.trim().orEmpty()
            if (name.isEmpty()) return@mapNotNull null
            val cmd = obj.string("cmd").orEmpty()
            val genreId = obj.string("tv_genre_id")
            val group = genreId?.let { genres[it]?.name }?.takeIf { it.isNotBlank() }
            IptvChannel(
                id = "stalker:$sourceId:$id",
                name = name,
                streamUrl = "", // resolved at play time via create_link
                logoUrl = obj.string("logo")?.takeIf { it.startsWith("http") },
                groupTitle = group,
                tvgId = obj.string("xmltv_id"),
                tvgName = name,
                sourceId = sourceId,
                playbackCmd = cmd.takeIf { it.isNotBlank() },
                headers = emptyMap(),
            )
        }
    }

    suspend fun createPlaybackUrl(cmd: String): String {
        ensureAuthenticated()
        val cleanedCmd = cmd.replace("ffmpeg ", "").replace("ffrt ", "").trim()
        // Direct HTTP(S) links that aren't localhost can play as-is on many portals.
        if (
            (cleanedCmd.startsWith("http://") || cleanedCmd.startsWith("https://")) &&
            !cleanedCmd.contains("localhost", ignoreCase = true)
        ) {
            return cleanedCmd
        }

        val encodedCmd = cmd.encodeURLParameter()
        val payload = apiGet(
            type = "itv",
            action = "create_link",
            extraQuery = "cmd=$encodedCmd&series=&forced_storage=undefined&disable_ad=0&download=0",
            includeTokenCookie = false,
        )
        val link = payload.string("cmd")
            ?.replace("ffmpeg ", "")
            ?.replace("ffrt ", "")
            ?.trim()
            .orEmpty()
        if (link.isBlank()) {
            error("Portal did not return a playable link for this channel.")
        }
        return link
    }

    private suspend fun ensureAuthenticated() {
        if (token.isNotBlank()) return
        handshake()
        getProfile()
    }

    private suspend fun handshake() {
        val candidates = listOf(0, 1, 2, 3)
        var lastError: Throwable? = null
        for (candidate in candidates) {
            entryPointType = candidate
            try {
                val payload = apiGet(
                    type = "stb",
                    action = "handshake",
                    includeTokenCookie = false,
                    requireAuth = false,
                )
                val nextToken = payload.string("token").orEmpty()
                if (nextToken.isNotBlank()) {
                    token = nextToken
                    return
                }
            } catch (error: Throwable) {
                lastError = error
            }
        }
        throw lastError ?: IllegalStateException("Stalker handshake failed for $portalBase")
    }

    private suspend fun getProfile() {
        // Many portals require get_profile before channel APIs accept the token.
        runCatching {
            apiGet(
                type = "stb",
                action = "get_profile",
                extraQuery = buildString {
                    append("hd=1&ver=ImageDescription:%200.2.18-250;%20ImageDate:%20Fri%20Jan%201%2012:00:00%20UTC%202021;")
                    append("&num_banks=2&sn=&stb_type=MAG250&image_version=218&video_out=hdmi")
                    append("&device_id=&device_id2=&signature=&auth_second_step=0&hw_version=1.7-BD-00&not_valid_token=0")
                    append("&client_type=STB&hw_version_2=1.7-BD-00&metrics=")
                },
                includeTokenCookie = true,
            )
        }
    }

    private suspend fun fetchGenres(): List<StalkerGenre> {
        val payload = apiGet(type = "itv", action = "get_genres", includeTokenCookie = true)
        // Some portals return an array at the root of js; others nest under data.
        val elements = when {
            payload["data"] is JsonArray -> payload["data"]!!.jsonArray
            payload.values.any { it is JsonArray } -> {
                // Rare: js itself is treated as object with numeric keys — fall through
                payload["data"]?.asArrayOrNull().orEmpty()
            }
            else -> {
                // js may be a raw array decoded into a wrapper; try parsing whole body path
                emptyList()
            }
        }.ifEmpty {
            // Fallback: response js is sometimes a JsonArray directly — handled in apiGetRaw
            emptyList()
        }

        val array = if (elements.isNotEmpty()) {
            elements
        } else {
            apiGetArray(type = "itv", action = "get_genres", includeTokenCookie = true)
        }

        return array.mapNotNull { element ->
            val obj = element.asObjectOrNull() ?: return@mapNotNull null
            val id = obj.string("id") ?: obj.string("genre_id") ?: return@mapNotNull null
            val name = obj.string("title") ?: obj.string("name") ?: return@mapNotNull null
            StalkerGenre(id = id, name = name)
        }
    }

    private suspend fun apiGet(
        type: String,
        action: String,
        extraQuery: String = "",
        includeTokenCookie: Boolean,
        requireAuth: Boolean = true,
    ): JsonObject {
        val element = apiGetRaw(type, action, extraQuery, includeTokenCookie, requireAuth)
        return when (element) {
            is JsonObject -> element
            else -> error("Unexpected Stalker response for $action")
        }
    }

    private suspend fun apiGetArray(
        type: String,
        action: String,
        includeTokenCookie: Boolean,
    ): List<JsonElement> {
        val element = apiGetRaw(type, action, "", includeTokenCookie, requireAuth = true)
        return when (element) {
            is JsonArray -> element
            is JsonObject -> element["data"]?.asArrayOrNull().orEmpty()
            else -> emptyList()
        }
    }

    private suspend fun apiGetRaw(
        type: String,
        action: String,
        extraQuery: String,
        includeTokenCookie: Boolean,
        requireAuth: Boolean,
    ): JsonElement {
        if (requireAuth && token.isBlank()) {
            error("Missing Stalker token")
        }
        val endpoint = portalEndpoint()
        val query = buildString {
            append("type=").append(type)
            append("&action=").append(action)
            if (extraQuery.isNotBlank()) {
                append('&').append(extraQuery.trimStart('&'))
            }
            append("&JsHttpRequest=1-xml")
        }
        val url = "$endpoint?$query"
        val response = httpRequestRaw(
            method = "GET",
            url = url,
            headers = buildHeaders(includeTokenCookie = includeTokenCookie, requireAuth = requireAuth),
            body = "",
            followRedirects = true,
            maxResponseBodyBytes = MaxResponseBytes,
        )
        if (response.status == 404) {
            error("Portal endpoint not found (404) at $endpoint")
        }
        if (response.status !in 200..299) {
            error("Stalker request failed (${response.status}) for action=$action")
        }
        val root = runCatching { json.parseToJsonElement(response.body) }.getOrElse {
            error("Invalid JSON from portal action=$action")
        }
        val js = when (root) {
            is JsonObject -> root["js"] ?: root
            else -> root
        }
        return js
    }

    private fun portalEndpoint(): String {
        val base = portalBase.trimEnd('/')
        return when (entryPointType) {
            1 -> "$base/portal.php"
            2 -> "$base/c/server/load.php"
            3 -> "$base/stalker_portal/server/load.php"
            else -> "$base/server/load.php"
        }
    }

    private fun buildHeaders(includeTokenCookie: Boolean, requireAuth: Boolean): Map<String, String> {
        val cookie = buildString {
            append("mac=").append(mac)
            append("; stb_lang=en")
            append("; timezone=Europe/London")
            if (includeTokenCookie && token.isNotBlank()) {
                append("; token=").append(token)
            }
        }
        val headers = linkedMapOf(
            "User-Agent" to MagUserAgent,
            "X-User-Agent" to "Model: MAG250; Link: WiFi",
            "Cookie" to cookie,
            "Referer" to refererUrl(),
            "Pragma" to "no-cache",
            "Connection" to "Close",
        )
        if (requireAuth && token.isNotBlank()) {
            headers["Authorization"] = "Bearer $token"
        }
        return headers
    }

    private fun refererUrl(): String =
        if (portalBase.contains("stalker_portal", ignoreCase = true)) {
            "${portalBase.trimEnd('/')}/c/index.html"
        } else {
            "${portalBase.trimEnd('/')}/c/index.html"
        }

    private data class StalkerGenre(val id: String, val name: String)

    companion object {
        private const val MaxResponseBytes = 32 * 1024 * 1024
        private const val MagUserAgent =
            "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3"

        fun normalizeMac(raw: String): String {
            val hex = raw.uppercase().filter { it in "0123456789ABCDEF" }
            require(hex.length == 12) { "MAC must be 12 hex digits (e.g. 00:1A:79:12:34:56)." }
            return hex.chunked(2).joinToString(":")
        }

        fun normalizePortalBase(raw: String): String {
            var url = raw.trim()
            require(url.startsWith("http://") || url.startsWith("https://")) {
                "Portal URL must start with http:// or https://"
            }
            url = url.trimEnd('/')
            // Strip common suffixes so entrypoint probing can append paths.
            val suffixes = listOf(
                "/stalker_portal/c",
                "/stalker_portal/server/load.php",
                "/stalker_portal",
                "/c/server/load.php",
                "/server/load.php",
                "/portal.php",
                "/c",
                "/server",
            )
            for (suffix in suffixes) {
                if (url.endsWith(suffix, ignoreCase = true)) {
                    url = url.dropLast(suffix.length).trimEnd('/')
                    break
                }
            }
            return url
        }
    }
}

private fun JsonObject.string(key: String): String? {
    val primitive = this[key] as? JsonPrimitive ?: return null
    return primitive.contentOrNull?.takeIf { it.isNotBlank() && it != "null" }
}

private fun JsonElement.asObjectOrNull(): JsonObject? = this as? JsonObject
private fun JsonElement.asArrayOrNull(): List<JsonElement> = (this as? JsonArray)?.toList().orEmpty()
