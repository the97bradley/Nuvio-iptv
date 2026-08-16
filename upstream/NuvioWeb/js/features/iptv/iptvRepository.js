import { IptvStore } from "./iptvStore.js";
import { parseM3uPlaylist } from "./m3uPlaylistParser.js";
import { StalkerPortalClient, normalizeMac } from "./stalkerPortalClient.js";
import { XtreamCodesClient, normalizeServerBase } from "./xtreamCodesClient.js";
import {
  EPG_MAX_XML_BYTES,
  EPG_REFRESH_INTERVAL_MS,
  EPG_WINDOW_MS,
  channelMatchesProgramQuery,
  normalizeProgram,
  programmesForChannel
} from "./iptvEpg.js";
import { parseXmltvProgrammes } from "./xmltvParser.js";

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
    starredChannelIds: {},
    epgByChannelId: {},
    epgIsLoading: false,
    epgLastRefreshedAt: null,
    epgError: null,
    ...partial
  };
}

function xtreamStreamId(channel) {
  const parts = String(channel?.id || "").split(":");
  return parts.length >= 3 ? parts[parts.length - 1] : null;
}

function stalkerChannelId(channel) {
  const parts = String(channel?.id || "").split(":");
  return parts.length >= 3 ? parts[parts.length - 1] : null;
}

