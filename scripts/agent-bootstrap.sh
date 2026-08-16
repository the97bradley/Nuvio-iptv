#!/usr/bin/env bash
# Agent boot strap for Nuvio IPTV.
# Idempotent: safe to re-run on every cloud-agent / local agent start.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[agent-bootstrap] repo root: $ROOT"

ensure_caveman_skills() {
  if [[ -f "$ROOT/.agents/skills/caveman/SKILL.md" ]]; then
    echo "[agent-bootstrap] caveman skill already present under .agents/skills/"
    return 0
  fi
  echo "[agent-bootstrap] installing JuliusBrussee/caveman skills for Cursor…"
  npx -y skills add JuliusBrussee/caveman -a cursor --yes
}

ensure_caveman_rule() {
  local rule="$ROOT/.cursor/rules/caveman.mdc"
  if [[ -f "$rule" ]]; then
    echo "[agent-bootstrap] always-on rule present: $rule"
    return 0
  fi
  echo "[agent-bootstrap] writing Cursor caveman rule…"
  mkdir -p "$ROOT/.cursor/rules"
  curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/src/tools/caveman-init.js \
    | node - "$ROOT" --force --only cursor
}

ensure_caveman_skills
ensure_caveman_rule

if [[ ! -f "$ROOT/AGENTS.md" ]]; then
  echo "[agent-bootstrap] WARNING: AGENTS.md missing — recreate from git history"
  exit 1
fi

echo "[agent-bootstrap] OK — read AGENTS.md, then use caveman communication mode"
