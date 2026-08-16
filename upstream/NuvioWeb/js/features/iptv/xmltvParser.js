/**
 * Lightweight XMLTV programme parser (no DOM dependency).
 * Keeps programmes overlapping [windowStartMs, windowEndMs].
 */

const PROGRAMME_RE =
  /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
const ATTR_RE = /([\w:.-]+)="([^"]*)"/g;
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const DESC_RE = /<desc\b[^>]*>([\s\S]*?)<\/desc>/i;

function decodeXmlEntities(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Parse XMLTV timestamp like "20240101120000 +0000" or "20240101120000".
 * @returns {number|null} epoch ms
 */
export function parseXmltvTime(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const match = text.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}|[+-]\d{2}:\d{2}|Z))?/
  );
  if (!match) {
    const asNum = Number(text);
    if (Number.isFinite(asNum) && asNum > 1e11) return asNum;
    if (Number.isFinite(asNum) && asNum > 1e9) return asNum * 1000;
    return null;
  }
  const [, y, mo, d, h, mi, s, tzRaw] = match;
  let offsetMinutes = 0;
  if (tzRaw && tzRaw !== "Z") {
    const tz = tzRaw.replace(":", "");
    const sign = tz.startsWith("-") ? -1 : 1;
    const hh = Number(tz.slice(1, 3));
    const mm = Number(tz.slice(3, 5) || "0");
    offsetMinutes = sign * (hh * 60 + mm);
  }
  const utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  return utcMs - offsetMinutes * 60_000;
}

function attrsFrom(tagAttrs) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(tagAttrs)) !== null) {
    out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

/**
 * @param {string} xml
 * @param {{ channelIds?: Set<string>, windowStartMs?: number, windowEndMs?: number }} [options]
 * @returns {{ channelId: string, title: string, description: string|null, startMs: number, endMs: number }[]}
 */
export function parseXmltvProgrammes(xml, options = {}) {
  const channelFilter = options.channelIds || null;
  const windowStart = Number.isFinite(options.windowStartMs) ? options.windowStartMs : 0;
  const windowEnd = Number.isFinite(options.windowEndMs)
    ? options.windowEndMs
    : Number.POSITIVE_INFINITY;
  const programmes = [];
  PROGRAMME_RE.lastIndex = 0;
  let match;
  while ((match = PROGRAMME_RE.exec(String(xml || ""))) !== null) {
    const attrs = attrsFrom(match[1] || "");
    const channelId = String(attrs.channel || "").trim();
    if (!channelId) continue;
    if (channelFilter && !channelFilter.has(channelId)) continue;
    const startMs = parseXmltvTime(attrs.start);
    const endMs = parseXmltvTime(attrs.stop);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    if (endMs < windowStart || startMs > windowEnd) continue;
    const body = match[2] || "";
    const titleMatch = TITLE_RE.exec(body);
    const title = decodeXmlEntities(titleMatch?.[1] || "").trim() || "Programme";
    const descMatch = DESC_RE.exec(body);
    const description = decodeXmlEntities(descMatch?.[1] || "").trim() || null;
    programmes.push({
      channelId,
      title,
      description,
      startMs,
      endMs
    });
  }
  programmes.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return programmes;
}

/** Extract url-tvg / x-tvg-url from an M3U header line or blob. */
export function extractM3uEpgUrl(content) {
  const header = String(content || "")
    .split(/\r?\n/)
    .find((line) => line.trim().toUpperCase().startsWith("#EXTM3U"));
  if (!header) return null;
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(header)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  const url = attrs["url-tvg"] || attrs["x-tvg-url"] || attrs["tvg-url"] || "";
  const first = String(url)
    .split(",")
    .map((part) => part.trim())
    .find((part) => /^https?:\/\//i.test(part));
  return first || null;
}
