package com.nuvio.app.features.iptv

import com.nuvio.app.features.addons.httpRequestRaw
import io.ktor.http.encodeURLParameter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Xtream Codes Player API client for live TV.
 *
 * Auth: GET {server}/player_api.php?username=&password=
 * Live: get_live_categories + get_live_streams
 * Play: {server}/live/{user}/{pass}/{stream_id}.m3u8 (or .ts / direct_source)
 */
internal class XtreamCodesClient(
    serverUrl: String,
    username: String,
    password: String,
    private val preferredExtension: String = "m3u8",
) {
    private val serverBase = normalizeServerBase(serverUrl)
    private val user = username.trim()
    private val pass = password.trim()
    private val json = Json { ignoreUnknownKeys = true }

    init {
        require(user.isNotEmpty()) { "Xtream username is required." }
        require(pass.isNotEmpty()) { "Xtream password is required." }
    }

    suspend fun loadChannels(sourceId: String): List<IptvChannel> {
        authenticate()
        val categories = fetchLiveCategories()
        val streams = fetchLiveStreams()
        return streams.mapNotNull { element ->
            val obj = element.asObjectOrNull() ?: return@mapNotNull null
            val streamId = obj.string("stream_id") ?: return@mapNotNull null
            val name = obj.string("name")?.trim().orEmpty()
            if (name.isEmpty()) return@mapNotNull null
            val categoryId = obj.string("category_id")
            val group = categoryId?.let { categories[it] }?.takeIf { it.isNotBlank() }
            val direct = obj.string("direct_source")?.takeIf {
                it.startsWith("http://") || it.startsWith("https://")
            }
            val streamUrl = direct ?: buildLiveStreamUrl(streamId)
            IptvChannel(
                id = "xtream:$sourceId:$streamId",
                name = name,
                streamUrl = streamUrl,
                logoUrl = obj.string("stream_icon")?.takeIf { it.startsWith("http") },
                groupTitle = group,
                tvgId = obj.string("epg_channel_id"),
                tvgName = name,
                sourceId = sourceId,
                headers = emptyMap(),
            )
        }
    }

    private suspend fun authenticate() {
        val payload = getJson("$playerApi?username=${enc(user)}&password=${enc(pass)}")
        val userInfo = payload.asObjectOrNull()?.get("user_info")?.asObjectOrNull()
            ?: error("Xtream auth failed: unexpected response.")
        val auth = userInfo.string("auth") ?: userInfo.string("status")
        val ok = auth == "1" ||
            auth.equals("true", ignoreCase = true) ||
            auth.equals("Active", ignoreCase = true)
        if (!ok) {
            val message = userInfo.string("message")
                ?: userInfo.string("status")
                ?: "Invalid Xtream credentials."
            error(message)
        }
    }

    private suspend fun fetchLiveCategories(): Map<String, String> {
        val element = getJson(
            "$playerApi?username=${enc(user)}&password=${enc(pass)}&action=get_live_categories",
        )
        val array = element.asArrayOrNull().ifEmpty {
            element.asObjectOrNull()?.get("categories")?.asArrayOrNull().orEmpty()
        }
        return array.mapNotNull { item ->
            val obj = item.asObjectOrNull() ?: return@mapNotNull null
            val id = obj.string("category_id") ?: return@mapNotNull null
            val name = obj.string("category_name") ?: return@mapNotNull null
            id to name
        }.toMap()
    }

    private suspend fun fetchLiveStreams(): List<JsonElement> {
        val element = getJson(
            "$playerApi?username=${enc(user)}&password=${enc(pass)}&action=get_live_streams",
        )
        return element.asArrayOrNull().ifEmpty {
            element.asObjectOrNull()?.get("streams")?.asArrayOrNull().orEmpty()
        }
    }

    private fun buildLiveStreamUrl(streamId: String): String {
        val ext = preferredExtension.trimStart('.')
        return "$serverBase/live/${encPath(user)}/${encPath(pass)}/$streamId.$ext"
    }

    private suspend fun getJson(url: String): JsonElement {
        val response = httpRequestRaw(
            method = "GET",
            url = url,
            headers = mapOf(
                "User-Agent" to "NuvioIPTV/1.0",
                "Accept" to "application/json",
            ),
            body = "",
            followRedirects = true,
            maxResponseBodyBytes = MaxResponseBytes,
        )
        if (response.status !in 200..299) {
            error("Xtream request failed (${response.status}) for $url")
        }
        return runCatching { json.parseToJsonElement(response.body) }.getOrElse {
            error("Invalid JSON from Xtream API.")
        }
    }

    private val playerApi: String get() = "$serverBase/player_api.php"

    companion object {
        private const val MaxResponseBytes = 32 * 1024 * 1024

        fun normalizeServerBase(raw: String): String {
            var url = raw.trim()
            require(url.startsWith("http://") || url.startsWith("https://")) {
                "Server URL must start with http:// or https://"
            }
            url = url.trimEnd('/')
            val suffixes = listOf(
                "/player_api.php",
                "/get.php",
                "/xmltv.php",
                "/panel_api.php",
            )
            for (suffix in suffixes) {
                val index = url.indexOf(suffix, ignoreCase = true)
                if (index >= 0) {
                    url = url.substring(0, index).trimEnd('/')
                    break
                }
            }
            // Drop query strings if someone pasted a full login URL.
            val queryIndex = url.indexOf('?')
            if (queryIndex >= 0) {
                url = url.substring(0, queryIndex).trimEnd('/')
            }
            return url
        }

        private fun enc(value: String): String = value.encodeURLParameter()

        // Path segments: encode but keep common username charset readable.
        private fun encPath(value: String): String = value.encodeURLParameter()
    }
}

private fun JsonObject.string(key: String): String? {
    val primitive = this[key] as? JsonPrimitive ?: return null
    return primitive.contentOrNull?.takeIf { it.isNotBlank() && it != "null" }
}

private fun JsonElement.asObjectOrNull(): JsonObject? = this as? JsonObject
private fun JsonElement.asArrayOrNull(): List<JsonElement> = (this as? JsonArray)?.toList().orEmpty()
