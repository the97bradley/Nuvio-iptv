#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$ROOT/upstream"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REPOS=(
  "NuvioTV"
  "NuvioDesktop"
  "NuvioWeb"
  "self-host"
  "nuvio-engine"
  "NuvioTVTizenBrew"
  "NuvioTVWebOS"
  "NuvioTizen"
  "NuvioWebTVInstaller"
  "MPVKit"
)

mkdir -p "$UPSTREAM_DIR"

for repo in "${REPOS[@]}"; do
  echo "==> Syncing $repo"
  git clone --depth 1 "https://github.com/NuvioMedia/${repo}.git" "$TMP_DIR/$repo"
  rm -rf "$UPSTREAM_DIR/$repo"
  mkdir -p "$UPSTREAM_DIR/$repo"
  tar -C "$TMP_DIR/$repo" --exclude='.git' -cf - . | tar -C "$UPSTREAM_DIR/$repo" -xf -
  # Drop oversized binaries that GitHub rejects / bloat the fork
  find "$UPSTREAM_DIR/$repo" -type f \( -name 'TorrServer' -o -name 'libtorrserver.so' -o -name 'TorrServer.exe' \) -delete || true
  rm -rf "$UPSTREAM_DIR/$repo/composeApp/src/desktopMain/native/macos/runtime" 2>/dev/null || true
  rm -rf "$UPSTREAM_DIR/$repo/composeApp/src/desktopMain/native/windows/runtime" 2>/dev/null || true
done

cat > "$UPSTREAM_DIR/README.md" << 'EOF'
# Upstream NuvioMedia snapshots

Vendored shallow snapshots of NuvioMedia repositories for hub development.

Refresh with:

```bash
./scripts/sync-upstream.sh
```

TorrServer / libtorrserver binaries are excluded; fetch from the original repos if you need them.
EOF

echo "Done. Upstream synced into $UPSTREAM_DIR"
