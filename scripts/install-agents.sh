#!/usr/bin/env bash
set -euo pipefail
# Run manually in Codespaces; this is not executed by postCreateCommand.
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.local/npm/bin:$PATH"
mkdir -p "$HOME/.local/npm"
npm config set prefix "$HOME/.local/npm"
if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex
fi
if ! command -v omp >/dev/null 2>&1; then
  # Official OMP Linux installer. Review https://omp.sh/install before executing.
  curl -fsSL https://omp.sh/install | sh
fi
grep -q 'TRUST_IDE_CLI_PATH' "$HOME/.bashrc" 2>/dev/null || \
  printf '\n# TRUST_IDE_CLI_PATH\nexport PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.local/npm/bin:$PATH"\n' >> "$HOME/.bashrc"
echo "Install finished. Open a new terminal or run:"
echo 'export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.local/npm/bin:$PATH"'
echo "Next authenticate Codex / OMP individually. Never paste keys into Trust IDE chat."
codex --version || true
omp --version || true