export const IptvRepository = {
  UNGROUPED,
  _state: createState(),
  _channelCache: new Map(),
  _stalkerClients: new Map(),
  _listeners: new Set(),
  _epgTimer: null,
  _epgRefreshPromise: null,
  _epgRefreshQueued: false,

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

  _persist(sources = this._state.sources, selectedSourceId = this._state.selectedSourceId) {
    return IptvStore.save(sources, selectedSourceId, this._state.starredChannelIds);
  },

  starredIdsFor(sourceId) {
    const list = this._state.starredChannelIds?.[sourceId];
    return Array.isArray(list) ? list : [];
  },

  starredCount(sourceId) {
    return this.starredIdsFor(sourceId).length;
  },

  isStarred(channel) {
    if (!channel?.id || !channel?.sourceId) return false;
    return this.starredIdsFor(channel.sourceId).includes(channel.id);
  },

  programmesFor(channelId) {
    return programmesForChannel(this._state.epgByChannelId, channelId);
  },

  toggleStar(channel) {
    if (!channel?.id || !channel?.sourceId) return false;
    const sourceId = channel.sourceId;
    const current = new Set(this.starredIdsFor(sourceId));
    const starring = !current.has(channel.id);
    if (current.has(channel.id)) current.delete(channel.id);
    else current.add(channel.id);
    const nextStarred = { ...this._state.starredChannelIds };
    const ids = [...current];
    if (ids.length) nextStarred[sourceId] = ids;
    else delete nextStarred[sourceId];
    let nextEpg = this._state.epgByChannelId;
    if (!starring && nextEpg?.[channel.id]) {
      nextEpg = { ...nextEpg };
      delete nextEpg[channel.id];
    }
    this._update({ starredChannelIds: nextStarred, epgByChannelId: nextEpg });
    this._persist();
    const cached = this._channelCache.get(sourceId);
    if (cached && this._state.selectedSourceId === sourceId) {
      this.publishChannels(cached);
    } else {
      const selectedCache = this._channelCache.get(this._state.selectedSourceId);
      if (selectedCache) this.publishChannels(selectedCache);
    }
    if (starring) this.queueEpgRefresh();
    else if (!Object.keys(nextStarred).length) this.stopEpgAutoRefresh();
    return starring;
  },

  setStarred(channel, starred) {
    if (!channel?.id || !channel?.sourceId) return;
    const currently = this.isStarred(channel);
    if (Boolean(starred) === currently) return;
    this.toggleStar(channel);
  },

  /** Live view: starred channels only (+ source / group / channel+program search). */
  filteredChannels(state = this._state) {
    let list = state.channels.filter((channel) => this.isStarred(channel));
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
    return list.filter((channel) => {
      if (channel.name.toLowerCase().includes(query)) return true;
      if (
        String(channel.groupTitle || "")
          .toLowerCase()
          .includes(query)
      ) {
        return true;
      }
      return channelMatchesProgramQuery(programmesForChannel(state.epgByChannelId, channel.id), query);
    });
  },

  /** Settings playlist editor: all channels for a source (not only starred). */
  catalogChannels(sourceId, { query = "", starredOnly = false } = {}) {
    const all = this._channelCache.get(sourceId) || [];
    const q = String(query || "").trim().toLowerCase();
    return all.filter((channel) => {
      if (starredOnly && !this.isStarred(channel)) return false;
      if (!q) return true;
      return (
        channel.name.toLowerCase().includes(q) ||
        String(channel.groupTitle || "")
          .toLowerCase()
          .includes(q)
      );
    });
  },

  sourcesWithStars(state = this._state) {
    return state.sources.filter((source) => this.starredCount(source.id) > 0);
  },

  async ensureLoaded() {
    if (this._state.isLoaded) {
      this.startEpgAutoRefresh();
      return this._state;
    }
    const state = await this.refreshFromStorage();
    this.startEpgAutoRefresh();
    return state;
  },

  async refreshFromStorage() {
    const payload = IptvStore.load();
    const sources = payload.sources;
    const selected = payload.selectedSourceId || sources[0]?.id || null;
    this._channelCache.clear();
    this._stalkerClients.clear();
    this._update(
      createState({
        sources,
        selectedSourceId: selected,
        starredChannelIds: payload.starredChannelIds || {},
        isLoaded: true
      })
    );
    this._persist(sources, selected);
    if (selected) {
      await this.loadChannelsForSource(selected, false);
    }
    this.queueEpgRefresh();
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
    this._persist(this._state.sources, sourceId);
    this._update({
      selectedSourceId: sourceId,
      selectedGroupTitle: null,
      query: "",
      errorMessage: null
    });
    await this.loadChannelsForSource(sourceId, false);
    this.queueEpgRefresh();
  },

  async addM3uSource(name, url, epgUrl = null) {
    const trimmedUrl = String(url || "").trim();
    if (!trimmedUrl) {
      this._update({ errorMessage: "Playlist URL is required." });
      return null;
    }
    const trimmedEpg = String(epgUrl || "").trim() || null;
    return this.persistAndLoad({
      id: randomId("m3u"),
      name: String(name || "").trim() || "M3U Playlist",
      kind: "M3U",
      url: trimmedUrl,
      username: null,
      password: null,
      macAddress: null,
      epgUrl: trimmedEpg,
      lastRefreshedAtEpochMs: null
    });
  },

  async addStalkerSource(name, portalUrl, macAddress) {
    let mac;
    try {
      mac = normalizeMac(macAddress);
    } catch (error) {
      this._update({ errorMessage: error?.message || "Invalid MAC address." });
      return null;
    }
    const trimmedUrl = String(portalUrl || "").trim();
    if (!trimmedUrl) {
      this._update({ errorMessage: "Portal URL is required." });
      return null;
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
      return null;
    }
    if (!String(username || "").trim() || !String(password || "").trim()) {
      this._update({ errorMessage: "Xtream username and password are required." });
      return null;
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
    const nextStarred = { ...this._state.starredChannelIds };
    delete nextStarred[sourceId];
    const removedIds = new Set(
      (this._channelCache.get(sourceId) || [])
        .map((channel) => channel.id)
        .concat(this.starredIdsFor(sourceId))
    );
    const nextEpg = { ...this._state.epgByChannelId };
    for (const id of removedIds) delete nextEpg[id];
    this._channelCache.delete(sourceId);
    this._stalkerClients.delete(sourceId);
    this._update({
      sources,
      selectedSourceId: nextSelected,
      selectedGroupTitle: null,
      channels: [],
      groups: [],
      errorMessage: null,
      starredChannelIds: nextStarred,
      epgByChannelId: nextEpg
    });
    this._persist(sources, nextSelected);
    if (nextSelected) {
      await this.loadChannelsForSource(nextSelected, false);
    }
    this.queueEpgRefresh();
  },

  async refreshSelectedSource() {
    const sourceId = this._state.selectedSourceId;
    if (!sourceId) return false;
    this._stalkerClients.delete(sourceId);
    const ok = await this.loadChannelsForSource(sourceId, true);
    await this.refreshEpgForStarred({ force: true });
    return ok;
  },

  async resolvePlaybackUrl(channel) {
    const source = this._state.sources.find((item) => item.id === channel.sourceId);
    if (channel.playbackCmd && source?.kind === "Stalker") {
      return this.clientFor(source).createPlaybackUrl(channel.playbackCmd);
    }
    if (channel.streamUrl) return channel.streamUrl;
    throw new Error("This channel has no playable URL.");
  },

  /** @returns {Promise<string|null>} new source id on success */
  async persistAndLoad(source) {
    const sources = [...this._state.sources, source];
    this._update({
      sources,
      selectedSourceId: source.id,
      selectedGroupTitle: null,
      query: "",
      errorMessage: null
    });
    this._persist(sources, source.id);
    const ok = await this.loadChannelsForSource(source.id, true);
    return ok ? source.id : null;
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
      let detectedEpgUrl = source.epgUrl || null;
      if (source.kind === "M3U") {
        const parsed = await this.fetchM3uChannels(source);
        channels = parsed.channels;
        if (parsed.epgUrl) detectedEpgUrl = parsed.epgUrl;
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
      const validIds = new Set(channels.map((channel) => channel.id));
      const keptStars = this.starredIdsFor(sourceId).filter((id) => validIds.has(id));
      const nextStarred = { ...this._state.starredChannelIds };
      if (keptStars.length) nextStarred[sourceId] = keptStars;
      else delete nextStarred[sourceId];
      const refreshed = {
        ...source,
        epgUrl: detectedEpgUrl || source.epgUrl || null,
        lastRefreshedAtEpochMs: Date.now()
      };
      const sources = this._state.sources.map((item) => (item.id === sourceId ? refreshed : item));
      this._update({
        sources,
        isLoading: false,
        errorMessage: null,
        starredChannelIds: nextStarred
      });
      this._persist(sources, this._state.selectedSourceId);
      this.publishChannels(channels);
      this.queueEpgRefresh();
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
    const groups = groupChannels(channels.filter((channel) => this.isStarred(channel)));
    const selectedGroupTitle = this._state.selectedGroupTitle;
    this._update({
      channels,
      groups,
      selectedGroupTitle: groups.some((group) => group.title === selectedGroupTitle)
        ? selectedGroupTitle
        : null
    });
  },

  startEpgAutoRefresh() {
    if (this._epgTimer) return;
    this.queueEpgRefresh();
    this._epgTimer = setInterval(() => {
      this.queueEpgRefresh({ force: true });
    }, EPG_REFRESH_INTERVAL_MS);
  },

  stopEpgAutoRefresh() {
    if (this._epgTimer) {
      clearInterval(this._epgTimer);
      this._epgTimer = null;
    }
  },

  queueEpgRefresh(options = {}) {
    this._epgRefreshQueued = true;
    if (this._epgRefreshPromise) return this._epgRefreshPromise;
    this._epgRefreshPromise = Promise.resolve()
      .then(async () => {
        while (this._epgRefreshQueued) {
          this._epgRefreshQueued = false;
          await this.refreshEpgForStarred(options);
        }
      })
      .finally(() => {
        this._epgRefreshPromise = null;
      });
    return this._epgRefreshPromise;
  },

  async refreshEpgForStarred({ force = false } = {}) {
    const starredChannels = [];
    for (const source of this._state.sources) {
      const ids = this.starredIdsFor(source.id);
      if (!ids.length) continue;
      let channels = this._channelCache.get(source.id);
      if (!channels) {
        await this.loadChannelsForSource(source.id, false);
        channels = this._channelCache.get(source.id) || [];
      }
      for (const channel of channels) {
        if (ids.includes(channel.id)) starredChannels.push({ source, channel });
      }
    }

    if (!starredChannels.length) {
      if (Object.keys(this._state.epgByChannelId || {}).length) {
        this._update({ epgByChannelId: {}, epgError: null, epgIsLoading: false });
      }
      return;
    }

    const last = this._state.epgLastRefreshedAt;
    if (!force && last && Date.now() - last < 60_000 && Object.keys(this._state.epgByChannelId).length) {
      return;
    }

    this._update({ epgIsLoading: true, epgError: null });
    const windowStartMs = Date.now() - 60 * 60 * 1000;
    const windowEndMs = Date.now() + EPG_WINDOW_MS;
    const nextEpg = { ...this._state.epgByChannelId };
    const keepIds = new Set(starredChannels.map(({ channel }) => channel.id));
    for (const key of Object.keys(nextEpg)) {
      if (!keepIds.has(key)) delete nextEpg[key];
    }

    const bySource = new Map();
    for (const entry of starredChannels) {
      if (!bySource.has(entry.source.id)) bySource.set(entry.source.id, []);
      bySource.get(entry.source.id).push(entry);
    }

    const errors = [];
    for (const [, entries] of bySource) {
      const source = entries[0].source;
      try {
        if (source.kind === "M3U") {
          await this._refreshM3uEpg(source, entries.map((e) => e.channel), nextEpg, {
            windowStartMs,
            windowEndMs
          });
        } else if (source.kind === "Xtream") {
          const client = new XtreamCodesClient(
            source.url,
            source.username || "",
            source.password || ""
          );
          for (const { channel } of entries) {
            const streamId = xtreamStreamId(channel);
            if (!streamId) continue;
            try {
              const programmes = await client.fetchStreamEpg(streamId, {
                windowStartMs,
                windowEndMs
              });
              nextEpg[channel.id] = programmes.map((program) =>
                normalizeProgram({ ...program, channelId: channel.id })
              ).filter(Boolean);
            } catch (error) {
              errors.push(error?.message || String(error));
            }
          }
        } else if (source.kind === "Stalker") {
          const client = this.clientFor(source);
          for (const { channel } of entries) {
            const portalId = stalkerChannelId(channel);
            if (!portalId) continue;
            try {
              const programmes = await client.fetchChannelEpg(portalId, {
                windowStartMs,
                windowEndMs
              });
              nextEpg[channel.id] = programmes.map((program) =>
                normalizeProgram({ ...program, channelId: channel.id })
              ).filter(Boolean);
            } catch (error) {
              errors.push(error?.message || String(error));
            }
          }
        }
      } catch (error) {
        errors.push(error?.message || String(error));
      }
    }

    this._update({
      epgByChannelId: nextEpg,
      epgIsLoading: false,
      epgLastRefreshedAt: Date.now(),
      epgError: errors.length ? errors[0] : null
    });
  },

  async _refreshM3uEpg(source, channels, nextEpg, { windowStartMs, windowEndMs }) {
    const epgUrl = String(source.epgUrl || "").trim();
    if (!epgUrl) {
      for (const channel of channels) nextEpg[channel.id] = nextEpg[channel.id] || [];
      return;
    }
    const response = await fetch(epgUrl, { method: "GET", redirect: "follow" });
    if (!response.ok) {
      throw new Error(`EPG request failed (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > EPG_MAX_XML_BYTES) {
      throw new Error("EPG file is too large to load.");
    }
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const tvgIds = new Set(
      channels.map((channel) => channel.tvgId || channel.id).filter(Boolean)
    );
    const programmes = parseXmltvProgrammes(xml, {
      channelIds: tvgIds,
      windowStartMs,
      windowEndMs
    });
    const byTvg = new Map();
    for (const program of programmes) {
      if (!byTvg.has(program.channelId)) byTvg.set(program.channelId, []);
      byTvg.get(program.channelId).push(program);
    }
    for (const channel of channels) {
      const key = channel.tvgId || channel.id;
      const list = byTvg.get(key) || [];
      nextEpg[channel.id] = list.map((program) =>
        normalizeProgram({ ...program, channelId: channel.id })
      ).filter(Boolean);
    }
  }
};
