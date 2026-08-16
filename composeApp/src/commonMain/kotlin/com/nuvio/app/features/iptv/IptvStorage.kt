package com.nuvio.app.features.iptv

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal expect object IptvPlaylistStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}

@Serializable
private data class StoredIptvSource(
    val id: String,
    val name: String,
    val kind: String = IptvSourceKind.M3U.name,
    val url: String,
    val username: String? = null,
    val password: String? = null,
    val macAddress: String? = null,
    val epgUrl: String? = null,
    val lastRefreshedAtEpochMs: Long? = null,
)

@Serializable
private data class StoredIptvPayload(
    val sources: List<StoredIptvSource> = emptyList(),
    val selectedSourceId: String? = null,
)

internal object IptvStorage {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun load(): Pair<List<IptvPlaylistSource>, String?> {
        val raw = IptvPlaylistStorage.loadPayload().orEmpty()
        if (raw.isBlank()) return emptyList<IptvPlaylistSource>() to null
        val payload = runCatching { json.decodeFromString<StoredIptvPayload>(raw) }.getOrNull()
            ?: return emptyList<IptvPlaylistSource>() to null
        val sources = payload.sources.mapNotNull { stored ->
            val kind = runCatching { IptvSourceKind.valueOf(stored.kind) }.getOrDefault(IptvSourceKind.M3U)
            if (stored.id.isBlank() || stored.url.isBlank()) return@mapNotNull null
            if (stored.id == "builtin-usa-public") return@mapNotNull null
            IptvPlaylistSource(
                id = stored.id,
                name = stored.name.ifBlank { "Playlist" },
                kind = kind,
                url = stored.url,
                username = stored.username,
                password = stored.password,
                macAddress = stored.macAddress,
                epgUrl = stored.epgUrl,
                lastRefreshedAtEpochMs = stored.lastRefreshedAtEpochMs,
            )
        }
        return sources to payload.selectedSourceId
    }

    fun save(sources: List<IptvPlaylistSource>, selectedSourceId: String?) {
        val payload = StoredIptvPayload(
            sources = sources.map {
                StoredIptvSource(
                    id = it.id,
                    name = it.name,
                    kind = it.kind.name,
                    url = it.url,
                    username = it.username,
                    password = it.password,
                    macAddress = it.macAddress,
                    epgUrl = it.epgUrl,
                    lastRefreshedAtEpochMs = it.lastRefreshedAtEpochMs,
                )
            },
            selectedSourceId = selectedSourceId,
        )
        IptvPlaylistStorage.savePayload(json.encodeToString(payload))
    }
}
