import {
  decodeMaybeBase64,
  normalizeProgram,
  parseLooseTime
} from "./iptvEpg.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringField(obj, key) {
  const raw = obj?.[key];
  if (raw == null) return null;
  const text = String(raw).trim();
  return text && text !== "null" ? text : null;
}

export function normalizeServerBase(raw) {
  let url = String(raw || "").trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Server URL must start with http:// or https://");
  }
  url = url.replace(/\/+$/, "");
  const suffixes = ["/player_api.php", "/get.php", "/xmltv.php", "/panel_api.php"];
  for (const suffix of suffixes) {
    const index = url.toLowerCase().indexOf(suffix);
    if (index >= 0) {
      url = url.slice(0, index).replace(/\/+$/, "");
      break;
    }
  }
  const queryIndex = url.indexOf("?");
  if (queryIndex >= 0) {
    url = url.slice(0, queryIndex).replace(/\/+$/, "");
  }
  return url;
}

export class XtreamCodesClient {
  constructor(serverUrl, username, password, preferredExtension = "m3u8") {
    this.serverBase = normalizeServerBase(serverUrl);
    this.user = String(username || "").trim();
    this.pass = String(password || "").trim();
    this.preferredExtension = String(preferredExtension || "m3u8").replace(/^\./, "");
    if (!this.user || !this.pass) {
      throw new Error("Xtream username and password are required.");
    }
  }

  get playerApi() {
    return `${this.serverBase}/player_api.php`;
  }

  async loadChannels(sourceId) {
    await this.authenticate();
    const categories = await this.fetchLiveCategories();
    const streams = await this.fetchLiveStreams();
    return streams
      .map((item) => {
        const obj = asObject(item);
        if (!obj) return null;
        const streamId = stringField(obj, "stream_id");
        const name = stringField(obj, "name");
        if (!streamId || !name) return null;
        const categoryId = stringField(obj, "category_id");
        const group = categoryId ? categories[categoryId] || null : null;
        const direct = stringField(obj, "direct_source");
        const streamUrl =
          direct && (direct.startsWith("http://") || direct.startsWith("https://"))
            ? direct
            : this.buildLiveStreamUrl(streamId);
        const icon = stringField(obj, "stream_icon");
        return {
          id: `xtream:${sourceId}:${streamId}`,
          name,
          streamUrl,
          logoUrl: icon?.startsWith("http") ? icon : null,
          groupTitle: group,
          tvgId: stringField(obj, "epg_channel_id"),
          tvgName: name,
          sourceId,
          playbackCmd: null,
          headers: {}
        };
      })
      .filter(Boolean);
  }

  async authenticate() {
    const payload = asObject(await this.getJson(`${this.playerApi}?username=${encodeURIComponent(this.user)}&password=${encodeURIComponent(this.pass)}`));
    const userInfo = asObject(payload?.user_info);
    if (!userInfo) {
      throw new Error("Xtream auth failed: unexpected response.");
    }
    const auth = stringField(userInfo, "auth") || stringField(userInfo, "status") || "";
    const ok = auth === "1" || /^true$/i.test(auth) || /^active$/i.test(auth);
    if (!ok) {
      throw new Error(
        stringField(userInfo, "message") || stringField(userInfo, "status") || "Invalid Xtream credentials."
      );
    }
  }

  async fetchLiveCategories() {
    const element = await this.getJson(
      `${this.playerApi}?username=${encodeURIComponent(this.user)}&password=${encodeURIComponent(this.pass)}&action=get_live_categories`
    );
    const array = asArray(element).length ? asArray(element) : asArray(asObject(element)?.categories);
    const map = {};
    for (const item of array) {
      const obj = asObject(item);
      if (!obj) continue;
      const id = stringField(obj, "category_id");
      const name = stringField(obj, "category_name");
      if (id && name) map[id] = name;
    }
    return map;
  }

  async fetchLiveStreams() {
    const element = await this.getJson(
      `${this.playerApi}?username=${encodeURIComponent(this.user)}&password=${encodeURIComponent(this.pass)}&action=get_live_streams`
    );
    return asArray(element).length ? asArray(element) : asArray(asObject(element)?.streams);
  }

  buildLiveStreamUrl(streamId) {
    return `${this.serverBase}/live/${encodeURIComponent(this.user)}/${encodeURIComponent(this.pass)}/${streamId}.${this.preferredExtension}`;
  }

  /**
   * Week-ish EPG for one live stream via get_simple_data_table (fallback: get_short_epg).
   * @returns {Promise<{ title: string, description: string|null, startMs: number, endMs: number }[]>}
   */
  async fetchStreamEpg(streamId, { windowStartMs, windowEndMs } = {}) {
    const id = String(streamId || "").trim();
    if (!id) return [];
    await this.authenticate();
    let listings = [];
    try {
      const payload = await this.getJson(
        `${this.playerApi}?username=${encodeURIComponent(this.user)}&password=${encodeURIComponent(this.pass)}&action=get_simple_data_table&stream_id=${encodeURIComponent(id)}`
      );
      listings = asArray(asObject(payload)?.epg_listings);
    } catch (_) {
      listings = [];
    }
    if (!listings.length) {
      try {
        const payload = await this.getJson(
          `${this.playerApi}?username=${encodeURIComponent(this.user)}&password=${encodeURIComponent(this.pass)}&action=get_short_epg&stream_id=${encodeURIComponent(id)}&limit=50`
        );
        listings = asArray(asObject(payload)?.epg_listings);
      } catch (_) {
        listings = [];
      }
    }
    const out = [];
    for (const item of listings) {
      const obj = asObject(item);
      if (!obj) continue;
      const startMs =
        parseLooseTime(obj.start_timestamp) ||
        parseLooseTime(obj.start) ||
        parseLooseTime(obj.time);
      const endMs =
        parseLooseTime(obj.stop_timestamp) ||
        parseLooseTime(obj.end) ||
        parseLooseTime(obj.stop) ||
        (Number.isFinite(startMs) && Number(obj.duration)
          ? startMs + Number(obj.duration) * 1000
          : null);
      const title = decodeMaybeBase64(stringField(obj, "title") || stringField(obj, "name") || "");
      const description = decodeMaybeBase64(
        stringField(obj, "description") || stringField(obj, "desc") || ""
      );
      const program = normalizeProgram({
        channelId: id,
        title,
        description: description || null,
        startMs,
        endMs
      });
      if (!program) continue;
      if (Number.isFinite(windowStartMs) && program.endMs < windowStartMs) continue;
      if (Number.isFinite(windowEndMs) && program.startMs > windowEndMs) continue;
      out.push(program);
    }
    out.sort((a, b) => a.startMs - b.startMs);
    return out;
  }

  async getJson(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "NuvioIPTV/1.0",
        Accept: "application/json"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`Xtream request failed (${response.status})`);
    }
    try {
      return await response.json();
    } catch (_) {
      throw new Error("Invalid JSON from Xtream API.");
    }
  }
}
