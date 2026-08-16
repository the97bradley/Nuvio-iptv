const MAG_USER_AGENT =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3";

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

export function normalizeMac(raw) {
  const hex = String(raw || "")
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");
  if (hex.length !== 12) {
    throw new Error("MAC must be 12 hex digits (e.g. 00:1A:79:12:34:56).");
  }
  return hex.match(/.{1,2}/g).join(":");
}

export function normalizePortalBase(raw) {
  let url = String(raw || "").trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Portal URL must start with http:// or https://");
  }
  url = url.replace(/\/+$/, "");
  const suffixes = [
    "/stalker_portal/c",
    "/stalker_portal/server/load.php",
    "/stalker_portal",
    "/c/server/load.php",
    "/server/load.php",
    "/portal.php",
    "/c",
    "/server"
  ];
  for (const suffix of suffixes) {
    if (url.toLowerCase().endsWith(suffix.toLowerCase())) {
      url = url.slice(0, -suffix.length).replace(/\/+$/, "");
      break;
    }
  }
  return url;
}

export class StalkerPortalClient {
  constructor(portalUrl, macAddress) {
    this.mac = normalizeMac(macAddress);
    this.portalBase = normalizePortalBase(portalUrl);
    this.entryPointType = -1;
    this.token = "";
  }

  async loadChannels(sourceId) {
    await this.ensureAuthenticated();
    const genres = Object.fromEntries(
      (await this.fetchGenres()).map((genre) => [genre.id, genre.name])
    );
    const payload = await this.apiGet("itv", "get_all_channels", "", true);
    const data = asArray(payload?.data);
    return data
      .map((item) => {
        const obj = asObject(item);
        if (!obj) return null;
        const id = stringField(obj, "id");
        const name = stringField(obj, "name");
        if (!id || !name) return null;
        const cmd = stringField(obj, "cmd") || "";
        const genreId = stringField(obj, "tv_genre_id");
        const group = genreId ? genres[genreId] || null : null;
        const logo = stringField(obj, "logo");
        return {
          id: `stalker:${sourceId}:${id}`,
          name,
          streamUrl: "",
          logoUrl: logo?.startsWith("http") ? logo : null,
          groupTitle: group,
          tvgId: stringField(obj, "xmltv_id"),
          tvgName: name,
          sourceId,
          playbackCmd: cmd || null,
          headers: {}
        };
      })
      .filter(Boolean);
  }

  async createPlaybackUrl(cmd) {
    await this.ensureAuthenticated();
    const cleanedCmd = String(cmd || "")
      .replace(/ffmpeg /gi, "")
      .replace(/ffrt /gi, "")
      .trim();
    if (
      (cleanedCmd.startsWith("http://") || cleanedCmd.startsWith("https://")) &&
      !/localhost/i.test(cleanedCmd)
    ) {
      return cleanedCmd;
    }

    const requestLink = async () => {
      const encodedCmd = encodeURIComponent(cmd);
      const payload = await this.apiGet(
        "itv",
        "create_link",
        `cmd=${encodedCmd}&series=&forced_storage=undefined&disable_ad=0&download=0`,
        false
      );
      return String(payload?.cmd || "")
        .replace(/ffmpeg /gi, "")
        .replace(/ffrt /gi, "")
        .trim();
    };

    let link = await requestLink();
    if (!link) {
      this.token = "";
      await this.ensureAuthenticated();
      link = await requestLink();
    }
    if (!link) {
      throw new Error("Portal did not return a playable link for this channel.");
    }
    return link;
  }

  async ensureAuthenticated() {
    if (this.token) return;
    await this.handshake();
    await this.getProfile();
  }

  async handshake() {
    let lastError = null;
    for (const candidate of [0, 1, 2, 3]) {
      this.entryPointType = candidate;
      try {
        const payload = await this.apiGet("stb", "handshake", "", false, false);
        const nextToken = stringField(payload, "token") || "";
        if (nextToken) {
          this.token = nextToken;
          return;
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`Stalker handshake failed for ${this.portalBase}`);
  }

  async getProfile() {
    try {
      await this.apiGet(
        "stb",
        "get_profile",
        [
          "hd=1&ver=ImageDescription:%200.2.18-250;%20ImageDate:%20Fri%20Jan%201%2012:00:00%20UTC%202021;",
          "&num_banks=2&sn=&stb_type=MAG250&image_version=218&video_out=hdmi",
          "&device_id=&device_id2=&signature=&auth_second_step=0&hw_version=1.7-BD-00&not_valid_token=0",
          "&client_type=STB&hw_version_2=1.7-BD-00&metrics="
        ].join(""),
        true
      );
    } catch (_) {
      // Some portals skip get_profile.
    }
  }

  async fetchGenres() {
    const payload = await this.apiGet("itv", "get_genres", "", true);
    let elements = asArray(payload?.data);
    if (!elements.length) {
      const raw = await this.apiGetRaw("itv", "get_genres", "", true, true);
      elements = Array.isArray(raw) ? raw : asArray(asObject(raw)?.data);
    }
    return elements
      .map((item) => {
        const obj = asObject(item);
        if (!obj) return null;
        const id = stringField(obj, "id") || stringField(obj, "genre_id");
        const name = stringField(obj, "title") || stringField(obj, "name");
        if (!id || !name) return null;
        return { id, name };
      })
      .filter(Boolean);
  }

  async apiGet(type, action, extraQuery = "", includeTokenCookie = true, requireAuth = true) {
    const element = await this.apiGetRaw(type, action, extraQuery, includeTokenCookie, requireAuth);
    const obj = asObject(element);
    if (!obj) {
      throw new Error(`Unexpected Stalker response for ${action}`);
    }
    return obj;
  }

  async apiGetRaw(type, action, extraQuery, includeTokenCookie, requireAuth) {
    if (requireAuth && !this.token) {
      throw new Error("Missing Stalker token");
    }
    const endpoint = this.portalEndpoint();
    const query = [
      `type=${type}`,
      `action=${action}`,
      extraQuery ? String(extraQuery).replace(/^&/, "") : "",
      "JsHttpRequest=1-xml"
    ]
      .filter(Boolean)
      .join("&");
    const response = await fetch(`${endpoint}?${query}`, {
      method: "GET",
      headers: this.buildHeaders(includeTokenCookie, requireAuth),
      redirect: "follow"
    });
    if (response.status === 404) {
      throw new Error(`Portal endpoint not found (404) at ${endpoint}`);
    }
    if (!response.ok) {
      throw new Error(`Stalker request failed (${response.status}) for action=${action}`);
    }
    const body = await response.json();
    if (body && typeof body === "object" && "js" in body) {
      return body.js;
    }
    return body;
  }

  portalEndpoint() {
    const base = this.portalBase.replace(/\/+$/, "");
    switch (this.entryPointType) {
      case 1:
        return `${base}/portal.php`;
      case 2:
        return `${base}/c/server/load.php`;
      case 3:
        return `${base}/stalker_portal/server/load.php`;
      default:
        return `${base}/server/load.php`;
    }
  }

  buildHeaders(includeTokenCookie, requireAuth) {
    let cookie = `mac=${this.mac}; stb_lang=en; timezone=Europe/London`;
    if (includeTokenCookie && this.token) {
      cookie += `; token=${this.token}`;
    }
    const headers = {
      "User-Agent": MAG_USER_AGENT,
      "X-User-Agent": "Model: MAG250; Link: WiFi",
      Cookie: cookie,
      Referer: `${this.portalBase.replace(/\/+$/, "")}/c/index.html`,
      Pragma: "no-cache",
      Connection: "Close"
    };
    if (requireAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }
}
