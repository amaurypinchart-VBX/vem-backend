#!/bin/bash
# Prépare une session Claude Code dans le cloud : dépendances du backend et de
# Plans Viewbox, client Prisma, Chromium pour les tests e2e. Idempotent.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm réécrit parfois les package-lock.json (métadonnées de sa version) : on les
# remet comme ils étaient s'ils étaient propres avant, pour ne rien committer par erreur.
clean_locks=()
for lock in package-lock.json plans/package-lock.json; do
  if git diff --quiet -- "$lock" 2>/dev/null; then clean_locks+=("$lock"); fi
done

# Backend (postinstall = prisma generate)
npm install --no-audit --no-fund --loglevel=error

# Sous-application Plans Viewbox (Vitest, tsc, Vite)
(cd plans && npm install --no-audit --no-fund --loglevel=error)

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  # Sans locale UTF-8, Ruby lit les noms de fichiers accentués en US-ASCII
  # (test_core.rb › test_zip_is_readable échoue)
  echo 'export LANG=C.UTF-8' >> "$CLAUDE_ENV_FILE"
fi

if [ ${#clean_locks[@]} -gt 0 ]; then
  git checkout -- "${clean_locks[@]}" 2>/dev/null || true
fi

# Chromium préinstallé pour les scripts plans/e2e/*.mjs (ils lisent $CHROMIUM)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  shell=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-*/chrome-headless-shell 2>/dev/null | sort -V | tail -n 1 || true)
  if [ -z "$shell" ]; then
    shell=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-*/headless_shell 2>/dev/null | sort -V | tail -n 1 || true)
  fi
  if [ -n "$shell" ]; then
    echo "export CHROMIUM=\"$shell\"" >> "$CLAUDE_ENV_FILE"
  fi
fi
