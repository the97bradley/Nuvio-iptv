/** Shared EPG helpers for Live IPTV. */

export const EPG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const EPG_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
export const EPG_MAX_XML_BYTES = 24 * 1024 * 1024;

export function decodeMaybeBase64(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  // Xtream often base64-encodes titles/descriptions.
  if (/^[A-Za-z0-9+/]+=*$/.test(text) && text.length % 4 === 0 && text.length >= 8) {
    try {
      const decoded =
        typeof atob === "function"
          ? atob(text)
          : Buffer.from(text, "base64").toString("utf8");
      if (decoded && /[\x20-\x7E\u00A0-\uFFFF]/.test(decoded)) {
        return decoded.trim();
      }
    } catch (_) {
      // fall through
    }
  }
  return text;
}

export function parseLooseTime(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n > 1e12 ? n : n * 1000;
  }
  const asDate = Date.parse(text.replace(" ", "T"));
  return Number.isFinite(asDate) ? asDate : null;
}

export function normalizeProgram(partial = {}) {
  const startMs = Number(partial.startMs);
  const endMs = Number(partial.endMs);
  const title = String(partial.title || "").trim();
  if (!title || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return {
    channelId: String(partial.channelId || ""),
    title,
    description: partial.description ? String(partial.description).trim() : null,
    startMs,
    endMs
  };
}

export function programmesForChannel(epgByChannelId, channelId) {
  const list = epgByChannelId?.[channelId];
  return Array.isArray(list) ? list : [];
}

export function nowPlaying(programmes, nowMs = Date.now()) {
  return (
    programmes.find((item) => item.startMs <= nowMs && nowMs < item.endMs) || null
  );
}

export function upcomingProgrammes(programmes, nowMs = Date.now(), limit = 3) {
  return programmes.filter((item) => item.endMs > nowMs).slice(0, limit);
}

export function channelMatchesProgramQuery(programmes, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  return programmes.some(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      String(item.description || "")
        .toLowerCase()
        .includes(q)
  );
}

export function formatEpgClock(ms, locale) {
  try {
    return new Date(ms).toLocaleTimeString(locale || undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
  } catch (_) {
    const d = new Date(ms);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}

export function formatNowNext(programmes, nowMs = Date.now()) {
  const current = nowPlaying(programmes, nowMs);
  if (!current) return null;
  const next = programmes.find((item) => item.startMs >= current.endMs) || null;
  return { current, next };
}
