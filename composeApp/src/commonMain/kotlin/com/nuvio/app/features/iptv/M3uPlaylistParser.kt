package com.nuvio.app.features.iptv

/**
 * Minimal M3U / M3U8 playlist parser for IPTV live channels.
 * Supports `#EXTINF` attributes (`tvg-id`, `tvg-name`, `tvg-logo`, `group-title`).
 */
object M3uPlaylistParser {
    private val attributeRegex = Regex("""([\w-]+)="([^"]*)"""")

    fun parse(content: String, sourceId: String): List<IptvChannel> {
        val lines = content.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()

        val channels = ArrayList<IptvChannel>()
        var pendingName: String? = null
        var pendingLogo: String? = null
        var pendingGroup: String? = null
        var pendingTvgId: String? = null
        var pendingTvgName: String? = null
        var index = 0

        for (line in lines) {
            when {
                line.startsWith("#EXTINF", ignoreCase = true) -> {
                    val attrs = attributeRegex.findAll(line).associate { match ->
                        match.groupValues[1].lowercase() to match.groupValues[2]
                    }
                    pendingLogo = attrs["tvg-logo"]?.takeIf { it.isNotBlank() }
                    pendingGroup = attrs["group-title"]?.takeIf { it.isNotBlank() }
                    pendingTvgId = attrs["tvg-id"]?.takeIf { it.isNotBlank() }
                    pendingTvgName = attrs["tvg-name"]?.takeIf { it.isNotBlank() }
                    pendingName = line.substringAfterLast(',').trim().ifBlank {
                        pendingTvgName ?: "Channel ${index + 1}"
                    }
                }

                line.startsWith("#") -> Unit

                else -> {
                    val name = pendingName ?: "Channel ${index + 1}"
                    val idSeed = pendingTvgId ?: "$sourceId:$index:$name"
                    channels += IptvChannel(
                        id = idSeed,
                        name = name,
                        streamUrl = line,
                        logoUrl = pendingLogo,
                        groupTitle = pendingGroup,
                        tvgId = pendingTvgId,
                        tvgName = pendingTvgName,
                        sourceId = sourceId,
                    )
                    index++
                    pendingName = null
                    pendingLogo = null
                    pendingGroup = null
                    pendingTvgId = null
                    pendingTvgName = null
                }
            }
        }
        return channels
    }
}
