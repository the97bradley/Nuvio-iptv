package com.nuvio.app.features.iptv

/**
 * IPTV source kinds supported by the Live tab.
 * Xtream / Stalker land later; M3U is the Android v1 path.
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
    /** Remote playlist URL or local content URI string. */
    val url: String,
    val username: String? = null,
    val password: String? = null,
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
) {
    val filteredChannels: List<IptvChannel>
        get() {
            val bySource = selectedSourceId?.let { id -> channels.filter { it.sourceId == id } } ?: channels
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
