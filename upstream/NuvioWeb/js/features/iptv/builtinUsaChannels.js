import { USA_PUBLIC_M3U } from "./usaPublicPlaylistData.js";
import { parseM3uPlaylist } from "./m3uPlaylistParser.js";

export const BuiltinUsaChannels = {
  SourceId: "builtin-usa-public",
  SourceName: "USA Public",
  RefreshUrl: "https://iptv-org.github.io/iptv/countries/us.m3u",

  source(lastRefreshedAtEpochMs = null) {
    return {
      id: this.SourceId,
      name: this.SourceName,
      kind: "M3U",
      url: this.RefreshUrl,
      username: null,
      password: null,
      macAddress: null,
      epgUrl: null,
      lastRefreshedAtEpochMs
    };
  },

  isBuiltin(sourceOrId) {
    const id = typeof sourceOrId === "string" ? sourceOrId : sourceOrId?.id;
    return id === this.SourceId;
  },

  mergeInto(sources = []) {
    const rest = (sources || []).filter((source) => !this.isBuiltin(source));
    const existing = (sources || []).find((source) => this.isBuiltin(source));
    return [this.source(existing?.lastRefreshedAtEpochMs ?? null), ...rest];
  },

  loadEmbeddedChannels() {
    return parseM3uPlaylist(USA_PUBLIC_M3U, this.SourceId);
  },

  isCommonUsaChannel(channel) {
    const name = String(channel?.name || "").toLowerCase();
    const group = String(channel?.groupTitle || "").toLowerCase();
    const url = String(channel?.streamUrl || "").toLowerCase();
    if (url.includes("youtube.com") || url.includes("youtu.be")) return false;
    if (["xxx", "adult", "porn", "playboy"].some((token) => name.includes(token) || group.includes(token))) {
      return false;
    }
    const keywords = [
      "news",
      "weather",
      "cnn",
      "fox",
      "nbc",
      "abc",
      "cbs",
      "msnbc",
      "cnbc",
      "bloomberg",
      "pbs",
      "npr",
      "nasa",
      "c-span",
      "cspan",
      "buzzr",
      "stadium",
      "retro",
      "pluto",
      "roku",
      "free",
      "local",
      "charge",
      "comet",
      "gettv",
      "antenna",
      "me-tv",
      "metv",
      "story",
      "heartland",
      "rev'n",
      "revn",
      "biz",
      "thecw",
      "the cw"
    ];
    return (
      keywords.some((token) => name.includes(token) || group.includes(token)) ||
      group === "usa" ||
      group.includes("united states")
    );
  }
};
