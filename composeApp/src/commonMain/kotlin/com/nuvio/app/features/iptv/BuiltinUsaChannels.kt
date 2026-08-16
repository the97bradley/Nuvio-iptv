package com.nuvio.app.features.iptv

import nuvio.composeapp.generated.resources.Res

/**
 * Built-in USA public / FAST-style channels curated from community playlists
 * (iptv-org US + Free-TV USA), bundled so Live works without adding a source.
 */
object BuiltinUsaChannels {
    const val SourceId = "builtin-usa-public"
    const val SourceName = "USA Public"
    /** Optional network refresh; embedded playlist is the offline source of truth. */
    const val RefreshUrl = "https://iptv-org.github.io/iptv/countries/us.m3u"
    private const val ResourcePath = "files/usa_public.m3u"

    fun source(lastRefreshedAtEpochMs: Long? = null): IptvPlaylistSource =
        IptvPlaylistSource(
            id = SourceId,
            name = SourceName,
            kind = IptvSourceKind.M3U,
            url = RefreshUrl,
            lastRefreshedAtEpochMs = lastRefreshedAtEpochMs,
        )

    fun isBuiltin(sourceId: String): Boolean = sourceId == SourceId

    fun isBuiltin(source: IptvPlaylistSource): Boolean = isBuiltin(source.id)

    /** Prefer built-in first; drop any stale persisted copy of the same id. */
    fun mergeInto(sources: List<IptvPlaylistSource>): List<IptvPlaylistSource> {
        val rest = sources.filterNot { isBuiltin(it.id) }
        val existing = sources.firstOrNull { isBuiltin(it.id) }
        return listOf(source(lastRefreshedAtEpochMs = existing?.lastRefreshedAtEpochMs)) + rest
    }

    suspend fun loadEmbeddedPlaylistText(): String =
        Res.readBytes(ResourcePath).decodeToString()
}
