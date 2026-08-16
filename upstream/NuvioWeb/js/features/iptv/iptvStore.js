import { LocalStore } from "../../core/storage/localStore.js";
import { BuiltinUsaChannels } from "./builtinUsaChannels.js";

const STORAGE_KEY = "iptvLiveSources";
const VALID_KINDS = new Set(["M3U", "Xtream", "Stalker"]);

function normalizeSource(raw = {}) {
  const id = String(raw?.id || "").trim();
  const url = String(raw?.url || "").trim();
  const kind = VALID_KINDS.has(String(raw?.kind || "")) ? String(raw.kind) : "M3U";
  if (!id || !url) return null;
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

function normalizePayload(raw = {}) {
  const sources = Array.isArray(raw?.sources)
    ? raw.sources.map(normalizeSource).filter(Boolean)
    : [];
  return {
    sources: BuiltinUsaChannels.mergeInto(sources),
    selectedSourceId: raw?.selectedSourceId == null ? null : String(raw.selectedSourceId)
  };
}

export const IptvStore = {
  load() {
    const payload = normalizePayload(LocalStore.get(STORAGE_KEY, { sources: [], selectedSourceId: null }));
    return payload;
  },

  save(sources, selectedSourceId) {
    const payload = normalizePayload({ sources, selectedSourceId });
    LocalStore.set(STORAGE_KEY, payload);
    return payload;
  }
};
