package com.nuvio.app.features.iptv

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class M3uPlaylistParserTest {
    @Test
    fun parsesExtinfAttributesAndUrls() {
        val playlist = """
            #EXTM3U
            #EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One" tvg-logo="https://example.com/bbc.png" group-title="UK",BBC One HD
            https://example.com/bbc1.m3u8
            #EXTINF:-1 group-title="Sports",ESPN
            https://example.com/espn.ts
        """.trimIndent()

        val channels = M3uPlaylistParser.parse(playlist, sourceId = "src-1")

        assertEquals(2, channels.size)
        assertEquals("BBC One HD", channels[0].name)
        assertEquals("https://example.com/bbc1.m3u8", channels[0].streamUrl)
        assertEquals("https://example.com/bbc.png", channels[0].logoUrl)
        assertEquals("UK", channels[0].groupTitle)
        assertEquals("bbc1.uk", channels[0].tvgId)
        assertEquals("src-1", channels[0].sourceId)
        assertEquals("ESPN", channels[1].name)
        assertEquals("Sports", channels[1].groupTitle)
    }

    @Test
    fun ignoresCommentsWithoutExtinf() {
        val playlist = """
            #EXTM3U
            # comment
            https://example.com/orphan.m3u8
        """.trimIndent()

        val channels = M3uPlaylistParser.parse(playlist, sourceId = "src")
        assertEquals(1, channels.size)
        assertTrue(channels[0].name.startsWith("Channel"))
    }
}
