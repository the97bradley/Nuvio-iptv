# Nuvio IPTV

Fork of [NuvioMedia](https://github.com/NuvioMedia) that keeps the full Nuvio media hub and adds a dedicated **Live** IPTV section.

## Scope

- **Working surfaces:** Android (Compose Multiplatform) + browser/TV web (`upstream/NuvioWeb`)
- **Mirrored upstream snapshots:** `upstream/` (TV, Desktop, Web, self-host, engine, wrappers)
- **iOS / Desktop IPTV work:** deferred

## Android Live tab

- New root tab: **Live**
- Add remote **M3U / M3U8** playlists
- Add **Stalker / Ministra** portals (portal URL + MAC)
- Add **Xtream Codes** logins (server URL + username + password)
- Group + search channels
- Play through the existing Nuvio player (HLS / TS / etc.)

## Web Live tab (`upstream/NuvioWeb`)

Live tab browses channels. Playlists are managed under **Settings → IPTV** (M3U / Stalker / Xtream).

```bash
cd upstream/NuvioWeb
npm install
npm run build
npm run serve
```

Note: some remote playlists or portal APIs may fail in a normal browser because of **CORS**. Android and packaged TV builds are less affected.

## Layout

| Path | Role |
|------|------|
| `androidApp/` | Android application entry |
| `composeApp/` | Shared KMP app (Android focus for IPTV) |
| `iosApp/` | Upstream iOS project (unchanged for now) |
| `upstream/` | Snapshots of other NuvioMedia repos |
| `scripts/sync-upstream.sh` | Re-fetch upstream snapshots |

## Build (Android)

```bash
./gradlew :androidApp:assembleFullDebug
```

Installs as `com.nuvio.iptv` so it can sit beside stock Nuvio.

## Upstream

Official sources:

- https://github.com/NuvioMedia/NuvioMobile
- https://github.com/NuvioMedia/NuvioTV
- https://github.com/NuvioMedia/NuvioDesktop
- https://github.com/NuvioMedia/NuvioWeb
- https://github.com/NuvioMedia/self-host
- https://github.com/NuvioMedia/nuvio-engine

Re-sync snapshots:

```bash
./scripts/sync-upstream.sh
```

Large TorrServer / native binaries are intentionally omitted from git; pull them from the original repos when needed.

## License

GPL-3.0 (same as upstream Nuvio).

## Agents

See **[AGENTS.md](./AGENTS.md)** for living project context. On session start run `./scripts/agent-bootstrap.sh` (installs / verifies the [Caveman](https://github.com/JuliusBrussee/caveman) skill).
