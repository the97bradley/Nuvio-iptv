package com.nuvio.app.features.iptv

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class XtreamCodesClientTest {
    @Test
    fun normalizesServerBase() {
        assertEquals(
            "http://dns.example.com:8080",
            XtreamCodesClient.normalizeServerBase("http://dns.example.com:8080/"),
        )
        assertEquals(
            "http://dns.example.com:8080",
            XtreamCodesClient.normalizeServerBase(
                "http://dns.example.com:8080/player_api.php?username=a&password=b",
            ),
        )
        assertEquals(
            "https://iptv.example.com",
            XtreamCodesClient.normalizeServerBase("https://iptv.example.com/get.php"),
        )
    }

    @Test
    fun rejectsNonHttpServer() {
        assertFailsWith<IllegalArgumentException> {
            XtreamCodesClient.normalizeServerBase("dns.example.com:8080")
        }
    }
}
