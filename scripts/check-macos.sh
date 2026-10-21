#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Run this script on macOS.' >&2
  exit 1
fi
for tool in node npm python3 cargo; do
  command -v "$tool" >/dev/null || { echo "Missing $tool; see docs/MACOS-VALIDATION.md." >&2; exit 1; }
done
npm ci --ignore-scripts
python3 scripts/package_bridge.py --check
cargo fmt --all -- --check
cargo build --release --locked --target wasm32-wasip2
node scripts/check-runtime.cjs "$@"
