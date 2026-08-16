import test from "node:test";
import assert from "node:assert/strict";
import { parseM3uPlaylist } from "./m3uPlaylistParser.js";
import { BuiltinUsaChannels } from "./builtinUsaChannels.js";
import { normalizeMac, normalizePortalBase } from "./stalkerPortalClient.js";
import { normalizeServerBase } from "./xtreamCodesClient.js";

test("parseM3uPlaylist reads EXTINF attributes", () => {
  const channels = parseM3uPlaylist(
    `#EXTM3U
#EXTINF:-1 tvg-id="abc" tvg-logo="https://example.com/a.png" group-title="USA",ABC News
https://example.com/abc.m3u8
#EXTINF:-1 group-title="Sports",Stadium
https://example.com/stadium.m3u8
`,
    "src-1"
  );
  assert.equal(channels.length, 2);
  assert.equal(channels[0].name, "ABC News");
  assert.equal(channels[0].tvgId, "abc");
  assert.equal(channels[0].logoUrl, "https://example.com/a.png");
  assert.equal(channels[0].groupTitle, "USA");
  assert.equal(channels[0].sourceId, "src-1");
  assert.equal(channels[1].name, "Stadium");
});

test("BuiltinUsaChannels merges first and cannot collide", () => {
  const merged = BuiltinUsaChannels.mergeInto([
    { id: "m3u-1", name: "Mine", kind: "M3U", url: "https://example.com/a.m3u" },
    BuiltinUsaChannels.source(99)
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, BuiltinUsaChannels.SourceId);
  assert.equal(merged[0].lastRefreshedAtEpochMs, 99);
  assert.equal(merged[1].id, "m3u-1");
});

test("BuiltinUsaChannels embeds a substantial USA playlist", () => {
  const channels = BuiltinUsaChannels.loadEmbeddedChannels();
  assert.ok(channels.length >= 50, `expected >=50 channels, got ${channels.length}`);
  assert.ok(channels.every((channel) => channel.sourceId === BuiltinUsaChannels.SourceId));
  assert.ok(channels.some((channel) => /news/i.test(channel.name)));
});

test("normalize helpers", () => {
  assert.equal(normalizeMac("00-1a-79-12-34-56"), "00:1A:79:12:34:56");
  assert.equal(
    normalizePortalBase("http://example.com/stalker_portal/c/"),
    "http://example.com"
  );
  assert.equal(
    normalizeServerBase("https://xtream.example/player_api.php?username=a"),
    "https://xtream.example"
  );
});
