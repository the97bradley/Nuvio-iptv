import { IptvStore } from "./iptvStore.js";
import { parseM3uPlaylist } from "./m3uPlaylistParser.js";
import { StalkerPortalClient, normalizeMac } from "./stalkerPortalClient.js";
import { XtreamCodesClient, normalizeServerBase } from "./xtreamCodesClient.js";

const UNGROUPED = "Ungrouped";

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
}

function groupChannels(channels) {
  const map = new Map();
  for (const channel of channels) {
    const title = String(channel.groupTitle || "").trim() || UNGROUPED;
    if (!map.has(title)) map.set(title, []);
    map.get(title).push(channel);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([title, items]) => ({
      title,
      channels: items
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    }));
}

function createState(partial = {}) {
  return {
    sources: [],
    channels: [],
    groups: [],
    selectedSourceId: null,
    selectedGroupTitle: null,
    query: "",
    isLoading: false,
    errorMessage: null,
    isLoaded: false,
    ...partial
  };
}

export const IptvRepository = {
  UNGROUPED,
  _state: createState(),
  _channelCache: new Map(),
  _stalkerClients: new Map(),
  _listeners: new Set(),

  getState() {
    return this._state;
  },

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  },

  _emit() {
    for (const listener of this._listeners) {
      try {
        listener(this._state);
      } catch (error) {
        console.warn("IPTV listener failed", error);
      }
    }
  },

  _update(partial) {
    this._state = { ...this._state, ...partial };
    this._emit();
  },

  filteredChannels(state = this._state) {
    let list = state.channels;
    if (state.selectedSourceId) {
      list = list.filter((channel) => channel.sourceId === state.selectedSourceId);
    }
    if (state.selectedGroupTitle) {
      list = list.filter(
        (channel) => (channel.groupTitle || UNGROUPED) === state.selectedGroupTitle
      );
    }
    const query = String(state.query || "").trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (channel) =>
        channel.name.toLowerCase().includes(query) ||
        String(channel.groupTitle || "")
          .toLowerCase()
          .includes(query)
    );
  },

  async ensureLoaded() {
    if (this._state.isLoaded) return this._state;
    return this.refreshFromStorage();
  },

  async refreshFromStorage() {
    const payload = IptvStore.load();
    const sources = payload.sources;
    const selected = payload.selectedSourceId || sources[0]?.id || null;
    IptvStore.save(sources, selected);
    this._channelCache.clear();
    this._stalkerClients.clear();
    this._update(
      createState({
        sources,
        selectedSourceId: selected,
        isLoaded: true
      })
    );
    if (selected) {
      await this.loadChannelsForSource(selected, false);
    }
    return this._state;
  },

  setQuery(query) {
    this._update({ query: String(query || "") });
  },

  selectGroup(groupTitle) {
    this._update({ selectedGroupTitle: groupTitle || null });
  },

  async selectSource(sourceId) {
    if (!this._state.sources.some((source) => source.id === sourceId)) return;
    IptvStore.save(this._state.sources, sourceId);
    this._update({
      selectedSourceId: sourceId,
      selectedGroupTitle: null,
      query: "",
      errorMessage: null
    });
    await this.loadChannelsForSource(sourceId, false);
  },

  async addM3uSource(name, url) {
    const trimmedUrl = String(url || "").trim();
    if (!trimmedUrl) {
      this._update({ errorMessage: "Playlist URL is required." });
      return false;
    }
    return this.persistAndLoad({
      id: randomId("m3u"),
      name: String(name || "").trim() || "M3U Playlist",
      kind: "M3U",
      url: trimmedUrl,
      username: null,
      password: null,
      macAddress: null,
      epgUrl: null,
      lastRefreshedAtEpochMs: null
    });
  },

  async addStalkerSource(name, portalUrl, macAddress) {
    let mac;
    try {
      mac = normalizeMac(macAddress);
    } catch (error) {
      this._update({ errorMessage: error?.message || "Invalid MAC address." });
      return false;
    }
    const trimmedUrl = String(portalUrl || "").trim();
    if (!trimmedUrl) {
      this._update({ errorMessage: "Portal URL is required." });
      return false;
    }
    return this.persistAndLoad({
      id: randomId("stalker"),
      name: String(name || "").trim() || "Stalker Portal",
      kind: "Stalker",
      url: trimmedUrl,
      username: null,
      password: null,
      macAddress: mac,
      epgUrl: null,
      lastRefreshedAtEpochMs: null
    });
  },

  async addXtreamSource(name, serverUrl, username, password) {
    let server;
    try {
      server = normalizeServerBase(serverUrl);
    } catch (error) {
      this._update({ errorMessage: error?.message || "Invalid server URL." });
      return false;
    }
    if (!String(username || "").trim() || !String(password || "").trim()) {
      this._update({ errorMessage: "Xtream username and password are required." });
      return false;
    }
    return this.persistAndLoad({
      id: randomId("xtream"),
      name: String(name || "").trim() || "Xtream Codes",
      kind: "Xtream",
      url: server,
      username: String(username).trim(),
      password: String(password),
      macAddress: null,
      epgUrl: null,
      lastRefreshedAtEpochMs: null
    });
  },

  async removeSource(sourceId) {
    const sources = this._state.sources.filter((source) => source.id !== sourceId);
    const nextSelected =
      this._state.selectedSourceId === sourceId
        ? sources[0]?.id || null
        : this._state.selectedSourceId;
    IptvStore.save(sources, nextSelected);
    this._channelCache.delete(sourceId);
    this._stalkerClients.delete(sourceId);
    this._update({
      sources,
      selectedSourceId: nextSelected,
      selectedGroupTitle: null,
      channels: [],
      groups: [],
      errorMessage: null
    });
    if (nextSelected) {
      await this.loadChannelsForSource(nextSelected, false);
    }
  },

  async refreshSelectedSource() {
    const sourceId = this._state.selectedSourceId;
    if (!sourceId) return false;
    this._stalkerClients.delete(sourceId);
    return this.loadChannelsForSource(sourceId, true);
  },

  async resolvePlaybackUrl(channel) {
    const source = this._state.sources.find((item) => item.id === channel.sourceId);
    if (channel.playbackCmd && source?.kind === "Stalker") {
      return this.clientFor(source).createPlaybackUrl(channel.playbackCmd);
    }
    if (channel.streamUrl) return channel.streamUrl;
    throw new Error("This channel has no playable URL.");
  },

  async persistAndLoad(source) {
    const sources = [...this._state.sources, source];
    IptvStore.save(sources, source.id);
    this._update({
      sources,
      selectedSourceId: source.id,
      selectedGroupTitle: null,
      query: "",
      errorMessage: null
    });
    return this.loadChannelsForSource(source.id, true);
  },

  async loadChannelsForSource(sourceId, forceNetwork) {
    const source = this._state.sources.find((item) => item.id === sourceId);
    if (!source) return false;
    if (!forceNetwork && this._channelCache.has(sourceId)) {
      this.publishChannels(this._channelCache.get(sourceId));
      return true;
    }

    this._update({ isLoading: true, errorMessage: null });
    try {
      let channels = [];
      if (source.kind === "M3U") {
        channels = await this.fetchM3uChannels(source);
      } else if (source.kind === "Stalker") {
        channels = await this.clientFor(source).loadChannels(source.id);
      } else if (source.kind === "Xtream") {
        channels = await new XtreamCodesClient(
          source.url,
          source.username || "",
          source.password || ""
        ).loadChannels(source.id);
      }
      this._channelCache.set(sourceId, channels);
      const refreshed = { ...source, lastRefreshedAtEpochMs: Date.now() };
      const sources = this._state.sources.map((item) => (item.id === sourceId ? refreshed : item));
      IptvStore.save(sources, this._state.selectedSourceId);
      this._update({ sources, isLoading: false, errorMessage: null });
      this.publishChannels(channels);
      return true;
    } catch (error) {
      this._update({
        isLoading: false,
        errorMessage: error?.message || "Failed to load playlist."
      });
      return false;
    }
  },

  clientFor(source) {
    if (!source.macAddress) {
      throw new Error("Stalker source is missing a MAC address.");
    }
    if (!this._stalkerClients.has(source.id)) {
      this._stalkerClients.set(source.id, new StalkerPortalClient(source.url, source.macAddress));
    }
    return this._stalkerClients.get(source.id);
  },

  async fetchM3uChannels(source) {
    const response = await fetch(source.url, { method: "GET", redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Playlist request failed (${response.status})`);
    }
    const body = await response.text();
    return parseM3uPlaylist(body, source.id);
  },

  publishChannels(channels) {
    const groups = groupChannels(channels);
    const selectedGroupTitle = this._state.selectedGroupTitle;
    this._update({
      channels,
      groups,
      selectedGroupTitle: groups.some((group) => group.title === selectedGroupTitle)
        ? selectedGroupTitle
        : null
    });
  }
};
