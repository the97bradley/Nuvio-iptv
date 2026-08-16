package com.nuvio.app.features.iptv

import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.library.LibraryClock
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.player.PlayerLaunch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlin.random.Random

object IptvRepository {
    private const val MaxPlaylistBytes = 32 * 1024 * 1024

    private val mutex = Mutex()
    private val _state = MutableStateFlow(IptvUiState())
    val state: StateFlow<IptvUiState> = _state.asStateFlow()

    private var channelCache: Map<String, List<IptvChannel>> = emptyMap()

    suspend fun ensureLoaded() {
        if (_state.value.isLoaded) return
        refreshFromStorage()
    }

    suspend fun refreshFromStorage() = mutex.withLock {
        val (sources, selectedSourceId) = withContext(Dispatchers.Default) { IptvStorage.load() }
        val selected = selectedSourceId?.takeIf { id -> sources.any { it.id == id } }
            ?: sources.firstOrNull()?.id
        _state.update {
            it.copy(
                sources = sources,
                selectedSourceId = selected,
                channels = emptyList(),
                groups = emptyList(),
                isLoaded = true,
                errorMessage = null,
            )
        }
        channelCache = emptyMap()
        if (selected != null) {
            loadChannelsForSource(selected, forceNetwork = false)
        }
    }

    fun setQuery(query: String) {
        _state.update { it.copy(query = query) }
    }

    fun selectGroup(groupTitle: String?) {
        _state.update { it.copy(selectedGroupTitle = groupTitle) }
    }

    suspend fun selectSource(sourceId: String) {
        mutex.withLock {
            val sources = _state.value.sources
            if (sources.none { it.id == sourceId }) return
            IptvStorage.save(sources, sourceId)
            _state.update {
                it.copy(
                    selectedSourceId = sourceId,
                    selectedGroupTitle = null,
                    query = "",
                    errorMessage = null,
                )
            }
        }
        loadChannelsForSource(sourceId, forceNetwork = false)
    }

    suspend fun addM3uSource(name: String, url: String): Boolean {
        val trimmedUrl = url.trim()
        if (trimmedUrl.isEmpty()) {
            _state.update { it.copy(errorMessage = "Playlist URL is required.") }
            return false
        }
        val source = IptvPlaylistSource(
            id = "m3u-${LibraryClock.nowEpochMs()}-${Random.nextInt(100000, 999999)}",
            name = name.trim().ifBlank { "M3U Playlist" },
            kind = IptvSourceKind.M3U,
            url = trimmedUrl,
        )
        mutex.withLock {
            val sources = _state.value.sources + source
            IptvStorage.save(sources, source.id)
            _state.update {
                it.copy(
                    sources = sources,
                    selectedSourceId = source.id,
                    selectedGroupTitle = null,
                    query = "",
                    errorMessage = null,
                )
            }
        }
        return loadChannelsForSource(source.id, forceNetwork = true)
    }

    suspend fun removeSource(sourceId: String) {
        mutex.withLock {
            val sources = _state.value.sources.filterNot { it.id == sourceId }
            val nextSelected = when {
                _state.value.selectedSourceId != sourceId -> _state.value.selectedSourceId
                else -> sources.firstOrNull()?.id
            }
            IptvStorage.save(sources, nextSelected)
            channelCache = channelCache - sourceId
            _state.update {
                it.copy(
                    sources = sources,
                    selectedSourceId = nextSelected,
                    selectedGroupTitle = null,
                    channels = emptyList(),
                    groups = emptyList(),
                    errorMessage = null,
                )
            }
        }
        _state.value.selectedSourceId?.let { loadChannelsForSource(it, forceNetwork = false) }
    }

    suspend fun refreshSelectedSource(): Boolean {
        val sourceId = _state.value.selectedSourceId ?: return false
        return loadChannelsForSource(sourceId, forceNetwork = true)
    }

    fun playerLaunchFor(channel: IptvChannel): PlayerLaunch {
        val profileId = ProfileRepository.activeProfileId
        return PlayerLaunch(
            profileId = profileId,
            title = channel.name,
            sourceUrl = channel.streamUrl,
            sourceHeaders = channel.headers,
            logo = channel.logoUrl,
            poster = channel.logoUrl,
            streamTitle = channel.name,
            streamSubtitle = channel.groupTitle,
            providerName = "IPTV",
            providerAddonId = "iptv:${channel.sourceId}",
            contentType = "tv",
            videoId = "iptv:${channel.id}",
            parentMetaId = "iptv:${channel.sourceId}",
            parentMetaType = "tv",
            streamType = inferStreamType(channel.streamUrl),
        )
    }

    private suspend fun loadChannelsForSource(sourceId: String, forceNetwork: Boolean): Boolean {
        val source = _state.value.sources.firstOrNull { it.id == sourceId } ?: return false
        if (!forceNetwork) {
            channelCache[sourceId]?.let { cached ->
                publishChannels(cached)
                return true
            }
        }

        _state.update { it.copy(isLoading = true, errorMessage = null) }
        return try {
            val channels = when (source.kind) {
                IptvSourceKind.M3U -> fetchM3uChannels(source)
                IptvSourceKind.Xtream, IptvSourceKind.Stalker -> {
                    throw UnsupportedOperationException(
                        "${source.kind.name} sources are scaffolded but not implemented yet.",
                    )
                }
            }
            channelCache = channelCache + (sourceId to channels)
            val refreshed = source.copy(lastRefreshedAtEpochMs = currentTimeMillis())
            mutex.withLock {
                val sources = _state.value.sources.map { if (it.id == sourceId) refreshed else it }
                IptvStorage.save(sources, _state.value.selectedSourceId)
                _state.update { it.copy(sources = sources, isLoading = false, errorMessage = null) }
            }
            publishChannels(channels)
            true
        } catch (error: Throwable) {
            _state.update {
                it.copy(
                    isLoading = false,
                    errorMessage = error.message?.takeIf { message -> message.isNotBlank() }
                        ?: "Failed to load playlist.",
                )
            }
            false
        }
    }

    private suspend fun fetchM3uChannels(source: IptvPlaylistSource): List<IptvChannel> {
        val response = httpRequestRaw(
            method = "GET",
            url = source.url,
            headers = emptyMap(),
            body = "",
            followRedirects = true,
            maxResponseBodyBytes = MaxPlaylistBytes,
        )
        if (response.status !in 200..299) {
            error("Playlist request failed (${response.status} ${response.statusText})")
        }
        return withContext(Dispatchers.Default) {
            M3uPlaylistParser.parse(response.body, source.id)
        }
    }

    private fun publishChannels(channels: List<IptvChannel>) {
        val groups = channels
            .groupBy { it.groupTitle?.takeIf(String::isNotBlank) ?: IptvUiState.UngroupedTitle }
            .entries
            .sortedBy { it.key.lowercase() }
            .map { (title, items) ->
                IptvChannelGroup(
                    title = title,
                    channels = items.sortedBy { it.name.lowercase() },
                )
            }
        _state.update {
            it.copy(
                channels = channels,
                groups = groups,
                selectedGroupTitle = it.selectedGroupTitle?.takeIf { title ->
                    groups.any { group -> group.title == title }
                },
            )
        }
    }

    private fun inferStreamType(url: String): String? {
        val lower = url.lowercase()
        return when {
            lower.contains(".m3u8") -> "hls"
            lower.contains(".mpd") -> "dash"
            lower.endsWith(".ts") -> "ts"
            else -> null
        }
    }

    private fun currentTimeMillis(): Long = LibraryClock.nowEpochMs()
}
