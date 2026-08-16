package com.nuvio.app.features.iptv

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Lightweight XMLTV helpers for IPTV programme guides.
 */
object XmltvParser {
    private val programmeRegex =
        Regex("""<programme\b([^>]*)>([\s\S]*?)</programme>""", RegexOption.IGNORE_CASE)
    private val attrRegex = Regex("""([\w:.-]+)="([^"]*)"""")
    private val titleRegex = Regex("""<title\b[^>]*>([\s\S]*?)</title>""", RegexOption.IGNORE_CASE)
    private val descRegex = Regex("""<desc\b[^>]*>([\s\S]*?)</desc>""", RegexOption.IGNORE_CASE)
    private val timeRegex =
        Regex("""^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}|[+-]\d{2}:\d{2}|Z))?""")

    fun extractM3uEpgUrl(content: String): String? {
        val header = content.lineSequence()
            .map { it.trim() }
            .firstOrNull { it.startsWith("#EXTM3U", ignoreCase = true) }
            ?: return null
        val attrs = attrRegex.findAll(header).associate { it.groupValues[1].lowercase() to it.groupValues[2] }
        val raw = attrs["url-tvg"] ?: attrs["x-tvg-url"] ?: attrs["tvg-url"] ?: return null
        return raw.split(',')
            .map { it.trim() }
            .firstOrNull { it.startsWith("http://") || it.startsWith("https://") }
    }

    fun parseXmltvTime(raw: String?): Long? {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return null
        val match = timeRegex.find(text)
        if (match != null) {
            val y = match.groupValues[1].toInt()
            val mo = match.groupValues[2].toInt()
            val d = match.groupValues[3].toInt()
            val h = match.groupValues[4].toInt()
            val mi = match.groupValues[5].toInt()
            val s = match.groupValues[6].toInt()
            var offsetMinutes = 0
            val tzRaw = match.groupValues.getOrNull(7).orEmpty()
            if (tzRaw.isNotEmpty() && tzRaw != "Z") {
                val tz = tzRaw.replace(":", "")
                val sign = if (tz.startsWith("-")) -1 else 1
                val hh = tz.drop(1).take(2).toIntOrNull() ?: 0
                val mm = tz.drop(3).take(2).toIntOrNull() ?: 0
                offsetMinutes = sign * (hh * 60 + mm)
            }
            val utcMs = daysToEpochMs(y, mo, d) + ((h * 3600L) + (mi * 60L) + s) * 1000L
            return utcMs - offsetMinutes * 60_000L
        }
        val asNum = text.toLongOrNull() ?: return null
        return when {
            asNum > 1_000_000_000_000L -> asNum
            asNum > 1_000_000_000L -> asNum * 1000
            else -> null
        }
    }

    fun parseProgrammes(
        xml: String,
        channelIds: Set<String>? = null,
        windowStartMs: Long = 0L,
        windowEndMs: Long = Long.MAX_VALUE,
    ): List<IptvProgram> {
        val out = ArrayList<IptvProgram>()
        for (match in programmeRegex.findAll(xml)) {
            val attrs = attrRegex.findAll(match.groupValues[1]).associate {
                it.groupValues[1].lowercase() to it.groupValues[2]
            }
            val channelId = attrs["channel"]?.trim().orEmpty()
            if (channelId.isEmpty()) continue
            if (channelIds != null && channelId !in channelIds) continue
            val startMs = parseXmltvTime(attrs["start"]) ?: continue
            val endMs = parseXmltvTime(attrs["stop"]) ?: continue
            if (endMs <= startMs) continue
            if (endMs < windowStartMs || startMs > windowEndMs) continue
            val body = match.groupValues[2]
            val title = decodeXml(titleRegex.find(body)?.groupValues?.getOrNull(1)).ifBlank { "Programme" }
            val description = decodeXml(descRegex.find(body)?.groupValues?.getOrNull(1)).ifBlank { null }
            out += IptvProgram(
                channelId = channelId,
                title = title,
                description = description,
                startMs = startMs,
                endMs = endMs,
            )
        }
        return out.sortedWith(compareBy({ it.startMs }, { it.endMs }))
    }

    private fun decodeXml(raw: String?): String {
        var text = raw.orEmpty()
        text = text.replace(Regex("""<!\[CDATA\[([\s\S]*?)]]>"""), "$1")
        text = text.replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&amp;", "&")
        return text.trim()
    }

    /** Civil UTC date → epoch ms without java.time (KMP-safe). */
    private fun daysToEpochMs(year: Int, month: Int, day: Int): Long {
        // Algorithm from civil_from_days / days_from_civil
        val y = if (month <= 2) year - 1 else year
        val era = (if (y >= 0) y else y - 399) / 400
        val yoe = y - era * 400
        val mp = month + if (month > 2) -3 else 9
        val doy = (153 * mp + 2) / 5 + day - 1
        val doe = yoe * 365L + yoe / 4 - yoe / 100 + doy
        val days = era * 146097L + doe - 719468L
        return days * 86_400_000L
    }
}

object IptvEpg {
    const val WindowMs = 7L * 24 * 60 * 60 * 1000
    const val RefreshIntervalMs = 30L * 60 * 1000
    const val MaxXmlBytes = 24 * 1024 * 1024

    @OptIn(ExperimentalEncodingApi::class)
    fun decodeMaybeBase64(raw: String?): String {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return ""
        if (text.matches(Regex("^[A-Za-z0-9+/]+=*$")) && text.length % 4 == 0 && text.length >= 8) {
            runCatching {
                val decoded = Base64.decode(text).decodeToString().trim()
                if (decoded.isNotEmpty()) return decoded
            }
        }
        return text
    }

    fun parseLooseTime(raw: Any?): Long? {
        when (raw) {
            null -> return null
            is Number -> {
                val n = raw.toLong()
                return if (n > 1_000_000_000_000L) n else n * 1000
            }
        }
        val text = raw.toString().trim()
        if (text.isEmpty()) return null
        text.toLongOrNull()?.let { n ->
            return if (n > 1_000_000_000_000L) n else n * 1000
        }
        // "2024-01-01 12:00:00" / ISO-ish → treat as UTC by stripping separators into XMLTV form
        val digits = text.filter { it.isDigit() }
        if (digits.length >= 14) {
            return XmltvParser.parseXmltvTime(digits.take(14) + " +0000")
        }
        return XmltvParser.parseXmltvTime(text)
    }

    fun nowPlaying(programmes: List<IptvProgram>, nowMs: Long): IptvProgram? {
        return programmes.firstOrNull { it.startMs <= nowMs && nowMs < it.endMs }
    }

    fun nextProgram(programmes: List<IptvProgram>, after: IptvProgram): IptvProgram? {
        return programmes.firstOrNull { it.startMs >= after.endMs }
    }

    fun matchesQuery(programmes: List<IptvProgram>, query: String): Boolean {
        val q = query.trim()
        if (q.isEmpty()) return true
        return programmes.any {
            it.title.contains(q, ignoreCase = true) ||
                (it.description?.contains(q, ignoreCase = true) == true)
        }
    }

    fun formatClock(ms: Long): String {
        val totalMinutes = ((ms % 86_400_000L) + 86_400_000L) % 86_400_000L / 60_000L
        val h = (totalMinutes / 60).toInt()
        val m = (totalMinutes % 60).toInt()
        val hh = if (h < 10) "0$h" else "$h"
        val mm = if (m < 10) "0$m" else "$m"
        return "$hh:$mm"
    }
}
