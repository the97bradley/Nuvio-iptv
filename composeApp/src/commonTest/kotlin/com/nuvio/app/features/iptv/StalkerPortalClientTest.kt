package com.nuvio.app.features.iptv

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class StalkerPortalClientTest {
    @Test
    fun normalizesMacAddress() {
        assertEquals("00:1A:79:12:34:56", StalkerPortalClient.normalizeMac("00:1a:79:12:34:56"))
        assertEquals("00:1A:79:12:34:56", StalkerPortalClient.normalizeMac("00-1A-79-12-34-56"))
        assertEquals("00:1A:79:12:34:56", StalkerPortalClient.normalizeMac("001a79123456"))
    }

    @Test
    fun rejectsInvalidMac() {
        assertFailsWith<IllegalArgumentException> {
            StalkerPortalClient.normalizeMac("00:1A:79")
        }
    }

    @Test
    fun stripsCommonPortalSuffixes() {
        assertEquals(
            "http://portal.example.com:8080",
            StalkerPortalClient.normalizePortalBase("http://portal.example.com:8080/c/"),
        )
        assertEquals(
            "http://portal.example.com:8080",
            StalkerPortalClient.normalizePortalBase("http://portal.example.com:8080/stalker_portal/c"),
        )
        assertEquals(
            "https://tv.example.com",
            StalkerPortalClient.normalizePortalBase("https://tv.example.com/portal.php"),
        )
    }
}
