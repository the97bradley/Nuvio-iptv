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
    private const val RemovedBuiltinSourceId = "builtin-usa-public"

    private val mutex = Mutex()
    private val _state = MutableStateFlow(IptvUiState())
    val state: StateFlow<IptvUiState> = _state.asStateFlow()

    private var channelCache: Map<String, List<IptvChannel>> = emptyMap()
    private val stalkerClients = mutableMapOf<String, StalkerPortalClient>()

    suspend fun ensureLoaded() {
        if (_state.value.isLoaded) return
        refreshFromStorage()
    }

    suspend fun refreshFromStorage() = mutex.withLock {
        val stored = withContext(Dispatchers.Default) { IptvStorage.load() }
        val sources = stored.sources.filterNot { it.id == RemovedBuiltinSourceId }
        val selected = stored.selectedSourceId?.takeIf { id -> sources.any { it.id == id } }
            ?: sources.firstOrNull()?.id
        val starred = stored.starredChannelIds.filterKeys { id -> sources.any { it.id == id } }
        IptvStorage.save(sources, selected, starred)
        _state.update {
            it.copy(
                sources = sources,
                selectedSourceId = selected,
                channels = emptyList(),
                groups = emptyList(),
                isLoaded = true,
                errorMessage = null,
                starredChannelIds = starred,
            )
        }
        channelCache = emptyMap()
        stalkerClients.clear()
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

    fun catalogChannels(sourceId: String, query: String = "", starredOnly: Boolean = false): List<IptvChannel> {
        val all = channelCache[sourceId].orEmpty()
        val trimmed = query.trim()
        return all.filter { channel ->
            if (starredOnly && !_state.value.isStarred(channel)) return@filter false
            if (trimmed.isEmpty()) true
            else {
                channel.name.contains(trimmed, ignoreCase = true) ||
                    (channel.groupTitle?.contains(trimmed, ignoreCase = true) == true)
            }
        }
    }

    fun toggleStar(channel: IptvChannel): Boolean {
        val sourceId = channel.sourceId
        val current = _state.value.starredIdsFor(sourceId).toMutableSet()
        val nowStarred = if (current.contains(channel.id)) {
            current.remove(channel.id)
            false
        } else {
            current.add(channel.id)
            true
        }
        val nextStarred = _state.value.starredChannelIds.toMutableMap()
        if (current.isEmpty()) nextStarred.remove(sourceId)
        else nextStarred[sourceId] = current.toList()
        _state.update { it.copy(starredChannelIds = nextStarred) }
        persist()
        val selectedId = _state.value.selectedSourceId
        val cached = selectedId?.let { channelCache[it] }
        if (cached != null) publishChannels(cached)
        return nowStarred
    }

    suspend fun selectSource(sourceId: String) {
        mutex.withLock {
            val sources = _state.value.sources
            if (sources.none { it.id == sourceId }) return
            persist(selectedSourceId = sourceId)
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
        return persistAndLoad(source)
    }

    suspend fun addStalkerSource(name: String, portalUrl: String, macAddress: String): Boolean {
        val trimmedUrl = portalUrl.trim()
        val mac = runCatching { StalkerPortalClient.normalizeMac(macAddress) }.getOrElse { error ->
            _state.update { it.copy(errorMessage = error.message ?: "Invalid MAC address.") }
            return false
        }
        if (trimmedUrl.isEmpty()) {
            _state.update { it.copy(errorMessage = "Portal URL is required.") }
            return false
        }
        val source = IptvPlaylistSource(
            id = "stalker-${LibraryClock.nowEpochMs()}-${Random.nextInt(100000, 999999)}",
            name = name.trim().ifBlank { "Stalker Portal" },
            kind = IptvSourceKind.Stalker,
            url = trimmedUrl,
            macAddress = mac,
        )
        return persistAndLoad(source)
    }

    suspend fun addXtreamSource(
        name: String,
        serverUrl: String,
        username: String,
        password: String,
    ): Boolean {
        val server = runCatching { XtreamCodesClient.normalizeServerBase(serverUrl) }.getOrElse { error ->
            _state.update { it.copy(errorMessage = error.message ?: "Invalid server URL.") }
            return false
        }
        if (username.isBlank() || password.isBlank()) {
            _state.update { it.copy(errorMessage = "Xtream username and password are required.") }
            return false
        }
        val source = IptvPlaylistSource(
            id = "xtream-${LibraryClock.nowEpochMs()}-${Random.nextInt(100000, 999999)}",
            name = name.trim().ifBlank { "Xtream Codes" },
            kind = IptvSourceKind.Xtream,
            url = server,
            username = username.trim(),
            password = password,
        )
        return persistAndLoad(source)
    }

    suspend fun removeSource(sourceId: String) {
        mutex.withLock {
            val sources = _state.value.sources.filterNot { it.id == sourceId }
            val nextSelected = when {
                _state.value.selectedSourceId != sourceId -> _state.value.selectedSourceId
                else -> sources.firstOrNull()?.id
            }
            val nextStarred = _state.value.starredChannelIds - sourceId
            channelCache = channelCache - sourceId
            stalkerClients.remove(sourceId)
            _state.update {
                it.copy(
                    sources = sources,
                    selectedSourceId = nextSelected,
                    selectedGroupTitle = null,
                    channels = emptyList(),
                    groups = emptyList(),
                    errorMessage = null,
                    starredChannelIds = nextStarred,
                )
            }
            persist(sources = sources, selectedSourceId = nextSelected, starredChannelIds = nextStarred)
        }
        _state.value.selectedSourceId?.let { loadChannelsForSource(it, forceNetwork = false) }
    }

    suspend fun refreshSelectedSource(): Boolean {
        val sourceId = _state.value.selectedSourceId ?: return false
        stalkerClients.remove(sourceId)
        return loadChannelsForSource(sourceId, forceNetwork = true)
    }

    suspend fun resolvePlayerLaunch(channel: IptvChannel): PlayerLaunch {
        val source = _state.value.sources.firstOrNull { it.id == channel.sourceId }
        val streamUrl = when {
            !channel.playbackCmd.isNullOrBlank() && source?.kind == IptvSourceKind.Stalker -> {
                clientFor(source).createPlaybackUrl(channel.playbackCmd)
            }
            channel.streamUrl.isNotBlank() -> channel.streamUrl
            else -> error("This channel has no playable URL.")
        }
        return playerLaunchFor(channel.copy(streamUrl = streamUrl))
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

    private fun persist(
        sources: List<IptvPlaylistSource> = _state.value.sources,
        selectedSourceId: String? = _state.value.selectedSourceId,
        starredChannelIds: Map<String, List<String>> = _state.value.starredChannelIds,
    ) {
        IptvStorage.save(sources, selectedSourceId, starredChannelIds)
    }

    private suspend fun persistAndLoad(source: IptvPlaylistSource): Boolean {
        mutex.withLock {
            val sources = _state.value.sources + source
            // New playlists start with zero stars.
            persist(sources = sources, selectedSourceId = source.id)
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
                IptvSourceKind.Stalker -> clientFor(source).loadChannels(source.id)
                IptvSourceKind.Xtream -> XtreamCodesClient(
                    serverUrl = source.url,
                    username = source.username.orEmpty(),
                    password = source.password.orEmpty(),
                ).loadChannels(source.id)
            }
            channelCache = channelCache + (sourceId to channels)
            val refreshed = source.copy(lastRefreshedAtEpochMs = currentTimeMillis())
            mutex.withLock {
                val sources = _state.value.sources.map { if (it.id == sourceId) refreshed else it }
                val validIds = channels.map { it.id }.toSet()
                val keptStars = _state.value.starredIdsFor(sourceId).filter { it in validIds }
                val nextStarred = _state.value.starredChannelIds.toMutableMap()
                if (keptStars.isEmpty()) nextStarred.remove(sourceId)
                else nextStarred[sourceId] = keptStars
                persist(sources = sources, starredChannelIds = nextStarred)
                _state.update {
                    it.copy(
                        sources = sources,
                        isLoading = false,
                        errorMessage = null,
                        starredChannelIds = nextStarred,
                    )
                }
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

    private fun clientFor(source: IptvPlaylistSource): StalkerPortalClient {
        val mac = source.macAddress?.takeIf { it.isNotBlank() }
            ?: error("Stalker source is missing a MAC address.")
        return stalkerClients.getOrPut(source.id) {
            StalkerPortalClient(portalUrl = source.url, macAddress = mac)
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
        val starred = channels.filter { _state.value.isStarred(it) }
        val groups = starred
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
