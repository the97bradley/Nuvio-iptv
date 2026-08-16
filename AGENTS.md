# Agent context — Nuvio IPTV

Living brief for Cursor / cloud agents working in this repo. Read this first. Keep it updated when product direction or architecture changes.

## Boot (do this first)

Future agents **must** ensure Caveman is installed before other work:

```bash
# From repo root — idempotent
./scripts/agent-bootstrap.sh
```

Or manually:

```bash
npx -y skills add JuliusBrussee/caveman -a cursor --yes
node -e "require('fs').accessSync('.cursor/rules/caveman.mdc')" 2>/dev/null || \
  curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/src/tools/caveman-init.js | node - "$PWD" --force --only cursor
```

Skills live in `.agents/skills/` (committed). Always-on Cursor rule: `.cursor/rules/caveman.mdc`.

Default communication: **caveman full** (terse, keep technical substance). Code / commits / PR bodies stay normal English. Stop with `stop caveman` / `normal mode` if the user asks.

## What this repo is

- **GitHub:** https://github.com/the97bradley/Nuvio-iptv
- **Product:** Fork of [NuvioMedia](https://github.com/NuvioMedia) with a dedicated **Live IPTV** surface
- **App id:** `com.nuvio.iptv` (debug `com.nuvio.iptv.debug`), label **Nuvio IPTV**
- **Primary surfaces:** Android (Compose Multiplatform) + browser/TV web (`upstream/NuvioWeb`)
- **Deferred:** iOS / Desktop IPTV ports
- **License:** GPL-3.0

Nuvio is a Stremio-style client: catalogs need stream addons to play. Live IPTV is separate (direct M3U / portal / Xtream), not Stremio streams.

## Layout

| Path | Role |
|------|------|
| `androidApp/` | Android application entry |
| `composeApp/` | Shared KMP app (Android focus for IPTV) |
| `iosApp/` | Upstream iOS (mostly untouched) |
| `upstream/` | Snapshots of other NuvioMedia repos (Web, TV, Desktop, …) |
| `upstream/NuvioWeb/` | Web / Tizen / webOS app — Live IPTV port lives here |
| `scripts/sync-upstream.sh` | Re-fetch upstream snapshots |
| `scripts/agent-bootstrap.sh` | Agent boot: install Caveman + verify rules |
| `.agents/skills/` | Repo-local agent skills (incl. Caveman) |
| `.cursor/rules/` | Always-on Cursor rules |

## Live IPTV (current feature set)

Supported source kinds: **M3U**, **Stalker / Ministra** (portal URL + MAC), **Xtream Codes** (server + user + pass).

No built-in channel packs. Users add their own playlists.

### Android (KMP)

Package: `composeApp/src/commonMain/kotlin/com/nuvio/app/features/iptv/`

| File | Role |
|------|------|
| `IptvModels.kt` | Models / UI state |
| `M3uPlaylistParser.kt` | M3U parse |
| `StalkerPortalClient.kt` | Handshake, genres, channels, `create_link` |
| `XtreamCodesClient.kt` | `player_api` live cats/streams |
| `IptvRepository.kt` | Orchestration |
| `IptvStorage.kt` + android/ios actuals | Persist sources JSON |
| `LiveTvScreen.kt` | Live UI (add sources in-app for now) |

Wire-in: Live tab in `App.kt` / native tab bridge; `IptvPlaylistStorage.initialize` in `MainActivity`.

Build:

```bash
./gradlew :composeApp:compileAndroidMain
./gradlew :composeApp:testAndroidHostTest --tests 'com.nuvio.app.features.iptv.*'
./gradlew :androidApp:assembleFullDebug
```

Android SDK in cloud VMs is often at `/opt/android-sdk`; `local.properties` is gitignored.

### Web (`upstream/NuvioWeb`)

| Path | Role |
|------|------|
| `js/features/iptv/` | Parser, Stalker, Xtream, store, repository, add dialog |
| `js/ui/screens/live/liveScreen.js` | Live channel browser |
| Settings → **IPTV** | Add / manage M3U, Stalker, Xtream playlists |
| Sidebar | `gotoLive` between Library and Settings |

Play: `Router.navigate("player", { streamUrl, playerTitle, itemId, itemType: "movie" })`.

```bash
cd upstream/NuvioWeb
npm install && npm run build && npm run serve   # http://localhost:4173
node --test js/features/iptv/iptv.test.mjs
```

**CORS:** many remote M3U / portal / stream URLs fail in desktop browsers; Android and packaged TV builds are less affected.

## Git / agent workflow

- Preferred user preference: **push to `main`** (fast-forward merge after feature work).
- Cloud agents still use branches `cursor/<descriptive-name>-fe7b` and register PRs via ManagePullRequest.
- Recent tips on `main`: Live IPTV Android + web; playlists via Settings→IPTV on web; no built-in channel packs.

## Explicit non-goals / guardrails

- Do **not** recommend or wire piracy stream addons. Point users to legal / community discovery (e.g. stremio-addons.net) for Stremio-style catalogs.
- Prefer public / FAST-style streams for built-in USA list; avoid implying unauthorized cable feeds.
- Large TorrServer / native binaries are omitted from git; pull from upstream when needed.

## Caveman (always on)

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
