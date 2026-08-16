package com.nuvio.app.features.iptv

/**
 * IPTV source kinds supported by the Live tab.
 * M3U, Stalker Portal, and Xtream Codes are implemented.
 */
enum class IptvSourceKind {
    M3U,
    Xtream,
    Stalker,
}

data class IptvPlaylistSource(
    val id: String,
    val name: String,
    val kind: IptvSourceKind = IptvSourceKind.M3U,
    /** Remote playlist URL or Stalker portal base URL. */
    val url: String,
    val username: String? = null,
    val password: String? = null,
    /** MAG-style MAC used by Stalker portals (e.g. 00:1A:79:12:34:56). */
    val macAddress: String? = null,
    val epgUrl: String? = null,
    val lastRefreshedAtEpochMs: Long? = null,
)

data class IptvChannel(
    val id: String,
    val name: String,
    val streamUrl: String,
    val logoUrl: String? = null,
    val groupTitle: String? = null,
    val tvgId: String? = null,
    val tvgName: String? = null,
    val sourceId: String,
    /** Stalker channel cmd; resolved to a stream URL via create_link at play time. */
    val playbackCmd: String? = null,
    val headers: Map<String, String> = emptyMap(),
)

data class IptvChannelGroup(
    val title: String,
    val channels: List<IptvChannel>,
)

data class IptvUiState(
    val sources: List<IptvPlaylistSource> = emptyList(),
    val channels: List<IptvChannel> = emptyList(),
    val groups: List<IptvChannelGroup> = emptyList(),
    val selectedSourceId: String? = null,
    val selectedGroupTitle: String? = null,
    val query: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isLoaded: Boolean = false,
    /** Per-source starred channel ids. Live only shows starred channels. */
    val starredChannelIds: Map<String, List<String>> = emptyMap(),
) {
    fun starredIdsFor(sourceId: String?): List<String> {
        if (sourceId.isNullOrBlank()) return emptyList()
        return starredChannelIds[sourceId].orEmpty()
    }

    fun isStarred(channel: IptvChannel): Boolean {
        return starredIdsFor(channel.sourceId).contains(channel.id)
    }

    fun starredCount(sourceId: String?): Int = starredIdsFor(sourceId).size

    val filteredChannels: List<IptvChannel>
        get() {
            val starredOnly = channels.filter { isStarred(it) }
            val bySource = selectedSourceId?.let { id -> starredOnly.filter { it.sourceId == id } }
                ?: starredOnly
            val byGroup = selectedGroupTitle?.let { group ->
                bySource.filter { (it.groupTitle ?: UngroupedTitle) == group }
            } ?: bySource
            val trimmed = query.trim()
            if (trimmed.isEmpty()) return byGroup
            return byGroup.filter { channel ->
                channel.name.contains(trimmed, ignoreCase = true) ||
                    (channel.groupTitle?.contains(trimmed, ignoreCase = true) == true)
            }
        }

    companion object {
        const val UngroupedTitle = "Ungrouped"
    }
}
