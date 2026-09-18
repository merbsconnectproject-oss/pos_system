#!/usr/bin/env bash
# Compatibility entry point. The maintained Ubuntu package lives in linux/.
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/linux/build-deb.sh" "$@"
