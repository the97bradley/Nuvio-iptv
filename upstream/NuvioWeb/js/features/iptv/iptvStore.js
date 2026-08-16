import { LocalStore } from "../../core/storage/localStore.js";

const STORAGE_KEY = "iptvLiveSources";
const VALID_KINDS = new Set(["M3U", "Xtream", "Stalker"]);
const REMOVED_BUILTIN_ID = "builtin-usa-public";

function normalizeSource(raw = {}) {
  const id = String(raw?.id || "").trim();
  const url = String(raw?.url || "").trim();
  const kind = VALID_KINDS.has(String(raw?.kind || "")) ? String(raw.kind) : "M3U";
  if (!id || !url) return null;
  if (id === REMOVED_BUILTIN_ID) return null;
  return {
    id,
    name: String(raw?.name || "").trim() || "Playlist",
    kind,
    url,
    username: raw?.username == null ? null : String(raw.username),
    password: raw?.password == null ? null : String(raw.password),
    macAddress: raw?.macAddress == null ? null : String(raw.macAddress),
    epgUrl: raw?.epgUrl == null ? null : String(raw.epgUrl),
    lastRefreshedAtEpochMs:
      raw?.lastRefreshedAtEpochMs == null ? null : Number(raw.lastRefreshedAtEpochMs) || null
  };
}

function normalizeStarred(raw = {}, validSourceIds = new Set()) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [sourceId, ids] of Object.entries(raw)) {
    if (validSourceIds.size && !validSourceIds.has(sourceId)) continue;
    const list = Array.isArray(ids)
      ? [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (list.length) out[sourceId] = list;
  }
  return out;
}

function normalizePayload(raw = {}) {
  const sources = Array.isArray(raw?.sources)
    ? raw.sources.map(normalizeSource).filter(Boolean)
    : [];
  const sourceIds = new Set(sources.map((source) => source.id));
  const selectedSourceId =
    raw?.selectedSourceId == null ? null : String(raw.selectedSourceId);
  return {
    sources,
    selectedSourceId: sources.some((source) => source.id === selectedSourceId)
      ? selectedSourceId
      : sources[0]?.id || null,
    starredChannelIds: normalizeStarred(raw?.starredChannelIds, sourceIds)
  };
}

export const IptvStore = {
  load() {
    return normalizePayload(
      LocalStore.get(STORAGE_KEY, {
        sources: [],
        selectedSourceId: null,
        starredChannelIds: {}
      })
    );
  },

  save(sources, selectedSourceId, starredChannelIds = {}) {
    const payload = normalizePayload({ sources, selectedSourceId, starredChannelIds });
    LocalStore.set(STORAGE_KEY, payload);
    return payload;
  }
};
