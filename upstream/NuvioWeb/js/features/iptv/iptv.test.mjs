import test from "node:test";
import assert from "node:assert/strict";
import { parseM3uPlaylist } from "./m3uPlaylistParser.js";
import { normalizeMac, normalizePortalBase } from "./stalkerPortalClient.js";
import { normalizeServerBase } from "./xtreamCodesClient.js";
import {
  channelMatchesProgramQuery,
  formatNowNext,
  normalizeProgram,
  nowPlaying
} from "./iptvEpg.js";
import { extractM3uEpgUrl, parseXmltvProgrammes, parseXmltvTime } from "./xmltvParser.js";

test("parseM3uPlaylist reads EXTINF attributes and url-tvg", () => {
  const { channels, epgUrl } = parseM3uPlaylist(
    `#EXTM3U url-tvg="https://example.com/guide.xml"
#EXTINF:-1 tvg-id="abc" tvg-logo="https://example.com/a.png" group-title="USA",ABC News
https://example.com/abc.m3u8
#EXTINF:-1 group-title="Sports",Stadium
https://example.com/stadium.m3u8
`,
    "src-1"
  );
  assert.equal(epgUrl, "https://example.com/guide.xml");
  assert.equal(channels.length, 2);
  assert.equal(channels[0].name, "ABC News");
  assert.equal(channels[0].tvgId, "abc");
  assert.equal(channels[0].logoUrl, "https://example.com/a.png");
  assert.equal(channels[0].groupTitle, "USA");
  assert.equal(channels[0].sourceId, "src-1");
  assert.equal(channels[1].name, "Stadium");
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

test("XMLTV parse keeps windowed programmes", () => {
  assert.equal(parseXmltvTime("20240101120000 +0000"), Date.UTC(2024, 0, 1, 12, 0, 0));
  assert.equal(extractM3uEpgUrl('#EXTM3U x-tvg-url="https://a/x.xml,https://b/y.xml"'), "https://a/x.xml");
  const xml = `
  <tv>
    <programme start="20240101120000 +0000" stop="20240101130000 +0000" channel="abc">
      <title>Morning News</title>
      <desc>Headlines</desc>
    </programme>
    <programme start="20240101130000 +0000" stop="20240101140000 +0000" channel="abc">
      <title>Talk Show</title>
    </programme>
    <programme start="20240101120000 +0000" stop="20240101130000 +0000" channel="other">
      <title>Skip Me</title>
    </programme>
  </tv>`;
  const programmes = parseXmltvProgrammes(xml, {
    channelIds: new Set(["abc"]),
    windowStartMs: Date.UTC(2024, 0, 1, 12, 0, 0),
    windowEndMs: Date.UTC(2024, 0, 1, 13, 30, 0)
  });
  assert.equal(programmes.length, 2);
  assert.equal(programmes[0].title, "Morning News");
  const now = Date.UTC(2024, 0, 1, 12, 30, 0);
  assert.equal(nowPlaying(programmes, now).title, "Morning News");
  assert.equal(formatNowNext(programmes, now).next.title, "Talk Show");
  assert.equal(channelMatchesProgramQuery(programmes, "talk"), true);
  assert.equal(channelMatchesProgramQuery(programmes, "weather"), false);
  assert.ok(normalizeProgram({ title: "X", startMs: 1, endMs: 2, channelId: "c" }));
});
