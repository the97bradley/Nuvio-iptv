package com.nuvio.app.features.iptv

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BuiltinUsaChannelsTest {
    @Test
    fun mergeInto_putsBuiltinFirstAndDedupes() {
        val user = IptvPlaylistSource(
            id = "m3u-1",
            name = "Mine",
            kind = IptvSourceKind.M3U,
            url = "https://example.com/list.m3u",
        )
        val staleBuiltin = BuiltinUsaChannels.source(lastRefreshedAtEpochMs = 42L)
        val merged = BuiltinUsaChannels.mergeInto(listOf(user, staleBuiltin))
        assertEquals(2, merged.size)
        assertEquals(BuiltinUsaChannels.SourceId, merged.first().id)
        assertEquals(42L, merged.first().lastRefreshedAtEpochMs)
        assertEquals("m3u-1", merged[1].id)
    }

    @Test
    fun isBuiltin_matchesSourceId() {
        assertTrue(BuiltinUsaChannels.isBuiltin(BuiltinUsaChannels.SourceId))
        assertFalse(BuiltinUsaChannels.isBuiltin("m3u-other"))
        assertTrue(BuiltinUsaChannels.isBuiltin(BuiltinUsaChannels.source()))
    }

    @Test
    fun curatedSnippet_parsesAsUsaPublicSource() {
        val playlist = """
            #EXTM3U
            #EXTINF:-1 tvg-id="ABCNews.us" group-title="USA",ABC News
            https://example.com/abc-news.m3u8
            #EXTINF:-1 tvg-id="Buzzr.us" group-title="USA",Buzzr
            https://example.com/buzzr.m3u8
        """.trimIndent()
        val channels = M3uPlaylistParser.parse(playlist, BuiltinUsaChannels.SourceId)
        assertEquals(2, channels.size)
        assertTrue(channels.all { it.sourceId == BuiltinUsaChannels.SourceId })
        assertEquals("USA", channels[0].groupTitle)
    }
}
