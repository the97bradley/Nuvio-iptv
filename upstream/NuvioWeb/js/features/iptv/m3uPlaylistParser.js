/**
 * Minimal M3U / M3U8 playlist parser for IPTV live channels.
 * Supports #EXTINF attributes (tvg-id, tvg-name, tvg-logo, group-title).
 */

const ATTRIBUTE_REGEX = /([\w-]+)="([^"]*)"/g;

export function parseM3uPlaylist(content, sourceId) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const channels = [];
  let pendingName = null;
  let pendingLogo = null;
  let pendingGroup = null;
  let pendingTvgId = null;
  let pendingTvgName = null;
  let index = 0;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      const attrs = {};
      ATTRIBUTE_REGEX.lastIndex = 0;
      let match;
      while ((match = ATTRIBUTE_REGEX.exec(line)) !== null) {
        attrs[match[1].toLowerCase()] = match[2];
      }
      pendingLogo = attrs["tvg-logo"]?.trim() || null;
      pendingGroup = attrs["group-title"]?.trim() || null;
      pendingTvgId = attrs["tvg-id"]?.trim() || null;
      pendingTvgName = attrs["tvg-name"]?.trim() || null;
      const afterComma = line.includes(",") ? line.slice(line.lastIndexOf(",") + 1).trim() : "";
      pendingName = afterComma || pendingTvgName || `Channel ${index + 1}`;
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const name = pendingName || `Channel ${index + 1}`;
    const idSeed = pendingTvgId || `${sourceId}:${index}:${name}`;
    channels.push({
      id: idSeed,
      name,
      streamUrl: line,
      logoUrl: pendingLogo,
      groupTitle: pendingGroup,
      tvgId: pendingTvgId,
      tvgName: pendingTvgName,
      sourceId,
      playbackCmd: null,
      headers: {}
    });
    index += 1;
    pendingName = null;
    pendingLogo = null;
    pendingGroup = null;
    pendingTvgId = null;
    pendingTvgName = null;
  }

  return channels;
}
